import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remessa enviada ao banco no Contas a Pagar (pedido do financeiro).
 *
 * `numero_remessa` (CPGDOCTO.NROREMESSAPE) + `data_remessa` (DTREMESSAPE) identificam
 * a remessa de PAGAMENTO ELETRÔNICO em que o título foi enviado ao banco. Títulos com
 * a MESMA (conta + data + número) saíram no MESMO arquivo (lote de pagamento). Só o
 * pagamento eletrônico tem remessa — borderô/cheque/manual ficam NULL (o "lote" deles
 * é o borderô, via cod_movto_bco). Cabeçalho no Globus: CPGREMESSAPE.
 *
 * Colunas ficam NULL até o próximo sync com Oracle ligado popular (em Docker o Globus
 * fica desligado, ORACLE_ENABLED=false). Ver memory/globus-cp-remessa-pe.
 */
export class CpRemessaPe1700000036000 implements MigrationInterface {
  name = 'CpRemessaPe1700000036000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        ADD COLUMN IF NOT EXISTS numero_remessa VARCHAR(10),
        ADD COLUMN IF NOT EXISTS data_remessa   TIMESTAMPTZ
    `);
    // Agrupar títulos da mesma remessa (conta + data + número) fica barato.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS contas_pagar_remessa_idx
        ON finance.contas_pagar (empresa_id, banco_pagador_codigo, banco_pagador_conta, data_remessa, numero_remessa)
        WHERE numero_remessa IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS finance.contas_pagar_remessa_idx`);
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        DROP COLUMN IF EXISTS numero_remessa,
        DROP COLUMN IF EXISTS data_remessa
    `);
  }
}
