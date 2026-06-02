# 02 (alternativa) · Arquitetura — Stack Node/Fastify

> Versão alternativa ao [02_ARQUITETURA.md](02_ARQUITETURA.md) (Python). Mesmo sistema, mesma arquitetura conceitual, mas com **Node.js + TypeScript** no backend para alinhar com o padrão tecnológico da Pioneira (workshop, sgd, transdata já em Node). Tudo abaixo deste arquivo (banco, identidade, integrações, módulos, roadmap) permanece **igual** — é agnóstico de linguagem.

## Mudança de paradigma em uma linha

Em vez de **um backend monolítico Python**, temos um **backend principal Fastify (TypeScript)** + um **microserviço Python isolado** que existe só para ML (Prophet, scikit-learn). Eles falam por HTTP interno.

---

## Visão em camadas (atualizada)

```
┌─────────────────────────────────────────────────────────────────────┐
│ USUÁRIO (browser)                                                   │
└─────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ FRONTEND  ·  React + TypeScript + Vite + Tailwind  (IGUAL)          │
└─────────────────────────────────────────────────────────────────────┘
                            │  (HTTPS · JWT Keycloak)
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BACKEND PRINCIPAL  ·  Fastify + TypeScript + Prisma                 │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Rotas REST + validação Zod                                     │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ Casos de uso (DRE, fluxo, contas, recebíveis, ...)             │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ Domínio puro (entidades + regras de negócio)                   │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ Adapters (workshop, globus, transdata, sgd, gdf, anp, banco)   │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ Infra: Prisma Client, Keycloak, BullMQ Producer, HTTP clients  │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
        │           │              │                 │
        ▼           ▼              ▼                 ▼
   PostgreSQL    Redis        Keycloak       Forecast Service
   (mesmo BD)   (cache+       (mesmo IdP)    (Python isolado)
                BullMQ)                       ┌────────────────┐
                  │                           │ FastAPI mini   │
                  ▼                           │  + Prophet     │
            ┌──────────┐                      │  + scikit      │
            │ Workers  │                      │ POST /forecast │
            │ BullMQ   │                      └────────────────┘
            │ (sync,   │                              ▲
            │  ETL)    │                              │ chamada HTTP
            └──────────┘                              │ quando precisa
                                                  ml/projecao
```

---

## Stack tecnológica

### Backend principal (Node + TypeScript)

| Componente | Tecnologia | Por quê |
|---|---|---|
| Runtime | Node.js 20 LTS | Padrão Pioneira existente |
| Linguagem | TypeScript 5.x (strict) | Mesma do frontend; tipos compartilhados |
| Framework HTTP | **Fastify 4** | Performance, schemas JSON nativos, plugins maduros |
| ORM | **Prisma 5** | Migrations declarativas, client type-safe automático |
| Validação | **Zod** | Schemas compartilháveis frontend ↔ backend |
| Auth | `@fastify/jwt` + `openid-client` (Keycloak) | OIDC padrão |
| Filas / Jobs | **BullMQ** + Redis | Mais robusto que APScheduler; retry, delays, prioridade |
| HTTP client | `undici` (nativo Node 20) | Pra falar com adapters externos |
| Logs | **Pino** (`@fastify/pino`) | JSON estruturado, performático |
| Tests | **Vitest** + Supertest | Rápido, ESM-first |
| Lint/format | ESLint + Prettier + Biome (opcional) | Padrão TS |
| Docs API | **@fastify/swagger** (autogerado por schemas) | Equivalente ao `/docs` do FastAPI |

### Forecast Service (Python — microserviço isolado)

| Componente | Tecnologia |
|---|---|
| Framework | FastAPI minimalista (~200 linhas) |
| ML | Prophet, scikit-learn, numpy |
| Validação | Pydantic |
| Endpoint único | `POST /forecast` → recebe série temporal, retorna previsão |
| Deploy | Container Docker próprio (`pioneira-forecast`) |
| Autenticação | API key interna (não exposto à internet) |

> Esse serviço **não tem banco, não tem auth de usuário, não tem UI**. Recebe um JSON, devolve um JSON. Dá pra trocar por AWS Forecast / Vertex AI no futuro sem mexer no backend principal.

### Frontend (sem mudança)

Igual ao plano Python: React 18 + TypeScript + Vite + Tailwind + TanStack Query + oidc-client-ts.

### Persistência

Idêntica ao plano Python: PostgreSQL 16, schemas `identity` · `finance` · `integration` · `audit`. Migrations via **Prisma Migrate** em vez de Alembic.

### Identidade

Idêntica: Keycloak 24 self-hosted. Backend valida JWT com `@fastify/jwt` (plugin oficial).

### Infraestrutura

Mesma stack Docker Compose. Acrescenta o serviço `forecast` ao compose.

---

## Schemas Zod compartilhados (decisão importante)

Padrão de pasta:

```
/packages
  /shared              ← npm workspace
    /src
      /schemas
        contas-pagar.ts
        contas-receber.ts
        repasse-gdf.ts
        ...
      /types          (inferidos dos Zods)
/apps
  /backend            (Fastify) — importa de @pioneira/shared
  /frontend           (React)   — importa de @pioneira/shared
```

Exemplo de payload:

```ts
// packages/shared/src/schemas/contas-pagar.ts
import { z } from "zod";

export const ContasPagarCreateSchema = z.object({
  fornecedor_id: z.string().uuid(),
  competencia: z.string().date(),
  data_vencimento: z.string().date(),
  valor_bruto_cents: z.number().int().positive(),
  plano_conta_id: z.number().int(),
  numero_documento: z.string().max(120).optional(),
  observacao: z.string().max(2000).optional(),
});

export type ContasPagarCreate = z.infer<typeof ContasPagarCreateSchema>;
```

Backend valida automaticamente via Fastify plugin; frontend usa o mesmo schema em `react-hook-form`. **Nunca há divergência de contrato.**

---

## Decisões arquiteturais (ADRs adaptados)

Os 6 ADRs do plano Python continuam válidos. **Acrescentam-se 3 ADRs específicos da stack Node**:

### ADR-07: Fastify + Prisma como stack principal

**Contexto:** padronização tecnológica com os outros sistemas Pioneira (workshop, sgd, transdata em Node).
**Decisão:** Fastify para HTTP + Prisma para ORM. Os dois lideram em maturidade e performance no ecossistema Node.
**Trade-off:** time precisa de TypeScript proficiente. **Ganho:** mesma stack do resto da empresa; tipos compartilhados com frontend; mercado de contratação maior.

### ADR-08: Microserviço Python isolado para ML

**Contexto:** Prophet é maduro e não tem equivalente decente em Node.
**Decisão:** backend principal Fastify chama um microserviço Python (FastAPI minimalista) por HTTP interno quando precisa de previsão.
**Trade-off:** dois runtimes; complexidade de orquestração. **Ganho:** Prophet preservado (com feriados brasileiros, sazonalidade anual); microserviço pode ser trocado por SaaS (AWS Forecast / Vertex AI Forecast) sem mexer no resto. Empresa não tem Python "espalhado" — só num lugar bem delimitado.

### ADR-09: BullMQ em vez de APScheduler

**Contexto:** sincronização periódica + ETL paralelos.
**Decisão:** BullMQ (sobre Redis) para todas as filas. Permite priorização, retries com backoff exponencial, jobs delayed, dashboard `bull-board`.
**Trade-off:** depende de Redis estar de pé. **Ganho:** muito mais robusto que APScheduler in-process; workers escaláveis horizontalmente; observabilidade visual via bull-board.

---

## Estrutura do repositório

```
pioneira-finance-v2/
├── apps/
│   ├── backend/                    # Fastify
│   │   ├── src/
│   │   │   ├── modules/            # módulos de negócio
│   │   │   │   ├── contas-pagar/
│   │   │   │   ├── contas-receber/
│   │   │   │   ├── recebiveis-gdf/
│   │   │   │   ├── fluxo-caixa/
│   │   │   │   ├── folha/
│   │   │   │   ├── ...
│   │   │   ├── adapters/           # integrações
│   │   │   │   ├── workshop/
│   │   │   │   ├── globus/
│   │   │   │   ├── transdata/
│   │   │   │   ├── sgd/
│   │   │   │   ├── gdf/
│   │   │   │   ├── anp/
│   │   │   │   └── open-finance/
│   │   │   ├── jobs/               # BullMQ workers
│   │   │   │   ├── sync-workshop.ts
│   │   │   │   ├── sync-globus.ts
│   │   │   │   └── ...
│   │   │   ├── plugins/            # fastify plugins (auth, swagger, etc.)
│   │   │   ├── infra/              # prisma, redis, keycloak clients
│   │   │   └── server.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── package.json
│   │
│   ├── frontend/                   # React (igual ao plano Python)
│   │   └── ...
│   │
│   └── forecast/                   # microserviço Python ISOLADO
│       ├── app/
│       │   ├── main.py             # FastAPI ~50 linhas
│       │   ├── prophet_runner.py   # ~150 linhas
│       │   └── schemas.py          # Pydantic
│       ├── requirements.txt
│       └── Dockerfile
│
├── packages/
│   └── shared/                     # workspace: schemas Zod + types
│       ├── src/
│       │   ├── schemas/
│       │   └── enums/
│       └── package.json
│
├── docker-compose.yml              # postgres, redis, keycloak, backend, forecast, frontend, traefik
├── pnpm-workspace.yaml             # monorepo via pnpm
└── turbo.json                      # opcional: Turborepo para builds incrementais
```

**Por que monorepo:** schemas compartilhados entre backend e frontend exigem isso. pnpm workspaces ou Turborepo resolvem.

---

## Equivalências práticas (FastAPI ↔ Fastify)

Para o time entender o que muda no dia-a-dia:

### Definir uma rota

```python
# FastAPI (atual)
@router.post("/contas-pagar", response_model=ContasPagarOut)
async def criar_cp(payload: ContasPagarCreate, db: Session = Depends(get_db)):
    return service.criar(db, payload)
```

```ts
// Fastify
app.post("/contas-pagar", {
  schema: { body: ContasPagarCreateSchema },
  preHandler: [authRequired("financeiro.contas_pagar.criar")],
}, async (req) => service.criar(req.body));
```

### Modelar uma tabela

```python
# SQLAlchemy
class ContaPagar(Base):
    __tablename__ = "contas_pagar"
    __table_args__ = {"schema": "finance"}
    id = Column(Integer, primary_key=True)
    valor_bruto_cents = Column(BigInteger, nullable=False)
    ...
```

```prisma
// Prisma
model ContaPagar {
  id               Int      @id @default(autoincrement())
  valor_bruto_cents BigInt
  ...
  @@map("contas_pagar")
  @@schema("finance")
}
```

### Job agendado

```python
# APScheduler
scheduler.add_job(sync_workshop, "cron", hour=2)
```

```ts
// BullMQ + cron repeatable
await queue.add("sync-workshop", {}, {
  repeat: { pattern: "0 2 * * *" },
});
```

### Chamada ao microserviço de forecast

```ts
// dentro de fluxo-caixa.service.ts
const forecast = await fetch(`${FORECAST_URL}/forecast`, {
  method: "POST",
  headers: { "x-api-key": process.env.FORECAST_KEY!, "content-type": "application/json" },
  body: JSON.stringify({
    serie: [{ ds: "2025-06-01", y: 5_200_000_00 }, ...],
    horizonte: 6,
    sazonalidade_anual: true,
  }),
}).then(r => r.json());
```

```python
# forecast/app/main.py (200 linhas no total)
@app.post("/forecast")
def forecast(req: ForecastRequest):
    df = pd.DataFrame(req.serie)
    m = Prophet(yearly_seasonality=req.sazonalidade_anual, holidays=BR_HOLIDAYS)
    m.fit(df.rename(columns={"y": "y", "ds": "ds"}))
    future = m.make_future_dataframe(periods=req.horizonte, freq="MS")
    fc = m.predict(future)
    return {"previsao": fc[["ds", "yhat", "yhat_lower", "yhat_upper"]].tail(req.horizonte).to_dict("records")}
```

---

## O que muda nos outros documentos

| Arquivo | Mudança | Por quê |
|---|---|---|
| `01_VISAO.md` | nenhuma | Visão é agnóstica de stack |
| `03_BANCO_DE_DADOS.md` | nenhuma | Schema PostgreSQL é o mesmo; só muda quem gera as migrations (Prisma vs Alembic) |
| `04_IDENTIDADE_INTEGRACOES.md` | mínima | Conceitos iguais; adapter pattern em TS em vez de Python; YAMLs de contrato continuam válidos |
| `05_MODULOS_FINANCEIROS.md` | nenhuma | Módulos funcionais são agnósticos |
| `06_ROADMAP.md` | nenhuma | Fases e entregáveis iguais; estimativas idênticas |

**Conclusão:** trocar Python por Node afeta **apenas este arquivo**. ~85% da documentação fica intacta.

---

## Comparação rápida (decisão)

| Critério | Python (FastAPI) | Node (Fastify) |
|---|---|---|
| Padronização Pioneira | ❌ Python isolado | ✅ Casa com workshop/sgd/transdata |
| Time para contratar | 👍 bom | 👍👍 melhor (TS é maior) |
| Tipos compartilhados front↔back | ❌ via OpenAPI codegen | ✅ Zod nativo |
| Prophet (ML) | ✅ nativo | ⚠️ via microserviço Python (overhead pequeno) |
| Pandas (ETL pesado) | ✅ nativo | ⚠️ usar SQL puro (preferível na real) |
| Velocidade inicial | 👍 conhecido | 👍 conhecido se time domina TS |
| Manutenção a longo prazo | 👍 estável | 👍👍 menos contexto-switch entre sistemas |
| Performance bruta | 👍 boa | 👍 comparável (Fastify ≈ FastAPI em benchmarks) |
| Risco operacional | 0 (já tem v1 Python) | baixo (adapter pattern abstrai) |

**Recomendação final:** se a Pioneira já tem outros sistemas em Node em produção há tempo, a opção Node/Fastify **vale o investimento de padronização**. O custo do microserviço Python isolado é pequeno e bem delimitado.

Se o time TS é raso ou indeterminado, **mantém Python** e revisita em 1-2 anos.

---

## Quem decide

- **Padronização tecnológica e contratação** → Diretoria TI / Engenharia
- **Trade-offs técnicos (Prophet isolado etc.)** → Tech Lead financeiro
- **Velocidade de entrega** → ambos juntos

A documentação cobre as duas trilhas para que a decisão seja informada, não imposta pela ferramenta.
