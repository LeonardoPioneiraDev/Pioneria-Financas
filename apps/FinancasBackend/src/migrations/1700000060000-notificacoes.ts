import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Notificações in-app (sininho) do ciclo de conferência: validação, ressalva,
 * resposta do admin, aval do CFO. Uma linha por DESTINATÁRIO — "lida" é por
 * pessoa. Nome/e-mail do ator ficam denormalizados para o histórico não mudar
 * se o cadastro do usuário for editado depois.
 */
export class Notificacoes1700000060000 implements MigrationInterface {
  name = 'Notificacoes1700000060000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity.notificacao (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id int NOT NULL DEFAULT 1,
        usuario_id uuid NOT NULL REFERENCES identity.usuarios(id) ON DELETE CASCADE,
        tipo varchar(40) NOT NULL,
        titulo varchar(200) NOT NULL,
        mensagem text NOT NULL,
        funcionalidade varchar(80),
        ator_id uuid REFERENCES identity.usuarios(id) ON DELETE SET NULL,
        ator_nome varchar(200),
        ator_email varchar(255),
        link varchar(200),
        lida_em timestamptz,
        criado_em timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS notificacao_destinatario_idx ON identity.notificacao (usuario_id, lida_em, criado_em DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS identity.notificacao`);
  }
}
