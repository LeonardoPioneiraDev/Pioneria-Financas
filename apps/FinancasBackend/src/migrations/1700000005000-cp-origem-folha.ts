import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona campos de identificacao de origem do titulo:
 * - origem_documento: 'folha' | 'nf' | 'guia' | 'manual'
 * - data_integrou_flp: data em que veio da folha (CPGDOCTO.DATA_INTEGROU_FLP do Globus)
 * - competencia_flp: competencia da folha (CPGDOCTO.COMPETENCIA_FLP do Globus)
 */
export class CpOrigemFolha1700000005000 implements MigrationInterface {
  name = 'CpOrigemFolha1700000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        ADD COLUMN IF NOT EXISTS origem_documento VARCHAR(20) NOT NULL DEFAULT 'desconhecido',
        ADD COLUMN IF NOT EXISTS data_integrou_flp DATE,
        ADD COLUMN IF NOT EXISTS competencia_flp DATE
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS contas_pagar_origem_idx ON finance.contas_pagar (origem_documento, data_vencimento DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS finance.contas_pagar_origem_idx`);
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        DROP COLUMN IF EXISTS origem_documento,
        DROP COLUMN IF EXISTS data_integrou_flp,
        DROP COLUMN IF EXISTS competencia_flp
    `);
  }
}
