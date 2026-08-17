import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Orcado de REFERENCIA adotado pelo financeiro (finance.orcamento_meta) — uma linha
 * por centro de custo. Transforma a base tecnica derivada (sugestao) na meta que o
 * sistema acompanha (comparativo realizado x orcado). Nao e o orcado legado do
 * Globus (finance.orcamento_previsao). Ver Leia/orcamento-mapeamento.md.
 */
export class OrcamentoMeta1700000048000 implements MigrationInterface {
  name = 'OrcamentoMeta1700000048000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.orcamento_meta (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        empresa_id INT NOT NULL DEFAULT 4,
        cod_custo_fin INT NOT NULL,
        nome VARCHAR(120),
        categoria VARCHAR(12) NOT NULL DEFAULT 'indefinido',
        orcado_mensal_cents BIGINT NOT NULL DEFAULT 0,
        base_sugerido_cents BIGINT NOT NULL DEFAULT 0,
        observacao TEXT,
        adotado_por_usuario_id UUID,
        adotado_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        excluido_em TIMESTAMPTZ,
        CONSTRAINT orcamento_meta_setor_uq UNIQUE (empresa_id, cod_custo_fin)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX orcamento_meta_empresa_idx
      ON finance.orcamento_meta (empresa_id)
      WHERE excluido_em IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.orcamento_meta`);
  }
}
