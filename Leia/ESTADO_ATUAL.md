# Estado Atual do Sistema

> Snapshot de **2026-05-21**. Fonte de verdade: `apps/FinancasFrontend/src/lib/module-status.ts` (catálogo central). Este doc é a versão narrativa pra leitura humana.

## Resumo executivo

**8 módulos em produção** · **1 em construção** · **8 planejados**

| Status | Módulos |
|---|---|
| 🟢 Em produção | Dashboard · Contas a Pagar · Contas a Receber · **Recebíveis GDF** · **Fluxo de Caixa** (CR × CP) · Folha (CPG) · Folha por Setor · Usuários |
| 🟡 Em construção | Integrações (UI faltando, backend pronto) |
| ⚪ Planejados | Conciliação Bancária · Tributos · Depreciação · Orçamento · DRE · Painel CFO · Auditoria · Parâmetros |

## Em produção (rodando hoje)

### Dashboard

KPIs financeiros principais + atalhos. Falta widget configurável e alertas customizados.

### Contas a Pagar (`/contas-pagar`)

Carteira CP sincronizada do Globus (`CPGDOCTO` + `CPGITDOC`). Detecta origem (folha / NF / guia / manual) e exclusão lógica. Workflow inferido a partir do estado do documento (etapas sem rastro aparecem como "sem registro no Globus" — ~34% dos pagos não têm liberação registrada; ver `cp-workflow-liberacao-aprove-me.md`). **Setor por unidade** = `CPGITDOC.CODCUSTOFIN` → `CPGCUSTOS` (unidade dominante por valor + flag `setor_rateado`); filtro + pílula na lista/detalhe. Cards de aging incluem **Cancelado** (somam o total). Falta: aprovação CFO digital, remessa CNAB, conferência tributária. Detalhe técnico do setor: `globus-tabelas-financeiras-documentacao.md` §4.3.

### Contas a Receber (`/contas-receber`)

Carteira CR sincronizada do Globus (`CRCDOCTO`). Filtros + listagem + status de cobrança. Falta: régua de cobrança automática, geração boleto/PIX, SERASA.

### Recebíveis GDF (`/recebiveis-gdf`)

**Módulo completo** — integração com `horarios.vpioneira.com.br` (BRB Mobilidade), classificação por família (CIDADAO/VT/idoso/etc.), matriz transp × resgate, aging, glosa cruzada com extrato bancário.

UI em **4 abas** com glossário inicial + tooltips em cada termo técnico, para uso pelo financeiro mesmo sem formação técnica.

📄 Documento detalhado: [`recebiveis-gdf.md`](recebiveis-gdf.md)

### Folha (`/folha`)

Folha **como contas a pagar** — visão do fluxo financeiro. Classifica por tipo (salário, 13º, férias, INSS, FGTS) a partir de CPG com `origem=folha`. Falta: geração de remessa bancária.

### Folha por Setor (`/folha-detalhe`)

Decomposição operacional via `FLP_FICHAEVENTOS` (~127k lançamentos/mês). Drill-down até contracheque individual. Falta: comparativo entre competências, provisões de férias/13º, custo total por funcionário com encargos.

### Usuários (`/admin/usuarios`)

Gestão de usuários + papéis (admin / CFO / controller / analistas) + reset de senha. Falta: SSO Keycloak (planejado pra Fase 6) e permissão granular por módulo.

## Em construção

### Integrações (`/admin/integracoes`)

**Backend 100% pronto** — `sync_jobs`, `sync_errors` (DLQ), `oracle_query_logs` gravando + endpoints expostos. **UI faltando:** dashboard, lista DLQ com reprocessar, telemetria Oracle, drill-down stage→canônico.

Estimativa: 1 semana.

📄 Documento técnico: [`sync-e-observabilidade.md`](sync-e-observabilidade.md)

## Próximo na fila (planejado, alta prioridade)

### Fluxo de Caixa (`/fluxo-caixa`)

Projeção 30/60/90 dias + saldo consolidado + cenários + alerta de gap.

**Decisão arquitetural já tomada** (após exploração do Globus em 2026-05-21):
- `BCOSALDO` do Globus está abandonada (5 linhas, 2006-2007). Não usar.
- Saldo calculado nós mesmos: `BCOCONTA.SALDO_ACM_ATE_DATA` (âncora) + somatório `BCOMOVTO` desde a âncora.
- Contas reais filtradas por: `COMPOEPOSICAOFINANCEIRA='S'`, `INATIVA='N'`, `DTLIMITEMOVTO > '1950-01-01'`.

📄 Memória: [`globus-saldo-bancario`](../memory/globus-saldo-bancario.md)

### Conciliação Bancária (`/conciliacao`)

Match automático extrato × título. Estimativa: 4 semanas após Fluxo de Caixa.

## Infraestrutura compartilhada (transversal)

### Sync e observabilidade

3 tabelas no schema `integration` (`sync_jobs`, `sync_errors`, `oracle_query_logs`) compartilhadas por todas as integrações (Globus, horários, futuras). Padrões obrigatórios em [`sync-e-observabilidade.md`](sync-e-observabilidade.md).

### Catálogo de módulos centralizado

`apps/FinancasFrontend/src/lib/module-status.ts` é a fonte de verdade do que está pronto vs em construção vs planejado. **Quando concluir uma feature, atualizar lá** — o sidebar e os banners refletem automaticamente.

### Componentes UI reaproveitáveis

- `Tabs` (em `components/ui/tabs.tsx`) — sem dependência nova, baseado em state
- `TermoTecnico` (em `components/shared/TermoTecnico.tsx`) — termo + ícone (i) + tooltip explicativo
- `ModuleStatusBanner` (em `components/layout/ModuleStatusBanner.tsx`) — banner discreto mostrando "X/N funcionalidades prontas"
- `PlaceholderModule` (em `components/layout/PlaceholderModule.tsx`) — página padrão pra módulos `planejado`/`parcial`

## Princípios herdados que continuam valendo

1. **"Quando não tem dado, o sistema diz que não tem"** — nunca interpolar em silêncio.
2. **Estados explícitos:** `real` · `calculado` · `projetado` · `sem dado`.
3. **Todo número é rastreável até a fonte** (`origem_sistema`, `origem_id_externo`, `método`).
4. **Receita técnica nunca é apresentada como receita real.** Cruzamento sempre explícito.
5. **Dados externos não são lidos em runtime.** Sempre via snapshot em `integration.*_stage`.

## Como atualizar este documento

Quando uma feature mudar de status, atualize:

1. `apps/FinancasFrontend/src/lib/module-status.ts` (fonte de verdade — UI lê daqui)
2. Este arquivo (versão narrativa)
3. `Leia/06_ROADMAP.md` se for entrega de fase
