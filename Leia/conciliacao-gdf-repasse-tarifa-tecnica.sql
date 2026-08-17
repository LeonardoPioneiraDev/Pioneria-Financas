-- =====================================================================
-- CONCILIAÇÃO GDF  —  "o que devia entrar" (matriz/bilhetagem)
--                     × "o que entrou" (repasse do banco = tarifa TÉCNICA)
-- Caso de referência: transporte 01 a 16/JUL/2026.
--
-- Fonte: CRCDOCTO (título "AD-xxxx" que casa 1:1 com o crédito BRB no extrato,
--        via NRODOCTOCRC) + CRCITDOC (itens, onde mora o CODTPRECEITA)
--        + CRCTPREC (descrição do tipo de receita).
-- Valores em REAIS (fonte Oracle; o sistema converte p/ centavos no ETL).
--
-- Datas:  EMISSAOCRC    ~ dia do TRANSPORTE (quando os passageiros rodaram)
--         RECEBIMENTOCRC = dia em que o GDF efetivamente PAGOU/baixou o título
-- Read-only.
--
-- =====================================================================
-- CONCLUSÃO (rodado em jul/2026 — 01 a 16/07):
--   Recebido no banco no período .......... R$ 24.046.090,63
--     por tipo de receita (Query B):
--       40006 Tarifa do usuário (VT/Cidadão) . R$ 20.866.569,97  (87%)
--       40023 Complemento gratuidade PNE ..... R$  3.179.520,66  (13%)
--     por competência do transporte (Query C):
--       Jul/2026 (mês corrente) ............. R$  7.457.676,88  (31%)
--       Jun/2026 (RETROATIVO) ............... R$ 15.504.661,72  (64%)
--       Mai/2026 (RETROATIVO) ............... R$  1.083.752,03  ( 5%)
--   Transporte de julho, sozinho (Query A) . R$  7.457.676,88  — 100% 40006, zero gratuidade.
--
--   MECANISMO DO GDF (comprovado):
--     1. Mês corrente → paga só a TARIFA BASE do usuário (40006), em ~T+1.
--        Bate com a bilhetagem/matriz (~R$8,7M nos dois lados no período).
--     2. RETROATIVO → meses depois quita o restante da tarifa + o complemento
--        de gratuidade (PNE) de competências anteriores, em lumps grandes.
--   Ou seja: a diferença "R$8,66M devia × R$24M entrou" é ~69% descasamento de
--   caixa (mai+jun pagos na janela de julho) + ~13% gratuidade que só vem no
--   acerto retroativo. Nada perdido/sobrando: 100% timing e composição.
-- =====================================================================


-- ---------------------------------------------------------------------
-- QUERY A — "O QUE DEVIA ENTRAR" pelo TRANSPORTE 01-16/07, por tipo de receita.
-- ---------------------------------------------------------------------
SELECT /*+ NO_PARALLEL */
    I.CODTPRECEITA                       AS COD_RECEITA,
    NVL(R.DESCTPRECEITA, '(sem desc)')   AS DESCRICAO,
    COUNT(DISTINCT D.CODDOCTOCRC)        AS QTD_ADS,
    SUM(I.VALORITEMDOC)                  AS VALOR_RS
FROM CRCDOCTO D
JOIN CRCITDOC I     ON I.CODDOCTOCRC = D.CODDOCTOCRC
LEFT JOIN CRCTPREC R ON R.CODTPRECEITA = I.CODTPRECEITA
WHERE D.CODIGOEMPRESA = 4
  AND D.NRODOCTOCRC LIKE 'AD%'
  AND D.EMISSAOCRC >= DATE '2026-07-01'
  AND D.EMISSAOCRC <  DATE '2026-07-17'
GROUP BY I.CODTPRECEITA, R.DESCTPRECEITA
ORDER BY SUM(I.VALORITEMDOC) DESC;


-- ---------------------------------------------------------------------
-- QUERY B — "O QUE ENTROU" pelo RECEBIMENTO 01-16/07, por tipo de receita.
-- ---------------------------------------------------------------------
SELECT /*+ NO_PARALLEL */
    I.CODTPRECEITA                       AS COD_RECEITA,
    NVL(R.DESCTPRECEITA, '(sem desc)')   AS DESCRICAO,
    COUNT(DISTINCT D.CODDOCTOCRC)        AS QTD_ADS,
    SUM(I.VALORITEMDOC)                  AS VALOR_RS
FROM CRCDOCTO D
JOIN CRCITDOC I     ON I.CODDOCTOCRC = D.CODDOCTOCRC
LEFT JOIN CRCTPREC R ON R.CODTPRECEITA = I.CODTPRECEITA
WHERE D.CODIGOEMPRESA = 4
  AND D.NRODOCTOCRC LIKE 'AD%'
  AND D.RECEBIMENTOCRC >= DATE '2026-07-01'
  AND D.RECEBIMENTOCRC <  DATE '2026-07-17'
GROUP BY I.CODTPRECEITA, R.DESCTPRECEITA
ORDER BY SUM(I.VALORITEMDOC) DESC;


-- ---------------------------------------------------------------------
-- QUERY C — DEFASAGEM DE CAIXA: dos recebimentos de 01-16/07,
-- de qual MÊS DE TRANSPORTE (competência) eles vieram? Isola o retroativo.
-- ---------------------------------------------------------------------
SELECT /*+ NO_PARALLEL */
    TO_CHAR(D.EMISSAOCRC, 'YYYY-MM')     AS COMPETENCIA_TRANSPORTE,
    COUNT(DISTINCT D.CODDOCTOCRC)        AS QTD_ADS,
    SUM(I.VALORITEMDOC)                  AS VALOR_RS
FROM CRCDOCTO D
JOIN CRCITDOC I ON I.CODDOCTOCRC = D.CODDOCTOCRC
WHERE D.CODIGOEMPRESA = 4
  AND D.NRODOCTOCRC LIKE 'AD%'
  AND D.RECEBIMENTOCRC >= DATE '2026-07-01'
  AND D.RECEBIMENTOCRC <  DATE '2026-07-17'
GROUP BY TO_CHAR(D.EMISSAOCRC, 'YYYY-MM')
ORDER BY 1;


-- ---------------------------------------------------------------------
-- QUERY D — DETALHE POR AD (pra bater 1:1 com a lista do banco):
-- cada título AD do transporte 01-16/07, com data de emissão, recebimento e valor.
-- O NRODOCTOCRC 'AD-xxxx' casa com o crédito do extrato.
-- ---------------------------------------------------------------------
SELECT /*+ NO_PARALLEL */
    D.NRODOCTOCRC                        AS AD,
    TO_CHAR(D.EMISSAOCRC, 'DD/MM/YYYY')       AS TRANSPORTE,
    TO_CHAR(D.RECEBIMENTOCRC, 'DD/MM/YYYY')   AS RECEBIDO_EM,
    D.STATUSDOCTOCRC                     AS STATUS,
    D.QUITADODOCTOCRC                    AS QUITADO,
    (SELECT SUM(I.VALORITEMDOC) FROM CRCITDOC I WHERE I.CODDOCTOCRC = D.CODDOCTOCRC) AS VALOR_RS
FROM CRCDOCTO D
WHERE D.CODIGOEMPRESA = 4
  AND D.NRODOCTOCRC LIKE 'AD%'
  AND D.EMISSAOCRC >= DATE '2026-07-01'
  AND D.EMISSAOCRC <  DATE '2026-07-17'
ORDER BY D.EMISSAOCRC, D.NRODOCTOCRC;
