import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Diff campo-a-campo na trilha de auditoria: guarda o valor ANTES e DEPOIS de
 * cada alteracao (apenas os campos que mudaram). Popula so nas mutacoes reais de
 * usuario (aprovacao, meta de orcamento, ancora de saldo, conciliacao manual,
 * etc.) — o sistema e majoritariamente espelho read-only do Globus.
 */
export class AuditDiffAlteracoes1700000049000 implements MigrationInterface {
  name = 'AuditDiffAlteracoes1700000049000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE audit.acesso_dados ADD COLUMN IF NOT EXISTS valores_antes JSONB`);
    await queryRunner.query(`ALTER TABLE audit.acesso_dados ADD COLUMN IF NOT EXISTS valores_depois JSONB`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE audit.acesso_dados DROP COLUMN IF EXISTS valores_depois`);
    await queryRunner.query(`ALTER TABLE audit.acesso_dados DROP COLUMN IF EXISTS valores_antes`);
  }
}
