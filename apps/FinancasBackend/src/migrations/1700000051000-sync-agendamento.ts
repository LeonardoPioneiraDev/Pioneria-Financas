import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * integration.sync_agendamento — configuracao do sincronismo automatico por
 * recurso. Lida pelo plugin sync-scheduler (tick in-process).
 */
export class SyncAgendamento1700000051000 implements MigrationInterface {
  name = 'SyncAgendamento1700000051000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.sync_agendamento (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        recurso VARCHAR(60) NOT NULL,
        habilitado BOOLEAN NOT NULL DEFAULT FALSE,
        frequencia VARCHAR(20) NOT NULL DEFAULT 'diario',
        intervalo_min INT,
        hora_dia INT,
        minuto_dia INT NOT NULL DEFAULT 0,
        ultimo_run_em TIMESTAMPTZ,
        ultimo_status VARCHAR(20),
        ultima_mensagem VARCHAR(300),
        proximo_run_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT sync_agendamento_recurso_uq UNIQUE (recurso)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX sync_agendamento_prox_idx
      ON integration.sync_agendamento (proximo_run_em)
      WHERE habilitado = TRUE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS integration.sync_agendamento`);
  }
}
