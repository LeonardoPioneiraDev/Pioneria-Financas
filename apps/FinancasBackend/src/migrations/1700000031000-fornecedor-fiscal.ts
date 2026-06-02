import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Atributos fiscais do fornecedor — vindos de GLOBUS.BGM_FORNECEDOR, usados na
 * conferência de retenções (Tributos / SFN-46):
 *   - `opt_simples_nacional` (FORN_OPT_SIMPLES_NACIONAL 'S'/'N') — fornecedor do
 *     Simples NÃO sofre retenção de PIS/COFINS/CSLL/IRRF na fonte. Evita falso
 *     divergente.
 *   - `tipo_inscricao` (TPINSCRICAOFORN: CNPJ/CPF/CEI) — PF muda regra de IRRF/INSS.
 *   - `uf` / `cidade` / `cod_municipio` (CODIGOUF/CIDADEFORN/CODMUNIC) — base do
 *     ISS por município (próxima etapa).
 */
export class FornecedorFiscal1700000031000 implements MigrationInterface {
  name = 'FornecedorFiscal1700000031000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.fornecedores
        ADD COLUMN IF NOT EXISTS opt_simples_nacional BOOLEAN,
        ADD COLUMN IF NOT EXISTS tipo_inscricao        VARCHAR(10),
        ADD COLUMN IF NOT EXISTS uf                    VARCHAR(2),
        ADD COLUMN IF NOT EXISTS cidade                VARCHAR(120),
        ADD COLUMN IF NOT EXISTS cod_municipio         INT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.fornecedores
        DROP COLUMN IF EXISTS opt_simples_nacional,
        DROP COLUMN IF EXISTS tipo_inscricao,
        DROP COLUMN IF EXISTS uf,
        DROP COLUMN IF EXISTS cidade,
        DROP COLUMN IF EXISTS cod_municipio
    `);
  }
}
