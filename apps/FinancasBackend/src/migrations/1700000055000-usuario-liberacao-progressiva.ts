import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Liberação progressiva de funcionalidades por usuário. O admin atribui um
 * conjunto (funcionalidades_atribuidas) e o usuário valida uma por uma; conforme
 * valida, a próxima libera. `liberacao_progressiva` liga o modo (senão o menu é
 * o normal por papel).
 */
export class UsuarioLiberacaoProgressiva1700000055000 implements MigrationInterface {
  name = 'UsuarioLiberacaoProgressiva1700000055000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE identity.usuarios ADD COLUMN IF NOT EXISTS liberacao_progressiva boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE identity.usuarios ADD COLUMN IF NOT EXISTS funcionalidades_atribuidas text[] NOT NULL DEFAULT '{}'`);
    await queryRunner.query(`ALTER TABLE identity.usuarios ADD COLUMN IF NOT EXISTS funcionalidades_validadas text[] NOT NULL DEFAULT '{}'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE identity.usuarios DROP COLUMN IF EXISTS funcionalidades_validadas`);
    await queryRunner.query(`ALTER TABLE identity.usuarios DROP COLUMN IF EXISTS funcionalidades_atribuidas`);
    await queryRunner.query(`ALTER TABLE identity.usuarios DROP COLUMN IF EXISTS liberacao_progressiva`);
  }
}
