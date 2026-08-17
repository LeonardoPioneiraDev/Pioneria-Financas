import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Guarda o STATUSDOCTOCPG cru do Globus no título (N/B/C).
 *
 * Sem esta coluna, o status do ERP se perdia na derivação do ETL e não havia
 * como responder "o Globus concorda com a gente?" sem ir ao Oracle. Com ela, a
 * divergência fica visível na própria tela.
 *
 * Backfill a partir do stage (`raw_payload->>'STATUS_DOCTO'`).
 */
export class CpStatusGlobus1700000061000 implements MigrationInterface {
  name = 'CpStatusGlobus1700000061000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE finance.contas_pagar ADD COLUMN IF NOT EXISTS status_docto_globus char(1)`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN finance.contas_pagar.status_docto_globus IS
       'CPGDOCTO.STATUSDOCTOCPG cru: N=em aberto, B=baixado(pago), C=cancelado. Fonte do campo status.'`,
    );

    // Backfill do que já está no stage.
    await queryRunner.query(`
      UPDATE finance.contas_pagar cp
      SET    status_docto_globus = UPPER(LEFT(s.raw_payload->>'STATUS_DOCTO', 1))
      FROM   integration.globus_cp_stage s
      WHERE  s.cod_docto_cpg::text = cp.origem_id_externo
        AND  cp.origem_sistema = 'globus'
        AND  s.raw_payload->>'STATUS_DOCTO' IS NOT NULL
        AND  cp.status_docto_globus IS DISTINCT FROM UPPER(LEFT(s.raw_payload->>'STATUS_DOCTO', 1))
    `);

    // Realinha o `status` com a regra nova (STATUSDOCTOCPG manda).
    // Corrige as divergências achadas em 23/07/2026: 6 títulos B marcados como
    // pendente e 3 títulos N marcados como pago por QUITADO='S' residual.
    await queryRunner.query(`
      UPDATE finance.contas_pagar
      SET    status = CASE status_docto_globus
                        WHEN 'C' THEN 'cancelado'
                        WHEN 'B' THEN 'pago'
                        WHEN 'F' THEN 'aprovado'
                        ELSE 'pendente'
                      END
      WHERE  status_docto_globus IN ('C', 'B', 'F', 'N', 'A')
        AND  status <> CASE status_docto_globus
                         WHEN 'C' THEN 'cancelado'
                         WHEN 'B' THEN 'pago'
                         WHEN 'F' THEN 'aprovado'
                         ELSE 'pendente'
                       END
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE finance.contas_pagar DROP COLUMN IF EXISTS status_docto_globus`);
  }
}
