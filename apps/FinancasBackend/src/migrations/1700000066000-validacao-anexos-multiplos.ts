import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Permite mais de um anexo (print) por ressalva.
 * Troca `anexo_data_uri` (text, 1 imagem) por `anexos_data_uri` (text[], até
 * ANEXO_MAX_ARQUIVOS imagens), com backfill do que já existia.
 */
export class ValidacaoAnexosMultiplos1700000066000 implements MigrationInterface {
  name = 'ValidacaoAnexosMultiplos1700000066000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE audit.validacao_funcionalidade
        ADD COLUMN IF NOT EXISTS anexos_data_uri text[]
    `);
    await queryRunner.query(`
      UPDATE audit.validacao_funcionalidade
      SET    anexos_data_uri = ARRAY[anexo_data_uri]
      WHERE  anexo_data_uri IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE audit.validacao_funcionalidade
        DROP COLUMN IF EXISTS anexo_data_uri
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN audit.validacao_funcionalidade.anexos_data_uri IS
        'Prints anexados à ressalva (data-URI base64, um por elemento). NULL/vazio = sem anexo.'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE audit.validacao_funcionalidade
        ADD COLUMN IF NOT EXISTS anexo_data_uri text
    `);
    await queryRunner.query(`
      UPDATE audit.validacao_funcionalidade
      SET    anexo_data_uri = anexos_data_uri[1]
      WHERE  anexos_data_uri IS NOT NULL AND array_length(anexos_data_uri, 1) > 0
    `);
    await queryRunner.query(`
      ALTER TABLE audit.validacao_funcionalidade
        DROP COLUMN IF EXISTS anexos_data_uri
    `);
  }
}
