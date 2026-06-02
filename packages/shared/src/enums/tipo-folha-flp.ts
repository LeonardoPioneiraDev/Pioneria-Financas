/**
 * Códigos de TIPOFOLHA do Globus/Praxio (FLP_FICHAEVENTOS.TIPOFOLHA).
 * Valores a confirmar com a equipe da Pioneira — defaults são suposições baseadas
 * em instalações Praxio típicas.
 */
export const TIPO_FOLHA_FLP = [1, 2, 3, 4, 5] as const;
export type TipoFolhaFlp = (typeof TIPO_FOLHA_FLP)[number];

export const TIPO_FOLHA_FLP_LABEL: Record<number, string> = {
  1: 'Mensal',
  2: 'Adiantamento',
  3: '13º Salário',
  4: 'Férias',
  5: 'Rescisão',
};
