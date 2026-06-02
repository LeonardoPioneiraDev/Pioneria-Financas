import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * BCOCONTA — cadastro de contas bancarias do Globus.
 *
 *  - `integration.globus_bcoconta_stage` — snapshot raw da BCOCONTA
 *  - `finance.banco_conta` — canonico com ancora de saldo MANUAL (preenchida
 *     pelo tesoureiro, ja que a coluna SALDO_ACM_ATE_DATA do Globus esta
 *     abandonada — ver memory/globus-saldo-bancario.md).
 *
 *  Diferencas pra outras tabelas canonicas:
 *   - `saldo_acm_cents` e `data_saldo_acm` sao NULLABLE (precisam ser
 *     preenchidos manualmente apos sync; sem isso, calculo de saldo dia-a-dia
 *     nao funciona).
 *   - `eh_principal` e flag NOSSA (nao vem do Globus), marcada pelo ETL
 *     pras 6 contas operacionalmente relevantes.
 *   - Campos `*_globus_*` mantidos pra rastreabilidade / debug, mas NAO devem
 *     ser usados em calculos.
 */
export class BancoConta1700000017000 implements MigrationInterface {
  name = 'BancoConta1700000017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- integration.globus_bcoconta_stage ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.globus_bcoconta_stage (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        cod_banco INT NOT NULL,
        cod_agencia INT NOT NULL,
        cod_conta_bco VARCHAR(15) NOT NULL,
        codigo_empresa INT NOT NULL,
        codigo_fl INT NOT NULL,
        sync_job_id UUID REFERENCES integration.sync_jobs(id) ON DELETE SET NULL,
        raw_payload JSONB NOT NULL,
        hash_payload CHAR(64),
        recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processado_em TIMESTAMPTZ,
        excluido_em TIMESTAMPTZ,
        excluido_motivo VARCHAR(60),
        CONSTRAINT globus_bcoconta_stage_uq UNIQUE (cod_banco, cod_agencia, cod_conta_bco)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX globus_bcoconta_stage_proc_idx
      ON integration.globus_bcoconta_stage (processado_em)
      WHERE excluido_em IS NULL
    `);

    // ---- finance.banco_conta ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.banco_conta (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        empresa_id INT NOT NULL DEFAULT 4,
        codigo_fl INT NOT NULL,

        -- Identificacao Globus (chave natural)
        cod_banco INT NOT NULL,
        cod_agencia INT NOT NULL,
        cod_conta_bco VARCHAR(15) NOT NULL,
        digito VARCHAR(2),

        -- Display
        nome_conta_bco VARCHAR(80) NOT NULL,
        nome_amigavel VARCHAR(80),

        -- Classificacao
        conta_caixa BOOLEAN NOT NULL DEFAULT FALSE,
        eh_principal BOOLEAN NOT NULL DEFAULT FALSE,

        -- *** Ancora de saldo MANUAL (preenchida pelo tesoureiro) ***
        saldo_acm_cents BIGINT,
        data_saldo_acm DATE,
        saldo_acm_atualizado_por_usuario_id UUID REFERENCES identity.usuarios(id) ON DELETE SET NULL,
        saldo_acm_atualizado_em TIMESTAMPTZ,

        -- Snapshot Globus (referencia, NAO usar pra calculo)
        saldo_inicial_globus_cents BIGINT,
        saldo_acm_globus_cents BIGINT,
        data_saldo_acm_globus DATE,
        dt_limite_movto_globus DATE,

        -- Outros
        limite_credito_cents BIGINT,
        chave_pix VARCHAR(80),
        tipo_chave_pix INT,
        cod_conta_ctb INT,
        cod_custo INT,

        -- Auditoria
        origem_sistema VARCHAR(40) NOT NULL DEFAULT 'globus',
        origem_id_externo VARCHAR(40) NOT NULL,
        ultimo_sync_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        excluido_em TIMESTAMPTZ,
        excluido_motivo VARCHAR(60),

        CONSTRAINT banco_conta_origem_uq UNIQUE (origem_sistema, origem_id_externo),
        CONSTRAINT banco_conta_chave_uq  UNIQUE (cod_banco, cod_agencia, cod_conta_bco)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX banco_conta_principal_idx
      ON finance.banco_conta (eh_principal)
      WHERE excluido_em IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.banco_conta`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration.globus_bcoconta_stage`);
  }
}
