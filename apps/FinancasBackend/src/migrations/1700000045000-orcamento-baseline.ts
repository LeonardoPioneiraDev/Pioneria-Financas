import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Baseline historico de orcamento (Fase 4 — leitor do orcado legado do Globus).
 *
 *  - `integration.globus_cpgorc_stage` — snapshot raw do CPGORCPREVISOES.
 *  - `finance.orcamento_previsao` — canonico: 1 linha por CODINTORC, agregada por
 *     ano/centro de custo no modulo Orcamento.
 *
 * E o unico orcado que existe no Globus (empresa 4, 2018-2020, parou em maio/2020).
 * Serve de baseline/prova de conceito e de isca pra o financeiro confirmar o eixo e
 * o formato do orcamento atual. Ver Leia/orcamento-mapeamento.md.
 */
export class OrcamentoBaseline1700000045000 implements MigrationInterface {
  name = 'OrcamentoBaseline1700000045000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- integration.globus_cpgorc_stage ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.globus_cpgorc_stage (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        codigo_empresa INT NOT NULL,
        cod_int_orc BIGINT NOT NULL,
        sync_job_id UUID REFERENCES integration.sync_jobs(id) ON DELETE SET NULL,
        raw_payload JSONB NOT NULL,
        hash_payload CHAR(64),
        recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processado_em TIMESTAMPTZ,
        excluido_em TIMESTAMPTZ,
        excluido_motivo VARCHAR(60),
        CONSTRAINT globus_cpgorc_stage_uq UNIQUE (codigo_empresa, cod_int_orc)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX globus_cpgorc_stage_proc_idx
      ON integration.globus_cpgorc_stage (processado_em)
      WHERE excluido_em IS NULL
    `);

    // ---- finance.orcamento_previsao ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.orcamento_previsao (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        empresa_id INT NOT NULL DEFAULT 4,

        filial INT,
        data_previsao DATE,
        ano INT,
        competencia DATE,
        tipo VARCHAR(12) NOT NULL DEFAULT 'indefinido',
        tipo_receita INT,
        tipo_despesa INT,
        cod_custo_fin INT,
        centro_custo_desc VARCHAR(120),
        valor_cents BIGINT NOT NULL DEFAULT 0,
        justificativa TEXT,

        origem_sistema VARCHAR(40) NOT NULL DEFAULT 'globus',
        origem_id_externo VARCHAR(80) NOT NULL,
        ultimo_sync_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        excluido_em TIMESTAMPTZ,
        excluido_motivo VARCHAR(60),

        CONSTRAINT orcamento_previsao_origem_uq UNIQUE (origem_sistema, origem_id_externo)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX orcamento_previsao_ano_idx
      ON finance.orcamento_previsao (empresa_id, ano)
      WHERE excluido_em IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.orcamento_previsao`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration.globus_cpgorc_stage`);
  }
}
