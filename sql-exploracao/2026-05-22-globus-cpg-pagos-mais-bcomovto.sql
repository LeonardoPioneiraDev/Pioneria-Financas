-- =====================================================
-- Globus — Pagamentos Realizados do Mês
-- =====================================================
-- Origem: query operacional validada em 2026-05-22 (Pioneira, empresa=4, mai/2026)
-- Documentação completa em Leia/globus-pagamentos-realizados.md
--
-- O que retorna: todas as SAÍDAS de caixa do período, combinando:
--   BLOCO 1 — Pagamentos via CPG (títulos quitados, PAGAMENTOCPG no range)
--   BLOCO 2 — Movimentações bancárias diretas (BCOMOVTO sem vínculo a CPG)
-- =====================================================

SELECT A.classificador,
       A.CODIGOEMPRESA,
       A.NFANTASIAFORN,
       A.DESCTPDESPESA,
       A.NRDOCTO,
       A.DATA,
       A.VLR
FROM (
    -- =====================================================
    -- BLOCO 1: Pagamentos via Contas a Pagar (CPGDOCTO)
    -- =====================================================
    SELECT TD.CLASSIFICADOR,
           D.CODTPDOC,
           D.STATUSDOCTOCPG,
           D.CODIGOEMPRESA,
           D.CODIGOFORN,
           F.RSOCIALFORN,
           F.NFANTASIAFORN,
           I.CODTPDESPESA,
           TD.DESCTPDESPESA,
           D.NRODOCTOCPG AS NRDOCTO,
           TO_CHAR(D.VENCIMENTOCPG, 'MM/YYYY') AS VENCIMENTO,
           D.VENCIMENTOCPG,
           D.PAGAMENTOCPG AS DATA,
           D.ACRESCIMOCPG,
           D.DESCONTOCPG,
           I.VALORITEMDOC,
           -- Líquido pago: VALORITEMDOC + acréscimo − descontos − retenções
           ( (I.VALORITEMDOC + D.ACRESCIMOCPG)
           - (D.DESCONTOCPG + D.VLRPISCPG + D.VLRCOFINSCPG
             + D.VLRCSLCPG + D.VLRINSSCPG + D.VLRIRRFCPG + D.VLRISSCPG)
           ) AS VLR
      FROM CPGDOCTO        D,
           CPGITDOC        I,
           CPGTPDES        TD,
           BGM_FORNECEDOR  F
     WHERE I.CODDOCTOCPG    = D.CODDOCTOCPG
       AND I.CODTPDESPESA   = TD.CODTPDESPESA
       AND D.CODIGOFORN     = F.CODIGOFORN
       AND D.CODIGOEMPRESA  = 4                              -- Pioneira
       AND D.STATUSDOCTOCPG <> 'C'                           -- exclui cancelados
       AND D.CODTPDOC       NOT IN ('BOL', 'BO')             -- exclui boletos
       AND D.PAGAMENTOCPG   BETWEEN TO_DATE('01/05/2026', 'DD/MM/YYYY')
                                AND TO_DATE('31/05/2026', 'DD/MM/YYYY')
) A

UNION ALL

SELECT A.CLASSIFICADOR,
       A.CODIGOEMPRESA,
       A.NFANTASIAFORN,
       A.DESCTPDESPESA,
       A.NRDOCTO,
       A.DATA,
       A.VLR
FROM (
    -- =====================================================
    -- BLOCO 2: Movimentações bancárias diretas (BCOMOVTO)
    -- =====================================================
    SELECT DISTINCT
           'BANCO'              AS NFANTASIAFORN,
           M.CODBANCO,
           H.CODIGOEMPRESA,
           H.CODHISTOBCO,
           R.CLASSIFICADOR,
           M.CODTPDESPESA,
           R.DESCTPDESPESA,
           H.DEBCREDHISTBCO,
           M.DTMOVTOBCO         AS DATA,
           M.DTEFETIVAMOVTOBCO,
           M.DTHORACHAVE,
           M.DOCMOVTOBCO        AS NRDOCTO,
           M.STATUSMOVTOBCO,
           (M.VLMOVTOBCO * -1)  AS VLR                       -- inverte sinal pra somar com Bloco 1
      FROM BCOMOVTO  M,
           BCOHISTO  H,
           CPGTPDES  R
     WHERE H.CODHISTOBCO    = M.CODHISTOBCO
       AND H.CODIGOEMPRESA  = M.CODIGOEMPRESA
       AND M.CODTPDESPESA   = R.CODTPDESPESA
       AND H.CODIGOEMPRESA  = 4                              -- Pioneira
       AND M.STATUSMOVTOBCO <> 'C'                           -- exclui cancelados
       AND M.DTMOVTOBCO     BETWEEN TO_DATE('01/05/2026', 'DD/MM/YYYY')
                                AND TO_DATE('31/05/2026', 'DD/MM/YYYY')
) A

ORDER BY 2, 6;
