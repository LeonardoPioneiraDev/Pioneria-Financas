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
  /**
   * O que a exploracao dos dados JA revelou — fatos OBSERVADOS (nao interpretacao).
   * Serve pra separar o que sabemos do que ainda e pergunta em aberto. Mostrado
   * como card proprio no placeholder. Regra do projeto: nao concluir em silencio.
   */
  achados?: ReadonlyArray<string>;
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
    nome: 'Recebíveis',
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Dinheiro que entrou no extrato bancário (BCOMOVTO/Globus), classificado por origem: repasse GDF, quitação de clientes (via conciliação) e outras fontes.',
    features: [
      { ok: true, texto: 'Créditos do extrato (banco_movto) por período e conta' },
      { ok: true, texto: 'Classificação por origem: GDF · Clientes · Outras (heurística — em validação)' },
      { ok: true, texto: 'Top fontes de "Outras" pelo histórico bancário' },
      { ok: true, texto: 'Atualização do extrato do Globus sob demanda' },
      { ok: false, texto: 'Visão de cobrança (títulos a receber CRCDOCTO) — preservada e desativada (reativável)' },
    ],
    fontesDados: ['Globus BCOMOVTO', 'Conciliação bancária', 'Globus BCOCONTA'],
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
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Espelho da conciliação do Globus: cada lançamento do extrato (BCOMOVTO) e o título que o Globus já vinculou (cod_movto_bco → CP). O sistema só mostra, não faz matching.',
    features: [
      { ok: true, texto: 'Lançamentos do banco (BCOMOVTO) com flag conciliado do Globus' },
      { ok: true, texto: 'Título a pagar vinculado pelo Globus (cod_movto_bco → CPGDOCTO)' },
      { ok: true, texto: 'Abas Identificados / Falta identificar + filtro por conta e busca' },
      { ok: true, texto: 'Contas bancárias com saldo e agregados' },
      { ok: false, texto: 'Vínculo de crédito → Conta a Receber (depende sincronizar CRCDOCTO.CODMOVTOBCO)' },
      { ok: false, texto: 'Importação CNAB de retorno' },
      { ok: false, texto: 'Motor de matching próprio (preservado/desativado — reativável)' },
    ],
    fontesDados: ['Globus BCOMOVTO', 'Globus BCOCONTA', 'finance.contas_pagar'],
    perguntasFinanceiro: [
      'A conciliação do Globus é confiável o bastante pra ser a fonte única aqui?',
      'Os créditos (recebimentos) também têm vínculo de movimento no Globus (CRCDOCTO)?',
    ],
    estimativaSemanas: 0,
  },

  '/tributos': {
    href: '/tributos',
    nome: 'Tributos',
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Retenções na fonte, tributos da folha e calendário/guias. Apuração própria, DARF/GPS e SPED são feitos fora do sistema (contador/fisco).',
    features: [
      { ok: true, texto: 'Conferência de retenções na fonte — PIS/COFINS/CSLL/IRRF (heurística Lucro Real, base = valor bruto da NF, ciente do Simples Nacional)' },
      { ok: true, texto: 'Tributos da folha — INSS, FGTS e IRRF reais da folha (FLP) por tipo de folha; INSS patronal real via GPS do Globus (FLP_GPS, com/sem desoneração), com fallback estimado' },
      { ok: true, texto: 'Calendário tributário (referência) — prazos federais padrão + cruzamento com as guias do mês no banco' },
      { ok: true, texto: 'Transparência das fontes — mostra, por dado, se está preenchido no Globus, vazio, ou feito fora dele (o sistema reflete o Globus, não inventa)' },
      // FORA DE ESCOPO (decisão jul/2026 — "todas as respostas do financeiro = não").
      // Não exibidos como pendência para não parecerem "a fazer" num módulo Em produção;
      // a explicação vive no card verde do roadmap + Leia/tributos-auditoria-inicial.md §11.
      // Reabrir (voltar como { ok: false }) se a política do financeiro mudar.
      // { ok: false, texto: 'INSS / ISS calculados sobre NF — fora de escopo: o Globus registra zero de verdade (dado, não bug); calcular geraria falso divergente' },
      // { ok: false, texto: 'Apuração própria de PIS/COFINS — fora de escopo: feita fora do sistema (contador); a ECF do Globus é anual/defasada' },
      // { ok: false, texto: 'ISS por município — fora de escopo: municipal, sem política de retenção definida pela Pioneira' },
      // { ok: false, texto: 'Geração de DARF/GPS — fora de escopo: recolhimento feito fora do sistema (contador/fisco)' },
      // { ok: false, texto: 'Cruzamento com SPED Fiscal — fora de escopo: sem fonte externa a integrar' },
    ],
    fontesDados: ['Globus CPGDOCTO (retenções)', 'Globus BGM_FORNECEDOR (regime/município)', 'Globus finance.ficha_evento + FLP_GPS (folha)', 'Globus origem=guia (calendário)'],
    achados: [
      'Decisão de escopo (jul/2026): as perguntas ao financeiro (quem apura, sistema externo, prioridade) ficaram sem resposta; a orientação foi tratar todas como "não".',
      'Com isso, apuração própria de PIS/COFINS, DARF/GPS, SPED e ISS por município ficam FORA do escopo deste sistema — são feitos fora (contador/fisco), não são pendência de desenvolvimento.',
      'O que depende do Globus já reflete o Globus automaticamente. Se a política mudar, o item correspondente é reaberto.',
    ],
  },

  '/depreciacao': {
    href: '/depreciacao',
    nome: 'Depreciação',
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Depreciação contábil lançada no Globus, por classe de ativo. O Globus não tem ativo fixo por bem — a depreciação é calculada em planilha e escriturada por classe; o sistema espelha o valor oficial.',
    features: [
      { ok: true, texto: 'Depreciação contábil por classe (CTBSALDO do Globus)' },
      { ok: true, texto: 'Despesa mensal de depreciação por classe de ativo' },
      { ok: true, texto: 'Base de ativos: bruto, direito de uso, depreciação acumulada e líquido' },
      { ok: true, texto: 'Evolução mensal da despesa (com ajuste de fechamento e meses não lançados explícitos)' },
      { ok: true, texto: 'Rastreabilidade: detalhe por classe com as contas do razão (débito/crédito) + "Fontes e método"' },
      // FORA DE ESCOPO (decisão jul/2026 — não priorizado; e "respostas do financeiro = não").
      // O razão (o que a tela lê) tem depreciação só por CLASSE. O Globus TEM cadastro de bens
      // vivo (ATFITEM ~2,5k bens, com valor/taxa/início/garagem/CC) mas NÃO roda a depreciação —
      // então B e por-garagem exigiriam o sistema CALCULAR a deprec por bem (linear c/ teto 100%,
      // reconciliando com o razão), o que rompe a premissa deste módulo ("espelha, não recalcula").
      // Não exibidos como pendência para não parecerem "a fazer" num módulo Em produção.
      // Reabrir (voltar como { ok: false }) se decidirem construir o módulo de patrimônio.
      // { ok: false, texto: 'Depreciação por bem/veículo (opção B) — fora de escopo: exige calcular por bem (ATFITEM), não só espelhar; não priorizado' },
      // { ok: false, texto: 'Relatório por garagem / centro de custo — fora de escopo: derivável só via opção B (cada bem tem garagem/CC no cadastro)' },
      // { ok: false, texto: 'Cadastro e baixa de ativos in-system (opção C) — fora de escopo: módulo de patrimônio próprio, não priorizado' },
    ],
    fontesDados: ['Globus CTBSALDO', 'Globus CTBCONTA'],
    achados: [
      'O razão contábil (o que a tela reflete) tem depreciação só por CLASSE — calculada em planilha pelo financeiro e lançada no Globus. O Globus NÃO roda a depreciação (rotina ATF vazia).',
      'O cadastro de bens existe e está vivo (ATFITEM, ~2,5 mil bens da empresa 4, com valor/taxa/início/garagem/centro de custo). Logo depreciação por veículo (opção B) e por garagem SÃO viáveis — mas exigiriam o sistema CALCULAR a deprec por bem (linear com teto de 100%, reconciliando com os ~R$39k/mês do razão), fugindo da premissa "espelha, não recalcula".',
      'Decisão (jul/2026): B, por-garagem e cadastro/baixa in-system (opção C) ficam FORA do escopo — não priorizados (SFN-55 no backlog). A frota própria já está quase toda depreciada; a arrendada não é depreciada no razão (custo = contraprestação 3.1.02.04/05). Reabrir se decidirem construir o patrimônio.',
    ],
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
    status: 'parcial',
    fase: 'Fase 4 (Planejamento)',
    descricao: 'Orçamento com acompanhamento de realizado vs planejado. Orçado sugerido (base técnica projetada do realizado) e baseline histórico do Globus já no ar; o orçado OFICIAL e a comparação dependem do financeiro validar o eixo.',
    features: [
      { ok: true, texto: 'Orçado sugerido (base técnica) — média mensal do realizado por setor nos últimos 12 meses (Contas a Pagar), estado projetado, para o financeiro ajustar' },
      { ok: true, texto: 'Baseline histórico do Globus (CPGORCPREVISOES, 2018–2020) — orçado por ano e centro de custo, como referência e isca pro financeiro' },
      { ok: false, texto: 'Cadastro / importação / aceite do orçado OFICIAL (CSV, tela ou aceitar a base técnica) — ⏳ aguardando eixo e formato do financeiro' },
      { ok: false, texto: 'Comparativo realizado vs orçado mensal (realizado já disponível no Contas a Pagar)' },
      { ok: false, texto: 'Sinalização de estouro (>110%)' },
      { ok: false, texto: 'Workflow de aprovação de revisão' },
      { ok: false, texto: 'Exportação para diretoria' },
    ],
    fontesDados: [
      'finance.contas_pagar (realizado por centro de custo — pronto)',
      'Orçado: a definir (planilha do financeiro / CSV / tela)',
      'Globus CPGORCPREVISOES (histórico até 2020 — referência)',
    ],
    achados: [
      'O realizado por centro de custo já está no sistema (Contas a Pagar, via CODCUSTOFIN) — o comparativo reusa isso.',
      'No Globus, a tabela que a documentação apontava (CPG_CAD_ORCAMENTO) está vazia; o orçamento ficava em CPGORCPREVISOES.',
      'Nessa tabela há orçamento da Pioneira lançado até 2020 (2018: R$ 509M · 2019: R$ 585M · 2020: R$ 41M, parou em maio). De 2021 em diante não há lançamentos — o motivo ainda não sabemos.',
      'Quando existia, o orçado do Globus era pouco detalhado (praticamente uma unidade só + linhas sem centro de custo) e diário — mais parecido com previsão de caixa do que orçamento anual por conta.',
    ],
    perguntasFinanceiro: [
      'Vocês fazem orçamento hoje? Anual ou trimestral? Onde ele vive (planilha, sistema)?',
      'O orçamento que existe no Globus até 2020 foi descontinuado, virou planejamento plurianual, ou migrou pra outro lugar?',
      'Qual o eixo do orçamento de vocês: por unidade/garagem, por tipo de despesa (conta contábil) ou por centro de custo?',
      'Podem compartilhar a planilha atual? O formato dela é o que o sistema vai espelhar.',
    ],
    estimativaSemanas: 6,
  },

  '/dre': {
    href: '/dre',
    nome: 'DRE',
    status: 'planejado',
    fase: 'Fase 4 (Planejamento)',
    descricao: 'Demonstração de Resultado do Exercício, contábil e gerencial. O dado de base (razão contábil do Globus) já está no sistema — módulo tecnicamente viável; falta definir com o financeiro o desenho das linhas e a visão gerencial.',
    features: [
      { ok: false, texto: 'DRE contábil mensal (do razão contábil do Globus — dado disponível)' },
      { ok: false, texto: 'DRE gerencial (visão de resultado operacional)' },
      { ok: false, texto: 'Comparativo mensal e YTD' },
      { ok: false, texto: 'Drill-down de cada linha até o título/lançamento' },
      { ok: false, texto: 'Exportação Excel/PDF' },
      { ok: false, texto: 'Visão por garagem (centro de custo)' },
    ],
    fontesDados: [
      'Globus CTBSALDO (razão — saldo mensal por conta, já sincronizado na Depreciação)',
      'Globus CTBCDDRE + CTBITDRE (estrutura da DRE — a confirmar se está preenchida)',
      'Globus CTBLANCA + CTBITLNC (lançamentos, para o drill-down)',
      'finance.contas_pagar (realizado por centro de custo — pronto)',
    ],
    achados: [
      'O razão contábil do Globus (CTBSALDO/CTBLANCA/CTBITLNC) está populado e já é lido pelo sistema — usamos ele no módulo Depreciação.',
      'Uma DRE contábil é calculável hoje: basta agrupar as contas de resultado (classe 3 = despesa, 4 = receita) por linha e somar o saldo mensal.',
      'O Globus tem tabelas de estrutura de DRE (CTBCDDRE/CTBITDRE) que, se preenchidas, dão o desenho oficial das linhas — a confirmar se a Pioneira as usa.',
      'O módulo Depreciação já sincroniza o CTBSALDO (subconjunto); a DRE estende o mesmo pipeline para as contas de resultado. Reuso alto.',
    ],
    perguntasFinanceiro: [
      'A estrutura de DRE atual do Globus atende, ou vocês montam a DRE por fora (planilha/contadora)?',
      'Quem é o público — diretoria, conselho, acionista, contadora externa? (define detalhe e formato do export)',
      'Precisa de visão gerencial diferente da contábil? Se sim, quais reagrupamentos (ex.: separar receita técnica de repasse GDF, custo por km)?',
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
    nome: 'Encargos & Benefícios',
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Custo da folha do RH (FLP): encargos (INSS/FGTS/IRRF), benefícios (ticket, cesta, seguro) e descontos (adiantamento, consignados, sindicato, pensão) — cada número rastreável à verba. Mais o repasse de pensão que a folha gera no Contas a Pagar.',
    features: [
      { ok: true, texto: 'Encargos e benefícios agregados da folha real (finance.ficha_evento), por evento' },
      { ok: true, texto: 'Totais autoritativos (proventos 318 / descontos 319 / líquido) + rastreio por verba' },
      { ok: true, texto: 'Filtro por tipo de folha (mensal, adiantamento, 13º, férias, rescisão)' },
      { ok: true, texto: 'Repasse de pensão no CP com aging (vencido / a vencer / pago)' },
      { ok: false, texto: 'INSS patronal (guia GPS) — hoje recolhido fora da folha, ver Tributos' },
      { ok: false, texto: 'Geração de remessa bancária dos pagamentos' },
    ],
    fontesDados: ['Globus FLP_FICHAEVENTOS', 'Globus FLP_EVENTOS', 'Globus CPGDOCTO (pensão/origem=folha)'],
  },

  '/folha-detalhe': {
    href: '/folha-detalhe',
    nome: 'Custo por Setor',
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Decomposição operacional da folha por setor/garagem/função.',
    features: [
      { ok: true, texto: 'Sync FLP_FICHAEVENTOS (~127k lançamentos/mês)' },
      { ok: true, texto: 'Proventos, descontos, líquido por setor' },
      { ok: true, texto: 'FGTS, INSS, IRRF, VT, VA agregados' },
      { ok: true, texto: 'Drill-down funcionário → contracheque' },
      { ok: true, texto: 'Filtro por tipo de folha (mensal, adiantamento, 13º)' },
      { ok: true, texto: 'Comparativo com o mês anterior (variação por setor)' },
      { ok: true, texto: 'Férias e 13º realizado no ano — por mês, verba e setor (dado real, sem provisão inventada)' },
      { ok: true, texto: 'Custo total por setor com encargos (bruto + FGTS real + INSS patronal estimado)' },
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

export interface PerguntaRoadmap {
  chave: string;
  modulo: string;
  moduloNome: string;
  pergunta: string;
}

/** Hash estável (djb2) → base36, pra chave curta e determinística por texto. */
function hashCurto(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Chave estável de uma pergunta (módulo + texto) — usada pra amarrar a resposta. */
export function chavePergunta(href: string, texto: string): string {
  return `${href}#${hashCurto(texto)}`.slice(0, 80);
}

/**
 * Todas as `perguntasFinanceiro` do roadmap, achatadas, com chave estável.
 * Fonte ÚNICA das perguntas — a tela /perguntas lê daqui e sobrepõe as respostas
 * do banco. Adicionar uma pergunta em qualquer módulo a faz aparecer sozinha lá.
 */
export function todasPerguntasFinanceiro(): PerguntaRoadmap[] {
  const out: PerguntaRoadmap[] = [];
  for (const m of Object.values(MODULOS)) {
    if (!m.perguntasFinanceiro) continue;
    for (const p of m.perguntasFinanceiro) {
      out.push({ chave: chavePergunta(m.href, p), modulo: m.href, moduloNome: m.nome, pergunta: p });
    }
  }
  return out;
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
