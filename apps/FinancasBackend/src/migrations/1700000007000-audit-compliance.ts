import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditCompliance1700000007000 implements MigrationInterface {
  name = 'AuditCompliance1700000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Termo de comprometimento aceito por usuario (1 registro por versao por usuario).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit.termo_aceite (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id      UUID NOT NULL REFERENCES identity.usuarios(id) ON DELETE CASCADE,
        versao_termo    VARCHAR(20) NOT NULL,
        nome_digitado   VARCHAR(200) NOT NULL,
        ip_address      INET,
        user_agent      VARCHAR(500),
        aceito_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (usuario_id, versao_termo)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS termo_aceite_usuario_idx
      ON audit.termo_aceite (usuario_id, aceito_em DESC)
    `);

    // Trilha detalhada de acessos a dados sensiveis (visualizou, imprimiu, exportou, filtrou).
    // Complementa user_activity_logs que e mais voltado a auth.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit.acesso_dados (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id      UUID NOT NULL REFERENCES identity.usuarios(id) ON DELETE CASCADE,
        acao            VARCHAR(40) NOT NULL,
        recurso         VARCHAR(80) NOT NULL,
        recurso_id      VARCHAR(100),
        descricao       VARCHAR(500),
        filtros         JSONB,
        ip_address      INET,
        user_agent      VARCHAR(500),
        criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS acesso_dados_usuario_idx
      ON audit.acesso_dados (usuario_id, criado_em DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS acesso_dados_recurso_idx
      ON audit.acesso_dados (recurso, acao, criado_em DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit.acesso_dados`);
    await queryRunner.query(`DROP TABLE IF EXISTS audit.termo_aceite`);
  }
}
