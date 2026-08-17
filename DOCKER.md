# Pioneira-Financas — Subir via Docker

Stack completo em containers: PostgreSQL + Redis + Mailhog + Backend (Fastify) + Frontend (Next.js 15).

## ⚡ Toda vez que for subir pro Docker, faça isto (nesta ordem)

Isto existe porque **já perdemos tempo com os dois erros abaixo em produção**. Siga o checklist
e eles não voltam a acontecer.

1. **Use sempre `.env.docker`**, nunca o `.env` de dev, pra subir em Docker:
   ```powershell
   pnpm docker:app:rebuild
   ```
   Esse script já usa `--env-file .env.docker` — não precisa (e não deve) copiar `.env` pra cima
   do `.env.docker`.

2. **Mudou alguma variável `NEXT_PUBLIC_*` no `.env.docker`?** (ex.: trocou a porta ou o IP do
   servidor em `NEXT_PUBLIC_API_URL`) → **é obrigatório rebuild**, `up -d` sozinho não resolve:
   ```powershell
   pnpm docker:app:rebuild
   ```
   Motivo: `NEXT_PUBLIC_*` é compilado ("baked") dentro do JS do frontend no momento do build.
   Ver detalhe em [`docs/guia-docker-build-env-runtime.md`](docs/guia-docker-build-env-runtime.md).
   Se mudou só variável do backend (Oracle, SMTP, JWT, etc.) — que é lida em runtime — só
   precisa recriar o container, não precisa rebuildar a imagem:
   ```powershell
   docker compose --env-file .env.docker --profile app up -d
   ```

3. **Depois de subir, confira se o `NEXT_PUBLIC_API_URL` realmente bateu** — não confie só no
   `docker compose up` ter rodado sem erro:
   ```powershell
   docker ps --format "table {{.Names}}\t{{.Ports}}"    # confirma a porta exposta do backend
   curl http://localhost:<porta_backend>/health          # tem que devolver 200
   ```
   Se o frontend no navegador continuar chamando uma porta/IP antigo, é a imagem antiga ainda
   rodando — rebuild resolve (passo 2).

## Dois ambientes, dois arquivos `.env`

| Cenário | Arquivo | Como subir |
|---|---|---|
| **Desenvolvimento** (codar no laptop, hot reload) | `.env` | `pnpm dev` |
| **Docker** (qualquer máquina, tudo em container) | `.env.docker` | `pnpm docker:app:rebuild` |

Os dois são `.gitignore` — só os `*.example` são versionados.

Diferenças principais (valores de referência — confira sempre o `.env.docker` real, que é o
que vale):

| | `.env` (dev) | `.env.docker` |
|---|---|---|
| `DATABASE_HOST` | `localhost` (porta exposta local) | (não usa, compose passa `postgres` interno) |
| `ORACLE_ENABLED` | `true` (acessa Globus 10.0.1.191) | `true` — mesmas credenciais do `.env`, mas com `ORACLE_CLIENT_PATH` Linux (o compose já hardcoda `/opt/oracle/instantclient`, não precisa nem setar) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3333` | URL/porta onde os usuários acessam o backend (ex.: `http://10.10.100.176:3343`) — **baked no build** |
| `APP_URL` | `http://localhost:3001` | URL pública do frontend |
| `BACKEND_PORT_HOST` / `FRONTEND_PORT_HOST` | — | portas expostas no host; podem divergir das internas do container (3333/3001) se já estiverem ocupadas por outro serviço (ex.: Workshop usa 3333) |

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

> ⚠ Sem rota até `10.0.1.191` (rede/VPN da empresa), deixe `ORACLE_ENABLED=false` — o sistema
> funciona sem o Globus, lendo apenas dados que já foram sincronizados para o Postgres. O Oracle
> Instant Client **já vem instalado na imagem** (Dockerfile do backend), não precisa mexer nele —
> só ligar a flag quando o servidor Docker tiver acesso à rede da empresa (ver seção 8).

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

As portas expostas no host vêm de `FRONTEND_PORT_HOST` / `BACKEND_PORT_HOST` no `.env.docker`
(default 3001 / 3333 — mas podem estar remapeadas se a porta já estiver em uso por outro
serviço no mesmo servidor). Confirme sempre com `docker ps` antes de assumir a porta:

```powershell
docker ps --format "table {{.Names}}\t{{.Ports}}"
```

| Serviço | URL (default) | Login |
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

⚠ **As migrations NÃO rodam automaticamente no startup do backend no Docker** — o `CMD` do
container só chama `node dist/server.js` direto. Depois de subir (ou depois de um `git pull`
que trouxe migration nova), rode manualmente:

```powershell
docker exec -it pioneira-financas-backend node apps/FinancasBackend/dist/scripts/run-migrations.js
```

Esqueceu esse passo é a causa mais comum de "subiu mas a tela dá erro 500" depois de um deploy.

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

O Oracle Instant Client **já vem instalado na imagem** do backend (Dockerfile faz isso no
build) e o `ORACLE_CLIENT_PATH` do container **já está hardcoded** no `docker-compose.yml`
(`/opt/oracle/instantclient`) — não precisa mexer em nenhum dos dois.

Só falta o servidor Docker ter rota de rede até `10.0.1.191` (rede interna/VPN da empresa).
Se tiver, edite `.env.docker` com as **mesmas credenciais do `.env` de dev**, exceto o client
path (que não precisa setar — vem do compose):

```env
ORACLE_ENABLED=true
ORACLE_HOST=10.0.1.191
ORACLE_PORT=1521
ORACLE_SERVICE_NAME=orcl_pdb1.sub02151801351.vcnpioneira.oraclevcn.com
ORACLE_USER=glbconsult
ORACLE_PASSWORD="..."
```

Essas variáveis são lidas em **runtime** pelo backend (não são `NEXT_PUBLIC_*`), então basta
recriar o container — não precisa rebuild:

```powershell
docker compose --env-file .env.docker --profile app up -d
```

Confirme que conectou nos logs:

```powershell
docker logs pioneira-financas-backend | grep -i oracle
# esperado: "Oracle Instant Client carregado (Modo Thick)" + "Pool Oracle (Globus) iniciado"
```

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
