import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 4 — Encerramento da folha (FLP_ENCERRAMENTOFICHAFIN).
 *
 * O Globus marca uma competencia+tipo_folha como "encerrada" gravando
 * registros em FLP_ENCERRAMENTOFICHAFIN. Apos o encerramento, os valores
 * da folha estao congelados naquele mes — nao adianta reprocessar nem o
 * Praxio aceita edicoes.
 *
 * Esta stage replica a tabela de encerramentos para evitar consultar o
 * Globus toda vez que precisamos saber "esse mes ja fechou?". Usada pelo
 * adapter FLP pra pular o re-sync de fichas quando a competencia ja fechou
 * e o stage local ja tem dados (idempotencia natural).
 *
 * PK natural: (codigo_empresa, codigo_fl, tipo_folha, competencia).
 */
export class FlpEncerramentoStage1700000014000 implements MigrationInterface {
  name = 'FlpEncerramentoStage1700000014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.globus_flp_encerramento_stage (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        codigo_empresa INT NOT NULL,
        codigo_fl INT NOT NULL,
        tipo_folha INT NOT NULL,
        competencia DATE NOT NULL,
        sync_job_id UUID REFERENCES integration.sync_jobs(id) ON DELETE SET NULL,
        raw_payload JSONB NOT NULL,
        hash_payload CHAR(64),
        recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processado_em TIMESTAMPTZ,
        excluido_em TIMESTAMPTZ,
        excluido_motivo VARCHAR(60),
        CONSTRAINT globus_flp_encerramento_stage_uq
          UNIQUE (codigo_empresa, codigo_fl, tipo_folha, competencia)
      )
    `);

    // Lookup tipico: "esta competencia/tipo_folha ja foi encerrada?"
    await queryRunner.query(`
      CREATE INDEX globus_flp_encerramento_stage_competencia_idx
      ON integration.globus_flp_encerramento_stage (competencia, tipo_folha)
      WHERE excluido_em IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS integration.globus_flp_encerramento_stage`);
  }
}
