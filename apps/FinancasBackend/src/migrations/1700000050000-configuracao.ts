import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Configuracao da empresa (parametros gerais). Sistema de empresa UNICA
 * (Viacao Pioneira) — 1 linha so (empresa_id = 1). Guarda a identidade exibida
 * (razao social, CNPJ, endereco) e o logo como data-URI (sem object storage:
 * gravar arquivo em disco quebra em container read-only).
 */
export class Configuracao1700000050000 implements MigrationInterface {
  name = 'Configuracao1700000050000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity.configuracao (
        empresa_id      INT PRIMARY KEY DEFAULT 1,
        razao_social    VARCHAR(200) NOT NULL DEFAULT 'Viação Pioneira Ltda',
        nome_fantasia   VARCHAR(120),
        cnpj            VARCHAR(20),
        endereco        VARCHAR(300),
        telefone        VARCHAR(40),
        logo_data_uri   TEXT,
        atualizado_por  UUID REFERENCES identity.usuarios(id) ON DELETE SET NULL,
        atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Seed da linha unica (idempotente).
    await queryRunner.query(`
      INSERT INTO identity.configuracao (empresa_id, razao_social, nome_fantasia)
      VALUES (1, 'Viação Pioneira Ltda', 'Viação Pioneira')
      ON CONFLICT (empresa_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS identity.configuracao`);
  }
}
