import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserPageViews1700000002000 implements MigrationInterface {
  name = 'UserPageViews1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit.user_page_views (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        usuario_id UUID NOT NULL,
        session_id VARCHAR(80) NOT NULL,
        path VARCHAR(500) NOT NULL,
        page_title VARCHAR(200),
        referrer VARCHAR(500),
        time_on_page_ms INT,
        ip_address INET,
        user_agent VARCHAR(500),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX user_page_views_user_idx ON audit.user_page_views (usuario_id, criado_em DESC)`);
    await queryRunner.query(`CREATE INDEX user_page_views_session_idx ON audit.user_page_views (session_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit.user_page_views`);
  }
}
