-- =====================================================================
-- Título 1000810 (doc 9988905556, R$ 273,51) — aparece no NOSSO banco com
-- vencimento 23/07/2026, mas a conferência agregada não o encontra no Globus
-- nessa data. Descobrir onde ele está no ERP.
--
-- Hipótese principal: o VENCIMENTO mudou no Globus. Como o sync busca pela
-- janela do vencimento, o título "sai" da janela e a nossa cópia com a data
-- antiga nunca é atualizada — inflando o período errado.
-- =====================================================================

-- Q1. Onde está o título hoje?
SELECT D.CODDOCTOCPG, D.NRODOCTOCPG, D.NROPARCELACPG,
       D.STATUSDOCTOCPG, D.QUITADODOCTOCPG,
       D.EMISSAOCPG, D.VENCIMENTOCPG, D.PAGAMENTOCPG,
       D.VLR_ORIGINAL,
       (SELECT SUM(I.VALORITEMDOC) FROM CPGITDOC I WHERE I.CODDOCTOCPG = D.CODDOCTOCPG) AS VLR_ITENS,
       D.CODDOCTOCPGSUBST AS SUBSTITUIDO_POR,
       D.FAVORECIDODOCTOCPG
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA = 4
  AND  D.CODDOCTOCPG = 1000810;

-- Q2. A trilha dele — mostra se houve alteração de vencimento e quando.
SELECT H.SEQUENCIA_EVENTO, H.COD_TP_EVENTO, E.DESC_EVENTO,
       H.STATUSDOCTOCPG, H.USUARIO, H.DATA_EVENTO, H.MAIS_INFORMACOES
FROM   CPGDOCTO_HISTORICO_NEGOCIACOES H
LEFT   JOIN CPGDOCTO_TIPO_EVENTOS E ON E.COD_TP_EVENTO = H.COD_TP_EVENTO
WHERE  H.CODIGOEMPRESA = 4 AND H.CODDOCTOCPG = 1000810
ORDER  BY H.SEQUENCIA_EVENTO;

-- Q3. Existe outro título com o MESMO número de documento? (reemissão)
SELECT D.CODDOCTOCPG, D.NRODOCTOCPG, D.NROPARCELACPG,
       D.STATUSDOCTOCPG, D.VENCIMENTOCPG, D.VLR_ORIGINAL, D.FAVORECIDODOCTOCPG
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA = 4 AND D.NRODOCTOCPG = '9988905556';

-- =====================================================================
-- Q4. *** O TESTE GERAL ***
-- Títulos que NÓS temos com um vencimento e o Globus tem com OUTRO.
-- Se der várias linhas, confirma a falha de sincronismo: mudança de
-- vencimento nunca é capturada, porque o sync busca pela janela do
-- vencimento NOVO e a nossa linha fica presa na data antiga.
--
-- Rodar depois de exportar da nossa base a lista (cod, vencimento) do
-- período; ou usar esta versão que só lista o que venceria no período e
-- comparar manualmente com o nosso export.
-- =====================================================================
SELECT D.CODDOCTOCPG, D.NRODOCTOCPG, D.VENCIMENTOCPG, D.STATUSDOCTOCPG,
       (SELECT SUM(I.VALORITEMDOC) FROM CPGITDOC I WHERE I.CODDOCTOCPG = D.CODDOCTOCPG) AS VLR_ITENS
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA = 4
  AND  D.CODDOCTOCPG IN (
         -- cole aqui os CODDOCTOCPG que o nosso banco tem no período conferido
         1000810
       )
ORDER  BY D.CODDOCTOCPG;
