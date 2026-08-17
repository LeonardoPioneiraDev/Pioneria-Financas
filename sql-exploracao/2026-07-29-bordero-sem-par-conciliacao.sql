-- =====================================================================
-- CONCILIAÇÃO — os 24 borderôs "sem par" que sobraram.
-- Rodar no PL/SQL contra o Globus (produção, somente leitura). Empresa 4.
--
-- Contexto: são débitos de borderô (BO-xxxxx) no extrato bancário cujo
-- CODMOVTOBCO NÃO casa com nenhum título CPGDOCTO no nosso banco — nem
-- soft-deleted, nem no stage bruto. Ou seja: os títulos que esses borderôs
-- pagaram NUNCA foram sincronizados por nós.
--
-- Estas consultas descobrem, direto no Globus, O QUE cada borderô pagou.
--   - Se vier título → é CP que a nossa janela de sync não pegou (conserto:
--     ampliar a reconciliação para incluí-los).
--   - Se vier vazio → o borderô pagou algo fora do CP (folha, imposto,
--     transferência) e a identificação vem de outra fonte.
--
-- Os 24 CODMOVTOBCO (chave BCOMOVTO) estão na lista abaixo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Q1. O QUE CADA BORDERÔ PAGOU — títulos CPGDOCTO ligados por CODMOVTOBCO.
--     Uma linha por título. Esperado: casar a soma com o valor do débito.
-- ---------------------------------------------------------------------
SELECT D.CODMOVTOBCO,
       D.CODDOCTOCPG,
       D.NRODOCTOCPG,
       D.NROPARCELACPG,
       D.CODTPDOC                              AS TIPO_DOC,
       D.STATUSDOCTOCPG                        AS STATUS,
       D.EMISSAOCPG,
       D.VENCIMENTOCPG,
       D.PAGAMENTOCPG,
       D.VLR_ORIGINAL,
       (SELECT SUM(I.VALORITEMDOC) FROM CPGITDOC I WHERE I.CODDOCTOCPG = D.CODDOCTOCPG) AS VLR_ITENS,
       NVL(F.RSOCIALFORN, D.FAVORECIDODOCTOCPG) AS FAVORECIDO
FROM   CPGDOCTO D
LEFT   JOIN BGM_FORNECEDOR F ON F.CODIGOFORN = D.CODIGOFORN
WHERE  D.CODIGOEMPRESA = 4
  AND  D.CODMOVTOBCO IN (398592,398577,398579,398580,398561,398582,398581,398457,
                         397960,397665,397666,397639,397400,397395,397363,397366,
                         397337,396886,396914,396871,396870,396894,396893,396896)
ORDER  BY D.CODMOVTOBCO, D.NRODOCTOCPG;


-- ---------------------------------------------------------------------
-- Q2. RESUMO por borderô — quantos títulos e soma, para comparar com o
--     débito do banco. Se um CODMOVTOBCO não aparecer aqui, o borderô NÃO
--     pagou CP nenhum (é o caso "fora do CP").
-- ---------------------------------------------------------------------
SELECT D.CODMOVTOBCO,
       COUNT(*)                                AS QTD_TITULOS,
       SUM(NVL(
         (SELECT SUM(I.VALORITEMDOC) FROM CPGITDOC I WHERE I.CODDOCTOCPG = D.CODDOCTOCPG),
         D.VLR_ORIGINAL
       ))                                      AS SOMA_TITULOS,
       MIN(D.EMISSAOCPG)                       AS EMISSAO_MIN,
       MAX(D.VENCIMENTOCPG)                    AS VENCIMENTO_MAX
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA = 4
  AND  D.CODMOVTOBCO IN (398592,398577,398579,398580,398561,398582,398581,398457,
                         397960,397665,397666,397639,397400,397395,397363,397366,
                         397337,396886,396914,396871,396870,396894,396893,396896)
GROUP  BY D.CODMOVTOBCO
ORDER  BY D.CODMOVTOBCO;


-- ---------------------------------------------------------------------
-- Q3. O MOVIMENTO no BCOMOVTO — o que o Globus registra sobre o débito.
--     O histórico (BCOHISTO) diz se é pagamento de fornecedor, folha,
--     imposto, transferência… ajuda a classificar os que não têm CP.
-- ---------------------------------------------------------------------
SELECT M.CODMOVTOBCO,
       M.DOCMOVTOBCO                           AS BORDERO,
       M.DTMOVTOBCO,
       M.VLMOVTOBCO                            AS VALOR,
       M.CODHISTOBCO,
       H.DESCHISTOBCO                          AS HISTORICO,
       M.CODTPDESPESA,
       M.STATUSMOVTOBCO
FROM   BCOMOVTO M
LEFT   JOIN BCOHISTO H ON H.CODHISTOBCO    = M.CODHISTOBCO
                       AND H.CODIGOEMPRESA = M.CODIGOEMPRESA
                       AND H.CODIGOFL      = M.CODIGOFL
WHERE  M.CODIGOEMPRESA = 4
  AND  M.CODMOVTOBCO IN (398592,398577,398579,398580,398561,398582,398581,398457,
                         397960,397665,397666,397639,397400,397395,397363,397366,
                         397337,396886,396914,396871,396870,396894,396893,396896)
ORDER  BY M.CODMOVTOBCO;
