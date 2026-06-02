import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ContasPagarSync1700000003000 implements MigrationInterface {
  name = 'ContasPagarSync1700000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS integration`);
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS finance`);

    // ---- integration.sync_jobs (track de execucoes de sync) ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.sync_jobs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        sistema VARCHAR(40) NOT NULL,
        recurso VARCHAR(60) NOT NULL,
        status VARCHAR(20) NOT NULL,
        iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        terminado_em TIMESTAMPTZ,
        registros_lidos INT NOT NULL DEFAULT 0,
        registros_gravados INT NOT NULL DEFAULT 0,
        registros_com_erro INT NOT NULL DEFAULT 0,
        parametros JSONB,
        erro_mensagem TEXT,
        usuario_id UUID,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX sync_jobs_sistema_recurso_idx ON integration.sync_jobs (sistema, recurso, iniciado_em DESC)`);
    await queryRunner.query(`CREATE INDEX sync_jobs_status_idx ON integration.sync_jobs (status, iniciado_em DESC)`);

    // ---- integration.globus_cp_stage (raw do Globus) ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.globus_cp_stage (
        id BIGSERIAL PRIMARY KEY,
        cod_docto_cpg BIGINT NOT NULL,
        codigo_empresa INT NOT NULL,
        sync_job_id UUID REFERENCES integration.sync_jobs(id),
        raw_payload JSONB NOT NULL,
        recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processado_em TIMESTAMPTZ,
        CONSTRAINT globus_cp_stage_uq UNIQUE (codigo_empresa, cod_docto_cpg)
      )
    `);
    await queryRunner.query(`CREATE INDEX globus_cp_stage_processado_idx ON integration.globus_cp_stage (processado_em)`);

    // ---- finance.fornecedores (canonico, simplificado) ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.fornecedores (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        empresa_id INT NOT NULL DEFAULT 1,
        cnpj_cpf VARCHAR(20),
        razao_social VARCHAR(255) NOT NULL,
        nome_fantasia VARCHAR(255),
        ativo BOOLEAN NOT NULL DEFAULT TRUE,
        origem_sistema VARCHAR(40),
        origem_id_externo VARCHAR(40),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT fornecedores_origem_uq UNIQUE (origem_sistema, origem_id_externo)
      )
    `);
    await queryRunner.query(`CREATE INDEX fornecedores_cnpj_idx ON finance.fornecedores (cnpj_cpf) WHERE cnpj_cpf IS NOT NULL`);

    // ---- finance.contas_pagar (canonico) ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.contas_pagar (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        empresa_id INT NOT NULL DEFAULT 1,
        fornecedor_id UUID REFERENCES finance.fornecedores(id),
        numero_documento VARCHAR(40),
        serie_documento VARCHAR(10),
        numero_parcela INT,
        competencia DATE,
        data_emissao DATE,
        data_vencimento DATE NOT NULL,
        data_pagamento DATE,
        valor_bruto_cents BIGINT NOT NULL,
        desconto_cents BIGINT NOT NULL DEFAULT 0,
        juros_cents BIGINT NOT NULL DEFAULT 0,
        multa_cents BIGINT NOT NULL DEFAULT 0,
        valor_liquido_cents BIGINT GENERATED ALWAYS AS (valor_bruto_cents - desconto_cents + juros_cents + multa_cents) STORED,
        status VARCHAR(20) NOT NULL,
        quitado BOOLEAN NOT NULL DEFAULT FALSE,
        observacao TEXT,
        origem_sistema VARCHAR(40) NOT NULL,
        origem_id_externo VARCHAR(40) NOT NULL,
        ultimo_sync_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT contas_pagar_origem_uq UNIQUE (origem_sistema, origem_id_externo)
      )
    `);
    await queryRunner.query(`CREATE INDEX contas_pagar_vencimento_idx ON finance.contas_pagar (empresa_id, data_vencimento DESC)`);
    await queryRunner.query(`CREATE INDEX contas_pagar_status_idx ON finance.contas_pagar (status, data_vencimento) WHERE status <> 'cancelado'`);
    await queryRunner.query(`CREATE INDEX contas_pagar_fornecedor_idx ON finance.contas_pagar (fornecedor_id, data_vencimento DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.contas_pagar`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.fornecedores`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration.globus_cp_stage`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration.sync_jobs`);
  }
}
