import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * GPS/INSS da folha (INSS patronal real, com/sem desoneracao).
 *
 *  - `integration.globus_flp_gps_stage` — snapshot raw do FLP_GPS_INTEGRACPG.
 *  - `finance.folha_gps` — canonico: 1 linha por (empresa, competencia, tipo de
 *     folha, filial, identificador), somado por competencia no painel Tributos.
 *
 * Troca a ESTIMATIVA de 28,8% do INSS patronal pelo valor REAL calculado pelo
 * Globus — a Pioneira esta em desoneracao (CPRB). Ver Leia/folha-guias-gps.
 */
export class FolhaGps1700000041000 implements MigrationInterface {
  name = 'FolhaGps1700000041000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- integration.globus_flp_gps_stage ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.globus_flp_gps_stage (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        codigo_empresa INT NOT NULL,
        codigo_fl INT NOT NULL,
        periodo CHAR(6) NOT NULL,
        tipo_folha INT NOT NULL,
        cod_ident INT NOT NULL DEFAULT 0,
        tipo_ident VARCHAR(4) NOT NULL DEFAULT '',
        sync_job_id UUID REFERENCES integration.sync_jobs(id) ON DELETE SET NULL,
        raw_payload JSONB NOT NULL,
        hash_payload CHAR(64),
        recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processado_em TIMESTAMPTZ,
        excluido_em TIMESTAMPTZ,
        excluido_motivo VARCHAR(60),
        CONSTRAINT globus_flp_gps_stage_uq UNIQUE (codigo_empresa, codigo_fl, periodo, tipo_folha, cod_ident, tipo_ident)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX globus_flp_gps_stage_proc_idx
      ON integration.globus_flp_gps_stage (processado_em)
      WHERE excluido_em IS NULL
    `);

    // ---- finance.folha_gps ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.folha_gps (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        empresa_id INT NOT NULL DEFAULT 4,

        competencia DATE NOT NULL,
        periodo CHAR(6) NOT NULL,
        tipo_folha INT NOT NULL,
        filial INT NOT NULL,
        cod_ident INT NOT NULL DEFAULT 0,
        tipo_ident VARCHAR(4),

        retido_cents BIGINT NOT NULL DEFAULT 0,
        base_contrib_cents BIGINT NOT NULL DEFAULT 0,
        patronal_com_deson_cents BIGINT NOT NULL DEFAULT 0,
        patronal_sem_deson_cents BIGINT NOT NULL DEFAULT 0,
        valor_cents BIGINT NOT NULL DEFAULT 0,
        cod_docto_cpg BIGINT,

        origem_sistema VARCHAR(40) NOT NULL DEFAULT 'globus',
        origem_id_externo VARCHAR(80) NOT NULL,
        ultimo_sync_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        excluido_em TIMESTAMPTZ,
        excluido_motivo VARCHAR(60),

        CONSTRAINT folha_gps_origem_uq UNIQUE (origem_sistema, origem_id_externo)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX folha_gps_comp_idx
      ON finance.folha_gps (empresa_id, competencia, tipo_folha)
      WHERE excluido_em IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.folha_gps`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration.globus_flp_gps_stage`);
  }
}
