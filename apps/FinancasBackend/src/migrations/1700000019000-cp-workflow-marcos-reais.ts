import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Refatora o template "Conta a Pagar - Padrao" para refletir apenas os 4 marcos
 * REAIS rastreados pelo Globus (CPGDOCTO):
 *
 *   1. inclusao        ← USUARIO_INCLUSAO + DATA_INCLUSAO
 *   2. liberacao_pagto ← USUARIO_LIB_PAGTO_APROVE_ME + DATALIBERACAOPGTO
 *   3. assinatura      ← USUARIO_ASS_ELETRON_APROVE_ME
 *   4. pagamento       ← PAGAMENTOCPG + QUITADODOCTOCPG='S'
 *
 * Anterior: 6 etapas (4 delas inferidas pelo estado, sem rastro real). User
 * pediu para mostrar apenas marcos com rastro. Cancelado vira estado especial.
 *
 * Idempotente: usa WHERE para atualizar so o template existente.
 */
export class CpWorkflowMarcosReais1700000019000 implements MigrationInterface {
  name = 'CpWorkflowMarcosReais1700000019000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const novasEtapas = JSON.stringify([
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

    await queryRunner.query(
      `
      UPDATE finance.workflow_template
         SET etapas = $1::jsonb,
             descricao = 'Marcos reais rastreados pelo Globus (CPGDOCTO). Sem etapas inferidas.',
             atualizado_em = NOW()
       WHERE documento_tipo = 'conta_pagar'
         AND nome = 'Conta a Pagar - Padrao'
    `,
      [novasEtapas],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const etapasAnteriores = JSON.stringify([
      {
        ordem: 1,
        chave: 'recebido',
        nome: 'Documento recebido',
        descricao: 'Documento entrou no sistema (manual ou via Globus).',
        papelResponsavel: 'cp_analista',
        icone: 'Inbox',
        cor: 'blue',
      },
      {
        ordem: 2,
        chave: 'conferencia',
        nome: 'Em conferencia',
        descricao: 'Analista confere dados, valores e centro de custo.',
        papelResponsavel: 'cp_analista',
        icone: 'ClipboardCheck',
        cor: 'amber',
      },
      {
        ordem: 3,
        chave: 'aprovacao',
        nome: 'Aguardando aprovacao',
        descricao: 'Controller analisa e aprova o pagamento.',
        papelResponsavel: 'controller',
        icone: 'ShieldCheck',
        cor: 'purple',
      },
      {
        ordem: 4,
        chave: 'assinatura',
        nome: 'Assinatura CFO',
        descricao: 'CFO autoriza o pagamento.',
        papelResponsavel: 'cfo',
        icone: 'PenTool',
        cor: 'pioneira',
      },
      {
        ordem: 5,
        chave: 'pagamento',
        nome: 'Aguardando pagamento',
        descricao: 'Tesouraria executa o pagamento.',
        papelResponsavel: 'cp_analista',
        icone: 'Banknote',
        cor: 'emerald',
      },
      {
        ordem: 6,
        chave: 'conciliado',
        nome: 'Pago e conciliado',
        descricao: 'Pagamento conferido no extrato bancario.',
        papelResponsavel: 'cp_analista',
        icone: 'CheckCircle2',
        cor: 'emerald',
      },
    ]);

    await queryRunner.query(
      `
      UPDATE finance.workflow_template
         SET etapas = $1::jsonb,
             descricao = 'Fluxo padrao de aprovacao de contas a pagar.',
             atualizado_em = NOW()
       WHERE documento_tipo = 'conta_pagar'
         AND nome = 'Conta a Pagar - Padrao'
    `,
      [etapasAnteriores],
    );
  }
}
