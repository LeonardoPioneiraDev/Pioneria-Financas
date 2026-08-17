/**
 * Seed dos templates padrao de workflow:
 *   - Conta a Pagar (CP)
 *   - Conta a Receber (CR)
 *   - Nota Fiscal de Entrada (NFE)
 *
 * Idempotente: roda quantas vezes quiser; se ja existir um template com (nome,
 * documentoTipo), nao recria.
 *
 * Uso:
 *   pnpm --filter @pioneira/financas-backend seed:workflow
 */
import 'reflect-metadata';
import { AppDataSource } from '@/data-source.js';
import { WorkflowTemplate, type EtapaTemplate } from '@/entities/workflow-template.entity.js';

interface SeedTemplate {
  nome: string;
  documentoTipo: string;
  descricao: string;
  etapas: EtapaTemplate[];
}

const TEMPLATES: SeedTemplate[] = [
  {
    nome: 'Conta a Pagar - Padrao',
    documentoTipo: 'conta_pagar',
    descricao:
      'Marcos reais rastreados pelo Globus (CPGDOCTO). Sem etapas inferidas. A ultima etapa e a baixa no ERP, nao a autorizacao bancaria.',
    etapas: [
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
    ],
  },
  {
    nome: 'Conta a Receber - Padrao',
    documentoTipo: 'conta_receber',
    descricao: 'Fluxo padrao de cobranca e recebimento.',
    etapas: [
      {
        ordem: 1,
        chave: 'emitido',
        nome: 'Documento emitido',
        descricao: 'Titulo gerado no Globus ou manual.',
        papelResponsavel: 'cr_analista',
        icone: 'FileText',
        cor: 'blue',
      },
      {
        ordem: 2,
        chave: 'enviado_cliente',
        nome: 'Enviado ao cliente',
        descricao: 'Boleto/nota encaminhado ao cliente.',
        papelResponsavel: 'cr_analista',
        icone: 'Send',
        cor: 'amber',
      },
      {
        ordem: 3,
        chave: 'em_cobranca',
        nome: 'Em cobranca',
        descricao: 'Acompanhamento ate o vencimento.',
        papelResponsavel: 'cr_analista',
        icone: 'Phone',
        cor: 'amber',
      },
      {
        ordem: 4,
        chave: 'recebido',
        nome: 'Valor recebido',
        descricao: 'Pagamento confirmado.',
        papelResponsavel: 'cr_analista',
        icone: 'Banknote',
        cor: 'emerald',
      },
      {
        ordem: 5,
        chave: 'conciliado',
        nome: 'Conciliado',
        descricao: 'Conferido no extrato bancario.',
        papelResponsavel: 'cr_analista',
        icone: 'CheckCircle2',
        cor: 'emerald',
      },
    ],
  },
  {
    nome: 'Nota Fiscal de Entrada - Padrao',
    documentoTipo: 'nota_fiscal_entrada',
    descricao: 'Fluxo padrao para conferencia de NF de entrada (insumos/servicos).',
    etapas: [
      {
        ordem: 1,
        chave: 'recebido',
        nome: 'NF recebida',
        descricao: 'Nota fiscal entrou no sistema.',
        papelResponsavel: 'cp_analista',
        icone: 'Inbox',
        cor: 'blue',
      },
      {
        ordem: 2,
        chave: 'conferencia_fiscal',
        nome: 'Conferencia fiscal',
        descricao: 'Validar dados fiscais (CFOP, CST, valores).',
        papelResponsavel: 'cp_analista',
        exigeComentario: false,
        icone: 'FileCheck',
        cor: 'amber',
      },
      {
        ordem: 3,
        chave: 'lancamento',
        nome: 'Lancamento contabil',
        descricao: 'Lancar no plano de contas.',
        papelResponsavel: 'controller',
        icone: 'BookOpen',
        cor: 'purple',
      },
      {
        ordem: 4,
        chave: 'aprovacao_pagamento',
        nome: 'Aprovacao para pagamento',
        descricao: 'Liberacao para geracao da conta a pagar.',
        papelResponsavel: 'controller',
        icone: 'ShieldCheck',
        cor: 'purple',
      },
      {
        ordem: 5,
        chave: 'arquivado',
        nome: 'Arquivado',
        descricao: 'NF lancada e arquivada.',
        papelResponsavel: 'cp_analista',
        icone: 'Archive',
        cor: 'emerald',
      },
    ],
  },
];

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(WorkflowTemplate);

  for (const seed of TEMPLATES) {
    const existente = await repo.findOne({
      where: { nome: seed.nome, documentoTipo: seed.documentoTipo },
    });
    if (existente) {
      console.log(`[skip] ${seed.documentoTipo} / ${seed.nome} ja existe (id=${existente.id})`);
      continue;
    }
    const novo = repo.create({
      nome: seed.nome,
      documentoTipo: seed.documentoTipo,
      descricao: seed.descricao,
      ativo: true,
      etapas: seed.etapas,
    });
    await repo.save(novo);
    console.log(`[ok]   ${seed.documentoTipo} / ${seed.nome} criado (id=${novo.id})`);
  }

  await AppDataSource.destroy();
  console.log('Seed de workflow concluido.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
