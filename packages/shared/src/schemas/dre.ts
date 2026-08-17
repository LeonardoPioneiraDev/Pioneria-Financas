import { Type, type Static } from '@sinclair/typebox';

// ============================================================================
// DRE — Demonstracao de Resultado do Exercicio (Fase 4).
// Fonte: razao contabil do Globus (CTBSALDO, plano 1), contas de resultado
// (classe 3 despesa / 4 receita). SO folhas (sinteticos '.0000' sao rollup e
// triplicam o valor). As linhas sao montadas pela hierarquia do classificador.
// ============================================================================

export const DreLinhaSchema = Type.Object({
  /** Codigo estavel da linha (ex.: 'receita_bruta', 'resultado_operacional'). */
  codigo: Type.String(),
  titulo: Type.String(),
  /** receita | deducao | custo | subtotal. */
  tipo: Type.Union([
    Type.Literal('receita'),
    Type.Literal('deducao'),
    Type.Literal('custo'),
    Type.Literal('subtotal'),
  ]),
  /** Valor com sinal: receita/ganho positivo, custo/deducao negativo. Centavos. */
  valorCents: Type.Integer(),
  /** Mesmo valor na competencia anterior (para o comparativo). Centavos. */
  valorAnteriorCents: Type.Integer(),
  /** Acumulado no ano (jan ate a competencia). Centavos. */
  valorYtdCents: Type.Integer(),
  /** Linha de soma (Receita liquida, Resultado operacional, Resultado liquido). */
  ehSubtotal: Type.Boolean(),
  /** Prefixos de classificador que compoem a linha (para o drill-down). */
  prefixos: Type.Array(Type.String()),
});
export type DreLinha = Static<typeof DreLinhaSchema>;

export const DreResumoResponseSchema = Type.Object({
  competencia: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  competenciaLabel: Type.Union([Type.String(), Type.Null()]),
  /** Competencia anterior comparada (para o Delta das linhas). Null se nao ha. */
  competenciaAnterior: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  competenciaAnteriorLabel: Type.Union([Type.String(), Type.Null()]),
  linhas: Type.Array(DreLinhaSchema),
  /** Atalhos dos resultados-chave do mes (centavos, com sinal). */
  receitaLiquidaCents: Type.Integer(),
  resultadoOperacionalCents: Type.Integer(),
  resultadoLiquidoCents: Type.Integer(),
  /** Acumulado no ano (jan ate a competencia). */
  receitaLiquidaYtdCents: Type.Integer(),
  resultadoOperacionalYtdCents: Type.Integer(),
  resultadoLiquidoYtdCents: Type.Integer(),
  /** Rotulo do periodo YTD (ex.: '01–07/2026'). Null se nao ha. */
  ytdLabel: Type.Union([Type.String(), Type.Null()]),
  /** true quando a competencia ainda esta em fechamento (receita nao lancada). */
  mesParcial: Type.Boolean(),
  /**
   * Repasse do GDF recebido no extrato (banco_movto eh_repasse_brb) na
   * competencia. GERENCIAL — nao entra na receita contabil deste plano; serve pra
   * reconciliar o resultado operacional (a bilhetagem contabil e menor que o custo).
   */
  repasseGdfCents: Type.Integer(),
  mesesDisponiveis: Type.Array(Type.String({ format: 'date' })),
  atualizadoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  mensagem: Type.Optional(Type.String()),
});
export type DreResumoResponse = Static<typeof DreResumoResponseSchema>;

export const DreResumoQuerySchema = Type.Object({
  competencia: Type.Optional(Type.String()),
});
export type DreResumoQuery = Static<typeof DreResumoQuerySchema>;

// ----------------------------------------------------------------------------
// DETALHE DE UMA LINHA (drill-down) — as contas do razao que a compoem.
// ----------------------------------------------------------------------------

export const DreContaDetalheSchema = Type.Object({
  classificador: Type.String(),
  nomeConta: Type.Union([Type.String(), Type.Null()]),
  debitoCents: Type.Integer(),
  creditoCents: Type.Integer(),
  /** credito - debito (mesma convencao das linhas). */
  valorCents: Type.Integer(),
});
export type DreContaDetalhe = Static<typeof DreContaDetalheSchema>;

export const DreDetalheQuerySchema = Type.Object({
  /** Codigo da linha (ex.: 'pessoal', 'arrendamento', 'outros'). */
  linha: Type.String(),
  competencia: Type.Optional(Type.String()),
});
export type DreDetalheQuery = Static<typeof DreDetalheQuerySchema>;

export const DreDetalheResponseSchema = Type.Object({
  codigo: Type.String(),
  titulo: Type.String(),
  competencia: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  competenciaLabel: Type.Union([Type.String(), Type.Null()]),
  contas: Type.Array(DreContaDetalheSchema),
  totalCents: Type.Integer(),
});
export type DreDetalheResponse = Static<typeof DreDetalheResponseSchema>;

// ----------------------------------------------------------------------------
// SERIE MENSAL — resultados-chave por mes, para o grafico de evolucao.
// ----------------------------------------------------------------------------

export const DreSeriePontoSchema = Type.Object({
  competencia: Type.String({ format: 'date' }),
  competenciaLabel: Type.String(),
  receitaLiquidaCents: Type.Integer(),
  resultadoOperacionalCents: Type.Integer(),
  resultadoLiquidoCents: Type.Integer(),
});
export type DreSeriePonto = Static<typeof DreSeriePontoSchema>;

export const DreSerieQuerySchema = Type.Object({
  meses: Type.Optional(Type.Integer({ minimum: 1, maximum: 36 })),
});
export type DreSerieQuery = Static<typeof DreSerieQuerySchema>;

export const DreSerieResponseSchema = Type.Object({
  serie: Type.Array(DreSeriePontoSchema),
});
export type DreSerieResponse = Static<typeof DreSerieResponseSchema>;

export const DreSyncResponseSchema = Type.Object({
  jobId: Type.String(),
  registrosLidos: Type.Integer(),
  registrosGravados: Type.Integer(),
  duracaoMs: Type.Integer(),
  status: Type.Union([Type.Literal('ok'), Type.Literal('parcial'), Type.Literal('erro')]),
  mensagem: Type.Optional(Type.String()),
});
export type DreSyncResponse = Static<typeof DreSyncResponseSchema>;
