-- =====================================================================
-- Classificação REAL dos eventos da folha (FLP_EVENTOS.TIPOEVEN).
-- Objetivo: corrigir o contracheque/totais — hoje o ETL normaliza A/C→P e
-- soma eventos de BASE/referência como renda, inflando os proventos.
-- P=provento, D=desconto, B=base/totalizador. A/C aparecem e são o problema.
-- Base: Globus Oracle.
-- =====================================================================


-- (1) Distribuição dos tipos — quantos eventos de cada TIPOEVEN existem.
SELECT E.TIPOEVEN, COUNT(*) AS qtd_eventos
  FROM FLP_EVENTOS E
 GROUP BY E.TIPOEVEN
 ORDER BY E.TIPOEVEN;


-- (2) Os eventos do contracheque do exemplo + totalizadores + benefícios.
-- Confirma o tipo REAL de cada um (esperado: 700/301 = B ou referência;
-- 15511 = D; 318/319/500 = B totalizadores; 900/901/902 = benefício).
SELECT E.CODEVENTO, E.DESCEVEN, E.TIPOEVEN
  FROM FLP_EVENTOS E
 WHERE E.CODEVENTO IN (
        1, 6, 700, 301, 749, 751, 757, 759,          -- proventos/refs do exemplo
        900, 901, 902, 207,                            -- benefícios + copart
        171, 175, 183, 607, 764, 15511,                -- descontos do exemplo
        318, 319, 500, 508, 315, 330, 300, 322         -- totalizadores/bases
       )
 ORDER BY E.CODEVENTO;


-- (3) Catálogo COMPLETO (pra remapear a classificação de vez).
-- Foco nos que podem estar mal classificados: tudo que NÃO é P/D "limpo".
SELECT E.CODEVENTO, E.DESCEVEN, E.TIPOEVEN
  FROM FLP_EVENTOS E
 ORDER BY
   CASE E.TIPOEVEN WHEN 'B' THEN 0 WHEN 'A' THEN 1 WHEN 'C' THEN 2
                   WHEN 'P' THEN 3 WHEN 'D' THEN 4 ELSE 5 END,
   E.CODEVENTO;
