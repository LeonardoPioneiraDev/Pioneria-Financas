-- =====================================================================
-- QUANTIDADES v2 — Globus, empresa 4.
-- Query 1 (v1) mostrou que ATFITEM.CONTA NÃO é o classificador do razão
-- (plano patrimonial próprio, granular). Então: veículos vêm do FRT_CADVEICULOS
-- (bloco A), e pros demais bens preciso descobrir o de-para do ATF (bloco B).
-- =====================================================================


-- ---------------------------------------------------------------------
-- (A) VEÍCULOS ativos por tipo de frota e garagem — "quantos ônibus/auxiliares".
--     Fonte viva e autoritativa (FRT_CADVEICULOS), padrão da sua query de Frota.
-- ---------------------------------------------------------------------
SELECT CASE V.CODIGOGA
         WHEN 31  THEN 'PARANOÁ/ITAPOÃ'
         WHEN 124 THEN 'SANTA MARIA'
         WHEN 239 THEN 'SÃO SEBASTIÃO'
         WHEN 240 THEN 'GAMA'
         ELSE 'OUTRA (' || V.CODIGOGA || ')'
       END                                            AS garagem,
       NVL(TF.DESCRICAOTPFROTA, 'TIPO ' || V.CODIGOTPFROTA) AS tipo_frota,
       COUNT(*)                                       AS qtd_veiculos
  FROM FRT_CADVEICULOS V
  LEFT JOIN FRT_TIPODEFROTA TF ON TF.CODIGOTPFROTA = V.CODIGOTPFROTA
 WHERE V.CODIGOEMPRESA = 4
   AND V.CONDICAOVEIC = 'A'          -- só ativos
 GROUP BY V.CODIGOGA, V.CODIGOTPFROTA, TF.DESCRICAOTPFROTA
 ORDER BY garagem, qtd_veiculos DESC;


-- ---------------------------------------------------------------------
-- (A2) Total de veículos ativos por tipo (consolidado, todas as garagens).
-- ---------------------------------------------------------------------
SELECT NVL(TF.DESCRICAOTPFROTA, 'TIPO ' || V.CODIGOTPFROTA) AS tipo_frota,
       COUNT(*) AS qtd_veiculos
  FROM FRT_CADVEICULOS V
  LEFT JOIN FRT_TIPODEFROTA TF ON TF.CODIGOTPFROTA = V.CODIGOTPFROTA
 WHERE V.CODIGOEMPRESA = 4
   AND V.CONDICAOVEIC = 'A'
 GROUP BY V.CODIGOTPFROTA, TF.DESCRICAOTPFROTA
 ORDER BY qtd_veiculos DESC;


-- ---------------------------------------------------------------------
-- (B1) Estrutura do ATFITEM — pra achar o campo que dá a CLASSE/TIPO do bem
--      (algo como TIPO/GRUPO/DESCRICAO), já que CONTA não serve.
-- ---------------------------------------------------------------------
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE, COLUMN_ID
  FROM ALL_TAB_COLUMNS
 WHERE OWNER = 'GLOBUS' AND TABLE_NAME = 'ATFITEM'
 ORDER BY COLUMN_ID;


-- ---------------------------------------------------------------------
-- (B2) Tabelas do módulo ATF — pra achar o plano de contas / grupo de bem do ATF
--      (ex.: ATFCONTA, ATF_GRUPO, ATFCLASSE…) que descreve o ATFITEM.CONTA.
-- ---------------------------------------------------------------------
SELECT TABLE_NAME
  FROM ALL_TABLES
 WHERE OWNER = 'GLOBUS' AND TABLE_NAME LIKE 'ATF%'
 ORDER BY TABLE_NAME;
