-- =============================================================================
-- Exploração CPGDOCTO — substituição (duplicidade), retorno bancário e modalidade
-- Data: 2026-06-11 · Empresa: 4 (Viação Pioneira) · Ticket: SFN-48
--
-- Objetivo: confirmar com dados reais (1) qual coluna marca título substituído,
-- (2) se o antigo fica "vivo" e duplica, (3) quais colunas de retorno bancário
-- existem/têm dado, (4) cobertura da modalidade de pagamento.
--
-- Rode CADA bloco separado no PL/SQL e me traga o resultado. Blocos 1 e 2 são de
-- dicionário (descobrem nomes de coluna); os demais usam só colunas já documentadas.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- BLOCO 1 — Descobrir colunas de SUBSTITUIÇÃO no CPGDOCTO (a "coluna SB" N/S)
-- Procura nomes contendo SUBST / SUB / SB. Traz tipo e se aceita nulo.
-- -----------------------------------------------------------------------------
SELECT owner, column_name, data_type, data_length, nullable
FROM   all_tab_columns
WHERE  table_name = 'CPGDOCTO'
  AND  (column_name LIKE '%SUBST%' OR column_name LIKE '%SUB%' OR column_name = 'SB')
ORDER BY owner, column_name;


-- -----------------------------------------------------------------------------
-- BLOCO 2 — Comentários/descrições das colunas do CPGDOCTO ligadas a
-- substituição / retorno / pagamento eletrônico / modalidade. Ajuda a achar o
-- nome exato do flag e a entender cada coluna.
-- -----------------------------------------------------------------------------
SELECT c.column_name, m.comments, c.data_type, c.data_length
FROM   all_tab_columns c
LEFT JOIN all_col_comments m
       ON m.owner = c.owner AND m.table_name = c.table_name AND m.column_name = c.column_name
WHERE  c.table_name = 'CPGDOCTO'
  AND  ( c.column_name LIKE '%SUBST%' OR c.column_name LIKE '%RET%'
      OR c.column_name LIKE '%PE'     OR c.column_name LIKE '%MODALID%'
      OR c.column_name LIKE '%PAGTO%' OR c.column_name LIKE '%AUT%'
      OR c.column_name LIKE '%OCORR%' OR c.column_name LIKE '%DEVOL%' )
ORDER BY c.column_name;


-- -----------------------------------------------------------------------------
-- BLOCO 3 — Quantificar substituição (empresa 4, vencimento a partir de 2026)
-- Quantos títulos têm o ponteiro de substituição preenchido.
-- -----------------------------------------------------------------------------
SELECT COUNT(*)                                                      AS total,
       COUNT(CODDOCTOCPGSUBST)                                       AS com_ptr_subst,
       SUM(CASE WHEN CODFORNANTSUB IS NOT NULL THEN 1 ELSE 0 END)    AS com_forn_ant_sub
FROM   CPGDOCTO
WHERE  CODIGOEMPRESA = 4
  AND  VENCIMENTOCPG >= DATE '2026-01-01';


-- -----------------------------------------------------------------------------
-- BLOCO 4 — *** O PRINCIPAL *** Pares antigo ↔ novo (substituição).
-- CODDOCTOCPGSUBST aponta do título ANTIGO para o que o substituiu. Mostra se o
-- antigo continua status A/F (não cancelado) e se o NOVO é o que foi pago.
-- Se o antigo aparecer como não-cancelado, está confirmado: ele duplica na lista.
-- -----------------------------------------------------------------------------
SELECT * FROM (
  SELECT
    D.CODDOCTOCPG       AS antigo_cod,
    D.NRODOCTOCPG       AS antigo_nrodoc,
    D.NROPARCELACPG     AS antigo_parc,
    D.STATUSDOCTOCPG    AS antigo_status,
    D.QUITADODOCTOCPG   AS antigo_quit,
    D.PAGAMENTOCPG      AS antigo_pagto,
    D.CODDOCTOCPGSUBST  AS aponta_para,
    N.CODDOCTOCPG       AS novo_cod,
    N.NRODOCTOCPG       AS novo_nrodoc,
    N.NROPARCELACPG     AS novo_parc,
    N.STATUSDOCTOCPG    AS novo_status,
    N.QUITADODOCTOCPG   AS novo_quit,
    N.PAGAMENTOCPG      AS novo_pagto
  FROM CPGDOCTO D
  LEFT JOIN CPGDOCTO N
         ON N.CODDOCTOCPG = D.CODDOCTOCPGSUBST
        AND N.CODIGOEMPRESA = D.CODIGOEMPRESA
  WHERE D.CODIGOEMPRESA = 4
    AND D.CODDOCTOCPGSUBST IS NOT NULL
    AND D.VENCIMENTOCPG >= DATE '2026-01-01'
  ORDER BY D.CODDOCTOCPG DESC
) WHERE ROWNUM <= 50;


-- -----------------------------------------------------------------------------
-- BLOCO 5 — Duplicatas "de fato": mesmo nro doc + série + parcela + fornecedor
-- com mais de 1 linha NÃO cancelada. Cruza com pagos e com o ponteiro de subst.
-- Quantifica o tamanho do problema e mostra se duplicata == substituição.
-- -----------------------------------------------------------------------------
SELECT * FROM (
  SELECT NRODOCTOCPG, SERIEDOCTOCPG, NROPARCELACPG, CODIGOFORN,
         COUNT(*)                                                   AS qtd_linhas,
         SUM(CASE WHEN PAGAMENTOCPG IS NOT NULL THEN 1 ELSE 0 END)  AS qtd_pagos,
         SUM(CASE WHEN CODDOCTOCPGSUBST IS NOT NULL THEN 1 ELSE 0 END) AS qtd_com_subst
  FROM   CPGDOCTO
  WHERE  CODIGOEMPRESA = 4
    AND  STATUSDOCTOCPG <> 'C'
    AND  VENCIMENTOCPG >= DATE '2026-01-01'
  GROUP BY NRODOCTOCPG, SERIEDOCTOCPG, NROPARCELACPG, CODIGOFORN
  HAVING COUNT(*) > 1
  ORDER BY qtd_linhas DESC, qtd_pagos DESC
) WHERE ROWNUM <= 50;


-- -----------------------------------------------------------------------------
-- BLOCO 6 — Retorno bancário: cobertura das colunas em títulos PAGOS (mai/2026)
-- Mostra quantos pagos têm documento de retorno / autenticação / status PE.
-- -----------------------------------------------------------------------------
SELECT COUNT(*)                  AS pagos_mai,
       COUNT(NRDOCTORETBCOPE)    AS com_doc_retorno_bco,
       COUNT(AUTELETRONICA)      AS com_aut_eletronica,
       COUNT(STATUSPE)           AS com_statuspe,
       COUNT(STATUSPEMOD)        AS com_statuspemod,
       COUNT(CODMOVTOBCO)        AS com_movto_bco
FROM   CPGDOCTO
WHERE  CODIGOEMPRESA = 4
  AND  PAGAMENTOCPG >= DATE '2026-05-01'
  AND  PAGAMENTOCPG <  DATE '2026-06-01'
  AND  STATUSDOCTOCPG <> 'C';


-- -----------------------------------------------------------------------------
-- BLOCO 7 — Amostra real de pagos COM retorno bancário (ver o conteúdo das colunas)
-- -----------------------------------------------------------------------------
SELECT * FROM (
  SELECT CODDOCTOCPG, NRODOCTOCPG, NROPARCELACPG, CODTPDOC, PAGAMENTOCPG,
         TIPODOCPAGTOCPG, MODALIDADEPE, STATUSPE, STATUSPEMOD,
         NRDOCTORETBCOPE, AUTELETRONICA, CODMOVTOBCO
  FROM   CPGDOCTO
  WHERE  CODIGOEMPRESA = 4
    AND  PAGAMENTOCPG >= DATE '2026-05-01'
    AND  PAGAMENTOCPG <  DATE '2026-06-01'
    AND  STATUSDOCTOCPG <> 'C'
    AND  (NRDOCTORETBCOPE IS NOT NULL OR AUTELETRONICA IS NOT NULL)
  ORDER BY PAGAMENTOCPG DESC
) WHERE ROWNUM <= 30;


-- -----------------------------------------------------------------------------
-- BLOCO 8 — Modalidade de pagamento: distribuição e quanto vem VAZIO
-- (quantifica o "modalidade em branco" que queremos tornar explícito)
-- -----------------------------------------------------------------------------
SELECT TIPODOCPAGTOCPG, MODALIDADEPE, COUNT(*) AS qtd
FROM   CPGDOCTO
WHERE  CODIGOEMPRESA = 4
  AND  VENCIMENTOCPG >= DATE '2026-05-01'
  AND  VENCIMENTOCPG <  DATE '2026-07-01'
  AND  STATUSDOCTOCPG <> 'C'
GROUP BY TIPODOCPAGTOCPG, MODALIDADEPE
ORDER BY qtd DESC;


-- -----------------------------------------------------------------------------
-- BLOCO 9 — Status do pagamento eletrônico (STATUSPE) — o que cada código
-- significa ajuda a entender o "retorno". Traz a distribuição.
-- -----------------------------------------------------------------------------
SELECT STATUSPE, STATUSPEMOD, COUNT(*) AS qtd
FROM   CPGDOCTO
WHERE  CODIGOEMPRESA = 4
  AND  PAGAMENTOCPG >= DATE '2026-05-01'
  AND  PAGAMENTOCPG <  DATE '2026-06-01'
GROUP BY STATUSPE, STATUSPEMOD
ORDER BY qtd DESC;
