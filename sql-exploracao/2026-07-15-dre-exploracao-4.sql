-- =====================================================================
-- DRE — exploração rodada 4 (final): NOMES. Dump das contas-folha de resultado
-- (classe 3/4) com movimento em 202605, plano 1, empresa 4, com nome e valor.
-- É o que falta pra desenhar as linhas da DRE e marcar as contas de apuração.
-- Ordena por classificador (a hierarquia). ~150-200 linhas — cola tudo.
-- =====================================================================

SELECT C.CLASSIFICADOR,
       C.NOMECONTA,
       ROUND(SUM(S.VLDEBITOSALDO), 2)  AS debito,
       ROUND(SUM(S.VLCREDITOSALDO), 2) AS credito,
       ROUND(SUM(S.VLDEBITOSALDO - S.VLCREDITOSALDO), 2) AS saldo_devedor_liq
  FROM CTBSALDO S
  JOIN CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
 WHERE S.CODIGOEMPRESA = 4
   AND S.NROPLANO = 1
   AND S.PERIODOSALDO = '202605'
   AND REGEXP_LIKE(C.CLASSIFICADOR, '^[34]')
   AND (S.VLDEBITOSALDO <> 0 OR S.VLCREDITOSALDO <> 0)
 GROUP BY C.CLASSIFICADOR, C.NOMECONTA
 ORDER BY C.CLASSIFICADOR;
