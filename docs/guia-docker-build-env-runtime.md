# Guia — build Docker sem "trocar variável na mão" + features só-de-dev

> **Problema que este guia resolve**
>
> 1. Hoje, para subir a mesma app em outro ambiente, alguém edita variável **antes do build**
>    e gera uma imagem diferente por ambiente. Isso é errado: a imagem passa a ser um artefato
>    **não promovível** (o que você testou em homologação não é o que vai pra produção).
>    **Objetivo:** *uma imagem só*, que lê a configuração do `.env` + `docker-compose.yml`
>    **do ambiente onde ela está rodando**, no momento em que sobe.
> 2. Ter coisas que **só existem/aparecem em dev** (páginas de debug, seed, botões de teste,
>    rotas administrativas de laboratório) sem manter dois builds nem `if` comentado.
>
> **Como usar isto com um agente (Claude Code):** entregue este arquivo e peça
> *"implemente a Parte 1–4 neste repo e depois a Parte 5"*. A **Parte 6** tem o checklist de
> aceite — exija que ele rode os testes de lá (todos são verificáveis **sem rebuild**).

### Aplica-se à sua stack?

O guia é agnóstico. O que muda entre stacks é **só uma decisão**, na Parte 3: *o front tem um
processo Node rodando em runtime, ou é arquivo estático servido por nginx?*

| Sua stack | Prefixo que é *baked* no build | Caminho na Parte 3 |
|---|---|---|
| Next.js (App/Pages Router) | `NEXT_PUBLIC_*` | **3.3** — config injetada pelo servidor |
| Nuxt, Remix, SvelteKit (adapter-node), Astro SSR | `NUXT_PUBLIC_*`, `PUBLIC_*` | **3.3** (mesma ideia, API do framework muda) |
| Vite (React/Vue/Svelte), CRA, Angular, Astro estático | `VITE_*`, `REACT_APP_*`, `environment.ts` | **3.4** — `env.js` gerado no entrypoint |
| Backend Node (Fastify/Express/Nest) | — (nada é baked) | Parte 2, e pronto |

As Partes 0, 1, 2, 4, 5 e 6 valem igual para todas.

---

## TL;DR — as 5 regras

1. **Build arg é só para o que muda o artefato** (versão da app, tag da imagem base).
   **Configuração de ambiente nunca é build arg.**
2. **Backend/serviço Node já é runtime.** Só não estrague: nada de `ENV CONFIG=...` no
   Dockerfile; tudo entra por `env_file:`/`environment:` do compose e passa por um
   **módulo de config validado que derruba o processo se faltar variável**.
3. **Front é o problema de verdade:** `NEXT_PUBLIC_*` / `VITE_*` são **inlinados no bundle
   durante o build**. A solução não é "passar melhor no build" — é **parar de precisar deles**
   (Parte 3).
4. **Primeiro tente eliminar a variável.** URL da API → caminho relativo `/api` + proxy
   same-origin. Variável que não existe não precisa ser configurada, versionada nem depurada.
5. **Ambiente tem nome próprio: `APP_ENV`.** `NODE_ENV` diz *como o código foi compilado*
   (`production` sempre, nas imagens); `APP_ENV` diz *onde ele está rodando*
   (`local` | `development` | `homologacao` | `production`). Nunca use `NODE_ENV=development`
   em container publicado só para ligar feature de dev.

---

## Parte 0 — O modelo mental: build-time × runtime

| | Build-time (`docker build`) | Runtime (`docker run` / `compose up`) |
|---|---|---|
| Quem fornece | `ARG` + `--build-arg`, `build.args:` do compose | `env_file:`, `environment:`, secrets do orquestrador |
| Quando é lido | Uma vez, ao gerar a imagem | A cada start do container |
| Fica gravado na imagem? | **Sim** (layers, `docker history`, bundle JS) | Não |
| Muda sem rebuild? | Não | **Sim** — só `up -d` |
| Serve para segredo? | **Nunca** | Sim (com cuidado: ver Parte 2) |

**O teste decisivo** — antes de aceitar qualquer variável no build, pergunte:

> *"Consigo pegar exatamente esta imagem, sem rebuild, e subir em homologação e em produção
> só trocando o `.env` do servidor?"*

Se a resposta for não, a config está no lugar errado.

**O que legitimamente continua build-time:**
- versão/commit da app (`APP_VERSION`, `GIT_SHA`) — faz parte do artefato, muda a cada build mesmo;
- tag da imagem base;
- upload de source map para o Sentry (precisa do token **no build**, via *secret mount*, nunca `ARG`).

---

## Parte 1 — De onde a config vem no Docker Compose

Essa hierarquia é a **causa nº 1** de "mudei o `.env` e não aconteceu nada". São três coisas
diferentes com nomes parecidos:

### 1.1 O `.env` ao lado do `docker-compose.yml`
Serve para **interpolar `${VAR}` dentro do YAML**. Ele **não** entra no container por si só.

```yaml
services:
  api:
    ports:
      - '${API_HOST_PORT:-3333}:3333'   # ← usa o .env do compose
```

### 1.2 `env_file:`
O conteúdo do arquivo **vira variável de ambiente dentro do container**. Não é usável para
interpolar `${}` no YAML.

```yaml
    env_file:
      - /opt/app/api.env      # arquivo do SERVIDOR, fora do repo, não versionado
```

### 1.3 `environment:`
Vai para o container **e** tem precedência sobre `env_file`. Pode interpolar do `.env` do compose:

```yaml
    environment:
      APP_ENV: production
      DATABASE_URL: 'postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}'
      SOME_VAR:            # forma "pass-through": pega do shell / .env do compose
```

### 1.4 Precedência (do mais forte para o mais fraco), **dentro do container**

```
docker compose run -e VAR=…   >   environment:   >   env_file:   >   ENV do Dockerfile
```

E, para a **interpolação `${}` no YAML**: `shell do usuário` > `--env-file` / `.env` do compose.

### 1.5 Sintaxes que valem ouro

```yaml
${VAR:-padrao}    # usa "padrao" se VAR estiver vazia ou ausente
${VAR:?mensagem}  # ABORTA o `up` com essa mensagem se VAR faltar  ← use em segredo obrigatório
```

`${VAR:?...}` transforma "esqueci de setar a senha do banco" em erro imediato no deploy, em vez
de um container que sobe com default silencioso.

### 1.6 Verifique antes de subir (sempre)

```bash
docker compose --env-file /opt/app/.env -f docker-compose.prod.yml config
```

Isso imprime o YAML **já resolvido** — todo `${...}` substituído. É a resposta definitiva para
"essa variável chegou?". (Cuidado: imprime segredos; não jogue em log de CI público.)

---

## Parte 2 — Backend (Fastify/Express/Nest): já é runtime, só não estrague

O Node lê `process.env` **quando o processo inicia**. Então o backend já resolve sozinho o
problema — desde que você siga três regras.

### 2.1 Nada de configuração no Dockerfile

```dockerfile
# ERRADO — congela config na imagem
ENV DATABASE_URL=postgresql://user:pass@db:5432/app
ENV API_URL=https://api.homologacao.exemplo.com

# CERTO — só o que é invariante do artefato
ENV NODE_ENV=production
ENV PORT=3333
```

### 2.2 Um módulo de config validado, que derruba o boot

Sem isso, variável faltando vira `undefined` que só explode três telas adiante, em produção.

```ts
// src/config/env.ts
import { z } from 'zod';

/** "true"/"1" → true. z.coerce.boolean() NÃO serve: a string "false" vira true. */
const boolEnv = (padrao = false) =>
  z.string().optional().transform((v) => (v === undefined ? padrao : v === 'true' || v === '1'));

const schema = z.object({
  // Como o código foi compilado. Nas imagens é SEMPRE 'production'.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  // ONDE está rodando. É esta que muda por ambiente.
  APP_ENV: z.enum(['local', 'development', 'homologacao', 'production']).default('production'),

  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa de >= 32 chars'),

  // Flags de recurso — ligadas por ambiente, nunca por rebuild.
  ENABLE_DEV_TOOLS: boolEnv(false),
  ENABLE_SEED_ENDPOINTS: boolEnv(false),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const problemas = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  console.error(`[env] configuração inválida:\n${problemas.join('\n')}`);
  process.exit(1); // fail-fast: melhor não subir do que subir errado
}

export const env = Object.freeze(parsed.data);
export const isProd = env.APP_ENV === 'production';
export const isDevEnv = env.APP_ENV === 'local' || env.APP_ENV === 'development';
```

> Regra derivada: **nenhum lugar do backend lê `process.env` direto**. Todo mundo importa
> `env`. Assim existe uma lista única e auditável de tudo que a app precisa — e o
> `.env.example` vira só o espelho do schema.

### 2.3 Segredo nunca passa por `ARG`/`ENV` de build

`ARG` e `ENV` ficam gravados em `docker history --no-trunc <imagem>`. Quem tiver a imagem tem
o segredo. Quando o build **realmente** precisa de um segredo (ex.: token para upload de
source map), use *secret mount* do BuildKit:

```dockerfile
RUN --mount=type=secret,id=sentry_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_token)" pnpm build
```

```bash
docker build --secret id=sentry_token,env=SENTRY_AUTH_TOKEN -t app-web .
```

Confira que não vazou:

```bash
docker history --no-trunc app-web | grep -i -E 'token|secret|password|key'
```

---

## Parte 3 — Frontend: o problema real

### 3.1 Por que `NEXT_PUBLIC_*` / `VITE_*` não resolvem

Todo bundler moderno faz a mesma coisa: **substituição textual no build**.

```ts
// o que você escreve
const url = process.env.NEXT_PUBLIC_API_URL;   // Next / webpack
const url = import.meta.env.VITE_API_URL;      // Vite

// o que vai para o .js que o navegador baixa
const url = "https://api.homologacao.exemplo.com";
```

Depois disso, mudar a variável no `.env` ou no compose **não muda nada** — o valor já é uma
string dentro do arquivo servido. É exatamente por isso que hoje alguém troca a variável na mão
antes do build: é a única forma de esse mecanismo funcionar. **O mecanismo é o problema, não a
solução.**

Vale para todos os equivalentes: `NEXT_PUBLIC_*`, `VITE_*`, `REACT_APP_*`, `PUBLIC_*`
(SvelteKit/Astro), `NUXT_PUBLIC_*`, `src/environments/environment.prod.ts` (Angular). E vale
para `NODE_ENV` / `import.meta.env.MODE` no front: resolvidos no build.

> **Armadilha do `--mode` (Vite) e dos `.env.[ambiente]`:** `vite build --mode homologacao`
> lendo `.env.homologacao` **não** é config em runtime — é a mesma substituição textual, só que
> com outro arquivo de origem. Continua sendo um build por ambiente. Se você tem
> `.env.production` e `.env.homologacao` no repo e builda duas vezes, você está exatamente no
> problema que este guia resolve.

### 3.2 Estratégia 0 (preferida) — eliminar a variável

Boa parte das `NEXT_PUBLIC_*` existe só para dizer *onde está a API*. Se o proxy reverso
(nginx/Apache/Traefik) servir front e API **no mesmo domínio**, o front chama caminho relativo
e a variável some:

```ts
// nada de env: mesmo domínio, o proxy roteia /api/* para o backend
const apiClient = axios.create({ baseURL: '/api/v1' });
```

Ganhos: some a variável, some o CORS, some a configuração de CSP `connect-src` para host
externo, e a mesma imagem funciona em qualquer domínio — inclusive em `localhost`.

Funciona em qualquer stack — é só o `baseURL` do cliente HTTP (axios, fetch wrapper, `$fetch`,
`HttpClient` do Angular). Aplique isto **antes** de montar qualquer mecanismo de config em
runtime. A melhor configuração é a que não existe.

### 3.2.1 Escolha do caminho para o que sobrar

```
O front tem um processo Node servindo as páginas em runtime?
├── SIM  (Next, Nuxt, Remix, SvelteKit adapter-node, Astro SSR)   → 3.3
└── NÃO  (Vite/CRA/Angular/Astro estático servidos por nginx)     → 3.4
```

Os dois chegam ao mesmo destino: um objeto `window.__APP_CONFIG__` (ou equivalente via
Context) montado **quando o container sobe / a página é servida**, não quando o bundle foi
gerado. Muda só quem monta o objeto: o servidor do framework, ou o entrypoint do container.

### 3.3 Estratégia 1 — front COM servidor Node: config injetada a cada request

Exemplo escrito em **Next.js App Router**; a ideia é idêntica em Nuxt (`useState` + plugin
server), Remix (`loader` da rota raiz) e SvelteKit (`+layout.server.ts`) — muda só a API do
framework. O ponto invariante: **o servidor lê `process.env` em runtime e entrega o objeto ao
cliente na resposta.**

Para o que sobrar (nome do ambiente, flags, chave pública de terceiro), o servidor Next lê
`process.env` **em runtime** e entrega ao cliente.

**a) O tipo, num arquivo neutro** (importável dos dois lados):

```ts
// src/lib/config/types.ts
export type AppEnv = 'local' | 'development' | 'homologacao' | 'production';

export type PublicConfig = {
  apiUrl: string;
  appEnv: AppEnv;
  features: { devTools: boolean };
};
```

**b) Leitura no servidor** (só roda no servidor; nunca coloque segredo aqui — isso chega ao
navegador):

```ts
// src/lib/config/server-config.ts
import 'server-only';
import type { AppEnv, PublicConfig } from './types';

export function getPublicConfig(): PublicConfig {
  const appEnv = (process.env.APP_ENV as AppEnv) ?? 'production';
  return {
    apiUrl: process.env.API_URL ?? '/api/v1',          // sem prefixo NEXT_PUBLIC_
    appEnv,
    features: { devTools: process.env.FEATURE_DEV_TOOLS === 'true' },
  };
}
```

**c) Repasse via Provider** (jeito idiomático: sem global, sem hydration mismatch — o valor
viaja no payload do RSC):

```tsx
// src/app/layout.tsx
export const dynamic = 'force-dynamic'; // ← SEM ISTO o layout é pré-renderizado NO BUILD e a config congela

import { getPublicConfig } from '@/lib/config/server-config';
import { ConfigProvider } from '@/lib/config/ConfigProvider';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const config = getPublicConfig();
  return (
    <html lang="pt-BR">
      <body>
        <ConfigProvider value={config}>{children}</ConfigProvider>
      </body>
    </html>
  );
}
```

```tsx
// src/lib/config/ConfigProvider.tsx
'use client';
import { createContext, useContext } from 'react';
import type { PublicConfig } from './types';

const Ctx = createContext<PublicConfig | null>(null);

export function ConfigProvider({ value, children }: { value: PublicConfig; children: React.ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConfig(): PublicConfig {
  const c = useContext(Ctx);
  if (!c) throw new Error('useConfig fora do ConfigProvider');
  return c;
}
```

**d) Complemento para código fora do React.** Se você tem um cliente HTTP criado em escopo de
módulo (`export const apiClient = axios.create({ baseURL: ... })`), ele executa antes de
qualquer hook e não enxerga o Context. Duas saídas — escolha uma:

- **(d1) Preferida:** faça o `baseURL` relativo (Estratégia 0) e o problema evapora.
- **(d2)** Injete também um global, num `<script>` inline no `<head>` do layout — ele roda
  antes de qualquer chunk da aplicação:

```tsx
<head>
  <script
    dangerouslySetInnerHTML={{
      // o escape de "<" evita fechar a tag script via valor de env
      __html: `window.__APP_CONFIG__=${JSON.stringify(config).replace(/</g, '\\u003c')};`,
    }}
  />
</head>
```

```ts
// src/lib/config/client-config.ts
import type { PublicConfig } from './types';

const FALLBACK: PublicConfig = { apiUrl: '/api/v1', appEnv: 'production', features: { devTools: false } };

declare global { interface Window { __APP_CONFIG__?: PublicConfig } }

export const getClientConfig = (): PublicConfig =>
  (typeof window === 'undefined' ? undefined : window.__APP_CONFIG__) ?? FALLBACK;
```

> **Trade-off honesto do `force-dynamic`:** ele desliga a pré-renderização estática do app.
> Para portal autenticado (tudo já é dinâmico) o custo é ~zero. Para site com páginas públicas
> cacheáveis, não use no layout raiz: isole a leitura de config num segmento dinâmico, ou
> marque só aquele ponto como dinâmico (`await connection()` nas versões recentes do Next —
> confira a API da sua versão).
>
> **Não use `publicRuntimeConfig`/`getConfig()` do `next.config`:** é mecanismo do Pages
> Router e não é suportado no App Router.

### 3.4 Estratégia 2 — front ESTÁTICO (Vite, CRA, Angular, Astro): `env.js` no entrypoint

Sem processo Node em runtime, quem monta a config é o **entrypoint do container**, que escreve
um arquivo JS antes de o servidor web começar a servir. Este é o padrão canônico para SPA — não
é gambiarra nem plano B; é o equivalente exato da 3.3 para quem serve arquivo estático.

**a) O tipo e o acessor** (o resto da app só fala com `getConfig()`, nunca com o global):

```ts
// src/config/index.ts
export type AppEnv = 'local' | 'development' | 'homologacao' | 'production';

export type AppConfig = {
  apiUrl: string;
  appEnv: AppEnv;
  features: { devTools: boolean };
};

// Fallback = dev local com `vite dev`, onde /env.js não existe.
// Em dev pode usar import.meta.env normalmente: ali build e runtime são a mesma coisa.
const FALLBACK: AppConfig = {
  apiUrl: import.meta.env.VITE_API_URL ?? '/api/v1',
  appEnv: 'local',
  features: { devTools: true },
};

declare global {
  interface Window { __APP_CONFIG__?: AppConfig }
}

export const getConfig = (): AppConfig => window.__APP_CONFIG__ ?? FALLBACK;
export const isProd = () => getConfig().appEnv === 'production';
```

**b) O `index.html` carrega `/env.js` antes do bundle.** O bundler não toca em tags que
apontam para caminho absoluto de arquivo que ele não conhece — é exatamente o que queremos:

```html
<head>
  <script src="/env.js"></script>          <!-- montado no start do container -->
  <script type="module" src="/src/main.tsx"></script>
</head>
```

**c) O entrypoint monta o arquivo com o que estiver no ambiente:**

```sh
#!/bin/sh
# docker-entrypoint.sh
set -eu

: "${API_URL:=/api/v1}"
: "${APP_ENV:=production}"
: "${FEATURE_DEV_TOOLS:=false}"

cat > /usr/share/nginx/html/env.js <<EOF
window.__APP_CONFIG__ = {
  apiUrl: "${API_URL}",
  appEnv: "${APP_ENV}",
  features: { devTools: ${FEATURE_DEV_TOOLS} }
};
EOF

echo "[entrypoint] config: APP_ENV=${APP_ENV} API_URL=${API_URL}"
exec "$@"
```

```dockerfile
FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.d/40-app-config.sh
RUN chmod +x /docker-entrypoint.d/40-app-config.sh
# a imagem oficial do nginx já executa tudo em /docker-entrypoint.d/ antes de subir
```

**d) `/env.js` NUNCA pode ser cacheado** — senão o navegador serve a config do deploy anterior
(ou, pior, de outro ambiente, se houver CDN na frente):

```nginx
location = /env.js {
  add_header Cache-Control "no-store, no-cache, must-revalidate";
  expires -1;
}
```

**Cuidados que costumam morder:**
- o usuário do container precisa poder escrever no caminho — imagem rodando como não-root com
  rootfs read-only quebra isso (escreva num diretório de que ele é dono, ou monte um `tmpfs`);
- valores com aspas ou `$` precisam de escape no heredoc; para config complexa, gere com
  `jq -n` em vez de string interpolada à mão;
- **nada de segredo ali** — `/env.js` é público, exatamente como o bundle.

> **Angular:** o mesmo desenho substitui `environment.prod.ts`. Carregue `/env.js` no
> `index.html` e leia via um `APP_INITIALIZER` que popula um serviço de config, em vez de
> importar o objeto `environment` direto nos componentes.

### 3.5 Estratégia 3 (último recurso) — placeholder + `sed`

Buildar com uma sentinela no lugar do valor (`VITE_API_URL=__RUNTIME_API_URL__` ou
`NEXT_PUBLIC_API_URL=__RUNTIME_API_URL__`) e substituir no start do container:

```sh
# ajuste o diretório: dist/ (Vite/CRA), .next/ (Next), www/ (Angular)
find /app -type f \( -name '*.js' -o -name '*.html' \) \
  -exec sed -i "s|__RUNTIME_API_URL__|${API_URL}|g" {} +
```

É o que dá para fazer quando **não se pode mexer no código do front** (repo de terceiro, app
legada, sem tempo). Mas: invalida source maps e qualquer hash de integridade (SRI), custa
segundos no start de builds grandes, e morre com rootfs read-only. **Só use se 1 e 2 estiverem
fora de alcance** — e registre como dívida, não como arquitetura.

### 3.6 Anti-padrões

| Anti-padrão | Por que dói |
|---|---|
| Uma imagem por ambiente (`web:homolog`, `web:prod`) | O artefato testado não é o publicado |
| `vite build --mode homologacao` + `.env.homologacao` | É build por ambiente com outro nome (ver 3.1) |
| `NODE_ENV=development` em container publicado | React/libs em modo dev: lento, com warnings, sem otimização |
| Segredo em `NEXT_PUBLIC_*` / `VITE_*` | Vai literalmente para o `.js` público |
| `.env` versionado com valores reais | Segredo no histórico do git para sempre |
| `image: app:latest` em produção | `latest` não é versão: impede rollback determinístico |

---

## Parte 4 — Build uma vez, promova o artefato

```bash
# 1. build ÚNICO, sem nenhuma config de ambiente
TAG=$(git rev-parse --short HEAD)
docker build -f apps/api/Dockerfile -t "$REGISTRY/app-api:$TAG" .
docker build -f apps/web/Dockerfile -t "$REGISTRY/app-web:$TAG" .

# 2. push
docker push "$REGISTRY/app-api:$TAG"
docker push "$REGISTRY/app-web:$TAG"

# 3. deploy — em CADA ambiente, a MESMA tag; só o .env muda
#    (no servidor: /opt/app/.env  →  TAG=abc1234, e os *.env de cada serviço)
docker compose --env-file /opt/app/.env -f docker-compose.prod.yml config   # confere
docker compose --env-file /opt/app/.env -f docker-compose.prod.yml pull
docker compose --env-file /opt/app/.env -f docker-compose.prod.yml up -d
```

O compose de produção **não tem `build:`** — se ele consegue buildar, alguém vai buildar
direto no servidor e a promoção do artefato morre:

```yaml
# docker-compose.prod.yml
services:
  api:
    image: ${REGISTRY:?defina REGISTRY}/app-api:${TAG:?defina TAG}
    env_file: [ /opt/app/api.env ]
    environment:
      APP_ENV: production
      NODE_ENV: production
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3333/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  web:
    image: ${REGISTRY:?}/app-web:${TAG:?}
    env_file: [ /opt/app/web.env ]
    environment:
      APP_ENV: production
      NODE_ENV: production
    depends_on: [ api ]
    restart: unless-stopped

  db:
    image: postgres:17-alpine
    restart: unless-stopped     # ← sem isto o banco não volta após reboot do host
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD obrigatório}
```

**Rollback** vira uma linha: `TAG=<sha-anterior> docker compose up -d`.

**Arquivos versionados × arquivos do servidor:**

| Arquivo | Vai pro git? | Papel |
|---|---|---|
| `.env.example` | **Sim** | Espelho do schema de config: todas as chaves, valores fake |
| `docker-compose.yml` / `.prod.yml` | **Sim** | Estrutura, sem valor secreto — só `${...}` |
| `.env`, `api.env`, `web.env` | **Não** (`.gitignore`) | Valores reais, um por ambiente, no servidor |

---

## Parte 5 — Coisas que só existem em dev

Aqui há **duas fronteiras diferentes**, e confundi-las é a origem de vazamento de painel
administrativo em produção:

- **Fronteira de segurança = backend.** Se a rota não existir, não tem UI que a alcance.
- **Fronteira de conveniência = frontend.** Esconder botão não protege nada; só evita ruído.

### 5.1 Backend — registro condicional de rota (a fronteira que vale)

```ts
// src/app.ts
import { env, isDevEnv } from './config/env';

await app.register(rotasDeNegocio);

// Rotas de laboratório: NÃO EXISTEM quando a flag está desligada — 404 real, não 403.
if (env.ENABLE_DEV_TOOLS) {
  app.log.warn('[dev] ferramentas de desenvolvimento ATIVAS — não use isto em produção');
  await app.register(devRoutes, { prefix: '/_dev' });
}
```

```ts
// src/modules/_dev/dev.routes.ts
export async function devRoutes(app: FastifyInstance) {
  app.post('/seed', async () => seedBancoDeDemo());
  app.post('/login-as/:id', async (req) => tokenDeQualquerUsuario(req.params.id));
  app.get('/estado', async () => ({ env: env.APP_ENV, versao: process.env.APP_VERSION }));
}
```

Convenções que pagam:
- prefixo dedicado (`/_dev`, `/__debug`) — dá para **bloquear no proxy** como segunda camada;
- log de `warn` no boot quando a flag está ligada (aparece se alguém ligar em prod por engano);
- **defesa em profundidade:** dentro do handler, `if (isProd) throw new Error(...)`. Flag errada
  no `.env` do servidor é acidente plausível.

### 5.2 Frontend — dois mecanismos, escolha consciente

| | **Compile-time** (o bundler apaga o código) | **Runtime** (a config decide) |
|---|---|---|
| Como se escreve | `process.env.NODE_ENV === 'development'` (Next/webpack) · `import.meta.env.DEV` (Vite) | `config.appEnv !== 'production'` |
| O código vai no bundle de prod? | **Não** — o bloco é removido | **Sim** — só não renderiza |
| Muda sem rebuild? | Não | **Sim** |
| Distingue homologação de produção? | **Não** (ambas são build de produção) | **Sim** |
| Usar para | Ferramenta pesada, mocks, código que não pode nem ser lido por quem baixa o bundle | Banner de ambiente, botão de debug, atalho de QA, painel de suporte |

**Compile-time** — o bloco some do bundle de produção:

```tsx
// Next / webpack
{process.env.NODE_ENV === 'development' && <PainelDeMocks />}

// Vite
{import.meta.env.DEV && <PainelDeMocks />}
```

Escreva exatamente essa comparação literal: é o padrão que o bundler reconhece para eliminar
código morto. Guardar em variável intermediária (`const dev = import.meta.env.DEV; … dev && …`)
pode impedir a remoção. Para ferramenta grande, combine com import dinâmico — assim o chunk nem
é gerado:

```tsx
const PainelDeMocks = import.meta.env.DEV
  ? lazy(() => import('./PainelDeMocks'))
  : () => null;
```

**Runtime** — mesma imagem, comportamento por ambiente. Um componente só, em duas versões
conforme a Parte 3:

```tsx
// Front COM servidor Node (3.3) — lê do Context
'use client';
import { useConfig } from '@/lib/config/ConfigProvider';

/** Esconde em produção. NÃO é segurança: o código VAI para o bundle. */
export function DevOnly({ children }: { children: React.ReactNode }) {
  return useConfig().appEnv === 'production' ? null : <>{children}</>;
}
```

```tsx
// Front ESTÁTICO (3.4) — lê do /env.js
import { isProd } from '@/config';

export function DevOnly({ children }: { children: React.ReactNode }) {
  return isProd() ? null : <>{children}</>;
}
```

```tsx
<DevOnly>
  <Button onClick={preencherFormularioDeTeste}>Preencher com dados fake</Button>
</DevOnly>
```

**Rota inteira só-de-dev:**

```tsx
// Next App Router — src/app/_dev/page.tsx
import { notFound } from 'next/navigation';
import { getPublicConfig } from '@/lib/config/server-config';

export const dynamic = 'force-dynamic';

export default function DevPage() {
  if (getPublicConfig().appEnv === 'production') notFound(); // 404 de verdade
  return <PainelDeDesenvolvimento />;
}
```

```tsx
// React Router / Vue Router — registre a rota condicionalmente:
// em produção ela não existe no roteador, e o catch-all já responde "não encontrado".
const rotas = [
  ...rotasDeNegocio,
  ...(isProd() ? [] : [{ path: '/_dev', element: <PainelDeDesenvolvimento /> }]),
];
```

Lembre: em SPA isso é **cosmético** — quem baixou o bundle consegue ver o componente. A rota da
API é que precisa não existir (5.1).

### 5.3 Fallback quando não há config em runtime: gate por hostname

Se o front ainda não tem mecanismo de config runtime (Parte 3) e você precisa de "não aparecer
em produção" **hoje**, dá para decidir pelo **hostname**, que é conhecido no navegador sem
nenhuma variável:

```ts
// src/lib/runtime-env.ts
export const PRODUCTION_HOSTS: readonly string[] = ['app.exemplo.com.br'];

const normalize = (h: string) => h.trim().toLowerCase().replace(/^www\./, '');

/** SSR-safe: retorna false no servidor → decida no cliente (useEffect). */
export function isProductionHost(): boolean {
  if (typeof window === 'undefined') return false;
  return PRODUCTION_HOSTS.includes(normalize(window.location.hostname));
}
```

Vantagem: zero infra, funciona com a imagem que você já tem. Limites, explícitos: só funciona
no cliente (precisa cuidar de hidratação), é uma lista no código (domínio novo = novo deploy),
e **não é segurança**. Trate como ponte para a Estratégia 1, não como destino.

### 5.4 Higiene — para dev-only não virar lixo permanente

- **Uma flag por recurso**, com nome que diz o que faz (`ENABLE_SEED_ENDPOINTS`), não uma
  `DEBUG=true` genérica que liga dez coisas não relacionadas.
- **Toda flag no `.env.example`**, com comentário de uma linha e o default seguro (`false`).
- **Sem `{false && ...}` e sem bloco comentado.** Recurso desativado se apaga; recurso
  temporário nasce com data de remoção anotada no PR.
- **Flag de rollout tem prazo.** Depois que o recurso é permanente, remova a flag e os dois
  caminhos — flag eterna vira ramo não testado.
- **`_dev` fora do build de prod, se possível.** Se a ferramenta é grande, isole atrás de
  import dinâmico dentro do bloco compile-time, para o código nem ser baixado.

---

## Parte 6 — Checklist de implementação (para o agente)

### Antes de começar, responda

1. Front e API ficam no **mesmo domínio** atrás de um proxy? *(se sim, Estratégia 0 mata boa
   parte do trabalho)*
2. Quais ambientes existem, e com quais hostnames?
3. Quais variáveis hoje **precisam** ser trocadas antes do build? *(essa é a lista a eliminar)*
4. Onde ficam os segredos hoje — arquivo no servidor, secret manager, Portainer/Dockge?
5. Quem faz o build: máquina de dev ou CI?

### Passos

- [ ] Levantar toda variável *baked* em uso:
      `grep -rn 'NEXT_PUBLIC_\|VITE_\|REACT_APP_\|NUXT_PUBLIC_\|import\.meta\.env' src/`
      (Angular: `src/environments/*.ts`)
- [ ] Classificar cada uma: **elimina** (relativa/proxy) · **vira runtime** · **continua build** (justifique)
- [ ] Decidir o caminho da Parte 3 (3.3 se há servidor Node em runtime; 3.4 se é estático)
- [ ] Criar `src/config/env.ts` no backend (schema validado, fail-fast, `APP_ENV` separado de `NODE_ENV`)
- [ ] Trocar todo `process.env.X` do backend por `env.X`
- [ ] Aplicar a Estratégia 0 no que der (URL relativa + proxy) — só depois montar mecanismo
- [ ] Implementar a config de runtime do front pelo caminho escolhido (3.3 **ou** 3.4)
- [ ] Remover `ARG`/`ENV` de configuração dos Dockerfiles (deixar só `NODE_ENV`, `PORT`, `TZ`)
- [ ] Tirar `build:` do compose de produção; usar `image: ${REGISTRY}/...:${TAG:?}`
- [ ] Trocar `${VAR:-default}` por `${VAR:?msg}` em tudo que é segredo obrigatório
- [ ] Atualizar `.env.example` (todas as chaves do schema, valores fake, comentário por chave)
- [ ] Garantir `.gitignore` cobrindo `.env`, `*.env`, exceto `.env.example`
- [ ] Implementar `ENABLE_DEV_TOOLS` + rotas `/_dev` registradas condicionalmente
- [ ] Implementar `<DevOnly>` no front
- [ ] Documentar no README: como buildar, como deployar, como ligar dev tools

### Critérios de aceite — **todos verificáveis sem rebuild**

1. **Promoção de artefato:** a imagem construída uma vez sobe em dois ambientes diferentes,
   com URLs de API diferentes, trocando apenas o `.env` do servidor.
   ```bash
   docker compose --env-file ./homolog.env -f docker-compose.prod.yml up -d
   # confira no navegador para onde o front chama; depois:
   docker compose --env-file ./prod.env    -f docker-compose.prod.yml up -d
   # mesma imagem (mesmo digest), destino diferente
   docker images --digests | grep app-web
   ```
2. **Fail-fast:** removendo uma variável obrigatória do `.env`, o container **não sobe** e o log
   diz **qual** variável faltou.
3. **Sem segredo na imagem:** `docker history --no-trunc <img> | grep -iE 'secret|token|password'`
   não retorna valor real.
4. **Dev tools desligado = 404:** com `ENABLE_DEV_TOOLS=false`, `curl -i .../_dev/estado`
   responde **404** (não 403, não 500).
5. **Dev tools liga sem rebuild:** setar `ENABLE_DEV_TOOLS=true` no `.env` + `up -d` faz a rota
   passar a existir, com a **mesma imagem**.
6. **Bundle limpo:** o que estiver atrás do gate compile-time não aparece no bundle de produção:
   ```bash
   # ajuste o diretório: .next/static/ (Next) · dist/ (Vite/CRA) · www/ (Angular)
   grep -r 'PainelDeMocks' dist/ || echo 'OK: removido do bundle'
   ```
7. **Config chega no navegador sem rebuild** (só para 3.4): `curl -s http://localhost/env.js`
   devolve os valores do `.env` atual, e vem com `Cache-Control: no-store`.

---

## Apêndice A — Troubleshooting

| Sintoma | Causa provável | Como confirmar |
|---|---|---|
| "Mudei o `.env` e nada mudou" (front) | Valor foi *baked* no build | `grep -r 'valor-antigo' dist/ .next/static/` — se achar, é build-time |
| "Mudei o `.env` e nada mudou" (backend) | Container não foi recriado | `docker compose up -d --force-recreate <svc>` |
| "Está no `.env` da raiz mas não chega no container" | `.env` do compose só interpola `${}`; falta `env_file:`/`environment:` | `docker compose exec <svc> env \| sort` |
| `NEXT_PUBLIC_*` / `VITE_*` vazio no navegador | Não existia no momento do build | Ver `build.args` do compose e `ARG` no Dockerfile |
| `/env.js` traz valor do deploy anterior | Cache do navegador/CDN | `curl -sI .../env.js \| grep -i cache` → precisa ser `no-store` |
| `window.__APP_CONFIG__` é `undefined` na inicialização | Bundle executou antes do `/env.js` | A tag `<script src="/env.js">` tem que vir **antes** do bundle no `index.html` |
| Funciona local, quebra no servidor | `${...}` resolvendo diferente | `docker compose config` nos dois lados e comparar |
| Valor antigo "grudado" mesmo com `--build-arg` novo | Cache de layer | `docker build --no-cache`, e declare o `ARG` logo antes do uso |
| Front chama `http://api:3333` do navegador | Nome de serviço do Docker não existe fora da rede Docker | O navegador precisa de URL pública/relativa, não do hostname interno |
| Container sobe "unhealthy" (Next standalone) | Next binda no hostname do container, não em `0.0.0.0` | `ENV HOSTNAME=0.0.0.0` + probe em `127.0.0.1` |
| Banco não volta após reboot do host | Serviço `db` sem `restart:` | App entra em crash-loop com `ENOTFOUND db` |

---

## Apêndice B — O que este guia não cobre

- **Secret manager de verdade** (Vault, AWS/GCP Secrets Manager, Docker Swarm secrets): aqui o
  modelo assumido é `.env` com permissão restrita no servidor. Para múltiplos operadores ou
  auditoria de acesso a segredo, isso é insuficiente.
- **Kubernetes** (ConfigMap/Secret, `envFrom`): os princípios das Partes 0–3 valem iguais, os
  arquivos mudam.
- **Rotação de segredo sem downtime** e migração de valores já vazados em histórico de git.
- **Blue-green / zero-downtime deploy**: o `up -d` daqui derruba e sobe o container.
- **CI**: os comandos da Parte 4 são o que a pipeline deve rodar, mas não há pipeline pronta.

**Procedência do conteúdo:** os padrões de Parte 1, 2 e 4 (precedência do Compose, `${VAR:?}`,
`docker history`, secret mount, promoção por tag) são comportamento documentado do Docker/Compose;
a Parte 3 decorre de como Next/Vite fazem substituição textual no build. Os trechos de
`runtime-env.ts` (5.3), `HOSTNAME=0.0.0.0` e `restart:` do `db` (Apêndice A) vêm de problemas
já enfrentados e resolvidos em produção no projeto Contracheque. **O que não foi medido:** este
guia não foi aplicado de ponta a ponta em nenhum repo ainda — os critérios de aceite da Parte 6
são o teste que fecha isso, e devem ser executados na primeira implementação.
