-- =====================================================================
-- DRE — exploração rodada 2. Resolve: (A) o modelo de DRE cadastrado e o
-- NROPLANO oficial; (B) as 6 linhas da estrutura; (C) se há múltiplos planos
-- inflando os totais e qual plano tem os números reais. Globus, empresa 4.
-- =====================================================================


-- (A) O modelo de DRE cadastrado (1 linha). NROPLANO = o plano oficial da DRE.
SELECT * FROM CTBCDDRE;


-- (B) As 6 linhas do modelo — estrutura oficial (mínima) da DRE: texto, faixa de
--     contas (CONTA_INICIAL..CONTA_FINAL), operação, sinal e acumulador.
SELECT NUMERO, ITEM, OPERACAO, SINAL, EXIBE_LINHA, SINAL_EXIBICAO,
       TEXTO, CONTA_INICIAL, CONTA_FINAL, ACUMULADOR, ACM_AUXILIAR
  FROM CTBITDRE
 ORDER BY NUMERO, ITEM;


-- (C) Resultado (classe 3 e 4) POR PLANO em 202605 — mostra se há múltiplos
--     planos (societário/fiscal/gerencial) inflando, e qual tem o número real.
SELECT S.NROPLANO,
       SUBSTR(C.CLASSIFICADOR, 1, 1)   AS classe,
       COUNT(DISTINCT C.CLASSIFICADOR) AS contas,
       ROUND(SUM(S.VLDEBITOSALDO), 2)  AS debito,
       ROUND(SUM(S.VLCREDITOSALDO), 2) AS credito
  FROM CTBSALDO S
  JOIN CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
 WHERE S.CODIGOEMPRESA = 4
   AND S.PERIODOSALDO = '202605'
   AND REGEXP_LIKE(C.CLASSIFICADOR, '^[34]')
 GROUP BY S.NROPLANO, SUBSTR(C.CLASSIFICADOR, 1, 1)
 ORDER BY S.NROPLANO, classe;
