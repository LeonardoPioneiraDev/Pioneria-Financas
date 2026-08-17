-- ============================================================================
-- DIAGNÓSTICO DA FOLHA — para enriquecer a tela /folha ("Encargos e Benefícios")
-- ----------------------------------------------------------------------------
-- Read-only. Empresa 4 (Pioneira), filiais (1,5,6,17,19).
-- Competência exemplo: folha de MAIO/2026 (paga em junho).
-- Ajuste as datas se quiser outra competência.
--
-- Convenção de data da folha (Praxio): a folha de maio pode ser gravada com
-- COMPETFICHA = 30/04 OU 31/05. Por isso o range semi-aberto [30/04, 01/06).
--
-- Rode uma query por vez e cole o resultado (pode resumir).
-- ============================================================================


-- ============================================================================
-- Q1 — O QUE REALMENTE ENTRA COMO "FOLHA" NO CONTAS A PAGAR (CPGDOCTO)
-- ----------------------------------------------------------------------------
-- Confirma se é só pensão alimentícia e quantifica por tipo de documento +
-- se tem marca de integração com a folha (COMPETENCIA_FLP / DATA_INTEGROU_FLP).
-- VLR_ORIGINAL_APROX = só ordem de grandeza (p/ pensão parcela única é fiel).
-- ============================================================================
SELECT
  D.CODTPDOC,
  CASE WHEN D.COMPETENCIA_FLP   IS NOT NULL THEN 'S' ELSE 'N' END AS TEM_COMPET_FLP,
  CASE WHEN D.DATA_INTEGROU_FLP IS NOT NULL THEN 'S' ELSE 'N' END AS TEM_INTEGROU_FLP,
  COUNT(*)                                   AS QTD,
  COUNT(DISTINCT D.CODIGOFORN)               AS QTD_FORN,
  ROUND(SUM(NVL(D.VLR_ORIGINAL,0)), 2)       AS VLR_ORIGINAL_APROX
FROM CPGDOCTO D
WHERE D.CODIGOEMPRESA = 4
  AND D.STATUSDOCTOCPG <> 'C'
  AND D.VENCIMENTOCPG >= DATE '2026-04-01'
  AND D.VENCIMENTOCPG <  DATE '2026-07-01'
  AND ( D.COMPETENCIA_FLP IS NOT NULL
     OR D.DATA_INTEGROU_FLP IS NOT NULL
     OR D.CODTPDOC IN ('FLP','FOL','SAL','RES','F13','FER','ADT','FOLHA','PEN','PNS') )
GROUP BY D.CODTPDOC,
  CASE WHEN D.COMPETENCIA_FLP   IS NOT NULL THEN 'S' ELSE 'N' END,
  CASE WHEN D.DATA_INTEGROU_FLP IS NOT NULL THEN 'S' ELSE 'N' END
ORDER BY QTD DESC;


-- ============================================================================
-- Q2 — CATÁLOGO DE EVENTOS DA FOLHA COM TOTAIS  (A QUERY-CHAVE)
-- ----------------------------------------------------------------------------
-- Lista cada verba do holerite (salário, INSS, FGTS, IRRF, VT, VA, etc.) e
-- quanto somou na competência. Serve pra mapear os encargos pelo CÓDIGO do
-- evento (preciso), em vez de heurística de texto ("LIKE '%INSS%'").
--   TIPOEVEN: P = provento, D = desconto, B = base/totalizador (não soma)
-- ============================================================================
SELECT
  E.CODEVENTO,
  E.DESCEVEN,
  E.TIPOEVEN,
  COUNT(DISTINCT F.CODFUNC)      AS QTD_FUNC,
  ROUND(SUM(FE.VALORFICHA), 2)   AS TOTAL
FROM FLP_FICHAEVENTOS FE
JOIN VW_FUNCIONARIOS F ON F.CODINTFUNC = FE.CODINTFUNC
JOIN FLP_EVENTOS     E ON E.CODEVENTO  = FE.CODEVENTO
WHERE F.CODIGOEMPRESA = 4
  AND F.CODIGOFL IN (1,5,6,17,19)
  AND FE.COMPETFICHA >= DATE '2026-04-30'
  AND FE.COMPETFICHA <  DATE '2026-06-01'
  AND FE.TIPOFOLHA = 1                         -- 1 = folha mensal
GROUP BY E.CODEVENTO, E.DESCEVEN, E.TIPOEVEN
ORDER BY E.TIPOEVEN, TOTAL DESC;


-- ============================================================================
-- Q3 — TIPOS DE FOLHA PRESENTES NA COMPETÊNCIA
-- ----------------------------------------------------------------------------
-- Mensal x adiantamento x 13o x férias x rescisão. Diz se a tela precisa
-- separar por tipo de folha.
--   (valores esperados de TIPOFOLHA: 1=mensal, 2=adiantamento, 3=13o,
--    4=férias, 5=rescisão — confirmar com o resultado)
-- ============================================================================
SELECT
  FE.TIPOFOLHA,
  COUNT(*)                       AS QTD_LANC,
  COUNT(DISTINCT F.CODFUNC)      AS QTD_FUNC,
  ROUND(SUM(FE.VALORFICHA), 2)   AS TOTAL_MOVIMENTADO
FROM FLP_FICHAEVENTOS FE
JOIN VW_FUNCIONARIOS F ON F.CODINTFUNC = FE.CODINTFUNC
WHERE F.CODIGOEMPRESA = 4
  AND F.CODIGOFL IN (1,5,6,17,19)
  AND FE.COMPETFICHA >= DATE '2026-04-30'
  AND FE.COMPETFICHA <  DATE '2026-06-01'
GROUP BY FE.TIPOFOLHA
ORDER BY FE.TIPOFOLHA;
