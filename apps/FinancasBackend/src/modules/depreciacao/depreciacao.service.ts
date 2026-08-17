import type { FastifyInstance } from 'fastify';
import type {
  ResumoDepreciacaoQuery,
  ResumoDepreciacaoResponse,
  SerieDepreciacaoQuery,
  SerieDepreciacaoResponse,
  SyncDepreciacaoResponse,
  DespesaClasse,
  BaseClasse,
  DetalheClasseQuery,
  DetalheClasseResponse,
  DepreciacaoConta,
  FrotaComposicaoResponse,
  FrotaTipo,
  FrotaGaragem,
} from '@pioneira/shared';
import { DepreciacaoMensal } from '@/entities/depreciacao-mensal.entity.js';
import { FrotaComposicao } from '@/entities/frota-composicao.entity.js';
import { buildGlobusDepreciacaoAdapter } from '@/integrations/globus/globus-depreciacao.adapter.js';
import { buildDepreciacaoEtl } from '@/etl/depreciacao.etl.js';
import { GLOBUS_QUERIES } from '@/integrations/globus/globus.queries.js';

/** Nome amigável da garagem (FRT_CADVEICULOS.CODIGOGA). */
const GARAGEM_NOME: Record<number, string> = {
  4: 'Matriz',
  31: 'Paranoá/Itapoã',
  124: 'Santa Maria',
  239: 'São Sebastião',
  240: 'Gama',
};
const garagemNomeDe = (cod: number): string => GARAGEM_NOME[cod] ?? `Garagem ${cod}`;
/** Ônibus x veículo de apoio/auxiliar, pela descrição do tipo. */
const ehOnibusDe = (tipo: string): boolean => !/APOIO|AUXILIAR/i.test(tipo);

/** Rótulos amigáveis por classe (mesma taxonomia do ETL). */
const CLASSE_LABEL: Record<string, string> = {
  frota_operacional: 'Frota operacional',
  caminhoes: 'Frota auxiliar (caminhões)',
  veiculos_auxiliares: 'Veículos auxiliares',
  computadores: 'Computadores e periféricos',
  instalacoes: 'Instalações',
  maquinas_oficina: 'Máquinas e equip. da oficina',
  maquinas_escritorio: 'Máquinas e equip. de escritório',
  moveis: 'Móveis e utensílios',
  imoveis: 'Imóveis',
  outros: 'Outros',
};
const labelDe = (classe: string): string => CLASSE_LABEL[classe] ?? classe;

/** Ordem de exibição (frota primeiro). */
const ORDEM_CLASSE: Record<string, number> = {
  frota_operacional: 0,
  caminhoes: 1,
  veiculos_auxiliares: 2,
  instalacoes: 3,
  maquinas_oficina: 4,
  maquinas_escritorio: 5,
  computadores: 6,
  moveis: 7,
  imoveis: 8,
  outros: 9,
};
const ordemDe = (classe: string): number => ORDEM_CLASSE[classe] ?? 99;

/** 'AAAA-MM-01' -> 'MM/AAAA'. */
function competenciaLabel(competencia: string): string {
  const [ano, mes] = competencia.split('-');
  return `${mes}/${ano}`;
}

/** Normaliza 'AAAA-MM' ou 'AAAA-MM-DD' -> 'AAAA-MM-01'; retorna null se inválido. */
function normalizarCompetencia(v?: string): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})/.exec(v);
  if (!m) return null;
  return `${m[1]}-${m[2]}-01`;
}

export function buildDepreciacaoService(fastify: FastifyInstance) {
  const repo = fastify.db.getRepository(DepreciacaoMensal);
  const frotaRepo = fastify.db.getRepository(FrotaComposicao);
  const adapter = buildGlobusDepreciacaoAdapter(fastify);
  const etl = buildDepreciacaoEtl(fastify);

  /**
   * Refresca finance.frota_composicao com a contagem viva do FRT_CADVEICULOS
   * (Globus). Agregado pequeno — troca por inteiro (delete + insert). Não-fatal.
   */
  async function refrescarFrota(empresa: number): Promise<number> {
    if (!fastify.oracle?.isAvailable?.()) return 0;
    const result = await fastify.oracle.execute<{ GARAGEM_CODIGO: number; TIPO_FROTA: string; QTD: number }>(
      GLOBUS_QUERIES.frotaComposicao,
      { empresa },
      { queryName: 'frotaComposicao' },
    );
    const registros = (result.rows ?? []).map((l) =>
      frotaRepo.create({
        empresaId: empresa,
        garagemCodigo: Number(l.GARAGEM_CODIGO),
        garagemNome: garagemNomeDe(Number(l.GARAGEM_CODIGO)),
        tipoFrota: l.TIPO_FROTA,
        ehOnibus: ehOnibusDe(l.TIPO_FROTA),
        qtd: Number(l.QTD),
      }),
    );
    await frotaRepo.manager.transaction(async (m) => {
      await m.delete(FrotaComposicao, { empresaId: empresa });
      if (registros.length > 0) await m.save(registros);
    });
    return registros.length;
  }

  /**
   * Competências que têm despesa lançada de VERDADE (soma <> 0), mais recente
   * primeiro. Filtra os meses ainda não escriturados (que o sync traz com 0).
   */
  async function mesesComLancamento(): Promise<string[]> {
    const rows = await repo.query<Array<{ competencia: string }>>(
      `SELECT competencia::text AS competencia
         FROM finance.depreciacao_mensal
        WHERE grupo = 'despesa' AND excluido_em IS NULL
        GROUP BY competencia
       HAVING COALESCE(SUM(valor_cents), 0) <> 0
        ORDER BY competencia DESC
        LIMIT 36`,
    );
    return rows.map((r) => r.competencia);
  }

  return {
    /**
     * Resumo da competência: despesa do mês por classe + base patrimonial
     * acumulada (bruto/direito de uso/acumulada/líquido) até a competência.
     */
    async resumo(query: ResumoDepreciacaoQuery): Promise<ResumoDepreciacaoResponse> {
      // Competências que têm despesa lançada de VERDADE (a mais recente vira
      // default). Filtra as competências com soma ZERO — o sync traz linhas dos
      // meses ainda não escriturados (ex.: mês corrente) com valor 0, e abrir
      // nelas mostrava "Despesa do mês R$ 0,00" sem explicação.
      const mesesDisponiveis = await mesesComLancamento();

      if (mesesDisponiveis.length === 0) {
        return {
          competencia: null,
          competenciaLabel: null,
          despesaMesCents: 0,
          despesaPorClasse: [],
          base: { brutoCents: 0, direitoUsoCents: 0, acumuladaCents: 0, liquidoCents: 0 },
          basePorClasse: [],
          mesesDisponiveis: [],
          atualizadoEm: null,
          mensagem: 'Nenhum dado de depreciação sincronizado ainda. Rode "Sincronizar" para importar do Globus.',
        };
      }

      const pedida = normalizarCompetencia(query.competencia);
      const competencia = pedida && mesesDisponiveis.includes(pedida) ? pedida : mesesDisponiveis[0]!;

      // Despesa do mês por classe.
      const despesaRows = await repo.query<Array<{ classe: string; total: string }>>(
        `SELECT classe, COALESCE(SUM(valor_cents), 0)::text AS total
           FROM finance.depreciacao_mensal
          WHERE grupo = 'despesa' AND competencia = $1::date AND excluido_em IS NULL
          GROUP BY classe`,
        [competencia],
      );
      const despesaPorClasse: DespesaClasse[] = despesaRows
        .map((r) => ({ classe: r.classe, label: labelDe(r.classe), valorCents: Number(r.total) }))
        .filter((d) => d.valorCents !== 0)
        .sort((a, b) => ordemDe(a.classe) - ordemDe(b.classe));
      const despesaMesCents = despesaPorClasse.reduce((s, d) => s + d.valorCents, 0);

      // Base patrimonial: saldo acumulado (soma histórica) até a competência,
      // por classe e grupo. valor_cents já vem com sinal do grupo.
      const baseRows = await repo.query<Array<{ classe: string; grupo: string; total: string }>>(
        `SELECT classe, grupo, COALESCE(SUM(valor_cents), 0)::text AS total
           FROM finance.depreciacao_mensal
          WHERE grupo IN ('imobilizado_bruto', 'direito_uso', 'deprec_acumulada')
            AND competencia <= $1::date AND excluido_em IS NULL
          GROUP BY classe, grupo`,
        [competencia],
      );

      const porClasse = new Map<string, { bruto: number; direitoUso: number; acumulada: number }>();
      for (const r of baseRows) {
        const v = Number(r.total);
        const acc = porClasse.get(r.classe) ?? { bruto: 0, direitoUso: 0, acumulada: 0 };
        if (r.grupo === 'imobilizado_bruto') acc.bruto += v;
        else if (r.grupo === 'direito_uso') acc.direitoUso += v;
        else if (r.grupo === 'deprec_acumulada') acc.acumulada += v;
        porClasse.set(r.classe, acc);
      }

      const basePorClasse: BaseClasse[] = [...porClasse.entries()]
        .map(([classe, v]) => {
          const brutoTotal = v.bruto + v.direitoUso;
          return {
            classe,
            label: labelDe(classe),
            brutoCents: brutoTotal,
            acumuladaCents: v.acumulada,
            liquidoCents: brutoTotal - v.acumulada,
          };
        })
        .filter((b) => b.brutoCents !== 0 || b.acumuladaCents !== 0)
        .sort((a, b) => ordemDe(a.classe) - ordemDe(b.classe));

      const brutoCents = [...porClasse.values()].reduce((s, v) => s + v.bruto, 0);
      const direitoUsoCents = [...porClasse.values()].reduce((s, v) => s + v.direitoUso, 0);
      const acumuladaCents = [...porClasse.values()].reduce((s, v) => s + v.acumulada, 0);

      const atualizadoRow = await repo.query<Array<{ ultimo: string | null }>>(
        `SELECT MAX(ultimo_sync_em)::text AS ultimo FROM finance.depreciacao_mensal WHERE excluido_em IS NULL`,
      );

      return {
        competencia,
        competenciaLabel: competenciaLabel(competencia),
        despesaMesCents,
        despesaPorClasse,
        base: {
          brutoCents,
          direitoUsoCents,
          acumuladaCents,
          liquidoCents: brutoCents + direitoUsoCents - acumuladaCents,
        },
        basePorClasse,
        mesesDisponiveis,
        atualizadoEm: atualizadoRow[0]?.ultimo ?? null,
      };
    },

    /** Série mensal da despesa de depreciação (últimos N meses, ordem cronológica). */
    async serie(query: SerieDepreciacaoQuery): Promise<SerieDepreciacaoResponse> {
      const meses = query.meses ?? 24;
      const rows = await repo.query<Array<{ competencia: string; total: string }>>(
        `SELECT competencia::text AS competencia, COALESCE(SUM(valor_cents), 0)::text AS total
           FROM finance.depreciacao_mensal
          WHERE grupo = 'despesa' AND excluido_em IS NULL
          GROUP BY competencia
          ORDER BY competencia DESC
          LIMIT $1`,
        [meses],
      );
      const serie = rows
        .map((r) => ({
          competencia: r.competencia,
          competenciaLabel: competenciaLabel(r.competencia),
          valorCents: Number(r.total),
        }))
        .reverse();
      const totalCents = serie.reduce((s, p) => s + p.valorCents, 0);
      return { serie, totalCents };
    },

    /**
     * Detalhe de proveniência de uma classe: as contas contábeis do razão que
     * compõem a despesa do mês e a base acumulada, com débito/crédito de cada.
     */
    async detalheClasse(query: DetalheClasseQuery): Promise<DetalheClasseResponse> {
      const classe = query.classe;
      const label = labelDe(classe);

      const mesesDisponiveis = await mesesComLancamento();
      if (mesesDisponiveis.length === 0) {
        return {
          classe,
          label,
          competencia: null,
          competenciaLabel: null,
          despesaContas: [],
          despesaTotalCents: 0,
          baseContas: [],
          brutoCents: 0,
          direitoUsoCents: 0,
          acumuladaCents: 0,
          liquidoCents: 0,
        };
      }

      const pedida = normalizarCompetencia(query.competencia);
      const competencia = pedida && mesesDisponiveis.includes(pedida) ? pedida : mesesDisponiveis[0]!;

      type ContaRow = {
        classificador: string;
        nome_conta: string | null;
        cod_conta_ctb: number;
        grupo: string;
        debito: string;
        credito: string;
        valor: string;
      };
      const mapConta = (r: ContaRow): DepreciacaoConta => ({
        classificador: r.classificador,
        nomeConta: r.nome_conta,
        codContaCtb: Number(r.cod_conta_ctb),
        grupo: r.grupo,
        debitoCents: Number(r.debito),
        creditoCents: Number(r.credito),
        valorCents: Number(r.valor),
      });

      // Despesa do mês: contas 3.1.02.07.* desta classe nesta competência.
      const despRows = await repo.query<ContaRow[]>(
        `SELECT classificador, nome_conta, cod_conta_ctb, grupo,
                COALESCE(SUM(debito_cents), 0)::text AS debito,
                COALESCE(SUM(credito_cents), 0)::text AS credito,
                COALESCE(SUM(valor_cents), 0)::text AS valor
           FROM finance.depreciacao_mensal
          WHERE grupo = 'despesa' AND classe = $1 AND competencia = $2::date AND excluido_em IS NULL
          GROUP BY classificador, nome_conta, cod_conta_ctb, grupo
          ORDER BY classificador`,
        [classe, competencia],
      );
      const despesaContas = despRows.map(mapConta);
      const despesaTotalCents = despesaContas.reduce((s, c) => s + c.valorCents, 0);

      // Base: saldo acumulado (soma histórica) até a competência, por conta.
      const baseRows = await repo.query<ContaRow[]>(
        `SELECT classificador, nome_conta, cod_conta_ctb, grupo,
                COALESCE(SUM(debito_cents), 0)::text AS debito,
                COALESCE(SUM(credito_cents), 0)::text AS credito,
                COALESCE(SUM(valor_cents), 0)::text AS valor
           FROM finance.depreciacao_mensal
          WHERE grupo IN ('imobilizado_bruto', 'direito_uso', 'deprec_acumulada')
            AND classe = $1 AND competencia <= $2::date AND excluido_em IS NULL
          GROUP BY classificador, nome_conta, cod_conta_ctb, grupo
         HAVING COALESCE(SUM(valor_cents), 0) <> 0
          ORDER BY grupo, classificador`,
        [classe, competencia],
      );
      const baseContas = baseRows.map(mapConta);

      let brutoCents = 0;
      let direitoUsoCents = 0;
      let acumuladaCents = 0;
      for (const c of baseContas) {
        if (c.grupo === 'imobilizado_bruto') brutoCents += c.valorCents;
        else if (c.grupo === 'direito_uso') direitoUsoCents += c.valorCents;
        else if (c.grupo === 'deprec_acumulada') acumuladaCents += c.valorCents;
      }

      return {
        classe,
        label,
        competencia,
        competenciaLabel: competenciaLabel(competencia),
        despesaContas,
        despesaTotalCents,
        baseContas,
        brutoCents,
        direitoUsoCents,
        acumuladaCents,
        liquidoCents: brutoCents + direitoUsoCents - acumuladaCents,
      };
    },

    /**
     * Frota FÍSICA (contexto): contagem de veículos ativos por garagem e tipo.
     * Snapshot do FRT_CADVEICULOS — separado do valor contábil da tela.
     */
    async frota(): Promise<FrotaComposicaoResponse> {
      const rows = await frotaRepo.find({ order: { garagemCodigo: 'ASC', qtd: 'DESC' } });

      const tipoMap = new Map<string, FrotaTipo>();
      for (const r of rows) {
        const t = tipoMap.get(r.tipoFrota) ?? { tipoFrota: r.tipoFrota, ehOnibus: r.ehOnibus, qtd: 0 };
        t.qtd += r.qtd;
        tipoMap.set(r.tipoFrota, t);
      }
      const porTipo = [...tipoMap.values()].sort((a, b) => b.qtd - a.qtd);

      const garagemMap = new Map<number, FrotaGaragem>();
      for (const r of rows) {
        const g =
          garagemMap.get(r.garagemCodigo) ??
          { garagemCodigo: r.garagemCodigo, garagemNome: r.garagemNome, qtd: 0, tipos: [] as FrotaTipo[] };
        g.qtd += r.qtd;
        g.tipos.push({ tipoFrota: r.tipoFrota, ehOnibus: r.ehOnibus, qtd: r.qtd });
        garagemMap.set(r.garagemCodigo, g);
      }
      const porGaragem = [...garagemMap.values()].sort((a, b) => b.qtd - a.qtd);

      const totalVeiculos = rows.reduce((s, r) => s + r.qtd, 0);
      const totalOnibus = rows.filter((r) => r.ehOnibus).reduce((s, r) => s + r.qtd, 0);
      const atualizadoEm =
        rows.length > 0
          ? rows.reduce((max, r) => (r.ultimoSyncEm > max ? r.ultimoSyncEm : max), rows[0]!.ultimoSyncEm).toISOString()
          : null;

      return {
        totalVeiculos,
        totalOnibus,
        totalAuxiliares: totalVeiculos - totalOnibus,
        porTipo,
        porGaragem,
        atualizadoEm,
      };
    },

    /** Sync completo: CTBSALDO (Globus) -> stage -> canônico + frota física. */
    async sincronizar(args: { usuarioId: string }): Promise<SyncDepreciacaoResponse> {
      const inicio = Date.now();
      const empresa = fastify.config.globus.empresaId;

      const sync = await adapter.sincronizar({ empresa, usuarioId: args.usuarioId });
      let etlGravados = 0;
      let etlIgnorados = 0;
      if (sync.status !== 'erro') {
        const r = await etl.processarPendentes({ limite: 50000 });
        etlGravados = r.gravados;
        etlIgnorados = r.ignorados;

        // Contexto da frota física (não-fatal: falha aqui não quebra o sync).
        try {
          const n = await refrescarFrota(empresa);
          fastify.log.info({ registros: n }, '[sync:depreciacao] frota_composicao refrescada');
        } catch (err) {
          fastify.log.warn({ err }, '[sync:depreciacao] falha ao refrescar frota_composicao (ignorado)');
        }
      }

      return {
        jobId: sync.jobId,
        registrosLidos: sync.registrosLidos,
        registrosGravados: sync.registrosGravados,
        etlGravados,
        etlIgnorados,
        duracaoMs: Date.now() - inicio,
        status: sync.status,
        mensagem: sync.mensagem,
      };
    },
  };
}

export type DepreciacaoService = ReturnType<typeof buildDepreciacaoService>;
