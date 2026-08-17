import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Trilha de conferência das funcionalidades (append-only):
 * auditor valida/reprova com observações · CFO dá o aval · admin responde a ressalva.
 *
 * Migra o que já existia no JSON `identity.usuarios.progresso_funcionalidades`
 * (validações antigas + justificativa) para não perder o histórico.
 */
export class ValidacaoFuncionalidade1700000058000 implements MigrationInterface {
  name = 'ValidacaoFuncionalidade1700000058000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit.validacao_funcionalidade (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id int NOT NULL DEFAULT 1,
        usuario_id uuid NOT NULL REFERENCES identity.usuarios(id) ON DELETE CASCADE,
        funcionalidade varchar(80) NOT NULL,
        tipo varchar(20) NOT NULL,
        status varchar(20) NOT NULL,
        observacoes text,
        primeiro_acesso_em timestamptz,
        resposta_admin text,
        respondido_por uuid REFERENCES identity.usuarios(id) ON DELETE SET NULL,
        respondido_em timestamptz,
        criado_em timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT validacao_tipo_ck CHECK (tipo IN ('conferencia', 'aval')),
        CONSTRAINT validacao_status_ck CHECK (status IN ('validado', 'reprovado')),
        CONSTRAINT validacao_obs_ck CHECK (status <> 'reprovado' OR observacoes IS NOT NULL)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS validacao_func_idx ON audit.validacao_funcionalidade (funcionalidade, tipo, criado_em)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS validacao_usuario_idx ON audit.validacao_funcionalidade (usuario_id, funcionalidade)`,
    );

    // Backfill: cada funcionalidade já validada no JSON vira uma conferência.
    await queryRunner.query(`
      INSERT INTO audit.validacao_funcionalidade
        (usuario_id, funcionalidade, tipo, status, observacoes, primeiro_acesso_em, criado_em)
      SELECT
        u.id,
        p.key,
        'conferencia',
        'validado',
        NULLIF(p.value->>'justificativa', ''),
        (p.value->>'primeiroAcessoEm')::timestamptz,
        COALESCE((p.value->>'validadoEm')::timestamptz, now())
      FROM identity.usuarios u
      CROSS JOIN LATERAL jsonb_each(u.progresso_funcionalidades) AS p(key, value)
      WHERE p.value->>'validadoEm' IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM audit.validacao_funcionalidade v
          WHERE v.usuario_id = u.id AND v.funcionalidade = p.key AND v.tipo = 'conferencia'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit.validacao_funcionalidade`);
  }
}
