# Orçamento / Planejamento — mapeamento

> Módulo **planejado** (Fase 4). Página é placeholder (`(private)/orcamento/page.tsx`).
> Fonte de verdade do status: `apps/FinancasFrontend/src/lib/module-status.ts`.

## Onde estamos

A **estrutura** das tabelas de orçamento do Globus já foi mapeada (exploração 18/05), mas
**nunca os dados** — não sabemos se a Pioneira mantém o orçamento no Globus ou numa planilha.

Estrutura conhecida:
- **`CPG_CAD_ORCAMENTO`** (cabeçalho): `CODIGO_ORCAMENTO`, `DESCRICAO`, `EXERCICIO`,
  `PERMITE_DESPESA_MAIOR_RECEITA`, `UTILIZA_CENTRO_CUSTO`.
- **`CPG_CAD_ORCAMENTO_PREVISOES`** (linhas): `CODINTORC`, `CODIGO_ORCAMENTO`, `DATAPREVISAO`,
  `VALOR`, `META`, `TIPORECEITA`, `TIPODESPESA`, **`CODCUSTOFIN`**.
- Segundo subsistema a checar: `CPGORCESTRUTURA` / `CPGORCITESTRUTURA` / `CPGORCPREVISOES`.

Primeiro passo = rodar [`sql-exploracao/2026-07-03-orcamento-rodada-1.sql`](../sql-exploracao/2026-07-03-orcamento-rodada-1.sql).

## A vantagem que já temos: o REALIZADO está pronto

O eixo do orçamento é **`CODCUSTOFIN`** (centro de custo financeiro) — o **mesmo** que já
usamos como "setor" em Contas a Pagar (`CPGITDOC.CODCUSTOFIN` → `CPGCUSTOS`, ver
[[globus-setor-custofin]]). Ou seja, o **realizado por centro de custo já vive no nosso banco**
(`finance.contas_pagar`, com `rateio_setores`). O módulo Orçamento é essencialmente o
**orçado** + o join com o realizado que já temos + a comparação.

## A pergunta que decide o escopo

**As tabelas de orçamento do Globus têm dados?** (Parte B do SQL.)

| Cenário | O que o módulo vira | Esforço |
|---|---|---|
| **A — Globus tem o orçado** (`CPG_CAD_ORCAMENTO_PREVISOES` populado por exercício/CODCUSTOFIN) | **Leitor**: sincroniza o orçado do Globus, cruza com o realizado (nosso CP), mostra orçado × realizado por centro de custo e mês, sinaliza estouro. | menor (~2-3 sem) |
| **B — Globus vazio, orçamento em planilha** | **Import/cadastro**: precisa de upload CSV ou tela de edição do orçado antes de comparar. O comparativo em si reusa o realizado que já temos. | maior (~4-6 sem, escopo do card) |

**Regra herdada v1:** se o Globus já tem o dado, o sistema lê; só construímos entrada de dados
para o que ninguém mantém. (Mesma lição da Depreciação, onde o ATF estava vazio.)

## Perguntas ao financeiro (agora com dado + confirmação)

1. **Orçamento anual ou trimestral?** → `EXERCICIO` + granularidade de `DATAPREVISAO` respondem.
2. **Como acompanham realizado × orçado hoje?** → se o orçado está no Globus por `CODCUSTOFIN`,
   o cruzamento com nosso CP é imediato; senão, confirmar onde a planilha vive.
3. **Quantos centros de custo? Por garagem ou mais granular?** → `COUNT(DISTINCT CODCUSTOFIN)` +
   nomes via `CPGCUSTOS` (Parte D). Comparar com as ~8 unidades que já usamos no CP.

## Resultados da rodada 1 (2026-07-03) — a mira mudou de tabela

**O subsistema documentado (`CPG_CAD_ORCAMENTO_*`) está VAZIO.** O dado de orçamento vive em
**`CPGORCPREVISOES`** — e essa é a tabela certa (tem `CODIGOEMPRESA`/`CODIGOFL`/`CCUSTOFINANC`).

### A — estrutura
- `CPG_CAD_ORCAMENTO` (6 cols) e `CPG_CAD_ORCAMENTO_PREVISOES` (8 cols, com `CODCUSTOFIN`) — **como
  documentado, mas VAZIAS**. `CPG_PREVISOES_HISTORICOS` traz o workflow de revisão
  (`VALOR_ANTERIOR/ATUAL`, `JUSTIFICATIVA`, `EXIGE_AUTORIZACAO`) — mas sem dado.
- **`CPGORCPREVISOES`** (12 cols) ⭐ — a que tem dado: `CODINTORC`, **`CODIGOEMPRESA`**, **`CODIGOFL`**,
  `DATAPREVISAO`, `TIPORECEITA`, `TIPODESPESA`, **`CCUSTOFINANC`**, `MOEDA`, `VALOR` (21,6),
  `JUSTIFICATIVA`, `TIPOCALCULO`, `VALORPREVISAO` (20,2).
- `CPGORCESTRUTURA` (CODIGO/DESCRICAO/TIPO) + `CPGORCITESTRUTURA` (linhas de estrutura por faixa de
  conta, tipo relatório/DRE) — definição da estrutura do orçamento. **Vazias.**
- Inventário: existem `CPG_ASSOC_ORCAMENTO_EMPFIL`, `CPGORCTPRECEITA`, `CPGORCDADOSADICIONAIS`,
  e uma família `CGS_ORCAMENTO*` (orçamento comercial/proposta — não é o financeiro).

### B — as tabelas têm dado?
| Tabela | Linhas |
|---|---|
| CPG_CAD_ORCAMENTO | 0 |
| CPG_CAD_ORCAMENTO_PREVISOES | 0 |
| CPGORCESTRUTURA | 0 |
| CPGORCITESTRUTURA | 0 |
| **CPGORCPREVISOES** | **4.661** |

### C — amostra do CPGORCPREVISOES
⚠️ **Alerta:** as linhas amostradas são **empresa 1, filial 1, ano 2009** (`DATAPREVISAO` dez/2009,
`TIPORECEITA` 40005/40006, `VALOR` 160k/73k). Não é empresa 4, e é antigo. Junto com estrutura
vazia, cheira a **orçamento legado/não usado pela Pioneira** (mesmo padrão do ATF na Depreciação).

### D — orçado por exercício + centro de custo
Voltou **vazio** — minha D1/D2 miraram o `CPG_CAD_ORCAMENTO` (vazio). Refeito na rodada 2 contra
`CPGORCPREVISOES`, filtrando **empresa 4**.

### Pergunta que a rodada 2 fecha
**Existe linha de empresa 4 recente em `CPGORCPREVISOES`?** Se sim → cenário A (leitor). Se não
(tudo empresa 1/2009) → cenário B (import/cadastro do orçado; o realizado já temos).

## Resultados da rodada 2 (2026-07-03) — Globus sem lançamentos desde 2020 → Cenário B

**A Pioneira lançou orçamento no Globus até maio/2020; de 2021 em diante não há lançamentos — o
MOTIVO ainda não sabemos** (pode ser descontinuação, plano plurianual, ou migração pra outra
ferramenta; a confirmar com o financeiro — não afirmar "abandonado"). Empresa 4 = 3.104 linhas em
`CPGORCPREVISOES` (a maior de todas as empresas). Por ano:

| Ano | Linhas | Valor orçado |
|---|---|---|
| 2020 | 181 | R$ 40,6M (parou em 01/05) |
| 2019 | 1.261 | R$ 584,6M |
| 2018 | 1.180 | R$ 509,0M |
| 2010 | 230 | R$ 12,9M |
| 2009 | 249 | R$ 15,3M |
| 2000/2001/2017 | esparso | — |

**Nada de 2021→2026** (6 anos sem lançamento — motivo a confirmar). E a granularidade era baixa: em
2020, só 2 baldes — `50000 UNIDADE UNIÃO` (R$ 19,1M) + linhas sem centro de custo (R$ 21,5M).
Lançamentos **diários** (`DATAPREVISAO` por dia; receita `40005/40006`, despesa `30008/30010`) —
mais parecido com **previsão de caixa** do que orçamento anual por conta. `VALORPREVISAO` sempre 0 →
o valor está em `VALOR`.

**Conclusão:** o orçamento atual **não é lançado no Globus** (independente do motivo do 2020). Cenário
**B** — o módulo precisa
de **cadastro/import do orçado**; o **comparativo** reusa o realizado que já temos
(`finance.contas_pagar` por `CODCUSTOFIN`). Puxar o histórico 2018-2020 do Globus como baseline é
possível, mas provavelmente não vale (velho e grosseiro).

## O que falta pra construir (Cenário B)

O dado respondeu "não está no Globus", mas o **formato** do orçado depende do processo atual do
financeiro — não dá pra adivinhar. Antes de construir, decidir:
1. **Granularidade**: por centro de custo/setor (casa com o realizado que temos) · por conta contábil
   (natureza da despesa) · por garagem.
2. **Entrada**: import CSV · tela de edição no sistema · (baseline do histórico Globus).
3. **Período**: anual com quebra mensal · trimestral.

MVP recomendado: orçado por **centro de custo × mês × tipo** (mesmo eixo do realizado), entrada por
**CSV + tela**, comparativo mensal com flag de estouro (>110%). Ajustável conforme o financeiro.

## Modelo de dados (rascunho — preencher após rodada 1)

- Schema `finance`, valores em **centavos (BIGINT)**, `empresa_id`, datas `timestamptz`.
- Orçado: uma linha por (exercício, centro de custo, competência/mês, tipo). Realizado: reusa
  `finance.contas_pagar` por `CODCUSTOFIN`. Comparativo query-time.
- Estados explícitos (real / calculado / projetado / sem dado). Rastreabilidade
  (`origem_sistema`, `origem_id_externo`).

## Entregue (14/07/2026) — BASELINE histórico como isca (decisão do user)

O financeiro não respondeu as perguntas. Em vez de construir o import do orçado atual no escuro
(risco de retrabalho sem saber o eixo/formato), decidimos **construir o baseline legado do Globus
como prova de conceito + isca** para provocar a resposta. Mesma tática que funcionou no Tributos
(o calendário destravou as perguntas).

**Vertical slice entregue** (espelha o padrão `folha-gps`):
- `integration.globus_cpgorc_stage` + `finance.orcamento_previsao` — migration `1700000045000`.
- Query `GLOBUS_QUERIES.orcamentoPrevisoes` (CPGORCPREVISOES + join CPGCUSTOS pelo nome do centro).
- Adapter `globus-orcamento.adapter.ts` (idempotente via hash) + ETL `orcamento.etl.ts`
  (deriva ano/competência/tipo de TIPORECEITA/TIPODESPESA; valor de `VALOR`).
- Módulo `modules/orcamento` (`/api/orcamento/baseline` + `/sincronizar`) + schemas em
  `packages/shared/src/schemas/orcamento.ts`.
- Página `/orcamento` real (era placeholder): KPIs, orçado por ano, orçado por centro de custo do
  ano de detalhe, e o **card-isca** com as observações + botão pra "Perguntas ao Financeiro".
- `module-status`: `/orcamento` passou de `planejado` → `parcial` (baseline ✅; orçado atual +
  comparação ⏳ aguardando o financeiro).

**Pendências (dependem do financeiro, NÃO construídas de propósito):** import/cadastro do orçado
atual, comparativo realizado × orçado, estouro, workflow de revisão, export. Destravam quando as
4 perguntas forem respondidas (eixo, formato, periodicidade, planilha atual).

**Para rodar:** `migration:run` (cria as 2 tabelas; no Docker é manual — ver
[[docker-migrations-manuais]]) e depois "Sincronizar baseline" na tela (requer Oracle/Globus,
empresa 4). Sem sync, a tela mostra o estado vazio com o convite pra sincronizar.

## Entregue (14/07/2026) — ORÇADO DERIVADO do realizado (base técnica, projetado)

Insight do user: "com base nas informações do próprio sistema já dá pra ter uma noção de como
fazer, exemplo fluxo de caixa". Em vez de esperar o orçado do financeiro, o sistema **PROPÕE** uma
base técnica derivada do realizado — mesma lógica do Fluxo de Caixa (projeta do histórico, não
inventa).

- **`GET /api/orcamento/derivado?meses=12`** — query-time sobre `finance.contas_pagar` (SEM tabela
  nova, SEM migration, SEM sync). Agrega o gasto por centro de custo via `rateio_setores`
  (fallback `cod_setor` pra títulos legados; valor bruto por item), na janela dos últimos 12 meses
  ancorada no último mês com gasto. Orçado mensal sugerido por setor = realizado 12m / 12.
- **Rótulo disciplinado:** estado `projetado`, NUNCA "orçamento oficial" — é sugestão que o
  financeiro aceita/ajusta (mesma regra do "receita técnica ≠ receita real"). Cobre despesa/custo;
  receita orçada fica de fora.
- **Página `/orcamento`:** seção "Orçado sugerido — base técnica" no topo (útil desde já, roda do CP
  sem Globus) + o baseline legado do Globus abaixo como "Referência histórica".
- Base do cálculo escolhida: **média dos últimos 12 meses** (suaviza sazonalidade/picos). Alternativas
  descartadas no MVP: mesmo-mês-ano-anterior (sensível a evento pontual) e média×fator (fator vira
  premissa do financeiro).

Este derivado é o **seed** do "cadastro/import do orçado" que estava travado: em vez de planilha,
o sistema propõe e o financeiro corrige. Quando as 4 perguntas forem respondidas (eixo, formato,
periodicidade, planilha), fecha-se o aceite + o comparativo realizado × orçado.

### Classificação de setores + validação no Globus (2026-07-15)

O orçado derivado marca cada centro de custo como **receita / apoio / central** (a
ADMINISTRAÇÃO N. BANDEIRANTE concentra o pagamento das dívidas dos setores → aparece inflada; a UI
avisa e NÃO redistribui — rateio é decisão do financeiro). Duas queries de validação rodadas
(`sql-exploracao/2026-07-15-orcamento-validacao.sql`):

- **Q1 — CPGORCPREVISOES (empresa 4):** 3.104 linhas = 3.104 `CODINTORC` distintos → **chave do
  sync é segura** (não perde linha). `VALORPREVISAO` sempre 0 e `VALOR` sem nulos → ETL correto.
  Datas 2000–2020 (8 anos). **Baseline liberado pra sincronizar.**
- **Q2 — CPGCUSTOS:** cada unidade tem 4 sub-códigos `X0000..X0003` com a mesma descrição → a
  classificação passou a ser por **prefixo** (dezena de milhar), não por código exato, senão
  sub-códigos cairiam em "não classificado". Fora da faixa há centros legados (PMDF, COMLURB,
  CARGA, OBRA) → 'indefinido'.
