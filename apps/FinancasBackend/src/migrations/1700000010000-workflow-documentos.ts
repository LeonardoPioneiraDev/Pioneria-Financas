import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Workflow de documentos financeiros.
 *
 * Conceito: cada documento (conta a pagar, nota fiscal, conta a receber, recibo…)
 * percorre etapas configuráveis (pedido → conferência → aprovação → assinatura →
 * pagamento → conciliação). Este sistema é GENÉRICO — funciona pra qualquer tipo
 * de documento via (documento_tipo, documento_id).
 *
 * 3 tabelas:
 *   - workflow_template          : "template" de fluxo (ordem de etapas)
 *   - workflow_instance          : 1 por documento; aponta pra etapa atual
 *   - workflow_evento            : histórico cronológico (cada ação fica registrada)
 */
export class WorkflowDocumentos1700000010000 implements MigrationInterface {
  name = 'WorkflowDocumentos1700000010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ====================== TEMPLATE ======================
    // Configura o fluxo padrão de cada tipo de documento.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.workflow_template (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        nome            VARCHAR(100) NOT NULL,
        documento_tipo  VARCHAR(40) NOT NULL,        -- 'conta_pagar', 'conta_receber', 'nota_fiscal', etc.
        descricao       VARCHAR(500),
        ativo           BOOLEAN NOT NULL DEFAULT true,
        /* JSON com etapas no formato:
           [
             { "ordem": 1, "chave": "recebido",    "nome": "Documento recebido",
               "descricao": "...", "papel_responsavel": "cp_analista",
               "exige_anexo": false, "exige_comentario": false, "icone": "Inbox", "cor": "blue" },
             { "ordem": 2, "chave": "conferencia", "nome": "Em conferência", ... },
             ...
           ]
        */
        etapas          JSONB NOT NULL,
        criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (nome, documento_tipo)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS workflow_template_tipo_idx
       ON finance.workflow_template (documento_tipo, ativo)`,
    );

    // ====================== INSTANCE ======================
    // 1 instance por documento (genérico — pode apontar pra CP, CR, NF, etc).
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.workflow_instance (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        template_id     UUID NOT NULL REFERENCES finance.workflow_template(id),
        documento_tipo  VARCHAR(40) NOT NULL,
        documento_id    VARCHAR(80) NOT NULL,         -- UUID ou ID externo, depende do tipo
        etapa_atual     VARCHAR(40) NOT NULL,         -- chave da etapa atual no template.etapas[]
        etapa_atual_idx INT NOT NULL DEFAULT 0,       -- índice 0-based, redundante mas acelera consultas
        status          VARCHAR(20) NOT NULL DEFAULT 'em_andamento',
                          -- em_andamento | concluido | cancelado | bloqueado
        criado_por      UUID REFERENCES identity.usuarios(id),
        responsavel_id  UUID REFERENCES identity.usuarios(id),  -- quem deve atuar agora
        criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        concluido_em    TIMESTAMPTZ,
        atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (documento_tipo, documento_id)         -- 1 workflow por documento
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS workflow_instance_doc_idx
       ON finance.workflow_instance (documento_tipo, documento_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS workflow_instance_status_idx
       ON finance.workflow_instance (status, etapa_atual)
       WHERE status = 'em_andamento'`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS workflow_instance_responsavel_idx
       ON finance.workflow_instance (responsavel_id)
       WHERE status = 'em_andamento'`,
    );

    // ====================== EVENTO ======================
    // Histórico imutável de cada ação no workflow.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.workflow_evento (
        id              BIGSERIAL PRIMARY KEY,
        instance_id     UUID NOT NULL REFERENCES finance.workflow_instance(id) ON DELETE CASCADE,
        etapa_chave     VARCHAR(40) NOT NULL,          -- em que etapa estava quando aconteceu
        etapa_idx       INT NOT NULL,
        acao            VARCHAR(20) NOT NULL,
                          -- criou | avancou | voltou | comentou | anexou | aprovou
                          -- rejeitou | cancelou | retomou | atribuiu
        usuario_id      UUID REFERENCES identity.usuarios(id),
        comentario      VARCHAR(2000),
        anexo_url       VARCHAR(500),                  -- caminho/URL do arquivo (futuro upload)
        anexo_nome      VARCHAR(200),
        para_etapa      VARCHAR(40),                   -- destino quando acao = avancou/voltou/atribuiu
        para_usuario_id UUID REFERENCES identity.usuarios(id),
        meta            JSONB,                          -- payload livre (alterações de campo, etc.)
        criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS workflow_evento_instance_idx
       ON finance.workflow_evento (instance_id, criado_em)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS workflow_evento_usuario_idx
       ON finance.workflow_evento (usuario_id, criado_em DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.workflow_evento`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.workflow_instance`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.workflow_template`);
  }
}
