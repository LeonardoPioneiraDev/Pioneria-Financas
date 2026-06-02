export const CONTA_RECEBER_STATUS = ['aberto', 'pago', 'cancelado', 'renegociado', 'protestado'] as const;
export type ContaReceberStatus = (typeof CONTA_RECEBER_STATUS)[number];

export const CONTA_RECEBER_STATUS_LABEL: Record<ContaReceberStatus, string> = {
  aberto: 'Em aberto',
  pago: 'Recebido',
  cancelado: 'Cancelado',
  renegociado: 'Renegociado',
  protestado: 'Protestado',
};

export const FAIXAS_AGING = ['atrasado', 'vence_hoje', 'vence_7d', 'vence_30d', 'futuro'] as const;
export type FaixaAging = (typeof FAIXAS_AGING)[number];

export const FAIXAS_AGING_LABEL: Record<FaixaAging, string> = {
  atrasado: 'Atrasado',
  vence_hoje: 'Vence hoje',
  vence_7d: 'Vence em até 7 dias',
  vence_30d: 'Vence em até 30 dias',
  futuro: 'Futuro (mais de 30 dias)',
};
