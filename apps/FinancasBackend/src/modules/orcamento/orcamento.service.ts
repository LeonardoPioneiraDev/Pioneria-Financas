import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import type {
  OrcamentoBaselineResponse,
  OrcamentoBaselineAno,
  OrcamentoBaselineCentro,
  OrcamentoDerivadoResponse,
  OrcamentoDerivadoSetor,
  OrcamentoSyncResponse,
  OrcamentoMetaResponse,
  OrcamentoMetaItem,
  OrcamentoAdotarBody,
} from '@pioneira/shared';
import { OrcamentoPrevisao } from '@/entities/orcamento-previsao.entity.js';
import { OrcamentoMeta } from '@/entities/orcamento-meta.entity.js';
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

const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** 'AAAA-MM-01' -> 'jun/2026'. */
function mesLabel(iso: string): string {
  const [ano, mes] = iso.slice(0, 7).split('-').map(Number);
  return `${MESES_CURTOS[(mes ?? 1) - 1] ?? mes}/${ano}`;
}

export function buildOrcamentoService(fastify: FastifyInstance) {
  const repo = fastify.db.getRepository(OrcamentoPrevisao);
  const cpRepo = fastify.db.getRepository(ContaPagar);
  const metaRepo = fastify.db.getRepository(OrcamentoMeta);
  const adapter = buildGlobusOrcamentoAdapter(fastify);
  const etl = buildOrcamentoEtl(fastify);

  return {
    /**
     * Baseline histórico: o orçado legado do Globus (2018-2020) por ano e por
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
     * Orçado DERIVADO do realizado (base técnica — PROJETADO, não oficial). Média
     * mensal do gasto por centro de custo nos últimos N meses (default 12), como o
     * Fluxo de Caixa projeta do histórico. Realizado = finance.contas_pagar por
     * setor (rateio_setores, fallback cod_setor pra títulos legados). É despesa.
     * O financeiro ACEITA ou AJUSTA — o sistema nunca crava isso como orçamento.
     */
    async derivado(query: { meses?: number }): Promise<OrcamentoDerivadoResponse> {
      const baseMeses = query.meses && query.meses > 0 ? Math.min(query.meses, 36) : BASE_MESES_PADRAO;

      // Ancora a janela no último mês com gasto (o dado do CP costuma ter defasagem;
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
          mesComparado: null,
          mesComparadoLabel: null,
          realizadoMesTotalCents: 0,
          qtdEstouros: 0,
          metaAdotada: false,
          metaAdotadaEm: null,
          porSetor: [],
          observacoes: ['Sem realizado por centro de custo no Contas a Pagar para derivar um orçado.'],
        };
      }

      // Realizado por setor na janela. Path rateio (títulos já re-sincronizados,
      // valor por setor) UNION path legado (cod_setor dominante + bruto). Data de
      // referência = emissão (fallback vencimento) = "mês em que o custo ocorreu".
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

      // COMPARATIVO: realizado do ÚLTIMO mês COMPLETO (antes do mês corrente) por
      // setor, pra confrontar com o orçado sugerido (a média). Tudo do CP já no
      // banco — não depende de sync. Ignora o mês corrente (parcial) pra não
      // subestimar o realizado.
      const mesCompRows = await cpRepo.query<Array<{ mes: string | null }>>(
        `SELECT to_char(MAX(m), 'YYYY-MM-DD') AS mes
           FROM (
             SELECT date_trunc('month', COALESCE(data_emissao, data_vencimento))::date AS m
               FROM finance.contas_pagar
              WHERE excluido_em IS NULL
                AND (rateio_setores IS NOT NULL OR cod_setor IS NOT NULL)
                AND COALESCE(data_emissao, data_vencimento) < date_trunc('month', CURRENT_DATE)
           ) t`,
      );
      const mesComparado = mesCompRows[0]?.mes ?? null;

      const realizadoMesPorSetor = new Map<string | null, number>();
      if (mesComparado) {
        const mesRows = await cpRepo.query<Array<{ cod_setor: string | null; total: string }>>(
          `WITH realizado AS (
             SELECT e.codigo AS cod_setor, SUM(e."valorCents")::bigint AS valor_cents
               FROM finance.contas_pagar cp
               CROSS JOIN LATERAL jsonb_to_recordset(cp.rateio_setores) AS e(codigo text, nome text, "valorCents" bigint)
              WHERE cp.excluido_em IS NULL AND cp.rateio_setores IS NOT NULL
                AND date_trunc('month', COALESCE(cp.data_emissao, cp.data_vencimento)) = $1::date
              GROUP BY e.codigo
             UNION ALL
             SELECT cp.cod_setor, SUM(cp.valor_bruto_cents)::bigint
               FROM finance.contas_pagar cp
              WHERE cp.excluido_em IS NULL AND cp.rateio_setores IS NULL AND cp.cod_setor IS NOT NULL
                AND date_trunc('month', COALESCE(cp.data_emissao, cp.data_vencimento)) = $1::date
              GROUP BY cp.cod_setor
           )
           SELECT cod_setor, SUM(valor_cents)::text AS total FROM realizado GROUP BY cod_setor`,
          [mesComparado],
        );
        for (const r of mesRows) realizadoMesPorSetor.set(r.cod_setor, Number(r.total));
      }

      // Meta adotada pelo financeiro (orçado de referência). Se existe, o comparativo
      // usa a META como orçado; senão usa a média sugerida. DEGRADA com segurança se
      // a tabela ainda não existir (migration não rodada): o derivado é consumido pelo
      // Painel CFO, então não pode derrubar o painel inteiro por causa disso.
      const empresaId = fastify.config.globus.empresaId;
      let metaRows: Array<{ cod: number; orcado: string; adotado_em: string | null }> = [];
      try {
        metaRows = await metaRepo.query<Array<{ cod: number; orcado: string; adotado_em: string | null }>>(
          `SELECT cod_custo_fin AS cod, orcado_mensal_cents::text AS orcado, adotado_em::text AS adotado_em
             FROM finance.orcamento_meta WHERE empresa_id = $1 AND excluido_em IS NULL`,
          [empresaId],
        );
      } catch (err) {
        fastify.log.warn({ err }, '[orcamento] finance.orcamento_meta indisponível — usando só a base técnica (rode migration:run)');
      }
      const metaPorSetor = new Map<string, number>();
      let metaAdotadaEmMax: string | null = null;
      for (const m of metaRows) {
        metaPorSetor.set(String(m.cod), Number(m.orcado));
        if (m.adotado_em && (!metaAdotadaEmMax || m.adotado_em > metaAdotadaEmMax)) metaAdotadaEmMax = m.adotado_em;
      }
      const metaAdotada = metaRows.length > 0;

      const porSetor: OrcamentoDerivadoSetor[] = rows.map((r) => {
        const realizadoCents = Number(r.total_cents);
        const mensalSugeridoCents = Math.round(realizadoCents / baseMeses);
        const realizadoMesCents = realizadoMesPorSetor.get(r.cod_setor) ?? 0;
        const metaMensalCents = metaPorSetor.get((r.cod_setor ?? '').trim()) ?? null;
        // Orçado de referência = meta adotada, se houver; senão a média sugerida.
        const orcadoRef = metaMensalCents ?? mensalSugeridoCents;
        const variacaoPerc = orcadoRef > 0
          ? Number(((realizadoMesCents / orcadoRef) * 100).toFixed(1))
          : 0;
        return {
          codSetor: r.cod_setor,
          nome: r.nome,
          categoria: classificarSetor(r.cod_setor, r.nome),
          realizadoCents,
          mesesComGasto: Number(r.meses_com_gasto),
          mensalSugeridoCents,
          realizadoMesCents,
          variacaoPerc,
          estourou: orcadoRef > 0 && realizadoMesCents > 0 && variacaoPerc > 110,
          metaMensalCents,
        };
      });

      const temCentral = porSetor.some((s) => s.categoria === 'central');

      const totalRealizadoCents = porSetor.reduce((s, x) => s + x.realizadoCents, 0);
      const orcadoMensalSugeridoCents = porSetor.reduce((s, x) => s + x.mensalSugeridoCents, 0);
      const realizadoMesTotalCents = porSetor.reduce((s, x) => s + x.realizadoMesCents, 0);
      const qtdEstouros = porSetor.filter((x) => x.estourou).length;

      // Janela: [mesMax - (baseMeses-1) meses, mesMax].
      const [ay, am] = mesMax.slice(0, 7).split('-').map(Number);
      const iniDate = new Date(Date.UTC(ay!, am! - 1 - (baseMeses - 1), 1));
      const mesInicio = iniDate.toISOString().slice(0, 10);

      const mesComparadoLabel = mesComparado ? mesLabel(mesComparado) : null;

      return {
        disponivel: true,
        baseMeses,
        mesInicio,
        mesFim: mesMax,
        totalRealizadoCents,
        orcadoMensalSugeridoCents,
        orcadoAnualSugeridoCents: orcadoMensalSugeridoCents * 12,
        mesComparado,
        mesComparadoLabel,
        realizadoMesTotalCents,
        qtdEstouros,
        metaAdotada,
        metaAdotadaEm: metaAdotadaEmMax ? new Date(metaAdotadaEmMax).toISOString() : null,
        porSetor,
        observacoes: [
          `Base técnica PROJETADA — não é o orçamento oficial. É a média mensal do que cada setor gastou de fato nos últimos ${baseMeses} meses (Contas a Pagar por centro de custo).`,
          'Mesma lógica do Fluxo de Caixa: o sistema não inventa o futuro, projeta a partir do histórico real.',
          'É uma SUGESTÃO para o financeiro partir dela e ajustar (inflação, metas, cortes) — não um valor cravado.',
          ...(mesComparadoLabel
            ? [
                `Comparativo: o "realizado ${mesComparadoLabel}" é o gasto do último mês COMPLETO de cada setor, confrontado com o orçado sugerido (a média). Estouro = passou de 110% da média — sinal de que o mês fugiu do padrão do próprio setor.`,
              ]
            : []),
          ...(temCentral
            ? [
                'ATENÇÃO à ADMINISTRAÇÃO: ela concentra o PAGAMENTO das dívidas dos outros setores, então o valor dela NÃO é custo próprio — aparece inflado. Só 4 unidades geram receita (garagens operacionais); as demais são apoio/custo.',
              ]
            : []),
          'Cobre DESPESA/custo por centro de custo. Um custo POR GARAGEM de verdade depende do financeiro definir como redistribuir o que hoje é pago pela administração (rateio) — não inventamos isso aqui.',
        ],
      };
    },

    /** Orçado de referência adotado (meta) por setor. Vazio = ainda não adotaram. */
    async metaAtual(): Promise<OrcamentoMetaResponse> {
      const empresaId = fastify.config.globus.empresaId;
      const rows = await metaRepo.query<
        Array<{ cod: number; nome: string | null; categoria: string; orcado: string; base: string; obs: string | null; adotado_em: string | null }>
      >(
        `SELECT cod_custo_fin AS cod, nome, categoria,
                orcado_mensal_cents::text AS orcado, base_sugerido_cents::text AS base,
                observacao AS obs, adotado_em::text AS adotado_em
           FROM finance.orcamento_meta
          WHERE empresa_id = $1 AND excluido_em IS NULL
          ORDER BY orcado_mensal_cents DESC`,
        [empresaId],
      );
      const itens: OrcamentoMetaItem[] = rows.map((r) => ({
        codCustoFin: Number(r.cod),
        nome: r.nome,
        categoria: r.categoria,
        orcadoMensalCents: Number(r.orcado),
        baseSugeridoCents: Number(r.base),
        observacao: r.obs,
      }));
      const adotadoEmMax = rows.reduce<string | null>(
        (acc, r) => (r.adotado_em && (!acc || r.adotado_em > acc) ? r.adotado_em : acc),
        null,
      );
      return {
        adotado: itens.length > 0,
        adotadoEm: adotadoEmMax ? new Date(adotadoEmMax).toISOString() : null,
        totalMensalCents: itens.reduce((s, x) => s + x.orcadoMensalCents, 0),
        itens,
      };
    },

    /** Adota/ajusta o orçado de referência por setor (upsert). Reflete no comparativo. */
    async adotarMeta(args: { itens: OrcamentoAdotarBody['itens']; usuarioId: string }): Promise<OrcamentoMetaResponse> {
      const empresaId = fastify.config.globus.empresaId;
      const agora = new Date();
      // Estado ANTES (por centro de custo) pra registrar o diff campo-a-campo.
      const metaAntes = await this.metaAtual();
      const antesPorCusto = new Map(metaAntes.itens.map((i) => [i.codCustoFin, i]));
      for (const it of args.itens) {
        await metaRepo.query(
          `INSERT INTO finance.orcamento_meta
             (empresa_id, cod_custo_fin, nome, categoria, orcado_mensal_cents, base_sugerido_cents, observacao, adotado_por_usuario_id, adotado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (empresa_id, cod_custo_fin)
           DO UPDATE SET
             nome = EXCLUDED.nome,
             categoria = EXCLUDED.categoria,
             orcado_mensal_cents = EXCLUDED.orcado_mensal_cents,
             base_sugerido_cents = EXCLUDED.base_sugerido_cents,
             observacao = EXCLUDED.observacao,
             adotado_por_usuario_id = EXCLUDED.adotado_por_usuario_id,
             adotado_em = EXCLUDED.adotado_em,
             atualizado_em = NOW(),
             excluido_em = NULL`,
          [
            empresaId, it.codCustoFin, it.nome ?? null, it.categoria ?? 'indefinido',
            it.orcadoMensalCents, it.baseSugeridoCents ?? 0, it.observacao ?? null, args.usuarioId, agora,
          ],
        );

        const antesIt = antesPorCusto.get(it.codCustoFin);
        await fastify.auditoria.registrarAlteracao({
          usuarioId: args.usuarioId,
          recurso: 'orcamento',
          recursoId: String(it.codCustoFin),
          descricao: `Meta de orçamento — ${it.nome ?? it.codCustoFin}`,
          antes: {
            orcadoMensalCents: antesIt?.orcadoMensalCents ?? null,
            observacao: antesIt?.observacao ?? null,
          },
          depois: { orcadoMensalCents: it.orcadoMensalCents, observacao: it.observacao ?? null },
        });
      }
      fastify.log.info({ setores: args.itens.length, usuarioId: args.usuarioId }, '[orcamento] meta adotada/ajustada');
      return this.metaAtual();
    },

    /** Export XLSX do comparativo (setor x orçado x realizado do mês x variação/estouro). */
    async exportarComparativoXlsx(): Promise<{ buffer: Buffer; filename: string }> {
      const der = await this.derivado({});
      const CAT_LABEL: Record<string, string> = {
        receita: 'Gera receita', apoio: 'Apoio/custo', central: 'Central (paga dívidas)', indefinido: 'Não classificado',
      };

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Pioneira Financas';
      const ws = wb.addWorksheet('Orçamento', { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = [
        { header: 'Setor', key: 'setor', width: 32 },
        { header: 'Natureza', key: 'cat', width: 20 },
        { header: 'Orçado mensal (R$)', key: 'orcado', width: 20 },
        { header: 'Fonte do orçado', key: 'fonte', width: 16 },
        { header: `Realizado ${der.mesComparadoLabel ?? ''} (R$)`, key: 'real', width: 22 },
        { header: 'Variação %', key: 'var', width: 12 },
        { header: 'Estouro', key: 'estouro', width: 10 },
      ];
      for (const s of der.porSetor) {
        const orcado = s.metaMensalCents ?? s.mensalSugeridoCents;
        ws.addRow({
          setor: s.nome ?? (s.codSetor ?? 'Sem centro de custo'),
          cat: CAT_LABEL[s.categoria] ?? s.categoria,
          orcado: orcado / 100,
          fonte: s.metaMensalCents !== null ? 'Meta adotada' : 'Base técnica',
          real: s.realizadoMesCents / 100,
          var: s.variacaoPerc,
          estouro: s.estourou ? 'SIM' : '',
        });
      }
      ws.getColumn('orcado').numFmt = '#,##0.00';
      ws.getColumn('real').numFmt = '#,##0.00';
      ws.getColumn('var').numFmt = '0.0';
      ws.getRow(1).font = { bold: true };

      const buffer = Buffer.from(await wb.xlsx.writeBuffer());
      const suf = der.mesComparado ? der.mesComparado.slice(0, 7) : 'atual';
      return { buffer, filename: `orcamento-${suf}.xlsx` };
    },

    /** Sync do baseline: CPGORCPREVISOES (Globus) -> stage -> canônico. */
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
