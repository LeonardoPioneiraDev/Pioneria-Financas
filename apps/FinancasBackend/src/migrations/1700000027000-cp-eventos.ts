import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trilha de eventos do CP vinda de GLOBUS.CPGDOCTO_HISTORICO_NEGOCIACOES.
 *
 * Essa tabela do Globus (nome enganoso) e o LOG DE EVENTOS por documento:
 * 1 linha por ato, com USUARIO + DATA_EVENTO (hora real) + COD_TP_EVENTO
 * (dicionario CPGDOCTO_TIPO_EVENTOS) + STATUSDOCTOCPG resultante.
 *
 * E a unica fonte de "quem efetivou a baixa": o evento de pagamento e aquele
 * cujo STATUSDOCTOCPG vira 'B' (baixado). Mapeamento de etapas:
 *   - inclusao : COD_TP_EVENTO = 1 (Origem)
 *   - liberacao: COD_TP_EVENTO = 9 (liberacao de pagamento)
 *   - pagamento: STATUSDOCTOCPG = 'B' (baixado) -> USUARIO = quem pagou
 *
 * Pipeline: integration.globus_cp_eventos_stage (snapshot cru) -> ETL ->
 * finance.cp_eventos (materializado, ligado a finance.contas_pagar).
 */
export class CpEventos1700000027000 implements MigrationInterface {
  name = 'CpEventos1700000027000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // -------- stage cru (snapshot do Globus) --------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.globus_cp_eventos_stage (
        id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        cod_docto_cpg    BIGINT      NOT NULL,
        codigo_empresa   INT         NOT NULL,
        sequencia_evento INT         NOT NULL,
        sync_job_id      UUID,
        raw_payload      JSONB       NOT NULL,
        hash_payload     CHAR(64),
        recebido_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processado_em    TIMESTAMPTZ,
        CONSTRAINT globus_cp_eventos_stage_uq UNIQUE (codigo_empresa, cod_docto_cpg, sequencia_evento)
      )
    `);

    // -------- materializado (consumido pelo workflow) --------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.cp_eventos (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conta_pagar_id    UUID REFERENCES finance.contas_pagar(id),
        empresa_id        INT          NOT NULL DEFAULT 4,
        cod_docto_cpg     BIGINT       NOT NULL,
        sequencia_evento  INT          NOT NULL,
        cod_tp_evento     INT,
        tipo_evento_desc  VARCHAR(80),
        mais_informacoes  VARCHAR(500),
        status_docto      CHAR(1),
        usuario           VARCHAR(40),
        ocorrido_em       TIMESTAMPTZ,
        origem_sistema    VARCHAR(40)  NOT NULL DEFAULT 'globus',
        origem_id_externo VARCHAR(60)  NOT NULL,
        criado_em         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        atualizado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CONSTRAINT cp_eventos_origem_uq UNIQUE (origem_sistema, origem_id_externo)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS cp_eventos_doc_idx ON finance.cp_eventos (cod_docto_cpg, sequencia_evento)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS cp_eventos_cp_idx ON finance.cp_eventos (conta_pagar_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.cp_eventos`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration.globus_cp_eventos_stage`);
  }
}
