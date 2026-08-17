import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rateio por unidade no Contas a Pagar (pedido do financeiro).
 *
 * Quando um título tem itens em mais de um centro de custo (CPGITDOC.CODCUSTOFIN) — ex.:
 * DOBRAS dividida entre Itapoá/Santa Maria/Gama/São Sebastião — hoje só a unidade
 * DOMINANTE (maior valor) aparece. Agora guardamos a quebra completa:
 *  - `rateio_setores` (JSONB): [{codigo, nome, valorCents}] por unidade (pro detalhe).
 *  - `setores_codigos` (text[]): TODAS as unidades do título, pro filtro por setor pegar
 *    o título em qualquer uma delas (não só a dominante). GIN index pro operador &&.
 *
 * Ficam NULL até o próximo sync com Oracle ligado popular. Ver memory/globus-setor-custofin.
 */
export class CpRateioSetores1700000037000 implements MigrationInterface {
  name = 'CpRateioSetores1700000037000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        ADD COLUMN IF NOT EXISTS rateio_setores  JSONB,
        ADD COLUMN IF NOT EXISTS setores_codigos TEXT[]
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS contas_pagar_setores_codigos_idx
        ON finance.contas_pagar USING gin (setores_codigos)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS finance.contas_pagar_setores_codigos_idx`);
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        DROP COLUMN IF EXISTS rateio_setores,
        DROP COLUMN IF EXISTS setores_codigos
    `);
  }
}
