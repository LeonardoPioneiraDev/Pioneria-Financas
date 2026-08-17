# CLAUDE.md

Sistema financeiro v2 da Viação Pioneira. Monorepo `apps/backend` (Fastify) + `apps/frontend` (Next.js 15) + `packages/shared` (TypeBox). Blueprints de planejamento detalhados em `Leia/`.

## Estrutura

- `apps/FinancasBackend/` (pkg `@pioneira/financas-backend`) — Fastify + TypeORM + TypeBox. Plugins de infra em `src/plugins/`, módulos em `src/modules/<feature>/`.
- `apps/FinancasFrontend/` (pkg `@pioneira/financas-frontend`) — Next.js 15 App Router. Route groups `(auth)/` e `(private)/`. Contexts em `src/contexts/`, componentes shadcn em `src/components/ui/`.
- `packages/shared/` — schemas TypeBox + enums compartilhados. **Sempre** importar tipos daqui (`@pioneira/shared`), não duplicar.
- `Leia/` — visão, arquitetura, banco, integrações, módulos, roadmap. Fonte de verdade para escopo.

## Stack

**Backend:** Fastify · TypeBox (`@sinclair/typebox`) · TypeORM + PostgreSQL · `@fastify/jwt` · BullMQ + Redis · nodemailer (SMTP) · `fastify.log` nativo · Node.js ESM com `@/* → src/*` e imports `.js`.

**Frontend:** Next.js 15 (App Router) + React 19 + Turbopack · Tailwind v4 + Radix (shadcn) · TanStack Query · Axios com interceptor JWT + refresh · React Hook Form + Zod · Sonner.

## Comandos

```powershell
# Setup inicial
pnpm install
pnpm docker:up                                   # postgres + redis + mailhog
pnpm --filter @pioneira/financas-backend migration:run    # roda migrations
pnpm --filter @pioneira/financas-backend seed:admin       # cria admin (vars SEED_ADMIN_*)

# Desenvolvimento
pnpm dev                                         # back + front em paralelo via turbo
pnpm --filter @pioneira/financas-backend dev              # só backend (porta 3333)
pnpm --filter @pioneira/financas-frontend dev             # só frontend (porta 3000)

# Validação (rodar SEMPRE após alterar código)
pnpm typecheck
pnpm build
pnpm lint

# DB
pnpm --filter @pioneira/financas-backend migration:generate src/migrations/NomeDaMudanca
pnpm --filter @pioneira/financas-backend migration:revert

# Docker
pnpm docker:up   pnpm docker:down   pnpm docker:logs
```

URLs locais: backend `http://localhost:3333` · Swagger `/docs` · frontend `http://localhost:3000` · Mailhog `http://localhost:8025`.

## Regras críticas

1. `any` é **proibido**. Usar generics, utility types ou criar interface. Se não sabe o tipo, lê o código-fonte.
2. Timezone: todo dado temporal em `America/Sao_Paulo`. Nunca `new Date()` direto — usar utilitário de timezone.
3. **Duplicação > acoplamento errado.** Preferir duplicar entre módulos a abstrair prematuramente.
4. Dados sensíveis (senhas, hashes, tokens) **nunca** retornam na API.
5. Server Components por padrão no Next.js. `'use client'` só com hooks/eventos.
6. Optimistic UI com `onMutate` do React Query. Spinner em mutation simples é inaceitável.
7. Services como **factory functions** (`function buildXService(fastify)`), nunca classes/singletons.
8. Dependências via decorators do Fastify (`fastify.db`, `fastify.log`), nunca imports diretos.
9. Plugins de infra (`src/plugins/`) usam `fastify-plugin`; módulos de feature (`src/modules/`) **não usam** `fp()`.
10. Migrations via TypeORM. `synchronize: true` proibido em prod. Colunas de data: `timestamptz`. Tabelas/colunas: `snake_case`.
11. UI, variáveis de domínio e commits em **português brasileiro**, **sempre com acentuação correta** (é, ã, ç, õ, ê, í, ó, ú, à...). Nunca escrever texto visível ao usuário (labels, placeholders, mensagens de erro/toast, tooltips, textos de ajuda) sem acento — "período" não "periodo", "até" não "ate", "não" não "nao", "está"/"estão" não "esta"/"estao", "você" não "voce", "código" não "codigo". Revisar o texto escrito antes de finalizar a resposta quando a tarefa envolver criar ou editar texto em português.

## Princípios herdados do v1 (ver `Leia/01_VISAO.md`)

- "Quando não tem dado, o sistema diz que não tem." Nunca interpolar em silêncio. Estados explícitos: `real` · `calculado` · `projetado` · `sem dado`.
- Todo número é rastreável até a fonte (`origem_sistema`, `origem_id_externo`, `método`).
- Receita técnica (Pax × Tarifa SEMOB) **nunca** é apresentada como receita real (repasse GDF).
- Dados externos **não** são lidos em runtime — sempre via snapshot em `integration.*_stage`.

## Gotchas

- Valores monetários: **sempre em centavos (BIGINT)**, nunca `NUMERIC`. Evita drift em operações pesadas.
- Multi-tenant ready: toda tabela financeira tem `empresa_id` (hoje sempre = 1).
- Schemas Postgres separados: `identity` · `finance` · `integration` · `audit`. Ver `Leia/03_BANCO_DE_DADOS.md`.
- **TypeBox no backend, Zod no frontend.** TypeBox é o padrão da equipe e gera JSON Schema nativo no Fastify; Zod fica só nas validações de formulário do Next.js (via `@hookform/resolvers/zod`). Não misturar.
- Imports do backend usam extensão `.js` mesmo em arquivos `.ts` (ESM com `"module": "NodeNext"`).
- `packages/shared` exporta os schemas TypeBox — **sempre** importar de `@pioneira/shared` em vez de redefinir.
- Stack docs em `Leia/02_ARQUITETURA_NODE.md` cita Zod/Prisma — desatualizado em relação à decisão final (TypeBox/TypeORM). Alinhar docs quando sobrar tempo.

## Fluxo de trabalho

1. Antes de implementar, **ler** os arquivos afetados em `Leia/` + qualquer código existente. Não assumir nomes, tipos ou paths.
2. Para mudanças grandes, descrever o plano antes de codar.
3. Gerar código completo — nunca `// ...resto do código`.
4. Após implementar, rodar typecheck/build da app afetada (quando existir) para validar.
