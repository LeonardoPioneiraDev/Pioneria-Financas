/**
 * Queries SQL aplicadas no schema Oracle do GLOBUS (Praxio).
 *
 * Filtros obrigatorios da Praxio (sempre presentes):
 *   - R.STATUSNF        = 'F'   (NF efetivada)
 *   - I.STATUSITENSNF  <> 'C'   (item nao cancelado)
 *   - D.STATUSDOCTOCPG <> 'C'   (titulo CPG nao cancelado)
 *   - R.CODTPDOC        = 'NF'  (exclui CTE etc.)
 *   - I.CODIGOMATINT   <> 95079 (material tecnico que distorce somas)
 *
 * Intervalo de datas: usar SEMPRE semi-aberto (>= dt_ini AND < dt_fim_proximo_mes)
 * para nao perder lancamentos do ultimo dia com hora > 00:00.
 *
 * Hint NO_PARALLEL em todas as queries — Globus e Oracle compartilhado com
 * varios sistemas criticos da operacao. Forcar serial protege CPU.
 *
 * Placeholders processados em runtime (em vez de bind nomeado):
 *   __FILIAIS__ — substituido por "1, 5, 6, 17, 19" (lista do env). Usado em
 *                 queries que filtram por CODIGOFL IN (...) pois oracledb nao
 *                 aceita array bind em IN-list direto. Os valores sao validados
 *                 como inteiros positivos antes da interpolacao (ver
 *                 shared/utils/sql.ts).
 *
 * Ver documentacao completa em Leia/globus-tabelas-financeiras-documentacao.md
 */

export const GLOBUS_QUERIES = {
  /**
   * Relatorio mensal: Compras x Pagamentos programados de NF x Carteira CPG.
   *
   * Binds:
   *   :empresa     - NUMBER (codigo da empresa, ex: 4 para Pioneira)
   *   :dt_ini      - DATE   (primeiro dia do mes)
   *   :dt_fim_excl - DATE   (primeiro dia do mes seguinte, EXCLUSIVO)
   *
   * Colunas retornadas:
   *   MES          - VARCHAR2 (nome do mes em portugues)
   *   CODEMP       - NUMBER
   *   NOME_EMPRESA - VARCHAR2
   *   VLR_COMPRAS  - NUMBER   (NFs emitidas no mes)
   *   VLR_PAG      - NUMBER   (parcelas de NF vencendo no mes)
   *   VLR_VENCFIN  - NUMBER   (carteira CPG vencendo no mes)
   *   PERC         - NUMBER   (VLR_PAG / VLR_VENCFIN * 100)
   *   ENTRADADEFIN - NUMBER   (deficit: VLR_VENCFIN - VLR_PAG, minimo 0)
   *
   * Convertida de BETWEEN para >= AND < (semi-aberto) - mais seguro.
   */
  /**
   * Lista titulos do Contas a Pagar (CPGDOCTO + CPGITDOC) com dados de
   * fornecedor (FAVORECIDODOCTOCPG embutido no CPGDOCTO). Filtrado por
   * empresa e vencimento (semi-aberto).
   *
   * Binds: :empresa, :dt_ini, :dt_fim_excl
   *
   * Granularidade: 1 linha por titulo CPG. Os itens (`CPGITDOC`) sao
   * agregados em ARRAY/listagem futura; por enquanto soma de VALORITEMDOC.
   */
  contasAPagar: `
    SELECT /*+ NO_PARALLEL */
      D.CODDOCTOCPG          AS COD_DOCTO_CPG,
      D.CODIGOEMPRESA        AS CODIGO_EMPRESA,
      D.NRODOCTOCPG          AS NUMERO_DOCUMENTO,
      D.SERIEDOCTOCPG        AS SERIE_DOCUMENTO,
      D.NROPARCELACPG        AS NUMERO_PARCELA,
      D.CODTPDOC             AS TIPO_DOC,
      D.EMISSAOCPG           AS DATA_EMISSAO,
      D.ENTRADACPG           AS DATA_ENTRADA,
      D.VENCIMENTOCPG        AS DATA_VENCIMENTO,
      D.PAGAMENTOCPG         AS DATA_PAGAMENTO,
      D.COMPETENCIA          AS COMPETENCIA,
      D.STATUSDOCTOCPG       AS STATUS_DOCTO,
      D.QUITADODOCTOCPG      AS QUITADO,
      D.PAGAMENTOLIBERADO    AS PAGAMENTO_LIBERADO,
      D.VLR_ORIGINAL         AS VLR_ORIGINAL,
      D.DESCONTOCPG          AS DESCONTO,
      D.ACRESCIMOCPG         AS ACRESCIMO,
      D.CODIGOFORN           AS CODIGO_FORN,
      -- JOIN com BGM_FORNECEDOR pra trazer razao social/fantasia/CNPJ reais.
      -- Fallback no FAVORECIDODOCTOCPG (texto livre 200 chars do proprio titulo)
      -- caso o fornecedor nao esteja cadastrado (raro).
      COALESCE(F.RSOCIALFORN, D.FAVORECIDODOCTOCPG) AS FAVORECIDO,
      F.NFANTASIAFORN        AS FORN_FANTASIA,
      -- Atributos fiscais do fornecedor (pra conferencia de retencoes / ISS).
      F.FORN_OPT_SIMPLES_NACIONAL AS FORN_SIMPLES,
      F.TPINSCRICAOFORN      AS FORN_TP_INSCR,
      F.CODIGOUF             AS FORN_UF,
      F.CIDADEFORN           AS FORN_CIDADE,
      F.CODMUNIC             AS FORN_COD_MUNIC,
      D.NRINSCR_FAV          AS NRINSCR_FAV,
      D.TPINSCR_FAV          AS TPINSCR_FAV,
      -- Favorecido "real" (texto livre do titulo). Pode diferir do fornecedor
      -- cadastrado (ex.: fornecedor generico) ou vir vazio.
      D.FAVORECIDODOCTOCPG   AS FAVORECIDO_NOME,
      -- Banco que PAGOU (conta da empresa). O pagamento efetivo mora no BCOMOVTO
      -- (link D.CODMOVTOBCO); fallback no banco programado do proprio titulo
      -- (D.CODBANCO/CODAGENCIA/CODCONTABCO). Nome via BCOBANCO.
      NVL(MB.CODBANCO, D.CODBANCO)         AS COD_BANCO_PAG,
      NVL(MB.CODAGENCIA, D.CODAGENCIA)     AS COD_AGENCIA_PAG,
      NVL(MB.CODCONTABCO, D.CODCONTABCO)   AS COD_CONTA_PAG,
      BB.NOMEBANCO                         AS BANCO_PAG_NOME,
      D.CODMOVTOBCO          AS COD_MOVTO_BCO,
      -- Borderô / nº do documento bancario que liquidou (ex.: "BO-010260").
      MB.DOCMOVTOBCO         AS PAGAMENTO_DOC,
      D.MODALIDADEPE         AS MODALIDADE_PE,
      D.TIPODOCPAGTOCPG      AS TIPO_PAGTO,
      D.VLRINSSCPG           AS VLR_INSS,
      D.VLRIRRFCPG           AS VLR_IRRF,
      D.VLRPISCPG            AS VLR_PIS,
      D.VLRCOFINSCPG         AS VLR_COFINS,
      D.VLRCSLCPG            AS VLR_CSLL,
      D.VLRISSCPG            AS VLR_ISS,
      D.DATA_INTEGROU_FLP    AS DATA_INTEGROU_FLP,
      D.COMPETENCIA_FLP      AS COMPETENCIA_FLP,
      D.VLR_INSS_CALC_FLP    AS VLR_INSS_CALC_FLP,
      D.VLR_IRRF_CALC_FLP    AS VLR_IRRF_CALC_FLP,
      D.VLR_SESTSENAT_CALC_FLP AS VLR_SESTSENAT_CALC_FLP,
      D.MODULO_INCLUSAO      AS MODULO_INCLUSAO,
      -- Trilha de auditoria: logins/codigos do Globus + datas.
      -- Mapeamento pra nome real esta no proximo work item.
      D.USUARIO_INCLUSAO                  AS USUARIO_INCLUSAO,
      D.DATA_INCLUSAO                     AS DATA_INCLUSAO,
      -- Liberacao de pagamento: o fluxo eletronico do APROVE-ME grava em
      -- USUARIO_LIB_PAGTO_APROVE_ME, mas a liberacao "comum" cai em
      -- USUARIO_LIBEROU_PAGTO (na mesma CPGDOCTO). COALESCE cobre os dois sem
      -- join, eliminando o "usuario nao registrado" no fluxo do documento (SFN-41).
      COALESCE(D.USUARIO_LIB_PAGTO_APROVE_ME, D.USUARIO_LIBEROU_PAGTO) AS USUARIO_LIB_PAGTO,
      D.DATALIBERACAOPGTO                 AS DATA_LIBERACAO_PAGTO,
      D.USUARIO_ASS_ELETRON_APROVE_ME     AS USUARIO_ASSINATURA,
      -- Responsavel generico + assinaturas secundarias (preenchem o vazio da
      -- etapa pagamento e mostram aprovadores fisicos na etapa assinatura).
      D.USUARIO                           AS USUARIO_RESPONSAVEL,
      D.ASSINATURA_1                      AS ASSINATURA_1,
      D.ASSINATURA_2                      AS ASSINATURA_2,
      -- Descricao livre do titulo (ex: "COMPRA ARGAMASSA-TUBO PVC-THINNER").
      D.OBSDOCTOCPG                       AS OBSERVACAO,
      -- Setor = CENTRO DE CUSTO FINANCEIRO do item (CPGITDOC.CODCUSTOFIN), com
      -- descricao no mestre CPGCUSTOS (CODIGO -> DESCRICAO). CPGDOCTO.CODSETOR
      -- esta vazio em 100% dos CPs da Pioneira (validado 543k linhas), por isso
      -- usamos o custo financeiro do item. Quando o titulo tem itens em mais de
      -- uma unidade (rateio, ~1%), elegemos a DOMINANTE por valor (COD_SETOR /
      -- SETOR_NOME) e contamos quantas unidades distintas (QTD_SETORES).
      (SELECT DOM.CODCUSTOFIN FROM (
         SELECT II.CODCUSTOFIN
         FROM CPGITDOC II
         WHERE II.CODDOCTOCPG = D.CODDOCTOCPG AND II.CODCUSTOFIN IS NOT NULL
         GROUP BY II.CODCUSTOFIN
         ORDER BY SUM(II.VALORITEMDOC) DESC, II.CODCUSTOFIN
       ) DOM WHERE ROWNUM = 1)             AS COD_SETOR,
      (SELECT CC.DESCRICAO FROM CPGCUSTOS CC WHERE CC.CODIGO = (
         SELECT DOM2.CODCUSTOFIN FROM (
           SELECT II2.CODCUSTOFIN
           FROM CPGITDOC II2
           WHERE II2.CODDOCTOCPG = D.CODDOCTOCPG AND II2.CODCUSTOFIN IS NOT NULL
           GROUP BY II2.CODCUSTOFIN
           ORDER BY SUM(II2.VALORITEMDOC) DESC, II2.CODCUSTOFIN
         ) DOM2 WHERE ROWNUM = 1)) AS SETOR_NOME,
      (SELECT COUNT(DISTINCT II3.CODCUSTOFIN) FROM CPGITDOC II3
         WHERE II3.CODDOCTOCPG = D.CODDOCTOCPG AND II3.CODCUSTOFIN IS NOT NULL) AS QTD_SETORES,
      (SELECT SUM(I.VALORITEMDOC) FROM CPGITDOC I WHERE I.CODDOCTOCPG = D.CODDOCTOCPG) AS VLR_TOTAL_ITENS
    FROM CPGDOCTO D
    LEFT JOIN BGM_FORNECEDOR F ON F.CODIGOFORN = D.CODIGOFORN
    -- Movimento bancario que liquidou o titulo (1:1 pela PK CODMOVTOBCO).
    LEFT JOIN BCOMOVTO MB ON MB.CODMOVTOBCO = D.CODMOVTOBCO
    -- Cadastro do banco pagador (resolvido do movimento, senao do titulo).
    LEFT JOIN BCOBANCO BB ON BB.CODBANCO = NVL(MB.CODBANCO, D.CODBANCO)
    WHERE D.CODIGOEMPRESA   = :empresa
      -- Sem filtro de STATUSDOCTOCPG: cancelados (C) tambem vem, para que o
      -- adapter possa detectar exclusao no Globus (Sprint 2.3). ETL/UI filtram
      -- excluido_em IS NULL.
      AND D.VENCIMENTOCPG  >= :dt_ini
      AND D.VENCIMENTOCPG  <  :dt_fim_excl
    ORDER BY D.VENCIMENTOCPG DESC, D.CODDOCTOCPG
  `,

  /**
   * Trilha de eventos do CP — GLOBUS.CPGDOCTO_HISTORICO_NEGOCIACOES.
   * Log por documento: 1 linha por ato com USUARIO + DATA_EVENTO (hora real) +
   * COD_TP_EVENTO (join no dicionario p/ descricao) + STATUSDOCTOCPG resultante.
   *
   * E a fonte de "quem efetivou a baixa" (evento com STATUSDOCTOCPG='B').
   * Mapeamento de etapas (no consumo): 1=inclusao, 9=liberacao, status 'B'=pagamento.
   *
   * Binds: :empresa, :dt_ini, :dt_fim_excl (janela por DATA_EVENTO).
   * Granularidade: 1 linha por evento (CODDOCTOCPG + SEQUENCIA_EVENTO).
   */
  cpEventos: `
    SELECT
      H.CODDOCTOCPG        AS COD_DOCTO_CPG,
      H.CODIGOEMPRESA      AS CODIGO_EMPRESA,
      H.SEQUENCIA_EVENTO   AS SEQUENCIA_EVENTO,
      H.COD_TP_EVENTO      AS COD_TP_EVENTO,
      E.DESC_EVENTO        AS TIPO_EVENTO_DESC,
      H.MAIS_INFORMACOES   AS MAIS_INFORMACOES,
      H.STATUSDOCTOCPG     AS STATUS_DOCTO,
      H.USUARIO            AS USUARIO,
      H.DATA_EVENTO        AS DATA_EVENTO
    FROM CPGDOCTO_HISTORICO_NEGOCIACOES H
    LEFT JOIN CPGDOCTO_TIPO_EVENTOS E ON E.COD_TP_EVENTO = H.COD_TP_EVENTO
    WHERE H.CODIGOEMPRESA  = :empresa
      AND H.DATA_EVENTO   >= :dt_ini
      AND H.DATA_EVENTO   <  :dt_fim_excl
    ORDER BY H.CODDOCTOCPG, H.SEQUENCIA_EVENTO
  `,

  // ========================================================================
  // FOLHA DE PAGAMENTO (FLP - visao operacional)
  // Documentado em: Leia/folha-flp-detalhamento.md
  // ========================================================================

  /**
   * Cadastro de funcionarios ativos com setor (CODAREA/DESCAREA), funcao e
   * dados bancarios. Empresa 4 = Pioneira, filial 1 = principal.
   *
   * Binds: :empresa, :filial
   * Granularidade: 1 linha por funcionario.
   */
  funcionariosAtivos: `
    SELECT /*+ NO_PARALLEL */
      F.CODINTFUNC         AS COD_INT_FUNC,
      F.CODFUNC            AS COD_FUNC,
      F.NOMECOMPLETOFUNC   AS NOME,
      F.CODAREA            AS COD_AREA,
      F.DESCAREA           AS DESC_AREA,
      F.CODDEPTO           AS COD_DEPTO,
      F.DESCFUNCAO         AS DESC_FUNCAO,
      F.CODAGENCIA         AS COD_AGENCIA,
      F.CONTACORFUNC       AS CONTA_CORRENTE,
      F.CODIGOEMPRESA      AS CODIGO_EMPRESA,
      F.CODIGOFL           AS CODIGO_FL
    FROM VW_FUNCIONARIOS F
    WHERE F.CODIGOEMPRESA = :empresa
      AND F.CODIGOFL      IN (__FILIAIS__)
    ORDER BY F.CODAREA, F.NOMECOMPLETOFUNC
  `,

  /**
   * Encerramentos da folha (FLP_ENCERRAMENTOFICHAFIN).
   * Cada linha = uma competencia+tipo_folha encerrada (congelada).
   *
   * Usado pelo adapter FLP pra decidir se vale a pena re-sincronizar uma
   * competencia ja fechada. Janela ampla (12 meses) porque eh tabela
   * pequena e queremos cache local relevante.
   *
   * Binds: :empresa, :dt_ini, :dt_fim_excl (range em COMPETENCIA)
   * Filiais via placeholder __FILIAIS__.
   */
  flpEncerramentos: `
    SELECT /*+ NO_PARALLEL */
      E.CODIGOEMPRESA   AS CODIGO_EMPRESA,
      E.CODIGOFL        AS CODIGO_FL,
      E.TIPOFOLHA       AS TIPO_FOLHA,
      E.COMPETENCIA     AS COMPETENCIA
    FROM FLP_ENCERRAMENTOFICHAFIN E
    WHERE E.CODIGOEMPRESA = :empresa
      AND E.CODIGOFL      IN (__FILIAIS__)
      AND E.COMPETENCIA  >= :dt_ini
      AND E.COMPETENCIA  <  :dt_fim_excl
    ORDER BY E.COMPETENCIA DESC, E.CODIGOFL, E.TIPOFOLHA
  `,

  /**
   * Catalogo de eventos da folha (verbas do holerite).
   * TIPOEVEN: P=provento, D=desconto, B=base/totalizador (nao soma).
   *
   * Binds: (nenhum - catalogo completo)
   */
  eventosFolha: `
    SELECT /*+ NO_PARALLEL */
      E.CODEVENTO          AS COD_EVENTO,
      E.DESCEVEN           AS DESCRICAO,
      E.TIPOEVEN           AS TIPO
    FROM FLP_EVENTOS E
    ORDER BY E.CODEVENTO
  `,

  /**
   * Ficha financeira: 1 linha por evento por funcionario por competencia.
   * Aceita filtro opcional por tipoFolha (1=mensal, 2=adiantamento, 3=13o,
   * 4=ferias, 5=rescisao - confirmar com Pioneira).
   *
   * Filtro de data: semi-aberto [dt_ini, dt_fim_excl) — pega TODAS as fichas no
   * intervalo. Quem chama deve passar:
   *   dt_ini      = ultimo dia do mes ANTERIOR ao desejado (ex: 2026-04-30)
   *   dt_fim_excl = primeiro dia do mes SEGUINTE ao desejado (ex: 2026-06-01)
   * Isso cobre as duas convencoes Praxio: folha de maio gravada como 30/04 OU 31/05.
   *
   * Binds: :empresa, :filial, :dt_ini, :dt_fim_excl, :tipo_folha
   *   - :tipo_folha pode ser NULL para trazer todos os tipos
   */
  fichaEventos: `
    SELECT /*+ NO_PARALLEL */
      FE.CODINTFUNC        AS COD_INT_FUNC,
      F.CODFUNC            AS COD_FUNC,
      F.CODAREA            AS COD_AREA,
      F.DESCAREA           AS DESC_AREA,
      FE.CODEVENTO         AS COD_EVENTO,
      E.DESCEVEN           AS DESC_EVENTO,
      E.TIPOEVEN           AS TIPO_EVENTO,
      FE.COMPETFICHA       AS COMPETENCIA,
      FE.TIPOFOLHA         AS TIPO_FOLHA,
      FE.REFERENCIA        AS REFERENCIA,
      FE.VALORFICHA        AS VALOR
    FROM FLP_FICHAEVENTOS FE
    JOIN VW_FUNCIONARIOS F ON F.CODINTFUNC = FE.CODINTFUNC
    JOIN FLP_EVENTOS     E ON E.CODEVENTO  = FE.CODEVENTO
    WHERE F.CODIGOEMPRESA = :empresa
      AND F.CODIGOFL      IN (__FILIAIS__)
      AND FE.COMPETFICHA >= :dt_ini
      AND FE.COMPETFICHA <  :dt_fim_excl
      AND (:tipo_folha IS NULL OR FE.TIPOFOLHA = :tipo_folha)
    ORDER BY F.CODAREA, F.CODFUNC, E.TIPOEVEN, E.CODEVENTO
  `,

  /**
   * Contra-cheque (holerite) de um funcionario na competencia.
   * Eventos P/D listados + totalizadores B agregados via window function.
   * Codigos base usados (CODEVENTO TIPOEVEN='B'):
   *   300=Base salarial, 315=Base INSS, 318=Total proventos, 319=Total descontos,
   *   322=Base IRRF, 330=Base FGTS, 500=Liquido, 508=FGTS calculado.
   *
   * Binds: :empresa, :filial, :competencia, :cod_func
   */
  contraCheque: `
    SELECT /*+ NO_PARALLEL */ A.COD_FUNC, A.DESC_FUNCAO, A.NOME, A.COD_AREA, A.DESC_AREA,
           A.COD_EVENTO, A.DESC_EVENTO, A.TIPO_EVENTO, A.REFERENCIA, A.VALOR,
           A.COD_AGENCIA, A.CONTA_CORRENTE,
           A.PROVENTOS, A.DESCONTOS,
           A.BASE_SALARIAL, A.BASE_INSS, A.BASE_FGTS, A.FGTS, A.BASE_IRRF,
           A.TOTAL_PROV, A.TOTAL_DESC, A.TOTAL_LIQ
    FROM (
      SELECT
        F.CODFUNC        AS COD_FUNC,
        F.DESCFUNCAO     AS DESC_FUNCAO,
        F.NOMECOMPLETOFUNC AS NOME,
        F.CODAREA        AS COD_AREA,
        F.DESCAREA       AS DESC_AREA,
        E.CODEVENTO      AS COD_EVENTO,
        E.DESCEVEN       AS DESC_EVENTO,
        E.TIPOEVEN       AS TIPO_EVENTO,
        FE.REFERENCIA    AS REFERENCIA,
        FE.VALORFICHA    AS VALOR,
        F.CODAGENCIA     AS COD_AGENCIA,
        F.CONTACORFUNC   AS CONTA_CORRENTE,
        SUM(CASE WHEN E.TIPOEVEN='P' AND FE.VALORFICHA>0 THEN FE.VALORFICHA END)
          OVER (PARTITION BY E.DESCEVEN, E.TIPOEVEN) AS PROVENTOS,
        SUM(CASE WHEN E.TIPOEVEN='D' AND FE.VALORFICHA>0 THEN FE.VALORFICHA END)
          OVER (PARTITION BY E.DESCEVEN, E.TIPOEVEN) AS DESCONTOS,
        SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=300 THEN FE.VALORFICHA END) OVER() AS BASE_SALARIAL,
        SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=315 THEN FE.VALORFICHA END) OVER() AS BASE_INSS,
        SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=330 THEN FE.VALORFICHA END) OVER() AS BASE_FGTS,
        SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=508 THEN FE.VALORFICHA END) OVER() AS FGTS,
        SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=322 THEN FE.VALORFICHA END) OVER() AS BASE_IRRF,
        SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=318 THEN FE.VALORFICHA END) OVER() AS TOTAL_PROV,
        SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=319 THEN FE.VALORFICHA END) OVER() AS TOTAL_DESC,
        SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=500 THEN FE.VALORFICHA END) OVER() AS TOTAL_LIQ
      FROM VW_FUNCIONARIOS F, FLP_FICHAEVENTOS FE, FLP_EVENTOS E
      WHERE F.CODINTFUNC    = FE.CODINTFUNC
        AND FE.CODEVENTO    = E.CODEVENTO
        AND F.CODIGOEMPRESA = :empresa
        AND F.CODIGOFL      IN (__FILIAIS__)
        AND FE.COMPETFICHA  = :competencia
        AND F.CODFUNC       = :cod_func
    ) A
    WHERE A.TIPO_EVENTO IN ('P', 'D')
    ORDER BY A.TIPO_EVENTO, A.COD_EVENTO
  `,

  /**
   * Folha consolidada por SETOR (agrupa CODAREA/DESCAREA).
   * Soma proventos / descontos / liquido / FGTS / INSS por setor.
   * Usa range semi-aberto de COMPETFICHA (ver fichaEventos).
   *
   * Binds: :empresa, :filial, :dt_ini, :dt_fim_excl, :tipo_folha
   */
  folhaPorSetor: `
    SELECT /*+ NO_PARALLEL */
      F.CODAREA           AS COD_AREA,
      F.DESCAREA          AS DESC_AREA,
      COUNT(DISTINCT F.CODFUNC) AS QTD_FUNCIONARIOS,
      SUM(CASE WHEN E.TIPOEVEN = 'P' THEN FE.VALORFICHA ELSE 0 END) AS PROVENTOS,
      SUM(CASE WHEN E.TIPOEVEN = 'D' THEN FE.VALORFICHA ELSE 0 END) AS DESCONTOS,
      SUM(CASE WHEN E.TIPOEVEN = 'P' THEN FE.VALORFICHA ELSE 0 END)
        - SUM(CASE WHEN E.TIPOEVEN = 'D' THEN FE.VALORFICHA ELSE 0 END) AS LIQUIDO,
      SUM(CASE WHEN E.CODEVENTO = 508 THEN FE.VALORFICHA ELSE 0 END) AS FGTS_CALC,
      SUM(CASE WHEN UPPER(E.DESCEVEN) LIKE '%INSS%' AND E.TIPOEVEN='D' THEN FE.VALORFICHA ELSE 0 END) AS INSS_DESC,
      SUM(CASE WHEN UPPER(E.DESCEVEN) LIKE '%IRRF%' AND E.TIPOEVEN='D' THEN FE.VALORFICHA ELSE 0 END) AS IRRF_DESC
    FROM FLP_FICHAEVENTOS FE
    JOIN VW_FUNCIONARIOS F ON F.CODINTFUNC = FE.CODINTFUNC
    JOIN FLP_EVENTOS     E ON E.CODEVENTO  = FE.CODEVENTO
    WHERE F.CODIGOEMPRESA = :empresa
      AND F.CODIGOFL      IN (__FILIAIS__)
      AND FE.COMPETFICHA >= :dt_ini
      AND FE.COMPETFICHA <  :dt_fim_excl
      AND (:tipo_folha IS NULL OR FE.TIPOFOLHA = :tipo_folha)
      AND E.TIPOEVEN IN ('P', 'D', 'B')
    GROUP BY F.CODAREA, F.DESCAREA
    ORDER BY LIQUIDO DESC
  `,

  /**
   * Geracao de adiantamento (10% sobre evento 503 na folha de adiantamento).
   * Retorna valores em reais E ja formatados em centavos para layout posicional.
   *
   * Binds: :empresa, :competencia, :cod_func
   *   - :cod_func pode ser NULL para trazer todos os funcionarios
   */
  adiantamento10pc: `
    WITH EMPRESAS AS (
      SELECT /*+ NO_PARALLEL */ EMP.CODIGOEMPRESA AS EMPRESA,
             AUE.RSOCIALEMPRESA AS RSEMPRESA,
             AUE.NOMEFANTASIAEMPRESA AS NFEMPRESA
      FROM CTR_CADEMP EMP
      JOIN CTR_EMPAUTORIZADAS AUE ON EMP.CODINTEMPAUT = AUE.CODINTEMPAUT
    ),
    BASE AS (
      SELECT /*+ NO_PARALLEL */ F.CODINTFUNC, F.CODFUNC, F.NOMECOMPLETOFUNC,
             EM.RSEMPRESA, F.DESCFUNCAO,
             SUM(L.REFERENCIA) AS REFERENCIA,
             SUM(L.VALORFICHA) AS VALORFICHA,
             ROUND(SUM(L.VALORFICHA) * 0.10, 2) AS DIF
      FROM VW_FUNCIONARIOS F
      JOIN FLP_FICHAEVENTOS L ON F.CODINTFUNC = L.CODINTFUNC
      JOIN EMPRESAS EM ON EM.EMPRESA = F.CODIGOEMPRESA
      WHERE L.COMPETFICHA = :competencia
        AND L.CODEVENTO   = 503
        AND L.TIPOFOLHA   IN (2)
        AND EM.EMPRESA    = :empresa
        AND (:cod_func IS NULL OR F.CODFUNC = :cod_func)
      GROUP BY F.CODINTFUNC, F.CODFUNC, F.NOMECOMPLETOFUNC, EM.RSEMPRESA, F.DESCFUNCAO
    )
    SELECT /*+ NO_PARALLEL */ B.CODFUNC,
           B.NOMECOMPLETOFUNC AS NOME,
           B.DESCFUNCAO       AS FUNCAO,
           B.VALORFICHA       AS VLR_REAIS,
           B.DIF              AS DIF_REAIS,
           LPAD(TO_CHAR(ROUND(B.DIF        * 100)), 6, '0') AS DIF_CENTAVOS,
           LPAD(TO_CHAR(ROUND(B.VALORFICHA * 100)), 6, '0') AS VLR_CENTAVOS,
           B.CODFUNC || LPAD(TO_CHAR(ROUND(B.VALORFICHA * 100)), 6, '0') AS TXT,
           B.CODFUNC || LPAD(TO_CHAR(ROUND(B.DIF        * 100)), 6, '0') AS TXT_DIF
    FROM BASE B
    ORDER BY B.CODFUNC
  `,

  // ========================================================================
  // CONTAS A RECEBER (CRC - Praxio)
  // Documentado em: Leia/globus-contas-receber-caixa.md
  // ========================================================================

  /**
   * Clientes ativos da empresa. Vem do BGM_CLIENTE com 176 colunas — pegamos
   * só os essenciais. CONDICAOCLI='A' para clientes ativos.
   *
   * BGM_CLIENTE é cadastro mestre compartilhado por todo o grupo (5.118 ativos
   * no total). Para a Pioneira, filtramos via EXISTS em CRCDOCTO — só traz cliente
   * que tem ao menos 1 título a receber da empresa indicada.
   *
   * Binds: :empresa
   */
  clientesAtivos: `
    SELECT /*+ NO_PARALLEL */
      C.CODCLI                  AS COD_CLI,
      C.NRCLI                   AS NR_CLI,
      C.RSOCIALCLI              AS RAZAO_SOCIAL,
      C.NFANTASIACLI            AS NOME_FANTASIA,
      C.TPINSCRICAOCLI          AS TIPO_INSCRICAO,
      C.NRINSCRICAOCLI          AS NUMERO_INSCRICAO,
      C.INSCESTADUALCLI         AS INSC_ESTADUAL,
      C.INSCMUNICIPALCLI        AS INSC_MUNICIPAL,
      C.EMAILCLI                AS EMAIL,
      C.TELEFONECLI             AS TELEFONE,
      C.ENDERECOCLI             AS ENDERECO,
      C.BAIRROCLI               AS BAIRRO,
      C.CIDADECLI               AS CIDADE,
      C.CODIGOUF                AS UF,
      C.CEPCLI                  AS CEP,
      C.CONDICAOCLI             AS CONDICAO,
      C.DATA_CADASTRO           AS DATA_CADASTRO,
      C.DATAULTIMOMOVTOCLI      AS ULTIMO_MOVTO,
      C.BANCO_FAT               AS BANCO_FAT,
      C.AGENCIA_FAT             AS AGENCIA_FAT,
      C.CONTA_FAT               AS CONTA_FAT
    FROM BGM_CLIENTE C
    WHERE C.CONDICAOCLI = 'A'
      AND EXISTS (
        SELECT 1
        FROM   CRCDOCTO D
        WHERE  D.CODCLI         = C.CODCLI
          AND  D.CODIGOEMPRESA  = :empresa
      )
    ORDER BY C.CODCLI
  `,

  /**
   * Catálogo de tipos de receita (plano contábil interno). 241 linhas no total.
   */
  tiposReceita: `
    SELECT /*+ NO_PARALLEL */
      R.CODTPRECEITA            AS COD_TP_RECEITA,
      R.DESCTPRECEITA           AS DESCRICAO,
      R.CLASSIFICADOR           AS CLASSIFICADOR,
      R.CODIGO_SERVICO          AS CODIGO_SERVICO,
      R.ACEITALANCAMENTO        AS ACEITA_LANCAMENTO,
      R.EXIGECCUSTOSFIN         AS EXIGE_CCUSTO_FIN
    FROM CRCTPREC R
    ORDER BY R.CODTPRECEITA
  `,

  /**
   * Cadastro de bancos cadastrados na Pioneira (44 linhas).
   */
  bancos: `
    SELECT /*+ NO_PARALLEL */
      B.CODBANCO              AS COD_BANCO,
      B.NROBANCO              AS NUMERO_FEBRABAN,
      B.NOMEBANCO             AS NOME,
      B.HOMEPAGEBANCO         AS HOMEPAGE,
      B.ISBP                  AS ISPB
    FROM BCOBANCO B
    WHERE B.NROBANCO IS NOT NULL
    ORDER BY B.NROBANCO
  `,

  /**
   * Códigos CNAB de retorno bancário do CRC (178 códigos).
   */
  cnabOcorrenciasCrc: `
    SELECT /*+ NO_PARALLEL */ O.CODIGO, O.DESCRICAO
    FROM CRC_OCORRENCIASBANCARIAS O
    ORDER BY O.CODIGO
  `,

  /**
   * Códigos CNAB de retorno bancário do CPG (587 códigos).
   */
  cnabOcorrenciasCpg: `
    SELECT /*+ NO_PARALLEL */ O.CODIGO, O.DESCRICAO
    FROM CPG_OCORRENCIASBANCARIAS O
    ORDER BY O.CODIGO
  `,

  /**
   * Lista títulos de Contas a Receber (CRCDOCTO + soma CRCITDOC).
   * O valor principal mora em CRCITDOC.VALORITEMDOC — somamos via subquery.
   *
   * Binds: :empresa, :dt_ini, :dt_fim_excl (range semi-aberto em VENCIMENTOCRC)
   */
  contasReceber: `
    SELECT /*+ NO_PARALLEL */
      D.CODDOCTOCRC             AS COD_DOCTO_CRC,
      D.CODIGOEMPRESA           AS CODIGO_EMPRESA,
      D.CODIGOFL                AS CODIGO_FL,
      D.CODCLI                  AS COD_CLI,
      D.NRODOCTOCRC             AS NUMERO_DOCUMENTO,
      D.SERIEDOCTOCRC           AS SERIE_DOCUMENTO,
      D.NROPARCELACRC           AS NUMERO_PARCELA,
      D.CODTPDOC                AS TIPO_DOCUMENTO,
      D.EMISSAOCRC              AS DATA_EMISSAO,
      D.SAIDACRC                AS DATA_SAIDA,
      D.VENCIMENTOCRC           AS DATA_VENCIMENTO,
      D.VENCIMENTOORIGINALCRC   AS DATA_VENCIMENTO_ORIGINAL,
      D.RECEBIMENTOCRC          AS DATA_RECEBIMENTO,
      D.DESCONTOCRC             AS DESCONTO,
      D.ACRESCIMOCRC            AS ACRESCIMO,
      D.STATUSDOCTOCRC          AS STATUS_DOCTO,
      D.QUITADODOCTOCRC         AS QUITADO,
      D.RENEGOCIADO             AS RENEGOCIADO,
      D.PROTESTADO              AS PROTESTADO,
      D.DATAPROTESTO            AS DATA_PROTESTO,
      D.VLRINSSCRC              AS VLR_INSS,
      D.VLRIRRFCRC              AS VLR_IRRF,
      D.VLRPISCRC               AS VLR_PIS,
      D.VLRCOFINSCRC            AS VLR_COFINS,
      D.VLRCSLCRC               AS VLR_CSLL,
      D.VLRISSCRC               AS VLR_ISS,
      D.CODBANCO                AS BANCO_COBRANCA,
      D.CODAGENCIA              AS AGENCIA_COBRANCA,
      D.CODCONTABCO             AS CONTA_COBRANCA,
      D.COBELETNOSSONUMERO      AS NOSSO_NUMERO,
      D.COBELETSTATUS           AS COBELETRONICA_STATUS,
      D.COBELETMSGBOLETO        AS MSG_BOLETO,
      D.FATURA_IMPRESSA         AS FATURA_IMPRESSA,
      D.CARTAO_CODAUTORIZ       AS CARTAO_AUTORIZACAO,
      D.CARTAO_TID              AS CARTAO_TID,
      D.NROTOTALPARCELAS_CARTAO AS CARTAO_PARCELAS,
      D.OBSDOCTOCRC             AS OBSERVACAO,
      D.USUARIO_INCLUSAO        AS USUARIO_INCLUSAO,
      D.SISTEMA                 AS SISTEMA_ORIGEM,
      (SELECT SUM(I.VALORITEMDOC) FROM CRCITDOC I WHERE I.CODDOCTOCRC = D.CODDOCTOCRC) AS VLR_TOTAL_ITENS
    FROM CRCDOCTO D
    WHERE D.CODIGOEMPRESA   = :empresa
      AND D.VENCIMENTOCRC  >= :dt_ini
      AND D.VENCIMENTOCRC  <  :dt_fim_excl
    ORDER BY D.VENCIMENTOCRC DESC, D.CODDOCTOCRC
  `,

  /**
   * Itens de CRCITDOC para um conjunto de COD_DOCTO_CRC.
   * Chama 1x após contasReceber, passando IN (...) construído em runtime.
   *
   * Binds: dinâmico (cod_docto_1, cod_docto_2, …)
   */
  contasReceberItensTemplate: `
    SELECT /*+ NO_PARALLEL */
      I.CODDOCTOCRC           AS COD_DOCTO_CRC,
      I.CODITEMDOCCRC         AS COD_ITEM_DOC,
      I.VALORITEMDOC          AS VALOR_ITEM,
      I.CODTPRECEITA          AS COD_TP_RECEITA,
      I.CODCONTACTB           AS CONTA_CONTABIL,
      I.CODCUSTO              AS CENTRO_CUSTO,
      I.CODCUSTOFIN           AS CENTRO_CUSTO_FIN,
      I.OBSITEMDOCTOCRC       AS OBSERVACAO,
      I.ITEMRATEADO           AS ITEM_RATEADO
    FROM CRCITDOC I
    WHERE I.CODDOCTOCRC IN (__IN_PLACEHOLDER__)
    ORDER BY I.CODDOCTOCRC, I.CODITEMDOCCRC
  `,

  // ========================================================================
//   * Extrato bancario do Globus (BCOMOVTO) — mes corrente Pioneira.
//   * Traz TODOS os movimentos relevantes (sem filtrar por CODHISTOBCO) — a
//   * classificacao "repasse BRB" e feita no ETL pela heuristica.
//   *
//   * Binds: :empresa, :dt_ini, :dt_fim_excl
//   * Filiais via placeholder __FILIAIS__.
//   *
//   * Filtro de STATUS: ignora cancelados (`C`). Mantém ativos e baixados.
//   *
//   * LEFT JOIN com BCOHISTO traz a descricao do historico, util pra
//   * categorizacao manual.
  // ========================================================================
  bcoMovtoMes: `
    SELECT /*+ NO_PARALLEL */
      M.CODMOVTOBCO        AS COD_MOVTO_BCO,
      M.CODIGOEMPRESA      AS CODIGO_EMPRESA,
      M.CODIGOFL           AS CODIGO_FL,
      M.CODBANCO           AS COD_BANCO,
      M.CODAGENCIA         AS COD_AGENCIA,
      M.CODCONTABCO        AS COD_CONTA_BCO,
      M.DTMOVTOBCO         AS DATA_MOVTO,
      M.DTEFETIVAMOVTOBCO  AS DATA_EFETIVA,
      M.DATA_CREDITO       AS DATA_CREDITO,
      M.VLMOVTOBCO         AS VALOR,
      M.CODHISTOBCO        AS COD_HISTO_BCO,
      H.DESCHISTOBCO       AS DESC_HISTO_BCO,
      SUBSTR(M.HISTMOVTOBCO, 1, 500) AS HIST_MOVTO_BCO,
      M.DOCMOVTOBCO        AS DOC_MOVTO_BCO,
      M.CONFIRMADOMOVTOBCO AS CONFIRMADO,
      M.CONCILIADOMOVTOBCO AS CONCILIADO,
      M.STATUSMOVTOBCO     AS STATUS_MOVTO,
      M.CODTPDESPESA       AS COD_TP_DESPESA,
      M.CODTPRECEITA       AS COD_TP_RECEITA,
      M.CODCUSTO           AS COD_CUSTO
    FROM   BCOMOVTO M
    LEFT JOIN BCOHISTO H ON H.CODHISTOBCO    = M.CODHISTOBCO
                         AND H.CODIGOEMPRESA = M.CODIGOEMPRESA
                         AND H.CODIGOFL      = M.CODIGOFL
    WHERE  M.CODIGOEMPRESA = :empresa
      AND  M.CODIGOFL      IN (__FILIAIS__)
      AND  M.DTMOVTOBCO   >= :dt_ini
      AND  M.DTMOVTOBCO   <  :dt_fim_excl
      AND  M.STATUSMOVTOBCO <> 'C'
    ORDER BY M.DTMOVTOBCO DESC, M.CODMOVTOBCO
  `,

  // ========================================================================
  // * Cadastro de contas bancarias (BCOCONTA) — usado pelo modulo Fluxo de Caixa.
  // *
  // * Filtros pra trazer apenas contas REAIS da Pioneira (descarta contas
  // * contabeis disfarcadas como "GLOSA DE PLE", "CAIXA UNIAO" etc.):
  // *   - CODIGOEMPRESA = 4
  // *   - CODIGOFL IN (__FILIAIS__)
  // *   - COMPOEPOSICAOFINANCEIRA = 'S' (so contas que entram na posicao financeira)
  // *   - NVL(INATIVA, 'N') = 'N' (so ativas)
  // *   - DTLIMITEMOVTO > DATE '1950-01-01' (descarta sentinela 30/12/1899)
  // *
  // * Campos retornados incluem a ANCORA DE SALDO (SALDO_ACM_ATE_DATA + DATA_SALDO_ACM)
  // * usada pra calcular saldo dia-a-dia: saldo(X) = ancora + soma(BCOMOVTO entre ancora+1 e X).
  // *
  // * Binds: :empresa
  // * Filiais via placeholder __FILIAIS__.
  //
  // * IMPORTANTE: BCOSALDO do Globus esta abandonada (5 linhas, 2006-2007).
  // * Saldo dia-a-dia e calculado por NOS via BCOMOVTO. Ver Leia/recebiveis-gdf.md
  // * e memory/globus-saldo-bancario.md.
  // ========================================================================
  bcoContaCadastro: `
    SELECT /*+ NO_PARALLEL */
      C.CODBANCO                  AS COD_BANCO,
      C.CODAGENCIA                AS COD_AGENCIA,
      C.CODCONTABCO               AS COD_CONTA_BCO,
      C.DIGITO                    AS DIGITO,
      C.NOMECONTABCO              AS NOME_CONTA_BCO,
      C.CODIGOEMPRESA             AS CODIGO_EMPRESA,
      C.CODIGOFL                  AS CODIGO_FL,
      C.SALDOINICIALCONTABCO      AS SALDO_INICIAL,
      C.SALDO_ACM_ATE_DATA        AS SALDO_ACM_ATE_DATA,
      C.DATA_SALDO_ACM            AS DATA_SALDO_ACM,
      C.LIMITECREDITO             AS LIMITE_CREDITO,
      C.DTLIMITEMOVTO             AS DT_LIMITE_MOVTO,
      C.CONTACAIXA                AS CONTA_CAIXA,
      C.COMPOEPOSICAOFINANCEIRA   AS COMPOE_POSICAO_FINANCEIRA,
      C.CONTA_ATIVA               AS CONTA_ATIVA,
      C.INATIVA                   AS INATIVA,
      C.CODCONTACTB               AS COD_CONTA_CTB,
      C.CODCUSTO                  AS COD_CUSTO,
      C.CHAVE_PIX                 AS CHAVE_PIX,
      C.TIPO_CHAVE_PIX            AS TIPO_CHAVE_PIX
    FROM   BCOCONTA C
    WHERE  C.CODIGOEMPRESA = :empresa
      AND  C.CODIGOFL IN (__FILIAIS__)
      AND  C.COMPOEPOSICAOFINANCEIRA = 'S'
      AND  NVL(C.INATIVA, 'N') = 'N'
      AND  C.DTLIMITEMOVTO > DATE '1950-01-01'
    ORDER BY C.CODBANCO, C.CODAGENCIA, C.CODCONTABCO
  `,

  comprasPagamentosMensal: `
    WITH PARAMS AS (
      SELECT :empresa     AS EMPRESA,
             :dt_ini      AS DT_INI,
             :dt_fim_excl AS DT_FIM_EXCL
      FROM   DUAL
    )
    SELECT /*+ NO_PARALLEL */
        UPPER(TO_CHAR(P.DT_INI, 'MON',
              'NLS_DATE_LANGUAGE=PORTUGUESE'))               AS MES,
        P.EMPRESA                                            AS CODEMP,
        (SELECT NOMEFANTASIAEMPRESA
           FROM VW_EMPRESA
          WHERE CODIGOEMPRESA = P.EMPRESA)                   AS NOME_EMPRESA,
        NVL(C.VLR_COMPRAS, 0)                                AS VLR_COMPRAS,
        NVL(PG.VLR_PAG, 0)                                   AS VLR_PAG,
        NVL(F.VLR_VENCFIN, 0)                                AS VLR_VENCFIN,
        ROUND( NVL(PG.VLR_PAG, 0)
               / NULLIF(F.VLR_VENCFIN, 0) * 100, 2)          AS PERC,
        CASE WHEN NVL(F.VLR_VENCFIN,0) - NVL(PG.VLR_PAG,0) < 0
             THEN 0
             ELSE NVL(F.VLR_VENCFIN,0) - NVL(PG.VLR_PAG,0)
        END                                                  AS ENTRADADEFIN
    FROM PARAMS P,
    -- (1) PAGAMENTO: parcelas de NF da empresa vencendo no mes
    ( SELECT ROUND(SUM(H.VALORTOTALITENSNF / H.PARCELAS), 2) AS VLR_PAG
      FROM ( SELECT DISTINCT
                    R.CODIGOEMPRESA,
                    G.CODIGOGRC,
                    V.DATAVENCTONF,
                    R.NUMERONF,
                    M.CODIGOINTERNOMATERIAL,
                    I.VALORTOTALITENSNF,
                    R.VALORTOTALNF / V.VALORVENCTONF AS PARCELAS
             FROM   BGM_NOTAFISCAL   R,
                    EST_ITENSNF      I,
                    EST_CADMATERIAL  M,
                    EST_GRUPOCOMPRAS G,
                    PARAMS           P2
             WHERE  I.CODINTNF        = R.CODINTNF
               AND  M.CODIGOMATINT    = I.CODIGOMATINT
               AND  G.CODIGOGRC       = M.CODIGOGRC
               AND  I.CODIGOMATINT   <> 95079
               AND  R.CODTPDOC        = 'NF'
               AND  R.STATUSNF        = 'F'
               AND  I.STATUSITENSNF  <> 'C'
               AND  R.CODIGOEMPRESA   = P2.EMPRESA
               AND  EXISTS (
                     SELECT 1 FROM EST_VENCTONF V2
                      WHERE V2.CODINTNF = R.CODINTNF
                        AND V2.DATAVENCTONF >= P2.DT_INI
                        AND V2.DATAVENCTONF <  P2.DT_FIM_EXCL )
               AND  V.CODINTNF        = R.CODINTNF
               AND  V.DATAVENCTONF   >= P2.DT_INI
               AND  V.DATAVENCTONF   <  P2.DT_FIM_EXCL
           ) H
    ) PG,
    -- (2) COMPRAS: NF da empresa emitidas no mes
    ( SELECT ROUND(SUM(I.VALORTOTALITENSNF), 2) AS VLR_COMPRAS
      FROM   BGM_NOTAFISCAL   R,
             EST_ITENSNF      I,
             EST_CADMATERIAL  M,
             EST_GRUPOCOMPRAS G,
             PARAMS           P3
      WHERE  I.CODINTNF        = R.CODINTNF
        AND  M.CODIGOMATINT(+) = I.CODIGOMATINT
        AND  M.CODIGOGRC       = G.CODIGOGRC (+)
        AND  I.CODIGOMATINT   <> 95079
        AND  R.CODTPDOC        = 'NF'
        AND  R.STATUSNF        = 'F'
        AND  I.STATUSITENSNF  <> 'C'
        AND  R.DATAEMISSAONF  >= P3.DT_INI
        AND  R.DATAEMISSAONF  <  P3.DT_FIM_EXCL
        AND  R.CODIGOEMPRESA   = P3.EMPRESA
    ) C,
    -- (3) VENCIMENTO CPG: contas a pagar da empresa vencendo no mes
    ( SELECT SUM(I.VALORITEMDOC) AS VLR_VENCFIN
      FROM   CPGDOCTO  D,
             CPGITDOC  I,
             PARAMS    P4
      WHERE  I.CODDOCTOCPG     = D.CODDOCTOCPG
        AND  D.STATUSDOCTOCPG <> 'C'
        AND  D.VENCIMENTOCPG  >= P4.DT_INI
        AND  D.VENCIMENTOCPG  <  P4.DT_FIM_EXCL
        AND  D.CODIGOEMPRESA   = P4.EMPRESA
    ) F
  `,
} as const;
