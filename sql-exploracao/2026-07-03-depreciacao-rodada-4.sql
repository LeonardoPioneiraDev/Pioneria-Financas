-- =============================================================================
-- EXPLORACAO GLOBUS - 2026-07-03 - DEPRECIACAO - RODADA 4 (freshness do ATFITEM)
-- Empresa: 4 (Viacao Pioneira)
--
-- CONTEXTO: ATFITEM (cadastro de bens) tem 7.686 registros com AQUISVALOR,
-- TAXADEPREC (20% = 5 anos), INICIODEPREC e DATABAIXA. Mas a amostra eram bens
-- 1996-2003 ja baixados. ESTA PERGUNTA DECIDE O ESCOPO:
--   O ATFITEM esta ATUALIZADO (bens ativos recentes, valor reconcilia com a
--   contabilidade)? -> se sim, "por bem" (opcao B) e viavel. Se nao, opcao A (classe).
--
-- SEGURANCA: 3 agregados leves na ATFITEM (filtrada empresa 4). NO_PARALLEL.
-- =============================================================================


-- BLOCO N1 - O cadastro esta vivo? Datas min/max + ativos x baixados.
-- Se MAX(AQUISDATA)/MAX(INICIODEPREC) forem recentes (2024-2026) e houver muitos
-- ativos (DATABAIXA IS NULL), o ATFITEM esta em uso. Se pararem ~2010, esta morto.
SELECT /*+ NO_PARALLEL */
       COUNT(*)                                          AS TOTAL_BENS,
       COUNT(CASE WHEN DATABAIXA IS NULL THEN 1 END)     AS BENS_ATIVOS,
       COUNT(CASE WHEN DATABAIXA IS NOT NULL THEN 1 END) AS BENS_BAIXADOS,
       MIN(AQUISDATA)     AS AQUIS_MIN,
       MAX(AQUISDATA)     AS AQUIS_MAX,
       MIN(INICIODEPREC)  AS INICIODEPREC_MIN,
       MAX(INICIODEPREC)  AS INICIODEPREC_MAX,
       MAX(DATABAIXA)     AS BAIXA_MAX
FROM   ATFITEM
WHERE  CODIGOEMPRESA = 4;


-- BLOCO N2 - Taxas de depreciacao usadas (vida util por tipo de bem).
-- 20% = 5 anos, 10% = 10 anos, 25% = 4 anos, etc. So os bens ATIVOS.
SELECT /*+ NO_PARALLEL */
       TAXADEPREC,
       COUNT(*)              AS QTD_ATIVOS,
       ROUND(SUM(AQUISVALOR), 2) AS VLR_AQUISICAO
FROM   ATFITEM
WHERE  CODIGOEMPRESA = 4
  AND  DATABAIXA IS NULL
GROUP BY TAXADEPREC
ORDER BY QTD_ATIVOS DESC;


-- BLOCO N3 - RECONCILIACAO: soma do valor de aquisicao dos bens ATIVOS por conta
-- contabil (ATFITEM.CONTA) x imobilizado bruto da contabilidade (R$ 109,7M em
-- 1.3.02.01.*). Se baterem, o ATFITEM E a fonte viva -> opcao B liberada.
-- Se a soma for muito menor, o cadastro esta desatualizado -> opcao A (classe).
SELECT /*+ NO_PARALLEL */
       ATF.CONTA,
       COUNT(*)                    AS QTD_BENS,
       ROUND(SUM(ATF.AQUISVALOR), 2) AS VLR_AQUISICAO
FROM   ATFITEM ATF
WHERE  ATF.CODIGOEMPRESA = 4
  AND  ATF.DATABAIXA IS NULL
GROUP BY ATF.CONTA
ORDER BY VLR_AQUISICAO DESC;

-- BLOCO N4 - Total geral dos bens ativos (numero unico pra comparar com 109,7M).
SELECT /*+ NO_PARALLEL */
       COUNT(*)                    AS QTD_BENS_ATIVOS,
       ROUND(SUM(AQUISVALOR), 2)   AS VLR_AQUISICAO_TOTAL
FROM   ATFITEM
WHERE  CODIGOEMPRESA = 4
  AND  DATABAIXA IS NULL;

-- =============================================================================
-- FIM. N1 (datas) + N4 (total reconcilia com 109,7M?) decidem A x B. Depois disso
-- nao ha mais SQL de exploracao — parte-se pro modelo de dados e codigo.
-- =============================================================================
