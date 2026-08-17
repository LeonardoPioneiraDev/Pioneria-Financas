-- =====================================================================
-- QUANTIDADE de bens por classe (cadastro ATFITEM) — Globus, empresa 4.
-- Objetivo: enriquecer a tela de Depreciação com "quantos" por classe
-- (ônibus, auxiliares, instalações, computadores, móveis…), não só o valor.
--
-- ATFITEM.CONTA aponta pra conta contábil (CTBCONTA.CODCONTACTB). Uso subquery
-- (não JOIN) pra resolver o classificador sem risco de multiplicar linha
-- (CTBCONTA é chaveada por conta + plano). Só bens ATIVOS (DATABAIXA IS NULL).
-- Rode os 3 blocos e cole o resultado.
-- =====================================================================


-- (1) PRINCIPAL — qtd de bens ativos + valor de aquisição, por conta/classe.
--     O classificador (ex.: 1.3.02.01.1501) casa com as classes da tela.
SELECT ATF.CONTA,
       (SELECT MIN(C.CLASSIFICADOR) FROM CTBCONTA C WHERE C.CODCONTACTB = ATF.CONTA) AS classificador,
       (SELECT MIN(C.NOMECONTA)     FROM CTBCONTA C WHERE C.CODCONTACTB = ATF.CONTA) AS nome_conta,
       COUNT(*)                        AS qtd_bens_ativos,
       ROUND(SUM(ATF.AQUISVALOR), 2)   AS vlr_aquisicao
  FROM ATFITEM ATF
 WHERE ATF.CODIGOEMPRESA = 4
   AND ATF.DATABAIXA IS NULL
 GROUP BY ATF.CONTA
 ORDER BY vlr_aquisicao DESC;


-- (2) TOTAL geral (universo) — ativos x baixados, pra referência.
SELECT COUNT(CASE WHEN DATABAIXA IS NULL THEN 1 END)     AS bens_ativos,
       COUNT(CASE WHEN DATABAIXA IS NOT NULL THEN 1 END) AS bens_baixados,
       ROUND(SUM(CASE WHEN DATABAIXA IS NULL THEN AQUISVALOR END), 2) AS vlr_aquisicao_ativos
  FROM ATFITEM
 WHERE CODIGOEMPRESA = 4;


-- (3) CRUZAMENTO (opcional) — "quantos ônibus" pela frota real (FRT_CADVEICULOS),
--     por tipo de frota, como conferência do número da classe frota_operacional.
SELECT TF.DESCRICAOTPFROTA        AS tipo_frota,
       COUNT(*)                   AS qtd_veiculos
  FROM FRT_CADVEICULOS V
  LEFT JOIN FRT_TIPODEFROTA TF ON TF.CODIGOTPFROTA = V.CODIGOTPFROTA
 WHERE V.CODIGOEMPRESA = 4
   AND V.DTVENDAVEIC IS NULL          -- ainda na frota (não vendido); ajustar se a coluna diferir
 GROUP BY TF.DESCRICAOTPFROTA
 ORDER BY qtd_veiculos DESC;
