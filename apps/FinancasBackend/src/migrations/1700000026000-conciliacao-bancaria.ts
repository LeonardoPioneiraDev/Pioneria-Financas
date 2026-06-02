import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Conciliação Bancária (MVP — Sprint 04).
 *
 * 1 tabela: finance.conciliacoes — registra cada match entre um banco_movto
 * e um CP (saida) ou CR (entrada).
 *
 * Regras:
 *  - Conciliacao referencia EITHER conta_pagar_id OR conta_receber_id (xor)
 *  - banco_movto pode estar em apenas 1 conciliacao ativa por vez
 *  - Status:
 *     'sugerido'   — auto-match propos, aguarda revisao
 *     'confirmado' — usuario aceitou a sugestao
 *     'rejeitado'  — usuario marcou como falso-positivo
 *
 * Quando 'confirmado': banco_movto.conciliado = true (atualizado pelo service).
 */
export class ConciliacaoBancaria1700000026000 implements MigrationInterface {
  name = 'ConciliacaoBancaria1700000026000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.conciliacoes (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        banco_movto_id      UUID NOT NULL REFERENCES finance.banco_movto(id) ON DELETE CASCADE,
        conta_pagar_id      UUID REFERENCES finance.contas_pagar(id) ON DELETE CASCADE,
        conta_receber_id    UUID REFERENCES finance.contas_receber(id) ON DELETE CASCADE,
        tipo                VARCHAR(10) NOT NULL,
        score_confianca     INT NOT NULL DEFAULT 0,
        diferenca_dias      INT NOT NULL DEFAULT 0,
        status              VARCHAR(20) NOT NULL DEFAULT 'sugerido',
        observacao          TEXT,
        sugerido_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        confirmado_em       TIMESTAMPTZ,
        confirmado_por_id   UUID REFERENCES identity.usuarios(id) ON DELETE SET NULL,
        CONSTRAINT conciliacoes_xor CHECK (
          (conta_pagar_id IS NOT NULL AND conta_receber_id IS NULL)
          OR (conta_pagar_id IS NULL AND conta_receber_id IS NOT NULL)
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS conciliacoes_movto_idx
       ON finance.conciliacoes (banco_movto_id, status)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS conciliacoes_cp_idx
       ON finance.conciliacoes (conta_pagar_id, status)
       WHERE conta_pagar_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS conciliacoes_cr_idx
       ON finance.conciliacoes (conta_receber_id, status)
       WHERE conta_receber_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS conciliacoes_status_idx
       ON finance.conciliacoes (status, sugerido_em DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.conciliacoes`);
  }
}
