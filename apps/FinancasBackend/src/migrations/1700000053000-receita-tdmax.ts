import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * finance.receita_tdmax — snapshot da receita/bilhetagem TD Max (por dia),
 * da API horarios.vpioneira.com.br. Receita a tarifa tecnica (Estacoes x Area 2).
 */
export class ReceitaTdmax1700000053000 implements MigrationInterface {
  name = 'ReceitaTdmax1700000053000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.receita_tdmax (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        empresa_id INT NOT NULL DEFAULT 4,
        data DATE NOT NULL,
        tipo_dia CHAR(1),
        pax_estacoes INT NOT NULL DEFAULT 0,
        receita_estacoes_cents BIGINT NOT NULL DEFAULT 0,
        pax_area2 INT NOT NULL DEFAULT 0,
        receita_area2_cents BIGINT NOT NULL DEFAULT 0,
        pax_total INT NOT NULL DEFAULT 0,
        receita_total_cents BIGINT NOT NULL DEFAULT 0,
        origem_sistema VARCHAR(40) NOT NULL DEFAULT 'horarios-tdmax',
        ultimo_sync_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT receita_tdmax_uq UNIQUE (empresa_id, data)
      )
    `);
    await queryRunner.query(`CREATE INDEX receita_tdmax_data_idx ON finance.receita_tdmax (data)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.receita_tdmax`);
  }
}
