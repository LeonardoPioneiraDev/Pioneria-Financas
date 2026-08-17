-- =====================================================================
-- CONFIRMAÇÃO da despesa de depreciação do ARRENDAMENTO (Globus Oracle)
-- Empresa 4 · tabelas CTBSALDO + CTBCONTA.
--
-- PROBLEMA: a tela de Depreciação mostra despesa mensal ~R$ 39k, baixa demais
-- pra uma base com R$ 100M de direito de uso (arrendamento). A query de produção
-- só lê a conta de despesa 3.1.02.07 (frota PRÓPRIA, quase toda depreciada). A
-- amortização mensal do arrendamento cai em OUTRA conta que não lemos.
--
-- COMO RODAR: execute as 3 consultas abaixo (uma de cada vez, ou o script todo)
-- e cole os resultados de volta. A (1) é a mais importante.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) CATÁLOGO — todas as contas de depreciação/amortização/arrendamento,
-- com o classificador e o nome exatos. Revela a conta de DESPESA (começa com 3.)
-- da amortização do arrendamento que hoje NÃO capturamos.  <<< MAIS IMPORTANTE
-- ---------------------------------------------------------------------
SELECT C.CLASSIFICADOR,
       C.NOMECONTA,
       ROUND(SUM(S.VLDEBITOSALDO - S.VLCREDITOSALDO), 2) AS mov_liquida_total
  FROM CTBSALDO  S
  JOIN CTBCONTA  C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
 WHERE S.CODIGOEMPRESA = 4
   AND ( UPPER(C.NOMECONTA) LIKE '%DEPREC%'
      OR UPPER(C.NOMECONTA) LIKE '%AMORTIZ%'
      OR UPPER(C.NOMECONTA) LIKE '%DIREITO DE USO%'
      OR UPPER(C.NOMECONTA) LIKE '%ARREND%'
      OR UPPER(C.NOMECONTA) LIKE '%LEASING%' )
 GROUP BY C.CLASSIFICADOR, C.NOMECONTA
 ORDER BY C.CLASSIFICADOR;


-- ---------------------------------------------------------------------
-- (2) PROVA do gap (por mês, de 2025 em diante): despesa que a tela mostra hoje
-- (3.1.02.07) vs a amortização mensal do arrendamento (crédito na acumulada de
-- direito de uso, 1.3.02.51). Se `mov_acum_dir_uso` for grande (~R$ 1-2M) e a
-- despesa ~R$ 39k, está provado que a tela subestima.
-- ---------------------------------------------------------------------
SELECT S.PERIODOSALDO,
       ROUND(SUM(CASE WHEN C.CLASSIFICADOR LIKE '3.1.02.07%' THEN S.VLDEBITOSALDO - S.VLCREDITOSALDO ELSE 0 END), 2) AS despesa_3_1_02_07,
       ROUND(SUM(CASE WHEN C.CLASSIFICADOR LIKE '1.3.02.50%' THEN S.VLCREDITOSALDO - S.VLDEBITOSALDO ELSE 0 END), 2) AS mov_acum_propria,
       ROUND(SUM(CASE WHEN C.CLASSIFICADOR LIKE '1.3.02.51%' THEN S.VLCREDITOSALDO - S.VLDEBITOSALDO ELSE 0 END), 2) AS mov_acum_dir_uso
  FROM CTBSALDO  S
  JOIN CTBCONTA  C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
 WHERE S.CODIGOEMPRESA = 4
   AND S.PERIODOSALDO >= 202501
   AND ( C.CLASSIFICADOR LIKE '3.1.02.07%'
      OR C.CLASSIFICADOR LIKE '1.3.02.50%'
      OR C.CLASSIFICADOR LIKE '1.3.02.51%' )
 GROUP BY S.PERIODOSALDO
 ORDER BY S.PERIODOSALDO DESC;


-- ---------------------------------------------------------------------
-- (3) VALOR MENSAL (de 2024 em diante) das contas de despesa candidatas do
-- arrendamento (3.1.02.05 frota arrendada, 3.1.02.04 aeronave) vs a própria
-- (3.1.02.07). Confirma o tamanho do que hoje está invisível. Só analíticas
-- (exclui o sintético .0000).
-- ---------------------------------------------------------------------
SELECT S.PERIODOSALDO,
       ROUND(SUM(CASE WHEN C.CLASSIFICADOR LIKE '3.1.02.05%' THEN S.VLDEBITOSALDO - S.VLCREDITOSALDO ELSE 0 END), 2) AS amort_frota_arrend,
       ROUND(SUM(CASE WHEN C.CLASSIFICADOR LIKE '3.1.02.04%' THEN S.VLDEBITOSALDO - S.VLCREDITOSALDO ELSE 0 END), 2) AS amort_aeronave,
       ROUND(SUM(CASE WHEN C.CLASSIFICADOR LIKE '3.1.02.07%' THEN S.VLDEBITOSALDO - S.VLCREDITOSALDO ELSE 0 END), 2) AS deprec_propria
  FROM CTBSALDO  S
  JOIN CTBCONTA  C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
 WHERE S.CODIGOEMPRESA = 4
   AND S.PERIODOSALDO >= 202401
   AND ( C.CLASSIFICADOR LIKE '3.1.02.04%'
      OR C.CLASSIFICADOR LIKE '3.1.02.05%'
      OR C.CLASSIFICADOR LIKE '3.1.02.07%' )
   AND C.CLASSIFICADOR NOT LIKE '%.0000'
 GROUP BY S.PERIODOSALDO
 ORDER BY S.PERIODOSALDO DESC;
