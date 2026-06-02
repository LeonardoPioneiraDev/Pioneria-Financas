/**
 * Mapeamento de codigos abreviados do GLOBUS (Praxio) para labels legiveis.
 *
 * Os valores aqui sao os MAIS COMUNS observados na maioria das instalacoes.
 * Quando aparecer codigo nao mapeado, a UI mostra o codigo bruto + "(codigo)".
 *
 * Para refinar para a Pioneira: rode os SQLs em globus-codigos-discovery.sql
 * e atualize estes mapas.
 */

/** Tipo de documento (CPGDOCTO.CODTPDOC / BGM_NOTAFISCAL.CODTPDOC) */
export const TIPO_DOCUMENTO_LABEL: Record<string, string> = {
  NF: 'Nota Fiscal',
  NFE: 'Nota Fiscal Eletronica',
  NFS: 'Nota Fiscal de Servico',
  NFV: 'Nota Fiscal Venda',
  CTE: 'Conhecimento de Transporte',
  CT: 'Conhecimento de Transporte',
  DUP: 'Duplicata',
  BOL: 'Boleto',
  REC: 'Recibo',
  RC: 'Recibo',
  FIN: 'Financiamento',
  CRD: 'Credito',
  GUI: 'Guia',
  DAR: 'DARF',
  GPS: 'GPS (INSS)',
  GRF: 'GRF (FGTS)',
  GRRF: 'GRRF',
  DAS: 'DAS (Simples)',
  CHQ: 'Cheque',
  FAT: 'Fatura',
  ADT: 'Adiantamento',
  EST: 'Estorno',
  IMP: 'Imposto',
  CON: 'Contrato',
  HON: 'Honorarios',
  ENC: 'Encargos',
};

/** Modalidade de pagamento eletronico (CPGDOCTO.MODALIDADEPE) */
export const MODALIDADE_PAGAMENTO_LABEL: Record<string, string> = {
  TT: 'Transferencia entre contas (TT)',
  TED: 'TED',
  DOC: 'DOC',
  PIX: 'PIX',
  BOL: 'Boleto',
  CHQ: 'Cheque',
  DIN: 'Dinheiro',
  CTC: 'Credito em Conta Corrente',
  DEB: 'Debito Automatico',
  CAR: 'Cartao',
  ESP: 'Especie',
  COM: 'Compensacao',
  DDA: 'DDA',
  GUI: 'Guia bancaria',
  CIP: 'CIP (Sistema de Pagamentos)',
};

/** Tipo do documento de pagamento (CPGDOCTO.TIPODOCPAGTOCPG) */
export const TIPO_PAGTO_LABEL: Record<string, string> = {
  BOL: 'Boleto',
  TED: 'TED',
  DOC: 'DOC',
  PIX: 'PIX',
  CHQ: 'Cheque',
  TRA: 'Transferencia',
  TT: 'Transferencia entre contas',
  CAR: 'Carta',
  DDA: 'DDA',
  GUI: 'Guia',
};

/** Status do documento CPG (CPGDOCTO.STATUSDOCTOCPG) */
export const STATUS_DOCUMENTO_LABEL: Record<string, string> = {
  A: 'Aberto',
  F: 'Finalizado',
  C: 'Cancelado',
  L: 'Liberado',
  P: 'Pago',
};

/**
 * Helper: retorna o label se conhecido, senao retorna "CODIGO (codigo)".
 * Aceita null/undefined - retorna string vazia.
 */
export function rotular(mapa: Record<string, string>, codigo: string | null | undefined): string {
  if (!codigo) return '';
  const trimmed = codigo.trim().toUpperCase();
  const label = mapa[trimmed];
  if (label) return label;
  return `${codigo} (codigo nao mapeado)`;
}

/**
 * Versao compacta - so retorna label se conhecido, senao retorna o codigo bruto.
 * Use em colunas de tabela onde espaco e curto.
 */
export function rotularCompacto(mapa: Record<string, string>, codigo: string | null | undefined): string {
  if (!codigo) return '-';
  const trimmed = codigo.trim().toUpperCase();
  return mapa[trimmed] ?? codigo;
}
