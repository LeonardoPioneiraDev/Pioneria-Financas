import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Regua de cobranca automatica (MVP — Sprint 04).
 *
 * 2 tabelas:
 *   regua_cobranca_templates — configuracao de mensagens por dias vencidos
 *   regua_cobranca_envios    — historico de mensagens disparadas (auditavel)
 *
 * Templates rodam em cron 1x/dia. Pra cada CR aberto, calcula dias_vencidos
 * (negativo = ainda vai vencer, positivo = ja venceu) e dispara templates
 * cujo gatilho_dias_vencimento === dias_vencidos. Idempotente: nao reenvia
 * mesma template no mesmo dia.
 *
 * MVP: envio simulado (registra "ENVIARIA" no banco). Email real via mailhog
 * funciona em dev. WhatsApp requer provider externo (Twilio, Zenvia, Take Blip)
 * — depende de confirmacao com financeiro.
 */
export class CrReguaCobranca1700000023000 implements MigrationInterface {
  name = 'CrReguaCobranca1700000023000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.regua_cobranca_templates (
        id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        nome                        VARCHAR(100) NOT NULL,
        canal                       VARCHAR(20) NOT NULL,
        gatilho_dias_vencimento     INT NOT NULL,
        assunto                     VARCHAR(200),
        corpo_template              TEXT NOT NULL,
        ativo                       BOOLEAN NOT NULL DEFAULT true,
        tom                         VARCHAR(20) NOT NULL DEFAULT 'cordial',
        criado_em                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS regua_templates_gatilho_idx
       ON finance.regua_cobranca_templates (gatilho_dias_vencimento, ativo)`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS finance.regua_cobranca_envios (
        id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        conta_receber_id            UUID NOT NULL REFERENCES finance.contas_receber(id) ON DELETE CASCADE,
        template_id                 UUID NOT NULL REFERENCES finance.regua_cobranca_templates(id) ON DELETE RESTRICT,
        canal                       VARCHAR(20) NOT NULL,
        destinatario                VARCHAR(200) NOT NULL,
        assunto                     VARCHAR(200),
        corpo_rendered              TEXT NOT NULL,
        modo                        VARCHAR(20) NOT NULL DEFAULT 'simulado',
        status                      VARCHAR(20) NOT NULL DEFAULT 'enviado',
        mensagem_erro               TEXT,
        enviado_em                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        dias_vencidos_no_envio      INT NOT NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS regua_envios_cr_idx
       ON finance.regua_cobranca_envios (conta_receber_id, enviado_em DESC)`,
    );
    // Idempotencia (1 envio por template+CR+dia) eh feita no service via range
    // de timestamp, sem precisar de funcao no indice (DATE_TRUNC nao eh IMMUTABLE).
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS regua_envios_template_cr_idx
       ON finance.regua_cobranca_envios (template_id, conta_receber_id, enviado_em DESC)`,
    );

    // Seed de templates iniciais — demonstracao
    await queryRunner.query(`
      INSERT INTO finance.regua_cobranca_templates (nome, canal, gatilho_dias_vencimento, assunto, corpo_template, tom)
      VALUES
        ('Lembrete 3 dias antes',        'email', -3,  'Lembrete: vencimento em 3 dias - {{numero_documento}}',
         'Ola {{nome_cliente}},\\n\\nO titulo {{numero_documento}} no valor de {{valor}} vence em {{data_vencimento}}. Conte com a gente caso precise de algo.\\n\\nAtenciosamente,\\nViacao Pioneira', 'cordial'),
        ('1a cobranca - 5 dias',         'email',  5,  'Titulo vencido - {{numero_documento}}',
         'Ola {{nome_cliente}},\\n\\nIdentificamos que o titulo {{numero_documento}} ({{valor}}) venceu em {{data_vencimento}} e ainda nao foi quitado ({{dias_vencidos}} dias). Por favor, regularize.\\n\\nViacao Pioneira', 'cordial'),
        ('2a cobranca - 15 dias',        'email', 15,  'IMPORTANTE: titulo {{numero_documento}} vencido ha 15 dias',
         'Prezado(a) {{nome_cliente}},\\n\\nNotamos que o titulo {{numero_documento}} ({{valor}}) esta vencido ha 15 dias. Pedimos regularizacao em ate 5 dias uteis pra evitar medidas adicionais.\\n\\nViacao Pioneira', 'formal'),
        ('Aviso pre-negativacao - 30 dias', 'email', 30, 'ULTIMA NOTIFICACAO antes de protesto/negativacao - {{numero_documento}}',
         '{{nome_cliente}},\\n\\nO titulo {{numero_documento}} ({{valor}}) esta vencido ha 30 dias. Nao havendo regularizacao em ate 5 dias uteis, sera encaminhado para protesto e negativacao no SERASA.\\n\\nViacao Pioneira', 'severo')
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS finance.regua_cobranca_envios`);
    await queryRunner.query(`DROP TABLE IF EXISTS finance.regua_cobranca_templates`);
  }
}
