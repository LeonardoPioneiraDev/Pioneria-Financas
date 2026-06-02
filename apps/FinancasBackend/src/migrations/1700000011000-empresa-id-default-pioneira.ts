import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Altera o DEFAULT da coluna `empresa_id` de 1 para 4 (Viacao Pioneira) em todas
 * as tabelas do schema `finance`.
 *
 * Motivo: o sistema atende EXCLUSIVAMENTE a Pioneira (CODIGOEMPRESA=4 no
 * Globus). Manter default 1 era resquicio de scaffold inicial e poderia
 * criar registros "orfaos" se alguma rotina interna esquecesse de informar
 * o valor (ver memoria pioneira-empresa-filiais e regra empresa=4).
 *
 * Esta migration NAO altera dados existentes — quem ja tem empresa_id=1
 * mantem 1 (audit trail intocado). So muda o default para novos INSERTs.
 *
 * Tabelas afetadas:
 *   - finance.fornecedores
 *   - finance.contas_pagar
 *   - finance.clientes
 *   - finance.contas_receber
 *   - finance.funcionarios
 *   - finance.ficha_evento
 */
export class EmpresaIdDefaultPioneira1700000011000 implements MigrationInterface {
  name = 'EmpresaIdDefaultPioneira1700000011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const tabelas = [
      'finance.fornecedores',
      'finance.contas_pagar',
      'finance.clientes',
      'finance.contas_receber',
      'finance.funcionarios',
      'finance.ficha_evento',
    ];
    for (const tabela of tabelas) {
      await queryRunner.query(`ALTER TABLE ${tabela} ALTER COLUMN empresa_id SET DEFAULT 4`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tabelas = [
      'finance.fornecedores',
      'finance.contas_pagar',
      'finance.clientes',
      'finance.contas_receber',
      'finance.funcionarios',
      'finance.ficha_evento',
    ];
    for (const tabela of tabelas) {
      await queryRunner.query(`ALTER TABLE ${tabela} ALTER COLUMN empresa_id SET DEFAULT 1`);
    }
  }
}
