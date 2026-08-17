-- =============================================================================
-- EXPLORACAO GLOBUS - 2026-07-03 - DEPRECIACAO / ATIVO IMOBILIZADO - RODADA 1
-- Empresa: 4 (Viacao Pioneira) - Filial IN (1,5,6,17,19)
-- Owner: GLOBUS  (Oracle, read-only)
--
-- OBJETIVO: mapear a base de dados da frota + descobrir se a depreciacao JA e
-- calculada/lancada dentro do Globus (contabilidade), ANTES de construir o modulo.
-- Isso responde com DADO (nao com opiniao) 2 das 3 perguntas ao financeiro:
--   Q1 "Em qual sistema a depreciacao e feita hoje?"  -> Partes D e E
--   Q2 "Qual a vida util usada pra onibus?"            -> deriva da taxa em D/E
--   Q3 "Ha ativos nao-frota relevantes?"               -> Parte F (inventario)
--
-- SEGURANCA: rodada 100% segura.
--   - Partes A: so metadado (ALL_TAB_COLUMNS) - instantaneo.
--   - Partes B: amostras com ROWNUM <= 20 - nao varre tabela inteira.
--   - Partes C/D/E: agregados leves com filtro de empresa/periodo.
--   - NO_PARALLEL em tudo (Oracle compartilhado com a operacao critica).
--
-- COMO RODAR: bloco a bloco no PL/SQL Developer. Cola o resultado de cada bloco
-- de volta (pode ser print / export CSV). Onde o resultado for grande, as
-- primeiras ~20 linhas ja bastam.
-- =============================================================================


-- #############################################################################
-- PARTE A - ESTRUTURA DAS TABELAS (metadado, instantaneo)
-- #############################################################################

-- BLOCO A1 - Frota: cadastro, compra, tipo/categoria, carroceria
SELECT /*+ NO_PARALLEL */
       TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, COLUMN_ID
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN (
    'FRT_CADVEICULOS',   -- cadastro do veiculo (chassi, placa, prefixo, ano, status)
    'FRT_COMPRAVEIC',    -- compra do veiculo (valor de aquisicao, data, fornecedor, NF)
    'FRT_TIPODEFROTA',   -- categoria/tipo de frota (onibus / micro / apoio / etc.)
    'FRT_MARCACARROC',   -- marca da carroceria
    'FRT_MODCARROC'      -- modelo da carroceria
  )
ORDER BY TABLE_NAME, COLUMN_ID;


-- BLOCO A2 - Contabil: item do lancamento (onde mora o VALOR do lancamento)
-- CTBLANCA (cabecalho) ja mapeado; CTBITLNC nunca foi.
SELECT /*+ NO_PARALLEL */
       COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, COLUMN_ID
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS' AND TABLE_NAME = 'CTBITLNC'
ORDER BY COLUMN_ID;


-- #############################################################################
-- PARTE B - AMOSTRAS DE DADOS (ROWNUM <= 20, seguro sem conhecer colunas)
-- #############################################################################

-- BLOCO B1 - Amostra do cadastro de veiculos
SELECT * FROM FRT_CADVEICULOS WHERE ROWNUM <= 20;

-- BLOCO B2 - Amostra da compra de veiculos
SELECT * FROM FRT_COMPRAVEIC WHERE ROWNUM <= 20;

-- BLOCO B3 - Catalogo de tipo/categoria de frota (tabela pequena - traz tudo)
SELECT * FROM FRT_TIPODEFROTA WHERE ROWNUM <= 100;


-- #############################################################################
-- PARTE C - VOLUMETRIA DA FROTA (quantos veiculos, sao da Pioneira?)
-- #############################################################################

-- BLOCO C1 - Total de veiculos cadastrados (sem filtro - baseline)
SELECT /*+ NO_PARALLEL */ COUNT(*) AS TOTAL_VEICULOS FROM FRT_CADVEICULOS;

-- BLOCO C2 - Veiculos da Pioneira (empresa 4).
-- OBS: se FRT_CADVEICULOS nao tiver CODIGOEMPRESA/CODIGOFL, este bloco vai dar
-- erro de coluna - nesse caso me avisa que ajusto pela estrutura do bloco A1.
SELECT /*+ NO_PARALLEL */ COUNT(*) AS VEICULOS_PIONEIRA
FROM   FRT_CADVEICULOS V
WHERE  V.CODIGOEMPRESA = 4;


-- #############################################################################
-- PARTE D - A DEPRECIACAO JA ESTA NA CONTABILIDADE DO GLOBUS?  (chave!)
-- #############################################################################

-- BLOCO D1 - Contas contabeis cujo NOME menciona depreciacao / imobilizado.
-- Se aparecerem contas aqui, a Pioneira TEM plano de contas pra depreciacao.
SELECT /*+ NO_PARALLEL */
       C.NROPLANO, C.CODCONTACTB, C.CLASSIFICADOR, C.NOMECONTA
FROM   CTBCONTA C
WHERE  UPPER(C.NOMECONTA) LIKE '%DEPREC%'
    OR UPPER(C.NOMECONTA) LIKE '%IMOBILIZ%'
    OR UPPER(C.NOMECONTA) LIKE '%AMORTIZ%'
ORDER BY C.CLASSIFICADOR;

-- BLOCO D2 - Essas contas TEM saldo/movimento recente pra empresa 4?
-- Se VLDEBITOSALDO/VLCREDITOSALDO vierem preenchidos nos ultimos meses, a
-- depreciacao JA e lancada dentro do Globus (muda todo o escopo do modulo:
-- viramos LEITOR do que existe, nao CALCULADORA de algo inexistente).
-- PERIODOSALDO e CHAR(6) no formato AAAAMM.
SELECT /*+ NO_PARALLEL */
       S.PERIODOSALDO,
       S.CODCONTACTB,
       C.NOMECONTA,
       SUM(S.VLDEBITOSALDO) AS TOTAL_DEBITO,
       SUM(S.VLCREDITOSALDO) AS TOTAL_CREDITO
FROM   CTBSALDO S
JOIN   CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
WHERE  S.CODIGOEMPRESA = 4
  AND  (UPPER(C.NOMECONTA) LIKE '%DEPREC%' OR UPPER(C.NOMECONTA) LIKE '%AMORTIZ%')
  AND  S.PERIODOSALDO >= TO_CHAR(ADD_MONTHS(SYSDATE, -12), 'YYYYMM')
GROUP BY S.PERIODOSALDO, S.CODCONTACTB, C.NOMECONTA
ORDER BY S.PERIODOSALDO DESC, S.CODCONTACTB;


-- #############################################################################
-- PARTE E - VALOR DO ATIVO IMOBILIZADO (contas de bem, nao de despesa)
-- #############################################################################

-- BLOCO E1 - Saldo das contas de ATIVO IMOBILIZADO (veiculos/frota) p/ empresa 4,
-- ultimo periodo disponivel. Mostra o "custo historico" que serve de base de
-- depreciacao. Cruza depois com FRT_COMPRAVEIC pra validar bem-a-bem.
SELECT /*+ NO_PARALLEL */
       S.PERIODOSALDO,
       C.CLASSIFICADOR,
       C.NOMECONTA,
       SUM(S.VLDEBITOSALDO - S.VLCREDITOSALDO) AS SALDO_LIQUIDO
FROM   CTBSALDO S
JOIN   CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
WHERE  S.CODIGOEMPRESA = 4
  AND  (UPPER(C.NOMECONTA) LIKE '%VEICUL%'
     OR UPPER(C.NOMECONTA) LIKE '%FROTA%'
     OR UPPER(C.NOMECONTA) LIKE '%ONIBUS%'
     OR UPPER(C.NOMECONTA) LIKE '%IMOBILIZ%')
  AND  S.PERIODOSALDO = (
         SELECT MAX(S2.PERIODOSALDO) FROM CTBSALDO S2 WHERE S2.CODIGOEMPRESA = 4
       )
GROUP BY S.PERIODOSALDO, C.CLASSIFICADOR, C.NOMECONTA
ORDER BY C.CLASSIFICADOR;


-- #############################################################################
-- PARTE F - EXISTEM ATIVOS NAO-FROTA? (Q3 do financeiro)
-- #############################################################################

-- BLOCO F1 - Inventario de tabelas que cheiram a "ativo imobilizado / patrimonio".
-- Se houver um cadastro de bens fora da frota (imoveis, equipamentos, TI), ele
-- provavelmente esta numa destas.
SELECT /*+ NO_PARALLEL */ TABLE_NAME
FROM   ALL_TABLES
WHERE  OWNER = 'GLOBUS'
  AND  ( TABLE_NAME LIKE '%IMOBIL%'
      OR TABLE_NAME LIKE '%PATRIM%'
      OR TABLE_NAME LIKE '%DEPREC%'
      OR TABLE_NAME LIKE '%ATIVO%'
      OR TABLE_NAME LIKE 'ATV\_%' ESCAPE '\'
      OR TABLE_NAME LIKE 'AIM\_%' ESCAPE '\' )
  AND  TABLE_NAME NOT LIKE '%\_BAK' ESCAPE '\'
  AND  TABLE_NAME NOT LIKE '%\_BKP%' ESCAPE '\'
  AND  TABLE_NAME NOT LIKE '%OLD%'
ORDER BY TABLE_NAME;

-- BLOCO F2 - Todas as contas de imobilizado no plano (leque completo do que a
-- Pioneira classifica como ativo depreciavel - frota + nao-frota).
SELECT /*+ NO_PARALLEL */
       C.CLASSIFICADOR, C.NOMECONTA
FROM   CTBCONTA C
WHERE  C.CLASSIFICADOR LIKE '1.2%'     -- ativo nao-circulante (imobilizado costuma cair aqui)
ORDER BY C.CLASSIFICADOR;

-- =============================================================================
-- FIM DA RODADA 1 - depois de me mandar os resultados eu monto a rodada 2
-- (amostra dirigida por coluna real + cruzamento FRT_COMPRAVEIC x CTBSALDO) e
-- ja consigo desenhar o modelo de dados do modulo Depreciacao.
-- =============================================================================
