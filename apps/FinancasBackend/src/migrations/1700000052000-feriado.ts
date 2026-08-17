import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Calendario de feriados. `recorrente = true` repete todo ano (mesmo mes/dia —
 * feriados fixos); `false` e data especifica (moveis: Carnaval, Sexta-feira
 * Santa, Corpus Christi). Consumido pela projecao do Fluxo de Caixa (marca o
 * dia, sem alterar valores). Seed: feriados nacionais 2026/2027.
 */
export class Feriado1700000052000 implements MigrationInterface {
  name = 'Feriado1700000052000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity.feriado (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        data         DATE NOT NULL,
        nome         VARCHAR(120) NOT NULL,
        tipo         VARCHAR(20) NOT NULL DEFAULT 'nacional',
        recorrente   BOOLEAN NOT NULL DEFAULT false,
        criado_por   UUID REFERENCES identity.usuarios(id) ON DELETE SET NULL,
        criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (data, nome)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS feriado_data_idx ON identity.feriado (data)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS feriado_recorrente_idx ON identity.feriado (recorrente)`);

    // Fixos nacionais (recorrente = true; ancora em 2026, o consumidor casa por mes/dia).
    await queryRunner.query(`
      INSERT INTO identity.feriado (data, nome, tipo, recorrente) VALUES
        ('2026-01-01', 'Confraternização Universal', 'nacional', true),
        ('2026-04-21', 'Tiradentes', 'nacional', true),
        ('2026-05-01', 'Dia do Trabalho', 'nacional', true),
        ('2026-09-07', 'Independência do Brasil', 'nacional', true),
        ('2026-10-12', 'Nossa Senhora Aparecida', 'nacional', true),
        ('2026-11-02', 'Finados', 'nacional', true),
        ('2026-11-15', 'Proclamação da República', 'nacional', true),
        ('2026-11-20', 'Consciência Negra', 'nacional', true),
        ('2026-12-25', 'Natal', 'nacional', true)
      ON CONFLICT (data, nome) DO NOTHING
    `);
    // Moveis (recorrente = false; data especifica por ano).
    await queryRunner.query(`
      INSERT INTO identity.feriado (data, nome, tipo, recorrente) VALUES
        ('2026-02-17', 'Carnaval', 'facultativo', false),
        ('2026-04-03', 'Sexta-feira Santa', 'nacional', false),
        ('2026-06-04', 'Corpus Christi', 'facultativo', false),
        ('2027-02-09', 'Carnaval', 'facultativo', false),
        ('2027-03-26', 'Sexta-feira Santa', 'nacional', false),
        ('2027-05-27', 'Corpus Christi', 'facultativo', false)
      ON CONFLICT (data, nome) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS identity.feriado`);
  }
}
