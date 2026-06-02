export const CONTA_PAGAR_STATUS = ['pendente', 'aprovado', 'pago', 'cancelado', 'em_aprovacao'] as const;

export type ContaPagarStatus = (typeof CONTA_PAGAR_STATUS)[number];

export const CONTA_PAGAR_STATUS_LABELS: Record<ContaPagarStatus, string> = {
  pendente: 'Pendente',
  em_aprovacao: 'Em aprovacao',
  aprovado: 'Aprovado',
  pago: 'Pago',
  cancelado: 'Cancelado',
};

/**
 * Explicacao por status — usado como tooltip (`title`) nos badges da UI.
 * Texto curto, em pt-BR, sem jargao tecnico desnecessario.
 */
export const CONTA_PAGAR_STATUS_DESCRICOES: Record<ContaPagarStatus, string> = {
  pendente: 'Recem cadastrado no Globus, aguardando analise/liberacao.',
  em_aprovacao: 'No fluxo do APROVE-ME, aguardando o aprovador.',
  aprovado: 'Liberado para pagamento; vai entrar na proxima remessa/baixa.',
  pago: 'Baixa bancaria registrada no Globus (PAGAMENTOCPG + QUITADO=S).',
  cancelado: 'Excluido ou cancelado no Globus.',
};

export const ORIGEM_DOCUMENTO_CP = ['folha', 'nf', 'guia', 'manual', 'desconhecido'] as const;
export type OrigemDocumentoCp = (typeof ORIGEM_DOCUMENTO_CP)[number];

export const ORIGEM_DOCUMENTO_CP_LABELS: Record<OrigemDocumentoCp, string> = {
  folha: 'Folha de Pagamento',
  nf: 'Nota Fiscal',
  guia: 'Guia / Imposto',
  manual: 'Lancamento Manual',
  desconhecido: 'Nao Identificada',
};
