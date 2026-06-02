import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialIdentityAndAudit1700000001000 implements MigrationInterface {
  name = 'InitialIdentityAndAudit1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS identity`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS audit`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "citext"`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity.usuarios (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email CITEXT NOT NULL,
        senha_hash VARCHAR(200),
        nome_completo VARCHAR(200) NOT NULL,
        role VARCHAR(40) NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
        ultimo_login_em TIMESTAMPTZ,
        preferencias_ui JSONB NOT NULL DEFAULT '{}'::jsonb,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX usuarios_email_uq ON identity.usuarios (email)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity.refresh_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        usuario_id UUID NOT NULL REFERENCES identity.usuarios(id) ON DELETE CASCADE,
        token_hash VARCHAR(128) NOT NULL,
        expira_em TIMESTAMPTZ NOT NULL,
        revogado_em TIMESTAMPTZ,
        ip_origem INET,
        user_agent VARCHAR(500),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX refresh_tokens_hash_uq ON identity.refresh_tokens (token_hash)`);
    await queryRunner.query(`CREATE INDEX refresh_tokens_user_idx ON identity.refresh_tokens (usuario_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity.password_reset_tokens (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        usuario_id UUID NOT NULL REFERENCES identity.usuarios(id) ON DELETE CASCADE,
        token_hash VARCHAR(128) NOT NULL,
        tipo VARCHAR(20) NOT NULL,
        expira_em TIMESTAMPTZ NOT NULL,
        usado_em TIMESTAMPTZ,
        ip_origem INET,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX password_reset_tokens_hash_uq ON identity.password_reset_tokens (token_hash)`);
    await queryRunner.query(`CREATE INDEX password_reset_tokens_user_idx ON identity.password_reset_tokens (usuario_id)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit.request_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        request_id UUID NOT NULL,
        method VARCHAR(10) NOT NULL,
        path VARCHAR(500) NOT NULL,
        status_code INT NOT NULL,
        latency_ms INT NOT NULL,
        usuario_id UUID,
        ip_address INET,
        user_agent VARCHAR(500),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX request_logs_criado_idx ON audit.request_logs (criado_em DESC)`);
    await queryRunner.query(`CREATE INDEX request_logs_user_idx ON audit.request_logs (usuario_id, criado_em DESC)`);
    await queryRunner.query(`CREATE INDEX request_logs_path_idx ON audit.request_logs (method, path)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit.user_activity_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        usuario_id UUID,
        activity_type VARCHAR(40) NOT NULL,
        ip_address INET,
        user_agent VARCHAR(500),
        metadata JSONB,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX user_activity_logs_user_idx ON audit.user_activity_logs (usuario_id, criado_em DESC)`);
    await queryRunner.query(`CREATE INDEX user_activity_logs_tipo_idx ON audit.user_activity_logs (activity_type, criado_em DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit.user_activity_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit.request_logs`);
    await queryRunner.query(`DROP TABLE IF EXISTS identity.password_reset_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS identity.refresh_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS identity.usuarios`);
  }
}
