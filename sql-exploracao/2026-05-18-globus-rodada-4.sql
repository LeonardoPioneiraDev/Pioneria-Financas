-- =============================================================================
-- EXPLORACAO GLOBUS - 2026-05-18 - RODADA 4 (fechamento)
-- Empresa: 4 (Viacao Pioneira) - Filial: 1 - Owner: GLOBUS
--
-- Objetivo: fechar o mapeamento. Schemas remanescentes (3 da rodada 3
-- nao retornados + CTBITLNC nova descoberta) + dados que travaram.
--
-- 4 regras canonicas: empresa=4 / mes corrente / read-only / NO_PARALLEL
-- Tempo esperado: ~90s sequencial. Tudo agregado ou amostra limitada.
-- =============================================================================


-- =============================================================================
-- PARTE A - SCHEMAS FALTANTES
-- =============================================================================

-- BLOCO 1 - CTBPLANO (mestre do plano de contas Praxio)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTBPLANO'
ORDER BY COLUMN_ID;


-- BLOCO 2 - CTBCONTA (conta contabil individual)
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTBCONTA'
ORDER BY COLUMN_ID;


-- BLOCO 3 - CTBCUSTO E CTBCDDRE juntos (com TABLE_NAME pra desambiguar)
-- Um dos dois foi o "primeiro resultado" da rodada 3 (3 cols NUMERO/DESCRICAO/NROPLANO)
-- Rodando os dois aqui com TABLE_NAME explicito, nao tem ambiguidade.
SELECT /*+ NO_PARALLEL */ TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN ('CTBCUSTO', 'CTBCDDRE')
ORDER BY TABLE_NAME, COLUMN_ID;


-- BLOCO 4 - CTBITLNC (itens do lancamento contabil - onde mora o VALOR)
-- Descoberta da rodada 3: CTBLANCA so tem cabecalho, valor esta aqui.
SELECT /*+ NO_PARALLEL */ COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTBITLNC'
ORDER BY COLUMN_ID;


-- =============================================================================
-- PARTE B - DADOS QUE TRAVARAM ANTES (mes corrente, ROWNUM/agregado)
-- =============================================================================

-- BLOCO 5 - Amostra titulos CODTPDOC '001' e '002' (5 linhas)
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


-- BLOCO 6 - BCOCONTA: status real Pioneira (sem janela, e tabela pequena)
SELECT /*+ NO_PARALLEL */
       C.CODBANCO, C.CODAGENCIA, C.CODCONTABCO, C.NOMECONTABCO,
       C.CONTA_ATIVA, C.INATIVA, C.CONTACAIXA, C.COMPOEPOSICAOFINANCEIRA,
       C.DTLIMITEMOVTO
FROM   BCOCONTA C
WHERE  C.CODIGOEMPRESA = 4
  AND  C.CODIGOFL      = 1
ORDER BY C.CONTA_ATIVA, C.INATIVA, C.CODBANCO, C.CODCONTABCO;


-- BLOCO 7 - BCOMOVTO: estatistica das 3 datas (mes corrente, agregado)
SELECT /*+ NO_PARALLEL */
       COUNT(*) AS TOTAL,
       SUM(CASE WHEN DTMOVTOBCO        IS NULL THEN 1 ELSE 0 END) AS NULL_DTMOVTO,
       SUM(CASE WHEN DTEFETIVAMOVTOBCO IS NULL THEN 1 ELSE 0 END) AS NULL_DTEFETIVA,
       SUM(CASE WHEN DATA_CREDITO      IS NULL THEN 1 ELSE 0 END) AS NULL_DATA_CREDITO,
       SUM(CASE WHEN DTEFETIVAMOVTOBCO = DTMOVTOBCO THEN 1 ELSE 0 END) AS IGUAIS_MOV_EFET,
       SUM(CASE WHEN DATA_CREDITO      = DTMOVTOBCO THEN 1 ELSE 0 END) AS IGUAIS_MOV_CRED
FROM   BCOMOVTO M
WHERE  M.CODIGOEMPRESA = 4
  AND  M.CODIGOFL      = 1
  AND  M.DTMOVTOBCO   >= TRUNC(SYSDATE, 'MM')
  AND  M.DTMOVTOBCO   <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1);


-- BLOCO 8 - BCOMOVTO: amostra 3 datas (10 linhas, mes corrente)
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


-- BLOCO 9 - BGM_NOTAFISCAL emitida: amostra mes corrente (entender uso)
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
-- PARTE C - VOLUMETRIA NOVA (mes corrente, agregado leve)
-- =============================================================================

-- BLOCO 10 - Volume CTBLANCA Pioneira mes corrente
-- Decide se vamos sincronizar contabil. Se > 50k/mes, batch + cursor.
SELECT /*+ NO_PARALLEL */
       COUNT(*) AS QTD_LANCAMENTOS_MES,
       MIN(L.DTLANCA) AS DT_MIN,
       MAX(L.DTLANCA) AS DT_MAX
FROM   CTBLANCA L
WHERE  L.CODIGOEMPRESA = 4
  AND  L.DTLANCA       >= TRUNC(SYSDATE, 'MM')
  AND  L.DTLANCA       <  ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1);


-- BLOCO 11 - Total CPG_CONTRATOS Pioneira (vigentes no mes corrente)
-- Agora com a coluna certa: VIGENCIA_INICIO / VIGENCIA_FIM (descoberta rodada 3)
SELECT /*+ NO_PARALLEL */
       COUNT(*)                            AS QTD_CONTRATOS_TOTAL,
       SUM(CASE WHEN C.CONTRATO_INATIVO = 'S' THEN 1 ELSE 0 END) AS QTD_INATIVOS,
       SUM(CASE WHEN (C.VIGENCIA_FIM IS NULL OR C.VIGENCIA_FIM >= TRUNC(SYSDATE, 'MM'))
                 AND (C.VIGENCIA_INICIO IS NULL OR C.VIGENCIA_INICIO < ADD_MONTHS(TRUNC(SYSDATE, 'MM'), 1))
                THEN 1 ELSE 0 END)         AS QTD_VIGENTES_MES
FROM   CPG_CONTRATOS C
WHERE  C.CODIGO_EMPRESA = 4;


-- BLOCO 12 - Total CPG_CAD_ORCAMENTO Pioneira
SELECT /*+ NO_PARALLEL */
       COUNT(*) AS QTD_ORCAMENTOS,
       MAX(O.EXERCICIO) AS ULT_EXERCICIO
FROM   CPG_CAD_ORCAMENTO O;
-- CPG_CAD_ORCAMENTO nao tem CODIGOEMPRESA proprio (so 6 cols).
-- Filtrado depois via CODIGO_ORCAMENTO em outras tabelas.


-- =============================================================================
-- PARTE D - VALIDACAO DE INTEGRIDADE
-- =============================================================================

-- BLOCO 13 - CODCUSTO vs CODCUSTOFIN no CPGITDOC do mes
-- Sao o mesmo universo de chaves ou universos distintos?
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
-- FIM - 13 blocos. Tempo esperado: ~90s.
-- Apos isso, mapeamento esta fechado para iniciar o desenho do schema Postgres.
-- =============================================================================
