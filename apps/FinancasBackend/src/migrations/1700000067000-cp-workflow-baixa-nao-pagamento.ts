import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Renomeia a 4a etapa do template "Conta a Pagar - Padrao" de
 * "Pagamento efetivo" para "Baixa no Globus".
 *
 * MOTIVO (pedido do financeiro, ago/2026): o usuario exibido nessa etapa vem do
 * evento com STATUSDOCTOCPG='B' em CPGDOCTO_HISTORICO_NEGOCIACOES, que registra
 * QUEM LANCOU A BAIXA NO ERP. O Globus nao tem nenhuma coluna com o autorizador
 * do pagamento no banco. Chamar a etapa de "Pagamento efetivo" fazia a tela ler
 * como "FULANO pagou R$ X" — atribuindo a auxiliares do departamento financeiro
 * um ato que so o chefe do departamento pratica. 70% das baixas da base estao
 * sob um unico login, entao o rotulo errado tinha alcance amplo.
 *
 * Tambem corrige a descricao, que citava "QUITADO=S" enquanto a propria tela
 * avisa que o QUITADO fica "N" em ~38% dos pagamentos (contradicao na mesma
 * tela) e que nao e usado para definir o status.
 *
 * Idempotente: UPDATE por nome do template.
 */
export class CpWorkflowBaixaNaoPagamento1700000067000 implements MigrationInterface {
  name = 'CpWorkflowBaixaNaoPagamento1700000067000';

  private static readonly ETAPAS_NOVAS = JSON.stringify([
    {
      ordem: 1,
      chave: 'inclusao',
      nome: 'Inclusao no Globus',
      descricao: 'Titulo cadastrado no CPG (manual ou via integracao de NF).',
      papelResponsavel: 'cp_analista',
      icone: 'Inbox',
      cor: 'blue',
    },
    {
      ordem: 2,
      chave: 'liberacao_pagto',
      nome: 'Liberacao de pagamento',
      descricao: 'APROVE ME: titulo analisado e liberado para pagamento.',
      papelResponsavel: 'controller',
      icone: 'ShieldCheck',
      cor: 'purple',
    },
    {
      ordem: 3,
      chave: 'assinatura',
      nome: 'Assinatura eletronica',
      descricao: 'APROVE ME: assinatura final autorizando a baixa.',
      papelResponsavel: 'cfo',
      icone: 'PenTool',
      cor: 'pioneira',
    },
    {
      ordem: 4,
      chave: 'pagamento',
      nome: 'Baixa no Globus',
      descricao:
        'Registro da baixa no ERP — quem lancou o titulo como pago no sistema. NAO identifica quem autorizou o pagamento no banco: o Globus nao guarda esse dado.',
      papelResponsavel: 'cp_analista',
      icone: 'Banknote',
      cor: 'emerald',
    },
  ]);

  private static readonly ETAPAS_ANTERIORES = JSON.stringify([
    {
      ordem: 1,
      chave: 'inclusao',
      nome: 'Inclusao no Globus',
      descricao: 'Titulo cadastrado no CPG (manual ou via integracao de NF).',
      papelResponsavel: 'cp_analista',
      icone: 'Inbox',
      cor: 'blue',
    },
    {
      ordem: 2,
      chave: 'liberacao_pagto',
      nome: 'Liberacao de pagamento',
      descricao: 'APROVE ME: titulo liberado para pagamento (analisado e aprovado).',
      papelResponsavel: 'controller',
      icone: 'ShieldCheck',
      cor: 'purple',
    },
    {
      ordem: 3,
      chave: 'assinatura',
      nome: 'Assinatura eletronica',
      descricao: 'APROVE ME: assinatura final autorizando a baixa.',
      papelResponsavel: 'cfo',
      icone: 'PenTool',
      cor: 'pioneira',
    },
    {
      ordem: 4,
      chave: 'pagamento',
      nome: 'Pagamento efetivo',
      descricao: 'Baixa bancaria registrada (PAGAMENTOCPG + QUITADO=S).',
      papelResponsavel: 'cp_analista',
      icone: 'Banknote',
      cor: 'emerald',
    },
  ]);

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE finance.workflow_template
         SET etapas = $1::jsonb,
             descricao = 'Marcos reais rastreados pelo Globus (CPGDOCTO). Sem etapas inferidas. A ultima etapa e a baixa no ERP, nao a autorizacao bancaria.',
             atualizado_em = NOW()
       WHERE documento_tipo = 'conta_pagar'
         AND nome = 'Conta a Pagar - Padrao'
    `,
      [CpWorkflowBaixaNaoPagamento1700000067000.ETAPAS_NOVAS],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE finance.workflow_template
         SET etapas = $1::jsonb,
             descricao = 'Marcos reais rastreados pelo Globus (CPGDOCTO). Sem etapas inferidas.',
             atualizado_em = NOW()
       WHERE documento_tipo = 'conta_pagar'
         AND nome = 'Conta a Pagar - Padrao'
    `,
      [CpWorkflowBaixaNaoPagamento1700000067000.ETAPAS_ANTERIORES],
    );
  }
}
