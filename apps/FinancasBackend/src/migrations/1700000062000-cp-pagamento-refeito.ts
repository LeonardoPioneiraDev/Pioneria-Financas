import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marca no título quando o pagamento foi CANCELADO e REFEITO no Globus.
 *
 * O caso: operador paga, cancela minutos depois e lança de novo. O título é UM
 * só (não há dupla contagem nos totais — 512 títulos refeitos = 512 linhas),
 * mas quem abre o histórico no ERP vê "Cancelamento de pagamento" e desconfia
 * do número. Denormalizar aqui deixa o sinal visível NA LISTA, sem precisar
 * abrir o detalhe e sem custo de join em toda consulta.
 *
 * Contado a partir de `finance.cp_eventos` (CPGDOCTO_HISTORICO_NEGOCIACOES).
 * Só conta como pagamento o ato cujo TEXTO diz "pagamento de documento" —
 * "Adiantamento associado." e "Alterou : valor de adiantamento" também
 * terminam em status 'B' e inflariam a contagem.
 */
export class CpPagamentoRefeito1700000062000 implements MigrationInterface {
  name = 'CpPagamentoRefeito1700000062000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        ADD COLUMN IF NOT EXISTS vezes_pago_globus int NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS teve_cancelamento_pagamento boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN finance.contas_pagar.vezes_pago_globus IS
        'Quantas vezes o Globus registrou "Pagamento de documento". >1 = cancelado e refeito.'
    `);

    await queryRunner.query(`
      UPDATE finance.contas_pagar cp
      SET    vezes_pago_globus = x.vezes,
             teve_cancelamento_pagamento = x.cancelou
      FROM (
        SELECT cod_docto_cpg,
               COUNT(*) FILTER (WHERE mais_informacoes ILIKE '%pagamento de documento%')  AS vezes,
               BOOL_OR(mais_informacoes ILIKE '%cancelamento de pagamento%')              AS cancelou
        FROM   finance.cp_eventos
        GROUP  BY cod_docto_cpg
      ) x
      WHERE  x.cod_docto_cpg::text = cp.origem_id_externo
        AND  cp.origem_sistema = 'globus'
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS contas_pagar_refeito_idx
        ON finance.contas_pagar (empresa_id, vezes_pago_globus)
        WHERE vezes_pago_globus > 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS finance.contas_pagar_refeito_idx`);
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        DROP COLUMN IF EXISTS vezes_pago_globus,
        DROP COLUMN IF EXISTS teve_cancelamento_pagamento
    `);
  }
}
