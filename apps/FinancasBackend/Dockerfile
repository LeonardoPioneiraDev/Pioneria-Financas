# syntax=docker/dockerfile:1.7

# ============================================================================
# Backend (@pioneira/financas-backend) — multi-stage Dockerfile
#
# Build context esperado: raiz do monorepo (Pioneira-Financas/)
#   docker build -f apps/FinancasBackend/Dockerfile -t pioneira/financas-backend .
#
# Imagem final: ~250MB (debian-slim + node + node_modules de produção).
# Por que Debian e não Alpine? `oracledb` baixa binários nativos linkados contra
# glibc. Mesmo com ORACLE_ENABLED=false a lib é carregada — Alpine quebra.
# ============================================================================

ARG NODE_VERSION=20

# ---------- 1) base com pnpm ----------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# ---------- 2) deps (pnpm install) ----------
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/FinancasBackend/package.json apps/FinancasBackend/
# Frontend não é necessário aqui mas o lock precisa dele para resolver.
COPY apps/FinancasFrontend/package.json apps/FinancasFrontend/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@pioneira/financas-backend..." --filter "@pioneira/shared"

# ---------- 3) build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/apps/FinancasBackend/node_modules ./apps/FinancasBackend/node_modules
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/FinancasBackend apps/FinancasBackend
# Compila shared primeiro (dependência) e depois backend.
# `--force` no shared build pra ignorar cache do composite-tsbuildinfo (que pode
# ter sido herdado do contexto local de build).
RUN pnpm --filter @pioneira/shared build \
 && ls -la packages/shared/dist/index.* \
 && pnpm --filter @pioneira/financas-backend build

# ---------- 4) prod deps (sem devDependencies) ----------
FROM base AS prod-deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/FinancasBackend/package.json apps/FinancasBackend/
COPY apps/FinancasFrontend/package.json apps/FinancasFrontend/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@pioneira/financas-backend..." --filter "@pioneira/shared"

# ---------- 5) runtime mínimo ----------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
# Imagem base já vem com ca-certificates. Init system fornecido por `init: true`
# no docker-compose (flag nativa) — evita dependência de apt-get que pode falhar
# em redes com DNS instável.

# Oracle Instant Client (Modo Thick) — versão DOCKER (Linux x64).
#  - libaio1: OBRIGATÓRIO (o client linka libaio.so.1; sem ele: DPI-1047). FICA no runtime.
#  - wget/unzip: o bookworm-slim NÃO traz — instala só pra baixar/extrair e remove depois.
# O caminho local (Windows) do dev vive no .env (ORACLE_CLIENT_PATH); aqui é /opt/oracle/instantclient.
WORKDIR /tmp
RUN apt-get update \
 && apt-get install -y --no-install-recommends wget unzip libaio1 ca-certificates \
 && mkdir -p /opt/oracle \
 && wget -q https://download.oracle.com/otn_software/linux/instantclient/1923000/instantclient-basic-linux.x64-19.23.0.0.0dbru.zip \
 && wget -q https://download.oracle.com/otn_software/linux/instantclient/1923000/instantclient-sqlplus-linux.x64-19.23.0.0.0dbru.zip \
 && unzip -o instantclient-basic-linux.x64-19.23.0.0.0dbru.zip -d /opt/oracle/ \
 && unzip -o instantclient-sqlplus-linux.x64-19.23.0.0.0dbru.zip -d /opt/oracle/ \
 && mv /opt/oracle/instantclient_19_23 /opt/oracle/instantclient \
 && rm -f /tmp/instantclient-*.zip \
 && apt-get purge -y wget unzip && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo
ENV BACKEND_HOST=0.0.0.0
ENV BACKEND_PORT=3333
ENV ORACLE_ENABLED=false

# Oracle environment. ORACLE_CLIENT_PATH é o que o CÓDIGO lê (initOracleClient libDir).
# No Docker é sempre este caminho; no dev (Windows) vem do .env com o caminho local.
ENV ORACLE_HOME=/opt/oracle/instantclient
ENV LD_LIBRARY_PATH=/opt/oracle/instantclient
ENV PATH=/opt/oracle/instantclient:$PATH
ENV ORACLE_CLIENT_PATH=/opt/oracle/instantclient

WORKDIR /app

# node_modules de produção
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps /app/apps/FinancasBackend/node_modules ./apps/FinancasBackend/node_modules

# Build artifacts
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/apps/FinancasBackend/dist ./apps/FinancasBackend/dist
COPY --from=build /app/apps/FinancasBackend/package.json ./apps/FinancasBackend/package.json

# Roda como usuário não-root (segurança)
RUN groupadd -r app && useradd -r -g app app && chown -R app:app /app
USER app

EXPOSE 3333

# healthcheck — confia que /health responde
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.BACKEND_PORT||3333)+'/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "apps/FinancasBackend/dist/server.js"]
