/**
 * Regra ÚNICA de expansão de filtro de período por data.
 *
 * Toda query por período neste projeto usa intervalo semi-aberto internamente
 * — `coluna >= dtIni AND coluna < dtFim` — porque `dtFim` é uma coluna `date`
 * (sem hora): comparar com `<=` perderia registros com timestamp no meio do
 * dia. O `dtFim` que ENTRA aqui é sempre a última data que o usuário quer
 * INCLUÍDA ("Vencimento até 03/08" = quero ver o dia 03 inteiro) — por isso
 * esta função soma +1 dia a QUALQUER `fim` informado, convertendo pra
 * semi-aberto antes do WHERE. Nunca comparar `coluna < fim` direto com o
 * valor cru do filtro.
 *
 * Até 03/08/2026 essa expansão só rodava quando `ini === fim` (o caso "0
 * dias" vira range vazio, achado nesse dia). Ranges de vários dias
 * ("01/08 a 03/08") ficavam sem o +1 e perdiam silenciosamente o último dia
 * inteiro — bug real, achado em 03/08/2026 comparando com o Globus: um
 * auditor via título vencendo 03/08 sumir da lista só por ter digitado
 * "até 03/08" em vez de "até 04/08". Generalizado aqui pra cobrir os dois
 * casos com uma regra só.
 *
 * Essa função existe porque esse ajuste foi implementado ad hoc, direto no
 * `contas-pagar.service.ts::aplicarFiltros`, e SÓ ali — não em `conferencia()`
 * nem em `sincronizar()`, escritos depois e reimplementando o range à mão sem
 * reusar a correção. `reembolsos.service.ts` tinha o MESMO bug, reimplementado
 * outra vez, de novo sem o ajuste.
 *
 * Regra: TODA query filtrando por período de data neste módulo (e em
 * qualquer outro que compartilhe a mesma tabela/semântica) passa `dtIni`/
 * `dtFim` por AQUI antes de usar em `WHERE coluna >= :dtIni AND coluna <
 * :dtFim`. Nunca reimplementar o ajuste no ponto de uso. Chamadores que
 * constroem `dtFim` programaticamente (não vindo de um campo "até" digitado
 * pelo usuário) devem passar a ÚLTIMA data que querem incluída, nunca o
 * primeiro dia seguinte — esta função já faz essa conversão.
 */
export function expandirSeMesmaData(ini?: string, fim?: string): { ini?: string; fim?: string } {
  if (!fim) return { ini, fim };
  const d = new Date(`${fim}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return { ini, fim: d.toISOString().slice(0, 10) };
}
