-- =============================================================================
-- EXPLORACAO GLOBUS - 2026-05-18 - RODADA 3 (gaps remanescentes)
-- Empresa: 4 (Viacao Pioneira) - Filial: 1 - Owner: GLOBUS
--
-- Continua de onde a rodada 2 travou (provavelmente bloco 25 da rodada 2
-- por causa de DT_INI/DT_FIM inexistentes em CPG_CONTRATOS).
--
-- 4 regras canonicas:
--   1. empresa=4 em toda query de FATO
--   2. SO MES CORRENTE (janela [1o dia mes, proximo mes))
--   3. Historico nao entra - sera arquivo separado
--   4. Read-only (apenas SELECT)
--
-- Esta rodada e quase toda METADADO (instantanea, sem risco).
-- Blocos 30+ tocam dados mas todos com janela mes corrente + ROWNUM.
--
-- Rode bloco a bloco. Cole resultados identificando o numero do bloco.
-- =============================================================================


-- =============================================================================
-- PARTE A - MESTRES DO SCHEMA CTB (contabil)
-- =============================================================================

-- BLOCO 1 - Schema CTBCUSTO (mestre de centro de custo - faltou na rodada 2)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTBCUSTO'
ORDER BY COLUMN_ID;


-- BLOCO 2 - Schema CTBPLANO (mestre do plano de contas)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTBPLANO'
ORDER BY COLUMN_ID;


-- BLOCO 3 - Schema CTBCONTA (conta contabil individual)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTBCONTA'
ORDER BY COLUMN_ID;


-- BLOCO 4 - Schema CTBCDDRE (cadastro de DRE)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTBCDDRE'
ORDER BY COLUMN_ID;


-- BLOCO 5 - Schema CTBITDRE (itens da estrutura DRE - input pro modulo DRE)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTBITDRE'
ORDER BY COLUMN_ID;


-- BLOCO 6 - Schema CTBLANCA (lancamentos contabeis - fato grande, ver volumetria abaixo)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTBLANCA'
ORDER BY COLUMN_ID;


-- BLOCO 7 - Schema CTBSALDO + CTBSALDOCCUSTO (saldos)
SELECT /*+ NO_PARALLEL */ TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME IN ('CTBSALDO', 'CTBSALDOCCUSTO')
ORDER BY TABLE_NAME, COLUMN_ID;


-- BLOCO 8 - Schema CTBHISTO (historicos contabeis padrao)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTBHISTO'
ORDER BY COLUMN_ID;


-- BLOCO 9 - Schema CTBEXERC (exercicios fiscais)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTBEXERC'
ORDER BY COLUMN_ID;


-- =============================================================================
-- PARTE B - MESTRES COMPLEMENTARES
-- =============================================================================

-- BLOCO 10 - Schema CTR_EMPAUTORIZADAS (mestre real com CNPJ - CTR_CADEMP referencia)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTR_EMPAUTORIZADAS'
ORDER BY COLUMN_ID;


-- BLOCO 11 - Schema BGM_CLIENTE (mestre cliente CR)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'BGM_CLIENTE'
ORDER BY COLUMN_ID;


-- BLOCO 12 - Schema PI_PLANO_FIN (CUSTOMIZACAO PIONEIRA - validar com DBA)
-- Prefixo PI_ nao e padrao Praxio. Se a tabela existir, eh customizacao.
-- Antes de depender, ver: quem mantem, contrato estavel, sobrevive upgrade?
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'PI_PLANO_FIN'
ORDER BY COLUMN_ID;


-- BLOCO 13 - Schema CPG_GRUPO_CONTAS_FINANCEIRAS (mestre padrao Praxio do plano financeiro)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CPG_GRUPO_CONTAS_FINANCEIRAS'
ORDER BY COLUMN_ID;


-- BLOCO 14 - Schema CPG_MOVIMENTO_PLANO_FINANCEIRO (fato do plano financeiro)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CPG_MOVIMENTO_PLANO_FINANCEIRO'
ORDER BY COLUMN_ID;


-- =============================================================================
-- PARTE C - SCHEMAS DE CONTRATOS E ORCAMENTO (apenas metadado, sem amostra)
-- =============================================================================

-- BLOCO 15 - Schema CPG_CONTRATOS (descobrir colunas reais antes de tentar volumetria)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CPG_CONTRATOS'
ORDER BY COLUMN_ID;


-- BLOCO 16 - Schema CPG_CONTRATOS_PARCELAS
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CPG_CONTRATOS_PARCELAS'
ORDER BY COLUMN_ID;


-- BLOCO 17 - Schema CPG_CAD_ORCAMENTO (modulo orcamento)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CPG_CAD_ORCAMENTO'
ORDER BY COLUMN_ID;


-- BLOCO 18 - Schema CPG_CAD_ORCAMENTO_PREVISOES
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CPG_CAD_ORCAMENTO_PREVISOES'
ORDER BY COLUMN_ID;


-- =============================================================================
-- PARTE D - DADOS (mes corrente, ROWNUM limitado - blocos que travaram antes)
-- =============================================================================

-- BLOCO 30 - Amostra dos titulos CODTPDOC '001' e '002' (5 linhas, mes corrente)
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


-- BLOCO 31 - BCOCONTA: validar flags CONTA_ATIVA vs INATIVA (Pioneira inteira, sem janela)
SELECT /*+ NO_PARALLEL */
       C.CODBANCO, C.CODAGENCIA, C.CODCONTABCO, C.NOMECONTABCO,
       C.CONTA_ATIVA, C.INATIVA, C.CONTACAIXA, C.COMPOEPOSICAOFINANCEIRA,
       C.DTLIMITEMOVTO
FROM   BCOCONTA C
WHERE  C.CODIGOEMPRESA = 4
  AND  C.CODIGOFL      = 1
ORDER BY C.CONTA_ATIVA, C.INATIVA, C.CODBANCO, C.CODCONTABCO;


-- BLOCO 32 - BCOMOVTO: estatistica de preenchimento das 3 datas (mes corrente, agregado)
SELECT /*+ NO_PARALLEL */
       COUNT(*)                                                       AS TOTAL,
       SUM(CASE WHEN DTMOVTOBCO        IS NULL THEN 1 ELSE 0 END)      AS NULL_DTMOVTO,
       SUM(CASE WHEN DTEFETIVAMOVTOBCO IS NULL THEN 1 ELSE 0 END)      AS NULL_DTEFETIVA,
       SUM(CASE WHEN DATA_CREDITO      IS NULL THEN 1 ELSE 0 END)      AS NULL_DATA_CREDITO,
       SUM(CASE WHEN DTEFETIVAMOVTOBCO = DTMOVTOBCO THEN 1 ELSE 0 END) AS IGUAIS_MOV_EFET,
       SUM(CASE WHEN DATA_CREDITO      = DTMOVTOBCO THEN 1 ELSE 0 END) AS IGUAIS_MOV_CRED
FROM   BCOMOVTO M
WHERE  M.CODIGOEMPRESA = 4
  AND  M.CODIGOFL      = 1
  AND  M.DTMOVTOBCO   >= TRUNC(SYSDATE, 'MM')
  AND  M.DTMOVTOBCO   <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1);


-- BLOCO 33 - BCOMOVTO: amostra das 3 datas (10 linhas, mes corrente)
SELECT /*+ NO_PARALLEL */
       M.CODMOVTOBCO,
       M.DTMOVTOBCO,
       M.DTEFETIVAMOVTOBCO,
       M.DATA_CREDITO,
       M.CONFIRMADOMOVTOBCO,
       M.CONCILIADOMOVTOBCO,
       M.STATUSMOVTOBCO,
       M.CODHISTOBCO
FROM (
  SELECT M.*, ROWNUM RN
  FROM   BCOMOVTO M
  WHERE  M.CODIGOEMPRESA = 4
    AND  M.CODIGOFL      = 1
    AND  M.DTMOVTOBCO   >= TRUNC(SYSDATE, 'MM')
    AND  M.DTMOVTOBCO   <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
    AND  ROWNUM <= 10
) M;


-- BLOCO 34 - Amostra BGM_NOTAFISCAL emitida (10 linhas, mes corrente, entender uso real)
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


-- =============================================================================
-- PARTE E - VOLUMETRIA NOVA (mes corrente, agregado, regra 2 OK)
-- =============================================================================

-- BLOCO 40 - Volume CTBLANCA Pioneira mes corrente (decidir se vale sync)
-- ATENCAO: tabela contabil massiva. Se NUM_ROWS for > 50k pra 1 mes, usar batch + cursor.
SELECT /*+ NO_PARALLEL */
       COUNT(*) AS QTD_LANCAMENTOS_MES,
       MIN(L.DTLANCA) AS DT_MIN,
       MAX(L.DTLANCA) AS DT_MAX
FROM   CTBLANCA L
WHERE  L.CODIGOEMPRESA = 4
  AND  L.DTLANCA       >= TRUNC(SYSDATE, 'MM')
  AND  L.DTLANCA       <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1);
-- Se a coluna for DTLCTO/DATA_LANCA, ajusto depois com o schema do BLOCO 6.


-- BLOCO 41 - Volume CPG_CONTRATOS Pioneira (mestre - sem filtro de mes, conta total)
SELECT /*+ NO_PARALLEL */
       COUNT(*) AS QTD_CONTRATOS
FROM   CPG_CONTRATOS C
WHERE  C.CODIGOEMPRESA = 4;


-- BLOCO 42 - Volume CPG_CAD_ORCAMENTO Pioneira (mestre - sem filtro mes)
SELECT /*+ NO_PARALLEL */
       COUNT(*) AS QTD_ORCAMENTOS
FROM   CPG_CAD_ORCAMENTO O
WHERE  O.CODIGOEMPRESA = 4;


-- =============================================================================
-- PARTE F - VALIDACAO DE INTEGRIDADE (mes corrente, agregado leve)
-- =============================================================================

-- BLOCO 50 - CODCUSTO vs CODCUSTOFIN no CPGITDOC do mes (sao o mesmo universo?)
-- Se DIVERGENCIAS > 0, os dois apontam pra mestres diferentes.
SELECT /*+ NO_PARALLEL */
       SUM(CASE WHEN I.CODCUSTO IS NULL AND I.CODCUSTOFIN IS NULL THEN 1 ELSE 0 END) AS AMBOS_NULL,
       SUM(CASE WHEN I.CODCUSTO IS NOT NULL AND I.CODCUSTOFIN IS NULL THEN 1 ELSE 0 END) AS SO_CCUSTO,
       SUM(CASE WHEN I.CODCUSTO IS NULL AND I.CODCUSTOFIN IS NOT NULL THEN 1 ELSE 0 END) AS SO_CCUSTOFIN,
       SUM(CASE WHEN I.CODCUSTO = I.CODCUSTOFIN THEN 1 ELSE 0 END) AS IGUAIS,
       SUM(CASE WHEN I.CODCUSTO <> I.CODCUSTOFIN THEN 1 ELSE 0 END) AS DIFERENTES
FROM   CPGITDOC I
WHERE  EXISTS (
  SELECT 1 FROM CPGDOCTO D
  WHERE  D.CODDOCTOCPG     = I.CODDOCTOCPG
    AND  D.CODIGOEMPRESA   = 4
    AND  D.STATUSDOCTOCPG <> 'C'
    AND  D.VENCIMENTOCPG  >= TRUNC(SYSDATE, 'MM')
    AND  D.VENCIMENTOCPG  <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1)
);


-- =============================================================================
-- FIM - 24 blocos (15 metadado + 5 dados-amostra + 3 volumetria + 1 validacao)
-- Tempo esperado: ~2min sequencial.
-- Se BLOCO 12 retornar 0 linhas, PI_PLANO_FIN nao existe (entao era outra tabela).
-- Se BLOCO 40 falhar por coluna DTLANCA, retornar erro - ajustamos com BLOCO 6.
-- =============================================================================
