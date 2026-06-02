import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recebíveis GDF (Movimento Resgatado BRB Mobilidade).
 *
 * Modelo de 3 tabelas:
 *
 *  1. `integration.horarios_relatorio_stage` — snapshot raw de cada relatorio
 *     listado em GET /api/integrations/conferencia-resgate. Hash + excluido_em
 *     no padrao das outras stages.
 *
 *  2. `finance.recebivel_gdf_relatorio` — cabecalho normalizado do relatorio
 *     com data_resgate extraida do dateRange.
 *
 *  3. `finance.recebivel_gdf_celula` — granularidade: 1 linha por celula da
 *     matriz (relatorio × data_transporte × tipo_pagamento). E o fato real
 *     que alimenta UI/agregacoes. Ignora linhas isSubtotal/isGrandTotal —
 *     elas sao calculaveis a partir das celulas.
 *
 *  4. `finance.recebivel_familia` — mestre estatico das 16 familias com flag
 *     de pagante × gratuidade. Seed inicial via INSERT na propria migration.
 */
export class RecebiveisGdf1700000015000 implements MigrationInterface {
  name = 'RecebiveisGdf1700000015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---- integration.horarios_relatorio_stage ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS integration.horarios_relatorio_stage (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        origem_id_externo VARCHAR(40) NOT NULL,
        sync_job_id UUID REFERENCES integration.sync_jobs(id) ON DELETE SET NULL,
        raw_payload JSONB NOT NULL,
        hash_payload CHAR(64),
        recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processado_em TIMESTAMPTZ,
        excluido_em TIMESTAMPTZ,
        excluido_motivo VARCHAR(60),
        CONSTRAINT horarios_relatorio_stage_uq UNIQUE (origem_id_externo)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX horarios_relatorio_stage_proc_idx
      ON integration.horarios_relatorio_stage (processado_em)
      WHERE excluido_em IS NULL
    `);

    // ---- finance.recebivel_familia (mestre estatico) ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.recebivel_familia (
        codigo VARCHAR(20) PRIMARY KEY,
        nome VARCHAR(60) NOT NULL,
        tipo VARCHAR(20) NOT NULL,        -- 'pagante' | 'gratuidade'
        fonte_subsidio VARCHAR(40),       -- 'GDF' | 'EMPRESA' | NULL
        ordem SMALLINT NOT NULL DEFAULT 99,
        descricao TEXT
      )
    `);
    // Seed das 16 familias confirmadas no relatorio 19/05/2026:
    await queryRunner.query(`
      INSERT INTO finance.recebivel_familia (codigo, nome, tipo, fonte_subsidio, ordem, descricao) VALUES
        ('CIDADAO',     'Cidadão',                    'pagante',    NULL,  1,  'Passageiro comum (cartão BRB Mobilidade)'),
        ('VT',          'Vale-Transporte',            'pagante',    NULL,  2,  'Pago pelo empregador'),
        ('EMV',         'EMV (cartão por aproximação)','pagante',    NULL,  3,  'Pagamento eletrônico bandeira (Visa/Master)'),
        ('QRCODE',      'QR Code',                    'pagante',    NULL,  4,  'Pagamento via QR Code no app'),
        ('PAGANTE',     'Pagante avulso',             'pagante',    NULL,  5,  'Categoria genérica de pagamento'),
        ('DIALIVRE',    'Dia Livre',                  'pagante',    NULL,  6,  'Cartão com tarifa fixa por dia'),
        ('CRIANCA',     'Criança',                    'gratuidade', NULL, 10,  'Criança abaixo da idade tarifada'),
        ('ESP',         'Especial',                   'gratuidade', 'GDF',11,  'Pessoa especial — gratuidade SEMOB'),
        ('ESPA',        'Especial Acompanhante',      'gratuidade', 'GDF',12,  'Acompanhante de pessoa especial'),
        ('PNE',         'PNE',                        'gratuidade', 'GDF',13,  'Pessoa com Necessidade Especial'),
        ('PNEA',        'PNE Acompanhante',           'gratuidade', 'GDF',14,  'Acompanhante PNE'),
        ('PLE',         'Passe Livre Estudantil',     'gratuidade', 'GDF',15,  'Estudante — programa GDF'),
        ('SENIOR',      'Sênior (idoso)',             'gratuidade', 'GDF',16,  'Idoso >= 60 anos — Estatuto do Idoso'),
        ('PORELAS',     'Por Elas',                   'gratuidade', 'GDF',17,  'Programa específico DF'),
        ('FUNCIONARIO', 'Funcionário',                'gratuidade', 'EMPRESA', 20, 'Funcionário da Pioneira'),
        ('GRATUITO',    'Gratuito (genérico)',        'gratuidade', NULL, 30,  'Outras gratuidades não classificadas')
      ON CONFLICT (codigo) DO NOTHING
    `);

    // ---- finance.recebivel_gdf_relatorio ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.recebivel_gdf_relatorio (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        origem_id_externo VARCHAR(40) NOT NULL UNIQUE,
        filename VARCHAR(200) NOT NULL,
        file_type VARCHAR(40),
        date_range TEXT,
        data_resgate DATE NOT NULL,             -- extraído do dateRange
        product_count INT,
        row_count INT,
        date_columns_count INT,
        user_name VARCHAR(60),
        processed_at TIMESTAMPTZ,
        valor_total_cents BIGINT NOT NULL DEFAULT 0,
        creditos_total INT NOT NULL DEFAULT 0,
        ultimo_sync_em TIMESTAMPTZ,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        excluido_em TIMESTAMPTZ,
        excluido_motivo VARCHAR(60)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX recebivel_gdf_relatorio_data_idx
      ON finance.recebivel_gdf_relatorio (data_resgate DESC)
      WHERE excluido_em IS NULL
    `);

    // ---- finance.recebivel_gdf_celula ----
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.recebivel_gdf_celula (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        relatorio_id UUID NOT NULL REFERENCES finance.recebivel_gdf_relatorio(id) ON DELETE CASCADE,
        data_resgate DATE NOT NULL,
        data_transporte DATE NOT NULL,
        familia VARCHAR(20) NOT NULL REFERENCES finance.recebivel_familia(codigo),
        tipo_pagamento VARCHAR(60) NOT NULL,
        tarifa_cents INT NOT NULL DEFAULT 0,
        valor_cents BIGINT NOT NULL DEFAULT 0,
        creditos INT NOT NULL DEFAULT 0,
        eh_pagante BOOLEAN NOT NULL,
        origem_id_externo VARCHAR(200) NOT NULL UNIQUE,
        hash_payload CHAR(64),
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        excluido_em TIMESTAMPTZ,
        excluido_motivo VARCHAR(60)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX recebivel_gdf_celula_data_transp_idx
      ON finance.recebivel_gdf_celula (data_transporte, familia)
      WHERE excluido_em IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX recebivel_gdf_celula_data_resgate_idx
      ON finance.recebivel_gdf_celula (data_resgate, familia)
      WHERE excluido_em IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX recebivel_gdf_celula_familia_idx
      ON finance.recebivel_gdf_celula (familia, data_transporte)
      WHERE excluido_em IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.recebivel_gdf_celula`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.recebivel_gdf_relatorio`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.recebivel_familia`);
    await queryRunner.query(`DROP TABLE IF EXISTS integration.horarios_relatorio_stage`);
  }
}
