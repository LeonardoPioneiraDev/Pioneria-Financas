# 05 · Módulos Financeiros

> O que o sistema oferece para o usuário final, agrupado por **domínio funcional**. Cada módulo lista propósito, telas principais, dados que consome, regras de negócio, restrições e indicadores que entrega.

## Mapa dos módulos

```
┌─────────────────────────────────────────────────────────────────────┐
│ EXECUTIVO (read-only)                                               │
│  └─ Painel CFO · DRE consolidada · Indicadores chave · Alertas      │
└─────────────────────────────────────────────────────────────────────┘
        ▲
        │ alimentado por
        │
┌─────────────────────────────────────────────────────────────────────┐
│ OPERAÇÃO FINANCEIRA (escrita + workflow)                            │
│  ├─ Contas a Pagar      ├─ Contas a Receber                         │
│  ├─ Recebíveis GDF      ├─ Conciliação Bancária                     │
│  ├─ Folha               ├─ Tributos                                 │
│  └─ Depreciação                                                     │
└─────────────────────────────────────────────────────────────────────┘
        ▲
        │
┌─────────────────────────────────────────────────────────────────────┐
│ PLANEJAMENTO                                                        │
│  ├─ Orçamento Anual     ├─ Fluxo de Caixa Projetado                 │
│  └─ Análise Orçado × Realizado                                      │
└─────────────────────────────────────────────────────────────────────┘
        ▲
        │
┌─────────────────────────────────────────────────────────────────────┐
│ FUNDAÇÃO (suporte para todos)                                       │
│  ├─ Plano de Contas     ├─ Parâmetros Externos (auditáveis)         │
│  ├─ Auditoria           └─ Integrações (saúde dos sincronizadores)  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Contas a Pagar

**Propósito:** registrar, aprovar e quitar dívidas da empresa.

**Origem dos dados:**
- Manual (usuário lança NF de fornecedor)
- Adapter SGD (NFs digitalizadas com OCR + revisão humana)
- Adapter Workshop (custos operacionais consolidados mensais)

**Telas:**
- Listagem com filtros (vencimento, fornecedor, plano de contas, status)
- Form de lançamento (NF, fornecedor, valor, vencimento, classificação contábil)
- Tela de aprovação (workflow conforme alçada)
- Tela de programação de pagamento (lote por data)
- Tela de baixa (efetiva o pagamento, gera lançamento bancário)

**Regras de negócio:**
- Workflow de aprovação por alçada (ver `identity.aprovacao_workflow`):
  - `≤ R$ 10k` — analista CP libera direto
  - `> R$ 10k e ≤ R$ 50k` — controller aprova
  - `> R$ 50k` — CFO aprova
- Não permite pagamento antes da aprovação completa
- Não permite editar lançamento após pagamento (só estorno)
- Estorno gera lançamento espelho negativo (audit trail)

**Indicadores:**
- Total a pagar nos próximos 7/15/30 dias
- Vencidos
- Concentração por fornecedor
- Aging por faixa

---

## 2. Contas a Receber

**Propósito:** registrar o que a empresa tem para receber. Para a Pioneira, **o maior CR é o subsídio GDF** (módulo dedicado abaixo).

**Origem:**
- Adapter Bilhetagem (receita direta por dia, agregada mensalmente)
- Manual (venda avulsa, locação eventual, etc.)
- Adapter SGD (contratos com terceiros)

**Telas:**
- Listagem com filtros (cliente, competência, status, vencimento)
- Form de lançamento
- Tela de baixa (recebimento efetivo)
- Painel de aging (a vencer, vencido < 30d, 30-60d, 60-90d, >90d)

**Regras:**
- Status calculado, não editado: `a_receber` quando líquido > recebido; `parcial` quando 0 < recebido < líquido; `quitado` quando recebido ≥ líquido.
- Glosa é parte do CR (campo separado), não diminuição silenciosa do valor bruto.

**Indicadores:**
- Total a receber por competência
- DSO (Days Sales Outstanding)
- Concentração por cliente
- Glosa acumulada no ano

---

## 3. Recebíveis GDF (subtipo crítico)

**Por que ter um módulo só pra isso:** o subsídio GDF é a **maior receita** da Pioneira; tem regras próprias (Portaria SEMOB, IQS, ciclo de recebimento de ~30-45 dias), e a glosa é evento frequente.

**Telas:**
- Painel mensal: para cada competência, **Receita Técnica Calculada × Repasse Recebido × Diferença**
- Linha do tempo: quando cada repasse caiu, qual ofício, qual glosa
- Análise de glosa: motivos, padrões, evolução
- Indicadores: ciclo médio de recebimento, taxa de glosa, cobertura %, gap acumulado

**Origem dos dados:**
- **Receita Técnica:** `finance.receita_tecnica_mensal` (calculada via bilhetagem × tarifa SEMOB)
- **Repasses recebidos:** `finance.contas_receber` filtrado por `cliente_tipo = 'gdf_subsidio'`
- Adapter GDF: hoje CSV manual; futuro API SECID-DF se disponível

**Regras:**
- Receita técnica é **derivada**, recalculada quando pax ou tarifa mudam (com snapshot da versão usada)
- Repasse efetivo é **fato**, registrado quando o crédito cai no banco
- Diferença = receita_técnica − valor_líquido_recebido (sempre exibida)
- Status do mês: `a_receber` / `parcial` / `quitado` / `recebido_sem_baseline` (recebeu mas pax do mês não consolidou) / `sem_dado`

**Alertas:**
- Mês > 60 dias sem repasse → notifica controller
- Glosa > 5% do bruto → notifica CFO
- Ciclo médio aumentando 3 meses seguidos → alerta operacional

---

## 4. Conciliação Bancária

**Propósito:** garantir que cada lançamento financeiro tem um correspondente no extrato bancário (e vice-versa).

**Origem:**
- Adapter Open Finance (extratos via API autorizada — preferencial)
- Upload OFX manual (fallback)

**Telas:**
- Para cada conta bancária, lista lado-a-lado: lançamentos do sistema × movimentos do extrato
- Sugestão automática de match (por valor + data ± 3 dias)
- Botão "conciliar" (match manual ou aceitar sugestão)
- Movimentos sem match destacados (ambos lados)

**Regras:**
- Match perfeito (valor + data exata) → auto-concilia
- Match aproximado → propõe, exige confirmação humana
- Movimento de extrato sem lançamento → cria pendência para registro manual
- Lançamento sem movimento após 5 dias úteis → alerta

**Indicadores:**
- % conciliado no mês
- Saldo do extrato × saldo contábil (deve fechar)
- Pendências abertas

---

## 5. Folha de Pagamento (espelho)

**Propósito:** **NÃO é sistema de RH**. É espelho financeiro: traz folha consolidada do Globus/SEFIP/eSocial, decompõe em base + encargos + provisões e provisiona contabilmente.

**Origem:**
- Adapter Globus (snapshot diário de `funcionarios_globus`)
- Adapter eSocial (quando integração estiver pronta, valores REAIS de encargos)
- Cálculo (quando dado real ausente, aplica alíquotas legais como FALLBACK)

**Telas:**
- Painel mensal: blocos verde (Folha Bruta REAL) + âmbar (Encargos) + rosa (Provisões)
- Cada rubrica mostra `origem: real | calculado`, alíquota usada, fonte legal
- Detalhamento por área/garagem (quando disponível)
- Evolução temporal (gráfico)

**Regras:**
- Origem REAL sempre preferida sobre CALCULADO
- Quando passa de calculado para real (integração eSocial vira), o sistema mantém histórico do que era calculado
- Provisões 13º/férias geram automaticamente CP nas competências de pagamento (novembro, dezembro, mês do colaborador)

**Indicadores:**
- Custo total de pessoal mensal
- k-factor (custo total / folha bruta)
- Salário médio por área
- Headcount ativo
- Custo médio por funcionário

---

## 6. Tributos

**Propósito:** acompanhar PIS, COFINS, ICMS, ISS, IR, CSLL devidos e pagos.

**Origem:**
- Adapter contábil (futuro — integração com sistema fiscal/contábil oficial)
- Cálculo (regime tributário, alíquotas) como fallback

**Telas:**
- Calendário de obrigações tributárias
- Para cada tributo: base de cálculo, alíquota, valor devido, valor pago, vencimento
- Comparativo mês a mês

**Regras:**
- Conexão com plano de contas tributário
- Geração automática de CP quando obrigação for apurada
- Audit estrito (qualquer alteração de alíquota fica em histórico)

---

## 7. Depreciação

**Propósito:** apropriar o desgaste dos ativos (frota, equipamentos) no resultado mensal.

**Origem:**
- Adapter Workshop (frota de ônibus com data de aquisição e valor)
- Cadastro manual para outros ativos (imóveis, equipamentos)

**Telas:**
- Listagem de ativos imobilizados
- Cronograma de depreciação por ativo
- Lançamento mensal de depreciação por categoria

**Regras:**
- Método padrão: linear (vida útil definida por categoria de ativo)
- Veículos urbanos: 5 anos (60 meses) por padrão
- Quando ativo é baixado (alienação), interrompe depreciação e gera lançamento de baixa
- Depreciação acumulada não pode ultrapassar valor de aquisição

---

## 8. Fluxo de Caixa Projetado

**Propósito:** ver entradas e saídas previstas pros próximos 12 meses.

**Componentes:**

**Realizado (passado):**
- Entradas: `finance.recebimentos` agregadas por mês
- Saídas: `finance.pagamentos` agregadas por mês

**Projetado (futuro):**
- Entradas: Prophet sobre receita técnica + ciclo de recebimento; conhecidas: CR já lançado com vencimento futuro
- Saídas: Prophet sobre custos; conhecidas: CP já aprovados com vencimento futuro; folha (replica média recente); tributos (calendário fiscal)

**Telas:**
- Linha do tempo mensal: barras stacked (entradas vs saídas)
- Saldo acumulado projetado
- Identificação de mês com saldo crítico (próximo de zero ou negativo)
- Detalhamento por categoria

**Regras:**
- Cada projeção declara o método usado (Prophet, média móvel, conhecido)
- Premissas listadas em cada linha (rastreabilidade)
- Re-execução manual quando parâmetros mudam

---

## 9. Orçamento e Análise Orçado × Realizado

**Propósito:** comparar realidade com o que foi planejado.

**Telas:**
- Form de orçamento anual (por plano de contas, mês a mês)
- Versionamento de revisões
- Workflow de aprovação (CFO + Diretoria)
- Painel comparativo mensal:

| Conta | Orçado | Realizado | Variação | % | Ação |
|---|---|---|---|---|---|
| Folha | R$ 25,0 mi | R$ 25,6 mi | +R$ 0,6 mi | +2,4% | dentro |
| Comb. | R$ 8,0 mi | R$ 9,4 mi | +R$ 1,4 mi | +17,5% | 🔴 atenção |

**Regras:**
- Variação > 10% (config por conta) gera alerta
- Orçamento revisado mantém versão anterior visível
- Aprovação por workflow (CFO sempre, Diretoria por valor)

---

## 10. DRE Contábil

**Propósito:** demonstrativo de resultado no formato exigido pela contabilidade.

**Estrutura:**
```
RECEITA OPERACIONAL BRUTA
(-) DEDUÇÕES (PIS, COFINS, ISS, devoluções)
= RECEITA OPERACIONAL LÍQUIDA
(-) CUSTOS OPERACIONAIS (folha, combustível, peças, manutenção)
= LUCRO BRUTO
(-) DESPESAS OPERACIONAIS (administrativas, comerciais)
(-) DEPRECIAÇÃO E AMORTIZAÇÃO
= EBITDA
(-) DESPESAS FINANCEIRAS  (+) RECEITAS FINANCEIRAS
= LUCRO ANTES DOS IMPOSTOS (LAIR)
(-) IRPJ / CSLL
= LUCRO LÍQUIDO
```

**Telas:**
- Visão mensal padrão
- Comparativo mês × mês anterior × mesmo mês ano anterior × orçado
- Drilldown em qualquer linha → lançamentos que compõem
- Exportação Excel/PDF

**Regras:**
- Calculada a partir de `finance.*` puras (nada de cálculo direto na UI)
- Mudança retroativa em lançamento de mês fechado exige privilégio + audit
- Quando rubrica não está disponível, mostra "não disponível para este período" — NUNCA zera silenciosamente

---

## 11. Painel CFO (Executivo)

**Propósito:** o que o decisor abre toda manhã.

**Conteúdo (1 tela única):**

- **Caixa hoje**: saldo agregado de contas bancárias + projeção próximos 7 dias
- **DRE do mês corrente** (em curso): receita líquida, custo operacional, margem
- **Recebíveis críticos**: GDF vencido + maior aging
- **Pagar nos próximos 7 dias**: total + alerta se > caixa projetado
- **3 alertas mais relevantes**: glosa GDF, custo subiu >10%, folha sem fechamento, etc.
- **Mini fluxo de caixa próximos 6 meses** (gráfico)

**Premissas:**
- Tudo agregado, sem necessidade de filtro
- Drilldown leva ao módulo específico
- Atualiza automaticamente (cache curto)

---

## 12. Auditoria

**Propósito:** trilha rastreável de tudo.

**Telas:**
- Busca por: usuário, recurso, período, evento
- Para cada evento: payload antes/depois (diff)
- Exportação CSV para auditoria externa

**Regras:**
- Nenhuma escrita financeira sem evento de auditoria correspondente
- Eventos não podem ser editados ou excluídos
- Retenção: 10 anos (exigência fiscal)
- Login/logout também auditados

---

## 13. Parâmetros Externos

**Propósito:** governança dos números que vêm de fora (tarifa SEMOB, diesel ANP, multa CTB, etc.).

**Já existe no v1 e fica praticamente igual no v2.** Diferenças:

- Tabela com histórico (vigência início/fim) em vez de única linha
- Cada alteração registrada com usuário, motivo, fonte (URL do PDF, captura de tela)
- Job semanal que verifica fontes oficiais e **alerta** quando diverge >X% (não atualiza automaticamente)

---

## 14. Integrações (Painel admin)

**Propósito:** saúde dos adapters externos.

**Conteúdo:**
- Tabela: sistema | último sync | status | registros | próximo | ações
- Botão "forçar sync agora" (admin only)
- Detalhe de cada job (parâmetros, erros, payload raw das últimas 100 linhas)
- Configuração de credenciais (vai ao Vault)

Detalhado em [04_IDENTIDADE_INTEGRACOES.md](04_IDENTIDADE_INTEGRACOES.md).

---

## Matriz de permissões (resumo)

| Papel | Painel CFO | DRE | CP | CR | GDF | Folha | Caixa Projetado | Orçamento | Auditoria | Param. Ext. |
|---|---|---|---|---|---|---|---|---|---|---|
| **Diretor / CFO** | ler/agir | ler/exportar | aprovar | ler | ler/agir | ler | ler/recalcular | aprovar | exportar | alterar |
| **Controller** | ler | ler | aprovar até X | criar/editar | ler/agir | ler | ler/recalcular | criar/revisar | exportar | alterar |
| **CP Analista** | — | — | criar | — | — | — | ler | — | próprio | — |
| **CR Analista** | — | — | — | criar/editar | criar/editar | — | ler | — | próprio | — |
| **RH/Folha** | — | — | — | — | — | ler/validar | — | — | próprio | — |
| **Auditor** | ler | ler | ler | ler | ler | ler | ler | ler | exportar | ler |
| **Operacional** | — | — | — | — | — | — | — | — | — | — |

(Mapa exato em `identity.permissoes`. Configurável.)
