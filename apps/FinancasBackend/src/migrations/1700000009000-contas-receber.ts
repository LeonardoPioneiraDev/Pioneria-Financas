import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ContasReceber1700000009000 implements MigrationInterface {
  name = 'ContasReceber1700000009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ====================== CATÁLOGOS / MESTRES ======================

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.clientes (
        id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id          INT NOT NULL DEFAULT 1,
        origem_sistema      VARCHAR(40) NOT NULL DEFAULT 'globus',
        cod_cli             VARCHAR(40) NOT NULL,
        razao_social        VARCHAR(200) NOT NULL,
        nome_fantasia       VARCHAR(100),
        tipo_inscricao      VARCHAR(5),
        numero_inscricao    VARCHAR(20),
        inscricao_estadual  VARCHAR(20),
        inscricao_municipal VARCHAR(20),
        email               VARCHAR(120),
        telefone            VARCHAR(30),
        endereco            VARCHAR(200),
        bairro              VARCHAR(50),
        cidade              VARCHAR(80),
        uf                  VARCHAR(3),
        cep                 VARCHAR(9),
        ativo               BOOLEAN NOT NULL DEFAULT true,
        banco_padrao        VARCHAR(20),
        agencia_padrao      VARCHAR(20),
        conta_padrao        VARCHAR(30),
        data_cadastro       DATE,
        ultimo_movto        DATE,
        ultimo_sync_em      TIMESTAMPTZ,
        criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (origem_sistema, cod_cli)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS clientes_doc_idx ON finance.clientes (numero_inscricao)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS clientes_nome_trgm_idx ON finance.clientes USING gin (razao_social gin_trgm_ops)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.tipos_receita (
        cod_tp_receita      VARCHAR(20) PRIMARY KEY,
        descricao           VARCHAR(200) NOT NULL,
        classificador       VARCHAR(40),
        natureza            VARCHAR(30),
        codigo_servico      VARCHAR(20),
        origem_sistema      VARCHAR(40) NOT NULL DEFAULT 'globus',
        ultimo_sync_em      TIMESTAMPTZ,
        criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS tipos_receita_classif_idx ON finance.tipos_receita (classificador)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.bancos (
        id                  SERIAL PRIMARY KEY,
        numero_febraban     INT NOT NULL UNIQUE,
        nome                VARCHAR(80) NOT NULL,
        homepage            VARCHAR(120),
        ispb                VARCHAR(8),
        origem_sistema      VARCHAR(40) NOT NULL DEFAULT 'globus',
        origem_id_externo   VARCHAR(40),
        ultimo_sync_em      TIMESTAMPTZ,
        UNIQUE (origem_sistema, origem_id_externo)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.cnab_ocorrencias (
        id              SERIAL PRIMARY KEY,
        modulo          VARCHAR(3) NOT NULL,
        codigo          VARCHAR(4) NOT NULL,
        descricao       VARCHAR(400) NOT NULL,
        ultimo_sync_em  TIMESTAMPTZ,
        UNIQUE (modulo, codigo)
      )
    `);

    // ====================== CONTAS A RECEBER ======================

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.contas_receber (
        id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id                  INT NOT NULL DEFAULT 1,
        cliente_id                  UUID REFERENCES finance.clientes(id),

        numero_documento            VARCHAR(40),
        serie_documento             VARCHAR(10),
        numero_parcela              INT,
        tipo_documento              VARCHAR(10),

        data_emissao                DATE,
        data_saida                  DATE,
        data_vencimento             DATE NOT NULL,
        data_vencimento_original    DATE,
        data_recebimento            DATE,

        valor_bruto_cents           BIGINT NOT NULL DEFAULT 0,
        desconto_cents              BIGINT NOT NULL DEFAULT 0,
        acrescimo_cents             BIGINT NOT NULL DEFAULT 0,
        vlr_inss_cents              BIGINT NOT NULL DEFAULT 0,
        vlr_irrf_cents              BIGINT NOT NULL DEFAULT 0,
        vlr_pis_cents               BIGINT NOT NULL DEFAULT 0,
        vlr_cofins_cents            BIGINT NOT NULL DEFAULT 0,
        vlr_csll_cents              BIGINT NOT NULL DEFAULT 0,
        vlr_iss_cents               BIGINT NOT NULL DEFAULT 0,

        status                      VARCHAR(20) NOT NULL DEFAULT 'aberto',
        quitado                     BOOLEAN NOT NULL DEFAULT false,
        renegociado                 BOOLEAN NOT NULL DEFAULT false,
        protestado                  BOOLEAN NOT NULL DEFAULT false,
        data_protesto               DATE,

        banco_cobranca              VARCHAR(20),
        agencia_cobranca            VARCHAR(20),
        conta_cobranca              VARCHAR(30),
        nosso_numero                VARCHAR(40),
        cobeletronica_status        VARCHAR(4),
        msg_boleto                  VARCHAR(500),
        fatura_impressa             BOOLEAN NOT NULL DEFAULT false,

        cartao_autorizacao          VARCHAR(20),
        cartao_tid                  VARCHAR(60),
        cartao_parcelas             INT,

        observacao                  VARCHAR(500),
        usuario_inclusao            VARCHAR(40),
        sistema_origem_praxio       VARCHAR(20),

        origem_sistema              VARCHAR(40) NOT NULL DEFAULT 'globus',
        origem_id_externo           VARCHAR(80) NOT NULL,
        ultimo_sync_em              TIMESTAMPTZ,
        criado_em                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (origem_sistema, origem_id_externo)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS contas_receber_vencimento_idx ON finance.contas_receber (data_vencimento, status)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS contas_receber_cliente_idx ON finance.contas_receber (cliente_id, data_vencimento)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS contas_receber_aberto_idx ON finance.contas_receber (status, data_vencimento) WHERE status IN ('aberto', 'renegociado')`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.contas_receber_itens (
        id                  BIGSERIAL PRIMARY KEY,
        conta_receber_id    UUID NOT NULL REFERENCES finance.contas_receber(id) ON DELETE CASCADE,
        cod_tp_receita      VARCHAR(20) REFERENCES finance.tipos_receita(cod_tp_receita),
        conta_contabil      VARCHAR(40),
        centro_custo        VARCHAR(40),
        centro_custo_fin    VARCHAR(40),
        observacao          VARCHAR(200),
        valor_cents         BIGINT NOT NULL,
        item_rateado        BOOLEAN NOT NULL DEFAULT false,
        origem_id_externo   VARCHAR(80) NOT NULL,
        UNIQUE (conta_receber_id, origem_id_externo)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS cr_itens_tp_idx ON finance.contas_receber_itens (cod_tp_receita)`);

    // ====================== STAGE ======================

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.globus_crc_stage (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        codigo_empresa  INT NOT NULL,
        cod_docto_crc   VARCHAR(40) NOT NULL,
        sync_job_id     UUID,
        raw_payload     JSONB NOT NULL,
        raw_itens       JSONB,
        recebido_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processado_em   TIMESTAMPTZ,
        UNIQUE (codigo_empresa, cod_docto_crc)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS globus_crc_stage_proc_idx ON integration.globus_crc_stage (processado_em) WHERE processado_em IS NULL`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.globus_crc_cliente_stage (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cod_cli         VARCHAR(40) NOT NULL UNIQUE,
        sync_job_id     UUID,
        raw_payload     JSONB NOT NULL,
        recebido_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processado_em   TIMESTAMPTZ
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS integration.globus_crc_cliente_stage`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration.globus_crc_stage`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.contas_receber_itens`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.contas_receber`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.cnab_ocorrencias`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.bancos`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.tipos_receita`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.clientes`);
  }
}
