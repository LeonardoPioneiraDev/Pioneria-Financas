import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 3 — Observabilidade da integracao Globus.
 *
 * (1) `integration.sync_errors` — Dead Letter Queue.
 *     Substitui o contador efemero `registros_com_erro` no sync_jobs por
 *     registros persistentes, navegaveis na UI admin e reprocessaveis.
 *
 *     Cada falha de adapter/ETL gera 1 linha aqui com:
 *       - sistema/recurso/fase: onde aconteceu
 *       - chave_natural: identifica o registro problematico
 *       - raw_payload: o conteudo que causou o erro (se disponivel)
 *       - erro_mensagem + erro_stack: detalhes
 *       - tentativas: contador de retries
 *       - resolvido_em / resolvido_por: marca quando foi resolvido (automatico
 *         na proxima execucao bem-sucedida, ou manual via endpoint admin)
 *
 * (2) `integration.oracle_query_logs` — Telemetria.
 *     Toda query no plugin Oracle persiste: nome, hash do SQL, duracao_ms,
 *     linhas, erro. Permite responder "qual query do mes passado demorou mais
 *     que 30s?" sem catar log.
 *
 *     Retencao: 30 dias (cron de limpeza fora do escopo dessa migration).
 */
export class ObservabilidadeSync1700000013000 implements MigrationInterface {
  name = 'ObservabilidadeSync1700000013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- integration.sync_errors ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.sync_errors (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sync_job_id UUID REFERENCES integration.sync_jobs(id) ON DELETE SET NULL,
        sistema VARCHAR(40) NOT NULL,
        recurso VARCHAR(60) NOT NULL,
        fase VARCHAR(20) NOT NULL,
        chave_natural JSONB,
        raw_payload JSONB,
        erro_mensagem TEXT NOT NULL,
        erro_codigo VARCHAR(40),
        erro_stack TEXT,
        tentativas INT NOT NULL DEFAULT 1,
        reprocessar_em TIMESTAMPTZ,
        resolvido_em TIMESTAMPTZ,
        resolvido_por VARCHAR(60),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Lista DLQ ativa: queries mais comuns filtram por (sistema, recurso) e
    // resolvido_em IS NULL.
    await queryRunner.query(`
      CREATE INDEX sync_errors_pendentes_idx
      ON integration.sync_errors (sistema, recurso, criado_em DESC)
      WHERE resolvido_em IS NULL
    `);

    // Fila de retry agendado.
    await queryRunner.query(`
      CREATE INDEX sync_errors_retry_idx
      ON integration.sync_errors (reprocessar_em)
      WHERE resolvido_em IS NULL AND reprocessar_em IS NOT NULL
    `);

    // Indice util pra busca por chave (cada registro problematico).
    await queryRunner.query(`
      CREATE INDEX sync_errors_chave_gin_idx
      ON integration.sync_errors USING GIN (chave_natural)
    `);

    // ---- integration.oracle_query_logs ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.oracle_query_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sync_job_id UUID REFERENCES integration.sync_jobs(id) ON DELETE SET NULL,
        query_name VARCHAR(60) NOT NULL,
        sql_hash CHAR(64) NOT NULL,
        duracao_ms INT NOT NULL,
        linhas INT,
        erro_mensagem TEXT,
        binds_count INT NOT NULL DEFAULT 0,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Metricas por query (top N mais lentas, P95, etc.)
    await queryRunner.query(`
      CREATE INDEX oracle_query_logs_query_data_idx
      ON integration.oracle_query_logs (query_name, criado_em DESC)
    `);

    // Sumarizar por sync_job
    await queryRunner.query(`
      CREATE INDEX oracle_query_logs_job_idx
      ON integration.oracle_query_logs (sync_job_id, criado_em DESC)
      WHERE sync_job_id IS NOT NULL
    `);

    // Filtra erros (UI admin "queries com erro")
    await queryRunner.query(`
      CREATE INDEX oracle_query_logs_erro_idx
      ON integration.oracle_query_logs (criado_em DESC)
      WHERE erro_mensagem IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS integration.oracle_query_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration.sync_errors`);
  }
}
