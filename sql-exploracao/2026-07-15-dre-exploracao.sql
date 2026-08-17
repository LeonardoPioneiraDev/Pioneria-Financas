-- =====================================================================
-- DRE — exploração pra desenhar as linhas a partir do dado real.
-- Globus, empresa 4. Objetivo: (Q1) que classes de conta existem no resultado;
-- (Q2) o esqueleto sintético das contas de resultado (as linhas da DRE);
-- (Q3) as tabelas de estrutura de DRE do Globus estão preenchidas?
-- Uso a competência 202605 (mai/2026, sabidamente com dado). Rode e cole tudo.
-- =====================================================================


-- (Q1) TOP-LEVEL — quais classes de conta existem e sua natureza (débito x crédito).
--      Espero: 1 ativo, 2 passivo, 3 despesa, 4 receita (confirma a numeração).
SELECT SUBSTR(C.CLASSIFICADOR, 1, 1)                 AS classe,
       COUNT(DISTINCT C.CLASSIFICADOR)               AS qtd_contas,
       ROUND(SUM(S.VLDEBITOSALDO), 2)                AS debito,
       ROUND(SUM(S.VLCREDITOSALDO), 2)               AS credito
  FROM CTBSALDO S
  JOIN CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
 WHERE S.CODIGOEMPRESA = 4
   AND S.PERIODOSALDO = '202605'
 GROUP BY SUBSTR(C.CLASSIFICADOR, 1, 1)
 ORDER BY classe;


-- (Q2) ESQUELETO DA DRE — contas de resultado (classe 3/4/5/6) até 3 níveis
--      (ex.: 3.1, 3.1.02, 4.1, 4.1.01). São as candidatas a LINHA da DRE.
--      débito = despesa/custo; crédito = receita. .0000 = sintético (rollup).
SELECT C.CLASSIFICADOR,
       C.NOMECONTA,
       ROUND(SUM(S.VLDEBITOSALDO), 2)  AS debito,
       ROUND(SUM(S.VLCREDITOSALDO), 2) AS credito,
       ROUND(SUM(S.VLDEBITOSALDO - S.VLCREDITOSALDO), 2) AS saldo_devedor_liq
  FROM CTBSALDO S
  JOIN CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
 WHERE S.CODIGOEMPRESA = 4
   AND S.PERIODOSALDO = '202605'
   AND REGEXP_LIKE(C.CLASSIFICADOR, '^[3456]')
   AND REGEXP_COUNT(C.CLASSIFICADOR, '\.') <= 2       -- só níveis sintéticos (linhas)
 GROUP BY C.CLASSIFICADOR, C.NOMECONTA
 ORDER BY C.CLASSIFICADOR;


-- (Q3a) As tabelas de estrutura de DRE do Globus EXISTEM? (não dá erro se não)
SELECT TABLE_NAME, NUM_ROWS
  FROM ALL_TABLES
 WHERE OWNER = 'GLOBUS'
   AND TABLE_NAME IN ('CTBCDDRE', 'CTBITDRE', 'CTBDRE', 'CTBMODELODRE', 'CTBITMODELODRE')
 ORDER BY TABLE_NAME;

-- (Q3b) Colunas dessas tabelas (pra entender a estrutura, se existirem).
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, COLUMN_ID
  FROM ALL_TAB_COLUMNS
 WHERE OWNER = 'GLOBUS'
   AND TABLE_NAME IN ('CTBCDDRE', 'CTBITDRE', 'CTBDRE', 'CTBMODELODRE', 'CTBITMODELODRE')
 ORDER BY TABLE_NAME, COLUMN_ID;

-- (Q3c) Estão PREENCHIDAS? (⚠️ se a tabela não existir, ESTA linha dá erro —
--       o erro já é a resposta "não usam". Rode por último/separado.)
SELECT 'CTBCDDRE' AS tabela, COUNT(*) AS qtd FROM CTBCDDRE
UNION ALL
SELECT 'CTBITDRE' AS tabela, COUNT(*) AS qtd FROM CTBITDRE;
