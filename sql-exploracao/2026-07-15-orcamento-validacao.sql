-- =============================================================================
-- VALIDACAO ORCAMENTO - 2026-07-15
-- Empresa: 4 (Viacao Pioneira)
--
-- OBJETIVO: de-riscar o modulo Orcamento que foi construido a partir da
-- exploracao (rodadas 1/2 de 03/07) ANTES de rodar o sync do baseline.
--   Q1 -> a chave natural do meu stage (CODINTORC) e realmente unica? Se nao,
--         o sync perde linhas silenciosamente (ON CONFLICT sobrescreve).
--   Q2 -> os centros de custo (CODCUSTOFIN) batem com o mapa de classificacao
--         receita/apoio/central usado no "orcado sugerido"?
--
-- SEGURANCA: read-only, agregados leves, NO_PARALLEL. Nada de DML.
-- COMO ENVIAR: rode cada bloco e cole o resultado (pode ser em texto mesmo).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Q1 - Integridade do CPGORCPREVISOES (empresa 4)
-- -----------------------------------------------------------------------------
-- DECIDE:
--   * total_linhas = distinct_codintorc  -> chave (empresa, CODINTORC) SEGURA,
--     pode sincronizar. Se forem DIFERENTES, eu amplio a chave antes do sync.
--   * linhas_com_valorprevisao ~ 0        -> confirma que o valor mora em VALOR
--     (e nao em VALORPREVISAO), como o ETL assume.
-- -----------------------------------------------------------------------------
SELECT /*+ NO_PARALLEL */
       COUNT(*)                                            AS total_linhas,
       COUNT(DISTINCT CODINTORC)                           AS distinct_codintorc,
       COUNT(DISTINCT EXTRACT(YEAR FROM DATAPREVISAO))     AS qtd_anos,
       MIN(DATAPREVISAO)                                   AS data_min,
       MAX(DATAPREVISAO)                                   AS data_max,
       SUM(CASE WHEN VALORPREVISAO <> 0 THEN 1 ELSE 0 END) AS linhas_com_valorprevisao,
       SUM(CASE WHEN VALOR IS NULL THEN 1 ELSE 0 END)      AS linhas_valor_nulo
FROM   CPGORCPREVISOES
WHERE  CODIGOEMPRESA = 4;


-- -----------------------------------------------------------------------------
-- Q2 - Centros de custo (CPGCUSTOS): codigo x nome
-- -----------------------------------------------------------------------------
-- DECIDE: confirma o mapa classificarSetor (10003 Santa Maria ... 80003
-- Administracao). Se aparecer um centro OPERACIONAL fora dos 8 que eu conheco,
-- ele hoje cairia como "nao classificado" -> eu incluo.
-- (Se a lista vier muito grande, me avisa que eu filtro so pelos usados no CP.)
-- -----------------------------------------------------------------------------
SELECT /*+ NO_PARALLEL */ CODIGO, DESCRICAO
FROM   CPGCUSTOS
ORDER BY CODIGO;


-- =============================================================================
-- FIM. Q1 libera/ajusta o sync do baseline; Q2 fecha a classificacao dos setores.
-- Proximo passo (opcional, mais pesado): reconciliacao custo por centro no Globus
-- x o que o "orcado derivado" calculou do nosso banco, pra provar que os numeros
-- batem.
-- =============================================================================
