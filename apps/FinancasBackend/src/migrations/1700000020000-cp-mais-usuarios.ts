import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adiciona mais 3 campos de usuario do CPGDOCTO em finance.contas_pagar:
 *
 *  - usuario_responsavel ← CPGDOCTO.USUARIO (responsavel generico do titulo;
 *    quando quitado, costuma ser quem registrou a baixa de pagamento)
 *  - assinatura_1        ← CPGDOCTO.ASSINATURA_1 (assinatura fisica/secundaria)
 *  - assinatura_2        ← CPGDOCTO.ASSINATURA_2 (assinatura fisica/secundaria)
 *
 * Use case principal: preencher o "vazio" da etapa 'pagamento' no workflow
 * (Globus nao tem campo USUARIO_PAGAMENTO dedicado) e mostrar assinaturas
 * secundarias na etapa 'assinatura'.
 *
 * Os 3 campos sao logins/codigos do Globus (curtos). Mapeamento pra nome
 * completo continua dependendo da tabela de usuarios Globus (proximo work item).
 */
export class CpMaisUsuarios1700000020000 implements MigrationInterface {
  name = 'CpMaisUsuarios1700000020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        ADD COLUMN IF NOT EXISTS usuario_responsavel VARCHAR(40),
        ADD COLUMN IF NOT EXISTS assinatura_1        VARCHAR(40),
        ADD COLUMN IF NOT EXISTS assinatura_2        VARCHAR(40)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        DROP COLUMN IF EXISTS usuario_responsavel,
        DROP COLUMN IF EXISTS assinatura_1,
        DROP COLUMN IF EXISTS assinatura_2
    `);
  }
}
