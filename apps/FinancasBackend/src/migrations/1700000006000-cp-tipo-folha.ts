import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CpTipoFolha1700000006000 implements MigrationInterface {
  name = 'CpTipoFolha1700000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        ADD COLUMN IF NOT EXISTS tipo_folha VARCHAR(30)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS contas_pagar_tipo_folha_idx
      ON finance.contas_pagar (tipo_folha, competencia_flp)
      WHERE tipo_folha IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS finance.contas_pagar_tipo_folha_idx`);
    await queryRunner.query(`ALTER TABLE finance.contas_pagar DROP COLUMN IF EXISTS tipo_folha`);
  }
}
