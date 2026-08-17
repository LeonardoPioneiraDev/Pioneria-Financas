-- =============================================================================
-- EXPLORACAO GLOBUS - 2026-07-03 - DRE - RODADA 1B (correcao do A3 + B1/B2)
-- Empresa: 4 (Viacao Pioneira)
--
-- Correcao: no bloco A3 da rodada 1 eu usei a coluna SINAL_OPERACAO (que e da
-- tabela de ORCAMENTO, CPGORCITESTRUTURA). Na CTBITDRE a coluna certa e SINAL.
-- Isso travou o bloco e os B1/B2 nao chegaram a rodar. Aqui vai corrigido.
--
-- Ja sabemos: existe 1 relatorio de DRE (NUMERO=1, plano NROPLANO=1) com so 6
-- linhas. Estes blocos mostram QUAIS sao as 6 linhas e provam a DRE do razao.
-- SEGURANCA: agregados leves. NO_PARALLEL. Rodar cada SELECT separadamente.
-- =============================================================================


-- BLOCO A3 (corrigido) - As 6 linhas da DRE do Globus (relatorio NUMERO=1).
-- Mostra a estrutura real: texto da linha, faixa de contas (CONTA_INICIAL..FINAL),
-- operacao, sinal e se exibe. Revela se e uma DRE usavel ou so um esqueleto.
SELECT /*+ NO_PARALLEL */
       I.ITEM,
       I.TEXTO,
       I.OPERACAO,
       I.SINAL,
       I.ALINHAMENTO,
       I.EXIBE_LINHA,
       I.CONTA_INICIAL,
       I.CONTA_FINAL
FROM   CTBITDRE I
WHERE  I.NUMERO = 1
ORDER BY I.ITEM;


-- BLOCO B1 - Qual NROPLANO a Pioneira usa no razao, e quantas contas por classe.
-- Confirma se o razao da empresa 4 usa o mesmo plano (NROPLANO=1) da DRE acima.
-- Classe 3 = despesa/custo, 4 = receita (resultado); 1/2 = patrimonial.
SELECT /*+ NO_PARALLEL */
       C.NROPLANO,
       SUBSTR(C.CLASSIFICADOR, 1, 1)  AS CLASSE,
       COUNT(*)                       AS QTD_CONTAS
FROM   CTBCONTA C
GROUP BY C.NROPLANO, SUBSTR(C.CLASSIFICADOR, 1, 1)
ORDER BY C.NROPLANO, CLASSE;


-- BLOCO B2 - MINI-DRE do ultimo periodo fechado (empresa 4): soma o movimento
-- das contas de resultado por grupo (2 primeiros niveis do classificador).
-- Receita (classe 4) = credito - debito; Despesa (classe 3) = debito - credito.
-- Exclui sinteticas ('.0000'). Prova que a DRE contabil sai do CTBSALDO que ja
-- sincronizamos na Depreciacao.
SELECT /*+ NO_PARALLEL */
       SUBSTR(C.CLASSIFICADOR, 1, 3)  AS GRUPO,
       MIN(C.NOMECONTA)               AS EXEMPLO_NOME,
       CASE WHEN C.CLASSIFICADOR LIKE '4%' THEN 'RECEITA' ELSE 'DESPESA' END AS TIPO,
       ROUND(SUM(CASE WHEN C.CLASSIFICADOR LIKE '4%'
                      THEN S.VLCREDITOSALDO - S.VLDEBITOSALDO
                      ELSE S.VLDEBITOSALDO - S.VLCREDITOSALDO END), 2) AS VALOR
FROM   CTBSALDO S
JOIN   CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
WHERE  S.CODIGOEMPRESA = 4
  AND  (C.CLASSIFICADOR LIKE '3%' OR C.CLASSIFICADOR LIKE '4%')
  AND  C.CLASSIFICADOR NOT LIKE '%.0000'
  AND  S.PERIODOSALDO = (
         SELECT MAX(S2.PERIODOSALDO)
         FROM   CTBSALDO S2
         WHERE  S2.CODIGOEMPRESA = 4
           AND  S2.PERIODOSALDO <= TO_CHAR(ADD_MONTHS(SYSDATE, -1), 'YYYYMM')
       )
GROUP BY SUBSTR(C.CLASSIFICADOR, 1, 3),
         CASE WHEN C.CLASSIFICADOR LIKE '4%' THEN 'RECEITA' ELSE 'DESPESA' END
ORDER BY TIPO, GRUPO;

-- =============================================================================
-- FIM. A3 diz se herdamos a DRE do Globus (6 linhas: usavel ou esqueleto?);
-- B1 confirma o plano; B2 prova a DRE calculavel do razao. Depois eu desenho.
-- =============================================================================
