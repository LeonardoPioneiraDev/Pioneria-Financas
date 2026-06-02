/**
 * Utilitarios para montar fragmentos SQL com seguranca.
 *
 * Quando o oracledb (ou pg) nao aceita bind parametrizado de IN-list, e
 * preciso interpolar valores. Estes helpers garantem que SO inteiros validos
 * (sem zero, sem negativos quando indicado) entrem no SQL — bloqueia injecao.
 */

/**
 * Constroi uma clausula `IN (...)` para inteiros positivos.
 *
 * Uso tipico em queries Oracle que precisam filtrar por uma lista de codigos
 * vinda do environment (filiais, garagens, etc.) sem suporte direto de array
 * bind no driver.
 *
 * @throws Error se a lista for vazia ou se algum valor nao for inteiro positivo.
 *
 * @example
 * const sql = `... WHERE F.CODIGOFL IN (${inClauseInteirosPositivos([1,5,6,17,19])})`;
 * // resultado: "... WHERE F.CODIGOFL IN (1, 5, 6, 17, 19)"
 */
export function inClauseInteirosPositivos(valores: readonly number[]): string {
  if (valores.length === 0) {
    throw new Error('inClauseInteirosPositivos: lista vazia (esperado pelo menos 1 valor)');
  }
  const limpos = valores.map((v, idx) => {
    if (!Number.isInteger(v) || v <= 0) {
      throw new Error(`inClauseInteirosPositivos: valor invalido na posicao ${idx}: ${v} (esperado inteiro positivo)`);
    }
    return v;
  });
  return limpos.join(', ');
}
