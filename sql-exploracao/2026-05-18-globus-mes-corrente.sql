-- =============================================================================
-- EXPLORAÇÃO GLOBUS — 2026-05-18 — APENAS MÊS CORRENTE
-- Empresa: 4 (Viação Pioneira) · Filial: 1
--
-- Respeita as 4 regras do projeto:
--   1. empresa=4 em toda query
--   2. SÓ MÊS CORRENTE — sem scan histórico, sem JOIN pesado
--   3. Histórico é OUTRO arquivo, manual, mês a mês
--   4. Read-only (todas as queries são SELECT)
--
-- Janela única: [primeiro_dia_mes_atual, primeiro_dia_proximo_mes)
-- =============================================================================


-- =============================================================================
-- BLOCO 1 — Volume CP do mês corrente
-- =============================================================================
SELECT /*+ NO_PARALLEL */
       COUNT(*)                                                  AS QTD_TITULOS,
       COUNT(DISTINCT D.CODIGOFORN)                              AS QTD_FORNECEDORES,
       SUM(CASE WHEN D.QUITADODOCTOCPG = 'S' THEN 1 ELSE 0 END)  AS QTD_QUITADOS
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA   = 4
  AND  D.STATUSDOCTOCPG <> 'C'
  AND  D.VENCIMENTOCPG  >= TRUNC(SYSDATE, 'MM')
  AND  D.VENCIMENTOCPG  <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1);


-- BLOCO 1c — CODTPDOC no mês corrente (responde o bug latente)
SELECT /*+ NO_PARALLEL */
       D.CODTPDOC,
       COUNT(*) AS QTD
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA   = 4
  AND  D.STATUSDOCTOCPG <> 'C'
  AND  D.VENCIMENTOCPG  >= TRUNC(SYSDATE, 'MM')
  AND  D.VENCIMENTOCPG  <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
GROUP BY D.CODTPDOC
ORDER BY QTD DESC;


-- BLOCO 1d — Origem (MODULO_INCLUSAO) no mês corrente
SELECT /*+ NO_PARALLEL */
       D.MODULO_INCLUSAO,
       COUNT(*) AS QTD
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA   = 4
  AND  D.STATUSDOCTOCPG <> 'C'
  AND  D.VENCIMENTOCPG  >= TRUNC(SYSDATE, 'MM')
  AND  D.VENCIMENTOCPG  <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
GROUP BY D.MODULO_INCLUSAO
ORDER BY QTD DESC;


-- =============================================================================
-- BLOCO 2 — Volume CR do mês corrente
-- =============================================================================
SELECT /*+ NO_PARALLEL */
       COUNT(*)                                                  AS QTD_TITULOS,
       COUNT(DISTINCT D.CODCLI)                                  AS QTD_CLIENTES,
       SUM(CASE WHEN D.QUITADODOCTOCRC = 'S' THEN 1 ELSE 0 END)  AS QTD_QUITADOS,
       SUM(CASE WHEN D.STATUSDOCTOCRC = 'C' THEN 1 ELSE 0 END)   AS QTD_CANCELADOS
FROM   CRCDOCTO D
WHERE  D.CODIGOEMPRESA   = 4
  AND  D.VENCIMENTOCRC  >= TRUNC(SYSDATE, 'MM')
  AND  D.VENCIMENTOCRC  <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1);


-- BLOCO 2c — Itens por título CR no mês corrente
SELECT /*+ NO_PARALLEL */
       MIN(QTD_ITENS)            AS MIN_ITENS,
       ROUND(AVG(QTD_ITENS), 2)  AS MED_ITENS,
       MAX(QTD_ITENS)            AS MAX_ITENS,
       COUNT(*)                  AS TITULOS_AMOSTRA
FROM (
  SELECT D.CODDOCTOCRC, COUNT(I.CODITEMDOCCRC) AS QTD_ITENS
  FROM   CRCDOCTO D
  LEFT JOIN CRCITDOC I ON I.CODDOCTOCRC = D.CODDOCTOCRC
  WHERE  D.CODIGOEMPRESA   = 4
    AND  D.VENCIMENTOCRC  >= TRUNC(SYSDATE, 'MM')
    AND  D.VENCIMENTOCRC  <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
  GROUP BY D.CODDOCTOCRC
);


-- =============================================================================
-- BLOCO 3 — FLP mês corrente (normalizado pra convenção Praxio)
-- Range cobre [último dia mês anterior, primeiro dia mês seguinte) — ver adapter
-- =============================================================================
SELECT /*+ NO_PARALLEL */
       FE.TIPOFOLHA,
       COUNT(*)                       AS QTD_LANCAMENTOS,
       COUNT(DISTINCT FE.CODINTFUNC)  AS QTD_FUNCIONARIOS,
       MIN(FE.COMPETFICHA)            AS DT_RAW_MIN,
       MAX(FE.COMPETFICHA)            AS DT_RAW_MAX
FROM   FLP_FICHAEVENTOS FE
JOIN   VW_FUNCIONARIOS F ON F.CODINTFUNC = FE.CODINTFUNC
WHERE  F.CODIGOEMPRESA = 4
  AND  F.CODIGOFL      = 1
  AND  FE.COMPETFICHA >= TRUNC(SYSDATE, 'MM') - 1     -- último dia mês anterior
  AND  FE.COMPETFICHA <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
GROUP BY FE.TIPOFOLHA
ORDER BY FE.TIPOFOLHA;


-- =============================================================================
-- BLOCO 4 — NF emitida pela Pioneira no mês corrente
-- =============================================================================
SELECT /*+ NO_PARALLEL */
       COUNT(*) AS QTD_NF
FROM   BGM_NOTAFISCAL R
WHERE  R.CODIGOEMPRESA = 4
  AND  R.STATUSNF      = 'F'
  AND  R.CODTPDOC      = 'NF'
  AND  R.DATAEMISSAONF >= TRUNC(SYSDATE, 'MM')
  AND  R.DATAEMISSAONF <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1);


-- BLOCO 4b — Itens médios por NF no mês corrente
SELECT /*+ NO_PARALLEL */
       MIN(QTD) AS MIN_ITENS,
       ROUND(AVG(QTD), 2) AS MED_ITENS,
       MAX(QTD) AS MAX_ITENS,
       COUNT(*) AS NFS_AMOSTRA
FROM (
  SELECT R.CODINTNF, COUNT(I.CODINTNF) AS QTD
  FROM   BGM_NOTAFISCAL R
  LEFT JOIN EST_ITENSNF I ON I.CODINTNF = R.CODINTNF
  WHERE  R.CODIGOEMPRESA = 4
    AND  R.STATUSNF      = 'F'
    AND  R.CODTPDOC      = 'NF'
    AND  R.DATAEMISSAONF >= TRUNC(SYSDATE, 'MM')
    AND  R.DATAEMISSAONF <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
  GROUP BY R.CODINTNF
);


-- =============================================================================
-- BLOCO 0 — Owner do schema (rápido, sem dado financeiro)
-- =============================================================================
SELECT /*+ NO_PARALLEL */ DISTINCT OWNER
FROM   ALL_TABLES
WHERE  TABLE_NAME IN ('CPGDOCTO', 'CRCDOCTO', 'BGM_NOTAFISCAL', 'FLP_FICHAEVENTOS')
ORDER BY OWNER;


-- =============================================================================
-- BLOCO 5 — Inventário (rápido, só metadado, com limite)
-- Substitua :OWNER pelo retornado no BLOCO 0
-- =============================================================================
SELECT * FROM (
  SELECT /*+ NO_PARALLEL */ TABLE_NAME, NUM_ROWS
  FROM   ALL_TABLES
  WHERE  OWNER = :OWNER
    AND  (TABLE_NAME LIKE 'CPG_%'
       OR TABLE_NAME LIKE 'CRC_%'
       OR TABLE_NAME LIKE 'CTR_%'
       OR TABLE_NAME LIKE 'BCO%'
       OR TABLE_NAME LIKE 'BGM_FORN%')
  ORDER BY TABLE_NAME
) WHERE ROWNUM <= 100;


-- BLOCO 6a — Schema do BGM_FORNECEDOR (metadado, rápido)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = :OWNER AND TABLE_NAME = 'BGM_FORNECEDOR'
ORDER BY COLUMN_ID;
