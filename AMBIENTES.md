# Ambientes — Dev × Docker (e o mapa das portas)

> **Pra que serve este doc:** os dois stacks (dev local com hot reload e Docker com
> imagens buildadas) **coexistem na mesma máquina**, e várias vezes a gente bateu
> em "valores antigos na tela" justamente por estar olhando o stack errado. Aqui
> está o mapa das portas, quando usar qual, e o fluxo pra deploy.
>
> Para subir o Docker da primeira vez (criar `.env.docker`, abrir firewall,
> rodar seed do admin), veja **`DOCKER.md`**. Este doc é o complemento operacional.

---

## 1. Mapa das portas (cola na parede)

| Camada | Dev (hot reload) | Docker (imagens buildadas) | Infra compartilhada |
|---|---|---|---|
| **Frontend** | `localhost:3002` | `localhost:3001` | — |
| **Backend** | `localhost:3334` | `localhost:3333` | — |
| **Postgres** | — | — | `localhost:5435` (container `pioneira-financas-postgres`) |
| **Redis** | — | — | `localhost:6380` |
| **Mailhog SMTP** | — | — | `localhost:1025` |
| **Mailhog UI** | — | — | `localhost:8025` |
| **pgAdmin (opcional)** | — | — | `localhost:8080` |
| **Workshop** | (também 3333 em outra rede) | — | — |

**Os dois frontends apontam para backends diferentes**, embaixo do mesmo Postgres:

```
[ dev front :3002 ] ──► [ dev back :3334 (tsx watch) ] ─┐
                                                         ├──► [ postgres :5435 ]
[ docker front :3001 ] ──► [ docker back :3333 (built) ]─┘
```

> ⚠ **O dado é compartilhado** (mesmo banco), mas o **código** rodando nos dois backends pode ser DIFERENTE:
> - dev backend (3334) reflete o `apps/FinancasBackend/src` na hora (tsx watch).
> - Docker backend (3333) só atualiza após **rebuild da imagem**.

---

## 2. Quando usar qual

| Use **dev** quando… | Use **Docker** quando… |
|---|---|
| Codar / debugar — mudanças aparecem em ~1s | Demo, validação com financeiro, acesso pela rede |
| Iterar rápido em UI/backend | Simular produção / sanity check antes de subir em servidor |
| Mexer em migração, ETL, schema | Outros computadores precisam acessar (IP da máquina) |
| Acessar Globus (Oracle 10.0.1.191) | Globus normalmente DESLIGADO (sem VPN no container — ver `DOCKER.md §8`) |

---

## 3. Comandos por ambiente

### Dev (hot reload)

```powershell
# 1. Infra (postgres + redis + mailhog) — uma vez por sessão
pnpm docker:up

# 2. Apps (back + front em paralelo via turbo)
pnpm dev

# 3. Validar antes de commitar
pnpm typecheck
pnpm build
pnpm lint
```

URLs:
- Frontend: http://localhost:3002
- Backend:  http://localhost:3334  ·  Swagger: http://localhost:3334/docs

### Docker (apps em container)

```powershell
# Subir/atualizar TUDO (build + recreate)
pnpm docker:app:rebuild

# Ou em duas etapas (mais controle)
pnpm docker:app:build      # constrói as imagens
pnpm docker:app:up         # sobe os containers

# Acompanhar
pnpm docker:app:logs       # logs de backend + frontend (Ctrl+C sai)

# Parar (mantém volumes/dados)
pnpm docker:app:down
```

URLs:
- Frontend: http://localhost:3001
- Backend:  http://localhost:3333  ·  Swagger: http://localhost:3333/docs

---

## 4. Fluxo de deploy — quando você quer ver as mudanças no Docker

A confusão clássica: **"atualizei o código, por que o Docker está com a versão velha?"**

Porque o Docker roda **imagens buildadas**. Mudou código → tem que rebuildar.

```powershell
# 1. (Opcional, mas economiza tempo) — sanity local em ~1 min
pnpm build

# 2. Rebuild + sobe o stack Docker — 5-15 min na primeira vez, <1 min com cache
pnpm docker:app:rebuild

# 3. Confirma que subiu
curl http://localhost:3333/health
# E abre http://localhost:3001 no browser (Ctrl+Shift+R pra refresh duro)

# 4. Acompanha os logs se quiser
pnpm docker:app:logs
```

**Migrations rodam automaticamente** no startup do backend Docker — não precisa rodar nada à mão. Se quiser forçar:

```powershell
docker exec -it pioneira-financas-backend node apps/FinancasBackend/dist/scripts/run-migrations.js
```

---

## 5. Pegadinhas que já bateram nesta sessão

### "Atualizei o código e o Docker continua igual"
Docker = imagem buildada. Mude código → `pnpm docker:app:rebuild` (não basta restart).

### "Mas o frontend mostra meu código novo!"
Você está no **frontend dev** (`:3002`), que faz hot reload. Mas ele aponta pro **backend dev** (`:3334`). O Docker (`:3001`/`:3333`) é outro stack — independente.

### "Os dois backends estão no ar — qual é qual?"

```powershell
# Vai dizer uptime + versão de cada um
curl http://localhost:3334/health   # dev — uptime baixo, "versao 0.0.1 development"
curl http://localhost:3333/health   # docker — uptime longo, "version 1.0.0 production"
```

### "Card mostra X, lista mostra 0"
Se o front mostra `aria-label` da sua versão nova mas o **dado** está velho, é **cache do React Query**. Use **Ctrl+Shift+R** (hard refresh) — F5 simples nem sempre invalida.

### "Frontend Docker chama localhost no PC do colega"
`NEXT_PUBLIC_API_URL` é **baked no build**. Se ficou `http://localhost:3333`, o browser do colega vai procurar o backend na máquina **dele**. No `.env.docker` use o **IP do servidor** (ex.: `http://10.10.100.176:3333`) e **rebuild**.

### "Frontend tá com `Tudo conciliado` mas o banco tem 18 sem par"
Veja a porta. Se for o Docker (`:3001`) e o backend Docker tiver código velho (sem o fix), ele responde com o bug antigo. **Rebuild + Ctrl+Shift+R.**

---

## 6. Verificação rápida (cheatsheet)

```powershell
# Ambos backends estão no ar?
curl http://localhost:3334/health    # dev
curl http://localhost:3333/health    # docker

# Postgres do Docker no ar e com migrations aplicadas?
docker exec pioneira-financas-postgres `
  psql -U pioneira -d pioneira_finance_db -c "SELECT MAX(name) FROM migrations;"

# Containers Docker que estão rodando agora
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Logs em tempo real do backend Docker
pnpm docker:app:logs
```

---

## 7. Quando reiniciar / rebuildar

| Mudança | Dev (`pnpm dev`) | Docker |
|---|---|---|
| Código TS/TSX (backend ou frontend) | reload automático (tsx watch / Next dev) | **`pnpm docker:app:rebuild`** |
| Migration nova | reload automático + rodar `pnpm --filter ...backend migration:run` à mão | **`pnpm docker:app:rebuild`** (migrations rodam no startup) |
| `.env` (DATABASE_*, etc.) | reinicia `pnpm dev` | **`pnpm docker:app:rebuild`** |
| `.env.docker` (`NEXT_PUBLIC_*`) | n/a | **`pnpm docker:app:rebuild`** (URL fica baked) |
| Schema do shared (`packages/shared`) | `pnpm --filter @pioneira/shared build` + os apps repegam | **`pnpm docker:app:rebuild`** |
| `pnpm-lock.yaml` (deps novas) | `pnpm install` | **`pnpm docker:app:rebuild`** (re-instala no build) |

---

## 8. Referências

- **`DOCKER.md`** — Setup inicial do Docker (`.env.docker`, JWT_SECRET, firewall, Oracle, backup).
- **`CLAUDE.md`** — Regras de código + comandos de validação.
- **`package.json`** (scripts) — fonte de verdade dos comandos `pnpm docker:*`.
- **Memória do projeto:** `infra-local-portas.md`.
