-- =============================================================================
-- EXPLORACAO GLOBUS - 2026-07-03 - DRE (Demonstracao de Resultado) - RODADA 1
-- Empresa: 4 (Viacao Pioneira)  ·  Owner: GLOBUS (Oracle, read-only)
--
-- CONTEXTO: diferente de Orcamento, aqui o dado de base (o RAZAO contabil:
-- CTBSALDO / CTBLANCA / CTBITLNC) JA sabemos que esta populado — usamos ele no
-- modulo Depreciacao. Uma DRE e: agrupar as contas de resultado (classe 3 =
-- despesa, classe 4 = receita) por linha e somar. Logo a DRE E CALCULAVEL HOJE.
--
-- Esta rodada responde:
--   (1) O Globus tem uma ESTRUTURA de DRE definida (CTBCDDRE + CTBITDRE) pra
--       herdarmos? Ou esta vazia (ai montamos a DRE do plano de contas)?
--   (2) Qual NROPLANO a Pioneira usa?
--   (3) Prova de conceito: uma mini-DRE somando CTBSALDO por grupo de conta.
--
-- Responde tambem, com dado, as 3 perguntas ao financeiro:
--   Q1 (estrutura atual atende?) -> A2/A3 mostram a DRE que o Globus ja tem
--   Q3 (gerencial != contabil?)  -> a contabil sai daqui; a gerencial e uma
--       reorganizacao das mesmas contas (decisao de escopo, nao de dado)
--
-- SEGURANCA: metadado + COUNT + amostra ROWNUM<=50 + 1 agregado leve. NO_PARALLEL.
-- =============================================================================


-- #############################################################################
-- PARTE A - A ESTRUTURA DE DRE DO GLOBUS (existe? esta definida?)
-- #############################################################################

-- BLOCO A1 - Estrutura das tabelas de DRE (confirma colunas)
SELECT /*+ NO_PARALLEL */
       TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, COLUMN_ID
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN ('CTBCDDRE', 'CTBITDRE')
ORDER BY TABLE_NAME, COLUMN_ID;

-- BLOCO A2 - Populacao + lista dos relatorios DRE cadastrados.
-- CTBCDDRE = cabecalho (NUMERO, DESCRICAO, NROPLANO). Se vier vazio, a Pioneira
-- nao tem DRE montada no Globus -> montamos do plano de contas.
SELECT /*+ NO_PARALLEL */ 'CTBCDDRE' AS TABELA, COUNT(*) AS QTD FROM CTBCDDRE
UNION ALL SELECT 'CTBITDRE', COUNT(*) FROM CTBITDRE;

SELECT /*+ NO_PARALLEL */ D.NUMERO, D.DESCRICAO, D.NROPLANO,
       (SELECT COUNT(*) FROM CTBITDRE I WHERE I.NUMERO = D.NUMERO) AS QTD_LINHAS
FROM   CTBCDDRE D
ORDER BY D.NUMERO;

-- BLOCO A3 - Linhas de UMA DRE (troque :numero_dre pelo NUMERO do A2 com mais
-- linhas). Mostra a estrutura real: descricao da linha, faixa de contas
-- (CONTA_INICIAL..CONTA_FINAL), operacao, sinal, se exibe. Se quiser, rode sem
-- filtro (traz todas as linhas de todos os relatorios, ROWNUM<=200).
SELECT /*+ NO_PARALLEL */
       I.NUMERO, I.ITEM, I.OPERACAO, I.SINAL_OPERACAO, I.EXIBE_LINHA,
       I.CONTA_INICIAL, I.CONTA_FINAL, I.TEXTO
FROM   CTBITDRE I
WHERE  ROWNUM <= 200
ORDER BY I.NUMERO, I.ITEM;


-- #############################################################################
-- PARTE B - QUAL PLANO + PROVA DE QUE A DRE E CALCULAVEL HOJE
-- #############################################################################

-- BLOCO B1 - Qual NROPLANO a Pioneira usa no razao (e quantas contas por classe).
-- Classe 3 = despesas/custos, 4 = receitas (o "resultado"). Classe 1/2 = patrimonial.
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
-- Exclui contas sinteticas ('.0000', que repetem a soma dos filhos).
-- Prova que a DRE contabil sai direto do que ja sincronizamos (CTBSALDO).
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
-- FIM DA RODADA 1. A2/A3 dizem se herdamos a DRE do Globus ou montamos do plano;
-- B2 prova que a DRE contabil ja e calculavel do razao que sincronizamos. Depois
-- eu desenho o modelo (reusa o adapter/stage de CTBSALDO da Depreciacao).
-- =============================================================================
