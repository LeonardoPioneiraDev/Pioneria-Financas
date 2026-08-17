-- =============================================================================
-- EXPLORACAO GLOBUS - 2026-07-03 - DEPRECIACAO - RODADA 3 (fechamento)
-- Empresa: 4 (Viacao Pioneira)
--
-- CONTEXTO (rodada 2): a rotina de depreciacao do Globus (ATF_DEPRECIACAO /
-- ATFITEM_DEPRECMES) esta VAZIA. A depreciacao e calculada por fora (planilha) e
-- so o resultado e lancado na contabilidade (conta 3.1.02.07.*), POR CLASSE.
--
-- OBJETIVO RODADA 3 - responder 2 perguntas que fecham o escopo:
--   (1) Existe ao menos um CADASTRO DE BENS no ATF (ATFITEM / ATF_AQUISICOES),
--       mesmo sem os valores de depreciacao? -> define se "por bem" e possivel.
--   (2) Quanto e a depreciacao do ARRENDAMENTO MERCANTIL (frota IFRS-16)? Provavel
--       que caia em 3.2.02.05/06, nao no 3.1.02.07 -> dimensiona a frota "real".
--
-- SEGURANCA: metadado + amostras ROWNUM<=20 + agregados leves. NO_PARALLEL.
-- =============================================================================


-- #############################################################################
-- PARTE L - EXISTE CADASTRO DE BENS NO ATF?  (mesmo com deprec vazia)
-- #############################################################################

-- BLOCO L1 - Estrutura das tabelas de cadastro/aquisicao de bem
SELECT /*+ NO_PARALLEL */
       TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, COLUMN_ID
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN (
    'ATFITEM',              -- o "bem" em si (cadastro do ativo)
    'ATF_AQUISICOES',       -- aquisicoes (valor de compra do bem)
    'ATFITEMCOMPRAVEIC'     -- ponte bem <-> compra de veiculo (FRT_COMPRAVEIC)
  )
ORDER BY TABLE_NAME, COLUMN_ID;

-- BLOCO L2 - Populacao: essas tabelas tem dados? (total + empresa 4 se a coluna existir)
SELECT /*+ NO_PARALLEL */ 'ATFITEM'        AS TABELA, COUNT(*) AS QTD FROM ATFITEM
UNION ALL
SELECT /*+ NO_PARALLEL */ 'ATF_AQUISICOES' AS TABELA, COUNT(*) AS QTD FROM ATF_AQUISICOES
UNION ALL
SELECT /*+ NO_PARALLEL */ 'ATFITEMCOMPRAVEIC' AS TABELA, COUNT(*) AS QTD FROM ATFITEMCOMPRAVEIC;

-- BLOCO L3 - Amostras (ROWNUM<=20). Se vierem linhas, ha registry aproveitavel.
SELECT * FROM ATFITEM WHERE ROWNUM <= 20;

-- BLOCO L4 - Amostra das aquisicoes (traz valor de aquisicao do bem, se houver)
SELECT * FROM ATF_AQUISICOES WHERE ROWNUM <= 20;


-- #############################################################################
-- PARTE M - DEPRECIACAO DO ARRENDAMENTO MERCANTIL (frota "real" hoje)
-- #############################################################################

-- BLOCO M1 - Despesa mensal das contas de depreciacao de bem arrendado
-- (3.2.02.05 e 3.2.02.06), empresa 4, ultimos ~18 meses. Dimensiona a
-- depreciacao da frota em arrendamento (direito de uso), que NAO aparece no 3.1.02.07.
SELECT /*+ NO_PARALLEL */
       S.PERIODOSALDO,
       C.CLASSIFICADOR,
       C.NOMECONTA,
       SUM(S.VLDEBITOSALDO) AS DESPESA_DEBITO,
       SUM(S.VLCREDITOSALDO) AS DESPESA_CREDITO
FROM   CTBSALDO S
JOIN   CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
WHERE  S.CODIGOEMPRESA = 4
  AND  (C.CLASSIFICADOR LIKE '3.2.02.05%' OR C.CLASSIFICADOR LIKE '3.2.02.06%')
  AND  S.PERIODOSALDO BETWEEN TO_CHAR(ADD_MONTHS(SYSDATE, -18), 'YYYYMM')
                          AND TO_CHAR(ADD_MONTHS(SYSDATE,  -1), 'YYYYMM')
GROUP BY S.PERIODOSALDO, C.CLASSIFICADOR, C.NOMECONTA
ORDER BY S.PERIODOSALDO DESC, C.CLASSIFICADOR;

-- =============================================================================
-- FIM. Com L2/L3 (tem cadastro de bens?) + M1 (deprec arrendamento) eu fecho o
-- escopo e desenho o modelo de dados definitivo do modulo Depreciacao Contabil.
-- =============================================================================
