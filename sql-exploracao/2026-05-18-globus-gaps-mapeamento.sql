-- =============================================================================
-- EXPLORACAO GLOBUS - 2026-05-18 - GAPS DE MAPEAMENTO
-- Empresa: 4 (Viacao Pioneira) - Filial: 1 - Owner: GLOBUS
--
-- Objetivo: fechar o mapa para o sync funcionar. Cobre os gaps identificados
-- em Leia/globus-exploracao-2026-05-18.md (secao 6).
--
-- 4 regras canonicas:
--   1. empresa=4 em toda query de FATO
--   2. SO MES CORRENTE (janela [1o dia mes, proximo mes))
--   3. Histórico nao entra (sera arquivo separado, manual)
--   4. Read-only (apenas SELECT)
--
-- Ordem de execucao: bloco a bloco, esperando cada um terminar.
-- Os blocos 1-10 sao METADADO (ALL_TAB_COLUMNS / ALL_TABLES) - rapidos,
-- sem risco. Os blocos 20+ tocam dados (mes corrente).
--
-- Cole os resultados de volta no chat, identificando o numero do bloco.
-- =============================================================================


-- =============================================================================
-- METADADO - SCHEMAS QUE FALTAM (rapido, sem dado financeiro)
-- =============================================================================

-- BLOCO 1 - Schema FLP_FICHAEVENTOS (folha - 127k linhas/mes, critico)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'FLP_FICHAEVENTOS'
ORDER BY COLUMN_ID;


-- BLOCO 2 - Schema VW_FUNCIONARIOS (junta com FLP)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'VW_FUNCIONARIOS'
ORDER BY COLUMN_ID;


-- BLOCO 3 - Schema CRCDOCTO (contas a receber)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CRCDOCTO'
ORDER BY COLUMN_ID;


-- BLOCO 4 - Schema CRCITDOC (itens do CR)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CRCITDOC'
ORDER BY COLUMN_ID;


-- BLOCO 5 - Schema CTR_CADEMP (mestre de empresas)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTR_CADEMP'
ORDER BY COLUMN_ID;


-- BLOCO 6 - Schema CTR_FILIAL (mestre de filiais)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTR_FILIAL'
ORDER BY COLUMN_ID;


-- BLOCO 7 - Schema CTR_GARAGEM (mestre de garagens)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTR_GARAGEM'
ORDER BY COLUMN_ID;


-- BLOCO 8 - Schema BCOSALDO (saldo diario por conta)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'BCOSALDO'
ORDER BY COLUMN_ID;


-- BLOCO 9 - Schema BCOBANCO (banco) e BCOAGENC (agencia)
SELECT /*+ NO_PARALLEL */ TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME IN ('BCOBANCO', 'BCOAGENC')
ORDER BY TABLE_NAME, COLUMN_ID;


-- BLOCO 10 - Inventario do prefixo CTB (plano de contas - faltou no anterior)
SELECT /*+ NO_PARALLEL */ TABLE_NAME
FROM   ALL_TABLES
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME LIKE 'CTB%'
ORDER BY TABLE_NAME;


-- =============================================================================
-- METADADO - DESCOBRIR MESTRES NAO LOCALIZADAS
-- =============================================================================

-- BLOCO 11 - Onde mora CODIGOCUSTO (mestre de centro de custo)
-- Lista todas as tabelas que tem coluna CODIGOCUSTO. A com menor NUM_ROWS
-- e maior numero de colunas costuma ser a mestre (cadastro), nao fato.
SELECT /*+ NO_PARALLEL */ C.TABLE_NAME, T.NUM_ROWS,
       (SELECT COUNT(*) FROM ALL_TAB_COLUMNS C2
         WHERE C2.OWNER = 'GLOBUS' AND C2.TABLE_NAME = C.TABLE_NAME) AS QTD_COLS
FROM   ALL_TAB_COLUMNS C
JOIN   ALL_TABLES T ON T.OWNER = C.OWNER AND T.TABLE_NAME = C.TABLE_NAME
WHERE  C.OWNER = 'GLOBUS'
  AND  C.COLUMN_NAME = 'CODIGOCUSTO'
ORDER BY QTD_COLS DESC;


-- BLOCO 12 - Onde mora BGM_CLIENTE (ou equivalente)
SELECT /*+ NO_PARALLEL */ TABLE_NAME
FROM   ALL_TABLES
WHERE  OWNER = 'GLOBUS'
  AND  (TABLE_NAME LIKE 'BGM_CLI%' OR TABLE_NAME LIKE '%CADCLI%' OR TABLE_NAME LIKE 'CRCCLI%')
ORDER BY TABLE_NAME;


-- BLOCO 13 - Mestre do plano financeiro (CPG_MOVIMENTO_PLANO_FINANCEIRO referencia)
SELECT /*+ NO_PARALLEL */ TABLE_NAME
FROM   ALL_TABLES
WHERE  OWNER = 'GLOBUS'
  AND  (TABLE_NAME LIKE '%PLANO%FIN%' OR TABLE_NAME LIKE 'CPG_GRUPO%FIN%')
ORDER BY TABLE_NAME;


-- =============================================================================
-- DADO - VALIDACOES NO MES CORRENTE
-- =============================================================================

-- BLOCO 20 - Amostra dos 34 titulos com CODTPDOC '001' e '002' (lixo ou dado real?)
SELECT /*+ NO_PARALLEL */
       D.CODDOCTOCPG, D.CODTPDOC, D.CODIGOFORN, D.NRDOCTOCPG,
       D.VLR_ORIGINAL, D.EMISSAOCPG, D.VENCIMENTOCPG, D.MODULO_INCLUSAO,
       D.USUARIOCRIADOR
FROM (
  SELECT D.*, ROWNUM RN
  FROM   CPGDOCTO D
  WHERE  D.CODIGOEMPRESA   = 4
    AND  D.STATUSDOCTOCPG <> 'C'
    AND  D.CODTPDOC IN ('001', '002')
    AND  D.VENCIMENTOCPG  >= TRUNC(SYSDATE, 'MM')
    AND  D.VENCIMENTOCPG  <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
    AND  ROWNUM <= 5
) D;


-- BLOCO 21 - BCOCONTA - amostra de status real (validar CONTA_ATIVA vs INATIVA)
SELECT /*+ NO_PARALLEL */
       C.CODBANCO, C.CODAGENCIA, C.CODCONTABCO, C.NOMECONTABCO,
       C.CONTA_ATIVA, C.INATIVA, C.CONTACAIXA, C.COMPOEPOSICAOFINANCEIRA,
       C.DTLIMITEMOVTO
FROM   BCOCONTA C
WHERE  C.CODIGOEMPRESA = 4
  AND  C.CODIGOFL      = 1
ORDER BY C.CONTA_ATIVA, C.INATIVA, C.CODBANCO, C.CODCONTABCO;


-- BLOCO 22 - BCOMOVTO - 3 datas para escolher canonica (amostra do mes corrente)
SELECT /*+ NO_PARALLEL */
       M.CODMOVTOBCO,
       M.DTMOVTOBCO,
       M.DTEFETIVAMOVTOBCO,
       M.DATA_CREDITO,
       M.CONFIRMADOMOVTOBCO,
       M.CONCILIADOMOVTOBCO,
       M.STATUSMOVTOBCO
FROM (
  SELECT M.*, ROWNUM RN
  FROM   BCOMOVTO M
  WHERE  M.CODIGOEMPRESA = 4
    AND  M.CODIGOFL      = 1
    AND  M.DTMOVTOBCO   >= TRUNC(SYSDATE, 'MM')
    AND  M.DTMOVTOBCO   <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
    AND  ROWNUM <= 10
) M;


-- BLOCO 23 - BCOMOVTO - estatistica de preenchimento das 3 datas (mes corrente)
SELECT /*+ NO_PARALLEL */
       COUNT(*)                                                  AS TOTAL,
       SUM(CASE WHEN DTMOVTOBCO         IS NULL THEN 1 ELSE 0 END) AS NULL_DTMOVTO,
       SUM(CASE WHEN DTEFETIVAMOVTOBCO  IS NULL THEN 1 ELSE 0 END) AS NULL_DTEFETIVA,
       SUM(CASE WHEN DATA_CREDITO       IS NULL THEN 1 ELSE 0 END) AS NULL_DATA_CREDITO,
       SUM(CASE WHEN DTEFETIVAMOVTOBCO = DTMOVTOBCO THEN 1 ELSE 0 END) AS IGUAIS_MOV_EFET
FROM   BCOMOVTO M
WHERE  M.CODIGOEMPRESA = 4
  AND  M.CODIGOFL      = 1
  AND  M.DTMOVTOBCO   >= TRUNC(SYSDATE, 'MM')
  AND  M.DTMOVTOBCO   <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1);


-- BLOCO 24 - BGM_NOTAFISCAL - amostra de NF emitida no mes (validar uso real)
-- Pioneira emite 406 NFs/mes - precisamos saber se vale incluir no DRE gerencial
SELECT /*+ NO_PARALLEL */
       R.CODINTNF, R.SERIENF, R.NUMERONF, R.CODTPDOC,
       R.CODCLI, R.DATAEMISSAONF, R.VALORTOTALNF,
       R.STATUSNF, R.ENTRADASAIDANF
FROM (
  SELECT R.*, ROWNUM RN
  FROM   BGM_NOTAFISCAL R
  WHERE  R.CODIGOEMPRESA = 4
    AND  R.STATUSNF      = 'F'
    AND  R.CODTPDOC      = 'NF'
    AND  R.DATAEMISSAONF >= TRUNC(SYSDATE, 'MM')
    AND  R.DATAEMISSAONF <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
    AND  ROWNUM <= 10
) R
ORDER BY R.DATAEMISSAONF DESC;


-- BLOCO 25 - Volume CPG_CONTRATOS Pioneira no mes (vale o esforco?)
SELECT /*+ NO_PARALLEL */
       COUNT(*)                                          AS QTD_CONTRATOS_VIGENTES_MES,
       COUNT(DISTINCT C.CODIGOFORN)                      AS QTD_FORN_COM_CONTRATO
FROM   CPG_CONTRATOS C
WHERE  C.CODIGOEMPRESA = 4
  AND  (C.DT_FIM IS NULL OR C.DT_FIM >= TRUNC(SYSDATE, 'MM'))
  AND  (C.DT_INI IS NULL OR C.DT_INI <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1));
-- Se a tabela nao tiver colunas DT_INI/DT_FIM, ajustamos depois com base no schema.


-- BLOCO 26 - Volume CPG_CAD_ORCAMENTO Pioneira (vale o esforco?)
SELECT /*+ NO_PARALLEL */
       COUNT(*) AS QTD_REGISTROS
FROM   CPG_CAD_ORCAMENTO O
WHERE  O.CODIGOEMPRESA = 4;
-- Tabela mestre, sem filtro de mes. Conta total para a empresa.


-- =============================================================================
-- METADADO BONUS - tabelas que aparecem em CPGDOCTO mas nao mapeamos
-- =============================================================================

-- BLOCO 27 - Schema CPGTPDES_CTBCONTA (ponte despesa -> conta contabil)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CPGTPDES_CTBCONTA'
ORDER BY COLUMN_ID;


-- BLOCO 28 - Schema CPGRESUMOFINANC e CPGRESUMOGERENCIAL (agrupadores)
SELECT /*+ NO_PARALLEL */ TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN ('CPGRESUMOFINANC', 'CPGRESUMOGERENCIAL')
ORDER BY TABLE_NAME, COLUMN_ID;


-- =============================================================================
-- FIM - 22 blocos no total
-- Tempo estimado: ~3min se rodar tudo sequencial, fora de pico.
-- Blocos 1-13 e 27-28 sao metadado (instantaneos).
-- Blocos 20-26 tocam dados mas com janela = mes corrente.
-- =============================================================================
