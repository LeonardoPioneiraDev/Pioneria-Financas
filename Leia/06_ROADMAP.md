# 06 · Roadmap

> Sequência sugerida em **6 fases**. Cada fase tem entregáveis testáveis, dependências e marcos de validação. Prazos são estimativas de referência (não compromissos contratuais).

> **Snapshot 2026-05-21:** Estado real do que está pronto vs planejado em [`ESTADO_ATUAL.md`](ESTADO_ATUAL.md). Esta página é o **plano**; o ESTADO_ATUAL.md é a **realidade**.

## Entregas já realizadas (resumo)

- ✅ **F0 Infraestrutura** — monorepo pnpm + Turbo, Docker (Postgres + Redis + Mailhog), Fastify + TypeBox + TypeORM, Next.js 15 + Tailwind v4, JWT + refresh, audit + métricas, ESM com `@/*`.
- ✅ **F1 Contas a Pagar** — sync Globus CPGDOCTO + CPGITDOC, detecção de origem (folha/NF/guia/manual), workflow inferido, UI completa.
- ✅ **F1 Contas a Receber** — sync Globus CRCDOCTO + cliente, status de cobrança, UI completa.
- ✅ **F1 Recebíveis GDF** — integração `horarios.vpioneira.com.br` + ETL classificação família + glosa cruzada com BCOMOVTO + UI em 4 abas pra leigos (ver [`recebiveis-gdf.md`](recebiveis-gdf.md)).
- ✅ **F2 Folha (CPG)** — folha como contas a pagar, classificação automática.
- ✅ **F2 Folha por Setor** — sync FLP_FICHAEVENTOS, drill-down funcionário → contracheque.
- ✅ **Infra transversal** — sync_jobs / sync_errors (DLQ) / oracle_query_logs (telemetria); padrões em [`sync-e-observabilidade.md`](sync-e-observabilidade.md).

## Próximo entregável: Fluxo de Caixa

**Decisão arquitetural** (após exploração do Globus em 2026-05-21):
- ❌ `BCOSALDO` do Globus está abandonada (5 linhas, 2006-2007). Não usar.
- ✅ Saldo calculado nós mesmos: `BCOCONTA.SALDO_ACM_ATE_DATA` (âncora) + somatório `BCOMOVTO` desde a âncora.
- ✅ Filtros pra contas reais: `COMPOEPOSICAOFINANCEIRA='S'`, `INATIVA='N'`, descarta sentinela `DTLIMITEMOVTO=30/12/1899`.

Estimativa: ~5 semanas. Pode encurtar pra ~2 semanas se o financeiro decidir que **consolidado basta** (sem drill-down por conta).

## Visão geral das fases

```
F0  ─►  F1  ─►  F2  ─►  F3  ─►  F4  ─►  F5
Infra   Caixa   Folha   DRE     Plan.   BI
```

| Fase | Tema | Estimativa | Dependências |
|---|---|---|---|
| **F0** | Infraestrutura e Identidade | 3-4 semanas | — |
| **F1** | Caixa e Recebíveis | 4-6 semanas | F0 |
| **F2** | Folha e RH (integração Globus/eSocial) | 3-4 semanas | F0; em paralelo com F1 |
| **F3** | DRE Contábil + Tributos + Depreciação | 4-6 semanas | F1, F2 |
| **F4** | Planejamento (Orçamento + Caixa projetado) | 3-4 semanas | F3 |
| **F5** | BI Executivo + Alertas + Mobile-friendly | 3-4 semanas | F4 |

**Total estimado:** 20-28 semanas (~5-7 meses) com 2-3 devs. Pode rodar mais rápido com time maior e adapters simplificados.

---

## Fase 0 — Infraestrutura e Identidade

**Objetivo:** levantar a stack base e o login único. **Sem funcionalidade financeira ainda.**

### Entregáveis técnicos

1. Repositório novo `pioneira-finance-v2` com estrutura monorepo (`backend/` + `frontend/` + `docs/`)
2. Docker Compose com 7 serviços: postgres, redis, keycloak, keycloak-db, backend, frontend, traefik
3. Banco `pioneira_finance_db` criado com schemas `identity`, `finance`, `integration`, `audit` (vazios)
4. Alembic configurado, primeira migration `0001_initial_schemas`
5. Keycloak realm `pioneira` provisionado, com clients `pioneira-insights-fe-v2` e `pioneira-insights-be-v2`
6. Backend FastAPI esqueleto com `/healthz`, validação JWT, swagger em `/docs`
7. Frontend React shell: login via Keycloak, página vazia "/painel" após login, logout
8. CI GitHub Actions: lint, type-check, test (vazio), build de imagem
9. Backup automatizado do Postgres (script `dump_diario.sh`)

### Critério de aceite

- [ ] Devolução: dev novo clona, roda `docker compose up`, acessa `http://localhost`, faz login com usuário seed, vê painel vazio, faz logout.
- [ ] Logs estruturados JSON com correlation_id batem entre frontend e backend.
- [ ] Healthcheck retorna `OK` para DB + Redis + Keycloak.

### Riscos

- **Risco:** Keycloak exige configuração específica de Traefik (TLS); pode atrasar.
  **Mitigação:** começa sem TLS local; TLS só na primeira deploy de produção.
- **Risco:** time não tem experiência com Alembic.
  **Mitigação:** padrão de PR exige revisão dupla de migration.

---

## Fase 1 — Caixa e Recebíveis

**Objetivo:** o sistema **já vira útil** para o operacional financeiro. CP, CR, conciliação básica e recebíveis GDF.

### Entregáveis

1. CRUD de **fornecedores** e **clientes** (telas + API)
2. CRUD de **contas a pagar** com workflow de aprovação por alçada
3. CRUD de **contas a receber**
4. **Adapter Workshop** (pull diário das categorias de custos)
5. **Adapter Bilhetagem** (pax mensal → receita técnica)
6. **Adapter GDF Repasses** (upload CSV — API quando disponível)
7. Módulo **Recebíveis GDF** (painel mensal com receita técnica × repasse efetivo)
8. **Conciliação bancária** versão 1 (upload OFX manual)
9. **Plano de contas** seed + tela de edição
10. **Parâmetros externos** com histórico (migração do v1 atual)
11. Migração one-shot dos dados do v1 (script `migrate_v1.py`)

### Critério de aceite

- [ ] Time financeiro consegue **lançar uma CP**, aprovar, dar baixa, ver no fluxo de caixa.
- [ ] Recebíveis GDF mostra os últimos 12 meses com dados reais.
- [ ] Conciliação bancária reconcilia ≥ 80% das transações via OFX automaticamente.

### Marco de validação com usuário

> Demo com o CFO em **4 semanas após início da fase**. Se aprovado, passa para F2.

---

## Fase 2 — Folha e RH (integração Globus/eSocial)

**Objetivo:** trazer folha decomposta REAL para dentro do sistema. Substituir os fallbacks calculados.

### Entregáveis

1. **Adapter Globus** (pull diário de `funcionarios_globus` ou snapshot completo)
2. **Adapter eSocial** (se possível — alternativa: SEFIP upload mensal)
3. Cálculo de folha decomposta (base + encargos + provisões) usando real quando disponível, calculado como fallback
4. Geração automática de CP nas competências de pagamento de 13º (novembro/dezembro) e férias (mês individual de cada colaborador)
5. Tela de **folha consolidada** com flags REAL / CALCULADO
6. Tela de **folha por funcionário** (com proteção LGPD — só RH e CFO veem)
7. Indicadores de RH: headcount, salário médio, custo médio por funcionário, turnover

### Critério de aceite

- [ ] Folha decomposta do último mês fechado bate com o que o RH apresenta (diferença < 1%)
- [ ] Provisões de 13º/férias geram CPs corretas no calendário
- [ ] Funcionário sai/entra no Globus → reflete no sistema em até 24h

### Risco principal

- **Globus pode não ter API pronta.** Mitigação: começar com leitura direto do banco (acesso read-only), evoluir para API quando empresa que mantém Globus liberar.

---

## Fase 3 — DRE Contábil + Tributos + Depreciação

**Objetivo:** entregar a **DRE de verdade** (não mais "operacional"). Sistema vira ferramenta contábil-gerencial.

### Entregáveis

1. **Adapter contábil/fiscal** (depende do sistema oficial usado pela Pioneira — pode ser arquivo SPED, integração ERP, ou cadastro manual no primeiro momento)
2. Módulo **Tributos** com calendário, base de cálculo, alíquotas, valor devido/pago
3. Módulo **Depreciação** alimentado por Adapter Workshop (frota com valor de aquisição) + cadastro manual de outros ativos
4. **DRE Contábil** completa: receita bruta → líquida → lucro bruto → EBITDA → LAIR → lucro líquido
5. Comparativo DRE mês × mês anterior × ano anterior
6. **Drilldown** em qualquer linha da DRE → lançamentos compositores
7. Exportação Excel e PDF da DRE

### Critério de aceite

- [ ] DRE bate com o fechamento contábil oficial do mês (diferença < 0,5%)
- [ ] Todas as 13+ rubricas do CTB tributário aparecem no sistema
- [ ] Depreciação mensal calculada para 100% da frota

---

## Fase 4 — Planejamento (Orçamento + Caixa Projetado)

**Objetivo:** olhar para frente. Caixa projetado, orçado vs realizado, alertas preditivos.

### Entregáveis

1. **Orçamento anual** (upload CSV ou tela de edição) por plano de contas + mês
2. Workflow de aprovação do orçamento (CFO + diretoria)
3. Versionamento (orçamento original + revisões)
4. Painel **Orçado × Realizado** com variações
5. **Fluxo de caixa projetado 12 meses** com Prophet (entradas) + conhecidas (CR futuras, CP aprovadas, folha, tributos)
6. Alertas:
   - Saldo projetado fica negativo
   - Variação realizado vs orçado > X%
   - Receita projetada cai > X%
7. Cenários (what-if): "e se cortar Y% da folha?"

### Critério de aceite

- [ ] CFO consegue subir orçamento do ano via Excel
- [ ] Comparativo orçado × realizado mostra todas as contas com cor de status
- [ ] Caixa projetado prevê o mês corrente com erro < 10% (calibrado em 3 meses retroativos)

---

## Fase 5 — BI Executivo + Alertas + Mobile

**Objetivo:** o sistema deixa de ser ferramenta operacional e vira **decisor companheiro**.

### Entregáveis

1. **Painel CFO** (1 tela única descrita em [05_MODULOS_FINANCEIROS.md](05_MODULOS_FINANCEIROS.md))
2. **Alertas inteligentes** entregues via:
   - Tela do sistema (badge no menu)
   - Email diário 06:00 com resumo do dia anterior + alertas
   - Push opcional via PWA
3. **Versão responsiva** do painel (executivo abre no celular)
4. **Relatório executivo mensal** PDF (1 página) gerado automaticamente no fechamento
5. **Exportação Excel** parametrizável (qualquer painel)
6. **Análise de cohortes** (ex: comportamento de glosa por trimestre)
7. Histórico arquivado: 5 anos de dados ficam consultáveis com performance OK

### Critério de aceite

- [ ] CFO usa o sistema diariamente (login ≥ 5 dias por semana por 30 dias)
- [ ] Alertas verdadeiros-positivos > 80% (reduz fadiga)
- [ ] Painel renderiza em < 2 segundos no celular 4G

---

## Backlog (depois de F5)

Itens que ficam fora do plano principal mas devem ser anotados:

- **Integração com banco real-time** (Open Finance ativo, não só leitura)
- **Pagamento programado** via API bancária (substitui geração de TED manual)
- **Auditoria preditiva** (IA detecta lançamentos anômalos antes do fechamento)
- **Reconhecimento de NF via OCR + IA** (input automático de CP)
- **Multi-empresa** (se a holding crescer)
- **Apps mobile nativos** (iOS/Android) — provavelmente desnecessário se PWA atender
- **Marketplace de relatórios** (financeiro escolhe analista cria template + compartilha)

---

## Princípios de execução

### Cada fase entrega valor isolado

Pode-se ir para produção ao fim de qualquer fase. F0 sozinha não tem valor de negócio — mas F1 já permite operacional financeiro funcionar.

### Não pular fases

DRE contábil completa (F3) **depende** de folha real (F2) e caixa (F1). Tentar começar pela DRE sem o resto leva a estimativas frágeis. Resistir à tentação.

### Revisão semanal com usuário

Toda sexta, 30 min com o controller + CFO mostrando o que avançou. Feedback influencia próxima sprint.

### Toda funcionalidade nasce com 3 coisas

1. **Testada** (cobertura ≥ 70% no domínio financeiro)
2. **Auditada** (registro em `audit.eventos`)
3. **Documentada** (1 página no `docs/REBUILD/` ou no module em si)

### Migração do v1 NÃO espera fim do v2

Assim que F1 estiver pronto, o time financeiro **migra** para o v2. Continua usando o v1 só para o que ainda não foi entregue. v1 vira read-only quando F3 completar.

---

## Critério para considerar o projeto entregue

Após F5:

- ✅ CFO usa todos os dias
- ✅ Fechamento mensal acontece **dentro do sistema** (não em planilha externa)
- ✅ Zero divergência com a contabilidade oficial
- ✅ Login único funciona em pioneira-insights + workshop + sgd + (transdata)
- ✅ Auditor externo consegue puxar trilha completa
- ✅ Sistema substituiu a planilha-master do financeiro

Quando os 6 acontecerem, o v2 está **pronto**. O backlog vira evolução, não rebuild.
