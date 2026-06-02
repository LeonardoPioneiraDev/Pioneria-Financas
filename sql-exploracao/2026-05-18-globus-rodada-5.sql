-- =============================================================================
-- EXPLORACAO GLOBUS - 2026-05-18 - RODADA 5 (schemas do workshop)
-- Empresa: 4 (Viacao Pioneira) - Filial IN (1,5,6,17,19)
-- Owner: GLOBUS
--
-- Cobre as ~30 tabelas referenciadas em docs/workshop.txt e nao mapeadas.
-- Tudo metadado (ALL_TAB_COLUMNS) - instantaneo, zero risco.
--
-- Rodar tudo de uma vez ou bloco a bloco - tanto faz, sao metadados.
-- =============================================================================


-- BLOCO 1 - FLP (folha, mestres e auxiliares)
SELECT /*+ NO_PARALLEL */
       TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, COLUMN_ID
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN (
    'FLP_EVENTOS',
    'FLP_ENCERRAMENTOFICHAFIN',
    'FLP_QUITACAO',
    'FLP_HISTORICO',
    'FLP_AFASTADOS',
    'FLP_DOCUMENTOS',
    'FLP_DEPENDENTES',
    'FLP_FUNCIONARIOS',
    'FRQ_CID',
    'SRH_CURSOS_FUNC'
  )
ORDER BY TABLE_NAME, COLUMN_ID;


-- BLOCO 2 - FRT + MOT (frota, depreciacao)
SELECT /*+ NO_PARALLEL */
       TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, COLUMN_ID
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN (
    'FRT_CADVEICULOS',
    'FRT_COMPRAVEIC',
    'FRT_TIPODEFROTA',
    'FRT_MARCACARROC',
    'FRT_MODCARROC',
    'MOT_MODELOMOTOR',
    'MOT_CADASTROMARCA'
  )
ORDER BY TABLE_NAME, COLUMN_ID;


-- BLOCO 3 - MAN (manutencao - custos terceiros)
SELECT /*+ NO_PARALLEL */
       TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, COLUMN_ID
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN (
    'MAN_OS',
    'MAN_OSREALIZADO',
    'MAN_ORIGEMOS',
    'MAN_GRUPODESERVICO'
  )
ORDER BY TABLE_NAME, COLUMN_ID;


-- BLOCO 4 - PI (custom Pioneira - acidentes/linhas/frota)
SELECT /*+ NO_PARALLEL */
       TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, COLUMN_ID
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN ('PI_ACD', 'PI_LIN', 'PI_FRT')
ORDER BY TABLE_NAME, COLUMN_ID;


-- BLOCO 5 - T_ARR + BGM_CADLINHAS (receita operacional)
SELECT /*+ NO_PARALLEL */
       TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, COLUMN_ID
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN (
    'T_ARR_GUIA',
    'T_ARR_DETALHE_GUIA',
    'T_ARR_VIAGENS_GUIA',
    'T_ARR_BCO',
    'T_ARR_BCO_VIAGENS',
    'BGM_CADLINHAS'
  )
ORDER BY TABLE_NAME, COLUMN_ID;


-- BLOCO 6 - DVS (juridico - multas de transito)
SELECT /*+ NO_PARALLEL */
       TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, COLUMN_ID
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN (
    'DVS_MULTA',
    'DVS_INFRACAO',
    'DVS_AGENTE_AUTUADOR'
  )
ORDER BY TABLE_NAME, COLUMN_ID;


-- BLOCO 7 - Schema da function FC_ARR_KMBCO_VIAGENS (usada no calculo de KM)
-- Retorna a assinatura da function pra entender entrada/saida
SELECT /*+ NO_PARALLEL */
       ARGUMENT_NAME, IN_OUT, DATA_TYPE, POSITION
FROM   ALL_ARGUMENTS
WHERE  OWNER = 'GLOBUS'
  AND  OBJECT_NAME = 'FC_ARR_KMBCO_VIAGENS'
ORDER BY POSITION;


-- BLOCO 8 - Inventario adicional de tabelas que possam ter ficado de fora
-- (procura por prefixos PI_, T_ARR_, MAN_, FRT_, MOT_, DVS_, FLP_, SRH_, FRQ_)
SELECT /*+ NO_PARALLEL */ TABLE_NAME
FROM   ALL_TABLES
WHERE  OWNER = 'GLOBUS'
  AND  (TABLE_NAME LIKE 'PI\_%' ESCAPE '\'
     OR TABLE_NAME LIKE 'T\_ARR%' ESCAPE '\'
     OR TABLE_NAME LIKE 'MAN\_%' ESCAPE '\'
     OR TABLE_NAME LIKE 'FRT\_%' ESCAPE '\'
     OR TABLE_NAME LIKE 'MOT\_%' ESCAPE '\'
     OR TABLE_NAME LIKE 'DVS\_%' ESCAPE '\'
     OR TABLE_NAME LIKE 'FLP\_%' ESCAPE '\'
     OR TABLE_NAME LIKE 'SRH\_%' ESCAPE '\'
     OR TABLE_NAME LIKE 'FRQ\_%' ESCAPE '\')
  AND  TABLE_NAME NOT LIKE '%\_BAK' ESCAPE '\'
  AND  TABLE_NAME NOT LIKE '%\_BKP%' ESCAPE '\'
  AND  TABLE_NAME NOT LIKE '%OLD%'
ORDER BY TABLE_NAME;


-- =============================================================================
-- FIM - 8 blocos, todos metadado. Tempo total ~30s.
-- =============================================================================
