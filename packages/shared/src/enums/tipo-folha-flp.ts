/**
 * Códigos de TIPOFOLHA do Globus/Praxio (FLP_FICHAEVENTOS.TIPOFOLHA).
 *
 * Rótulos VALIDADOS com dados reais de 2025 (empresa 4, filiais 1,5,6,17,19 —
 * ver sql-exploracao/2026-07-06-folha-ferias-13-provisao.sql). As suposições
 * antigas estavam erradas: 5 era "Rescisão" (é 13º), 3 era "13º" (é rescisão).
 *
 * IMPORTANTE — 13º: os tipos 5 e 35 são o MESMO 13º em duplicidade (35 = cálculo
 * paralelo/2ª via do Praxio, valores idênticos ao 5). Ao medir 13º, usar SÓ o 5.
 * Férias NÃO tem folha própria (tipo 4 não aparece nos dados) — é paga dentro da
 * Mensal (tipo 1) o ano todo.
 */
export const TIPO_FOLHA_FLP = [1, 2, 3, 4, 5, 35] as const;
export type TipoFolhaFlp = (typeof TIPO_FOLHA_FLP)[number];

export const TIPO_FOLHA_FLP_LABEL: Record<number, string> = {
  1: 'Mensal',
  2: 'Adiantamento',
  3: 'Rescisão',
  4: 'Férias',
  5: '13º Salário',
  35: '13º Salário (cálculo paralelo)',
};

/** Tipo de folha do 13º a usar em medições (o 35 é duplicata do 5 — não somar). */
export const TIPO_FOLHA_13O = 5;
/** Tipo de folha duplicado do 13º — excluir de qualquer soma. */
export const TIPO_FOLHA_13O_DUPLICADO = 35;
