import type { FastifyInstance } from 'fastify';
import type {
  OrcamentoBaselineResponse,
  OrcamentoBaselineAno,
  OrcamentoBaselineCentro,
  OrcamentoDerivadoResponse,
  OrcamentoDerivadoSetor,
  OrcamentoSyncResponse,
} from '@pioneira/shared';
import { OrcamentoPrevisao } from '@/entities/orcamento-previsao.entity.js';
import { ContaPagar } from '@/entities/conta-pagar.entity.js';
import { buildGlobusOrcamentoAdapter } from '@/integrations/globus/globus-orcamento.adapter.js';
import { buildOrcamentoEtl } from '@/etl/orcamento.etl.js';

const BASE_MESES_PADRAO = 12;

type CategoriaSetor = 'receita' | 'apoio' | 'central' | 'indefinido';

/** Remove acentos + uppercase, pra casar nome do centro de custo de forma robusta. */
function normalizarNome(nome: string | null): string {
  return (nome ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Natureza do centro de custo (confirmado via CPGCUSTOS em 2026-07-15; ver memória
 * garagens-receita-rateio). CADA unidade tem vários sub-códigos no Globus (ex.:
 * Santa Maria = 10000..10003, todos "UNIDADE SANTA MARIA"), então classificamos
 * pelo PREFIXO (dezena de milhar), não pelo código exato:
 *   1x Santa Maria · 2x Gama · 3x Itapoã · 4x São Sebastião  -> receita (garagens)
 *   5x União · 6x Setor "O" · 7x Obra · 9x Abastecimento      -> apoio (só custo)
 *   8x Administração N. Bandeirante                            -> central (paga as
 *      dívidas dos outros setores — valor NÃO é custo próprio, aparece inflado)
 * Config MVP; migra pra cadastro quando o financeiro definir o rateio real.
 */
const PREFIXO_CATEGORIA: Record<number, CategoriaSetor> = {
  1: 'receita', 2: 'receita', 3: 'receita', 4: 'receita',
  5: 'apoio', 6: 'apoio', 7: 'apoio', 9: 'apoio',
  8: 'central',
};

/** Classifica pelo prefixo do CODCUSTOFIN (robusto a sub-códigos); nome como reserva. */
function classificarSetor(codSetor: string | null, nome: string | null): CategoriaSetor {
  const cod = Number((codSetor ?? '').trim());
  if (Number.isInteger(cod) && cod >= 10000 && cod <= 99999) {
    const cat = PREFIXO_CATEGORIA[Math.floor(cod / 10000)];
    if (cat) return cat;
  }
  // Fallback por nome (centros pequenos/legados fora da faixa de 5 dígitos: PMDF,
  // COMLURB, CARGA etc. ficam 'indefinido' — não force-encaixamos).
  const n = normalizarNome(nome);
  if (!n) return 'indefinido';
  if (n.includes('ADMINISTRA')) return 'central';
  if (n.includes('SANTA MARIA') || n.includes('GAMA') || n.includes('ITAPOA') || n.includes('SAO SEBASTIAO')) {
    return 'receita';
  }
  if (n.includes('ABASTECIMENTO') || n.includes('UNIAO') || n.includes('SETOR O') || n.includes('OBRA')) return 'apoio';
  return 'indefinido';
}

export function buildOrcamentoService(fastify: FastifyInstance) {
  const repo = fastify.db.getRepository(OrcamentoPrevisao);
  const cpRepo = fastify.db.getRepository(ContaPagar);
  const adapter = buildGlobusOrcamentoAdapter(fastify);
  const etl = buildOrcamentoEtl(fastify);

  return {
    /**
     * Baseline historico: o orcado legado do Globus (2018-2020) por ano e por
     * centro de custo do ano mais recente. Prova de conceito + isca pro financeiro.
     */
    async baseline(): Promise<OrcamentoBaselineResponse> {
      const empresaId = fastify.config.globus.empresaId;

      const anosRows = await repo.query<
        Array<{ ano: number; qtd: string; receita: string; despesa: string; total: string }>
      >(
        `SELECT ano,
                COUNT(*)::text AS qtd,
                COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor_cents ELSE 0 END), 0)::text AS receita,
                COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor_cents ELSE 0 END), 0)::text AS despesa,
                COALESCE(SUM(valor_cents), 0)::text AS total
           FROM finance.orcamento_previsao
          WHERE excluido_em IS NULL AND empresa_id = $1 AND ano IS NOT NULL
          GROUP BY ano
          ORDER BY ano DESC`,
        [empresaId],
      );

      const anos: OrcamentoBaselineAno[] = anosRows.map((r) => ({
        ano: Number(r.ano),
        qtdLinhas: Number(r.qtd),
        receitaCents: Number(r.receita),
        despesaCents: Number(r.despesa),
        totalCents: Number(r.total),
      }));

      const disponivel = anos.length > 0;

      const resumoRows = await repo.query<
        Array<{ receita: string; despesa: string; total: string; qtd: string; centros: string; dmin: string | null; dmax: string | null }>
      >(
        `SELECT COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor_cents ELSE 0 END), 0)::text AS receita,
                COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor_cents ELSE 0 END), 0)::text AS despesa,
                COALESCE(SUM(valor_cents), 0)::text AS total,
                COUNT(*)::text AS qtd,
                COUNT(DISTINCT cod_custo_fin)::text AS centros,
                MIN(data_previsao)::text AS dmin,
                MAX(data_previsao)::text AS dmax
           FROM finance.orcamento_previsao
          WHERE excluido_em IS NULL AND empresa_id = $1`,
        [empresaId],
      );
      const resumo = resumoRows[0];

      const anoDetalhe = anos.length > 0 ? anos[0]!.ano : null;
      let porCentroCusto: OrcamentoBaselineCentro[] = [];
      if (anoDetalhe !== null) {
        const centroRows = await repo.query<
          Array<{ cod: number | null; descricao: string | null; total: string }>
        >(
          `SELECT cod_custo_fin AS cod,
                  MAX(centro_custo_desc) AS descricao,
                  COALESCE(SUM(valor_cents), 0)::text AS total
             FROM finance.orcamento_previsao
            WHERE excluido_em IS NULL AND empresa_id = $1 AND ano = $2
            GROUP BY cod_custo_fin
            ORDER BY total DESC`,
          [empresaId, anoDetalhe],
        );
        porCentroCusto = centroRows.map((r) => ({
          codCustoFin: r.cod !== null ? Number(r.cod) : null,
          descricao: r.descricao,
          valorCents: Number(r.total),
        }));
      }

      const syncRow = await repo.query<Array<{ ultimo: string | null }>>(
        `SELECT MAX(ultimo_sync_em)::text AS ultimo FROM finance.orcamento_previsao WHERE excluido_em IS NULL`,
      );
      const ultimoSyncEm = syncRow[0]?.ultimo ? new Date(syncRow[0].ultimo).toISOString() : null;

      const observacoes = disponivel
        ? [
            'Este é o ÚLTIMO orçamento que a Pioneira lançou no Globus — dado LEGADO. Não há lançamento de 2021 em diante (parou em maio/2020; o motivo ainda não foi confirmado).',
            'A granularidade era baixa: poucos centros de custo e lançamento diário — mais parecido com previsão de caixa do que orçamento anual por conta.',
            'O eixo é o CENTRO DE CUSTO FINANCEIRO (CCUSTOFINANC) — o mesmo do "setor" no Contas a Pagar, onde o REALIZADO já está pronto. Se for esse o eixo, o comparativo realizado × orçado é imediato.',
            'É esse o eixo e o formato que vocês querem? Ou o orçamento de hoje vive em planilha, com outra estrutura? Responda em "Perguntas ao Financeiro" para destravar a construção do módulo.',
          ]
        : [
            'Nenhum baseline sincronizado ainda. Rode "Sincronizar baseline" para importar o orçado legado (2018-2020) do Globus.',
          ];

      return {
        disponivel,
        empresaId,
        anos,
        totalReceitaCents: Number(resumo?.receita ?? 0),
        totalDespesaCents: Number(resumo?.despesa ?? 0),
        totalCents: Number(resumo?.total ?? 0),
        qtdLinhas: Number(resumo?.qtd ?? 0),
        qtdCentrosCusto: Number(resumo?.centros ?? 0),
        anoDetalhe,
        dataMin: resumo?.dmin ?? null,
        dataMax: resumo?.dmax ?? null,
        porCentroCusto,
        ultimoSyncEm,
        observacoes,
      };
    },

    /**
     * Orcado DERIVADO do realizado (base tecnica — PROJETADO, nao oficial). Media
     * mensal do gasto por centro de custo nos ultimos N meses (default 12), como o
     * Fluxo de Caixa projeta do historico. Realizado = finance.contas_pagar por
     * setor (rateio_setores, fallback cod_setor pra titulos legados). E despesa.
     * O financeiro ACEITA ou AJUSTA — o sistema nunca crava isso como orcamento.
     */
    async derivado(query: { meses?: number }): Promise<OrcamentoDerivadoResponse> {
      const baseMeses = query.meses && query.meses > 0 ? Math.min(query.meses, 36) : BASE_MESES_PADRAO;

      // Ancora a janela no ultimo mes com gasto (o dado do CP costuma ter defasagem;
      // ancorar em CURRENT_DATE traria meses recentes ainda incompletos).
      const refRows = await cpRepo.query<Array<{ mes_max: string | null }>>(
        `SELECT to_char(date_trunc('month', MAX(COALESCE(cp.data_emissao, cp.data_vencimento))), 'YYYY-MM-DD') AS mes_max
           FROM finance.contas_pagar cp
          WHERE cp.excluido_em IS NULL
            AND (cp.rateio_setores IS NOT NULL OR cp.cod_setor IS NOT NULL)`,
      );
      const mesMax = refRows[0]?.mes_max ?? null;

      if (!mesMax) {
        return {
          disponivel: false,
          baseMeses,
          mesInicio: null,
          mesFim: null,
          totalRealizadoCents: 0,
          orcadoMensalSugeridoCents: 0,
          orcadoAnualSugeridoCents: 0,
          porSetor: [],
          observacoes: ['Sem realizado por centro de custo no Contas a Pagar para derivar um orçado.'],
        };
      }

      // Realizado por setor na janela. Path rateio (titulos ja re-sincronizados,
      // valor por setor) UNION path legado (cod_setor dominante + bruto). Data de
      // referencia = emissao (fallback vencimento) = "mes em que o custo ocorreu".
      const rows = await cpRepo.query<
        Array<{ cod_setor: string | null; nome: string | null; meses_com_gasto: string; total_cents: string }>
      >(
        `WITH realizado AS (
           SELECT e.codigo AS cod_setor,
                  MAX(e.nome) AS nome,
                  date_trunc('month', COALESCE(cp.data_emissao, cp.data_vencimento))::date AS mes,
                  SUM(e."valorCents")::bigint AS valor_cents
             FROM finance.contas_pagar cp
             CROSS JOIN LATERAL jsonb_to_recordset(cp.rateio_setores) AS e(codigo text, nome text, "valorCents" bigint)
            WHERE cp.excluido_em IS NULL
              AND cp.rateio_setores IS NOT NULL
              AND COALESCE(cp.data_emissao, cp.data_vencimento) >= ($1::date - make_interval(months => $2::int - 1))
              AND COALESCE(cp.data_emissao, cp.data_vencimento) <  ($1::date + INTERVAL '1 month')
            GROUP BY e.codigo, mes
           UNION ALL
           SELECT cp.cod_setor AS cod_setor,
                  MAX(cp.setor_nome) AS nome,
                  date_trunc('month', COALESCE(cp.data_emissao, cp.data_vencimento))::date AS mes,
                  SUM(cp.valor_bruto_cents)::bigint AS valor_cents
             FROM finance.contas_pagar cp
            WHERE cp.excluido_em IS NULL
              AND cp.rateio_setores IS NULL AND cp.cod_setor IS NOT NULL
              AND COALESCE(cp.data_emissao, cp.data_vencimento) >= ($1::date - make_interval(months => $2::int - 1))
              AND COALESCE(cp.data_emissao, cp.data_vencimento) <  ($1::date + INTERVAL '1 month')
            GROUP BY cp.cod_setor, mes
         )
         SELECT cod_setor,
                MAX(nome) AS nome,
                COUNT(DISTINCT mes)::text AS meses_com_gasto,
                SUM(valor_cents)::text AS total_cents
           FROM realizado
          GROUP BY cod_setor
          ORDER BY SUM(valor_cents) DESC`,
        [mesMax, baseMeses],
      );

      const porSetor: OrcamentoDerivadoSetor[] = rows.map((r) => {
        const realizadoCents = Number(r.total_cents);
        return {
          codSetor: r.cod_setor,
          nome: r.nome,
          categoria: classificarSetor(r.cod_setor, r.nome),
          realizadoCents,
          mesesComGasto: Number(r.meses_com_gasto),
          mensalSugeridoCents: Math.round(realizadoCents / baseMeses),
        };
      });

      const temCentral = porSetor.some((s) => s.categoria === 'central');

      const totalRealizadoCents = porSetor.reduce((s, x) => s + x.realizadoCents, 0);
      const orcadoMensalSugeridoCents = porSetor.reduce((s, x) => s + x.mensalSugeridoCents, 0);

      // Janela: [mesMax - (baseMeses-1) meses, mesMax].
      const [ay, am] = mesMax.slice(0, 7).split('-').map(Number);
      const iniDate = new Date(Date.UTC(ay!, am! - 1 - (baseMeses - 1), 1));
      const mesInicio = iniDate.toISOString().slice(0, 10);

      return {
        disponivel: true,
        baseMeses,
        mesInicio,
        mesFim: mesMax,
        totalRealizadoCents,
        orcadoMensalSugeridoCents,
        orcadoAnualSugeridoCents: orcadoMensalSugeridoCents * 12,
        porSetor,
        observacoes: [
          `Base técnica PROJETADA — não é o orçamento oficial. É a média mensal do que cada setor gastou de fato nos últimos ${baseMeses} meses (Contas a Pagar por centro de custo).`,
          'Mesma lógica do Fluxo de Caixa: o sistema não inventa o futuro, projeta a partir do histórico real.',
          'É uma SUGESTÃO para o financeiro partir dela e ajustar (inflação, metas, cortes) — não um valor cravado.',
          ...(temCentral
            ? [
                'ATENÇÃO à ADMINISTRAÇÃO: ela concentra o PAGAMENTO das dívidas dos outros setores, então o valor dela NÃO é custo próprio — aparece inflado. Só 4 unidades geram receita (garagens operacionais); as demais são apoio/custo.',
              ]
            : []),
          'Cobre DESPESA/custo por centro de custo. Um custo POR GARAGEM de verdade depende do financeiro definir como redistribuir o que hoje é pago pela administração (rateio) — não inventamos isso aqui.',
        ],
      };
    },

    /** Sync do baseline: CPGORCPREVISOES (Globus) -> stage -> canonico. */
    async sincronizar(args: { usuarioId: string }): Promise<OrcamentoSyncResponse> {
      const inicio = Date.now();
      const empresa = fastify.config.globus.empresaId;

      const sync = await adapter.sincronizar({ empresa, usuarioId: args.usuarioId });
      let etlGravados = 0;
      if (sync.status !== 'erro') {
        const r = await etl.processarPendentes({ limite: 50000 });
        etlGravados = r.gravados;
      }

      return {
        jobId: sync.jobId,
        registrosLidos: sync.registrosLidos,
        registrosGravados: sync.registrosGravados,
        etlGravados,
        duracaoMs: Date.now() - inicio,
        status: sync.status,
        mensagem: sync.mensagem,
      };
    },
  };
}

export type OrcamentoService = ReturnType<typeof buildOrcamentoService>;
