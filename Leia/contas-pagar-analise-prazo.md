# Contas a Pagar — Análise de Prazo dos Títulos

**Autor:** Leonardo + implementação assistida · **Empresa:** Viação Pioneira · **Data:** 13 de julho de 2026 · **Status:** implementado e no ar (Docker)

> Controle de **prazo** dos títulos de contas a pagar — nasceu da necessidade do financeiro: vários funcionários incluem títulos no Globus, o setor de compras emite boletos com prazo longo (compra em julho pra pagar em setembro), e é preciso enxergar **quantos títulos entram por mês**, **quantos têm prazo > 30 dias**, e principalmente **quantos com prazo longo já venceram e não foram pagos**.

---

## 1. Conceito

- **Prazo** de um título = `data_vencimento − data_emissao` (em dias). É o "fôlego" que o boleto dá pra pagar.
- **Incluído por mês** = quando o funcionário **lançou o título no Globus** (`data_inclusao`, fuso `America/Sao_Paulo`; fallback pra `data_emissao` quando a trilha de inclusão não veio).
- **Alerta crítico** = título com **prazo > 30 dias** que **já venceu** (`data_vencimento < hoje`) e **não foi pago** — comprou com folga, a folga acabou e o boleto ficou em aberto.

Os três estados de pagamento seguem a mesma regra do resto do CP:
`pago = status='pago' OR quitado=true OR data_pagamento IS NOT NULL`. Títulos **substituídos** (SFN-48) ficam **fora** de toda a análise (senão dobram valor/quantidade).

---

## 2. Endpoint

```
GET /api/contas-pagar/analise-prazo
```

**Roles:** `admin` · `cfo` · `controller` · `cp_analista`.

**Query** (mesmos filtros do sumário/listagem + `mesesInclusao`): `dtIni`/`dtFim` (janela de **vencimento**), `search`, `status`, `origem`, `setores`, `valorMinCents`/`valorMaxCents`, `somenteVencidos`, e **`mesesInclusao`** (3 / 6 / 12 — default 3).

**Resposta** (`AnalisePrazoResponse`, em `packages/shared/src/schemas/contas-pagar.ts`):

| Campo | O que é |
|---|---|
| `inclusoesPorMes[]` | `{ mes: 'YYYY-MM', quantidade, valorLiquidoCents }` — últimos N meses por **data de inclusão** |
| `distribuicaoPrazo` | baldes mutuamente exclusivos: `ate30` / `de31a60` / `de61a90` / `mais90` / `semData`, cada um `{ quantidade, valorLiquidoCents }` |
| `prazoLongo` | consolidado dos > 30 dias (soma de 31-60 + 61-90 + >90) |
| `prazoLongoVencidoNaoPago` | o **alerta**: `{ quantidade, valorAPagarCents }` |

> `semData` = título sem emissão (não dá pra calcular prazo). Princípio "quando não tem dado, o sistema diz que não tem".

### Escopos (importante)
- **Distribuição + alerta** rodam sobre a **janela de vencimento** (`dtIni`/`dtFim`) + filtros de atributo — o mesmo escopo da tela.
- **`inclusoesPorMes` é DESACOPLADO do vencimento**: usa uma query própria com só os filtros de atributo (setor/status/origem/busca/valor) + `data_inclusao >= date_trunc('month', hoje) − make_interval(N-1 meses)`. Assim a série mostra os **últimos N meses de inclusão**, não "inclusões de títulos que vencem no período" (que trazia meses de anos atrás).

---

## 3. Frontend

Tela **Contas a Pagar** (`apps/FinancasFrontend/src/app/(private)/contas-pagar/`):

### 3.1 Painel "Análise de prazo dos títulos" (`_components/AnalisePrazoPanel.tsx`)
- **Alerta** vermelho (some quando zero) — **clicável**: filtra a lista pros títulos do alerta.
- **Distribuição por prazo** em barras — **cada faixa é clicável**: filtra a lista pra aquela faixa.
- **Incluídos por mês** com **seletor 3 / 6 / 12 meses** (padrão 3).
- A faixa/alerta ativa fica destacada; clicar de novo remove o filtro.

### 3.2 Drill-down (filtros da lista)
Clicar no painel seta filtros na `ContaPagarListQuerySchema`, aplicados em `aplicarFiltros` do service:
- `prazoFaixa`: `ate30` | `de31a60` | `de61a90` | `mais90` | `semData`.
- `prazoLongoVencido`: boolean (a condição exata do alerta).

Um selo **"Filtrando pela análise de prazo · limpar filtro de prazo"** aparece acima da tabela. O filtro **respeita o período/atributos já aplicados** — o drill-down mostra a faixa **dentro do que está filtrado**.

### 3.3 Coluna "Emissão / Vencimento / Pagamento"
Antes a listagem só tinha o vencimento. Agora cada linha mostra:
- **emitido dd/mm/aaaa · prazo Nd** (o prazo fica âmbar quando > 30 dias);
- **vence dd/mm/aaaa** (vermelho se venceu em aberto) + **"N dias em atraso"**;
- **pago em dd/mm/aaaa** — verde "no prazo" ou **vermelho "· Nd de atraso"** quando o pagamento saiu depois do vencimento.

---

## 4. Arquivos

| Camada | Arquivo |
|---|---|
| Schema | `packages/shared/src/schemas/contas-pagar.ts` (`AnalisePrazoRequest/Response`, `prazoFaixa`/`prazoLongoVencido` na list query) |
| Service | `apps/FinancasBackend/src/modules/contas-pagar/contas-pagar.service.ts` (`analisePrazo`, filtros em `aplicarFiltros`) |
| Rota | `apps/FinancasBackend/src/modules/contas-pagar/contas-pagar.routes.ts` (`GET /analise-prazo`) |
| UI painel | `apps/FinancasFrontend/.../contas-pagar/_components/AnalisePrazoPanel.tsx` |
| UI página | `apps/FinancasFrontend/.../contas-pagar/page.tsx` (datas na listagem, drill-down, selo) |
| Filtros | `apps/FinancasFrontend/.../contas-pagar/_components/FiltrosCp.tsx` (`FiltrosCpValues`) |

---

## 5. Decisões e limites

- **Sem migration** — tudo é query sobre colunas que já existiam (`data_emissao`, `data_vencimento`, `data_pagamento`, `data_inclusao`, `quitado`).
- **"Incluídos por mês" por data de inclusão** (quando o funcionário lançou), não por emissão do documento — reflete "quantos títulos entraram no mês". Trocável se o financeiro preferir emissão.
- **Validação:** typecheck limpo (back + front + shared); SQL exercitado direto no Postgres. O `lint` não roda neste ambiente (config do eslint não resolve — pré-existente). Deploy via `pnpm docker:app:rebuild` (front 3001 / back 3343).
