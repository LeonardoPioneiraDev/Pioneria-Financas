-- =====================================================================
-- TRILHA DE AUDITORIA DE CONTAS A PAGAR NO GLOBUS
-- "Quem incluiu / liberou / assinou / PAGOU um título?"
-- =====================================================================
-- Data: 2026-05-26
-- Contexto: o "Fluxo do documento" (workflow inferido) precisa mostrar,
--   sem achismo, QUEM fez cada etapa de um CP. Esta investigação mapeia
--   onde cada informação mora de verdade no Globus (Oracle, owner GLOBUS).
-- Título usado de referência: CODDOCTOCPG = 995466
--   (BGMRODOTEC, NF Servico 0000046127/1, R$ 26.310,84, pago 25/05/2026).
--   No nosso sistema: origem_id_externo = '995466' = CPGDOCTO.CODDOCTOCPG.
--
-- TL;DR DO RESULTADO (ver detalhe em cada seção):
--   * Incluiu .......: MARCELO  18/05/2026 15:15:31
--   * Liberou/aprovou: LUZIA    22/05/2026 12:41:49
--   * Assinatura elet.: NAO EXISTE (USUARIO_ASS_ELETRON_APROVE_ME = vazio em 100% dos títulos)
--   * PAGOU (baixa) ..: LUZIA    25/05/2026 08:34:10   <-- achado em CPGDOCTO_HISTORICO_NEGOCIACOES
--   * CPGDOCTO.USUARIO = "ultimo a alterar" (ambiguo) -> NUNCA usar como pagador.
-- =====================================================================


-- =====================================================================
-- SECAO A — APROVACAO / LIBERACAO: familia BGM_APROVEME
-- =====================================================================
-- O CPGDOCTO so "cacheia" UM aprovador (o liberador). A trilha de aprovacao
-- completa fica no modulo APROVE-ME. Join pelo NUMERO DO DOCUMENTO + PARCELA
-- (coluna REQUISICAO = '<numero_documento>/<parcela com 3 digitos>'), NAO por
-- CODDOCTOCPG.

-- A.1 — estrutura
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
FROM   ALL_TAB_COLUMNS
WHERE  OWNER='GLOBUS' AND TABLE_NAME='BGM_APROVEME'
ORDER  BY COLUMN_ID;
-- Colunas-chave: USUARIO_APROVADOR (varchar15), DATA_APROVACAO (DATE = tem HORA),
--   STATUS_APROVACAO ('A'=aprovado), ROTINA (ex 'FIN_CPG_LIB_PAGTO'=liberacao),
--   REQUISICAO (numdoc/parcela), VALOR, DATA (emissao).
-- Detalhes extras em BGM_APROVEME_DADOSADICIONAIS (por ORDEM; ordem 7=vencimento).

-- A.2 — trilha de aprovacao de um titulo (TODAS as linhas)
SELECT a.idaproveme, a.usuario_aprovador, a.status_aprovacao, a.rotina,
       a.tipo, a.sistema_aprovador, a.data AS data_doc, a.data_aprovacao,
       a.valor, a.requisicao
FROM   GLOBUS.bgm_aproveme a
WHERE  a.requisicao LIKE '0000046127%'
ORDER  BY a.data_aprovacao, a.idaproveme;
-- RESULTADO 995466: 1 linha unica -> LUZIA, FIN_CPG_LIB_PAGTO, status A,
--   22/05/2026 12:41:49. NAO ha segunda linha de "assinatura" separada.
-- (bate exatamente com CPGDOCTO.DATALIBERACAOPGTO / USUARIO_LIB_PAGTO_APROVE_ME.)

-- A.3 — IMPORTANTE: NAO truncar a hora. A query "de producao" original usava
--   to_date(a.data_aprovacao,'dd/mm/yy') e PERDIA a hora. Selecionar a coluna direta.


-- =====================================================================
-- SECAO B — "PAGAMENTOCPG" NAO E TABELA; e COLUNA. Usuarios no CPGDOCTO.
-- =====================================================================
-- O comentario antigo do codigo dizia "PAGAMENTOCPG + QUITADO=S" como se
-- PAGAMENTOCPG fosse tabela. NAO E: e uma coluna DATE no proprio CPGDOCTO.
-- Estas duas queries vieram VAZIA / com ERRO (tabela inexistente):
--   SELECT ... ALL_TAB_COLUMNS WHERE TABLE_NAME='PAGAMENTOCPG';  -- vazio
--   SELECT * FROM GLOBUS.PAGAMENTOCPG WHERE CODDOCTOCPG=995466;   -- ORA-00942

-- B.1 — TODAS as colunas de usuario / pagamento / baixa do CPGDOCTO
SELECT COLUMN_NAME, DATA_TYPE
FROM   ALL_TAB_COLUMNS
WHERE  OWNER='GLOBUS' AND TABLE_NAME='CPGDOCTO'
  AND  (COLUMN_NAME LIKE '%USUARIO%' OR COLUMN_NAME LIKE '%BAIXA%'
     OR COLUMN_NAME LIKE '%QUITA%'   OR COLUMN_NAME LIKE '%PAGTO%'
     OR COLUMN_NAME LIKE '%PAGAMENTO%')
ORDER  BY COLUMN_NAME;
-- RESULTADO: as UNICAS colunas de usuario sao USUARIO, USUARIOCPG_EXC (exclusao),
--   USUARIO_INCLUSAO, USUARIO_LIBEROU_PAGTO, USUARIO_LIB_PAGTO_APROVE_ME,
--   USUARIO_ASS_ELETRON_APROVE_ME. NAO existe USUARIO_PAGAMENTO / USUARIO_BAIXA.
--   PAGAMENTOCPG e DATE (data da baixa), QUITADODOCTOCPG e flag. Sem executor.


-- =====================================================================
-- SECAO C — VARREDURA: toda tabela ligada ao documento que tem usuario
-- =====================================================================
-- Em vez de adivinhar nomes, perguntar ao catalogo: quais tabelas tem
-- CODDOCTOCPG E uma coluna de usuario? (acha qualquer log/baixa/tesouraria)
SELECT t.TABLE_NAME, t.COLUMN_NAME
FROM   ALL_TAB_COLUMNS t
WHERE  t.OWNER = 'GLOBUS'
  AND  (t.COLUMN_NAME LIKE '%USUARIO%' OR t.COLUMN_NAME LIKE '%OPERADOR%')
  AND  EXISTS (SELECT 1 FROM ALL_TAB_COLUMNS c
               WHERE c.OWNER=t.OWNER AND c.TABLE_NAME=t.TABLE_NAME
                 AND c.COLUMN_NAME='CODDOCTOCPG')
ORDER  BY t.TABLE_NAME, t.COLUMN_NAME;
-- RESULTADO: nenhuma tabela "de baixa". As ligadas ao CPG sao: CPGDOCTO (campos
--   ja citados), CPGDOCTO_2, CPGDOCTO_HISTORICO_NEGOCIACOES (<-- o achado!),
--   CPGITDOC_APURPISCOFINS, CPG_DESC_OBTIDOS_APURPISCOFINS e integracoes de folha.


-- =====================================================================
-- SECAO D — *** ACHADO DECISIVO ***  CPGDOCTO_HISTORICO_NEGOCIACOES
-- =====================================================================
-- Nome enganoso: NAO e so "negociacoes". E o LOG DE EVENTOS COMPLETO do
-- documento — 1 linha por evento, com USUARIO + timestamp real + tipo de evento
-- (COD_TP_EVENTO, FK p/ o dicionario CPGDOCTO_TIPO_EVENTOS) + descricao.
-- Join por CODDOCTOCPG (= nosso origem_id_externo). E A FONTE DE VERDADE do
-- workflow: tem criacao, liberacao E A BAIXA, todas com usuario/hora confiaveis.

-- D.1 — eventos de um titulo
SELECT *
FROM   GLOBUS.CPGDOCTO_HISTORICO_NEGOCIACOES
WHERE  CODDOCTOCPG = 995466
ORDER  BY <coluna_timestamp>;   -- ajustar apos pegar a estrutura (D.3)
-- RESULTADO 995466 (3 eventos):
--   evento 1 "Documento criado."      MARCELO  18/05/2026 15:15:31   status N
--   evento 9 "liberou pagamento"      LUZIA    22/05/2026 12:41:49   status N
--   evento 4 "Pagamento de documento" LUZIA    25/05/2026 08:34:10   status B (baixado)
-- ==> QUEM EFETIVOU O PAGAMENTO (a baixa) = LUZIA, 25/05/2026 08:34:10.
--     (o MARCELO so CRIOU; o fallback antigo o mostrava como pagador = ERRADO.)

-- D.2 — dicionario dos tipos de evento (mapear codigo -> significado)
SELECT COD_TP_EVENTO, DESC_EVENTO
FROM   GLOBUS.CPGDOCTO_TIPO_EVENTOS
ORDER  BY COD_TP_EVENTO;
-- Codigos observados: 1=Documento criado, 9=liberou pagamento, 4=Pagamento de documento.

-- D.3 — estrutura exata (necessaria p/ nomear colunas no adapter/ETL) -- PENDENTE
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH
FROM   ALL_TAB_COLUMNS
WHERE  OWNER='GLOBUS' AND TABLE_NAME='CPGDOCTO_HISTORICO_NEGOCIACOES'
ORDER  BY COLUMN_ID;

-- D.4 — cobertura (quantos docs/eventos existem) -- PENDENTE
SELECT COUNT(DISTINCT CODDOCTOCPG) AS docs_com_historico, COUNT(*) AS total_eventos
FROM   GLOBUS.CPGDOCTO_HISTORICO_NEGOCIACOES;


-- =====================================================================
-- SECAO E — PROVA DE QUE CPGDOCTO.USUARIO NAO SERVE COMO "PAGADOR"
-- =====================================================================
-- Rodado no Postgres LOCAL (finance.contas_pagar; usuario_responsavel = CPGDOCTO.USUARIO):
--   4.458 titulos pagos; 881 com USUARIO != incluidor; 2.517 sem usuario nenhum.
--   O USUARIO varia entre incluidor, LUZIA (liberadora) e PAULOVIEIRA conforme
--   "quem alterou por ultimo" -> NAO e o executor da baixa. Ex.: 562 titulos
--   RODNEYJR(incluiu)->PAULOVIEIRA(USUARIO). Usar isso = achismo contestavel.
-- Equivalente no Globus, se quiser conferir la:
--   SELECT USUARIO_INCLUSAO, USUARIO, COUNT(*) FROM GLOBUS.CPGDOCTO
--   WHERE CODIGOEMPRESA=4 AND QUITADODOCTOCPG='S'
--   GROUP BY USUARIO_INCLUSAO, USUARIO ORDER BY COUNT(*) DESC;


-- =====================================================================
-- SECAO F — INTEGRACAO  *** CONSTRUIDA EM 27/05/2026 ***
-- =====================================================================
-- Estrutura confirmada de CPGDOCTO_HISTORICO_NEGOCIACOES (cols relevantes):
--   CODDOCTOCPG, SEQUENCIA_EVENTO, COD_TP_EVENTO, USUARIO, DATA_EVENTO (tem HORA),
--   STATUSDOCTOCPG, MAIS_INFORMACOES, CODIGOEMPRESA.
-- Dicionario CPGDOCTO_TIPO_EVENTOS: 1=Origem, 2=Alt.vencimento, 3=Alt.valor,
--   4=Alteracao no status, 5=Associacao, 6=Desassociacao, 7=Alt.data entrada,
--   8=Alt.data emissao, 9=liberacao de pagamento, 10=Alt.tipo doc, 11=Assoc.contrato GCC.
-- ATENCAO: o PAGAMENTO nao tem codigo proprio -> e o evento 4 ("Alteracao no
--   status") cujo STATUSDOCTOCPG resultante = 'B' (baixado). USUARIO desse = quem pagou.
--
-- Codigo entregue (ver memoria [[cp-aprove-me-liberador-gap]]):
--   migration 1700000027000-cp-eventos.ts (stage + finance.cp_eventos)
--   adapter globus-cp-eventos.adapter.ts + query GLOBUS_QUERIES.cpEventos
--   ETL cp-eventos.etl.ts (liga origem_id_externo = cod_docto_cpg)
--   wired no contas-pagar.service sincronizar(); workflow-inferencia le a trilha real.
-- Mapeamento de etapas no workflow: 1=inclusao, 9=liberacao, status 'B'=pagamento.
-- Verificado local com os 3 eventos do 995466 -> baixa = LUZIA 25/05 08:34:10.

-- PLANO ORIGINAL (mantido como referencia):
-- 1. Adapter Oracle->stage: ler CPGDOCTO_HISTORICO_NEGOCIACOES por periodo
--    (filtrar CODIGOEMPRESA=4) -> integration.globus_cp_eventos_stage.
-- 2. ETL stage->finance.cp_eventos (1 linha por evento: coddoctocpg, cod_tp_evento,
--    descricao, usuario, ocorrido_em). Join com contas_pagar por origem_id_externo.
-- 3. workflow-inferencia (CP): derivar cada etapa da trilha real ->
--    inclusao/liberacao/pagamento com USUARIO + HORA reais; "Pagamento efetivo"
--    deixa de ser "sem usuario" e passa a "por LUZIA em 25/05 08:34:10".
-- 4. Verificar local inserindo os 3 eventos reais do 995466 antes do sync Oracle.
--
-- Estado atual do codigo (ja entregue, sem este sync ainda):
--   - workflow por EVIDENCIA real (mata assinatura-fantasma): so marca etapa
--     concluida com dado; pagamento sem usuario inventado.
--   Ver memoria [[cp-aprove-me-liberador-gap]] e o doc das tabelas financeiras.
