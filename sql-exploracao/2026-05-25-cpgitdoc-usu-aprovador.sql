-- =====================================================
-- Exploração v2: onde mora "quem aprovou" no Globus?
-- =====================================================
-- Hipóteses a testar:
--   A) CPGITDOC tem alguma coluna de aprovador (lista colunas)
--   B) BGM_NOTAFISCAL.USU_APROVADOR — aprovador da NF que gerou o CP
--   C) Tabelas auxiliares (CPG_AUDITORIA, LOG_CPG, etc) — busca por nome
-- =====================================================

-- ============ A. Colunas de CPGITDOC ============
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  TABLE_NAME = 'CPGITDOC'
  AND  OWNER      = 'GLOBUS'
ORDER  BY COLUMN_ID;


-- ============ B. BGM_NOTAFISCAL — cobertura de USU_APROVADOR ============
-- Quantas NFs da Pioneira tem aprovador preenchido?
SELECT /*+ NO_PARALLEL */
       COUNT(*)                                                AS TOTAL_NFS,
       COUNT(R.USU_APROVADOR)                                  AS COM_APROVADOR,
       COUNT(DISTINCT R.USU_APROVADOR)                         AS APROVADORES_DISTINTOS,
       ROUND(100 * COUNT(R.USU_APROVADOR) / COUNT(*), 2)       AS PERC_COM_DADO
FROM   BGM_NOTAFISCAL R
WHERE  R.CODIGOEMPRESA  = 4
  AND  R.STATUSNF       = 'F'
  AND  R.CODTPDOC       = 'NF'
  AND  R.DATAEMISSAONF >= TO_DATE('01/01/2026', 'DD/MM/YYYY');


-- ============ C. Top 20 aprovadores de NF ============
SELECT /*+ NO_PARALLEL */
       R.USU_APROVADOR,
       COUNT(*)                                                AS QTD_NFS
FROM   BGM_NOTAFISCAL R
WHERE  R.CODIGOEMPRESA  = 4
  AND  R.USU_APROVADOR  IS NOT NULL
  AND  R.DATAEMISSAONF >= TO_DATE('01/01/2026', 'DD/MM/YYYY')
GROUP  BY R.USU_APROVADOR
ORDER  BY COUNT(*) DESC
FETCH  FIRST 20 ROWS ONLY;


-- ============ D. Amostra: 15 NFs com aprovador, ligadas ao CP ============
-- Confronta aprovador da NF vs trilha do CP correspondente.
SELECT /*+ NO_PARALLEL */
       R.CODINTNF,
       R.NUMERONF,
       TO_CHAR(R.DATAEMISSAONF, 'DD/MM/YYYY')                  AS EMISSAO_NF,
       R.USU_APROVADOR                                         AS APROVADOR_NF,
       R.USUARIO                                               AS USUARIO_NF,
       D.CODDOCTOCPG,
       D.USUARIO_INCLUSAO                                      AS USUINCL_CP,
       D.USUARIO                                               AS USUARIO_CP,
       D.USUARIO_LIB_PAGTO_APROVE_ME                           AS USU_LIB_CP,
       D.ASSINATURA_1                                          AS ASS1_CP,
       D.ASSINATURA_2                                          AS ASS2_CP
FROM   BGM_NOTAFISCAL R
LEFT JOIN CPGDOCTO D ON D.CODINTNF = R.CODINTNF
WHERE  R.CODIGOEMPRESA  = 4
  AND  R.USU_APROVADOR  IS NOT NULL
  AND  R.DATAEMISSAONF >= TO_DATE('01/01/2026', 'DD/MM/YYYY')
ORDER  BY R.DATAEMISSAONF DESC
FETCH  FIRST 15 ROWS ONLY;


-- ============ E. Caça-tesouro: tabelas com nome de auditoria/log/aprovacao ============
SELECT TABLE_NAME
FROM   ALL_TABLES
WHERE  OWNER = 'GLOBUS'
  AND  (
        TABLE_NAME LIKE '%APROV%'
     OR TABLE_NAME LIKE '%AUDIT%'
     OR TABLE_NAME LIKE '%LOG%'
     OR TABLE_NAME LIKE '%HIST%CPG%'
     OR TABLE_NAME LIKE 'CPG%TRAM%'
  )
ORDER BY TABLE_NAME;


-- =====================================================
-- RESULTADOS (2026-05-26) — tabelas/colunas encontradas
-- =====================================================
-- Familia APROVE-ME (owner GLOBUS): BGM_APROVEME (cabecalho) + _ITENS,
--   _USUARIOS, _CONTROLEUSUARIOS, _DADOSADICIONAIS, _DADOSITENS,
--   _INTEGRACAO, _MOTIVOS, _ROTINAS, _VERSIONINFO.
--
-- Colunas de "quem liberou/aprovou" relevantes:
--   * CPGDOCTO.USUARIO_LIBEROU_PAGTO        <-- NOVA PISTA: mesma tabela, o sync NAO le hoje!
--   * CPGDOCTO.USUARIO_LIB_PAGTO_APROVE_ME  <-- ja lida; veio NULL no titulo investigado
--   * BGM_APROVEME.USUARIO_APROVADOR / SISTEMA_APROVADOR
--   * BGM_NOTAFISCAL.USU_APROVADOR          <-- aprovador da NF (join por CODINTNF)
--
-- HIPOTESE PRINCIPAL (mais barata): o liberador "comum" cai em
-- CPGDOCTO.USUARIO_LIBEROU_PAGTO; o USUARIO_LIB_PAGTO_APROVE_ME so e
-- preenchido no fluxo eletronico do APROVE-ME. Se confirmar (query F/G),
-- conserto = COALESCE(USUARIO_LIB_PAGTO_APROVE_ME, USUARIO_LIBEROU_PAGTO)
-- na CPGDOCTO, SEM join. Senao, cai pro plano B: join BGM_APROVEME (query H).

-- ============ F. Cobertura: USUARIO_LIBEROU_PAGTO cobre o vazio do APROVE_ME? ============
SELECT /*+ NO_PARALLEL */
       COUNT(*)                                  AS COM_DATA_LIB,
       COUNT(D.USUARIO_LIB_PAGTO_APROVE_ME)      AS TEM_APROVE_ME,
       COUNT(D.USUARIO_LIBEROU_PAGTO)            AS TEM_LIBEROU_PAGTO,
       COUNT(CASE WHEN D.USUARIO_LIB_PAGTO_APROVE_ME IS NULL
                   AND D.USUARIO_LIBEROU_PAGTO   IS NOT NULL THEN 1 END) AS SO_NO_LIBEROU
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA      = 4
  AND  D.DATALIBERACAOPGTO IS NOT NULL
  AND  D.VENCIMENTOCPG     >= TO_DATE('01/01/2026','DD/MM/YYYY');

-- ============ G. O titulo da tela (trocar :cod pelo CODDOCTOCPG real) ============
SELECT /*+ NO_PARALLEL */
       D.CODDOCTOCPG, D.NRODOCTOCPG, D.CODINTNF,
       TO_CHAR(D.DATALIBERACAOPGTO,'DD/MM/YYYY HH24:MI') AS DT_LIB,
       D.USUARIO_LIB_PAGTO_APROVE_ME    AS APROVE_ME,
       D.USUARIO_LIBEROU_PAGTO          AS LIBEROU_PAGTO,
       D.USUARIO_ASS_ELETRON_APROVE_ME  AS ASS_ELETRON
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA = 4
  AND  D.CODDOCTOCPG   = :cod;   -- <- CODDOCTOCPG do titulo da tela

-- ============ H. Plano B: estrutura do APROVE-ME p/ achar a chave de join ============
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN ('BGM_APROVEME', 'BGM_APROVEME_INTEGRACAO', 'BGM_APROVEME_ITENS')
ORDER  BY TABLE_NAME, COLUMN_ID;
