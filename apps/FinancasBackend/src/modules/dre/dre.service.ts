import type { FastifyInstance } from 'fastify';
import type {
  DreResumoQuery,
  DreResumoResponse,
  DreLinha,
  DreSyncResponse,
  DreDetalheQuery,
  DreDetalheResponse,
  DreContaDetalhe,
  DreSerieQuery,
  DreSerieResponse,
} from '@pioneira/shared';
import ExcelJS from 'exceljs';
import { DreContaMensal } from '@/entities/dre-conta-mensal.entity.js';
import { BancoMovto } from '@/entities/banco-movto.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { GLOBUS_QUERIES } from '@/integrations/globus/globus.queries.js';

/** Linha crua do CTBSALDO (contas de resultado). */
interface RawDreRow {
  CODIGO_EMPRESA: number;
  PERIODO: string;
  COD_CONTA_CTB: number;
  CLASSIFICADOR: string;
  NOME_CONTA: string | null;
  VL_DEBITO: number | null;
  VL_CREDITO: number | null;
}

/**
 * Estrutura da DRE (contábil, plano 1). Cada GRUPO soma as folhas cujo
 * classificador começa com algum prefixo. `valorCents = credito - debito`
 * (uniforme): receita fica POSITIVA, custo/dedução NEGATIVOS, e tudo soma pro
 * resultado. Os SUBTOTAIS somam as linhas anteriores. Ordem = ordem de exibição.
 */
type GrupoDef = { kind: 'grupo'; codigo: string; titulo: string; tipo: DreLinha['tipo']; prefixos: string[] };
type SubtotalDef = { kind: 'subtotal'; codigo: string; titulo: string };
type LinhaDef = GrupoDef | SubtotalDef;

const DRE_ESTRUTURA: LinhaDef[] = [
  { kind: 'grupo', codigo: 'receita_bruta', titulo: 'Receita operacional bruta', tipo: 'receita', prefixos: ['4.1.02'] },
  { kind: 'grupo', codigo: 'deducoes', titulo: '(−) Deduções da receita', tipo: 'deducao', prefixos: ['4.1.07'] },
  { kind: 'subtotal', codigo: 'receita_liquida', titulo: 'Receita operacional líquida' },
  { kind: 'grupo', codigo: 'pessoal', titulo: 'Custo com pessoal', tipo: 'custo', prefixos: ['3.1.01.01', '3.1.01.04'] },
  { kind: 'grupo', codigo: 'materiais', titulo: 'Materiais e combustível', tipo: 'custo', prefixos: ['3.1.01.05'] },
  { kind: 'grupo', codigo: 'custos_gerais_op', titulo: 'Custos gerais da operação', tipo: 'custo', prefixos: ['3.1.01.06'] },
  { kind: 'grupo', codigo: 'manutencao', titulo: 'Manutenção', tipo: 'custo', prefixos: ['3.1.01.08', '3.1.01.09'] },
  { kind: 'grupo', codigo: 'administracao', titulo: 'Administração', tipo: 'custo', prefixos: ['3.1.01.11', '3.1.01.12'] },
  { kind: 'grupo', codigo: 'financeiras', titulo: 'Despesas financeiras', tipo: 'custo', prefixos: ['3.1.02.01'] },
  { kind: 'grupo', codigo: 'arrendamento', titulo: 'Arrendamento mercantil', tipo: 'custo', prefixos: ['3.1.02.04', '3.1.02.05'] },
  { kind: 'grupo', codigo: 'tributarias', titulo: 'Despesas tributárias', tipo: 'custo', prefixos: ['3.1.02.06'] },
  { kind: 'grupo', codigo: 'depreciacao', titulo: 'Depreciação e amortização', tipo: 'custo', prefixos: ['3.1.02.07'] },
  { kind: 'grupo', codigo: 'aeronave', titulo: 'Custos da aeronave', tipo: 'custo', prefixos: ['3.1.02.13'] },
  { kind: 'subtotal', codigo: 'resultado_operacional', titulo: 'Resultado operacional' },
  { kind: 'grupo', codigo: 'rec_financeiras', titulo: 'Receitas financeiras', tipo: 'receita', prefixos: ['4.2.01'] },
  { kind: 'grupo', codigo: 'ganhos_capital', titulo: 'Ganhos de capital / venda de imobilizado', tipo: 'receita', prefixos: ['4.2.02'] },
  { kind: 'grupo', codigo: 'desp_nao_op', titulo: 'Despesas não operacionais', tipo: 'custo', prefixos: ['3.2'] },
  { kind: 'grupo', codigo: 'outros', titulo: 'Outros (não classificado)', tipo: 'custo', prefixos: [] },
  { kind: 'subtotal', codigo: 'resultado_liquido', titulo: 'Resultado líquido do exercício' },
];

const GRUPOS = DRE_ESTRUTURA.filter((l): l is GrupoDef => l.kind === 'grupo');
const TODOS_PREFIXOS = GRUPOS.flatMap((g) => g.prefixos);

/** Componentes de cada subtotal (linhas anteriores que ele acumula). */
const SUBTOTAIS: Record<string, string[]> = {
  receita_liquida: ['receita_bruta', 'deducoes'],
  resultado_operacional: [
    'receita_liquida', 'pessoal', 'materiais', 'custos_gerais_op', 'manutencao',
    'administracao', 'financeiras', 'arrendamento', 'tributarias', 'depreciacao', 'aeronave',
  ],
  resultado_liquido: ['resultado_operacional', 'rec_financeiras', 'ganhos_capital', 'desp_nao_op', 'outros'],
};

function competenciaLabel(competencia: string): string {
  const [ano, mes] = competencia.split('-');
  return `${mes}/${ano}`;
}
function normalizarCompetencia(v?: string): string | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})/.exec(v);
  return m ? `${m[1]}-${m[2]}-01` : null;
}
function periodoParaCompetencia(periodo: string): string | null {
  if (!/^\d{6}$/.test(periodo)) return null;
  const mes = periodo.slice(4, 6);
  if (mes < '01' || mes > '12') return null;
  return `${periodo.slice(0, 4)}-${mes}-01`;
}
/** 'AAAA-MM-01' -> primeiro dia do mês seguinte. */
function proximoMes(competencia: string): string {
  const [y, m] = competencia.split('-').map(Number);
  const ny = m === 12 ? y! + 1 : y!;
  const nm = m === 12 ? 1 : m! + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-01`;
}
function brlToCents(v: number | null | undefined): bigint {
  return v === null || v === undefined ? 0n : BigInt(Math.round(v * 100));
}
/** Folha casa o grupo se o classificador começa por algum prefixo. */
function casaPrefixo(classificador: string, prefixos: string[]): boolean {
  return prefixos.some((p) => classificador === p || classificador.startsWith(`${p}.`));
}

type Folha = { classificador: string; valor: number };

/** Valor de cada grupo e subtotal a partir das folhas de uma competência. */
function calcularValores(folhas: Folha[]): { grupo: Record<string, number>; sub: Record<string, number> } {
  const totalGeral = folhas.reduce((s, f) => s + f.valor, 0);
  const grupo: Record<string, number> = {};
  for (const g of GRUPOS) {
    if (g.codigo === 'outros') continue;
    grupo[g.codigo] = folhas.filter((f) => casaPrefixo(f.classificador, g.prefixos)).reduce((s, f) => s + f.valor, 0);
  }
  grupo['outros'] = totalGeral - Object.values(grupo).reduce((s, v) => s + v, 0);

  const sub: Record<string, number> = {};
  const valorDe = (cod: string): number => grupo[cod] ?? sub[cod] ?? 0;
  for (const cod of ['receita_liquida', 'resultado_operacional', 'resultado_liquido']) {
    sub[cod] = SUBTOTAIS[cod]!.reduce((s, c) => s + valorDe(c), 0);
  }
  return { grupo, sub };
}

export function buildDreService(fastify: FastifyInstance) {
  const repo = fastify.db.getRepository(DreContaMensal);
  const bancoRepo = fastify.db.getRepository(BancoMovto);
  const jobRepo = fastify.db.getRepository(SyncJob);
  const empresa = fastify.config.globus.empresaId;

  /** Repasse do GDF recebido no extrato (banco_movto) na competência. Gerencial. */
  async function repasseGdfDe(competencia: string): Promise<number> {
    const raw = await bancoRepo
      .createQueryBuilder('bm')
      .select('COALESCE(SUM(bm.valorCents), 0)', 'total')
      .where('bm.ehRepasseBrb = :t', { t: true })
      .andWhere('bm.dataMovto >= :ini', { ini: competencia })
      .andWhere('bm.dataMovto < :fim', { fim: proximoMes(competencia) })
      .getRawOne<{ total: string }>();
    return Math.abs(Number(raw?.total ?? 0));
  }

  /** Competências com movimento real (exclui meses futuros zerados do CTBSALDO). */
  async function mesesComMovimento(): Promise<string[]> {
    const rows = await repo.query<Array<{ competencia: string }>>(
      `SELECT competencia::text AS competencia
         FROM finance.dre_conta_mensal
        WHERE empresa_id = $1
        GROUP BY competencia
       HAVING COALESCE(SUM(debito_cents + credito_cents), 0) <> 0
        ORDER BY competencia DESC
        LIMIT 36`,
      [empresa],
    );
    return rows.map((r) => r.competencia);
  }

  /** Competências com RECEITA lançada (classe 4). Um mês fechado tem receita. */
  async function mesesComReceita(): Promise<string[]> {
    const rows = await repo.query<Array<{ competencia: string }>>(
      `SELECT competencia::text AS competencia
         FROM finance.dre_conta_mensal
        WHERE empresa_id = $1 AND classe = '4'
        GROUP BY competencia
       HAVING COALESCE(SUM(credito_cents), 0) <> 0
        ORDER BY competencia DESC
        LIMIT 36`,
      [empresa],
    );
    return rows.map((r) => r.competencia);
  }

  /** Folhas (classificador + valor crédito-débito) de uma competência. */
  async function folhasDe(competencia: string): Promise<Folha[]> {
    const rows = await repo.query<Array<{ classificador: string; valor: string }>>(
      `SELECT classificador, COALESCE(SUM(credito_cents - debito_cents), 0)::text AS valor
         FROM finance.dre_conta_mensal
        WHERE empresa_id = $1 AND competencia = $2::date
        GROUP BY classificador`,
      [empresa, competencia],
    );
    return rows.map((r) => ({ classificador: r.classificador, valor: Number(r.valor) }));
  }

  /** Folhas acumuladas de um intervalo de competências (para o YTD). */
  async function folhasIntervalo(inicio: string, fim: string): Promise<Folha[]> {
    const rows = await repo.query<Array<{ classificador: string; valor: string }>>(
      `SELECT classificador, COALESCE(SUM(credito_cents - debito_cents), 0)::text AS valor
         FROM finance.dre_conta_mensal
        WHERE empresa_id = $1 AND competencia >= $2::date AND competencia <= $3::date
        GROUP BY classificador`,
      [empresa, inicio, fim],
    );
    return rows.map((r) => ({ classificador: r.classificador, valor: Number(r.valor) }));
  }

  const service = {
    /** Resumo da DRE: linhas com valor do mês + mês anterior (comparativo). */
    async resumo(query: DreResumoQuery): Promise<DreResumoResponse> {
      const meses = await mesesComMovimento();
      if (meses.length === 0) {
        return {
          competencia: null,
          competenciaLabel: null,
          competenciaAnterior: null,
          competenciaAnteriorLabel: null,
          linhas: [],
          receitaLiquidaCents: 0,
          resultadoOperacionalCents: 0,
          resultadoLiquidoCents: 0,
          receitaLiquidaYtdCents: 0,
          resultadoOperacionalYtdCents: 0,
          resultadoLiquidoYtdCents: 0,
          ytdLabel: null,
          mesParcial: false,
          repasseGdfCents: 0,
          mesesDisponiveis: [],
          atualizadoEm: null,
          mensagem: 'Nenhum dado de DRE sincronizado ainda. Rode "Sincronizar" para importar do Globus.',
        };
      }

      // Default: último mês com RECEITA lançada (um mês em fechamento tem custo
      // mas ainda não tem receita, e abriria a DRE distorcida). O usuário ainda
      // pode escolher qualquer mês no seletor.
      const mesesReceita = await mesesComReceita();
      const pedida = normalizarCompetencia(query.competencia);
      let idx = 0;
      if (pedida && meses.includes(pedida)) idx = meses.indexOf(pedida);
      else if (mesesReceita.length > 0 && meses.includes(mesesReceita[0]!)) idx = meses.indexOf(mesesReceita[0]!);
      const competencia = meses[idx]!;
      const anterior = meses[idx + 1] ?? null; // meses em ordem desc → próximo = mês anterior

      const ano = competencia.slice(0, 4);
      const atual = calcularValores(await folhasDe(competencia));
      const ant = anterior ? calcularValores(await folhasDe(anterior)) : { grupo: {}, sub: {} };
      const ytd = calcularValores(await folhasIntervalo(`${ano}-01-01`, competencia));

      const valorAtual = (l: LinhaDef): number => (l.kind === 'subtotal' ? atual.sub[l.codigo] ?? 0 : atual.grupo[l.codigo] ?? 0);
      const valorAnt = (l: LinhaDef): number => (l.kind === 'subtotal' ? ant.sub[l.codigo] ?? 0 : ant.grupo[l.codigo] ?? 0);
      const valorYtd = (l: LinhaDef): number => (l.kind === 'subtotal' ? ytd.sub[l.codigo] ?? 0 : ytd.grupo[l.codigo] ?? 0);

      const linhas: DreLinha[] = DRE_ESTRUTURA
        // Esconde "Outros" quando é irrelevante em todas as visões (< R$ 1,00).
        .filter((l) => l.codigo !== 'outros' || Math.abs(valorAtual(l)) >= 100 || Math.abs(valorAnt(l)) >= 100 || Math.abs(valorYtd(l)) >= 100)
        .map((l) => ({
          codigo: l.codigo,
          titulo: l.titulo,
          tipo: l.kind === 'subtotal' ? ('subtotal' as const) : l.tipo,
          valorCents: valorAtual(l),
          valorAnteriorCents: valorAnt(l),
          valorYtdCents: valorYtd(l),
          ehSubtotal: l.kind === 'subtotal',
          prefixos: l.kind === 'grupo' ? l.prefixos : [],
        }));

      // Rótulo do YTD: do primeiro mês com movimento no ano até a competência.
      const mesesAno = meses.filter((m) => m.slice(0, 4) === ano && m <= competencia).sort();
      const ytdLabel = mesesAno.length > 0 ? `${mesesAno[0]!.slice(5, 7)}–${competencia.slice(5, 7)}/${ano}` : null;

      const repasseGdfCents = await repasseGdfDe(competencia);
      // Mês em fechamento: tem custo mas a receita bruta ainda não foi lançada.
      const mesParcial = Math.abs(atual.grupo['receita_bruta'] ?? 0) < 100;

      const atualizadoRow = await repo.query<Array<{ ultimo: string | null }>>(
        `SELECT MAX(ultimo_sync_em)::text AS ultimo FROM finance.dre_conta_mensal WHERE empresa_id = $1`,
        [empresa],
      );

      return {
        competencia,
        competenciaLabel: competenciaLabel(competencia),
        competenciaAnterior: anterior,
        competenciaAnteriorLabel: anterior ? competenciaLabel(anterior) : null,
        linhas,
        receitaLiquidaCents: atual.sub['receita_liquida'] ?? 0,
        resultadoOperacionalCents: atual.sub['resultado_operacional'] ?? 0,
        resultadoLiquidoCents: atual.sub['resultado_liquido'] ?? 0,
        receitaLiquidaYtdCents: ytd.sub['receita_liquida'] ?? 0,
        resultadoOperacionalYtdCents: ytd.sub['resultado_operacional'] ?? 0,
        resultadoLiquidoYtdCents: ytd.sub['resultado_liquido'] ?? 0,
        ytdLabel,
        mesParcial,
        repasseGdfCents,
        mesesDisponiveis: meses,
        atualizadoEm: atualizadoRow[0]?.ultimo ?? null,
      };
    },

    /** Série mensal dos resultados-chave (para o gráfico de evolução). */
    async serie(query: DreSerieQuery): Promise<DreSerieResponse> {
      const n = query.meses ?? 12;
      const rows = await repo.query<Array<{ competencia: string; classificador: string; valor: string }>>(
        `SELECT competencia::text AS competencia, classificador,
                COALESCE(SUM(credito_cents - debito_cents), 0)::text AS valor
           FROM finance.dre_conta_mensal
          WHERE empresa_id = $1
          GROUP BY competencia, classificador`,
        [empresa],
      );
      const porMes = new Map<string, Folha[]>();
      for (const r of rows) {
        const arr = porMes.get(r.competencia) ?? [];
        arr.push({ classificador: r.classificador, valor: Number(r.valor) });
        porMes.set(r.competencia, arr);
      }
      const comps = [...porMes.entries()]
        .filter(([, f]) => f.some((x) => x.valor !== 0)) // exclui meses futuros zerados
        .map(([c]) => c)
        .sort()
        .slice(-n);

      const serie = comps.map((c) => {
        const { sub } = calcularValores(porMes.get(c)!);
        return {
          competencia: c,
          competenciaLabel: competenciaLabel(c),
          receitaLiquidaCents: sub['receita_liquida'] ?? 0,
          resultadoOperacionalCents: sub['resultado_operacional'] ?? 0,
          resultadoLiquidoCents: sub['resultado_liquido'] ?? 0,
        };
      });
      return { serie };
    },

    /** Detalhe de uma linha: as contas do razão que a compõem, na competência. */
    async detalheLinha(query: DreDetalheQuery): Promise<DreDetalheResponse> {
      const def = DRE_ESTRUTURA.find((l) => l.codigo === query.linha);
      const titulo = def?.titulo ?? query.linha;
      const meses = await mesesComMovimento();
      if (meses.length === 0) {
        return { codigo: query.linha, titulo, competencia: null, competenciaLabel: null, contas: [], totalCents: 0 };
      }
      const pedida = normalizarCompetencia(query.competencia);
      const competencia = pedida && meses.includes(pedida) ? pedida : meses[0]!;

      const rows = await repo.query<Array<{ classificador: string; nome_conta: string | null; debito: string; credito: string }>>(
        `SELECT classificador, nome_conta,
                COALESCE(SUM(debito_cents), 0)::text AS debito,
                COALESCE(SUM(credito_cents), 0)::text AS credito
           FROM finance.dre_conta_mensal
          WHERE empresa_id = $1 AND competencia = $2::date
          GROUP BY classificador, nome_conta`,
        [empresa, competencia],
      );

      // Filtra as contas que pertencem a esta linha.
      const pertence = (classificador: string): boolean => {
        if (!def || def.kind === 'subtotal') return false; // subtotais não tem drill-down direto
        if (def.codigo === 'outros') return !casaPrefixo(classificador, TODOS_PREFIXOS);
        return casaPrefixo(classificador, def.prefixos);
      };

      const contas: DreContaDetalhe[] = rows
        .filter((r) => pertence(r.classificador))
        .map((r) => {
          const debitoCents = Number(r.debito);
          const creditoCents = Number(r.credito);
          return { classificador: r.classificador, nomeConta: r.nome_conta, debitoCents, creditoCents, valorCents: creditoCents - debitoCents };
        })
        .filter((c) => c.valorCents !== 0)
        .sort((a, b) => Math.abs(b.valorCents) - Math.abs(a.valorCents));

      return {
        codigo: query.linha,
        titulo,
        competencia,
        competenciaLabel: competenciaLabel(competencia),
        contas,
        totalCents: contas.reduce((s, c) => s + c.valorCents, 0),
      };
    },

    /** Exporta a DRE da competência para XLSX (mês + % RL + anterior + YTD). */
    async exportarXlsx(query: DreResumoQuery): Promise<{ buffer: Buffer; filename: string }> {
      const r = await service.resumo(query);
      const label = r.competenciaLabel ?? '—';
      const base = Math.abs(r.receitaLiquidaCents) || 1;

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Sistema Financeiro Pioneira';
      const ws = wb.addWorksheet('DRE', { views: [{ state: 'frozen', ySplit: 2 }] });

      ws.mergeCells('A1:E1');
      ws.getCell('A1').value = `DRE contábil — ${label}`;
      ws.getCell('A1').font = { bold: true, size: 14 };

      const head = ws.addRow(['Linha', label, '% RL', `Anterior (${r.competenciaAnteriorLabel ?? '—'})`, `Acumulado (${r.ytdLabel ?? '—'})`]);
      head.font = { bold: true };

      for (const l of r.linhas) {
        const row = ws.addRow([
          l.titulo,
          l.valorCents / 100,
          r.receitaLiquidaCents ? l.valorCents / base : 0,
          l.valorAnteriorCents / 100,
          l.valorYtdCents / 100,
        ]);
        if (l.ehSubtotal) row.font = { bold: true };
        row.getCell(2).numFmt = '#,##0.00';
        row.getCell(3).numFmt = '0%';
        row.getCell(4).numFmt = '#,##0.00';
        row.getCell(5).numFmt = '#,##0.00';
      }

      ws.addRow([]);
      const memo = ws.addRow(['Repasse GDF recebido no mês (gerencial — extrato, não contábil)', r.repasseGdfCents / 100]);
      memo.font = { italic: true, color: { argb: 'FF9A6700' } };
      memo.getCell(2).numFmt = '#,##0.00';

      ws.columns = [{ width: 48 }, { width: 18 }, { width: 8 }, { width: 22 }, { width: 22 }];

      const buffer = Buffer.from(await wb.xlsx.writeBuffer());
      return { buffer, filename: `dre-${r.competencia ?? 'sem-dado'}.xlsx` };
    },

    /** Sync: CTBSALDO (contas de resultado, plano 1) -> finance.dre_conta_mensal. */
    async sincronizar(args: { usuarioId: string }): Promise<DreSyncResponse> {
      const inicio = Date.now();
      const log = fastify.log.child({ sync: { sistema: 'globus', recurso: 'dre' } });

      const job = jobRepo.create({
        sistema: 'globus',
        recurso: 'dre',
        status: 'rodando',
        parametros: { empresa },
        usuarioId: args.usuarioId ?? null,
      });
      await jobRepo.save(job);

      try {
        if (!fastify.oracle?.isAvailable?.()) throw new Error('Conexão com Oracle (Globus) indisponível');

        const result = await fastify.oracle.execute<RawDreRow>(
          GLOBUS_QUERIES.dreContabil,
          { empresa },
          { queryName: 'dreContabil', syncJobId: job.id },
        );
        const linhas = result.rows ?? [];
        const lidos = linhas.length;

        let gravados = 0;
        const agora = new Date();
        for (const raw of linhas) {
          const competencia = periodoParaCompetencia(String(raw.PERIODO));
          if (!competencia) continue;
          const classificador = String(raw.CLASSIFICADOR ?? '').trim();
          await repo
            .createQueryBuilder()
            .insert()
            .values({
              empresaId: raw.CODIGO_EMPRESA,
              competencia,
              periodo: String(raw.PERIODO),
              codContaCtb: raw.COD_CONTA_CTB,
              classificador,
              nomeConta: raw.NOME_CONTA ?? null,
              classe: classificador.charAt(0),
              debitoCents: brlToCents(raw.VL_DEBITO).toString(),
              creditoCents: brlToCents(raw.VL_CREDITO).toString(),
              ultimoSyncEm: agora,
            })
            .orUpdate(
              ['periodo', 'classificador', 'nome_conta', 'classe', 'debito_cents', 'credito_cents', 'ultimo_sync_em', 'atualizado_em'],
              ['empresa_id', 'competencia', 'cod_conta_ctb'],
            )
            .execute();
          gravados += 1;
        }

        job.status = 'ok';
        job.terminadoEm = new Date();
        job.registrosLidos = lidos;
        job.registrosGravados = gravados;
        await jobRepo.save(job);
        log.info({ lidos, gravados }, '[sync:dre] concluído');

        return { jobId: job.id, registrosLidos: lidos, registrosGravados: gravados, duracaoMs: Date.now() - inicio, status: 'ok' };
      } catch (err) {
        const message = (err as Error).message;
        log.error({ err }, '[sync:dre] FALHA');
        job.status = 'erro';
        job.terminadoEm = new Date();
        job.erroMensagem = message;
        await jobRepo.save(job);
        return { jobId: job.id, registrosLidos: 0, registrosGravados: 0, duracaoMs: Date.now() - inicio, status: 'erro', mensagem: message };
      }
    },
  };

  return service;
}

export type DreService = ReturnType<typeof buildDreService>;
