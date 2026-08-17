import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quebra do titulo de Contas a Pagar por CONTA CONTABIL (natureza da despesa).
 *
 * Pedido do financeiro: quando o valor de um titulo e a SOMA de varios itens com
 * classificacoes contabeis diferentes (ex.: doc 8918 = R$4.476,50 = Consertos e
 * Reformas 2.227,50 + Consumo da Oficina 2.197,20 + Eletricidade 51,80), mostrar a
 * quebra. Eixo DIFERENTE do rateio por setor (CODCUSTOFIN) — aqui e a conta contabil
 * (CPGITDOC.CODCONTACTB -> CTBCONTA: CLASSIFICADOR + NOMECONTA).
 *
 * Coluna JSONB populada no ETL a partir do LISTAGG RATEIO_CONTAS. Fica null ate o
 * proximo sync (e nos titulos com 1 conta so). Mesma mecanica de `rateio_setores`.
 */
export class CpRateioContas1700000039000 implements MigrationInterface {
  name = 'CpRateioContas1700000039000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        ADD COLUMN IF NOT EXISTS rateio_contas JSONB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        DROP COLUMN IF EXISTS rateio_contas
    `);
  }
}
