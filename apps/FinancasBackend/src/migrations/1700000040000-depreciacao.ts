import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Depreciacao contabil (Fase 3 — opcao "leitor por classe").
 *
 *  - `integration.globus_ctbsaldo_stage` — snapshot raw do CTBSALDO (saldo mensal
 *     por conta) das familias de imobilizado/depreciacao.
 *  - `finance.depreciacao_mensal` — canonico: 1 linha por (empresa, competencia,
 *     conta), com grupo (despesa/base/acumulada) e classe (frota/instalacoes/...).
 *
 * Fonte de verdade = razao (CTBSALDO), pois a Pioneira NAO usa a rotina de ativo
 * fixo do Globus (ATFITEM_DEPRECMES vazio) — a depreciacao e calculada em planilha
 * e apenas lancada na contabilidade, por classe. Ver Leia/depreciacao-mapeamento.md.
 */
export class Depreciacao1700000040000 implements MigrationInterface {
  name = 'Depreciacao1700000040000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- integration.globus_ctbsaldo_stage ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.globus_ctbsaldo_stage (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        codigo_empresa INT NOT NULL,
        periodo CHAR(6) NOT NULL,
        nro_plano INT NOT NULL,
        cod_conta_ctb INT NOT NULL,
        sync_job_id UUID REFERENCES integration.sync_jobs(id) ON DELETE SET NULL,
        raw_payload JSONB NOT NULL,
        hash_payload CHAR(64),
        recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processado_em TIMESTAMPTZ,
        excluido_em TIMESTAMPTZ,
        excluido_motivo VARCHAR(60),
        CONSTRAINT globus_ctbsaldo_stage_uq UNIQUE (codigo_empresa, periodo, nro_plano, cod_conta_ctb)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX globus_ctbsaldo_stage_proc_idx
      ON integration.globus_ctbsaldo_stage (processado_em)
      WHERE excluido_em IS NULL
    `);

    // ---- finance.depreciacao_mensal ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.depreciacao_mensal (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        empresa_id INT NOT NULL DEFAULT 4,

        competencia DATE NOT NULL,
        periodo CHAR(6) NOT NULL,
        nro_plano INT NOT NULL,
        cod_conta_ctb INT NOT NULL,
        classificador VARCHAR(30) NOT NULL,
        nome_conta VARCHAR(120),

        -- despesa | imobilizado_bruto | direito_uso | deprec_acumulada
        grupo VARCHAR(24) NOT NULL,
        -- frota_operacional | caminhoes | veiculos_auxiliares | computadores |
        -- instalacoes | maquinas_oficina | maquinas_escritorio | moveis | imoveis | outros
        classe VARCHAR(40) NOT NULL,

        debito_cents BIGINT NOT NULL,
        credito_cents BIGINT NOT NULL,
        -- valor com sinal do grupo (despesa/base: deb-cred; acumulada: cred-deb)
        valor_cents BIGINT NOT NULL,

        origem_sistema VARCHAR(40) NOT NULL DEFAULT 'globus',
        origem_id_externo VARCHAR(60) NOT NULL,
        ultimo_sync_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        excluido_em TIMESTAMPTZ,
        excluido_motivo VARCHAR(60),

        CONSTRAINT depreciacao_mensal_origem_uq UNIQUE (origem_sistema, origem_id_externo)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX depreciacao_mensal_comp_idx
      ON finance.depreciacao_mensal (empresa_id, competencia)
      WHERE excluido_em IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX depreciacao_mensal_grupo_idx
      ON finance.depreciacao_mensal (grupo, classe)
      WHERE excluido_em IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.depreciacao_mensal`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration.globus_ctbsaldo_stage`);
  }
}
