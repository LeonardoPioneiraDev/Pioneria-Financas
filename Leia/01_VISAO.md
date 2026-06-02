# 01 · Visão

## O problema que motivou o rebuild

O sistema v1 nasceu como **BI operacional** e foi sendo adaptado para uso financeiro, herdando:

1. **Acoplamento forte ao banco operacional** — lê direto de `workshop_db` e `controle_horarios_db`, sem camada de tradução. Se o operacional muda a estrutura, o financeiro quebra.
2. **Sem identidade própria** — não há login unificado. Cada sistema Pioneira (workshop, sgd, controle_horarios, transdata, pioneira_insights) tem seu próprio cadastro de usuário.
3. **Duplicação tácita de dados** — quando o financeiro precisa de um valor que está em outro sistema, ou se faz consulta direta no banco do outro (acoplamento perigoso), ou se copia o dado manualmente (planilha → upload).
4. **Sem trilha de auditoria financeira própria** — o `audit_log` é genérico; não rastreia decisões financeiras (alterações de orçamento, classificação de glosa, aprovação de pagamento).

O v2 corrige a raiz desses problemas.

## Para quem o sistema é feito

| Papel | O que precisa fazer no sistema |
|---|---|
| **Diretor financeiro / CFO** | Ver DRE, fluxo de caixa projetado, indicadores executivos; aprovar pagamentos críticos |
| **Controller** | Acompanhar orçado vs realizado, fechar mês, validar conciliações |
| **Analista de contas a pagar** | Lançar/aprovar contas a pagar, conciliar com fornecedores |
| **Analista de contas a receber** | Acompanhar recebíveis GDF e demais, registrar glosas, conciliar |
| **RH / Folha** | Validar folha decomposta, provisionar 13º/férias/rescisões |
| **Auditor (interno ou externo)** | Trilha completa de alterações; origem de cada número |
| **Diretoria operacional (leitura)** | Indicadores executivos resumidos |

## Princípios não-negociáveis

Herdados do v1 e fortalecidos:

### 1. Quando não tem dado, o sistema diz que não tem
Nunca interpola, nunca estima em silêncio. Estados explícitos: `real` · `calculado` · `projetado` · `sem dado` · `não implementado`.

### 2. Todo número é rastreável até a fonte
Cada lançamento tem `origem_sistema`, `origem_id_externo`, `data_sync`, `método` (manual/api/calculado). Cliques em qualquer valor levam ao detalhe da origem.

### 3. Receita teórica nunca é apresentada como real
A receita técnica (Pax × Tarifa SEMOB) é claramente distinta do **repasse efetivo do GDF**. Os dois aparecem lado a lado, nunca substituídos.

### 4. Projeção declara método e premissas
Cada projeção mostra: modelo usado (Prophet, média móvel, regressão), pontos de treino, motivo de fallback se houver, intervalo de confiança.

### 5. Login é único em todo o ecossistema Pioneira
Mesmo usuário, mesma senha, mesma sessão entre sistemas. Permissões granulares por sistema, mas identidade unificada.

### 6. Dados externos NÃO são lidos em runtime
O sistema mantém **snapshots materializados** das fontes externas em seu próprio banco. Jobs de sincronização atualizam os snapshots. A UI lê apenas do banco próprio. Resultado: performance previsível, resiliência (sistema-fonte fora do ar não derruba o financeiro), audit trail.

### 7. Fronteira explícita
O usuário vê em banner permanente o que cobre e o que NÃO cobre. Migrar para v2 não muda o princípio — muda o conjunto de coisas que cobre.

## O que vai estar no escopo do v2

- ✅ **DRE contábil** completa (não só operacional)
- ✅ **Fluxo de caixa** diário, mensal, anual
- ✅ **Contas a pagar / receber** com workflow de aprovação
- ✅ **Recebíveis GDF** (subtipo de contas a receber) com aging, glosa, ciclo
- ✅ **Folha decomposta** integrada via API com sistema de RH (SEFIP/eSocial quando disponível)
- ✅ **Tributos** (PIS, COFINS, ICMS, IR/CSLL, ISS)
- ✅ **Depreciação** da frota (lida do sistema de patrimônio)
- ✅ **Orçado vs realizado** mensal e anual
- ✅ **Conciliação bancária** (via Open Finance ou OFX)
- ✅ **Indicadores executivos** com previsão Prophet
- ✅ **Auditoria** completa (quem fez o quê, quando, por quê)

## O que NÃO está no escopo (e por quê)

- ❌ **Operação e logística** — fica nos sistemas existentes (workshop, transdata). O financeiro só consome.
- ❌ **Folha de pagamento como sistema de RH** — o cálculo da folha continua no Globus/SEFIP. O financeiro **lê e provisiona**.
- ❌ **Gestão de contratos jurídicos** — fica no SGD. Financeiro consome via API quando precisa do valor do contrato.
- ❌ **Cobrança / SPC / Serasa** — fora de escopo.
- ❌ **Substituir o ERP contábil oficial** — o sistema é **complementar**: traz inteligência, projeções, painéis e flow de aprovação que o ERP não tem. O ERP segue como sistema de registro fiscal.

## Métrica de sucesso do v2

Em 6 meses após o go-live:

1. **CFO abre o painel diariamente** (engagement como prova de utilidade)
2. **Zero divergências entre o sistema e o fechamento contábil** (precisão da integração)
3. **Tempo de fechamento mensal cai pelo menos 30%** (eficiência)
4. **Glosas do GDF identificadas em <5 dias** (vs. semanas no Excel)
5. **Single sign-on funcionando em todos os sistemas Pioneira** (consolidação de identidade)
