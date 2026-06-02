import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remessas CNAB (MVP — Sprint 04).
 *
 * Cada remessa eh um arquivo CNAB 240 gerado a partir de um conjunto de CPs
 * aprovados + pagamento_liberado. Layout FEBRABAN basico (refinado por banco
 * apos confirmar quais a Pioneira usa).
 *
 * Para simplificar: titulos incluidos na remessa ficam num array UUID[] na
 * propria tabela (sem junction table). Quando o N de CPs por remessa crescer
 * muito, criar tabela de junction.
 *
 * Estados:
 *   gerado     — arquivo criado, ainda nao enviado ao banco
 *   enviado    — arquivo enviado ao banco (manual ou via API banco no futuro)
 *   processado — retorno do banco recebido e baixado
 */
export class CpRemessasCnab1700000022000 implements MigrationInterface {
  name = 'CpRemessasCnab1700000022000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.remessas_cnab (
        id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        banco_codigo        VARCHAR(3) NOT NULL,
        banco_nome          VARCHAR(100) NOT NULL,
        sequencial          INT NOT NULL,
        layout              VARCHAR(10) NOT NULL DEFAULT 'CNAB240',
        arquivo_nome        VARCHAR(120) NOT NULL,
        arquivo_conteudo    TEXT NOT NULL,
        qtd_titulos         INT NOT NULL,
        valor_total_cents   BIGINT NOT NULL,
        titulos_ids         UUID[] NOT NULL,
        gerado_por_id       UUID REFERENCES identity.usuarios(id) ON DELETE SET NULL,
        gerado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        status              VARCHAR(20) NOT NULL DEFAULT 'gerado',
        observacao          TEXT,
        retorno_arquivo_nome  VARCHAR(120),
        retorno_processado_em TIMESTAMPTZ
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS remessas_cnab_gerado_em_idx
       ON finance.remessas_cnab (gerado_em DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS remessas_cnab_banco_seq_idx
       ON finance.remessas_cnab (banco_codigo, sequencial DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.remessas_cnab`);
  }
}
