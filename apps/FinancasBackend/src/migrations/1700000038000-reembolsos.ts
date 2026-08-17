import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reembolsos / ressarcimentos: liga Contas a Pagar → Recebíveis.
 *
 * Cenário (Viação Pioneira): motorista leva multa de trânsito → a multa chega pra
 * empresa → a empresa paga (vira título no Contas a Pagar) → cobra o funcionário →
 * ele devolve o valor (entra como recebível). Esta tabela rastreia esse elo:
 * `conta_pagar_id` (o título que originou) + `banco_movto_id` (o crédito do extrato
 * que comprova o recebimento, amarrado opcionalmente na baixa).
 *
 * Tabela PRÓPRIA — `contas_receber` é sincronizada do Globus e amarrada a Cliente;
 * aqui o devedor é funcionário/terceiro, criado dentro do nosso sistema.
 */
export class Reembolsos1700000038000 implements MigrationInterface {
  name = 'Reembolsos1700000038000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.reembolso (
        id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id         INT NOT NULL DEFAULT 4,
        conta_pagar_id     UUID NOT NULL REFERENCES finance.contas_pagar(id),
        devedor_nome       VARCHAR(120),
        devedor_documento  VARCHAR(20),
        devedor_matricula  VARCHAR(30),
        motivo             VARCHAR(200),
        valor_cents        BIGINT NOT NULL DEFAULT 0,
        recebido_cents     BIGINT,
        status             VARCHAR(20) NOT NULL DEFAULT 'pendente',
        data_prevista      DATE,
        data_recebimento   DATE,
        banco_movto_id     UUID REFERENCES finance.banco_movto(id),
        observacao         VARCHAR(500),
        usuario_inclusao   UUID,
        criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
        atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
        excluido_em        TIMESTAMPTZ
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS reembolso_conta_pagar_idx ON finance.reembolso (conta_pagar_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS reembolso_status_idx ON finance.reembolso (status)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.reembolso`);
  }
}
