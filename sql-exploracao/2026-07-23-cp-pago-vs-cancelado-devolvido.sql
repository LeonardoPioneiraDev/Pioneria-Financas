-- =====================================================================
-- CP: por que o sistema mostra PAGO e o Globus mostra CANCELADO/DEVOLVIDO
-- Rodar no PL/SQL contra o Globus (produção, somente leitura).
-- Empresa 4 = Pioneira.
--
-- Contexto: `finance.contas_pagar.status` é derivado no nosso ETL por
--   mapStatus(): "se tem QUITADO='S' OU data de pagamento -> PAGO".
-- Isso ignora dois casos que o Globus distingue:
--   (a) STATUSDOCTOCPG='C' (cancelado) com PAGAMENTOCPG preenchido;
--   (b) QUITADODOCTOCPG='N' com PAGAMENTOCPG preenchido = baixa lançada mas
--       NÃO compensada — que é como fica a devolução bancária.
-- Estas consultas medem os dois no Globus.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Q1. O TÍTULO RECLAMADO — Recibo 3577871791, R$ 840,00 (CODDOCTOCPG 1000593)
--     e os 6 títulos do mesmo borderô BO-011009.
--     Queremos ver: STATUSDOCTOCPG, QUITADODOCTOCPG, PAGAMENTOCPG hoje.
-- ---------------------------------------------------------------------
SELECT D.CODDOCTOCPG,
       D.NRODOCTOCPG,
       D.NROPARCELACPG,
       D.STATUSDOCTOCPG   AS STATUS,        -- N=normal, B=baixado, C=cancelado
       D.QUITADODOCTOCPG  AS QUITADO,       -- S/N  <<< a chave
       D.PAGAMENTOCPG     AS DT_PAGAMENTO,
       D.VENCIMENTOCPG    AS DT_VENCIMENTO,
       D.VLR_ORIGINAL,
       D.PAGAMENTOLIBERADO,
       D.STATUSPE,                          -- status do pagamento eletrônico
       D.AUTELETRONICA,                     -- comprovante eletrônico
       D.CODMOVTOBCO,                       -- link com o movimento bancário
       D.CODDOCTOCPGSUBST AS SUBSTITUIDO_POR,
       D.FAVORECIDODOCTOCPG
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA = 4
  AND  D.CODDOCTOCPG IN (1000592, 1000593, 1000601, 1000602, 1000603)
ORDER  BY D.NRODOCTOCPG;


-- ---------------------------------------------------------------------
-- Q2. TRILHA DE EVENTOS desse título — mostra se houve cancelamento ou
--     estorno DEPOIS da baixa, com usuário e hora.
--     É a prova de "o que aconteceu e quando".
-- ---------------------------------------------------------------------
SELECT H.CODDOCTOCPG,
       H.SEQUENCIA_EVENTO,
       H.COD_TP_EVENTO,
       E.DESC_EVENTO,
       H.STATUSDOCTOCPG AS STATUS_RESULTANTE,
       H.USUARIO,
       H.DATA_EVENTO,
       H.MAIS_INFORMACOES
FROM   CPGDOCTO_HISTORICO_NEGOCIACOES H
LEFT   JOIN CPGDOCTO_TIPO_EVENTOS E ON E.COD_TP_EVENTO = H.COD_TP_EVENTO
WHERE  H.CODIGOEMPRESA = 4
  AND  H.CODDOCTOCPG IN (1000592, 1000593, 1000601, 1000602, 1000603)
ORDER  BY H.CODDOCTOCPG, H.SEQUENCIA_EVENTO;


-- ---------------------------------------------------------------------
-- Q3. MAPA GERAL — cruzamento status × quitado × tem pagamento.
--     Diz quantos títulos caem em cada combinação. As linhas que
--     importam:
--       STATUS='C' e TEM_PAGTO='SIM'  -> cancelado que mostramos como pago
--       QUITADO='N' e TEM_PAGTO='SIM' -> baixa não compensada (devolução?)
-- ---------------------------------------------------------------------
SELECT D.STATUSDOCTOCPG                                   AS STATUS,
       D.QUITADODOCTOCPG                                  AS QUITADO,
       CASE WHEN D.PAGAMENTOCPG IS NULL THEN 'NAO' ELSE 'SIM' END AS TEM_PAGTO,
       COUNT(*)                                           AS QTDE,
       ROUND(SUM(D.VLR_ORIGINAL), 2)                      AS VALOR
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA = 4
  AND  D.VENCIMENTOCPG >= DATE '2026-01-01'
GROUP  BY D.STATUSDOCTOCPG, D.QUITADODOCTOCPG,
          CASE WHEN D.PAGAMENTOCPG IS NULL THEN 'NAO' ELSE 'SIM' END
ORDER  BY 1, 2, 3;


-- ---------------------------------------------------------------------
-- Q4. CANCELADOS COM PAGAMENTO — o caso (a).
--     Se vier vazio, o erro de ordem do nosso mapStatus é só latente.
--     Se vier com linhas, cada uma aparece como PAGO no nosso sistema.
-- ---------------------------------------------------------------------
SELECT D.CODDOCTOCPG, D.NRODOCTOCPG, D.NROPARCELACPG,
       D.STATUSDOCTOCPG, D.QUITADODOCTOCPG,
       D.VENCIMENTOCPG, D.PAGAMENTOCPG, D.VLR_ORIGINAL,
       D.FAVORECIDODOCTOCPG
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA  = 4
  AND  D.STATUSDOCTOCPG = 'C'
  AND  D.PAGAMENTOCPG IS NOT NULL
  AND  D.VENCIMENTOCPG >= DATE '2026-01-01'
ORDER  BY D.PAGAMENTOCPG DESC;


-- ---------------------------------------------------------------------
-- Q5. BAIXA NÃO COMPENSADA HÁ MAIS DE 10 DIAS — o caso (b), o volumoso.
--     Pagamento antigo com QUITADO='N' não é mais "em trânsito".
--     No nosso banco isso dá 5.303 títulos / R$ 116,8 milhões marcados
--     como PAGO. Esta consulta diz o que o Globus acha deles HOJE.
-- ---------------------------------------------------------------------
SELECT D.CODDOCTOCPG, D.NRODOCTOCPG, D.NROPARCELACPG,
       D.STATUSDOCTOCPG  AS STATUS,
       D.QUITADODOCTOCPG AS QUITADO,
       D.PAGAMENTOCPG    AS DT_PAGAMENTO,
       TRUNC(SYSDATE) - TRUNC(D.PAGAMENTOCPG) AS DIAS_DESDE_PAGTO,
       D.VLR_ORIGINAL,
       D.STATUSPE,
       D.CODMOVTOBCO,
       D.FAVORECIDODOCTOCPG
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA    = 4
  AND  D.PAGAMENTOCPG IS NOT NULL
  AND  D.QUITADODOCTOCPG  = 'N'
  AND  D.PAGAMENTOCPG     < SYSDATE - 10
  AND  D.VENCIMENTOCPG   >= DATE '2026-01-01'
ORDER  BY D.PAGAMENTOCPG DESC
FETCH FIRST 200 ROWS ONLY;


-- ---------------------------------------------------------------------
-- Q6. RESUMO DO CASO (b) por mês — pra saber se é problema pontual ou
--     comportamento normal do Globus (ex.: nunca marcam QUITADO='S').
--     Se TODO mês tiver proporção alta, QUITADO não é sinal de devolução
--     e sim campo que a empresa não usa — muda o diagnóstico.
-- ---------------------------------------------------------------------
SELECT TO_CHAR(D.PAGAMENTOCPG, 'YYYY-MM')                           AS MES_PAGTO,
       COUNT(*)                                                     AS PAGOS_TOTAL,
       SUM(CASE WHEN D.QUITADODOCTOCPG = 'S' THEN 1 ELSE 0 END)     AS QUITADO_S,
       SUM(CASE WHEN D.QUITADODOCTOCPG = 'N' THEN 1 ELSE 0 END)     AS QUITADO_N,
       ROUND(100 * SUM(CASE WHEN D.QUITADODOCTOCPG = 'N' THEN 1 ELSE 0 END)
             / COUNT(*), 1)                                         AS PCT_NAO_QUITADO
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA = 4
  AND  D.PAGAMENTOCPG IS NOT NULL
  AND  D.PAGAMENTOCPG >= DATE '2025-01-01'
GROUP  BY TO_CHAR(D.PAGAMENTOCPG, 'YYYY-MM')
ORDER  BY 1;


-- ---------------------------------------------------------------------
-- Q7. O DINHEIRO SAIU MESMO? — confronta o título com o extrato.
--     CORRIGIDA: os nomes certos são VLMOVTOBCO e DTMOVTOBCO
--     (não VLRMOVTOBCO / DATAMOVTOBCO).
--     Se o título está "pago" mas não há movimento bancário ligado — ou o
--     movimento está com STATUSMOVTOBCO='C' — é baixa desfeita.
-- ---------------------------------------------------------------------
SELECT D.CODDOCTOCPG, D.NRODOCTOCPG,
       D.STATUSDOCTOCPG, D.QUITADODOCTOCPG,
       D.PAGAMENTOCPG, D.VLR_ORIGINAL,
       D.CODMOVTOBCO,
       M.DOCMOVTOBCO        AS BORDERO,
       M.DTMOVTOBCO         AS DT_MOVTO,
       M.DTEFETIVAMOVTOBCO  AS DT_EFETIVA,
       M.VLMOVTOBCO         AS VLR_MOVTO,
       M.STATUSMOVTOBCO     AS STATUS_MOVTO,   -- 'C' = movimento CANCELADO
       M.CONFIRMADOMOVTOBCO AS CONFIRMADO,
       M.CONCILIADOMOVTOBCO AS CONCILIADO,
       M.CODBANCO, M.CODAGENCIA, M.CODCONTABCO
FROM   CPGDOCTO D
LEFT   JOIN BCOMOVTO M
       ON  M.CODMOVTOBCO   = D.CODMOVTOBCO
       AND M.CODIGOEMPRESA = D.CODIGOEMPRESA
WHERE  D.CODIGOEMPRESA = 4
  AND  D.CODDOCTOCPG IN (1000592, 1000593, 1000601, 1000602, 1000603);


-- ---------------------------------------------------------------------
-- Q8. *** A HIPÓTESE MAIS PROMISSORA ***
--     Título BAIXADO (pago) cujo MOVIMENTO BANCÁRIO foi CANCELADO.
--
--     Nosso sync do extrato filtra `STATUSMOVTOBCO <> 'C'` — ou seja, o
--     movimento cancelado nem chega no nosso banco, mas o título continua
--     marcado como pago. Este é o candidato mais forte para o que o
--     financeiro chama de "cancelado/devolvido".
-- ---------------------------------------------------------------------
SELECT D.CODDOCTOCPG, D.NRODOCTOCPG, D.NROPARCELACPG,
       D.STATUSDOCTOCPG  AS STATUS_TITULO,
       D.QUITADODOCTOCPG AS QUITADO,
       D.PAGAMENTOCPG    AS DT_PAGAMENTO,
       D.VLR_ORIGINAL,
       D.FAVORECIDODOCTOCPG,
       M.CODMOVTOBCO,
       M.DOCMOVTOBCO     AS BORDERO,
       M.STATUSMOVTOBCO  AS STATUS_MOVTO,
       M.DTMOVTOBCO      AS DT_MOVTO,
       M.VLMOVTOBCO      AS VLR_MOVTO
FROM   CPGDOCTO D
JOIN   BCOMOVTO M
       ON  M.CODMOVTOBCO   = D.CODMOVTOBCO
       AND M.CODIGOEMPRESA = D.CODIGOEMPRESA
WHERE  D.CODIGOEMPRESA   = 4
  AND  D.PAGAMENTOCPG IS NOT NULL
  AND  M.STATUSMOVTOBCO  = 'C'          -- movimento bancário CANCELADO
  AND  D.VENCIMENTOCPG  >= DATE '2026-01-01'
ORDER  BY D.PAGAMENTOCPG DESC;


-- ---------------------------------------------------------------------
-- Q9. Dimensão do Q8 por mês — quantos títulos "pagos" apontam para um
--     movimento bancário cancelado. Se der números relevantes, é ESTA a
--     causa de "o sistema mostra pago e o ERP não".
-- ---------------------------------------------------------------------
SELECT TO_CHAR(D.PAGAMENTOCPG, 'YYYY-MM')      AS MES_PAGTO,
       COUNT(*)                                AS TITULOS,
       ROUND(SUM(D.VLR_ORIGINAL), 2)           AS VALOR
FROM   CPGDOCTO D
JOIN   BCOMOVTO M
       ON  M.CODMOVTOBCO   = D.CODMOVTOBCO
       AND M.CODIGOEMPRESA = D.CODIGOEMPRESA
WHERE  D.CODIGOEMPRESA  = 4
  AND  D.PAGAMENTOCPG IS NOT NULL
  AND  M.STATUSMOVTOBCO = 'C'
  AND  D.PAGAMENTOCPG  >= DATE '2025-01-01'
GROUP  BY TO_CHAR(D.PAGAMENTOCPG, 'YYYY-MM')
ORDER  BY 1;


-- ---------------------------------------------------------------------
-- Q10. Os 9 títulos que JÁ SABEMOS estar divergentes (achados no cruzamento
--      do nosso banco com o stage). Confirmar o estado atual no Globus.
--      Esperado: os 6 primeiros com STATUS='B', os 3 últimos com 'N'.
-- ---------------------------------------------------------------------
SELECT D.CODDOCTOCPG, D.NRODOCTOCPG,
       D.STATUSDOCTOCPG  AS STATUS,
       D.QUITADODOCTOCPG AS QUITADO,
       D.PAGAMENTOCPG    AS DT_PAGAMENTO,
       D.VLR_ORIGINAL,
       D.CODMOVTOBCO,
       D.FAVORECIDODOCTOCPG
FROM   CPGDOCTO D
WHERE  D.CODIGOEMPRESA = 4
  AND  D.CODDOCTOCPG IN (996595, 996614, 996593, 996603, 996594, 996600,  -- nós: pendente / Globus: B
                         995760, 981000, 997039)                          -- nós: pago     / Globus: N
ORDER  BY D.VLR_ORIGINAL DESC;
