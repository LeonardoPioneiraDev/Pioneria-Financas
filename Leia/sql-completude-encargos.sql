-- ============================================================================
-- COMPLETUDE DAS CATEGORIAS DE ENCARGOS/BENEFÍCIOS
-- ----------------------------------------------------------------------------
-- Objetivo: descobrir se há verba relevante FORA das categorias que a tela
-- "Encargos & Benefícios" mostra hoje — pra decidir se vale criar categoria nova.
--
-- Rodar direto no Oracle (Globus). Empresa 4, filiais (1,5,6,17,19).
-- Competência exemplo: folha de MAIO/2026, folha mensal (TIPOFOLHA=1).
-- Ajuste as datas se quiser outra.
--
-- Códigos JÁ mapeados na tela (não precisam aparecer como "fora"):
--   INSS 171,191,169 · FGTS 508,505,506,507 · IRRF 172,170,608 ·
--   ticket 900 · cesta 901 · seguro 902 · adiantamento 607 ·
--   consignado 764,766,767,768,769,824,825,826,827 · sindicato 195 ·
--   pensão 163,189,161 · totalizadores 318,319,500,300,315,322,330,310,311,313,321,
--   325,328,329,571,192,514 (bases/totais, TIPOEVEN='B'/'C'/'A').
-- ============================================================================


-- ============================================================================
-- Q4 — DESCONTOS (TIPOEVEN='D') QUE FICAM FORA DAS CATEGORIAS
-- ----------------------------------------------------------------------------
-- Se aparecer algo grande aqui (ex.: plano de saúde, vale-dinheiro), vale virar
-- categoria própria. Ordena pelo maior valor.
-- ============================================================================
SELECT
  E.CODEVENTO,
  E.DESCEVEN,
  COUNT(DISTINCT F.CODFUNC)      AS QTD_FUNC,
  ROUND(SUM(FE.VALORFICHA), 2)   AS TOTAL
FROM FLP_FICHAEVENTOS FE
JOIN VW_FUNCIONARIOS F ON F.CODINTFUNC = FE.CODINTFUNC
JOIN FLP_EVENTOS     E ON E.CODEVENTO  = FE.CODEVENTO
WHERE F.CODIGOEMPRESA = 4
  AND F.CODIGOFL IN (1,5,6,17,19)
  AND FE.COMPETFICHA >= DATE '2026-04-30'
  AND FE.COMPETFICHA <  DATE '2026-06-01'
  AND FE.TIPOFOLHA = 1
  AND E.TIPOEVEN = 'D'
  AND E.CODEVENTO NOT IN (
    171,191,169, 172,170,608, 195, 163,189,161, 607,
    764,766,767,768,769,824,825,826,827
  )
GROUP BY E.CODEVENTO, E.DESCEVEN
HAVING SUM(FE.VALORFICHA) <> 0
ORDER BY TOTAL DESC;


-- ============================================================================
-- Q5 — EXISTE PLANO DE SAÚDE / CONVÊNIO / ODONTO NA FOLHA?
-- ----------------------------------------------------------------------------
-- Procura por verbas de saúde em qualquer tipo de evento (catálogo completo),
-- pra confirmar se a Pioneira desconta plano de saúde na folha (e sob qual nome).
-- ============================================================================
SELECT
  E.CODEVENTO,
  E.DESCEVEN,
  E.TIPOEVEN
FROM FLP_EVENTOS E
WHERE UPPER(E.DESCEVEN) LIKE '%SAUDE%'
   OR UPPER(E.DESCEVEN) LIKE '%SAÚDE%'
   OR UPPER(E.DESCEVEN) LIKE '%CONVENIO%'
   OR UPPER(E.DESCEVEN) LIKE '%CONVÊNIO%'
   OR UPPER(E.DESCEVEN) LIKE '%PLANO%'
   OR UPPER(E.DESCEVEN) LIKE '%ODONTO%'
   OR UPPER(E.DESCEVEN) LIKE '%MEDIC%'
   OR UPPER(E.DESCEVEN) LIKE '%FARMAC%'
ORDER BY E.CODEVENTO;
