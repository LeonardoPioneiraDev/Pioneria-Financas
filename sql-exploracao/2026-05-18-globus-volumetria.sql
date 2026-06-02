-- =============================================================================
-- EXPLORAÇÃO GLOBUS — 2026-05-18
-- Empresa: 4 (Viação Pioneira) · Filial: 1
-- Objetivos:
--   (A) Dimensionar batches do sync histórico (linhas/mês por tabela-fato)
--   (B) Confirmar range temporal real dos dados (de quando até quando)
--   (C) Mapear tabelas auxiliares úteis pra puxar (centro custo, plano contas,
--       baixas/recebimentos, fornecedores etc.)
--   (D) Validar bug latente do CODTPDOC em CP
--
-- Como usar:
--   1. Abre no PL/SQL Developer
--   2. Roda o BLOCO 0 PRIMEIRO — anota o OWNER retornado
--   3. Roda os outros blocos em ordem; nos blocos 5/6, o PL/SQL Developer vai
--      pedir o valor de :OWNER — cola o que veio do bloco 0
--   4. Salva os results e me manda (CSV/print/cola direto aqui no chat)
-- =============================================================================


-- =============================================================================
-- BLOCO 0 — Descobrir o OWNER do schema Globus (RODE PRIMEIRO)
-- =============================================================================
SELECT DISTINCT OWNER
FROM   ALL_TABLES
WHERE  TABLE_NAME IN ('CPGDOCTO', 'CRCDOCTO', 'BGM_NOTAFISCAL', 'FLP_FICHAEVENTOS')
ORDER BY OWNER;
-- => anota o OWNER (provavelmente algo como PRAXIO, GLOBUS, PIONEIRA, etc.)
-- => usa esse valor nos binds :OWNER dos blocos 5 e 6.


-- =============================================================================
-- BLOCO 1 — Volume CP (CPGDOCTO) Pioneira por mês — últimos 24 meses
-- Dimensiona o tamanho do batch de sync histórico
-- =============================================================================
SELECT TRUNC(D.VENCIMENTOCPG, 'MM')                              AS MES_VENCIMENTO,
       COUNT(*)                                                  AS QTD_TITULOS,
       COUNT(DISTINCT D.CODIGOFORN)                              AS QTD_FORNECEDORES,
       ROUND(SUM(D.VLR_ORIGINAL), 2)                             AS SOMA_BRUTO,
       SUM(CASE WHEN D.QUITADODOCTOCPG = 'S' THEN 1 ELSE 0 END)  AS QTD_QUITADOS
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA   = 4
  AND  D.STATUSDOCTOCPG <> 'C'
  AND  D.VENCIMENTOCPG  >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -24)
GROUP BY TRUNC(D.VENCIMENTOCPG, 'MM')
ORDER BY MES_VENCIMENTO DESC;

-- BLOCO 1b — Total histórico CP Pioneira (range completo desde sempre)
SELECT COUNT(*)                AS TOTAL_LINHAS_HIST,
       MIN(D.VENCIMENTOCPG)    AS PRIMEIRA_VENC,
       MAX(D.VENCIMENTOCPG)    AS ULTIMA_VENC,
       MIN(D.EMISSAOCPG)       AS PRIMEIRA_EMISSAO,
       MAX(D.EMISSAOCPG)       AS ULTIMA_EMISSAO
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA = 4;

-- BLOCO 1c — Distribuição por CODTPDOC nos últimos 12 meses
-- => responde: devo filtrar só 'NF' no sync ou trazer todos os tipos?
SELECT D.CODTPDOC,
       COUNT(*)                AS QTD,
       MIN(D.VENCIMENTOCPG)    AS DT_MIN,
       MAX(D.VENCIMENTOCPG)    AS DT_MAX
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA   = 4
  AND  D.STATUSDOCTOCPG <> 'C'
  AND  D.VENCIMENTOCPG  >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -12)
GROUP BY D.CODTPDOC
ORDER BY QTD DESC;

-- BLOCO 1d — Origem dos lançamentos (MODULO_INCLUSAO) — entender o que está sendo importado
SELECT D.MODULO_INCLUSAO,
       COUNT(*)              AS QTD
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA   = 4
  AND  D.STATUSDOCTOCPG <> 'C'
  AND  D.VENCIMENTOCPG  >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -6)
GROUP BY D.MODULO_INCLUSAO
ORDER BY QTD DESC;


-- =============================================================================
-- BLOCO 2 — Volume CR (CRCDOCTO) Pioneira por mês — últimos 24 meses
-- =============================================================================
SELECT TRUNC(D.VENCIMENTOCRC, 'MM')                              AS MES_VENCIMENTO,
       COUNT(*)                                                  AS QTD_TITULOS,
       COUNT(DISTINCT D.CODCLI)                                  AS QTD_CLIENTES,
       SUM(CASE WHEN D.QUITADODOCTOCRC = 'S' THEN 1 ELSE 0 END)  AS QTD_QUITADOS,
       SUM(CASE WHEN D.STATUSDOCTOCRC = 'C' THEN 1 ELSE 0 END)   AS QTD_CANCELADOS
FROM   CRCDOCTO D
WHERE  D.CODIGOEMPRESA   = 4
  AND  D.VENCIMENTOCRC  >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -24)
GROUP BY TRUNC(D.VENCIMENTOCRC, 'MM')
ORDER BY MES_VENCIMENTO DESC;

-- BLOCO 2b — Total histórico CR Pioneira
SELECT COUNT(*)              AS TOTAL_LINHAS_HIST,
       MIN(D.EMISSAOCRC)     AS PRIMEIRA_EMISSAO,
       MAX(D.EMISSAOCRC)     AS ULTIMA_EMISSAO
FROM   CRCDOCTO D
WHERE  D.CODIGOEMPRESA = 4;

-- BLOCO 2c — Itens médios por título CR (dimensiona batch do IN(...) máx 1000 do Oracle)
SELECT MIN(QTD_ITENS) AS MIN_ITENS,
       ROUND(AVG(QTD_ITENS), 2) AS MED_ITENS,
       MAX(QTD_ITENS) AS MAX_ITENS,
       COUNT(*)       AS TITULOS_AMOSTRA
FROM (
  SELECT D.CODDOCTOCRC,
         (SELECT COUNT(*) FROM CRCITDOC I WHERE I.CODDOCTOCRC = D.CODDOCTOCRC) AS QTD_ITENS
  FROM   CRCDOCTO D
  WHERE  D.CODIGOEMPRESA  = 4
    AND  D.VENCIMENTOCRC >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -6)
);


-- =============================================================================
-- BLOCO 3 — Volume FLP (FLP_FICHAEVENTOS) Pioneira por competência — últimos 12m
-- Filtrado já pelo JOIN com VW_FUNCIONARIOS (empresa=4, filial=1)
-- =============================================================================
SELECT TRUNC(FE.COMPETFICHA, 'MM')      AS MES_COMP,
       FE.TIPOFOLHA,
       COUNT(*)                         AS QTD_LANCAMENTOS,
       COUNT(DISTINCT FE.CODINTFUNC)    AS QTD_FUNCIONARIOS
FROM   FLP_FICHAEVENTOS FE
JOIN   VW_FUNCIONARIOS F ON F.CODINTFUNC = FE.CODINTFUNC
WHERE  F.CODIGOEMPRESA = 4
  AND  F.CODIGOFL      = 1
  AND  FE.COMPETFICHA >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -12)
GROUP BY TRUNC(FE.COMPETFICHA, 'MM'), FE.TIPOFOLHA
ORDER BY MES_COMP DESC, FE.TIPOFOLHA;

-- BLOCO 3b — Range histórico FLP
SELECT MIN(FE.COMPETFICHA) AS PRIMEIRA,
       MAX(FE.COMPETFICHA) AS ULTIMA,
       COUNT(*)            AS TOTAL_LINHAS
FROM   FLP_FICHAEVENTOS FE
JOIN   VW_FUNCIONARIOS F ON F.CODINTFUNC = FE.CODINTFUNC
WHERE  F.CODIGOEMPRESA = 4 AND F.CODIGOFL = 1;


-- =============================================================================
-- BLOCO 4 — Volume Notas Fiscais (BGM_NOTAFISCAL) Pioneira — últimos 12 meses
-- =============================================================================
SELECT TRUNC(R.DATAEMISSAONF, 'MM')   AS MES_EMISSAO,
       COUNT(*)                       AS QTD_NF
FROM   BGM_NOTAFISCAL R
WHERE  R.CODIGOEMPRESA = 4
  AND  R.STATUSNF      = 'F'
  AND  R.CODTPDOC      = 'NF'
  AND  R.DATAEMISSAONF >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -12)
GROUP BY TRUNC(R.DATAEMISSAONF, 'MM')
ORDER BY MES_EMISSAO DESC;

-- BLOCO 4b — Itens médios por NF (dimensiona batch IN(...))
SELECT MIN(QTD) AS MIN_ITENS,
       ROUND(AVG(QTD), 2) AS MED_ITENS,
       MAX(QTD) AS MAX_ITENS,
       COUNT(*) AS NFS_AMOSTRA
FROM (
  SELECT R.CODINTNF,
         (SELECT COUNT(*) FROM EST_ITENSNF I WHERE I.CODINTNF = R.CODINTNF) AS QTD
  FROM   BGM_NOTAFISCAL R
  WHERE  R.CODIGOEMPRESA = 4
    AND  R.STATUSNF      = 'F'
    AND  R.CODTPDOC      = 'NF'
    AND  R.DATAEMISSAONF >= ADD_MONTHS(TRUNC(SYSDATE, 'MM'), -6)
);


-- =============================================================================
-- BLOCO 5 — INVENTÁRIO de tabelas auxiliares candidatas
-- Lista todas as tabelas do schema que podem interessar pra integração
-- => use o :OWNER que veio do BLOCO 0
-- =============================================================================
SELECT TABLE_NAME, NUM_ROWS
FROM   ALL_TABLES
WHERE  OWNER = :OWNER
  AND  (
        TABLE_NAME LIKE 'CPG_%'             -- Contas a pagar (pagamentos, baixas, ocorrencias)
    OR  TABLE_NAME LIKE 'CRC_%'             -- Contas a receber (recebimentos, baixas)
    OR  TABLE_NAME LIKE 'CTR_%'             -- Cadastros centrais (empresa, autorizadas)
    OR  TABLE_NAME LIKE 'BCO%'              -- Bancos
    OR  TABLE_NAME LIKE 'BGM_FORN%'         -- Fornecedores
    OR  TABLE_NAME LIKE 'EST_%'             -- Estoque/material/NF entrada
    OR  TABLE_NAME LIKE 'FLP_%'             -- Folha
    OR  TABLE_NAME LIKE 'BGM_%'             -- Cadastros gerais
    OR  TABLE_NAME LIKE '%CCUSTO%'          -- Centro de custo (qualquer prefixo)
    OR  TABLE_NAME LIKE '%PLANO%CONT%'      -- Plano de contas
    OR  TABLE_NAME LIKE 'VW_%'              -- Views já prontas
  )
ORDER BY TABLE_NAME;


-- =============================================================================
-- BLOCO 6 — SCHEMA das tabelas auxiliares de alto interesse
-- Roda DEPOIS do bloco 5 pra ver as colunas das que parecem mais úteis
-- => use o :OWNER que veio do BLOCO 0
-- =============================================================================

-- 6a — Fornecedores (hoje só estamos usando FAVORECIDODOCTOCPG como string)
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = :OWNER AND TABLE_NAME = 'BGM_FORNECEDOR'
ORDER BY COLUMN_ID;

-- 6b — Onde há referência a CCUSTO? (vai mostrar em quais tabelas existe centro de custo)
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = :OWNER
  AND  (COLUMN_NAME LIKE '%CCUSTO%' OR COLUMN_NAME LIKE '%CENTRO_CUS%')
ORDER BY TABLE_NAME, COLUMN_ID;

-- 6c — Plano de contas (qualquer tabela com COD_CONTA_CTB / CONTACTB)
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = :OWNER
  AND  (COLUMN_NAME LIKE '%CONTACTB%' OR COLUMN_NAME LIKE '%PLANOCT%')
ORDER BY TABLE_NAME, COLUMN_ID;

-- 6d — Tabelas de pagamento/baixa CP (extrato de quitação real)
SELECT TABLE_NAME, NUM_ROWS
FROM   ALL_TABLES
WHERE  OWNER = :OWNER
  AND  (TABLE_NAME LIKE 'CPG_PAG%'
     OR TABLE_NAME LIKE 'CPG_BAI%'
     OR TABLE_NAME LIKE 'CPG_QUI%'
     OR TABLE_NAME LIKE 'CPG_MOV%'
     OR TABLE_NAME LIKE 'CPGMOV%')
ORDER BY TABLE_NAME;

-- 6e — Tabelas de recebimento/baixa CR
SELECT TABLE_NAME, NUM_ROWS
FROM   ALL_TABLES
WHERE  OWNER = :OWNER
  AND  (TABLE_NAME LIKE 'CRC_REC%'
     OR TABLE_NAME LIKE 'CRC_BAI%'
     OR TABLE_NAME LIKE 'CRC_QUI%'
     OR TABLE_NAME LIKE 'CRC_MOV%'
     OR TABLE_NAME LIKE 'CRCMOV%')
ORDER BY TABLE_NAME;

-- 6f — Cadastros centrais (CTR_): empresa, filial, autorizadas etc.
SELECT TABLE_NAME, NUM_ROWS
FROM   ALL_TABLES
WHERE  OWNER = :OWNER
  AND  TABLE_NAME LIKE 'CTR_%'
ORDER BY TABLE_NAME;

-- 6g — Tabelas BCO (bancos, agências, contas)
SELECT TABLE_NAME, NUM_ROWS
FROM   ALL_TABLES
WHERE  OWNER = :OWNER
  AND  TABLE_NAME LIKE 'BCO%'
ORDER BY TABLE_NAME;


-- =============================================================================
-- BLOCO 7 — Atividade real recente (sanidade)
-- Confirma que está tudo "vivo" hoje na Pioneira
-- =============================================================================

-- Última NF emitida Pioneira
SELECT MAX(R.DATAEMISSAONF) AS ULTIMA_NF
FROM   BGM_NOTAFISCAL R
WHERE  R.CODIGOEMPRESA = 4
  AND  R.STATUSNF      = 'F'
  AND  R.CODTPDOC      = 'NF';

-- Último título CP Pioneira (por entrada — quando entrou no sistema, não quando vence)
SELECT MAX(D.ENTRADACPG) AS ULTIMA_ENTRADA_CP
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA = 4;

-- Último título CR Pioneira (por emissão)
SELECT MAX(D.EMISSAOCRC) AS ULTIMA_EMISSAO_CR
FROM   CRCDOCTO D
WHERE  D.CODIGOEMPRESA = 4;

-- Última competência FLP Pioneira
SELECT MAX(FE.COMPETFICHA) AS ULTIMA_COMP_FLP
FROM   FLP_FICHAEVENTOS FE
JOIN   VW_FUNCIONARIOS F ON F.CODINTFUNC = FE.CODINTFUNC
WHERE  F.CODIGOEMPRESA = 4 AND F.CODIGOFL = 1;
