# 02 · Arquitetura

## Visão em camadas

```
┌─────────────────────────────────────────────────────────────────────┐
│ USUÁRIO (browser)                                                   │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FRONTEND  ·  React + TypeScript + Vite + Tailwind                   │
│ Roteamento, formulários, dashboards, gráficos (recharts), tabelas   │
└─────────────────────────────────────────────────────────────────────┘
                            │  (HTTPS · JWT do Keycloak)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND  ·  FastAPI + SQLAlchemy + Pydantic                         │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ API REST (camada de transporte)                                 │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ Casos de uso financeiros (DRE, fluxo, contas, recebíveis, ...)  │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ Domínio (entidades, regras de negócio puras)                    │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ Adapters: Workshop · Globus · Transdata · SGD · ANP · SEMOB ... │ │
│ │ Cada adapter encapsula 1 sistema externo                        │ │
│ ├─────────────────────────────────────────────────────────────────┤ │
│ │ Infraestrutura: Repositórios, ORM, Keycloak client, jobs        │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
        │                          │                          │
        ▼                          ▼                          ▼
┌────────────────┐      ┌────────────────────┐      ┌────────────────┐
│ PostgreSQL     │      │ Redis              │      │ Keycloak       │
│ pioneira_      │      │ cache · fila de    │      │ IdP central    │
│ finance_db     │      │ jobs assíncronos   │      │ (OIDC)         │
└────────────────┘      └────────────────────┘      └────────────────┘
                                   │
                                   ▼
                       ┌──────────────────────┐
                       │ JOBS (APScheduler /  │
                       │ Celery): sync com    │
                       │ sistemas externos    │
                       └──────────────────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
        ┌───────────────┐  ┌──────────────┐  ┌──────────────┐
        │ Workshop API  │  │ Globus API   │  │ Transdata    │
        │               │  │ /Hor. API    │  │ API          │
        └───────────────┘  └──────────────┘  └──────────────┘
                ▼                  ▼                  ▼
        ┌───────────────┐  ┌──────────────┐  ┌──────────────┐
        │ SGD API       │  │ ANP scraper  │  │ Open Finance │
        │               │  │ + SEMOB      │  │ (banco)      │
        └───────────────┘  └──────────────┘  └──────────────┘
```

## Stack tecnológica

### Backend

| Componente | Tecnologia | Por quê |
|---|---|---|
| Linguagem | Python 3.11 | Familiaridade do time; ecossistema de dados (Prophet, Pandas) |
| Framework HTTP | FastAPI | Pydantic nativo, OpenAPI automático, async |
| ORM | SQLAlchemy 2.x | Migrations via Alembic, mature, type hints |
| Validação | Pydantic v2 | Schemas compartilhados entre API e domínio |
| Tarefas agendadas | APScheduler (simples) → Celery + Redis (quando crescer) | Cron de sincronização |
| Cache | Redis | Idempotência de jobs, rate limit, sessão temporária |
| ML / Forecast | Prophet, scikit-learn | Reaproveitado do v1 |
| Cliente Keycloak | `python-keycloak` ou `authlib` | OIDC padrão |
| Tests | pytest + httpx + factory-boy | Unidade + integração |
| Lint / format | ruff + mypy | Padrão moderno |

### Frontend

| Componente | Tecnologia |
|---|---|
| Framework | React 18 + TypeScript |
| Build | Vite |
| Estilo | Tailwind CSS + componentes próprios (sem MUI/AntD para preservar consistência) |
| Estado servidor | TanStack Query (React Query) |
| Estado UI | Zustand para o necessário; preferir component-local |
| Roteamento | React Router v6 |
| Gráficos | Recharts |
| Auth | `oidc-client-ts` falando com Keycloak |

### Persistência

| Item | Escolha |
|---|---|
| Banco principal | PostgreSQL 16 |
| Migrations | Alembic |
| Schemas | `identity` · `finance` · `integration` · `audit` (separados, mesmo banco) |
| Backup | dump diário criptografado + retenção 30 dias |

### Identidade

| Item | Escolha |
|---|---|
| IdP | **Keycloak 24** self-hosted (Docker) |
| Protocolo | OIDC (Authorization Code com PKCE no frontend) |
| Token | JWT assinado RS256, expiração curta (15 min) + refresh token |
| MFA | TOTP opcional, configurável por grupo |

### Infraestrutura

| Item | Escolha |
|---|---|
| Orquestração local | Docker Compose |
| Orquestração futura | Kubernetes (opcional, fase posterior) |
| Reverse proxy | Traefik ou Nginx (TLS, roteamento por domínio) |
| Observabilidade | Logs estruturados JSON + Prometheus + Grafana (opcional na F0) |
| CI/CD | GitHub Actions (build, test, lint, image push) |

## Decisões arquiteturais (ADR resumidos)

### ADR-01: Banco próprio com snapshots dos sistemas externos
**Contexto:** o v1 lia direto de `workshop_db` e `controle_horarios_db`, acoplando o financeiro à evolução do operacional.
**Decisão:** o v2 mantém banco próprio (`pioneira_finance_db`). Dados de sistemas externos entram via Adapter → tabelas `integration.*_stage` → ETL → tabelas `finance.*`.
**Trade-off:** mais armazenamento, mais código de sincronização, latência maior (dados de até X horas atrás). **Ganho:** desacoplamento total, performance previsível, audit trail, possibilidade de reprocessar sem chamar a fonte.

### ADR-02: Keycloak como IdP central de TODOS os sistemas Pioneira
**Contexto:** hoje cada sistema (workshop, sgd, etc.) tem seu próprio login.
**Decisão:** sobe Keycloak. O sistema financeiro v2 nasce já integrado. Migrar os outros sistemas para Keycloak é tarefa separada (não bloqueia o v2). Enquanto isso, podemos sincronizar usuários por job.
**Trade-off:** um componente novo de infra para manter. **Ganho:** SSO real, gestão centralizada de permissões, auditoria de login.

### ADR-03: Adapter Pattern por sistema-fonte
**Contexto:** cada sistema externo tem sua própria API (ou banco) e seu próprio modelo.
**Decisão:** uma classe Adapter por sistema, com interface clara: `def sync(self, since: datetime) -> SyncResult`. Adapter fala com a API externa e popula tabela `integration.{sistema}_stage`. ETL separado normaliza pro `finance.*`.
**Trade-off:** mais classes. **Ganho:** isolamento; trocar fonte (ex.: API → CSV manual → ERP) sem mexer no domínio.

### ADR-04: Receita teórica e receita real coexistem
**Contexto:** o v1 confundiu "receita técnica" (pax × tarifa) com "receita recebida".
**Decisão:** modelo de dados separa `receita_tecnica_calculada` (derivada) de `recebimento_efetivo` (lançamento financeiro). UI sempre mostra os dois.
**Trade-off:** mais granularidade. **Ganho:** o CFO sabe sempre o que está olhando.

### ADR-05: APScheduler agora, Celery quando precisar
**Contexto:** começar simples.
**Decisão:** F0/F1 usam APScheduler in-process. Quando o volume de jobs justificar (ex.: >100 jobs/dia ou jobs longos paralelos), migrar para Celery + Redis.
**Trade-off:** refator futuro. **Ganho:** velocidade inicial.

### ADR-06: Sem CQRS, sem Event Sourcing
**Contexto:** sistemas financeiros podem cair na armadilha de over-engineering.
**Decisão:** modelo simples (Active Record / Repository). Audit log explícito para reconstrução. CQRS só quando ler ≠ escrever for justificado.

## Não-funcionais

### Segurança

- TLS obrigatório (Traefik com Let's Encrypt em produção)
- JWT validado em toda rota não-pública (dependency injection do FastAPI)
- Permissões por **role** (no JWT) e por **scope** (recurso/ação)
- Secrets em **vault** (HashiCorp Vault ou variáveis de ambiente do Docker Secrets)
- Logs **não** registram dados sensíveis (folha individual, CPF, etc.)
- Rate limit por usuário por endpoint
- CORS restrito aos domínios oficiais

### Performance

- Endpoints síncronos devem responder em <500ms p95
- Jobs assíncronos para tudo que toca API externa
- Queries com `EXPLAIN ANALYZE` para qualquer SELECT em tabela >100k linhas
- Cache Redis para dados pouco mutáveis (parâmetros externos, perfis de usuário)

### Auditabilidade

- Toda escrita em `finance.*` gera registro em `audit.eventos`
- Cada lançamento financeiro retém: `origem_sistema`, `origem_id_externo`, `criado_por`, `criado_em`, `atualizado_por`, `atualizado_em`, `versao` (otimista)
- Alterações de parâmetro externo ficam em `audit.alteracoes_param` (snapshot antes/depois)

### Observabilidade

- Logs JSON com correlation_id por request
- Métricas Prometheus: requests por endpoint, latência, erros, jobs (duração, sucesso)
- Healthcheck em `/healthz` (DB + Redis + Keycloak)
- Dashboard Grafana com painel "estado dos sistemas-fonte" (último sync, latência, erros)

## Deploy

### Docker Compose (desenvolvimento e produção on-prem)

Serviços:

```yaml
services:
  postgres:        # banco financeiro próprio
  redis:           # cache + fila
  keycloak:        # IdP
  keycloak-db:     # postgres dedicado do keycloak
  backend:         # FastAPI
  frontend:        # nginx + build estático
  jobs:            # mesmo backend, mas roda só os jobs (separado para isolar carga)
  traefik:         # reverse proxy + TLS
```

Volumes persistentes para `postgres`, `redis`, `keycloak-db`, `traefik` (certificados).

### Variáveis de ambiente

Todas em `.env` segregado por ambiente (`.env.dev`, `.env.prod`). Nada commitado.

Categorias:
- `DATABASE_URL`, `REDIS_URL`
- `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`
- Para cada adapter externo: `WORKSHOP_API_URL`, `WORKSHOP_API_TOKEN`, etc.
- Parâmetros econômicos (tarifa, multa, etc.) **ainda lidos do `.env`** mas espelhados em tabela `finance.parametros_externos` para histórico

### Migração de dados do v1

Script único `migrate_v1_to_v2.py`:
1. Lê tabelas `repasses_gdf`, `consumo_custos_mensal`, `ipk_mensal` do banco workshop
2. Materializa em `finance.contas_receber`, `finance.contas_pagar` (categorizadas), `finance.receita_tecnica_mensal`
3. Audit trail: registra origem `migracao_v1`

Roda **uma vez** no go-live. Depois, sincronização é via Adapter.
