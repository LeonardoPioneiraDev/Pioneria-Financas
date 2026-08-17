import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Torna VISÍVEL a prorrogação de vencimento.
 *
 * Quando um título aberto é reprorrogado no Globus, o ETL passa a atualizar a
 * data (via reconciliação por chave). Mas o usuário não via que MUDOU — só a
 * data nova. Guardamos a data ANTERIOR e quando mudou, para a tela mostrar
 * "vencia 23/07 · prorrogado para 30/07".
 *
 * Backfill a partir dos eventos: títulos com "Alteração/Prorrogação do
 * vencimento" na trilha ganham a flag (sem o de/para retroativo, que não temos).
 */
export class CpVencimentoAnterior1700000063000 implements MigrationInterface {
  name = 'CpVencimentoAnterior1700000063000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        ADD COLUMN IF NOT EXISTS vencimento_anterior date,
        ADD COLUMN IF NOT EXISTS vencimento_alterado_em timestamptz,
        ADD COLUMN IF NOT EXISTS teve_prorrogacao boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN finance.contas_pagar.vencimento_anterior IS
        'Vencimento antes da última alteração no Globus. NULL = nunca mudou.'
    `);

    // Backfill da FLAG pelos eventos (o de/para retroativo não existe).
    await queryRunner.query(`
      UPDATE finance.contas_pagar cp
      SET    teve_prorrogacao = true
      WHERE  EXISTS (
        SELECT 1 FROM finance.cp_eventos e
        WHERE  e.cod_docto_cpg::text = cp.origem_id_externo
          AND  (e.mais_informacoes ILIKE '%prorroga%' OR e.mais_informacoes ILIKE '%altera%vencimento%')
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS contas_pagar_prorrogacao_idx
        ON finance.contas_pagar (empresa_id, teve_prorrogacao)
        WHERE teve_prorrogacao = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS finance.contas_pagar_prorrogacao_idx`);
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        DROP COLUMN IF EXISTS vencimento_anterior,
        DROP COLUMN IF EXISTS vencimento_alterado_em,
        DROP COLUMN IF EXISTS teve_prorrogacao
    `);
  }
}
