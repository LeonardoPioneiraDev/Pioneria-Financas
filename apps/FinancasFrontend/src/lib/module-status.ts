/**
 * Catalogo central do status de cada modulo do sistema financeiro.
 *
 * Usado em:
 *   - Sidebar (badge colorido ao lado de cada item)
 *   - Pagina placeholder (mostra lista de "o que vai ter")
 *   - Banner nas paginas prontas (apontando o que ainda nao foi implementado)
 *
 * A regra "estado e codigo, nao memoria" vale aqui — quando uma feature ficar
 * pronta, atualizar este arquivo. Assim a UI mostra a verdade automaticamente.
 */

export type ModuloStatus =
  | 'pronto'        // todas funcionalidades principais estao funcionando
  | 'parcial'       // backbone funcionando, mas faltam features importantes
  | 'planejado';    // ainda nao construido (placeholder)

export interface ModuloInfo {
  href: string;
  nome: string;
  status: ModuloStatus;
  /** Fase do roadmap (ver Leia/06_ROADMAP.md). */
  fase: string;
  /** Descricao 1 linha sobre o que o modulo faz / vai fazer. */
  descricao: string;
  /** Lista bullet de funcionalidades — checada quando implementada. */
  features: ReadonlyArray<{ ok: boolean; texto: string }>;
  /** Fontes de dados que alimentam o modulo (Globus, BCB, horarios, manual…). */
  fontesDados?: ReadonlyArray<string>;
  /** Perguntas chave que o financeiro precisa responder pra priorizarmos. */
  perguntasFinanceiro?: ReadonlyArray<string>;
  /** Estimativa rapida de esforco (apenas referencia). */
  estimativaSemanas?: number;
}

export const MODULOS: Record<string, ModuloInfo> = {
  '/dashboard': {
    href: '/dashboard',
    nome: 'Dashboard',
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Visão geral consolidada do sistema.',
    features: [
      { ok: true, texto: 'KPIs financeiros principais' },
      { ok: true, texto: 'Atalhos pros módulos' },
      { ok: false, texto: 'Widgets customizáveis por usuário' },
      { ok: false, texto: 'Alertas configuráveis' },
    ],
  },

  '/contas-pagar': {
    href: '/contas-pagar',
    nome: 'Contas a Pagar',
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Carteira de CP do Globus com origem detectada (folha, NF, guia, manual).',
    features: [
      { ok: true, texto: 'Sync automático do Globus (CPGDOCTO + CPGITDOC + BGM_FORNECEDOR)' },
      { ok: true, texto: 'Detecção de origem (folha, NF, guia, manual)' },
      { ok: true, texto: 'Filtros (período, fornecedor, status, valor)' },
      { ok: true, texto: 'Detalhe do título com workflow inferido + trilha de auditoria Globus' },
      { ok: true, texto: 'Detecção de cancelamento no Globus' },
      { ok: true, texto: 'Aprovação CFO digital com assinatura (interna, sem ICP — em validação)' },
      { ok: true, texto: 'Geração de remessa bancária (CNAB 240 FEBRABAN — em validação)' },
      { ok: true, texto: 'Conferência automática de retenções tributárias (heurística Lucro Real — em validação)' },
    ],
    fontesDados: ['Globus CPGDOCTO', 'Globus CPGITDOC', 'Globus BGM_FORNECEDOR'],
  },

  '/contas-receber': {
    href: '/contas-receber',
    nome: 'Contas a Receber',
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Carteira de CR do Globus (CRCDOCTO) com cobrança eletrônica + régua + boleto/PIX + SERASA.',
    features: [
      { ok: true, texto: 'Sync automático do Globus (CRCDOCTO + CRCITDOC + BGM_CLIENTE)' },
      { ok: true, texto: 'Filtros e listagem' },
      { ok: true, texto: 'Status de cobrança eletrônica' },
      { ok: true, texto: 'Régua de cobrança automática (templates + envios — em validação)' },
      { ok: true, texto: 'Geração de boleto / PIX (MOCK — em validação, depende confirmar bancos)' },
      { ok: true, texto: 'Integração SERASA (MOCK — em validação, depende contrato SERASA)' },
    ],
    fontesDados: ['Globus CRCDOCTO', 'Globus CRCITDOC', 'Globus BGM_CLIENTE'],
  },

  '/recebiveis-gdf': {
    href: '/recebiveis-gdf',
    nome: 'Recebíveis GDF',
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Movimento Resgatado BRB Mobilidade — receita técnica vs repasse efetivo.',
    features: [
      { ok: true, texto: 'Integração com API horarios.vpioneira.com.br' },
      { ok: true, texto: 'Sync incremental dos relatórios BRB' },
      { ok: true, texto: 'Matriz (data transporte × data resgate)' },
      { ok: true, texto: 'Composição por família (CIDADAO, VT, EMV, gratuidades)' },
      { ok: true, texto: 'Aging (0-2d, 3-5d, 6-10d, 10+d)' },
      { ok: true, texto: 'Cruzamento com extrato bancário (BCOMOVTO) — glosa real' },
      { ok: true, texto: 'Alerta de divergência receita técnica vs repasse' },
      { ok: true, texto: 'Filtro por família e métrica (valor vs créditos)' },
    ],
    fontesDados: ['horarios.vpioneira.com.br', 'Globus BCOMOVTO (CODHISTOBCO=908)'],
    perguntasFinanceiro: [
      'A heurística (CODHISTOBCO=908 + conta 70-51-108) ainda vale ou mudou?',
      'Qual o threshold de glosa aceitável — 1%? 2%? 5%?',
    ],
  },

  '/conciliacao': {
    href: '/conciliacao',
    nome: 'Conciliação Bancária',
    status: 'parcial',
    fase: 'Em construção',
    descricao: 'Auto-match entre extrato bancário (BCOMOVTO) e títulos (CP/CR).',
    features: [
      { ok: true, texto: 'Sync de movimento bancário (BCOMOVTO já sincronizado)' },
      { ok: true, texto: 'Match automático extrato × título (data ±3d + valor exato)' },
      { ok: true, texto: 'Dashboard de conciliação (sugeridas, confirmadas, sem par)' },
      { ok: true, texto: 'Confirmar / rejeitar sugestão' },
      { ok: false, texto: 'Importação CNAB de retorno' },
      { ok: false, texto: 'Conciliação manual com sugestões refinadas' },
      { ok: false, texto: 'Detecção de divergências (juros, taxas, glosa)' },
      { ok: false, texto: 'Saldo conciliado por conta bancária' },
    ],
    fontesDados: ['Globus BCOMOVTO', 'Globus BCOCONTA', 'finance.contas_pagar', 'finance.contas_receber'],
    perguntasFinanceiro: [
      'Quanto tempo demora a conciliação hoje?',
      'Qual o critério atual pra "match" entre extrato e título?',
      'Vocês já têm acesso aos retornos CNAB dos bancos?',
    ],
    estimativaSemanas: 4,
  },

  '/tributos': {
    href: '/tributos',
    nome: 'Tributos',
    status: 'parcial',
    fase: 'Fase 2 (Tributário e Folha)',
    descricao: 'Apuração de PIS, COFINS, ISS, INSS, IRRF e geração de guias.',
    features: [
      { ok: true, texto: 'Conferência de retenções na fonte — PIS/COFINS/CSLL/IRRF (heurística Lucro Real, base líquido+retenções, ciente do Simples Nacional)' },
      { ok: true, texto: 'Calendário tributário (referência) — prazos federais padrão + cruzamento com as guias do mês no banco' },
      { ok: true, texto: 'Transparência das fontes — mostra, por dado, se está preenchido no Globus, vazio, ou feito fora dele (o sistema reflete o Globus, não inventa)' },
      { ok: false, texto: 'INSS / ISS calculados (hoje informativos — Globus registra zero; depende de política do financeiro)' },
      { ok: false, texto: 'Apuração mensal de PIS/COFINS (própria) — depende Q1-Q3' },
      { ok: false, texto: 'ISS por município (cálculo) — depende tabela de alíquotas + política de retenção' },
      { ok: false, texto: 'Geração de DARF/GPS — depende Q1-Q3' },
      { ok: false, texto: 'Cruzamento com SPED Fiscal — depende Q1-Q3' },
    ],
    fontesDados: ['Globus CPGDOCTO (retenções)', 'Globus BGM_FORNECEDOR (regime/município)', 'Globus CTB_ECF_* (apuração/SPED)', 'Manual'],
    perguntasFinanceiro: [
      'Quem hoje apura PIS/COFINS na empresa?',
      'Vocês usam algum sistema externo de gestão tributária?',
      'Quais tributos são prioridade — recorrentes (mensais) ou pontuais?',
    ],
    estimativaSemanas: 6,
  },

  '/depreciacao': {
    href: '/depreciacao',
    nome: 'Depreciação',
    status: 'planejado',
    fase: 'Fase 3 (Ativo Imobilizado)',
    descricao: 'Depreciação contábil da frota (ônibus) e outros ativos.',
    features: [
      { ok: false, texto: 'Cadastro de ativos (Globus FRT_CADVEICULOS + outros)' },
      { ok: false, texto: 'Cálculo de depreciação linear automático' },
      { ok: false, texto: 'Valor residual e vida útil por categoria' },
      { ok: false, texto: 'Lançamento contábil mensal' },
      { ok: false, texto: 'Baixa de ativos (venda, sucata)' },
      { ok: false, texto: 'Relatório por garagem / centro de custo' },
    ],
    fontesDados: ['Globus FRT_CADVEICULOS', 'Globus FRT_COMPRAVEIC', 'Globus CTBLANCA'],
    perguntasFinanceiro: [
      'Hoje a depreciação é feita em qual sistema/planilha?',
      'Qual a vida útil que vocês usam para ônibus (5, 7, 10 anos)?',
      'Existem ativos não-frota relevantes a depreciar?',
    ],
    estimativaSemanas: 3,
  },

  '/fluxo-caixa': {
    href: '/fluxo-caixa',
    nome: 'Fluxo de Caixa',
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'O que vai entrar (CR) × o que vai sair (CP) nos próximos dias. Sem saldo bancário.',
    features: [
      { ok: true, texto: 'A receber Nd (CR vencendo, ajustado por inadimplência)' },
      { ok: true, texto: 'A pagar Nd (CP vencendo)' },
      { ok: true, texto: 'Projeção dia-a-dia 7/30/60/90 dias' },
      { ok: true, texto: 'Alerta de gap (delta acumulado fica negativo)' },
      { ok: true, texto: 'Inadimplência histórica calculada dos últimos 6 meses' },
      { ok: true, texto: 'Listagem detalhada CR + CP (abas "A pagar" / "A receber")' },
      { ok: false, texto: 'Cenários (otimista/realista/pessimista) — sprint 04 candidata' },
    ],
    fontesDados: ['Globus CRCDOCTO', 'Globus CPGDOCTO'],
    perguntasFinanceiro: [
      'A inadimplência calculada bate com o que vocês veem na prática?',
      'O horizonte default (30d) atende ou prefere outro?',
      'Faz sentido voltar a tentar saldo bancário (Open Finance) ou foca em outras integrações?',
    ],
  },

  '/orcamento': {
    href: '/orcamento',
    nome: 'Orçamento',
    status: 'planejado',
    fase: 'Fase 4 (Planejamento)',
    descricao: 'Orçamento anual com acompanhamento de realizado vs planejado.',
    features: [
      { ok: false, texto: 'Cadastro do orçamento anual por centro de custo' },
      { ok: false, texto: 'Importação Globus (CPG_CAD_ORCAMENTO)' },
      { ok: false, texto: 'Comparativo realizado vs orçado mensal' },
      { ok: false, texto: 'Sinalização de estouro (>110%)' },
      { ok: false, texto: 'Workflow de aprovação de revisão' },
      { ok: false, texto: 'Exportação para diretoria' },
    ],
    fontesDados: ['Globus CPG_CAD_ORCAMENTO', 'Globus CPG_CAD_ORCAMENTO_PREVISOES'],
    perguntasFinanceiro: [
      'Vocês fazem orçamento anual ou trimestral?',
      'Como acompanham realizado vs orçado hoje?',
      'Quantos centros de custo? Por garagem ou mais granular?',
    ],
    estimativaSemanas: 6,
  },

  '/dre': {
    href: '/dre',
    nome: 'DRE',
    status: 'planejado',
    fase: 'Fase 4 (Planejamento)',
    descricao: 'Demonstração de Resultado do Exercício gerencial e contábil.',
    features: [
      { ok: false, texto: 'DRE contábil mensal (do plano de contas Globus)' },
      { ok: false, texto: 'DRE gerencial (visão de resultado operacional)' },
      { ok: false, texto: 'Comparativo mensal e YTD' },
      { ok: false, texto: 'Drill-down de cada linha até título' },
      { ok: false, texto: 'Exportação Excel/PDF' },
      { ok: false, texto: 'Visão por garagem (centro de custo)' },
    ],
    fontesDados: ['Globus CTBCDDRE', 'Globus CTBITDRE', 'Globus CTBLANCA', 'Globus CTBITLNC'],
    perguntasFinanceiro: [
      'A estrutura de DRE atual do Globus atende ou precisa ser refeita?',
      'Quem é o público — diretoria, conselho, acionista, contadora externa?',
      'Precisa visão gerencial diferente da contábil?',
    ],
    estimativaSemanas: 4,
  },

  '/painel-cfo': {
    href: '/painel-cfo',
    nome: 'Painel CFO',
    status: 'planejado',
    fase: 'Fase 5 (Executivo)',
    descricao: 'Dashboard executivo com KPIs estratégicos e indicadores de saúde financeira.',
    features: [
      { ok: false, texto: 'KPIs em tempo real (DSO, DPO, capital de giro)' },
      { ok: false, texto: 'Saúde do caixa (runway, burn rate)' },
      { ok: false, texto: 'Comparativo YoY e MoM' },
      { ok: false, texto: 'Alertas estratégicos' },
      { ok: false, texto: 'Vista por garagem / consolidada' },
      { ok: false, texto: 'Exportação executive briefing' },
    ],
    fontesDados: ['Todos os módulos consolidados'],
    perguntasFinanceiro: [
      'Quais 5-7 indicadores você acompanha toda semana?',
      'Qual o ritual de tomada de decisão? (reunião semanal, mensal)',
      'Você precisa explicar isso pra acionistas/conselho?',
    ],
    estimativaSemanas: 4,
  },

  '/auditoria': {
    href: '/auditoria',
    nome: 'Auditoria',
    status: 'planejado',
    fase: 'Fase 5 (Compliance)',
    descricao: 'Trilhas de auditoria de acesso, alterações e conciliações.',
    features: [
      { ok: true, texto: 'Tabela audit.acesso_dados (já gravando)' },
      { ok: true, texto: 'Tabela audit.user_activity_logs (já gravando)' },
      { ok: false, texto: 'UI de consulta de logs com filtros' },
      { ok: false, texto: 'Trilha de alteração por registro (quem mudou o quê)' },
      { ok: false, texto: 'Termo de aceite LGPD por acesso a dado sensível' },
      { ok: false, texto: 'Exportação para auditoria externa' },
    ],
    fontesDados: ['audit.acesso_dados', 'audit.user_activity_logs'],
    perguntasFinanceiro: [
      'Existe auditoria externa anual? Qual o escopo?',
      'Hoje vocês têm trilha de quem alterou cada lançamento?',
      'Compliance LGPD está endereçado?',
    ],
    estimativaSemanas: 3,
  },

  '/folha': {
    href: '/folha',
    nome: 'Folha (CPG)',
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Folha como contas a pagar — visão do fluxo financeiro da folha.',
    features: [
      { ok: true, texto: 'Identificação automática de títulos de folha' },
      { ok: true, texto: 'Classificação por tipo (salário, 13º, férias, INSS, FGTS)' },
      { ok: true, texto: 'Agregação por competência' },
      { ok: true, texto: 'Retenções detalhadas' },
      { ok: false, texto: 'Geração de remessa bancária dos pagamentos' },
    ],
    fontesDados: ['Globus CPGDOCTO (origem=folha)'],
  },

  '/folha-detalhe': {
    href: '/folha-detalhe',
    nome: 'Folha por Setor',
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Decomposição operacional da folha por setor/garagem/função.',
    features: [
      { ok: true, texto: 'Sync FLP_FICHAEVENTOS (~127k lançamentos/mês)' },
      { ok: true, texto: 'Proventos, descontos, líquido por setor' },
      { ok: true, texto: 'FGTS, INSS, IRRF, VT, VA agregados' },
      { ok: true, texto: 'Drill-down funcionário → contracheque' },
      { ok: true, texto: 'Filtro por tipo de folha (mensal, adiantamento, rescisão)' },
      { ok: false, texto: 'Comparativo competências (mês anterior)' },
      { ok: false, texto: 'Provisão de férias e 13º' },
      { ok: false, texto: 'Custo total por funcionário (com encargos)' },
    ],
    fontesDados: ['Globus FLP_FICHAEVENTOS', 'Globus FLP_EVENTOS', 'Globus VW_FUNCIONARIOS'],
  },

  '/admin/usuarios': {
    href: '/admin/usuarios',
    nome: 'Usuários',
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Gestão de usuários, papéis e permissões.',
    features: [
      { ok: true, texto: 'Listagem com filtros' },
      { ok: true, texto: 'Criar/editar usuário' },
      { ok: true, texto: 'Definir papel (admin, CFO, controller, analistas)' },
      { ok: true, texto: 'Resetar senha' },
      { ok: false, texto: 'Integração SSO Keycloak (Fase 6)' },
      { ok: false, texto: 'Permissão granular por módulo' },
    ],
  },

  '/admin/parametros': {
    href: '/admin/parametros',
    nome: 'Parâmetros',
    status: 'planejado',
    fase: 'Fase 6 (Configuração)',
    descricao: 'Parâmetros gerais do sistema (empresa, contas, configurações).',
    features: [
      { ok: false, texto: 'Configuração de empresa/filial' },
      { ok: false, texto: 'Calendário de feriados' },
      { ok: false, texto: 'Tarifas SEMOB (cadastro e histórico)' },
      { ok: false, texto: 'Configurações de e-mail/notificação' },
      { ok: false, texto: 'Logos e branding' },
    ],
    estimativaSemanas: 2,
  },

  '/admin/integracoes': {
    href: '/admin/integracoes',
    nome: 'Integrações',
    status: 'parcial',
    fase: 'Em construção',
    descricao: 'Monitor de integrações com Globus, BRB e outros sistemas.',
    features: [
      { ok: true, texto: 'Backend pronto: sync_jobs, sync_errors (DLQ), oracle_query_logs' },
      { ok: true, texto: 'Endpoints /api/admin/integracoes/* (dashboard, erros, drilldown)' },
      { ok: false, texto: 'UI: dashboard com últimos jobs' },
      { ok: false, texto: 'UI: lista da DLQ com botão "reprocessar"' },
      { ok: false, texto: 'UI: telemetria Oracle (queries lentas, erros)' },
      { ok: false, texto: 'UI: drill-down de 1 registro stage → finance' },
    ],
    fontesDados: ['integration.sync_jobs', 'integration.sync_errors', 'integration.oracle_query_logs'],
    estimativaSemanas: 1,
  },
};

export function statusModulo(href: string): ModuloInfo | undefined {
  return MODULOS[href];
}

/** Cores Tailwind por status. */
export const STATUS_COR: Record<ModuloStatus, { dot: string; text: string; bg: string; border: string; label: string }> = {
  pronto: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-900/40',
    label: 'Em produção',
  },
  parcial: {
    dot: 'bg-amber-500',
    text: 'text-amber-700 dark:text-amber-300',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-900/40',
    label: 'Em construção',
  },
  planejado: {
    dot: 'bg-gray-400 dark:bg-gray-600',
    text: 'text-gray-500 dark:text-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-900/30',
    border: 'border-gray-200 dark:border-gray-700',
    label: 'Planejado',
  },
};
