import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * finance.frota_composicao — snapshot agregado da frota FISICA (contagem de
 * veiculos ativos por garagem e tipo), do FRT_CADVEICULOS do Globus.
 *
 * Contexto pra tela de Depreciacao ("quantos veiculos"), separado do valor
 * contabil (CTBSALDO). Refrescado por inteiro a cada sync de depreciacao.
 */
export class FrotaComposicao1700000046000 implements MigrationInterface {
  name = 'FrotaComposicao1700000046000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.frota_composicao (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        empresa_id INT NOT NULL DEFAULT 4,
        garagem_codigo INT NOT NULL,
        garagem_nome VARCHAR(40) NOT NULL,
        tipo_frota VARCHAR(60) NOT NULL,
        eh_onibus BOOLEAN NOT NULL DEFAULT TRUE,
        qtd INT NOT NULL,
        ultimo_sync_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT frota_composicao_uq UNIQUE (empresa_id, garagem_codigo, tipo_frota)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.frota_composicao`);
  }
}
