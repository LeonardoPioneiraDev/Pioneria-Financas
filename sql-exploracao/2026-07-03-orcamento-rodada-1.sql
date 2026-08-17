-- =============================================================================
-- EXPLORACAO GLOBUS - 2026-07-03 - ORCAMENTO / PLANEJAMENTO - RODADA 1
-- Empresa: 4 (Viacao Pioneira)  ·  Owner: GLOBUS (Oracle, read-only)
--
-- OBJETIVO: descobrir se o ORCAMENTO da Pioneira vive no Globus (tabelas com
-- dado) ANTES de construir. A estrutura ja e conhecida (exploracao 18/05):
--   CPG_CAD_ORCAMENTO (cabecalho): CODIGO_ORCAMENTO, DESCRICAO, EXERCICIO,
--       PERMITE_DESPESA_MAIOR_RECEITA, UTILIZA_CENTRO_CUSTO
--   CPG_CAD_ORCAMENTO_PREVISOES (linhas): CODINTORC, CODIGO_ORCAMENTO,
--       DATAPREVISAO, VALOR, META, TIPORECEITA, TIPODESPESA, CODCUSTOFIN
-- Existe um segundo subsistema de orcamento (CPGORC*) — checamos qual e usado.
--
-- A pergunta-chave (igual foi na Depreciacao): as tabelas tem DADO, ou o
-- orcamento e feito por fora (planilha)? Isso decide o escopo:
--   - COM dado  -> modulo LE o orcado do Globus e cruza com o realizado que JA
--                  temos (finance.contas_pagar por CODCUSTOFIN). Pequeno.
--   - SEM dado  -> modulo precisa de import/cadastro do orcado (CSV/tela). Maior.
--
-- Responde tambem, com dado, as 3 perguntas ao financeiro:
--   Q1 (anual/trimestral?) -> granularidade de DATAPREVISAO + EXERCICIO
--   Q2 (como acompanham realizado x orcado?) -> se ha orcado por CODCUSTOFIN,
--       o cruzamento com nosso CP e imediato
--   Q3 (quantos centros de custo? por garagem?) -> distinct CODCUSTOFIN + nomes
--
-- SEGURANCA: metadado + COUNT + amostras ROWNUM<=20 + agregados leves. NO_PARALLEL.
-- Rodar bloco a bloco e colar o retorno.
-- =============================================================================


-- #############################################################################
-- PARTE A - ESTRUTURA (confirma colunas; acha se ha EMPRESA/EXERCICIO)
-- #############################################################################

-- BLOCO A1 - Subsistema principal (CPG_CAD_ORCAMENTO*)
SELECT /*+ NO_PARALLEL */
       TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, COLUMN_ID
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN (
    'CPG_CAD_ORCAMENTO',
    'CPG_CAD_ORCAMENTO_PREVISOES',
    'CPG_CAD_ORCAMENTO_USUARIO',
    'CPG_PREVISOES_HISTORICOS'
  )
ORDER BY TABLE_NAME, COLUMN_ID;

-- BLOCO A2 - Segundo subsistema (CPGORC*) — pode ser o realmente usado
SELECT /*+ NO_PARALLEL */
       TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, COLUMN_ID
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN ('CPGORCESTRUTURA', 'CPGORCITESTRUTURA', 'CPGORCPREVISOES')
ORDER BY TABLE_NAME, COLUMN_ID;

-- BLOCO A3 - Inventario: toda tabela GLOBUS com 'ORC' no nome (pega o que faltou)
SELECT /*+ NO_PARALLEL */ TABLE_NAME
FROM   ALL_TABLES
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME LIKE '%ORC%'
  AND  TABLE_NAME NOT LIKE '%\_BAK' ESCAPE '\'
  AND  TABLE_NAME NOT LIKE '%\_BKP%' ESCAPE '\'
  AND  TABLE_NAME NOT LIKE '%OLD%'
ORDER BY TABLE_NAME;


-- #############################################################################
-- PARTE B - TEM DADO? (a pergunta que decide o escopo)
-- #############################################################################

-- BLOCO B1 - Populacao de cada tabela dos dois subsistemas.
SELECT /*+ NO_PARALLEL */ 'CPG_CAD_ORCAMENTO'           AS TABELA, COUNT(*) AS QTD FROM CPG_CAD_ORCAMENTO
UNION ALL SELECT 'CPG_CAD_ORCAMENTO_PREVISOES', COUNT(*) FROM CPG_CAD_ORCAMENTO_PREVISOES
UNION ALL SELECT 'CPGORCESTRUTURA',             COUNT(*) FROM CPGORCESTRUTURA
UNION ALL SELECT 'CPGORCITESTRUTURA',           COUNT(*) FROM CPGORCITESTRUTURA
UNION ALL SELECT 'CPGORCPREVISOES',             COUNT(*) FROM CPGORCPREVISOES;


-- #############################################################################
-- PARTE C - AMOSTRAS (SELECT *, ROWNUM<=20 — seguro sem conhecer colunas)
-- #############################################################################

-- BLOCO C1 - Cabecalhos de orcamento (revela EXERCICIO, DESCRICAO, anos existentes)
SELECT * FROM CPG_CAD_ORCAMENTO WHERE ROWNUM <= 20;

-- BLOCO C2 - Linhas de previsao (revela VALOR, DATAPREVISAO, CODCUSTOFIN, TIPODESPESA)
SELECT * FROM CPG_CAD_ORCAMENTO_PREVISOES WHERE ROWNUM <= 20;

-- BLOCO C3 - Amostra do segundo subsistema (se tiver dado)
SELECT * FROM CPGORCPREVISOES WHERE ROWNUM <= 20;


-- #############################################################################
-- PARTE D - O ORCADO POR EXERCICIO + CENTRO DE CUSTO (se A/C confirmarem colunas)
-- Se algum bloco der erro de coluna inexistente, me manda o erro que ajusto
-- pela estrutura do A1.
-- #############################################################################

-- BLOCO D1 - Orcamentos por exercicio: quantas linhas, valor total, quantos
-- centros de custo. Mostra se o orcamento e anual e de quais anos.
SELECT /*+ NO_PARALLEL */
       O.CODIGO_ORCAMENTO,
       O.DESCRICAO,
       O.EXERCICIO,
       COUNT(*)                          AS QTD_PREVISOES,
       COUNT(DISTINCT P.CODCUSTOFIN)     AS QTD_CENTROS_CUSTO,
       ROUND(SUM(P.VALOR), 2)            AS VALOR_TOTAL,
       MIN(P.DATAPREVISAO)               AS DATA_MIN,
       MAX(P.DATAPREVISAO)               AS DATA_MAX
FROM   CPG_CAD_ORCAMENTO O
JOIN   CPG_CAD_ORCAMENTO_PREVISOES P ON P.CODIGO_ORCAMENTO = O.CODIGO_ORCAMENTO
GROUP BY O.CODIGO_ORCAMENTO, O.DESCRICAO, O.EXERCICIO
ORDER BY O.EXERCICIO DESC, O.CODIGO_ORCAMENTO;

-- BLOCO D2 - Orcado por CENTRO DE CUSTO no exercicio mais recente, com o nome do
-- centro (CPGCUSTOS — a MESMA tabela do "setor" do Contas a Pagar). Confirma se
-- o orcamento e por centro de custo e quais sao (bate com as ~8 unidades da
-- Pioneira que ja usamos no CP?).
SELECT /*+ NO_PARALLEL */
       P.CODCUSTOFIN,
       CC.DESCRICAO                      AS CENTRO_CUSTO,
       P.TIPODESPESA,
       COUNT(*)                          AS QTD_LINHAS,
       ROUND(SUM(P.VALOR), 2)            AS VALOR_ORCADO
FROM   CPG_CAD_ORCAMENTO_PREVISOES P
JOIN   CPG_CAD_ORCAMENTO O ON O.CODIGO_ORCAMENTO = P.CODIGO_ORCAMENTO
LEFT   JOIN CPGCUSTOS CC ON CC.CODIGO = P.CODCUSTOFIN
WHERE  O.EXERCICIO = (SELECT MAX(EXERCICIO) FROM CPG_CAD_ORCAMENTO)
GROUP BY P.CODCUSTOFIN, CC.DESCRICAO, P.TIPODESPESA
ORDER BY VALOR_ORCADO DESC;

-- =============================================================================
-- FIM DA RODADA 1. Com B1 (tem dado?) + C1/C2 (amostra) + D1/D2 (orcado por
-- exercicio e centro de custo) eu decido o escopo e desenho o modelo de dados.
-- =============================================================================
