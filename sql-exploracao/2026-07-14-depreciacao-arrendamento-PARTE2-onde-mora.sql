-- =====================================================================
-- PARTE 2 — "onde mora" a depreciação mensal do ARRENDAMENTO (ROU)
-- Empresa 4 · CTBSALDO + CTBCONTA.
--
-- CONTEXTO: a Parte 1 confirmou que 3.1.02.05 (arrend frota) e 3.1.02.04
-- (aeronave) são as contas de despesa do arrendamento. MAS o movimento
-- mensal de 3.1.02.05 dá ~R$ 13 MILHÕES/mês — implausível pra depreciação de
-- R$ 100M de direito de uso (que seria ~R$ 1M/mês). E a acumulada de
-- depreciação (1.3.02.50) só cresce ~R$ 39k/mês (= só a frota própria). Ou
-- seja, 3.1.02.05 NÃO parece ser a depreciação mensal do ROU.
--
-- Estas consultas ajudam a achar ONDE (se em algum lugar) a depreciação
-- mensal do ROU é escriturada — pra levar a pergunta certa ao controller.
-- Rode e cole o resultado.
-- =====================================================================


-- ---------------------------------------------------------------------
-- (A) 3.1.02.04 / 3.1.02.05 / 3.1.02.07 — DÉBITO e CRÉDITO SEPARADOS por mês
-- (2025 em diante). Se débito ≈ crédito (net pequeno), o "R$ 13M" é ilusão de
-- reclassificação; se débito grande e crédito ~0, é lançamento pesado mesmo.
-- ---------------------------------------------------------------------
SELECT S.PERIODOSALDO,
       C.CLASSIFICADOR,
       C.NOMECONTA,
       ROUND(SUM(S.VLDEBITOSALDO), 2)  AS debito,
       ROUND(SUM(S.VLCREDITOSALDO), 2) AS credito,
       ROUND(SUM(S.VLDEBITOSALDO - S.VLCREDITOSALDO), 2) AS net
  FROM CTBSALDO S
  JOIN CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
 WHERE S.CODIGOEMPRESA = 4
   AND S.PERIODOSALDO >= 202501
   AND C.CLASSIFICADOR LIKE '3.1.02.0%'
   AND C.CLASSIFICADOR NOT LIKE '%.0000'
   AND (C.CLASSIFICADOR LIKE '3.1.02.04%' OR C.CLASSIFICADOR LIKE '3.1.02.05%' OR C.CLASSIFICADOR LIKE '3.1.02.07%')
 GROUP BY S.PERIODOSALDO, C.CLASSIFICADOR, C.NOMECONTA
 ORDER BY S.PERIODOSALDO DESC, C.CLASSIFICADOR;


-- ---------------------------------------------------------------------
-- (B) TODAS as contas de DEPRECIAÇÃO/AMORTIZAÇÃO ACUMULADA (redutoras do ativo,
-- classificador 1.3.02.5x) e seu movimento de CRÉDITO por mês. Procuramos uma
-- conta acumulada que cresça ~R$ 1M/mês = a depreciação real do ROU. Se só a
-- 1.3.02.50 (~R$ 39k/mês) existir, o ROU NÃO está sendo depreciado no razão.
-- ---------------------------------------------------------------------
SELECT S.PERIODOSALDO,
       C.CLASSIFICADOR,
       C.NOMECONTA,
       ROUND(SUM(S.VLCREDITOSALDO - S.VLDEBITOSALDO), 2) AS mov_credito_liq
  FROM CTBSALDO S
  JOIN CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
 WHERE S.CODIGOEMPRESA = 4
   AND S.PERIODOSALDO >= 202501
   AND C.CLASSIFICADOR LIKE '1.3.02.5%'
 GROUP BY S.PERIODOSALDO, C.CLASSIFICADOR, C.NOMECONTA
HAVING SUM(S.VLCREDITOSALDO - S.VLDEBITOSALDO) <> 0
 ORDER BY S.PERIODOSALDO DESC, C.CLASSIFICADOR;
