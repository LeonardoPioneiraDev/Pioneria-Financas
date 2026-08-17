# Pioneira Insights — Sistema Financeiro v2

Documentação do sistema financeiro da Viação Pioneira (Brasília-DF). **Banco de dados próprio** + **integrações via API** com os demais sistemas da empresa (sem duplicação de dados, login único).

> Pasta vinha sendo blueprint do que viria depois. Agora mistura **planejamento** (docs 01-06) com **realidade já entregue** (`ESTADO_ATUAL.md` + docs específicos de módulos).

## Começo aqui

| Documento | Para quem |
|---|---|
| 🆕 [Estado atual do sistema](ESTADO_ATUAL.md) | **Comece aqui.** Snapshot do que está em produção, em construção, planejado |
| 🆕 [Sprint atual](sprints/sprint-atual.md) | O que está sendo construído AGORA · objetivo · definition of done |
| [Backlog](sprints/backlog.md) | Próximas sprints candidatas, priorizadas |
| [Roadmap](06_ROADMAP.md) | Sequência de entregas macro — fases F0 → F5 |

## Documentos de módulos (em produção)

| Módulo | Documento |
|---|---|
| **Recebíveis GDF** (BRB Mobilidade) | [`recebiveis-gdf.md`](recebiveis-gdf.md) |
| **Fluxo de Caixa** | [`fluxo-caixa.md`](fluxo-caixa.md) |
| **Sync e observabilidade** (transversal) | [`sync-e-observabilidade.md`](sync-e-observabilidade.md) |
| **CP — status divergente do Globus** | [`cp-status-divergencia-globus.md`](cp-status-divergencia-globus.md) |
| **Validação e Conferência** (transversal) | [`padrao-validacao-conferencia.md`](padrao-validacao-conferencia.md) |
| **Folha — Detalhamento FLP** | [`folha-flp-detalhamento.md`](folha-flp-detalhamento.md) |

## Blueprint (planejamento original)

| # | Documento | O que cobre |
|---|---|---|
| 01 | [Visão](01_VISAO.md) | Problema, público, princípios não-negociáveis, escopo |
| 02 | [Arquitetura · Node/Fastify](02_ARQUITETURA_NODE.md) | **Stack escolhida** (Node) — `02_ARQUITETURA.md` (Python) é alternativa não-adotada |
| 03 | [Banco de Dados](03_BANCO_DE_DADOS.md) | Schemas `identity`, `finance`, `integration`, `audit` |
| 04 | [Identidade & Integrações](04_IDENTIDADE_INTEGRACOES.md) | Keycloak SSO, Adapter Pattern, jobs |
| 05 | [Módulos Financeiros](05_MODULOS_FINANCEIROS.md) | DRE, fluxo de caixa, CP/CR, folha, tributos, orçado vs realizado |
| 06 | [Roadmap](06_ROADMAP.md) | Fases F0 → F5 |

## Referência técnica do Globus

| Documento | Cobre |
|---|---|
| [Globus — Tabelas financeiras (NF/CPG)](globus-tabelas-financeiras-documentacao.md) | BGM_NOTAFISCAL, CPGDOCTO, EST_ITENSNF, CPGITDOC, etc. |
| [Globus — Contas a Receber e Caixa](globus-contas-receber-caixa.md) | CRCDOCTO, BCOMOVTO, BCOHISTO |
| [Folha — Detalhamento FLP](folha-flp-detalhamento.md) | FLP_FICHAEVENTOS, EVENTOS, VW_FUNCIONARIOS, COMPETFICHA |
| [Arrecadação operacional](globus-arrecadacao-operacional.md) | T_ARR_GUIA, T_ARR_VIAGENS_GUIA, BGM_CADLINHAS, tarifas SEMOB |
| [Previsão de fluxo de caixa (modelo original)](previsao-fluxo-caixa.md) | Forecast, REFERENCIA Praxio (HHH.MM), modelo canônico |
| [Exploração Globus 2026-05-18](globus-exploracao-2026-05-18.md) | Mapeamento inicial das tabelas |

## Padrões corporativos (reusáveis em outros sistemas)

| Padrão | Documento | O que padroniza |
|---|---|---|
| **Validação e Conferência** | [`padrao-validacao-conferencia.md`](padrao-validacao-conferencia.md) | Como colocar um sistema em produção com os números conferidos pelo negócio e prova documental de quem conferiu — papéis, trilha sequencial, ressalvas, aval, notificações e relatório |

## Decisões já tomadas (fixadas em código)

- **Backend:** Node 20 + Fastify + TypeBox + TypeORM + BullMQ — decisão registrada no `CLAUDE.md` e implementada
- **Frontend:** Next.js 15 (App Router) + React 19 + Tailwind v4 + Radix + TanStack Query
- **Banco:** PostgreSQL próprio (`pioneira_finance_db`) com schemas `identity` / `finance` / `integration` / `audit`
- **Tipos compartilhados:** monorepo pnpm + `packages/shared` (schemas TypeBox)
- **Identidade:** JWT próprio (Keycloak SSO ficou pra Fase 6 — não bloqueia entrega)
- **Hospedagem:** Docker Compose on-premise

> O documento `02_ARQUITETURA.md` (Python/FastAPI) está mantido como referência histórica da decisão. O caminho adotado é o Node/Fastify (`02_ARQUITETURA_NODE.md`).

## Princípios herdados do v1 (não-negociáveis)

- **Auditabilidade total** — toda visualização de dado sensível registra `audit.acesso_dados`
- **Fronteira explícita** — dados externos sempre via snapshot em `integration.*_stage`, nunca em runtime
- **"Quando não tem dado, dizemos que não tem"** — proibido interpolar em silêncio. Estados `real` · `calculado` · `projetado` · `sem dado`
- **Receita técnica nunca apresentada como receita real** — cruzamento sempre explícito

## Como navegar

1. Comece em [`ESTADO_ATUAL.md`](ESTADO_ATUAL.md) pra ver o que está pronto hoje
2. Leia [`01_VISAO.md`](01_VISAO.md) pra entender o porquê do sistema
3. Para um módulo específico em produção, consulte o doc dedicado (ex.: [`recebiveis-gdf.md`](recebiveis-gdf.md))
4. Para construir um módulo novo, consulte [`sync-e-observabilidade.md`](sync-e-observabilidade.md) (padrões obrigatórios) e [`03_BANCO_DE_DADOS.md`](03_BANCO_DE_DADOS.md)
5. [`06_ROADMAP.md`](06_ROADMAP.md) mostra a sequência completa e o que vem a seguir
