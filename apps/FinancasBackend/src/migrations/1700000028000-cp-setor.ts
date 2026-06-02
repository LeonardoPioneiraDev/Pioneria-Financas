import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Setor de origem do CP — vem de `GLOBUS.CPGDOCTO.CODSETOR` + descrição em
 * `GLOBUS.CPGSETOR.DESCRICAO`. Permite ao financeiro saber de qual setor a
 * conta veio (ex: "ALMOXARIFADO", "MANUTENÇÃO PESADA", "RH"). A descrição é
 * resolvida via JOIN na hora do sync (não persistimos o mestre separado, o
 * cadastro raramente muda e a descrição "espelhada" no CP é suficiente).
 */
export class CpSetor1700000028000 implements MigrationInterface {
  name = 'CpSetor1700000028000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        ADD COLUMN IF NOT EXISTS cod_setor   VARCHAR(10),
        ADD COLUMN IF NOT EXISTS setor_nome  VARCHAR(80)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS contas_pagar_setor_idx
        ON finance.contas_pagar (cod_setor)
        WHERE cod_setor IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS finance.contas_pagar_setor_idx`);
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        DROP COLUMN IF EXISTS cod_setor,
        DROP COLUMN IF EXISTS setor_nome
    `);
  }
}
