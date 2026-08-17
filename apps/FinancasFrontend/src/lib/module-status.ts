/**
 * Catálogo central do status de cada módulo do sistema financeiro.
 *
 * Usado em:
 *   - Sidebar (badge colorido ao lado de cada item)
 *   - Página placeholder (mostra lista de "o que vai ter")
 *   - Banner nas páginas prontas (apontando o que ainda não foi implementado)
 *
 * A regra "estado é código, não memória" vale aqui — quando uma feature ficar
 * pronta, atualizar este arquivo. Assim a UI mostra a verdade automaticamente.
 */

export type ModuloStatus =
  | 'pronto'        // todas funcionalidades principais estão funcionando
  | 'parcial'       // backbone funcionando, mas faltam features importantes
  | 'planejado';    // ainda não construído (placeholder)

export interface ModuloInfo {
  href: string;
  nome: string;
  status: ModuloStatus;
  /** Fase do roadmap (ver Leia/06_ROADMAP.md). */
  fase: string;
  /** Descrição 1 linha sobre o que o módulo faz / vai fazer. */
  descricao: string;
  /**
   * Lista bullet de funcionalidades — checada quando implementada.
   * `desativado: true` = não é trabalho pendente, foi desligado por decisão
   * (a pedido, sem uso etc.) e preservado/reativável — o banner mostra numa
   * categoria separada de "ainda em desenvolvimento", pra não parecer que o
   * módulo está incompleto.
   */
  features: ReadonlyArray<{ ok: boolean; texto: string; desativado?: boolean }>;
  /** Fontes de dados que alimentam o módulo (Globus, BCB, horários, manual…). */
  fontesDados?: ReadonlyArray<string>;
  /**
   * O que a exploração dos dados JÁ revelou — fatos OBSERVADOS (não interpretação).
   * Serve pra separar o que sabemos do que ainda é pergunta em aberto. Mostrado
   * como card próprio no placeholder. Regra do projeto: não concluir em silêncio.
   */
  achados?: ReadonlyArray<string>;
  /** Perguntas chave que o financeiro precisa responder pra priorizarmos. */
  perguntasFinanceiro?: ReadonlyArray<string>;
  /** Estimativa rápida de esforço (apenas referência). */
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
      // Desativada a pedido (30/07/2026, sem uso) — não é pendência do módulo,
      // por isso fora da lista (senão o banner conta como "incompleto"). Código
      // preservado e reativável — ver comentário em contas-receber/page.tsx.
      // { ok: false, desativado: true, texto: 'Visão de cobrança (títulos a receber CRCDOCTO) e reembolsos' },
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
    descricao: 'Espelho da conciliação do Globus (o que ele já ligou via cod_movto_bco → CP) + identificação manual dos que faltam: o operador liga o valor do banco à conta a pagar/receber certa. O sistema não inventa pares — mostra o do Globus e registra a decisão humana.',
    features: [
      { ok: true, texto: 'Lançamentos do banco (BCOMOVTO) com flag conciliado do Globus' },
      { ok: true, texto: 'Título a pagar vinculado pelo Globus (cod_movto_bco → CPGDOCTO)' },
      { ok: true, texto: 'Abas Identificados / Falta identificar + filtro por conta e busca' },
      { ok: true, texto: 'Identificação manual dos pendentes — liga o valor a uma conta a pagar OU a receber (candidatos por valor ±10% e data ±30d, ou busca por fornecedor/documento); decisão humana confirmada e auditável' },
      { ok: true, texto: 'Contas bancárias com saldo (âncora do tesoureiro), agregados de movimentos e explicação de cada número' },
      // FORA DE ESCOPO / não priorizado (jul/2026). Não exibidos como pendência num módulo Em produção.
      // - Vínculo AUTOMÁTICO de crédito → Conta a Receber: depende sincronizar CRCDOCTO.CODMOVTOBCO
      //   (hoje não vem). A identificação MANUAL já cobre o caso (liga crédito a um CR na mão).
      // - Importação CNAB de retorno: arquivo do banco, feito fora do sistema.
      // - Auto-match/borderô (subset-sum) próprio: preservado e DESLIGADO de propósito
      //   (_components/ConciliacaoMatchingView) — sugestão automática pode gerar par falso; a
      //   política é só o espelho do Globus + a ligação manual humana. Reativável por import.
      // { ok: false, texto: 'Vínculo AUTOMÁTICO de crédito → Conta a Receber (depende sincronizar CRCDOCTO.CODMOVTOBCO; manual já cobre)' },
      // { ok: false, texto: 'Importação CNAB de retorno (arquivo do banco, feito fora)' },
      // { ok: false, texto: 'Auto-match/borderô próprio (preservado/desligado de propósito — reativável)' },
    ],
    fontesDados: ['Globus BCOMOVTO', 'Globus BCOCONTA', 'finance.contas_pagar', 'finance.contas_receber', 'finance.conciliacoes'],
    achados: [
      'Decisão (jul/2026): o módulo é o espelho do Globus + identificação manual dos pendentes. O que o Globus concilia, mostramos; o que falta, o operador liga na mão (auditável).',
      'Vínculo automático de crédito→CR e importação CNAB dependem de dado/arquivo externo que hoje não entra — a ligação manual já resolve o caso na prática, então saíram da fila de desenvolvimento.',
      'O motor de auto-match/borderô próprio existe mas fica desligado de propósito: sugerir par automaticamente arrisca falso-positivo; preferimos a decisão humana. Reativável se o financeiro pedir.',
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
      { ok: true, texto: 'Cenários otimista/realista/pessimista — mesmo motor, premissas derivadas da variação mensal real (inadimplência + repasse GDF)' },
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
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Orçado por centro de custo derivado do realizado (base técnica), adotável e ajustável pelo financeiro como meta, com comparativo mensal, estouro e export. Baseline histórico do Globus como referência.',
    features: [
      { ok: true, texto: 'Orçado sugerido (base técnica) — média mensal do realizado por setor nos últimos 12 meses (Contas a Pagar), estado projetado, para o financeiro ajustar' },
      { ok: true, texto: 'Baseline histórico do Globus (CPGORCPREVISOES, 2018–2020) — orçado por ano e centro de custo, como referência e isca pro financeiro' },
      { ok: true, texto: 'Comparativo realizado × orçado sugerido — gasto do último mês completo por setor vs a média (base técnica), tudo do Contas a Pagar' },
      { ok: true, texto: 'Sinalização de estouro (>110% da média do próprio setor no mês)' },
      { ok: true, texto: 'Adotar/ajustar a base técnica como orçado de referência (editável por setor + fator global) — o comparativo passa a usar a meta adotada' },
      { ok: true, texto: 'Exportação (Excel) do comparativo orçado × realizado por setor' },
      { ok: false, texto: 'Workflow de aprovação de revisão — fora de escopo: governança de orçamento que a Pioneira não usa (não orça formalmente); reabrir se criarem o processo' },
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
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Demonstração de Resultado do Exercício contábil, direto do razão do Globus (CTBSALDO, plano 1). O sistema espelha o razão — não recalcula. Com reconciliação gerencial (indicativa) do repasse do GDF.',
    features: [
      { ok: true, texto: 'DRE contábil mensal — linhas montadas pela hierarquia do razão (receita, custos, resultado operacional e líquido), organizada por seções' },
      { ok: true, texto: 'Comparativo com o mês anterior (Δ por linha) + análise vertical (% da receita líquida)' },
      { ok: true, texto: 'Drill-down: clique numa linha e veja as contas do razão que a compõem (débito/crédito)' },
      { ok: true, texto: 'Acumulado no ano (YTD, toggle Mês/YTD) + gráfico de evolução do resultado (12 meses)' },
      { ok: true, texto: 'Visão gerencial (indicativa): reconcilia o resultado operacional com o repasse do GDF recebido no extrato' },
      { ok: true, texto: 'Exportação para Excel (.xlsx) da DRE da competência' },
      { ok: true, texto: 'Transparência: "Fontes e método" + aviso de que a receita operacional é só bilhetagem (repasse GDF não entra nesse plano)' },
      // FORA DE ESCOPO (decisão jul/2026): DRE por garagem/centro de custo não é
      // derivável do razão — as contas de resultado (classe 3/4) NÃO carregam centro
      // de custo (mesmo caso do CODSETOR morto na Depreciação). Só sairia por rateio
      // arbitrário ou reconstrução parcial do Contas a Pagar (não fecha com a DRE).
      // Reabrir se houver decisão de método com o financeiro.
      // { ok: false, texto: 'Visão por garagem (centro de custo) — fora de escopo: razão de resultado sem centro de custo' },
    ],
    fontesDados: [
      'Globus CTBSALDO (razão — saldo mensal por conta, plano 1, contas de resultado classe 3/4)',
      'finance.banco_movto (repasse GDF do extrato — reconciliação gerencial)',
    ],
    achados: [
      'CONSTRUÍDO (jul/2026): DRE contábil mensal do CTBSALDO (plano 1) + comparativo mês anterior + análise vertical + YTD + gráfico + drill-down por linha + export xlsx + reconciliação gerencial do repasse GDF.',
      'Regra crítica: o CTBSALDO guarda as contas SINTÉTICAS junto das folhas e elas TRIPLICAM o valor (nível-3 + nível-4 + folha) — a DRE soma SÓ as folhas (analíticas).',
      'A estrutura de DRE do Globus (CTBCDDRE/CTBITDRE) existe mas está VAZIA — inutilizável; as linhas são montadas pela hierarquia do classificador.',
      'A receita operacional contábil é só a bilhetagem (VT/PLE/PNE, ~R$39M/mês); o repasse do GDF não entra como receita nesse plano (resultado operacional contábil negativo). A visão gerencial soma o repasse do extrato como INDICATIVO — bilhetagem e repasse-caixa são lentes diferentes, não um número oficial.',
      'DRE por garagem fica FORA de escopo: o razão de resultado não carrega centro de custo (só sairia por rateio arbitrário ou reconstrução parcial do Contas a Pagar).',
    ],
  },

  '/painel-cfo': {
    href: '/painel-cfo',
    nome: 'Painel CFO',
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Visão executiva consolidada dos módulos prontos — caixa, resultado, folha e GDF num só lugar, cada número com estado explícito (real/calculado/projetado/sem dado) e link à fonte.',
    features: [
      { ok: true, texto: 'KPIs executivos: caixa hoje, gap de caixa projetado, repasse GDF do mês, a pagar em 7d, folha líquida, resultado líquido, DPO e DSO — cada um com estado do dado e atalho pro módulo de origem' },
      { ok: true, texto: 'Alertas estratégicos: gap de caixa, estouro de orçamento por setor, títulos de prazo longo vencidos, inadimplência histórica e dados sem âncora' },
      { ok: true, texto: 'Comparativo MoM (mês vs mês anterior) e YoY (vs mesmo mês do ano anterior) do resultado, com evolução de 13 meses' },
      { ok: true, texto: 'Horizonte de caixa ajustável (semana / mês / trimestre)' },
      { ok: true, texto: 'Briefing executivo exportável em Excel (KPIs + alertas + comparativo)' },
      { ok: true, texto: 'Consolidação sem recálculo de negócio: agrega Fluxo de Caixa, DRE, Contas a Pagar, Orçamento e Recebíveis GDF mantendo a rastreabilidade' },
    ],
    fontesDados: ['Fluxo de Caixa', 'DRE', 'Contas a Pagar', 'Orçamento', 'Recebíveis GDF', 'Encargos & Benefícios'],
    achados: [
      'Decisão de escopo (jul/2026): as 3 perguntas ao financeiro foram presumidas a partir do que os módulos já entregam (regra do projeto: não travar em pergunta ao financeiro). Indicadores da semana = caixa/gap/GDF/a pagar/folha/resultado/DPO/DSO; ritual = caixa semanal + resultado mensal (toggle semana/mês/trimestre); acionistas/conselho = briefing executivo exportável.',
      'O painel não tem fonte de dado própria: consolida os módulos prontos e mantém a rastreabilidade até a origem. Onde o dado não existe — capital de giro completo (sem balanço patrimonial no Globus) e receita por garagem (inexistente hoje) — o indicador aparece como "sem dado", nunca inventado.',
      'DPO = títulos em aberto ÷ pagamento médio diário dos últimos 90 dias. DSO = tempo médio de resgate do GDF na matriz BRB (a receita real da operação; o contas a receber tradicional é residual). Ambos marcados como "calculado".',
    ],
  },

  '/auditoria': {
    href: '/auditoria',
    nome: 'Auditoria',
    status: 'pronto',
    fase: 'Em produção',
    descricao: 'Trilha de quem acessou, alterou, aprovou e exportou dados — consulta com filtros + export. Leitura dos logs que o sistema já grava.',
    features: [
      { ok: true, texto: 'Gravação contínua: audit.acesso_dados (acessos/ações) + audit.user_activity_logs (login/senha)' },
      { ok: true, texto: 'UI de consulta com filtros (usuário, ação, recurso, período, busca) + paginação' },
      { ok: true, texto: 'Trilha de alteração por registro (quem alterou/aprovou/rejeitou o quê — ação + recurso + id)' },
      { ok: true, texto: 'Termo de aceite/comprometimento (LGPD) versionado, com IP e trilha' },
      { ok: true, texto: 'Exportação para auditoria externa (Excel da trilha filtrada, com o diff)' },
      { ok: true, texto: 'Diff campo-a-campo (valor antes × depois) nas mutações reais de usuário — âncora de saldo, meta de orçamento, conciliação manual, baixa de reembolso, resposta ao financeiro e admin de usuários (linha expansível na trilha)' },
    ],
    fontesDados: ['audit.acesso_dados', 'audit.user_activity_logs', 'identity.usuarios'],
    achados: [
      'O sistema é majoritariamente um espelho read-only do Globus; as mutações reais de usuário são um conjunto pequeno e enumerável (aprovações, meta de orçamento, âncora de saldo, conciliação manual, baixa de reembolso, resposta ao financeiro, admin de usuário).',
      'Por isso o diff campo-a-campo é instrumentado nesses pontos via um helper único (fastify.auditoria.registrarAlteracao), que guarda só os campos que mudaram — não foi preciso instrumentar "cada mutação". Aprovações de CP já têm trilha própria (workflow_evento).',
    ],
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
      { ok: true, texto: 'Permissão de funcionalidade por usuário (granular) — começa com "ver contracheque individual" (LGPD): o admin liga/desliga por usuário; backend bloqueia e a Folha esconde o holerite de quem não tem' },
      { ok: false, texto: 'Matriz completa de permissões por módulo (além das funcionalidades sensíveis)' },
    ],
  },

  '/admin/parametros': {
    href: '/admin/parametros',
    nome: 'Parâmetros',
    status: 'parcial',
    fase: 'Em construção',
    descricao: 'Identidade da empresa (nome, CNPJ, endereço e logo) exibida no login, menu e cabeçalho. Sistema de empresa única (Viação Pioneira).',
    features: [
      { ok: true, texto: 'Identidade da empresa — razão social, nome fantasia, CNPJ, endereço e telefone (editável por admin)' },
      { ok: true, texto: 'Logo e branding — upload do logo (data-URI, até 512 KB), aplicado ao vivo no login, menu e cabeçalho; remoção volta ao padrão' },
      { ok: true, texto: 'Calendário de feriados — cadastro (CRUD) com os nacionais 2026/2027 pré-carregados, consumido pela projeção do Fluxo de Caixa (marca os dias de feriado, sem alterar valores)' },
      { ok: false, texto: 'Tarifas SEMOB (cadastro e histórico) — planejado; entra quando houver tela de receita técnica que use' },
      { ok: false, texto: 'Configurações de e-mail/notificação — hoje via variáveis de ambiente (SMTP); migrar pra banco é troca lateral' },
    ],
    fontesDados: ['identity.configuracao'],
    achados: [
      'Empresa única (Viação Pioneira): não há "empresa/filial" a configurar — o que fazia sentido do item era tornar a identidade exibida (nome + logo) editável em vez de fixa no código. Foi o que se construiu.',
      'Logo guardado como data-URI na tabela (sem object storage: gravar arquivo em disco quebra em container read-only). Branding servido por endpoint público (/api/parametros/branding) pra aparecer também no login, deslogado.',
      'Feriados foram construídos COM consumidor (a projeção do Fluxo de Caixa marca os dias) — para não virar cadastro morto. Tarifas SEMOB e config de e-mail seguem planejadas pelo mesmo critério: só entram quando algo as consumir (e-mail hoje é via env; a tarifa técnica não é receita real — ver Recebíveis GDF).',
    ],
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
