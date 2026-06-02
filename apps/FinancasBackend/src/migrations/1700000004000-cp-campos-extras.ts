import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CpCamposExtras1700000004000 implements MigrationInterface {
  name = 'CpCamposExtras1700000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(10),
        ADD COLUMN IF NOT EXISTS modalidade_pagamento VARCHAR(20),
        ADD COLUMN IF NOT EXISTS tipo_pagto VARCHAR(20),
        ADD COLUMN IF NOT EXISTS pagamento_liberado BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS data_entrada DATE,
        ADD COLUMN IF NOT EXISTS vlr_inss_cents BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS vlr_irrf_cents BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS vlr_pis_cents BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS vlr_cofins_cents BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS vlr_csll_cents BIGINT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS vlr_iss_cents BIGINT NOT NULL DEFAULT 0
    `);

    // Coluna calculada: total de retencoes + valor a pagar (liquido apos retencoes)
    // Como ja temos valor_liquido_cents (bruto - desc + juros + multa), vamos
    // criar uma view auxiliar para o frontend / nao mudar a generated.
    await queryRunner.query(`
      CREATE OR REPLACE VIEW finance.v_contas_pagar_resumo AS
      SELECT
        cp.*,
        (vlr_inss_cents + vlr_irrf_cents + vlr_pis_cents + vlr_cofins_cents + vlr_csll_cents + vlr_iss_cents) AS retencoes_cents,
        (valor_liquido_cents - vlr_inss_cents - vlr_irrf_cents - vlr_pis_cents - vlr_cofins_cents - vlr_csll_cents - vlr_iss_cents) AS valor_a_pagar_cents
      FROM finance.contas_pagar cp
    `);

    // Indice util para buscar livre por documento
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS contas_pagar_numero_documento_idx
      ON finance.contas_pagar (numero_documento)
      WHERE numero_documento IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS finance.v_contas_pagar_resumo`);
    await queryRunner.query(`DROP INDEX IF EXISTS finance.contas_pagar_numero_documento_idx`);
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        DROP COLUMN IF EXISTS tipo_documento,
        DROP COLUMN IF EXISTS modalidade_pagamento,
        DROP COLUMN IF EXISTS tipo_pagto,
        DROP COLUMN IF EXISTS pagamento_liberado,
        DROP COLUMN IF EXISTS data_entrada,
        DROP COLUMN IF EXISTS vlr_inss_cents,
        DROP COLUMN IF EXISTS vlr_irrf_cents,
        DROP COLUMN IF EXISTS vlr_pis_cents,
        DROP COLUMN IF EXISTS vlr_cofins_cents,
        DROP COLUMN IF EXISTS vlr_csll_cents,
        DROP COLUMN IF EXISTS vlr_iss_cents
    `);
  }
}
