import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 2 — Rastreabilidade + deteccao de exclusao.
 *
 * (1) `hash_payload CHAR(64)` em todos os stages: hash SHA-256 hex do payload
 *     raw com chaves ordenadas (ver `shared/utils/crypto.ts#sha256Json`).
 *     Usado pelo adapter para pular update quando o conteudo nao mudou.
 *
 * (2) `excluido_em TIMESTAMPTZ` + `excluido_motivo VARCHAR(60)` em stages e
 *     nas tabelas canonicas (`finance.contas_pagar`, `finance.contas_receber`,
 *     `finance.fornecedores`, `finance.clientes`).
 *
 *     Motivos comuns:
 *       - 'cancelado_no_globus'  → flag STATUS=C detectado na fonte
 *       - 'sumiu_do_sync'        → registro existia no stage e nao veio
 *                                  na ultima execucao do sync (diff)
 *       - 'data_zero'            → data sentinela do legado tornou o registro
 *                                  invalido (raro, mas existe)
 *
 *     Estes campos NUNCA sao deletados: a exclusao logica preserva o audit
 *     trail. Queries da UI filtram `excluido_em IS NULL` por padrao.
 *
 * (3) Index parcial em finance.contas_pagar/contas_receber para queries
 *     "ativos" — `WHERE excluido_em IS NULL` cobre 99%+ do trafego.
 */
export class StageHashEExclusao1700000012000 implements MigrationInterface {
  name = 'StageHashEExclusao1700000012000';

  private readonly stages = [
    'integration.globus_cp_stage',
    'integration.globus_crc_stage',
    'integration.globus_crc_cliente_stage',
    'integration.globus_flp_func_stage',
    'integration.globus_flp_evento_stage',
    'integration.globus_flp_ficha_stage',
  ];

  private readonly canonicos = [
    'finance.contas_pagar',
    'finance.contas_receber',
    'finance.fornecedores',
    'finance.clientes',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Stages: hash + exclusao
    for (const tabela of this.stages) {
      await queryRunner.query(`ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS hash_payload CHAR(64)`);
      await queryRunner.query(`ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMPTZ`);
      await queryRunner.query(`ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS excluido_motivo VARCHAR(60)`);
    }

    // Canonicos: exclusao logica (hash nao se aplica - sao agregados)
    for (const tabela of this.canonicos) {
      await queryRunner.query(`ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS excluido_em TIMESTAMPTZ`);
      await queryRunner.query(`ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS excluido_motivo VARCHAR(60)`);
    }

    // Index parcial para queries "ativos" (sem cancelados) - cobre carteira do mes,
    // fluxo de caixa, listagens. Nao cria index em fornecedores/clientes ainda — la
    // o filtro de ativos ja existe via flag `ativo` legacy ou status.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS contas_pagar_ativos_idx
       ON finance.contas_pagar (empresa_id, data_vencimento DESC)
       WHERE excluido_em IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS contas_receber_ativos_idx
       ON finance.contas_receber (data_vencimento DESC)
       WHERE excluido_em IS NULL`,
    );

    // Index para varrer stages que precisam reprocessar (hash mudou ou nao tem)
    for (const tabela of this.stages) {
      const nomeIdx = `${tabela.replace('.', '_')}_hash_idx`;
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS ${nomeIdx}
         ON ${tabela} (sync_job_id)
         WHERE excluido_em IS NULL`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove indexes parciais
    for (const tabela of this.stages) {
      const nomeIdx = `${tabela.replace('.', '_')}_hash_idx`;
      await queryRunner.query(`DROP INDEX IF EXISTS integration.${nomeIdx.replace('integration_', '')}`);
    }
    await queryRunner.query(`DROP INDEX IF EXISTS finance.contas_pagar_ativos_idx`);
    await queryRunner.query(`DROP INDEX IF EXISTS finance.contas_receber_ativos_idx`);

    // Remove colunas (CASCADE pra eventuais views)
    for (const tabela of this.stages) {
      await queryRunner.query(`ALTER TABLE ${tabela} DROP COLUMN IF EXISTS hash_payload`);
      await queryRunner.query(`ALTER TABLE ${tabela} DROP COLUMN IF EXISTS excluido_em`);
      await queryRunner.query(`ALTER TABLE ${tabela} DROP COLUMN IF EXISTS excluido_motivo`);
    }
    for (const tabela of this.canonicos) {
      await queryRunner.query(`ALTER TABLE ${tabela} DROP COLUMN IF EXISTS excluido_em`);
      await queryRunner.query(`ALTER TABLE ${tabela} DROP COLUMN IF EXISTS excluido_motivo`);
    }
  }
}
