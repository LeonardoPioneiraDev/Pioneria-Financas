import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Integração SERASA (MVP — Sprint 04).
 *
 * 2 tabelas:
 *   serasa_consultas      — log de score/restricao consultados
 *   serasa_negativacoes   — fluxo de negativacao por CR
 *
 * MVP: chamadas SERASA sao MOCK (score randomico, decisao baseada em hash CNPJ).
 * Quando contrato SERASA / Boa Vista for confirmado, substituimos adapter.
 */
export class CrSerasa1700000025000 implements MigrationInterface {
  name = 'CrSerasa1700000025000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.serasa_consultas (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        cliente_id      UUID REFERENCES finance.clientes(id) ON DELETE CASCADE,
        cnpj_cpf        VARCHAR(20),
        score           INT,
        tem_restricao   BOOLEAN,
        qtd_restricoes  INT DEFAULT 0,
        valor_restricoes_cents BIGINT DEFAULT 0,
        observacao      TEXT,
        modo            VARCHAR(20) NOT NULL DEFAULT 'mock',
        consultado_por_id UUID REFERENCES identity.usuarios(id) ON DELETE SET NULL,
        consultado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS serasa_consultas_cliente_idx
       ON finance.serasa_consultas (cliente_id, consultado_em DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.serasa_negativacoes (
        id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        conta_receber_id UUID NOT NULL REFERENCES finance.contas_receber(id) ON DELETE CASCADE,
        cliente_id      UUID REFERENCES finance.clientes(id) ON DELETE SET NULL,
        protocolo_serasa VARCHAR(60),
        motivo          TEXT NOT NULL,
        valor_cents     BIGINT NOT NULL,
        status          VARCHAR(20) NOT NULL DEFAULT 'enviado',
        modo            VARCHAR(20) NOT NULL DEFAULT 'mock',
        enviado_por_id  UUID REFERENCES identity.usuarios(id) ON DELETE SET NULL,
        enviado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        efetivado_em    TIMESTAMPTZ,
        baixado_em      TIMESTAMPTZ,
        observacao      TEXT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS serasa_negativacoes_cr_idx
       ON finance.serasa_negativacoes (conta_receber_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS serasa_negativacoes_status_idx
       ON finance.serasa_negativacoes (status, enviado_em DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.serasa_negativacoes`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.serasa_consultas`);
  }
}
