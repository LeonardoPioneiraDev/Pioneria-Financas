import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Perguntas ao financeiro/contabilidade — armazena as RESPOSTAS (e perguntas
 * avulsas). As perguntas do roadmap vêm do frontend (module-status); aqui só
 * gravamos a resposta, amarrada pela `chave` estável da pergunta.
 */
export class PerguntasFinanceiro1700000042000 implements MigrationInterface {
  name = 'PerguntasFinanceiro1700000042000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.pergunta_financeiro (
        id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id           INT NOT NULL DEFAULT 4,
        chave                VARCHAR(80) UNIQUE,
        modulo               VARCHAR(60),
        modulo_nome          VARCHAR(80),
        categoria            VARCHAR(60),
        pergunta             TEXT NOT NULL,
        contexto             TEXT,
        resposta             TEXT,
        status               VARCHAR(20) NOT NULL DEFAULT 'aberta',
        prioridade           INT NOT NULL DEFAULT 0,
        respondido_por       UUID,
        respondido_por_nome  VARCHAR(120),
        respondido_em        TIMESTAMPTZ,
        criado_por           UUID,
        criado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
        atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS pergunta_financeiro_status_idx ON finance.pergunta_financeiro (status)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS pergunta_financeiro_modulo_idx ON finance.pergunta_financeiro (modulo)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.pergunta_financeiro`);
  }
}
