# Pioneira-Financas — Subir via Docker

Stack completo em containers: PostgreSQL + Redis + Mailhog + Backend (Fastify) + Frontend (Next.js 15).

## Dois ambientes, dois arquivos `.env`

| Cenário | Arquivo | Como subir |
|---|---|---|
| **Desenvolvimento** (codar no laptop, hot reload) | `.env` | `pnpm dev` |
| **Docker** (qualquer máquina, tudo em container) | `.env.docker` | `pnpm docker:app:rebuild` |

Os dois são `.gitignore` — só os `*.example` são versionados.

Diferenças principais:

| | `.env` (dev) | `.env.docker` |
|---|---|---|
| `DATABASE_HOST` | `localhost` (porta exposta 5435) | (não usa, compose passa `postgres` interno) |
| `ORACLE_ENABLED` | `true` (acessa Globus 10.0.1.191) | `false` (sem rede da empresa) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3333` | URL onde os usuários acessam (ex.: `http://10.10.100.176:3333`) |
| `APP_URL` | `http://localhost:3001` | URL pública do frontend |

## 1. Pré-requisitos

- Docker Desktop 4.20+ (ou Docker Engine 24+ com Compose v2)
- 4GB RAM livre, ~3GB disco

## 2. Configurar variáveis de ambiente do Docker

```powershell
# Na raiz do projeto — cria .env.docker a partir do template
cp .env.docker.example .env.docker
```

Abra `.env.docker` e ajuste **pelo menos**:

```env
DATABASE_PASSWORD=algo_forte_aqui
JWT_SECRET=cole_o_resultado_de_openssl_rand_base64_64
```

Gere o `JWT_SECRET`:

```powershell
# Windows (Git Bash ou WSL):
openssl rand -base64 64

# Ou em PowerShell puro:
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

> ⚠ **`ORACLE_ENABLED=false`** por padrão — o sistema funciona sem o Globus, lendo apenas
> dados que já foram sincronizados para o Postgres. Para reativar o Oracle você precisa de VPN
> da empresa + Oracle Instant Client no container.

## 2.1 ⚠ Acesso pela rede (outras máquinas vão usar)

Se o servidor Docker é uma máquina (ex.: `10.10.100.176`) e outras pessoas vão acessar pelo IP, edite `.env.docker`:

```env
APP_URL=http://10.10.100.176:3001
NEXT_PUBLIC_API_URL=http://10.10.100.176:3333
CORS_ORIGINS=http://10.10.100.176:3001
```

**Por quê?**
- `NEXT_PUBLIC_API_URL` é "baked" no JS do browser — se ficar `localhost`, o browser do colega tenta achar o backend na máquina dele.
- `CORS_ORIGINS` libera o domínio/IP no backend (apesar do CORS já liberar qualquer IP de rede privada `10.x` / `172.16-31.x` / `192.168.x`).
- `APP_URL` é a referência canônica usada em e-mails, redirecionamentos.

**Firewall do Windows** — libere as portas 3001 e 3333:

```powershell
# Como Admin no servidor (PowerShell elevado)
New-NetFirewallRule -DisplayName "Pioneira Financas Frontend (3001)" `
  -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Private,Domain

New-NetFirewallRule -DisplayName "Pioneira Financas Backend (3333)" `
  -Direction Inbound -Protocol TCP -LocalPort 3333 -Action Allow -Profile Private,Domain
```

> **Importante**: depois de editar `NEXT_PUBLIC_API_URL`, é obrigatório **REBUILDAR** (não basta `restart`) — a URL é compilada no JS estático.

## 3. Subir o stack completo

```powershell
# Build + sobe tudo (postgres, redis, mailhog, backend, frontend)
pnpm docker:app:rebuild

# Ou em duas etapas (mais explícito)
pnpm docker:app:build       # constrói as imagens
pnpm docker:app:up          # sobe os containers
```

Primeira execução leva uns **3-5 minutos** (pnpm install + build do Next + build do backend).
Builds seguintes usam cache → ~30 segundos.

## 4. URLs disponíveis

| Serviço | URL | Login |
|---|---|---|
| Frontend | http://localhost:3001 | (criar com seed:admin) |
| Backend API | http://localhost:3333 | — |
| Swagger | http://localhost:3333/docs | — |
| Mailhog (e-mails) | http://localhost:8025 | — |
| pgAdmin (opcional) | http://localhost:8080 | admin@vpioneira.com.br / admin |

Para subir pgAdmin junto:

```powershell
docker compose --profile app --profile tools up -d
```

## 5. Criar usuário admin (primeira vez)

```powershell
# Rodar dentro do container backend
docker exec -it pioneira-financas-backend node apps/FinancasBackend/dist/scripts/seed-admin.js
```

Ou via variável de ambiente:

```powershell
docker exec -e SEED_ADMIN_EMAIL=admin@vpioneira.com.br -e SEED_ADMIN_PASSWORD=Senha@123 `
  -it pioneira-financas-backend node apps/FinancasBackend/dist/scripts/seed-admin.js
```

## 6. Rodar migrations no banco

As migrations rodam automaticamente no startup do backend (se houver pendentes). Mas se quiser forçar:

```powershell
docker exec -it pioneira-financas-backend node apps/FinancasBackend/dist/scripts/run-migrations.js
```

## 7. Comandos do dia-a-dia

```powershell
pnpm docker:app:logs          # ver logs do backend + frontend
pnpm docker:app:down          # parar tudo (mantém volumes)
docker compose --profile app down -v   # parar e DELETAR dados do banco
```

Apenas reinício do backend:

```powershell
docker compose restart backend
```

Para entrar num container:

```powershell
docker exec -it pioneira-financas-backend sh
docker exec -it pioneira-financas-postgres psql -U pioneira -d pioneira_finance_db
```

## 8. Debug — algo deu errado

### Backend não sobe — "JWT_SECRET indefinido"

Você esqueceu de criar o `.env`. Faça `cp .env.docker.example .env` e edite.

### Frontend buildou mas chama `/api/...` e dá 404

A URL `NEXT_PUBLIC_API_URL` foi "baked" errada no build. **NEXT_PUBLIC_* só pega no build**:

```powershell
# Edite .env, depois:
pnpm docker:app:rebuild
```

### Quero ver o que tem no banco

```powershell
docker exec -it pioneira-financas-postgres psql -U pioneira -d pioneira_finance_db -c "\dt+ finance.*"
```

### Habilitar Oracle/Globus em produção

Edite `.env`:

```env
ORACLE_ENABLED=true
ORACLE_HOST=10.0.1.191
ORACLE_PORT=1521
ORACLE_SERVICE_NAME=...
ORACLE_USER=...
ORACLE_PASSWORD=...
```

E **modifique o Dockerfile do backend** para instalar o Oracle Instant Client.
Adicione antes do `FROM node:${NODE_VERSION}-bookworm-slim AS runtime`:

```dockerfile
# Instala Instant Client da Oracle
RUN apt-get update && apt-get install -y libaio1 wget unzip \
 && wget -q https://download.oracle.com/otn_software/linux/instantclient/instantclient-basic-linux.zip -O /tmp/ic.zip \
 && unzip /tmp/ic.zip -d /opt/oracle && rm /tmp/ic.zip \
 && mv /opt/oracle/instantclient_* /opt/oracle/instantclient \
 && echo "/opt/oracle/instantclient" > /etc/ld.so.conf.d/oracle.conf && ldconfig
ENV LD_LIBRARY_PATH=/opt/oracle/instantclient
ENV ORACLE_CLIENT_PATH=/opt/oracle/instantclient
```

E rebuilde: `pnpm docker:app:rebuild`.

## 9. Atualizar o sistema (deploy)

```powershell
git pull
pnpm docker:app:rebuild
```

As migrations pendentes rodam automaticamente. Os volumes do Postgres são preservados.

## 10. Backup do banco

```powershell
docker exec pioneira-financas-postgres pg_dump -U pioneira -d pioneira_finance_db -F c > backup-$(Get-Date -Format yyyyMMdd).dump
```

Restore:

```powershell
Get-Content backup-20260515.dump | docker exec -i pioneira-financas-postgres pg_restore -U pioneira -d pioneira_finance_db --clean
```
