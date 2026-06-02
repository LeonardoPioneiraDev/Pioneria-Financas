-- =============================================================================
-- EXPLORAÇÃO GLOBUS — 2026-05-18 — VERSÃO LEVE
-- Empresa: 4 (Viação Pioneira) · Filial: 1
--
-- DIFERENÇAS pra v1:
--   - Janela de data SEMPRE obrigatória (default 3 meses) — nada de scan total
--   - Sem subquery correlacionada (N+1) — uso GROUP BY com JOIN
--   - Hint /*+ NO_PARALLEL */ pra não consumir CPU compartilhada do Globus
--   - Estatística "linhas por título" só em amostra pequena (3 meses)
--   - ROWNUM <= N nos inventários
--
-- RECOMENDADO: rodar fora do horário de fechamento da operação (manhã cedo
-- ou pós-18h), bloco por bloco, esperando cada um terminar antes do próximo.
-- =============================================================================


-- =============================================================================
-- BLOCO 0 — Owner do schema (rápido, vai em segundos)
-- =============================================================================
SELECT /*+ NO_PARALLEL */ DISTINCT OWNER
FROM   ALL_TABLES
WHERE  TABLE_NAME IN ('CPGDOCTO', 'CRCDOCTO', 'BGM_NOTAFISCAL', 'FLP_FICHAEVENTOS')
ORDER BY OWNER;


-- =============================================================================
-- BLOCO 1 — Volume CP Pioneira — só ÚLTIMOS 6 MESES
-- (se rodar rápido, depois aumenta pra 12, 24)
-- =============================================================================
SELECT /*+ NO_PARALLEL */
       TRUNC(D.VENCIMENTOCPG, 'MM')                              AS MES_VENCIMENTO,
       COUNT(*)                                                  AS QTD_TITULOS,
       COUNT(DISTINCT D.CODIGOFORN)                              AS QTD_FORNECEDORES,
       SUM(CASE WHEN D.QUITADODOCTOCPG = 'S' THEN 1 ELSE 0 END)  AS QTD_QUITADOS
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA   = 4
  AND  D.STATUSDOCTOCPG <> 'C'
  AND  D.VENCIMENTOCPG  >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -6)
  AND  D.VENCIMENTOCPG  <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
GROUP BY TRUNC(D.VENCIMENTOCPG, 'MM')
ORDER BY MES_VENCIMENTO DESC;


-- BLOCO 1c — Distribuição por CODTPDOC nos últimos 6 meses (não 12)
SELECT /*+ NO_PARALLEL */
       D.CODTPDOC,
       COUNT(*)                AS QTD
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA   = 4
  AND  D.STATUSDOCTOCPG <> 'C'
  AND  D.VENCIMENTOCPG  >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -6)
  AND  D.VENCIMENTOCPG  <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
GROUP BY D.CODTPDOC
ORDER BY QTD DESC;


-- BLOCO 1d — Origem (MODULO_INCLUSAO) últimos 3 meses
SELECT /*+ NO_PARALLEL */
       D.MODULO_INCLUSAO,
       COUNT(*)              AS QTD
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA   = 4
  AND  D.STATUSDOCTOCPG <> 'C'
  AND  D.VENCIMENTOCPG  >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -3)
  AND  D.VENCIMENTOCPG  <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
GROUP BY D.MODULO_INCLUSAO
ORDER BY QTD DESC;


-- BLOCO 1e — CP por ENTRADA (não vencimento) — fluxo real de novos lançamentos
SELECT /*+ NO_PARALLEL */
       TRUNC(D.ENTRADACPG, 'MM')   AS MES_ENTRADA,
       COUNT(*)                    AS QTD_INSERIDOS_NO_MES
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA = 4
  AND  D.STATUSDOCTOCPG <> 'C'
  AND  D.ENTRADACPG >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -6)
  AND  D.ENTRADACPG <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
GROUP BY TRUNC(D.ENTRADACPG, 'MM')
ORDER BY MES_ENTRADA DESC;


-- =============================================================================
-- BLOCO 2 — Volume CR Pioneira — últimos 6 meses
-- =============================================================================
SELECT /*+ NO_PARALLEL */
       TRUNC(D.VENCIMENTOCRC, 'MM')                              AS MES_VENCIMENTO,
       COUNT(*)                                                  AS QTD_TITULOS,
       COUNT(DISTINCT D.CODCLI)                                  AS QTD_CLIENTES,
       SUM(CASE WHEN D.QUITADODOCTOCRC = 'S' THEN 1 ELSE 0 END)  AS QTD_QUITADOS,
       SUM(CASE WHEN D.STATUSDOCTOCRC = 'C' THEN 1 ELSE 0 END)   AS QTD_CANCELADOS
FROM   CRCDOCTO D
WHERE  D.CODIGOEMPRESA   = 4
  AND  D.VENCIMENTOCRC  >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -6)
  AND  D.VENCIMENTOCRC  <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
GROUP BY TRUNC(D.VENCIMENTOCRC, 'MM')
ORDER BY MES_VENCIMENTO DESC;


-- BLOCO 2c CORRIGIDO — itens por título via GROUP BY (não subquery)
-- Só nos últimos 3 meses pra ser rápido
SELECT /*+ NO_PARALLEL */
       MIN(QTD_ITENS) AS MIN_ITENS,
       ROUND(AVG(QTD_ITENS), 2) AS MED_ITENS,
       MAX(QTD_ITENS) AS MAX_ITENS,
       COUNT(*)       AS TITULOS_AMOSTRA
FROM (
  SELECT D.CODDOCTOCRC, COUNT(I.CODITEMDOCCRC) AS QTD_ITENS
  FROM   CRCDOCTO D
  LEFT JOIN CRCITDOC I ON I.CODDOCTOCRC = D.CODDOCTOCRC
  WHERE  D.CODIGOEMPRESA   = 4
    AND  D.VENCIMENTOCRC  >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -3)
    AND  D.VENCIMENTOCRC  <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
  GROUP BY D.CODDOCTOCRC
);


-- BLOCO 2d — CR por EMISSÃO últimos 6 meses
SELECT /*+ NO_PARALLEL */
       TRUNC(D.EMISSAOCRC, 'MM')   AS MES_EMISSAO,
       COUNT(*)                    AS QTD_EMITIDOS_NO_MES
FROM   CRCDOCTO D
WHERE  D.CODIGOEMPRESA = 4
  AND  D.EMISSAOCRC >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -6)
  AND  D.EMISSAOCRC <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
GROUP BY TRUNC(D.EMISSAOCRC, 'MM')
ORDER BY MES_EMISSAO DESC;


-- =============================================================================
-- BLOCO 3 CORRIGIDO — FLP Pioneira últimos 6 meses com normalização Praxio
-- Se COMPETFICHA cai no dia >= 28, considera folha do mês seguinte
-- =============================================================================
WITH FICHA_NORM AS (
  SELECT /*+ NO_PARALLEL */
         FE.CODINTFUNC,
         FE.TIPOFOLHA,
         CASE
           WHEN TO_NUMBER(TO_CHAR(FE.COMPETFICHA, 'DD')) >= 28
             THEN TRUNC(ADD_MONTHS(FE.COMPETFICHA, 1), 'MM')
           ELSE TRUNC(FE.COMPETFICHA, 'MM')
         END AS MES_FOLHA,
         FE.COMPETFICHA AS COMPETFICHA_RAW
  FROM   FLP_FICHAEVENTOS FE
  JOIN   VW_FUNCIONARIOS F ON F.CODINTFUNC = FE.CODINTFUNC
  WHERE  F.CODIGOEMPRESA = 4
    AND  F.CODIGOFL      = 1
    AND  FE.COMPETFICHA >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -6)
    AND  FE.COMPETFICHA <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
)
SELECT MES_FOLHA,
       TIPOFOLHA,
       COUNT(*)                       AS QTD_LANCAMENTOS,
       COUNT(DISTINCT CODINTFUNC)     AS QTD_FUNCIONARIOS,
       MIN(COMPETFICHA_RAW)           AS DT_RAW_MIN,
       MAX(COMPETFICHA_RAW)           AS DT_RAW_MAX
FROM   FICHA_NORM
GROUP BY MES_FOLHA, TIPOFOLHA
ORDER BY MES_FOLHA DESC, TIPOFOLHA;


-- =============================================================================
-- BLOCO 4 — Notas Fiscais Pioneira últimos 6 meses
-- =============================================================================
SELECT /*+ NO_PARALLEL */
       TRUNC(R.DATAEMISSAONF, 'MM')   AS MES_EMISSAO,
       COUNT(*)                       AS QTD_NF
FROM   BGM_NOTAFISCAL R
WHERE  R.CODIGOEMPRESA = 4
  AND  R.STATUSNF      = 'F'
  AND  R.CODTPDOC      = 'NF'
  AND  R.DATAEMISSAONF >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -6)
  AND  R.DATAEMISSAONF <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
GROUP BY TRUNC(R.DATAEMISSAONF, 'MM')
ORDER BY MES_EMISSAO DESC;


-- BLOCO 4b CORRIGIDO — itens médios por NF via GROUP BY (não subquery)
-- Só nos últimos 3 meses
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
    AND  R.DATAEMISSAONF >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -3)
    AND  R.DATAEMISSAONF <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
  GROUP BY R.CODINTNF
);


-- =============================================================================
-- BLOCO 5 — Inventário tabelas auxiliares (limitado a 200 linhas)
-- Substitua :OWNER pelo retornado no BLOCO 0
-- =============================================================================
SELECT * FROM (
  SELECT /*+ NO_PARALLEL */ TABLE_NAME, NUM_ROWS
  FROM   ALL_TABLES
  WHERE  OWNER = :OWNER
    AND  (
          TABLE_NAME LIKE 'CPG_%'
      OR  TABLE_NAME LIKE 'CRC_%'
      OR  TABLE_NAME LIKE 'CTR_%'
      OR  TABLE_NAME LIKE 'BCO%'
      OR  TABLE_NAME LIKE 'BGM_FORN%'
      OR  TABLE_NAME LIKE 'EST_%'
      OR  TABLE_NAME LIKE 'FLP_%'
      OR  TABLE_NAME LIKE 'BGM_%'
    )
  ORDER BY TABLE_NAME
) WHERE ROWNUM <= 200;


-- =============================================================================
-- BLOCO 6 — Schema de tabelas específicas (rode 1 por vez)
-- =============================================================================

-- 6a — Schema de BGM_FORNECEDOR (rápido)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = :OWNER AND TABLE_NAME = 'BGM_FORNECEDOR'
ORDER BY COLUMN_ID;

-- 6d — Tabelas de pagamento/baixa CP (rápido, só metadado)
SELECT /*+ NO_PARALLEL */ TABLE_NAME, NUM_ROWS
FROM   ALL_TABLES
WHERE  OWNER = :OWNER
  AND  TABLE_NAME IN (
    'CPGPAGTO', 'CPG_PAGTO', 'CPGBAIXA', 'CPG_BAIXA',
    'CPGQUITACAO', 'CPGMOVTO', 'CPG_MOVIMENTO'
  );

-- 6e — Tabelas de recebimento/baixa CR
SELECT /*+ NO_PARALLEL */ TABLE_NAME, NUM_ROWS
FROM   ALL_TABLES
WHERE  OWNER = :OWNER
  AND  TABLE_NAME IN (
    'CRCRECEB', 'CRC_RECEB', 'CRCBAIXA', 'CRC_BAIXA',
    'CRCQUITACAO', 'CRCMOVTO', 'CRC_MOVIMENTO'
  );


-- =============================================================================
-- BLOCO 7 — Atividade recente (queries simples, rápidas)
-- =============================================================================

SELECT /*+ NO_PARALLEL */ MAX(R.DATAEMISSAONF) AS ULTIMA_NF
FROM   BGM_NOTAFISCAL R
WHERE  R.CODIGOEMPRESA = 4
  AND  R.STATUSNF      = 'F'
  AND  R.CODTPDOC      = 'NF'
  AND  R.DATAEMISSAONF >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -2);

SELECT /*+ NO_PARALLEL */ MAX(D.ENTRADACPG) AS ULTIMA_ENTRADA_CP
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA = 4
  AND  D.ENTRADACPG >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -2);

SELECT /*+ NO_PARALLEL */ MAX(D.EMISSAOCRC) AS ULTIMA_EMISSAO_CR
FROM   CRCDOCTO D
WHERE  D.CODIGOEMPRESA = 4
  AND  D.EMISSAOCRC >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -2);

SELECT /*+ NO_PARALLEL */ MAX(FE.COMPETFICHA) AS ULTIMA_COMP_FLP
FROM   FLP_FICHAEVENTOS FE
JOIN   VW_FUNCIONARIOS F ON F.CODINTFUNC = FE.CODINTFUNC
WHERE  F.CODIGOEMPRESA = 4
  AND  F.CODIGOFL      = 1
  AND  FE.COMPETFICHA >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -2);
