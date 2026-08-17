-- =====================================================================
-- Exploração: FÉRIAS, 13º e PROVISÃO na folha real (FLP) — ANO 2025
-- Objetivo: decidir se o recurso "Provisão de férias e 13º" usa DADO REAL
--           (eventos que o Praxio já registra) em vez de fórmula estimada.
-- Base: Globus Oracle · empresa 4 · filiais (1,5,6,17,19)
-- Rodar as 3 e mandar o resultado.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) CATÁLOGO DE TIPOS DE FOLHA EM 2025
-- Mostra quais TIPOFOLHA existem (1=Mensal, 2=Adiantamento, 3=13º,
-- 4=Férias?, 5=Rescisão?) e o peso de cada um. Confirma se férias e 13º
-- têm folha própria ou vêm dentro da mensal.
-- ---------------------------------------------------------------------
SELECT FE.TIPOFOLHA,
       COUNT(*)                                            AS lancamentos,
       COUNT(DISTINCT FE.CODINTFUNC)                       AS funcionarios,
       COUNT(DISTINCT TO_CHAR(FE.COMPETFICHA,'YYYY-MM'))   AS meses,
       MIN(FE.COMPETFICHA)                                 AS primeira_comp,
       MAX(FE.COMPETFICHA)                                 AS ultima_comp,
       ROUND(SUM(FE.VALORFICHA),2)                         AS soma_reais
  FROM FLP_FICHAEVENTOS FE
  JOIN VW_FUNCIONARIOS  F ON F.CODINTFUNC = FE.CODINTFUNC
 WHERE F.CODIGOEMPRESA = 4
   AND F.CODIGOFL IN (1,5,6,17,19)
   AND FE.COMPETFICHA >= TO_DATE('2025-01-01','YYYY-MM-DD')
   AND FE.COMPETFICHA <  TO_DATE('2026-01-01','YYYY-MM-DD')
 GROUP BY FE.TIPOFOLHA
 ORDER BY FE.TIPOFOLHA;


-- ---------------------------------------------------------------------
-- (2) EVENTOS DE FÉRIAS / 13º / PROVISÃO (catálogo + valor 2025)
-- Lista os CODEVENTO/DESCEVEN reais que casam com férias, 13º, provisão,
-- abono. "meses" = em quantas competências aquele evento apareceu
-- (provisão mensal apareceria em ~12; 13º só em nov/dez/rescisão).
-- ---------------------------------------------------------------------
SELECT E.CODEVENTO,
       E.DESCEVEN,
       E.TIPOEVEN,                                          -- P=provento D=desconto B=base
       COUNT(*)                                            AS lancamentos,
       COUNT(DISTINCT FE.CODINTFUNC)                       AS funcionarios,
       COUNT(DISTINCT TO_CHAR(FE.COMPETFICHA,'YYYY-MM'))   AS meses,
       ROUND(SUM(FE.VALORFICHA),2)                         AS soma_reais
  FROM FLP_FICHAEVENTOS FE
  JOIN VW_FUNCIONARIOS  F ON F.CODINTFUNC = FE.CODINTFUNC
  JOIN FLP_EVENTOS      E ON E.CODEVENTO  = FE.CODEVENTO
 WHERE F.CODIGOEMPRESA = 4
   AND F.CODIGOFL IN (1,5,6,17,19)
   AND FE.COMPETFICHA >= TO_DATE('2025-01-01','YYYY-MM-DD')
   AND FE.COMPETFICHA <  TO_DATE('2026-01-01','YYYY-MM-DD')
   AND ( UPPER(E.DESCEVEN) LIKE '%FERIAS%'
      OR UPPER(E.DESCEVEN) LIKE '%FÉRIAS%'
      OR UPPER(E.DESCEVEN) LIKE '%DECIMO%'
      OR UPPER(E.DESCEVEN) LIKE '%DÉCIMO%'
      OR UPPER(E.DESCEVEN) LIKE '%TERCEIRO%'
      OR UPPER(E.DESCEVEN) LIKE '%13%'
      OR UPPER(E.DESCEVEN) LIKE '%NATAL%'
      OR UPPER(E.DESCEVEN) LIKE '%PROVIS%'
      OR UPPER(E.DESCEVEN) LIKE '%ABONO%' )
 GROUP BY E.CODEVENTO, E.DESCEVEN, E.TIPOEVEN
 ORDER BY soma_reais DESC;


-- ---------------------------------------------------------------------
-- (3) DISTRIBUIÇÃO MENSAL — férias / 13º / provisão ao longo de 2025
-- Mostra o "formato" no tempo: provisão apareceria estável todo mês;
-- 13º concentrado no fim do ano; férias pulverizado. Isso decide se
-- mostramos "realizado" (evento pago) ou "provisão" (acúmulo mensal).
-- ---------------------------------------------------------------------
SELECT TO_CHAR(FE.COMPETFICHA,'YYYY-MM')                   AS competencia,
       FE.TIPOFOLHA,
       CASE
         WHEN UPPER(E.DESCEVEN) LIKE '%PROVIS%' THEN 'PROVISAO'
         WHEN UPPER(E.DESCEVEN) LIKE '%FERIAS%' OR UPPER(E.DESCEVEN) LIKE '%FÉRIAS%'
           OR UPPER(E.DESCEVEN) LIKE '%ABONO%' THEN 'FERIAS'
         ELSE '13_SALARIO'
       END                                                 AS categoria,
       COUNT(DISTINCT FE.CODINTFUNC)                       AS funcionarios,
       ROUND(SUM(FE.VALORFICHA),2)                         AS soma_reais
  FROM FLP_FICHAEVENTOS FE
  JOIN VW_FUNCIONARIOS  F ON F.CODINTFUNC = FE.CODINTFUNC
  JOIN FLP_EVENTOS      E ON E.CODEVENTO  = FE.CODEVENTO
 WHERE F.CODIGOEMPRESA = 4
   AND F.CODIGOFL IN (1,5,6,17,19)
   AND FE.COMPETFICHA >= TO_DATE('2025-01-01','YYYY-MM-DD')
   AND FE.COMPETFICHA <  TO_DATE('2026-01-01','YYYY-MM-DD')
   AND ( UPPER(E.DESCEVEN) LIKE '%FERIAS%'
      OR UPPER(E.DESCEVEN) LIKE '%FÉRIAS%'
      OR UPPER(E.DESCEVEN) LIKE '%DECIMO%'
      OR UPPER(E.DESCEVEN) LIKE '%DÉCIMO%'
      OR UPPER(E.DESCEVEN) LIKE '%TERCEIRO%'
      OR UPPER(E.DESCEVEN) LIKE '%13%'
      OR UPPER(E.DESCEVEN) LIKE '%NATAL%'
      OR UPPER(E.DESCEVEN) LIKE '%PROVIS%'
      OR UPPER(E.DESCEVEN) LIKE '%ABONO%' )
 GROUP BY TO_CHAR(FE.COMPETFICHA,'YYYY-MM'), FE.TIPOFOLHA,
       CASE
         WHEN UPPER(E.DESCEVEN) LIKE '%PROVIS%' THEN 'PROVISAO'
         WHEN UPPER(E.DESCEVEN) LIKE '%FERIAS%' OR UPPER(E.DESCEVEN) LIKE '%FÉRIAS%'
           OR UPPER(E.DESCEVEN) LIKE '%ABONO%' THEN 'FERIAS'
         ELSE '13_SALARIO'
       END
 ORDER BY competencia, categoria;


-- ---------------------------------------------------------------------
-- (4) TIPO 5 vs 35 vs 3 em DEZ/2025 — resolver a duplicação do 13º
-- Se 5 e 35 tiverem os MESMOS eventos/valores → são o mesmo 13º em
-- duplicidade (usar só um). Se forem complementares (ex.: um é a 1ª
-- parcela/adiantamento) → somar. Também esclarece o que é o tipo 3.
-- ---------------------------------------------------------------------
SELECT FE.TIPOFOLHA,
       E.CODEVENTO,
       E.DESCEVEN,
       E.TIPOEVEN,
       COUNT(DISTINCT FE.CODINTFUNC)  AS funcionarios,
       ROUND(SUM(FE.VALORFICHA),2)    AS soma_reais
  FROM FLP_FICHAEVENTOS FE
  JOIN VW_FUNCIONARIOS  F ON F.CODINTFUNC = FE.CODINTFUNC
  JOIN FLP_EVENTOS      E ON E.CODEVENTO  = FE.CODEVENTO
 WHERE F.CODIGOEMPRESA = 4
   AND F.CODIGOFL IN (1,5,6,17,19)
   AND FE.COMPETFICHA >= TO_DATE('2025-12-01','YYYY-MM-DD')
   AND FE.COMPETFICHA <  TO_DATE('2026-01-01','YYYY-MM-DD')
   AND FE.TIPOFOLHA IN (3,5,35)
   AND E.TIPOEVEN IN ('P','D')          -- só proventos/descontos (tira as bases)
 GROUP BY FE.TIPOFOLHA, E.CODEVENTO, E.DESCEVEN, E.TIPOEVEN
 ORDER BY FE.TIPOFOLHA, soma_reais DESC;
