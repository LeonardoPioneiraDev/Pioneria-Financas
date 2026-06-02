import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FolhaFlp1700000008000 implements MigrationInterface {
  name = 'FolhaFlp1700000008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ====================== STAGE (raw do Oracle) ======================

    // Funcionários: 1 linha por funcionário, chave = (codigo_empresa, cod_int_func).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.globus_flp_func_stage (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        codigo_empresa  INT NOT NULL,
        cod_int_func    VARCHAR(40) NOT NULL,
        sync_job_id     UUID,
        raw_payload     JSONB NOT NULL,
        recebido_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processado_em   TIMESTAMPTZ,
        UNIQUE (codigo_empresa, cod_int_func)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS globus_flp_func_stage_proc_idx
      ON integration.globus_flp_func_stage (processado_em)
      WHERE processado_em IS NULL
    `);

    // Eventos: 1 linha por evento (catálogo global do Globus).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.globus_flp_evento_stage (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cod_evento      INT NOT NULL UNIQUE,
        sync_job_id     UUID,
        raw_payload     JSONB NOT NULL,
        recebido_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processado_em   TIMESTAMPTZ
      )
    `);

    // Ficha de eventos: 1 linha por (funcionário × competência × evento × tipo_folha).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.globus_flp_ficha_stage (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cod_int_func    VARCHAR(40) NOT NULL,
        competencia     DATE NOT NULL,
        cod_evento      INT NOT NULL,
        tipo_folha      INT NOT NULL,
        sync_job_id     UUID,
        raw_payload     JSONB NOT NULL,
        recebido_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processado_em   TIMESTAMPTZ,
        UNIQUE (cod_int_func, competencia, cod_evento, tipo_folha)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS globus_flp_ficha_stage_comp_idx
      ON integration.globus_flp_ficha_stage (competencia, tipo_folha)
    `);

    // ====================== CANONICAL (finance) ======================

    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.funcionarios (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id          INT NOT NULL DEFAULT 1,
        origem_sistema      VARCHAR(40) NOT NULL DEFAULT 'globus',
        cod_int_func        VARCHAR(40) NOT NULL,
        cod_func            VARCHAR(40) NOT NULL,
        nome                VARCHAR(200) NOT NULL,
        cod_area            VARCHAR(20),
        desc_area           VARCHAR(200),
        cod_depto           VARCHAR(20),
        desc_funcao         VARCHAR(200),
        agencia             VARCHAR(20),
        conta_corrente      VARCHAR(30),
        ativo               BOOLEAN NOT NULL DEFAULT true,
        ultimo_sync_em      TIMESTAMPTZ,
        criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (origem_sistema, cod_int_func)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS funcionarios_area_idx ON finance.funcionarios (cod_area)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS funcionarios_cod_func_idx ON finance.funcionarios (cod_func)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS funcionarios_nome_trgm_idx ON finance.funcionarios USING gin (nome gin_trgm_ops)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.eventos_folha (
        cod_evento          INT PRIMARY KEY,
        descricao           VARCHAR(200) NOT NULL,
        tipo                CHAR(1) NOT NULL CHECK (tipo IN ('P','D','B')),
        grupo               VARCHAR(30),
        criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS eventos_folha_grupo_idx ON finance.eventos_folha (grupo)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.ficha_evento (
        id                  BIGSERIAL PRIMARY KEY,
        empresa_id          INT NOT NULL DEFAULT 1,
        funcionario_id      UUID NOT NULL REFERENCES finance.funcionarios(id) ON DELETE CASCADE,
        cod_evento          INT NOT NULL REFERENCES finance.eventos_folha(cod_evento),
        competencia         DATE NOT NULL,
        tipo_folha          INT NOT NULL,
        referencia          NUMERIC(12,4),
        valor_cents         BIGINT NOT NULL,
        origem_sistema      VARCHAR(40) NOT NULL DEFAULT 'globus',
        origem_id_externo   VARCHAR(120) NOT NULL,
        ultimo_sync_em      TIMESTAMPTZ,
        criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (origem_sistema, origem_id_externo)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ficha_evento_comp_idx ON finance.ficha_evento (competencia, tipo_folha)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ficha_evento_func_idx ON finance.ficha_evento (funcionario_id, competencia)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS ficha_evento_evento_idx ON finance.ficha_evento (cod_evento)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.ficha_evento`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.eventos_folha`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.funcionarios`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration.globus_flp_ficha_stage`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration.globus_flp_evento_stage`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration.globus_flp_func_stage`);
  }
}
