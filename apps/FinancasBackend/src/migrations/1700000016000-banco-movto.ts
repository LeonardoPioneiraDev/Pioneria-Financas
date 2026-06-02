import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BCOMOVTO — extrato bancario do Globus.
 *
 *  - `integration.globus_bcomovto_stage` — snapshot raw do CODMOVTOBCO
 *  - `finance.banco_movto` — canonico com flag `eh_repasse_brb` derivada da
 *     heuristica validada em 2026-05-20:
 *       CODHISTOBCO = 908 (RECEBIMENTO ARR/CRC/BCO)
 *       + CODBANCO = 70  (BRB)
 *       + CODAGENCIA = 51 + CODCONTABCO = '108'
 *
 *  Esta heuristica cobre 100% dos repasses BRB Mobilidade na Pioneira
 *  (validado: 21 lancamentos = R$ 11,94 M no mes 05/2026, conta dedicada).
 */
export class BancoMovto1700000016000 implements MigrationInterface {
  name = 'BancoMovto1700000016000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- integration.globus_bcomovto_stage ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.globus_bcomovto_stage (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        cod_movto_bco BIGINT NOT NULL,
        codigo_empresa INT NOT NULL,
        codigo_fl INT NOT NULL,
        sync_job_id UUID REFERENCES integration.sync_jobs(id) ON DELETE SET NULL,
        raw_payload JSONB NOT NULL,
        hash_payload CHAR(64),
        recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processado_em TIMESTAMPTZ,
        excluido_em TIMESTAMPTZ,
        excluido_motivo VARCHAR(60),
        CONSTRAINT globus_bcomovto_stage_uq UNIQUE (codigo_empresa, cod_movto_bco)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX globus_bcomovto_stage_proc_idx
      ON integration.globus_bcomovto_stage (processado_em)
      WHERE excluido_em IS NULL
    `);

    // ---- finance.banco_movto ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.banco_movto (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        empresa_id INT NOT NULL DEFAULT 4,
        codigo_fl INT NOT NULL,

        -- Chave natural do Globus
        cod_movto_bco BIGINT NOT NULL,

        -- Identificacao da conta
        cod_banco INT NOT NULL,
        cod_agencia INT NOT NULL,
        cod_conta_bco VARCHAR(15) NOT NULL,

        -- Movimento
        data_movto DATE NOT NULL,
        data_efetiva DATE,
        data_credito DATE,
        valor_cents BIGINT NOT NULL,
        cod_histo_bco INT,
        desc_histo_bco VARCHAR(80),
        hist_movto_bco VARCHAR(2000),
        doc_movto_bco VARCHAR(20),
        debito_credito CHAR(1),       -- C = credito, D = debito (derivado por sinal/historico)

        -- Status
        confirmado BOOLEAN NOT NULL DEFAULT FALSE,
        conciliado BOOLEAN NOT NULL DEFAULT FALSE,
        status_movto CHAR(1),

        -- Classificacao
        cod_tp_despesa VARCHAR(5),
        cod_tp_receita VARCHAR(5),
        cod_custo INT,

        -- *** Flag-chave: este movimento e um repasse BRB? ***
        -- Calculado pelo ETL com a heuristica validada (CODHISTOBCO=908 + conta 70-51-108).
        eh_repasse_brb BOOLEAN NOT NULL DEFAULT FALSE,

        -- Auditoria
        origem_sistema VARCHAR(40) NOT NULL DEFAULT 'globus',
        origem_id_externo VARCHAR(40) NOT NULL,
        ultimo_sync_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        excluido_em TIMESTAMPTZ,
        excluido_motivo VARCHAR(60),

        CONSTRAINT banco_movto_origem_uq UNIQUE (origem_sistema, origem_id_externo)
      )
    `);

    // Indexes principais
    await queryRunner.query(`
      CREATE INDEX banco_movto_data_idx
      ON finance.banco_movto (data_movto DESC)
      WHERE excluido_em IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX banco_movto_brb_idx
      ON finance.banco_movto (data_movto, valor_cents)
      WHERE eh_repasse_brb = true AND excluido_em IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX banco_movto_conta_idx
      ON finance.banco_movto (cod_banco, cod_agencia, cod_conta_bco, data_movto DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.banco_movto`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration.globus_bcomovto_stage`);
  }
}
