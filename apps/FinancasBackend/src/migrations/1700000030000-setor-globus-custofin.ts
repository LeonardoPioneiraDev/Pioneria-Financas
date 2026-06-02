import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Forward-fix do setor: abandona o cadastro manual (migration 1700000029000) e
 * passa a derivar setor 100% do Globus.
 *
 * Decisao (28/05/2026): setor da Pioneira = CENTRO DE CUSTO FINANCEIRO do item
 * (GLOBUS.CPGITDOC.CODCUSTOFIN), com descricao em GLOBUS.CPGCUSTOS.DESCRICAO.
 * Sao 8 unidades (Santa Maria, Gama, Itapoa, Sao Sebastiao, Uniao, Setor O,
 * Adm. N. Bandeirante, Abastecimento), preenchidas em ~95% dos itens. O campo
 * CPGDOCTO.CODSETOR (origem antiga) estava vazio em 100% dos CPs.
 *
 * Reusa as colunas finance.contas_pagar.cod_setor / setor_nome (migration
 * 1700000028000) — agora populadas pela sync via CODCUSTOFIN. Adiciona
 * `setor_rateado` pra marcar titulos com itens em mais de uma unidade (~1%),
 * cujo setor exibido e a unidade DOMINANTE por valor.
 *
 * Remove finance.setor e finance.fornecedor_setor (cadastro manual descartado).
 */
export class SetorGlobusCustofin1700000030000 implements MigrationInterface {
  name = 'SetorGlobusCustofin1700000030000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.fornecedor_setor`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.setor`);

    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        ADD COLUMN IF NOT EXISTS setor_rateado BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN finance.contas_pagar.cod_setor IS
        'Centro de custo financeiro dominante do titulo (GLOBUS.CPGITDOC.CODCUSTOFIN).'
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN finance.contas_pagar.setor_nome IS
        'Descricao do centro de custo financeiro (GLOBUS.CPGCUSTOS.DESCRICAO).'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE finance.contas_pagar DROP COLUMN IF EXISTS setor_rateado`);
    // Recria o cadastro manual (espelho da migration 1700000029000) para reversibilidade.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.setor (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id   INT NOT NULL DEFAULT 4,
        nome         VARCHAR(60) NOT NULL,
        descricao    VARCHAR(255),
        cor_hex      VARCHAR(7),
        ativo        BOOLEAN NOT NULL DEFAULT TRUE,
        criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        excluido_em  TIMESTAMPTZ,
        UNIQUE (empresa_id, nome)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.fornecedor_setor (
        fornecedor_id  UUID PRIMARY KEY REFERENCES finance.fornecedores(id) ON DELETE CASCADE,
        setor_id       UUID NOT NULL REFERENCES finance.setor(id) ON DELETE RESTRICT,
        definido_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        definido_por   UUID
      )
    `);
  }
}
