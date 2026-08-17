import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Progresso da liberação progressiva por funcionalidade, com timestamps:
 * { "<href>": { "primeiroAcessoEm": iso|null, "validadoEm": iso|null } }.
 * primeiroAcessoEm inicia o relógio das horas mínimas; validadoEm = quem/quando validou.
 */
export class UsuarioProgressoFuncionalidades1700000056000 implements MigrationInterface {
  name = 'UsuarioProgressoFuncionalidades1700000056000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE identity.usuarios ADD COLUMN IF NOT EXISTS progresso_funcionalidades jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE identity.usuarios DROP COLUMN IF EXISTS progresso_funcionalidades`);
  }
}
