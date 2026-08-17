import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Anexo (print) opcional na ressalva do auditor em "Minhas Funcionalidades".
 * Segue o mesmo padrão do logo em Parâmetros: data-URI base64 num campo de
 * texto (sem storage/S3 novo). Só usado quando status = 'reprovado'.
 */
export class ValidacaoAnexo1700000065000 implements MigrationInterface {
  name = 'ValidacaoAnexo1700000065000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE audit.validacao_funcionalidade
        ADD COLUMN IF NOT EXISTS anexo_data_uri text
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit.validacao_funcionalidade.anexo_data_uri IS
        'Print anexado à ressalva (data-URI base64). NULL = sem anexo.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE audit.validacao_funcionalidade
        DROP COLUMN IF EXISTS anexo_data_uri
    `);
  }
}
