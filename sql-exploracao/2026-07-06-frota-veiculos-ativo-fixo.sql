-- =============================================================================
-- DESCOBERTA — Frota / Ativo Fixo por VEÍCULO (Depreciação opção B)
-- Data: 2026-07-06
-- Rode no Oracle do Globus e me mande a saída de cada bloco. Tudo READ-ONLY.
--
-- Objetivo: o dono quer ver cada veículo (modelo, valor pago, depreciação, km,
-- ativo/inativo, quanto vendeu o inativo). A depreciação por veículo NÃO deve
-- estar no Globus (ATFITEM vazio — é planilha). Mas o CADASTRO da frota (valor,
-- modelo, situação, baixa/venda) deve existir. Este script encontra o que dá pra
-- ler e o que teremos que calcular.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1) ATIVO FIXO (ATF*): está mesmo vazio? Tabelas + contagem.
--    Se ATFITEM/ATFITEM_DEPRECMES tiver linhas p/ empresa 4, muda tudo (temos
--    depreciação por bem pronta). Se vier 0, confirma que é planilha.
-- -----------------------------------------------------------------------------
SELECT TABLE_NAME, NUM_ROWS
FROM   ALL_TABLES
WHERE  OWNER='GLOBUS'
  AND (TABLE_NAME LIKE 'ATF%' OR TABLE_NAME LIKE '%ATIVOFIX%' OR TABLE_NAME LIKE '%IMOBILIZ%')
ORDER BY NUM_ROWS DESC NULLS LAST
FETCH FIRST 40 ROWS ONLY;


-- -----------------------------------------------------------------------------
-- 2) CADASTRO DA FROTA: quais tabelas de veículo existem (com linhas)?
-- -----------------------------------------------------------------------------
SELECT TABLE_NAME, NUM_ROWS
FROM   ALL_TABLES
WHERE  OWNER='GLOBUS'
  AND (TABLE_NAME LIKE '%VEICULO%' OR TABLE_NAME LIKE 'FRT%' OR TABLE_NAME LIKE '%FROTA%'
    OR TABLE_NAME LIKE '%CHASSI%' OR TABLE_NAME LIKE '%VEIC%')
  AND NUM_ROWS > 0
ORDER BY NUM_ROWS DESC
FETCH FIRST 40 ROWS ONLY;


-- -----------------------------------------------------------------------------
-- 3) COLUNAS-CHAVE da frota: modelo, placa/prefixo, chassi, VALOR de aquisição,
--    data de aquisição, situação (ativo/inativo), baixa, hodômetro/km, fabricante,
--    carroceria. Varre TODAS as tabelas de veículo de uma vez.
-- -----------------------------------------------------------------------------
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER='GLOBUS'
  AND (TABLE_NAME LIKE '%VEICULO%' OR TABLE_NAME LIKE 'FRT%')
  AND (COLUMN_NAME LIKE '%MODELO%'   OR COLUMN_NAME LIKE '%PLACA%'    OR COLUMN_NAME LIKE '%PREFIXO%'
    OR COLUMN_NAME LIKE '%CHASSI%'   OR COLUMN_NAME LIKE '%VALOR%'    OR COLUMN_NAME LIKE '%AQUIS%'
    OR COLUMN_NAME LIKE '%SITUACAO%' OR COLUMN_NAME LIKE '%ATIVO%'    OR COLUMN_NAME LIKE '%INATIV%'
    OR COLUMN_NAME LIKE '%BAIXA%'    OR COLUMN_NAME LIKE '%HODOMETR%' OR COLUMN_NAME LIKE '%KM%'
    OR COLUMN_NAME LIKE '%FABRIC%'   OR COLUMN_NAME LIKE '%CARROCERIA%' OR COLUMN_NAME LIKE '%ANOFAB%'
    OR COLUMN_NAME LIKE '%RENAVAM%'  OR COLUMN_NAME LIKE '%FROTA%')
ORDER BY TABLE_NAME, COLUMN_NAME
FETCH FIRST 150 ROWS ONLY;


-- -----------------------------------------------------------------------------
-- 4) BAIXA / VENDA / ALIENAÇÃO do inativo: onde mora o "quanto vendeu"?
-- -----------------------------------------------------------------------------
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER='GLOBUS'
  AND (COLUMN_NAME LIKE '%ALIENACAO%'  OR COLUMN_NAME LIKE '%DTBAIXA%'    OR COLUMN_NAME LIKE '%DATABAIXA%'
    OR COLUMN_NAME LIKE '%VLRVENDA%'   OR COLUMN_NAME LIKE '%VALORVENDA%' OR COLUMN_NAME LIKE '%VLR_VENDA%'
    OR COLUMN_NAME LIKE '%MOTIVOBAIXA%' OR COLUMN_NAME LIKE '%VLRBAIXA%'  OR COLUMN_NAME LIKE '%VLRRESIDUAL%')
  AND (TABLE_NAME LIKE '%VEICULO%' OR TABLE_NAME LIKE 'FRT%' OR TABLE_NAME LIKE 'ATF%')
ORDER BY TABLE_NAME, COLUMN_NAME
FETCH FIRST 60 ROWS ONLY;


-- -----------------------------------------------------------------------------
-- 5) KM RODADO / HODÔMETRO / ABASTECIMENTO (base pra "depreciou por km"):
-- -----------------------------------------------------------------------------
SELECT TABLE_NAME, NUM_ROWS
FROM   ALL_TABLES
WHERE  OWNER='GLOBUS'
  AND (TABLE_NAME LIKE '%HODOMETRO%' OR TABLE_NAME LIKE '%ABASTEC%' OR TABLE_NAME LIKE '%QUILOMETR%'
    OR TABLE_NAME LIKE '%KMRODAD%'   OR TABLE_NAME LIKE '%_KM%')
  AND NUM_ROWS > 0
ORDER BY NUM_ROWS DESC
FETCH FIRST 25 ROWS ONLY;


-- #############################################################################
-- RODADA 2 — colunas + amostras das tabelas-chave (rode e me mande a saída)
-- Se algum "WHERE CODIGOEMPRESA = 4" der erro de coluna inexistente, remova o
-- WHERE daquela query (a tabela não é por empresa) e rode de novo.
-- #############################################################################


-- 7) ATFITEM — a DECISIVA: tem depreciação por bem? Colunas + contagem + amostra.
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
FROM   ALL_TAB_COLUMNS
WHERE  OWNER='GLOBUS' AND TABLE_NAME='ATFITEM'
ORDER BY COLUMN_ID;

SELECT COUNT(*) AS total_atfitem FROM GLOBUS.ATFITEM;

SELECT * FROM GLOBUS.ATFITEM FETCH FIRST 5 ROWS ONLY;


-- 8) FRT_CADVEICULOS — o cadastro da frota. Colunas + amostra (empresa 4).
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
FROM   ALL_TAB_COLUMNS
WHERE  OWNER='GLOBUS' AND TABLE_NAME='FRT_CADVEICULOS'
ORDER BY COLUMN_ID;

SELECT * FROM GLOBUS.FRT_CADVEICULOS WHERE CODIGOEMPRESA = 4 FETCH FIRST 5 ROWS ONLY;


-- 9) COMPRA e VENDA de veículo — valor pago e valor de venda do inativo.
SELECT 'COMPRA' AS TAB, COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS
  WHERE OWNER='GLOBUS' AND TABLE_NAME='FRT_COMPRAVEIC'
UNION ALL
SELECT 'VENDA', COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS
  WHERE OWNER='GLOBUS' AND TABLE_NAME='FRT_VENDAVEICULOS'
ORDER BY 1, 2;

SELECT * FROM GLOBUS.FRT_COMPRAVEIC   WHERE CODIGOEMPRESA = 4 FETCH FIRST 5 ROWS ONLY;
SELECT * FROM GLOBUS.FRT_VENDAVEICULOS WHERE CODIGOEMPRESA = 4 FETCH FIRST 5 ROWS ONLY;


-- 10) FRT_VEICULOSCUSTO — o que são os 1,48M de linhas? (combustível/peças/manut/mês?)
SELECT COLUMN_NAME, DATA_TYPE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER='GLOBUS' AND TABLE_NAME='FRT_VEICULOSCUSTO'
ORDER BY COLUMN_ID;

SELECT * FROM GLOBUS.FRT_VEICULOSCUSTO WHERE CODIGOEMPRESA = 4 FETCH FIRST 5 ROWS ONLY;


-- 11) MOT_KMDIARIOMOTOR — km rodado por veículo/dia. Colunas + amostra.
SELECT COLUMN_NAME, DATA_TYPE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER='GLOBUS' AND TABLE_NAME='MOT_KMDIARIOMOTOR'
ORDER BY COLUMN_ID
FETCH FIRST 30 ROWS ONLY;

SELECT * FROM GLOBUS.MOT_KMDIARIOMOTOR WHERE CODIGOEMPRESA = 4 FETCH FIRST 5 ROWS ONLY;


-- 12) VWTRR_VEICULOS — visão consolidada (situação ativo/inativo + ano fabricação).
SELECT * FROM GLOBUS.VWTRR_VEICULOS FETCH FIRST 8 ROWS ONLY;


-- 13) ATFITEMCOMPRAVEIC — a ponte ativo fixo <-> veículo (liga depreciação ao ônibus).
SELECT COLUMN_NAME, DATA_TYPE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER='GLOBUS' AND TABLE_NAME='ATFITEMCOMPRAVEIC'
ORDER BY COLUMN_ID;

SELECT * FROM GLOBUS.ATFITEMCOMPRAVEIC FETCH FIRST 5 ROWS ONLY;


-- #############################################################################
-- RODADA 3 — fecha o desenho (blocos independentes; nenhum WHERE frágil)
-- #############################################################################


-- 14) ATFITEM por empresa: onde está a frota da Pioneira e quantos ativos (sem baixa)?
SELECT CODIGOEMPRESA,
       COUNT(*)                                         AS itens,
       SUM(CASE WHEN DATABAIXA IS NULL THEN 1 ELSE 0 END) AS ativos,
       SUM(CASE WHEN CODIGOVEIC IS NOT NULL THEN 1 ELSE 0 END) AS com_veiculo
FROM   GLOBUS.ATFITEM
GROUP BY CODIGOEMPRESA
ORDER BY itens DESC;


-- 15) ATFITEM — amostra de itens de VEÍCULO ainda ATIVOS (o que interessa pro dono).
SELECT CODIGOEMPRESA, CODIGO, PATRIMONIO, DESCRICAO, MARCA, MODELO, ANO, PLACA, PREFIXO,
       CODIGOVEIC, AQUISDATA, AQUISVALOR, TAXADEPREC, TAXA_DEPR_CONTABIL,
       INICIO_DEPR_CONTABIL, VALOR_RESIDUAL, DATAFINDEPR, DATABAIXA, VLRBAIXA, HISTBAIXA
FROM   GLOBUS.ATFITEM
WHERE  CODIGOVEIC IS NOT NULL AND DATABAIXA IS NULL
ORDER BY AQUISDATA DESC
FETCH FIRST 10 ROWS ONLY;


-- 16) Existe DEPRECIAÇÃO ACUMULADA/MENSAL por item (ou temos que calcular da taxa)?
SELECT TABLE_NAME, NUM_ROWS
FROM   ALL_TABLES
WHERE  OWNER='GLOBUS' AND TABLE_NAME LIKE 'ATF%' AND (TABLE_NAME LIKE '%DEPR%' OR TABLE_NAME LIKE '%SALDO%' OR TABLE_NAME LIKE '%MOV%')
ORDER BY NUM_ROWS DESC NULLS LAST;


-- 17) FRT_VEICULOSCUSTO — o que são os 1,48M de linhas? Colunas + amostra (SEM filtro).
SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS
WHERE OWNER='GLOBUS' AND TABLE_NAME='FRT_VEICULOSCUSTO' ORDER BY COLUMN_ID;

SELECT * FROM GLOBUS.FRT_VEICULOSCUSTO FETCH FIRST 5 ROWS ONLY;


-- 18) MOT_KMDIARIOMOTOR — km rodado por veículo/dia. Colunas + amostra (SEM filtro).
SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS
WHERE OWNER='GLOBUS' AND TABLE_NAME='MOT_KMDIARIOMOTOR' ORDER BY COLUMN_ID FETCH FIRST 30 ROWS ONLY;

SELECT * FROM GLOBUS.MOT_KMDIARIOMOTOR FETCH FIRST 5 ROWS ONLY;


-- 19) Decode da situação do veículo (A/I/V) e da CODIGOSITVEIC.
SELECT TABLE_NAME FROM ALL_TABLES
WHERE OWNER='GLOBUS' AND (TABLE_NAME LIKE '%SITVEIC%' OR TABLE_NAME LIKE '%SITUACAO%VEIC%' OR TABLE_NAME LIKE 'FRT%SIT%');

-- Distribuicao da condicao no cadastro (quantos A / I / V) para empresa 4:
SELECT CONDICAOVEIC, COUNT(*) AS qtd
FROM   GLOBUS.FRT_CADVEICULOS
WHERE  CODIGOEMPRESA = 4
GROUP BY CONDICAOVEIC
ORDER BY qtd DESC;
