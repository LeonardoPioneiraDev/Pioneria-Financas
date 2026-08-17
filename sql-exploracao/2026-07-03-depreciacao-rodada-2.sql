-- =============================================================================
-- EXPLORACAO GLOBUS - 2026-07-03 - DEPRECIACAO - RODADA 2
-- Empresa: 4 (Viacao Pioneira)
--
-- CONTEXTO (rodada 1): a Pioneira JA calcula e contabiliza depreciacao dentro
-- do Globus. Existe um modulo de ATIVO FIXO (ATF_*) + tabela de taxas (FRE_*),
-- e a despesa mensal cai na conta contabil 31500 (~R$ 39 mil/mes).
--
-- OBJETIVO DA RODADA 2: mapear o modulo ATF_* (a FONTE que o modulo v2 vai LER)
-- e corrigir os 2 blocos que falharam/vieram zerados na rodada 1 (E1 e F2).
--
-- SEGURANCA: metadado + amostras ROWNUM<=20 + agregados leves. NO_PARALLEL.
-- Rodar bloco a bloco e colar o retorno.
-- =============================================================================


-- #############################################################################
-- PARTE G - MODULO DE ATIVO FIXO (ATF_*) + TABELA DE TAXAS (FRE_*)
-- #############################################################################

-- BLOCO G1 - Estrutura das tabelas do ativo fixo / depreciacao
SELECT /*+ NO_PARALLEL */
       TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, COLUMN_ID
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN (
    'ATF_DEPRECIACAO',                 -- controle de depreciacao por bem
    'ATFITEM_DEPRECMES',               -- depreciacao por item POR MES (granularidade-alvo)
    'FRE_TABELADEPRECO',               -- tabela de taxa/vida util
    'FREM_TABELADEPRECO',
    'FREM_TABELADEPRECO_AGRUPAMENTO'
  )
ORDER BY TABLE_NAME, COLUMN_ID;

-- BLOCO G1b - Inventario de TODAS as tabelas ATF_* (pode haver cadastro do bem,
-- baixa, categoria, etc. que nao apareceram no filtro por nome da rodada 1).
SELECT /*+ NO_PARALLEL */ TABLE_NAME
FROM   ALL_TABLES
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME LIKE 'ATF%'
ORDER BY TABLE_NAME;


-- #############################################################################
-- PARTE H - AMOSTRAS DO ATIVO FIXO (ROWNUM<=20, seguro)
-- #############################################################################

-- BLOCO H1 - Amostra do cadastro/controle de depreciacao
SELECT * FROM ATF_DEPRECIACAO WHERE ROWNUM <= 20;

-- BLOCO H2 - Amostra da depreciacao por mes (a linha que vira o "lancamento mensal" do modulo)
SELECT * FROM ATFITEM_DEPRECMES WHERE ROWNUM <= 20;

-- BLOCO H3 - Tabela de taxas/vida util (traz tudo, e pequena)
SELECT * FROM FRE_TABELADEPRECO WHERE ROWNUM <= 100;


-- #############################################################################
-- PARTE I - VOLUMETRIA + RECONCILIACAO COM A CONTABILIDADE
-- #############################################################################

-- BLOCO I1 - Quantos itens de depreciacao ha por mes (empresa 4), ultimos meses.
-- Se ATFITEM_DEPRECMES tiver CODIGOEMPRESA e uma coluna de competencia (AAAAMM
-- ou DATE), este bloco confirma a granularidade. Se der erro de coluna, me manda
-- o erro que ajusto pela estrutura do G1.
SELECT /*+ NO_PARALLEL */ COUNT(*) AS TOTAL_ITENS_DEPREC_MES
FROM   ATFITEM_DEPRECMES;

-- BLOCO I2 - Despesa de depreciacao contabilizada por mes (conta 31500 e familia
-- 3.1.02.07.*), empresa 4, ultimos ~18 meses fechados. Corrige o filtro da rodada 1
-- (nada de MAX(PERIODO), que pegava periodo futuro vazio).
SELECT /*+ NO_PARALLEL */
       S.PERIODOSALDO,
       C.CLASSIFICADOR,
       C.NOMECONTA,
       SUM(S.VLDEBITOSALDO) AS DESPESA_DEBITO,
       SUM(S.VLCREDITOSALDO) AS DESPESA_CREDITO
FROM   CTBSALDO S
JOIN   CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
WHERE  S.CODIGOEMPRESA = 4
  AND  C.CLASSIFICADOR LIKE '3.1.02.07%'
  AND  S.PERIODOSALDO BETWEEN TO_CHAR(ADD_MONTHS(SYSDATE, -18), 'YYYYMM')
                          AND TO_CHAR(ADD_MONTHS(SYSDATE,  -1), 'YYYYMM')
GROUP BY S.PERIODOSALDO, C.CLASSIFICADOR, C.NOMECONTA
ORDER BY S.PERIODOSALDO DESC, C.CLASSIFICADOR;


-- #############################################################################
-- PARTE J - SALDO DO IMOBILIZADO DA FROTA (corrige o E1 da rodada 1)
-- #############################################################################

-- BLOCO J1 - Saldo ACUMULADO (soma historica de todos os periodos) das contas de
-- imobilizado da frota, empresa 4. Como o ativo comeca em zero, somar o movimento
-- de todos os periodos = saldo em aberto. Mostra:
--   bruto  (1.3.02.01.* + 1.3.02.02.*),
--   deprec acumulada (1.3.02.50.*),
--   liquido = bruto - acumulada.
SELECT /*+ NO_PARALLEL */
       C.CLASSIFICADOR,
       C.NOMECONTA,
       SUM(S.VLDEBITOSALDO - S.VLCREDITOSALDO) AS SALDO_ATUAL
FROM   CTBSALDO S
JOIN   CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
WHERE  S.CODIGOEMPRESA = 4
  AND  (C.CLASSIFICADOR LIKE '1.3.02.01%'      -- imobilizado bruto (frota)
     OR C.CLASSIFICADOR LIKE '1.3.02.02%'      -- frota arrendamento mercantil
     OR C.CLASSIFICADOR LIKE '1.3.02.50%'      -- depreciacao acumulada
     OR C.CLASSIFICADOR LIKE '1.3.02.51%')     -- deprec direito de uso
GROUP BY C.CLASSIFICADOR, C.NOMECONTA
HAVING SUM(S.VLDEBITOSALDO - S.VLCREDITOSALDO) <> 0
ORDER BY C.CLASSIFICADOR;


-- #############################################################################
-- PARTE K - DRILL: um lancamento de depreciacao real (amarra ATF -> contabilidade)
-- #############################################################################

-- BLOCO K1 - Itens de lancamento contabil na despesa de depreciacao (conta pela
-- CLASSIFICADOR 3.1.02.07). Traz historico + valor + centro de custo. Mostra COMO
-- o Globus descreve o lancamento (util pra desenhar a apresentacao por garagem/CC).
SELECT /*+ NO_PARALLEL */
       L.CODLANCA, L.DTLANCA, I.CODCONTACTB, C.CLASSIFICADOR, C.NOMECONTA,
       I.DEBITOCREDITOITEMLANCA, I.VRITEMLANCA, I.CODCUSTO,
       SUBSTR(I.HISTORICOITEMLANCA, 1, 200) AS HISTORICO
FROM   CTBLANCA L
JOIN   CTBITLNC I ON I.CODLANCA = L.CODLANCA
JOIN   CTBCONTA C ON C.CODCONTACTB = I.CODCONTACTB AND C.NROPLANO = I.NROPLANO
WHERE  L.CODIGOEMPRESA = 4
  AND  C.CLASSIFICADOR LIKE '3.1.02.07%'
  AND  L.DTLANCA >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -3)
  AND  ROWNUM <= 30
ORDER BY L.DTLANCA DESC;

-- =============================================================================
-- FIM DA RODADA 2. Com o retorno de G1/H1/H2 eu ja desenho o modelo de dados do
-- modulo (entidades: ativo, depreciacao_mensal, tabela_taxa) e a query de sync.
-- =============================================================================
