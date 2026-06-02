# syntax=docker/dockerfile:1.7

# ============================================================================
# Frontend (@pioneira/financas-frontend) — multi-stage Dockerfile
#
# Build context esperado: raiz do monorepo (Pioneira-Financas/)
#   docker build -f apps/FinancasFrontend/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=http://localhost:3333 \
#     -t pioneira/financas-frontend .
#
# Usa output='standalone' do Next.js → imagem final ~180MB.
# ============================================================================

ARG NODE_VERSION=20

# ---------- 1) base com pnpm ----------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# ---------- 2) deps ----------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/FinancasFrontend/package.json apps/FinancasFrontend/
COPY apps/FinancasBackend/package.json apps/FinancasBackend/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@pioneira/financas-frontend..." --filter "@pioneira/shared"

# ---------- 3) build ----------
FROM base AS build
# NEXT_PUBLIC_* precisa estar disponível EM TEMPO DE BUILD pois é inlined no JS.
ARG NEXT_PUBLIC_API_URL=http://localhost:3333
ARG NEXT_PUBLIC_APP_NAME="Pioneira Financas"
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/FinancasFrontend/node_modules ./apps/FinancasFrontend/node_modules
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/FinancasFrontend apps/FinancasFrontend

# Compila shared (consumido como type-only no front) e depois Next.js.
RUN pnpm --filter @pioneira/shared build \
 && ls -la packages/shared/dist/index.* \
 && pnpm --filter @pioneira/financas-frontend build

# ---------- 4) runtime ----------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
# Init system fornecido pelo `init: true` do docker-compose. Sem apt-get.

ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# Next standalone gera /apps/FinancasFrontend/.next/standalone/ com tudo embutido.
# Estrutura: standalone/ + standalone/apps/FinancasFrontend/server.js
COPY --from=build /app/apps/FinancasFrontend/.next/standalone ./
COPY --from=build /app/apps/FinancasFrontend/.next/static ./apps/FinancasFrontend/.next/static
COPY --from=build /app/apps/FinancasFrontend/public ./apps/FinancasFrontend/public

RUN groupadd -r app && useradd -r -g app app && chown -R app:app /app
USER app

EXPOSE 3001

HEALTHCHECK --interval=20s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)).then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "apps/FinancasFrontend/server.js"]
