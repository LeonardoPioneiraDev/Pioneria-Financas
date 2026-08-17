/**
 * Reembolso / ressarcimento — valor que a empresa PAGOU (vira título em Contas a
 * Pagar) e tem a RECEBER de um terceiro (ex.: multa de trânsito do motorista, avaria,
 * adiantamento). Liga um título de Contas a Pagar a um valor a receber. Ciclo:
 *   - pendente   → identificado, ainda não cobrado do devedor;
 *   - cobrado    → o devedor foi avisado / cobrança em andamento;
 *   - recebido   → o devedor pagou (baixa, opcionalmente amarrada ao crédito do extrato);
 *   - descartado → candidato marcado como "não é reembolso" (some da lista de candidatos).
 */
export const REEMBOLSO_STATUS = ['pendente', 'cobrado', 'recebido', 'descartado'] as const;
export type ReembolsoStatus = (typeof REEMBOLSO_STATUS)[number];

export const REEMBOLSO_STATUS_LABEL: Record<ReembolsoStatus, string> = {
  pendente: 'A cobrar',
  cobrado: 'Cobrado',
  recebido: 'Recebido',
  descartado: 'Descartado',
};
