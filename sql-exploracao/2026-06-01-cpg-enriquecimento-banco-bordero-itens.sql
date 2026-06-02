-- =====================================================
-- Exploração CPG — enriquecimento do Contas a Pagar
-- Objetivo: descobrir colunas de BANCO QUE PAGOU, BORDERÔ (ex.: "BO-010260")
--           e confirmar estrutura de ITENS/CONTRAPARTIDA.
-- READ-ONLY. Rodar no Oracle do Globus (Pioneira, empresa=4).
-- Amostra: CODDOCTOCPG 995443/996242 = RAIZEN AD-0003616 (parcelas 1 e 2),
--          995528 = FORNECEDORES DIVERSOS recibo 9988905494.
-- =====================================================

-- BLOCO 1 — Todas as colunas do CPGDOCTO (pra achar banco/agência/conta/borderô)
SELECT /*+ NO_PARALLEL */ owner, column_name, data_type, data_length
FROM   all_tab_columns
WHERE  table_name = 'CPGDOCTO'
ORDER  BY owner, column_id;

-- BLOCO 2 — Tabelas relacionadas a CPG / pagamento / borderô
SELECT /*+ NO_PARALLEL */ owner, table_name
FROM   all_tables
WHERE  table_name LIKE 'CPG%'
   OR  table_name LIKE '%BORDER%'
   OR  table_name LIKE '%PAGAMENT%'
ORDER  BY table_name;

-- BLOCO 3 — Amostra real do cabeçalho do título (todos os campos)
--           Quero ver banco/conta de pagamento e o nº do borderô preenchidos.
SELECT /*+ NO_PARALLEL */ *
FROM   CPGDOCTO
WHERE  CODDOCTOCPG IN (995443, 996242, 995528);

-- BLOCO 4 — Itens do título (despesa, contrapartida contábil, centro de custo)
SELECT /*+ NO_PARALLEL */ *
FROM   CPGITDOC
WHERE  CODDOCTOCPG IN (995443, 996242, 995528)
ORDER  BY CODDOCTOCPG;
