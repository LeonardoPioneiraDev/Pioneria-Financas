import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Substituição de títulos + confirmação de pagamento eletrônico no Contas a Pagar — SFN-48.
 *
 *  - `substituido` / `substituido_por_cod`: quando o título foi substituído/relançado
 *    no Globus, CPGDOCTO.CODDOCTOCPGSUBST aponta pro CODDOCTOCPG do sucessor. O antigo
 *    NÃO é cancelado (status N/B), então duplicava na lista e dobrava valor. Agora ele
 *    fica visível com selo "Substituído" porém FORA das somas. ~23% dos títulos têm o
 *    ponteiro (validado no Oracle, 2026-06-11).
 *  - `autenticacao_eletronica` / `status_pe`: confirmação bancária do pagamento
 *    (CPGDOCTO.AUTELETRONICA = comprovante, STATUSPE = 'PG' pago). A coluna "oficial"
 *    de retorno (NRDOCTORETBCOPE) vem vazia na Pioneira, por isso não é usada.
 *
 * Colunas ficam NULL/false até o próximo sync com Oracle ligado popular — em Docker o
 * Globus fica desligado (ORACLE_ENABLED=false). Sem backfill: os campos novos não
 * existem no raw_payload já sincronizado.
 */
export class CpSubstituicaoRetorno1700000034000 implements MigrationInterface {
  name = 'CpSubstituicaoRetorno1700000034000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        ADD COLUMN IF NOT EXISTS substituido              BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS substituido_por_cod      VARCHAR(40),
        ADD COLUMN IF NOT EXISTS autenticacao_eletronica  VARCHAR(160),
        ADD COLUMN IF NOT EXISTS status_pe                VARCHAR(5)
    `);
    // Os agregados ("Foi pago", aging, totais) filtram substituido = false; índice
    // parcial deixa esse filtro barato sem inchar o índice com a maioria não-substituída.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS contas_pagar_substituido_idx
        ON finance.contas_pagar (empresa_id)
        WHERE substituido = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS finance.contas_pagar_substituido_idx`);
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        DROP COLUMN IF EXISTS substituido,
        DROP COLUMN IF EXISTS substituido_por_cod,
        DROP COLUMN IF EXISTS autenticacao_eletronica,
        DROP COLUMN IF EXISTS status_pe
    `);
  }
}
