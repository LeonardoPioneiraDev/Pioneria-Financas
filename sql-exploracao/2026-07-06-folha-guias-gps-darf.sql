-- =============================================================================
-- DESCOBERTA — Guias de imposto DA FOLHA (GPS/DARF) no Globus
-- Data: 2026-07-06
-- Rode no Oracle do Globus (usuário com acesso ao schema GLOBUS) e me mande a saída.
-- Tudo READ-ONLY (só SELECT).
--
-- Objetivo: hoje o painel "Tributos da folha" mostra o INSS PATRONAL como
-- ESTIMATIVA (base x 28,8%). As tabelas FLP_GPS_INTEGRACPG e FLP_DARF parecem
-- ter o valor REALMENTE recolhido. Se confirmarmos, trocamos a estimativa pelo
-- dado real (idealmente com o patronal separado do retido).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) Confirmar os nomes das tabelas de guia da folha (GPS/DARF/INSS/FGTS)
-- -----------------------------------------------------------------------------
SELECT TABLE_NAME, NUM_ROWS
FROM   ALL_TABLES
WHERE  OWNER = 'GLOBUS'
  AND (TABLE_NAME LIKE 'FLP%GPS%'  OR TABLE_NAME LIKE 'FLP%DARF%'
    OR TABLE_NAME LIKE 'FLP%GUIA%' OR TABLE_NAME LIKE 'FLP%INSS%'
    OR TABLE_NAME LIKE 'FLP%FGTS%' OR TABLE_NAME LIKE 'FLP%TRIBUT%')
ORDER BY NUM_ROWS DESC NULLS LAST;


-- -----------------------------------------------------------------------------
-- 2) Colunas da FLP_GPS_INTEGRACPG (a que a descoberta achou populada, ~360 linhas)
-- -----------------------------------------------------------------------------
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'FLP_GPS_INTEGRACPG'
ORDER BY COLUMN_ID;


-- -----------------------------------------------------------------------------
-- 3) Amostra de dados da FLP_GPS_INTEGRACPG (15 linhas)
-- -----------------------------------------------------------------------------
SELECT *
FROM   GLOBUS.FLP_GPS_INTEGRACPG
FETCH FIRST 15 ROWS ONLY;


-- -----------------------------------------------------------------------------
-- 4) Colunas da FLP_DARF (IRRF da folha, ~33 linhas)
-- -----------------------------------------------------------------------------
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'FLP_DARF'
ORDER BY COLUMN_ID;


-- -----------------------------------------------------------------------------
-- 4b) Amostra de dados da FLP_DARF (15 linhas)
-- -----------------------------------------------------------------------------
SELECT *
FROM   GLOBUS.FLP_DARF
FETCH FIRST 15 ROWS ONLY;


-- -----------------------------------------------------------------------------
-- 5) O INSS PATRONAL esta separado do retido? (colunas com essa semantica em FLP)
-- -----------------------------------------------------------------------------
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME LIKE 'FLP%'
  AND (COLUMN_NAME LIKE '%PATRONAL%' OR COLUMN_NAME LIKE '%EMPRESA%'
    OR COLUMN_NAME LIKE '%SEGURADO%' OR COLUMN_NAME LIKE '%DESCONT%'
    OR COLUMN_NAME LIKE '%RAT%'      OR COLUMN_NAME LIKE '%TERCEIRO%'
    OR COLUMN_NAME LIKE '%CPP%')
ORDER BY TABLE_NAME, COLUMN_NAME;


-- -----------------------------------------------------------------------------
-- 6) Amarracao com a competencia e com o Contas a Pagar (a guia vira origem='guia'?)
-- -----------------------------------------------------------------------------
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN ('FLP_GPS_INTEGRACPG', 'FLP_DARF')
  AND (COLUMN_NAME LIKE '%COMPET%' OR COLUMN_NAME LIKE '%MESANO%'
    OR COLUMN_NAME LIKE '%REFER%'  OR COLUMN_NAME LIKE '%CODDOCTOCPG%'
    OR COLUMN_NAME LIKE '%CPG%'    OR COLUMN_NAME LIKE '%VENC%'
    OR COLUMN_NAME LIKE '%PAGAM%'  OR COLUMN_NAME LIKE '%COMPETENCIA%')
ORDER BY TABLE_NAME, COLUMN_NAME;


-- #############################################################################
-- RODADA 2 — valores reais da empresa 4 (rode e me mande a saída)
-- Agora que sabemos as colunas: RETIDO, INSSEMPRESA_COMDESON/SEMDESON, BASECONTRIB.
-- #############################################################################


-- -----------------------------------------------------------------------------
-- 8) A DECISIVA: GPS da folha agregada por competencia (empresa 4, ult. meses).
--    Compara com o painel: junho/2026 estimava retido R$1,32M / base R$10,98M /
--    patronal R$3,16M. Aqui vem o REAL, e o COMDESON x SEMDESON diz o regime.
-- -----------------------------------------------------------------------------
SELECT TO_CHAR(COMPETENCIA,'YYYY-MM')   AS COMPET,
       TIPOFOLHA,
       COUNT(*)                          AS LINHAS,
       SUM(VALOR)                         AS VALOR_TOTAL,
       SUM(RETIDO)                        AS RETIDO_FUNC,
       SUM(INSSEMPRESA_COMDESON)          AS PATRONAL_COM_DESON,
       SUM(INSSEMPRESA_SEMDESON)          AS PATRONAL_SEM_DESON,
       SUM(BASECONTRIB)                   AS BASE_CONTRIB
FROM   GLOBUS.FLP_GPS_INTEGRACPG
WHERE  CODIGOEMPRESA = 4
GROUP BY TO_CHAR(COMPETENCIA,'YYYY-MM'), TIPOFOLHA
ORDER BY 1 DESC, 2
FETCH FIRST 36 ROWS ONLY;


-- -----------------------------------------------------------------------------
-- 9) Grao das linhas: o que e TIPOIDENT/CODIDENT? (pra saber como somar)
-- -----------------------------------------------------------------------------
SELECT TIPOIDENT,
       COUNT(*)                    AS LINHAS,
       SUM(VALOR)                  AS VALOR_TOTAL,
       SUM(INSSEMPRESA_COMDESON)   AS PATRONAL_COM_DESON,
       SUM(INSSEMPRESA_SEMDESON)   AS PATRONAL_SEM_DESON
FROM   GLOBUS.FLP_GPS_INTEGRACPG
WHERE  CODIGOEMPRESA = 4
GROUP BY TIPOIDENT
ORDER BY 3 DESC;


-- -----------------------------------------------------------------------------
-- 10) Regime de desoneracao (CPRB): colunas + amostra recente da empresa 4.
--     Confirma se a Pioneira usa desoneracao (troca os 28,8% estimados).
-- -----------------------------------------------------------------------------
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
FROM   ALL_TAB_COLUMNS
WHERE  OWNER='GLOBUS' AND TABLE_NAME='FLP_DESONERACAOINSSPATRONAL'
ORDER BY COLUMN_ID;

SELECT * FROM GLOBUS.FLP_DESONERACAOINSSPATRONAL
WHERE  CODIGOEMPRESA = 4
ORDER BY ROWID DESC
FETCH FIRST 15 ROWS ONLY;


-- -----------------------------------------------------------------------------
-- 11) Aliquota patronal configurada (RAT/terceiros) — FLP_ALIQINSSPATRONAL (12 linhas)
-- -----------------------------------------------------------------------------
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
FROM   ALL_TAB_COLUMNS
WHERE  OWNER='GLOBUS' AND TABLE_NAME='FLP_ALIQINSSPATRONAL'
ORDER BY COLUMN_ID;

SELECT * FROM GLOBUS.FLP_ALIQINSSPATRONAL
WHERE  CODIGOEMPRESA = 4
FETCH FIRST 12 ROWS ONLY;
