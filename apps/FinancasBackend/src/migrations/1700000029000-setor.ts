import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Setor — cadastro proprio da Pioneira (porque GLOBUS.CPGDOCTO.CODSETOR esta
 * sempre NULL, validado em 543k linhas em 28/05/2026). Pioneira identifica
 * setor "pelo tipo da despesa": fornecedor X = Manutencao, fornecedor Y = RH.
 *
 * Modelo:
 *   - `finance.setor`             — cadastro (Manutencao, RH, Operacional...)
 *   - `finance.fornecedor_setor`  — atribuicao 1:1 (1 fornecedor = 1 setor)
 *
 * Setor do CP nao e armazenado em contas_pagar — vem por JOIN dinamico via
 * `fornecedor_id -> fornecedor_setor -> setor`. Vantagem: quando user troca
 * setor de um fornecedor, todos os CPs historicos refletem na hora.
 *
 * Quando nao tem atribuicao, CP retorna `setor = null` na API. UI mostra
 * "sem setor" e um botao pra atribuir. Sem chute, sem heuristica.
 */
export class Setor1700000029000 implements MigrationInterface {
  name = 'Setor1700000029000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
      CREATE INDEX IF NOT EXISTS setor_ativo_idx
        ON finance.setor (empresa_id, ativo)
        WHERE excluido_em IS NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.fornecedor_setor (
        fornecedor_id  UUID PRIMARY KEY REFERENCES finance.fornecedores(id) ON DELETE CASCADE,
        setor_id       UUID NOT NULL REFERENCES finance.setor(id) ON DELETE RESTRICT,
        definido_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        definido_por   UUID
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS fornecedor_setor_setor_idx
        ON finance.fornecedor_setor (setor_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.fornecedor_setor`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.setor`);
  }
}
