import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Emissão de boletos e PIX para títulos de Contas a Receber (MVP — Sprint 04).
 *
 * MVP gera dados MOCK (linha digitável fake, QR PIX fake). Após validação com
 * financeiro e confirmação de qual banco + credenciais API, substituímos por
 * chamadas reais.
 */
export class CrBoletosPix1700000024000 implements MigrationInterface {
  name = 'CrBoletosPix1700000024000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.boletos_emitidos (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        conta_receber_id    UUID NOT NULL REFERENCES finance.contas_receber(id) ON DELETE CASCADE,
        tipo                VARCHAR(10) NOT NULL,
        banco_codigo        VARCHAR(3),
        banco_nome          VARCHAR(100),
        nosso_numero        VARCHAR(40),
        linha_digitavel     VARCHAR(60),
        codigo_barras       VARCHAR(60),
        qr_code_pix         TEXT,
        txid_pix            VARCHAR(40),
        vencimento          DATE NOT NULL,
        valor_cents         BIGINT NOT NULL,
        status              VARCHAR(20) NOT NULL DEFAULT 'emitido',
        modo                VARCHAR(20) NOT NULL DEFAULT 'mock',
        emitido_por_id      UUID REFERENCES identity.usuarios(id) ON DELETE SET NULL,
        emitido_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        pago_em             TIMESTAMPTZ,
        cancelado_em        TIMESTAMPTZ,
        observacao          TEXT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS boletos_emitidos_cr_idx
       ON finance.boletos_emitidos (conta_receber_id, emitido_em DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS boletos_emitidos_status_idx
       ON finance.boletos_emitidos (status, vencimento)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.boletos_emitidos`);
  }
}
