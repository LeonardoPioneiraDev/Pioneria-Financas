/**
 * Nome do banco a partir do código numérico do extrato (BCOMOVTO/Globus).
 *
 * A tabela-mestre `finance.bancos` está vazia hoje, então mapeamos aqui os
 * códigos que aparecem nos extratos da Pioneira. A maioria é FEBRABAN; o código
 * 999 = Banco Alfa é interno do Globus (não-FEBRABAN), confirmado pelo cadastro
 * de contas (`banco_conta` traz "BANCO ALFA S/A" para 999).
 *
 * Quando a master `bancos` for sincronizada, trocar este mapa por um lookup.
 */
const NOMES_BANCO: Record<number, string> = {
  1: 'Banco do Brasil',
  33: 'Santander',
  70: 'BRB',
  102: 'XP Investimentos',
  104: 'Caixa',
  237: 'Bradesco',
  278: 'Banco Genial',
  341: 'Itaú',
  422: 'Safra',
  748: 'Sicredi',
  756: 'Sicoob',
  999: 'Banco Alfa',
};

/** Nome do banco; fallback "Banco <código>" para códigos não mapeados. */
export function nomeBanco(cod: number): string {
  return NOMES_BANCO[cod] ?? `Banco ${cod}`;
}
