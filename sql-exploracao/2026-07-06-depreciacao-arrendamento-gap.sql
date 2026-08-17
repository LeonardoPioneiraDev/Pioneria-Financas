-- =====================================================================
-- Investigação: a despesa de depreciação mostrada (~R$39k/mês) é baixa demais
-- para uma base com R$100M de DIREITO DE USO (arrendamento). Suspeita: a
-- amortização do arrendamento é escriturada em conta FORA de 3.1.02.07 (a única
-- que o sistema lê hoje), subestimando a despesa mensal.
-- Base: Globus Oracle (CTBSALDO + CTBCONTA) · empresa 4.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (1) CATÁLOGO — todas as contas de depreciação/amortização/arrendamento
-- Revela se existe uma conta de DESPESA (3.x) de "amortização de direito de
-- uso / arrendamento" que hoje NÃO é capturada (só pegamos 3.1.02.07).
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
-- (2) CRUZAMENTO MENSAL — despesa que capturamos vs movimento real da
-- depreciação/amortização acumulada.
-- despesa_3_1_02_07  = o que a tela mostra hoje (só depreciação própria).
-- mov_acum_propria   = crédito do mês na acum. de depreciação própria (1.3.02.50).
-- mov_acum_dir_uso   = crédito do mês na acum. de amortização do direito de uso
--                      (1.3.02.51) = a amortização do ARRENDAMENTO no mês.
-- Se `mov_acum_dir_uso` for grande (~R$1–2M) e a despesa capturada for ~R$39k,
-- está PROVADO que a tela subestima a despesa (falta o arrendamento).
-- ---------------------------------------------------------------------
SELECT S.PERIODOSALDO,
       ROUND(SUM(CASE WHEN C.CLASSIFICADOR LIKE '3.1.02.07%' THEN S.VLDEBITOSALDO - S.VLCREDITOSALDO ELSE 0 END), 2) AS despesa_3_1_02_07,
       ROUND(SUM(CASE WHEN C.CLASSIFICADOR LIKE '1.3.02.50%' THEN S.VLCREDITOSALDO - S.VLDEBITOSALDO ELSE 0 END), 2) AS mov_acum_propria,
       ROUND(SUM(CASE WHEN C.CLASSIFICADOR LIKE '1.3.02.51%' THEN S.VLCREDITOSALDO - S.VLDEBITOSALDO ELSE 0 END), 2) AS mov_acum_dir_uso
  FROM CTBSALDO  S
  JOIN CTBCONTA  C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
 WHERE S.CODIGOEMPRESA = 4
   AND ( C.CLASSIFICADOR LIKE '3.1.02.07%'
      OR C.CLASSIFICADOR LIKE '1.3.02.50%'
      OR C.CLASSIFICADOR LIKE '1.3.02.51%' )
 GROUP BY S.PERIODOSALDO
 ORDER BY S.PERIODOSALDO DESC;


-- ---------------------------------------------------------------------
-- (3) MENSAL das contas de despesa que FALTAM (arrendamento) vs a que temos.
-- Confirma o tamanho da amortização mensal do arrendamento (frota + aeronave)
-- que hoje está invisível na tela. Só analíticas (exclui o sintético .0000).
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
