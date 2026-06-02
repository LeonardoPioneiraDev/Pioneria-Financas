import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Aprovacoes digitais de Contas a Pagar (MVP — Sprint 04).
 *
 * Permite que usuarios com role 'cfo'/'admin' aprovem ou rejeitem titulos
 * digitalmente. Cada decisao gera um registro auditavel com:
 *   - hash de assinatura (SHA256 de timestamp + user_id + cp_id + secret server)
 *   - IP + user agent
 *   - justificativa (obrigatoria em rejeicao)
 *
 * NAO substitui assinatura ICP-Brasil — esta versao eh "rastreavel internamente",
 * util para fluxo interno mas sem valor juridico formal. Upgrade pra ICP fica
 * em proximo work item se o financeiro confirmar necessidade.
 *
 * Quando aprovado: CP recebe status='aprovado' + pagamento_liberado=true.
 * Quando rejeitado: CP recebe status='cancelado' (preserva titulo, marca decisao).
 */
export class CpAprovacoesDigitais1700000021000 implements MigrationInterface {
  name = 'CpAprovacoesDigitais1700000021000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.aprovacoes_cp (
        id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        conta_pagar_id     UUID NOT NULL REFERENCES finance.contas_pagar(id) ON DELETE CASCADE,
        aprovador_id       UUID NOT NULL REFERENCES identity.usuarios(id) ON DELETE RESTRICT,
        decisao            VARCHAR(10) NOT NULL,            -- 'aprovado' | 'rejeitado'
        justificativa      TEXT,
        assinatura_hash    VARCHAR(64) NOT NULL,
        ip                 VARCHAR(45),
        user_agent         VARCHAR(500),
        criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS aprovacoes_cp_cp_idx
       ON finance.aprovacoes_cp (conta_pagar_id, criado_em DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS aprovacoes_cp_aprovador_idx
       ON finance.aprovacoes_cp (aprovador_id, criado_em DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.aprovacoes_cp`);
  }
}
