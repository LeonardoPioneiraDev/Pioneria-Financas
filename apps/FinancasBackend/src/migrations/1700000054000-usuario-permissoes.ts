import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permissoes de funcionalidade por usuario (granulares, complementam o role).
 * Array de chaves (ex.: 'ver_contracheque'). Default vazio: ninguem ve o dado
 * sensivel ate o admin liberar (admin tem tudo implicitamente).
 */
export class UsuarioPermissoes1700000054000 implements MigrationInterface {
  name = 'UsuarioPermissoes1700000054000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE identity.usuarios ADD COLUMN IF NOT EXISTS permissoes text[] NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE identity.usuarios DROP COLUMN IF EXISTS permissoes`);
  }
}
