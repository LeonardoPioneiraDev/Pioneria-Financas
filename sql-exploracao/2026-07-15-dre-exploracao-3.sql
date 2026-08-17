-- =====================================================================
-- DRE — exploração rodada 3. Esqueleto REAL das linhas: agrega as contas-folha
-- do CTBSALDO por prefixo de 3 níveis (ex.: 3.1.02, 4.1.01), no plano oficial
-- (NROPLANO=1), mostrando débito x crédito. Revela os grupos de resultado E as
-- contas de apuração/transferência que inflam os totais. Empresa 4, 202605.
-- =====================================================================

WITH base AS (
  SELECT C.CLASSIFICADOR                                              AS classificador,
         REGEXP_SUBSTR(C.CLASSIFICADOR, '^([0-9]+\.){0,2}[0-9]+')     AS grupo3,
         S.VLDEBITOSALDO                                             AS deb,
         S.VLCREDITOSALDO                                            AS cred
    FROM CTBSALDO S
    JOIN CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
   WHERE S.CODIGOEMPRESA = 4
     AND S.NROPLANO = 1
     AND S.PERIODOSALDO = '202605'
     AND REGEXP_LIKE(C.CLASSIFICADOR, '^[34]')
)
SELECT b.grupo3,
       (SELECT MIN(CC.NOMECONTA) FROM CTBCONTA CC
         WHERE CC.NROPLANO = 1 AND CC.CLASSIFICADOR = b.grupo3) AS nome_grupo,
       COUNT(DISTINCT b.classificador)  AS folhas,
       ROUND(SUM(b.deb), 2)             AS debito,
       ROUND(SUM(b.cred), 2)            AS credito,
       ROUND(SUM(b.deb - b.cred), 2)    AS saldo_devedor_liq
  FROM base b
 GROUP BY b.grupo3
 ORDER BY b.grupo3;
