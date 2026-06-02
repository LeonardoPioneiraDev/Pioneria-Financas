# Pioneira Financas v2

Sistema financeiro v2 da Viacao Pioneira - monorepo com backend Fastify, frontend Next.js e Postgres com snapshots dos sistemas legados.

> Documentacao de planejamento detalhada em [`Leia/`](./Leia/). Leia primeiro `Leia/01_VISAO.md` para entender o porque do rebuild.

## Stack

- **Backend:** Fastify + TypeORM + TypeBox + `@fastify/jwt` + BullMQ + nodemailer (SMTP)
- **Frontend:** Next.js 15 (App Router) + Tailwind v4 + Radix/shadcn + TanStack Query + React Hook Form + Zod
- **Banco:** PostgreSQL 16 com 4 schemas (`identity`, `finance`, `integration`, `audit`)
- **Infra dev:** Docker Compose (Postgres + Redis + Mailhog + opcional pgAdmin)
- **Monorepo:** pnpm workspaces + Turborepo

## Quickstart

```powershell
# 1. Pre-requisitos: Node 20+, pnpm 9+, Docker Desktop

# 2. Instalar dependencias do monorepo
pnpm install

# 3. Subir infra de desenvolvimento (postgres + redis + mailhog)
cp .env.example .env
pnpm docker:up

# 4. Rodar migrations
pnpm --filter @pioneira/financas-backend migration:run

# 5. Criar o primeiro admin
$env:SEED_ADMIN_EMAIL="admin@vpioneira.com.br"
$env:SEED_ADMIN_NOME="Administrador Inicial"
$env:SEED_ADMIN_SENHA="TrocaIsso123"
pnpm --filter @pioneira/financas-backend seed:admin

# 6. Subir backend e frontend (dois terminais ou em paralelo via turbo)
pnpm dev
```

- Backend: <http://localhost:3333> · Swagger: <http://localhost:3333/docs>
- Frontend: <http://localhost:3000>
- Mailhog (emails de teste): <http://localhost:8025>
- pgAdmin (opcional, profile `tools`): `docker compose --profile tools up -d` → <http://localhost:8080>

## Estrutura

```
pioneira-financas/
├── apps/
│   ├── FinancasBackend/      Fastify + TypeORM    (@pioneira/financas-backend)
│   └── FinancasFrontend/     Next.js 15 App Router (@pioneira/financas-frontend)
├── packages/
│   └── shared/               Schemas TypeBox compartilhados FE/BE
├── infra/
│   └── postgres/init/        SQL de bootstrap dos schemas
├── Leia/                     Blueprint de planejamento (visao, arquitetura, banco, modulos, roadmap)
├── docker-compose.yml
└── CLAUDE.md                 Instrucoes para Claude Code
```

## Escopo entregue (MVP de auth)

- Login com email/senha · refresh token · logout
- Cadastro de usuarios admin-only com convite por email (link expira em 48h)
- Recuperacao de senha por email (link expira em 1h)
- Definicao de senha em primeiro acesso
- Captura de `request_logs`, `user_activity_logs` e `user_page_views` (audit trail)
- Painel admin de usuarios (CRUD + reenvio de convite + ativar/desativar)
- Tema claro/escuro com paleta institucional Pioneira
- Rate limiting global + por endpoint sensivel (login, forgot, reset)

## Proximos passos

- F1 - Caixa e Recebiveis (CR/CP, GDF, conciliacao)
- F2 - Folha (integracao Globus)
- F3 - DRE + Tributos + Depreciacao
- F4 - Orcamento e Caixa projetado
- F5 - Painel CFO + Alertas

Sequencia detalhada em `Leia/06_ROADMAP.md`.
