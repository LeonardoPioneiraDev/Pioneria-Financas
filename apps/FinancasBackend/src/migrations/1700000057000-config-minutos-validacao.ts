import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tempo mínimo (em MINUTOS) entre o 1º acesso e a validação de uma funcionalidade
 * na liberação progressiva — agora ajustável pelo admin (era fixo em 2h no código).
 * Em minutos para permitir valores baixos em teste (ex.: 1).
 */
export class ConfigMinutosValidacao1700000057000 implements MigrationInterface {
  name = 'ConfigMinutosValidacao1700000057000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE identity.configuracao ADD COLUMN IF NOT EXISTS minutos_validacao_funcionalidade int NOT NULL DEFAULT 120`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE identity.configuracao DROP COLUMN IF EXISTS minutos_validacao_funcionalidade`);
  }
}
