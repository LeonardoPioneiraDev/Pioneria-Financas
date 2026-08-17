-- =====================================================================
-- DECISIVO — onde mora (se mora) a depreciação/amortização mensal.
-- Empresa 4 · CTBSALDO + CTBCONTA · períodos 2025-01 em diante.
--
-- Uma tabela: cada conta de deprec/amort/ROU, mês a mês, com DÉBITO e
-- CRÉDITO separados + o net. Lê-se assim:
--   • net ~R$ 39k/mês só na acumulada da própria (1.3.02.50)  → ROU NÃO é
--     depreciado no razão (está só em planilha) → banner fica, vira pergunta.
--   • alguma acumulada (1.3.02.5x) crescendo ~R$ 1M/mês        → ACHAMOS: é a
--     conta do ROU; pego o 3.x de despesa do mesmo par e ligo no ETL.
--   • 3.1.02.05 com débito ≈ crédito (net pequeno)             → o "R$ 13M" é
--     reclassificação, não despesa; ignorar.
--
-- Cole o resultado inteiro de volta.
-- =====================================================================
SELECT S.PERIODOSALDO,
       C.CLASSIFICADOR,
       C.NOMECONTA,
       ROUND(SUM(S.VLDEBITOSALDO), 2)                       AS debito,
       ROUND(SUM(S.VLCREDITOSALDO), 2)                      AS credito,
       ROUND(SUM(S.VLDEBITOSALDO - S.VLCREDITOSALDO), 2)    AS net
  FROM CTBSALDO S
  JOIN CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB
                 AND C.NROPLANO   = S.NROPLANO
 WHERE S.CODIGOEMPRESA = 4
   AND S.PERIODOSALDO >= 202501
   AND C.CLASSIFICADOR NOT LIKE '%.0000'          -- só analíticas (exclui sintético)
   AND ( UPPER(C.NOMECONTA) LIKE '%DEPREC%'
      OR UPPER(C.NOMECONTA) LIKE '%AMORTIZ%'
      OR UPPER(C.NOMECONTA) LIKE '%DIREITO DE USO%'
      OR UPPER(C.NOMECONTA) LIKE '%ARREND%'
      OR UPPER(C.NOMECONTA) LIKE '%LEASING%'
      OR C.CLASSIFICADOR LIKE '3.1.02.0%'         -- família despesa imobilizado
      OR C.CLASSIFICADOR LIKE '1.3.02.5%' )        -- família acumulada (redutora)
 GROUP BY S.PERIODOSALDO, C.CLASSIFICADOR, C.NOMECONTA
HAVING SUM(S.VLDEBITOSALDO) <> 0 OR SUM(S.VLCREDITOSALDO) <> 0
 ORDER BY S.PERIODOSALDO DESC, C.CLASSIFICADOR;
