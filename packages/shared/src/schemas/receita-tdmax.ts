import { Type, type Static } from '@sinclair/typebox';

// ============================================================================
// RECEITA TD MAX — bilhetagem a tarifa tecnica (API horarios) + reconciliacao
// com o repasse GDF que cai no banco. NAO e caixa novo (ver receita_tdmax entity).
// ============================================================================

export const ReceitaTdmaxSyncQuerySchema = Type.Object({
  dataInicio: Type.Optional(Type.String({ format: 'date' })),
  dataFim: Type.Optional(Type.String({ format: 'date' })),
});
export type ReceitaTdmaxSyncQuery = Static<typeof ReceitaTdmaxSyncQuerySchema>;

export const ReceitaTdmaxSyncResponseSchema = Type.Object({
  jobId: Type.String(),
  diasLidos: Type.Integer(),
  diasGravados: Type.Integer(),
  periodo: Type.Object({ dataInicio: Type.String(), dataFim: Type.String() }),
  duracaoMs: Type.Integer(),
  status: Type.Union([Type.Literal('ok'), Type.Literal('erro')]),
  mensagem: Type.Optional(Type.String()),
});
export type ReceitaTdmaxSyncResponse = Static<typeof ReceitaTdmaxSyncResponseSchema>;

// ---- Reconciliacao gerado (TD Max) x repassado (banco) ----

export const ReconciliacaoTdmaxQuerySchema = Type.Object({
  dataInicio: Type.String({ format: 'date' }),
  dataFim: Type.String({ format: 'date' }),
});
export type ReconciliacaoTdmaxQuery = Static<typeof ReconciliacaoTdmaxQuerySchema>;

export const ReconciliacaoTdmaxDiaSchema = Type.Object({
  data: Type.String({ format: 'date' }),
  /** Receita GERADA no validador (tarifa tecnica) — o que o GDF vai pagar. */
  geradoCents: Type.Integer(),
  /** Repasse GDF que CAIU no banco nesse dia (eh_repasse_brb). */
  repasseBancoCents: Type.Integer(),
  /** Acumulado gerado - acumulado repassado ate o dia (~o que ainda falta receber). */
  aReceberAcumuladoCents: Type.Integer(),
});
export type ReconciliacaoTdmaxDia = Static<typeof ReconciliacaoTdmaxDiaSchema>;

export const ReconciliacaoTdmaxResponseSchema = Type.Object({
  periodo: Type.Object({ dataInicio: Type.String(), dataFim: Type.String() }),
  serie: Type.Array(ReconciliacaoTdmaxDiaSchema),
  totalGeradoCents: Type.Integer(),
  totalRepasseCents: Type.Integer(),
  /** gerado - repassado no periodo (NOMINAL). Majoritariamente estrutural (nominal x efetivo), NAO e "a receber". */
  diferencaCents: Type.Integer(),
  /**
   * Fator de realizacao = repasse / gerado no periodo (~0,64). E o quanto do valor
   * NOMINAL (tarifa tecnica cheia) o GDF efetivamente paga. Recalibrar mensalmente.
   */
  fatorRealizacao: Type.Number(),
  /** Repasse EFETIVO estimado = gerado x fator (o que de fato deveria virar caixa). */
  repasseEfetivoEstimadoCents: Type.Integer(),
  /** Lag medio observado entre gerar e receber (dias), estimado. Null se indeterminado. */
  lagMedioDias: Type.Union([Type.Number(), Type.Null()]),
  temDadoGerado: Type.Boolean(),
  temDadoRepasse: Type.Boolean(),
  atualizadoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
});
export type ReconciliacaoTdmaxResponse = Static<typeof ReconciliacaoTdmaxResponseSchema>;
