import { Type, type Static } from '@sinclair/typebox';

// ============================================================================
// SYNC AGENDAMENTO — configuracao do sincronismo automatico por recurso.
// ============================================================================

export const SyncFrequenciaSchema = Type.Union([Type.Literal('intervalo'), Type.Literal('diario')]);
export type SyncFrequencia = Static<typeof SyncFrequenciaSchema>;

export const SyncAgendamentoItemSchema = Type.Object({
  recurso: Type.String(),
  label: Type.String(),
  habilitado: Type.Boolean(),
  frequencia: SyncFrequenciaSchema,
  /** Minutos entre execucoes (frequencia='intervalo'). */
  intervaloMin: Type.Union([Type.Integer(), Type.Null()]),
  /** Hora do dia 0-23 (frequencia='diario', Brasilia). */
  horaDia: Type.Union([Type.Integer(), Type.Null()]),
  minutoDia: Type.Integer(),
  ultimoRunEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  ultimoStatus: Type.Union([Type.String(), Type.Null()]),
  ultimaMensagem: Type.Union([Type.String(), Type.Null()]),
  proximoRunEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
});
export type SyncAgendamentoItem = Static<typeof SyncAgendamentoItemSchema>;

export const SyncAgendamentoListaResponseSchema = Type.Object({
  itens: Type.Array(SyncAgendamentoItemSchema),
});
export type SyncAgendamentoListaResponse = Static<typeof SyncAgendamentoListaResponseSchema>;

export const SyncAgendamentoUpdateSchema = Type.Object({
  habilitado: Type.Boolean(),
  frequencia: SyncFrequenciaSchema,
  intervaloMin: Type.Optional(Type.Union([Type.Integer({ minimum: 5, maximum: 10080 }), Type.Null()])),
  horaDia: Type.Optional(Type.Union([Type.Integer({ minimum: 0, maximum: 23 }), Type.Null()])),
  minutoDia: Type.Optional(Type.Integer({ minimum: 0, maximum: 59 })),
});
export type SyncAgendamentoUpdate = Static<typeof SyncAgendamentoUpdateSchema>;

export const SyncExecutarResponseSchema = Type.Object({
  recurso: Type.String(),
  status: Type.String(),
  mensagem: Type.Optional(Type.String()),
});
export type SyncExecutarResponse = Static<typeof SyncExecutarResponseSchema>;
