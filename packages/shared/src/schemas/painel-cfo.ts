import { Type, type Static } from '@sinclair/typebox';

// ============================================================================
// PAINEL CFO — dashboard executivo (Fase 5).
// ----------------------------------------------------------------------------
// NAO tem fonte de dado propria: CONSOLIDA os modulos ja prontos (Fluxo de
// Caixa, DRE, Contas a Pagar, Orcamento, Recebiveis GDF, Folha). Cada KPI
// carrega o `estado` (real | calculado | projetado | sem_dado) e a `fonte`,
// seguindo a regra do projeto: quando nao tem dado, o sistema diz que nao tem.
// ============================================================================

/** Como o numero foi obtido — herda os estados explicitos do v1. */
export const EstadoDadoSchema = Type.Union([
  Type.Literal('real'), // veio pronto de um lancamento/extrato
  Type.Literal('calculado'), // derivado por formula sobre dados reais
  Type.Literal('projetado'), // estimativa futura (projecao de caixa)
  Type.Literal('sem_dado'), // insumo ausente — nao inventamos
]);
export type EstadoDado = Static<typeof EstadoDadoSchema>;

/** Comparativo de um KPI monetario contra uma base (mes anterior, em geral). */
export const KpiComparativoSchema = Type.Object({
  baseCents: Type.Integer(),
  deltaCents: Type.Integer(),
  /** Variacao percentual sobre a base. Null quando base = 0. */
  deltaPerc: Type.Union([Type.Number(), Type.Null()]),
  rotulo: Type.String(),
});
export type KpiComparativo = Static<typeof KpiComparativoSchema>;

export const KpiCfoSchema = Type.Object({
  /** Codigo estavel (ex.: 'caixa_hoje', 'resultado_liquido'). */
  chave: Type.String(),
  titulo: Type.String(),
  /** 'moeda' usa valorCents; 'dias' usa valorDias. */
  unidade: Type.Union([Type.Literal('moeda'), Type.Literal('dias')]),
  valorCents: Type.Union([Type.Integer(), Type.Null()]),
  valorDias: Type.Union([Type.Number(), Type.Null()]),
  estado: EstadoDadoSchema,
  /** Se subir e bom ('cima'), ruim ('baixo') ou neutro — para colorir o delta. */
  direcaoBoa: Type.Union([Type.Literal('cima'), Type.Literal('baixo'), Type.Literal('neutro')]),
  /** Comparativo MoM (so nos KPIs monetarios que tem base). Null caso contrario. */
  comparativo: Type.Union([KpiComparativoSchema, Type.Null()]),
  /** Sublinha explicativa (ex.: 'projecao 30d: R$ 2,1 M'). Null se nao ha. */
  detalhe: Type.Union([Type.String(), Type.Null()]),
  /** Modulo de origem do numero (rastreabilidade). */
  fonte: Type.String(),
  /** Rota do modulo para o link "abrir". */
  href: Type.String(),
});
export type KpiCfo = Static<typeof KpiCfoSchema>;

// ----------------------------------------------------------------------------
// ALERTAS ESTRATEGICOS
// ----------------------------------------------------------------------------

export const AlertaCfoSchema = Type.Object({
  nivel: Type.Union([Type.Literal('critico'), Type.Literal('atencao'), Type.Literal('info')]),
  titulo: Type.String(),
  detalhe: Type.String(),
  /** Nome do modulo relacionado. */
  modulo: Type.String(),
  href: Type.String(),
});
export type AlertaCfo = Static<typeof AlertaCfoSchema>;

// ----------------------------------------------------------------------------
// COMPARATIVO MoM / YoY (serie mensal do resultado — fonte: DRE)
// ----------------------------------------------------------------------------

export const ComparativoPontoSchema = Type.Object({
  competencia: Type.String({ format: 'date' }),
  competenciaLabel: Type.String(),
  receitaLiquidaCents: Type.Integer(),
  resultadoOperacionalCents: Type.Integer(),
  resultadoLiquidoCents: Type.Integer(),
});
export type ComparativoPonto = Static<typeof ComparativoPontoSchema>;

export const ComparativoDeltaSchema = Type.Object({
  rotulo: Type.String(),
  atualLabel: Type.String(),
  baseLabel: Type.String(),
  receitaAtualCents: Type.Integer(),
  receitaBaseCents: Type.Integer(),
  receitaDeltaCents: Type.Integer(),
  receitaDeltaPerc: Type.Union([Type.Number(), Type.Null()]),
  resultadoAtualCents: Type.Integer(),
  resultadoBaseCents: Type.Integer(),
  resultadoDeltaCents: Type.Integer(),
  resultadoDeltaPerc: Type.Union([Type.Number(), Type.Null()]),
});
export type ComparativoDelta = Static<typeof ComparativoDeltaSchema>;

export const ComparativoCfoSchema = Type.Object({
  serie: Type.Array(ComparativoPontoSchema),
  /** Mes vs mes anterior. Null se nao ha base. */
  mom: Type.Union([ComparativoDeltaSchema, Type.Null()]),
  /** Mes vs mesmo mes do ano anterior. Null se nao ha 12+ meses de serie. */
  yoy: Type.Union([ComparativoDeltaSchema, Type.Null()]),
});
export type ComparativoCfo = Static<typeof ComparativoCfoSchema>;

// ----------------------------------------------------------------------------
// QUERY + RESPONSE
// ----------------------------------------------------------------------------

export const PainelCfoQuerySchema = Type.Object({
  /** Horizonte da projecao de caixa (default 30). */
  horizonteDias: Type.Optional(Type.Integer({ minimum: 1, maximum: 365 })),
  /** Competencia do resultado/comparativo ('YYYY-MM'). Default = ultimo mes fechado. */
  competencia: Type.Optional(Type.String()),
});
export type PainelCfoQuery = Static<typeof PainelCfoQuerySchema>;

export const PainelCfoResponseSchema = Type.Object({
  geradoEm: Type.String({ format: 'date-time' }),
  periodo: Type.Object({
    dataReferencia: Type.String({ format: 'date' }),
    horizonteDias: Type.Integer(),
    competencia: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
    competenciaLabel: Type.Union([Type.String(), Type.Null()]),
  }),
  kpis: Type.Array(KpiCfoSchema),
  alertas: Type.Array(AlertaCfoSchema),
  comparativo: ComparativoCfoSchema,
  /** Contexto de qualidade dos dados que alimentam o painel. */
  saude: Type.Object({
    /** True quando ao menos uma conta principal tem ancora de saldo. */
    caixaConfiavel: Type.Boolean(),
    contasSemAncora: Type.Integer(),
    /** True quando a competencia do resultado ainda esta em fechamento. */
    mesResultadoParcial: Type.Boolean(),
  }),
  /** Notas de metodo / transparencia (ex.: por que um KPI ficou 'sem dado'). */
  notas: Type.Array(Type.String()),
});
export type PainelCfoResponse = Static<typeof PainelCfoResponseSchema>;
