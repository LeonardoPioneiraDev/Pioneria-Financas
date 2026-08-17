-- =============================================================================
-- EXPLORACAO GLOBUS - 2026-07-03 - ORCAMENTO - RODADA 2 (CPGORCPREVISOES)
-- Empresa: 4 (Viacao Pioneira)
--
-- CONTEXTO (rodada 1): o subsistema CPG_CAD_ORCAMENTO_* esta VAZIO. O dado de
-- orcamento vive em CPGORCPREVISOES (4.661 linhas), mas a amostra era empresa 1
-- / 2009. Esta rodada responde a pergunta que decide o escopo:
--   Existe orcamento de EMPRESA 4 (Pioneira) e RECENTE em CPGORCPREVISOES?
--     - SIM  -> cenario A: modulo LE o orcado do Globus e cruza com o realizado
--               que ja temos (finance.contas_pagar por CODCUSTOFIN).
--     - NAO  -> cenario B: orcamento vive fora do Globus; modulo precisa de
--               import/cadastro do orcado (CSV/tela). O realizado ja temos.
--
-- Colunas confirmadas do CPGORCPREVISOES: CODINTORC, CODIGOEMPRESA, CODIGOFL,
-- DATAPREVISAO, TIPORECEITA, TIPODESPESA, CCUSTOFINANC, MOEDA, VALOR (21,6),
-- JUSTIFICATIVA, TIPOCALCULO, VALORPREVISAO (20,2).
--
-- SEGURANCA: agregados leves + amostra ROWNUM<=20. NO_PARALLEL.
-- =============================================================================


-- BLOCO E1 - Distribuicao por EMPRESA: quantas linhas, faixa de datas, soma.
-- Mostra se a Pioneira (empresa 4) aparece e quao recente e o dado.
SELECT /*+ NO_PARALLEL */
       CODIGOEMPRESA,
       COUNT(*)                       AS QTD_LINHAS,
       MIN(DATAPREVISAO)              AS DATA_MIN,
       MAX(DATAPREVISAO)              AS DATA_MAX,
       COUNT(DISTINCT CCUSTOFINANC)   AS QTD_CENTROS_CUSTO,
       ROUND(SUM(VALOR), 2)           AS SOMA_VALOR,
       ROUND(SUM(VALORPREVISAO), 2)   AS SOMA_VALORPREVISAO
FROM   CPGORCPREVISOES
GROUP BY CODIGOEMPRESA
ORDER BY QTD_LINHAS DESC;


-- BLOCO E2 - Empresa 4 por ANO (EXTRACT do DATAPREVISAO). Se so houver anos
-- antigos (ou nenhum), o orcamento do Globus esta abandonado pra Pioneira.
SELECT /*+ NO_PARALLEL */
       EXTRACT(YEAR FROM DATAPREVISAO) AS ANO,
       COUNT(*)                        AS QTD_LINHAS,
       COUNT(DISTINCT CCUSTOFINANC)    AS QTD_CENTROS,
       ROUND(SUM(VALOR), 2)            AS SOMA_VALOR,
       ROUND(SUM(VALORPREVISAO), 2)    AS SOMA_VALORPREVISAO
FROM   CPGORCPREVISOES
WHERE  CODIGOEMPRESA = 4
GROUP BY EXTRACT(YEAR FROM DATAPREVISAO)
ORDER BY ANO DESC;


-- BLOCO E3 - Amostra crua de empresa 4 (se houver). Mostra qual coluna de valor
-- e usada (VALOR x VALORPREVISAO), granularidade da data (diaria/mensal), e se
-- e receita (TIPORECEITA) ou despesa (TIPODESPESA).
SELECT * FROM CPGORCPREVISOES WHERE CODIGOEMPRESA = 4 AND ROWNUM <= 20;


-- BLOCO E4 - Orcado da empresa 4 por CENTRO DE CUSTO no ano mais recente que
-- tiver dado, com o nome do centro (CPGCUSTOS — mesma tabela do "setor" do CP).
-- Se vier vazio, confirma cenario B.
SELECT /*+ NO_PARALLEL */
       P.CCUSTOFINANC,
       CC.DESCRICAO                    AS CENTRO_CUSTO,
       COUNT(*)                        AS QTD_LINHAS,
       ROUND(SUM(P.VALOR), 2)          AS SOMA_VALOR,
       ROUND(SUM(P.VALORPREVISAO), 2)  AS SOMA_VALORPREVISAO
FROM   CPGORCPREVISOES P
LEFT   JOIN CPGCUSTOS CC ON CC.CODIGO = P.CCUSTOFINANC
WHERE  P.CODIGOEMPRESA = 4
  AND  EXTRACT(YEAR FROM P.DATAPREVISAO) = (
         SELECT MAX(EXTRACT(YEAR FROM DATAPREVISAO))
         FROM   CPGORCPREVISOES WHERE CODIGOEMPRESA = 4
       )
GROUP BY P.CCUSTOFINANC, CC.DESCRICAO
ORDER BY SOMA_VALOR DESC;

-- =============================================================================
-- FIM DA RODADA 2. E1/E2 decidem A x B; E3/E4 (se houver empresa 4) mostram a
-- granularidade e o eixo de centro de custo pro modelo de dados.
-- =============================================================================
