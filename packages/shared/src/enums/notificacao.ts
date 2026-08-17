/**
 * Eventos do ciclo de conferência que geram notificação (sininho).
 * Cada evento tem destinatários fixos — ver `notificacoes.service.ts`.
 */
export const NOTIFICACAO_TIPOS = [
  /** Auditor validou uma funcionalidade. */
  'validacao_registrada',
  /** Auditor NÃO validou e apontou o problema. */
  'ressalva_registrada',
  /** Admin respondeu a uma ressalva (o que foi corrigido). */
  'ressalva_respondida',
  /** CFO deu o aval de ciência. */
  'aval_registrado',
  /** CFO devolveu a funcionalidade com ressalva. */
  'aval_devolvido',
] as const;
export type NotificacaoTipo = (typeof NOTIFICACAO_TIPOS)[number];

export const NOTIFICACAO_TIPO_LABELS: Record<NotificacaoTipo, string> = {
  validacao_registrada: 'Validação',
  ressalva_registrada: 'Ressalva',
  ressalva_respondida: 'Resposta à ressalva',
  aval_registrado: 'Aval do CFO',
  aval_devolvido: 'Devolvida pelo CFO',
};

/** Cor/severidade para o front pintar o item na lista. */
export const NOTIFICACAO_TOM: Record<NotificacaoTipo, 'sucesso' | 'alerta' | 'info'> = {
  validacao_registrada: 'sucesso',
  ressalva_registrada: 'alerta',
  ressalva_respondida: 'info',
  aval_registrado: 'sucesso',
  aval_devolvido: 'alerta',
};
