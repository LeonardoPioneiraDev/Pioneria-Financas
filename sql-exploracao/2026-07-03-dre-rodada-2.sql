-- =============================================================================
-- EXPLORACAO GLOBUS - 2026-07-03 - DRE - RODADA 2 (a receita, o mes certo)
-- Empresa: 4 (Viacao Pioneira)
--
-- CONTEXTO (rodada 1b): a DRE contabil e montavel do razao (plano 1, classe 3 =
-- 495 contas despesa, classe 4 = 131 receita). A estrutura de DRE do Globus esta
-- em branco -> montamos nos (cenario B). MAS a mini-DRE de 1 mes trouxe despesa
-- cheia (R$ 31,8M) e receita quase zero (grupo 4.1 CARTAO CIDADAO = R$ 0),
-- sugerindo ATRASO de fechamento da receita.
--
-- Esta rodada crava:
--   (1) Em quais meses a receita (classe 4) aparece cheia? (padrao de lancamento)
--   (2) Quais sao as contas de receita REAIS (a estrutura da receita de transporte/GDF)?
--   (3) Um mes fechado "de verdade" fecha uma DRE coerente (receita ~ despesa)?
--
-- SEGURANCA: agregados leves por periodo. NO_PARALLEL. Rodar cada SELECT separado.
-- =============================================================================


-- BLOCO G1 - Receita x Despesa TOTAL por periodo (empresa 4), ultimos 15 meses.
-- Mostra o padrao: se a receita so aparece em meses mais antigos = atraso de
-- fechamento; se aparece todo mes = o mes do B2 era atipico. Escolhe o mes de
-- referencia certo pra DRE.
SELECT /*+ NO_PARALLEL */
       S.PERIODOSALDO,
       ROUND(SUM(CASE WHEN C.CLASSIFICADOR LIKE '4%'
                      THEN S.VLCREDITOSALDO - S.VLDEBITOSALDO ELSE 0 END), 2) AS RECEITA,
       ROUND(SUM(CASE WHEN C.CLASSIFICADOR LIKE '3%'
                      THEN S.VLDEBITOSALDO - S.VLCREDITOSALDO ELSE 0 END), 2) AS DESPESA
FROM   CTBSALDO S
JOIN   CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
WHERE  S.CODIGOEMPRESA = 4
  AND  (C.CLASSIFICADOR LIKE '3%' OR C.CLASSIFICADOR LIKE '4%')
  AND  C.CLASSIFICADOR NOT LIKE '%.0000'
  AND  S.PERIODOSALDO >= TO_CHAR(ADD_MONTHS(SYSDATE, -15), 'YYYYMM')
GROUP BY S.PERIODOSALDO
ORDER BY S.PERIODOSALDO DESC;


-- BLOCO G2 - As contas de RECEITA reais (classe 4) por movimento acumulado nos
-- ultimos 15 meses. Revela a estrutura da receita (transporte/cartao cidadao,
-- subsidio/GDF, outras) pra desenhar as linhas da DRE. So contas com movimento.
SELECT /*+ NO_PARALLEL */
       C.CLASSIFICADOR,
       C.NOMECONTA,
       ROUND(SUM(S.VLCREDITOSALDO - S.VLDEBITOSALDO), 2) AS RECEITA_ACUM
FROM   CTBSALDO S
JOIN   CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
WHERE  S.CODIGOEMPRESA = 4
  AND  C.CLASSIFICADOR LIKE '4%'
  AND  C.CLASSIFICADOR NOT LIKE '%.0000'
  AND  S.PERIODOSALDO >= TO_CHAR(ADD_MONTHS(SYSDATE, -15), 'YYYYMM')
GROUP BY C.CLASSIFICADOR, C.NOMECONTA
HAVING ROUND(SUM(S.VLCREDITOSALDO - S.VLDEBITOSALDO), 2) <> 0
ORDER BY RECEITA_ACUM DESC
FETCH FIRST 25 ROWS ONLY;


-- BLOCO G3 - As maiores contas de DESPESA (classe 3), mesmos 15 meses. Junto com
-- G2 desenha a DRE: receita - custos/despesas = resultado.
SELECT /*+ NO_PARALLEL */
       C.CLASSIFICADOR,
       C.NOMECONTA,
       ROUND(SUM(S.VLDEBITOSALDO - S.VLCREDITOSALDO), 2) AS DESPESA_ACUM
FROM   CTBSALDO S
JOIN   CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
WHERE  S.CODIGOEMPRESA = 4
  AND  C.CLASSIFICADOR LIKE '3%'
  AND  C.CLASSIFICADOR NOT LIKE '%.0000'
  AND  S.PERIODOSALDO >= TO_CHAR(ADD_MONTHS(SYSDATE, -15), 'YYYYMM')
GROUP BY C.CLASSIFICADOR, C.NOMECONTA
HAVING ROUND(SUM(S.VLDEBITOSALDO - S.VLCREDITOSALDO), 2) <> 0
ORDER BY DESPESA_ACUM DESC
FETCH FIRST 25 ROWS ONLY;

-- =============================================================================
-- FIM. G1 diz o mes de referencia certo (e o padrao da receita); G2/G3 dao a
-- estrutura real de receita e despesa pra desenhar as linhas da DRE. Com isso eu
-- monto a DRE contabil (reusando o CTBSALDO da Depreciacao) e proponho a gerencial.
-- =============================================================================
