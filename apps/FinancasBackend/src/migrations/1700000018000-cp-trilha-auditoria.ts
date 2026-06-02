import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trilha de auditoria do CPGDOCTO no canonico finance.contas_pagar.
 *
 * Origem: CPGDOCTO tem 3 trilhas de usuario + 2 datas que ate agora estavam
 * sendo ignoradas pelo ETL. Importantes pra mostrar no detalhe do CP "quem
 * incluiu / liberou pagamento / assinou eletronicamente e quando".
 *
 *  - USUARIO_INCLUSAO     -> usuario_inclusao + data_inclusao
 *  - USUARIO_LIB_PAGTO_APROVE_ME -> usuario_lib_pagto + data_liberacao_pagto
 *  - USUARIO_ASS_ELETRON_APROVE_ME -> usuario_assinatura
 *
 * Os campos USUARIO_* sao login/codigo do Globus (varchar curtas), nao nome
 * completo. Pra mostrar nome real, precisaria mapear tabela de usuarios
 * Globus (proximo work item).
 */
export class CpTrilhaAuditoria1700000018000 implements MigrationInterface {
  name = 'CpTrilhaAuditoria1700000018000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        ADD COLUMN IF NOT EXISTS usuario_inclusao     VARCHAR(40),
        ADD COLUMN IF NOT EXISTS data_inclusao        TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS usuario_lib_pagto    VARCHAR(40),
        ADD COLUMN IF NOT EXISTS data_liberacao_pagto TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS usuario_assinatura   VARCHAR(40)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        DROP COLUMN IF EXISTS usuario_inclusao,
        DROP COLUMN IF EXISTS data_inclusao,
        DROP COLUMN IF EXISTS usuario_lib_pagto,
        DROP COLUMN IF EXISTS data_liberacao_pagto,
        DROP COLUMN IF EXISTS usuario_assinatura
    `);
  }
}
