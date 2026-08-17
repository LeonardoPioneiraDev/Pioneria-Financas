import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DRE (Fase 4) — finance.dre_conta_mensal: contas de resultado do razao
 * (CTBSALDO, plano 1, classe 3/4), SO folhas, por competencia. Base pra montar
 * as linhas da DRE por hierarquia. Reusa a fonte CTBSALDO ja usada na Depreciacao.
 */
export class Dre1700000047000 implements MigrationInterface {
  name = 'Dre1700000047000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.dre_conta_mensal (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        empresa_id INT NOT NULL DEFAULT 4,
        competencia DATE NOT NULL,
        periodo CHAR(6) NOT NULL,
        cod_conta_ctb INT NOT NULL,
        classificador VARCHAR(30) NOT NULL,
        nome_conta VARCHAR(120),
        classe CHAR(1) NOT NULL,
        debito_cents BIGINT NOT NULL,
        credito_cents BIGINT NOT NULL,
        ultimo_sync_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT dre_conta_mensal_uq UNIQUE (empresa_id, competencia, cod_conta_ctb)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX dre_conta_mensal_comp_idx
      ON finance.dre_conta_mensal (empresa_id, competencia)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.dre_conta_mensal`);
  }
}
