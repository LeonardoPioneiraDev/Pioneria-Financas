# Depreciação / Ativo Imobilizado — mapeamento

> Módulo **planejado** (Fase 3). Página é placeholder (`(private)/depreciacao/page.tsx`).
> Este doc guia a construção. Fonte de verdade do status: `apps/FinancasFrontend/src/lib/module-status.ts`.

## Onde estamos

A base de dados da frota no Globus **nunca foi explorada** — a `rodada-5` de 2026-05-18
listou `FRT_CADVEICULOS` / `FRT_COMPRAVEIC` mas os resultados nunca voltaram, então não
sabemos colunas, volumetria nem se a depreciação já é lançada na contabilidade.

Sem isso não dá pra desenhar o modelo de dados. Primeiro passo = rodar
[`sql-exploracao/2026-07-03-depreciacao-rodada-1.sql`](../sql-exploracao/2026-07-03-depreciacao-rodada-1.sql)
e colar os resultados aqui.

## A pergunta que decide o escopo

**A depreciação já é calculada e lançada dentro do Globus (contabilidade)?**
(Partes D e E do SQL respondem.)

| Cenário | O que o módulo vira | Esforço |
|---|---|---|
| **A — Globus já lança** (contas de depreciação com saldo mensal em `CTBSALDO`) | **Leitor**: sincroniza o que já existe, apresenta por garagem/centro de custo, DRE puxa daqui. Não recalculamos nada — evita divergência com a contabilidade oficial. | menor (~1-1,5 sem) |
| **B — Globus tem só o custo do bem, sem depreciação** (imobilizado em `CTBSALDO`, mas nenhuma conta de depreciação com movimento) | **Calculadora**: cadastro de ativos a partir de `FRT_CADVEICULOS` + valor de `FRT_COMPRAVEIC`, depreciação linear por categoria, valor residual + vida útil, lançamento mensal. Escopo original do card. | ~3 sem |
| **C — Frota sem valor de aquisição confiável** | Precisa de fonte alternativa (planilha do financeiro / NF de compra via CP) antes de calcular. | +1 sem de fonte |

**Regra herdada do v1:** se a contabilidade oficial já deprecia, o sistema **lê**, não
recalcula (zero divergência com o fechamento). Só calculamos o que ninguém calcula.

## Perguntas ao financeiro (agora respondidas por dado + confirmação)

1. **Em qual sistema/planilha a depreciação é feita hoje?** → cruzar com Parte D. Se já
   está no Globus, confirmar se é a versão "oficial" ou se refazem em planilha à parte.
2. **Vida útil dos ônibus (5/7/10 anos)?** → se cenário A, deriva da taxa observada
   (depreciação mensal ÷ custo). Confirmar o número com o contador.
3. **Ativos não-frota relevantes?** → Partes F1/F2 listam o que o plano de contas
   classifica como imobilizado além de veículos.

## Resultados da rodada 1

> Rodada 1 executada em 2026-07-03. **Cenário A confirmado**: o Globus já calcula
> (módulo `ATF_*`) e contabiliza (contas 31500/14500) a depreciação. Módulo = **leitor**.

### A1 — estrutura FRT_* (colunas que importam)

`FRT_CADVEICULOS` (81 cols) — cadastro do veículo. Relevantes p/ ativo:
- **`CODIGOVEIC`** (PK, NUMBER)
- **`PREFIXOVEIC`** VARCHAR2(7) — nº de frota (ex.: `0001972`)
- **`PLACAATUALVEIC`** VARCHAR2(15) — placa (ex.: `JJB-7885`)
- **`DTINICIOUTILVEIC`** DATE — início de utilização ⭐ (âncora da depreciação)
- **`CONDICAOVEIC`** CHAR(1) — `V`/`I` (a mapear: em uso × inativo)
- **`CODIGOSITVEIC`** — situação do veículo (a mapear)
- **`CODIGOTPFROTA`** → `FRT_TIPODEFROTA` (categoria)
- **`CODIGOGA`** — garagem; **`CODCUSTOFIN`** — centro de custo financeiro (mesmo universo do setor de CP)
- **`CODIGOEMPRESA` / `CODIGOFL`**; `POSSIVELVENDA`, `ACEITAMOVVENDAVEIC` (baixa/venda)

`FRT_COMPRAVEIC` (14 cols) — compra do veículo:
- `CODIGOVEIC`, `CODIGOTIPOBEM`, **`CODINTNF`** (→ `BGM_NOTAFISCAL`, valor de aquisição),
  `NROPLANO`, **`CODCONTACTB`** (conta do imobilizado), `MESANOFABRCPRVEIC`, `MESANOMODCPRVEIC`,
  `BEMATUALCPRVEIC` (S/N — bem atual do veículo). **Sem coluna de valor direto** — vem via NF ou via ATF.

`FRT_TIPODEFROTA` — categorias reais da Pioneira: `RODOVIARIO`, `AGREGADO`, `URBANO BASICO`,
`URBANO ARTICULADO PISO ALTO/BAIXO`, `URBANO PADRON`, `URBANO SUPER PADRON`, `URBANO MICRO`,
`ESCOLAR`, `CARRO DE APOIO`, `ARTICULADO BRT PISO BAIXO`, `DESATIVADO`, `INATIVO`.

### A2 — `CTBITLNC` (item do lançamento — onde mora o valor)
`CODLANCA`+`CODITEMLANCA` (PK), `NROPLANO`, **`CODCONTACTB`**, `CONTRAPARTITEMLANCA`, `CODCUSTO`,
**`DEBITOCREDITOITEMLANCA`** CHAR(1), **`VRITEMLANCA`** NUMBER(15,2), `HISTORICOITEMLANCA` VARCHAR2(2000).
→ permite drill-down no lançamento individual de depreciação (filtrar conta 31500).

### C — volumetria frota
- Total de veículos no grupo: **3.515**.
- Veículos empresa 4 (Pioneira): **2.143**.

### D — depreciação JÁ está na contabilidade (SIM)
- Contas: **14500** `1.3.02.50.0000 DEPRECIACOES E AMORTIZACOES` (acumulada, redutora do ativo) e
  **31500** `3.1.02.07.0000 DEPRECIACOES E AMORTIZACOES` (despesa). Também `1.3.02.51` (direito de uso),
  `3.2.02.05/06` (depreciação de bem arrendado).
- `CTBSALDO` empresa 4: despesa mensal na 31500 ≈ **R$ 39 mil/mês** (202601–202605), casando com crédito
  na 14500. 202606+ zerados = fechamento não rodado (hoje jul/2026). Débitos grandes esporádicos na 14500
  (ex.: 202509, 202511, 202605) = baixa de acumulada na venda/sucata de veículo.
- ⚠️ Valor mensal baixo p/ 2.143 veículos → hipótese: grande parte da frota **já totalmente depreciada**
  (aquisições 2005–2011) e/ou sob **arrendamento mercantil** (contas `1.3.02.02` / `3.2.02.05-06`). Validar na rodada 2.

### E — valor do imobilizado da frota
Plano segregado por sub-conta: gross `1.3.02.01.1501` (FROTA OPERACIONAL), `.1508` (CAMINHÕES),
`.6301` (VEÍCULOS AUXILIARES), `1.3.02.02.1501` (ARREND MERCANTIL); acumulada `1.3.02.50.*`;
despesa `3.1.02.07.*`. ⚠️ Bloco E1 da rodada 1 voltou zerado por **bug meu**: filtrei `PERIODOSALDO = MAX`,
que pega período futuro pré-criado vazio. Corrigido na rodada 2 (soma histórica + período fechado real).

### F — ativos não-frota / módulo de ativo fixo ⭐
Query 11 revelou o **módulo de Ativo Fixo do Globus** (a fonte de verdade da depreciação):
- **`ATF_DEPRECIACAO`** — cadastro/controle de depreciação por bem.
- **`ATFITEM_DEPRECMES`** — depreciação por item **por mês** (a granularidade que o módulo vai ler).
- **`FRE_TABELADEPRECO`** / **`FREM_TABELADEPRECO`** (+ `_AGRUPAMENTO`) — tabelas de preço/taxa (vida útil).

→ Isso cobre frota **e** não-frota num único subsistema. O módulo lê o ATF, não recalcula.
Rodada 2 mapeia essas tabelas.

## Resultados da rodada 2 (2026-07-03) — vira o diagnóstico

**O módulo ATF do Globus está VAZIO.** `ATF_DEPRECIACAO`, `ATFITEM_DEPRECMES` = 0 linhas
(queries H1/H2/I1). A Pioneira **não roda** a depreciação dentro do Globus. Ela é calculada
**por fora** (planilha — os valores são fixos e redondos, ex.: INSTALAÇÕES exatamente `6.950,32`
todo mês; FROTA OPERACIONAL `7.294,88`→`10.211,37`) e apenas **lançada** na contabilidade
mensalmente: 1 lançamento (`CTBLANCA`) por mês com ~7 itens, um por classe de ativo (`CTBITLNC`).

### Fonte de verdade = CONTABILIDADE, não o ATF nem por-veículo
- **Despesa mensal** por classe: `CTBSALDO` / `CTBLANCA`, família `3.1.02.07.*`. Total ≈ R$ 34–39 mil/mês.
  Classes: `.1501 FROTA OPERACIONAL` (~R$ 7–10k), `.6301 VEÍCULOS AUXILIARES` (~R$ 5,5k),
  `.2401 INSTALAÇÕES`, `.3601/.3602/.3603` máq/móveis, `.0602 COMPUTADORES`.
- **Não existe depreciação por veículo em lugar nenhum** (ATF vazio; contabilidade é por classe).
  Relatório "por garagem/centro de custo" do card **não é sustentável com o dado atual** sem inventar
  rateio — o que viola "quando não tem dado, o sistema diz que não tem".

### Base de ativos (query J1 — saldo em aberto, empresa 4)
| Conta | Descrição | Saldo |
|---|---|---|
| 1.3.02.01.1501 | Frota operacional (própria) — bruto | R$ 101.773.137 |
| 1.3.02.02.1501 | Frota operacional — **arrendamento mercantil** (direito de uso) | R$ 100.827.126 |
| 1.3.02.01.6301 | Veículos auxiliares | R$ 1.222.761 |
| 1.3.02.01.1508 | Frota auxiliar (caminhões) | R$ 497.574 |
| 1.3.02.01.0602/2401/3601-3 | Computadores, instalações, máquinas, móveis | ~R$ 2,6M |
| 1.3.02.01.* imóveis | Terrenos e casas | ~R$ 3,66M |
| **1.3.02.50.*** | **Depreciação acumulada** | **-R$ 113.186.354** |

**Leitura:** a frota **própria** (R$ 101,8M) está **quase toda depreciada** (por isso a despesa
mensal é baixa). O grosso do valor real da frota hoje é o **arrendamento mercantil** (R$ 100,8M,
direito de uso / IFRS-16), cuja depreciação provavelmente cai em **`3.2.02.05/06`** (não no
`3.1.02.07`) — a confirmar na rodada 3. Então "vida útil do ônibus" importa menos que **prazo do
arrendamento**.

### Nuance contábil vs fiscal
Query H3 revelou o parâmetro de método: `0=contábil`, `1=fiscal`, `2=valor integral`. O Globus
distingue depreciação **contábil** × **fiscal**. O que lemos (conta 31500) é a **contábil** (fechamento).

## Escopo revisado (o que o módulo REALMENTE é)

**"Depreciação Contábil"** — leitor fiel da depreciação **contabilizada**, por **classe de ativo** e mês:
1. Despesa de depreciação mensal por classe (real, `3.1.02.07.*` + arrend `3.2.02.05/06`).
2. Base de ativos: bruto / acumulada / líquido por classe (`1.3.02.01`, `.02`, `.50`).
3. Evolução mês a mês + conciliação com a DRE.

**Fora de escopo (sem dado que sustente):** depreciação por veículo e relatório por garagem — o ATF
está vazio e a contabilidade é por classe. Só viável se a Pioneira passar a popular o ATF, ou aceitar
rateio estimado (não recomendado). A rodada 3 checa se `ATFITEM`/`ATF_AQUISICOES` têm ao menos um
**cadastro de bens** (registry) mesmo sem valores de depreciação.

Estimativa revisada: **~1 semana** (leitor de classe) — construção começa assim que a rodada 3 fechar.

## Resultados da rodada 3 (2026-07-03) — existe cadastro de bens

**`ATFITEM` (cadastro do bem) TEM dados: 7.686 registros** (empresa+filial). Colunas por bem:
`CODIGO` (PK), `CONTA` (conta contábil), `PATRIMONIO`, `DESCRICAO`, **`AQUISVALOR`** (13,2),
**`AQUISDATA`**, **`TAXADEPREC`** (7,4), **`INICIODEPREC`**, **`DATABAIXA`** + `VLRBAIXA`/`HISTBAIXA`,
placa/chassi na característica. Já dá pra **calcular depreciação linear por bem** (AQUISVALOR × TAXADEPREC
a partir de INICIODEPREC, parando na DATABAIXA) — o Globus só não roda isso (`ATFITEM_DEPRECMES` vazio).

- **Vida útil / taxa:** `TAXADEPREC = 20%` na amostra → **5 anos** para ônibus (responde Q2 do financeiro).
- **`ATF_AQUISICOES` = 0**, `ATFITEMCOMPRAVEIC` = 1.509 (ponte bem↔compra de veículo existe).
- ⚠️ **Sinal de cadastro histórico:** amostra são bens 1996–2003, quase todos **baixados** (venda 2009–2012).
  Precisa confirmar se `ATFITEM` está **atualizado** (bens ativos recentes) ou parou há anos → rodada 4.
- ❌ **Correção:** `3.2.02.05` NÃO é depreciação de arrendamento — é "NÃO DEDUTÍVEIS" (multas de trânsito,
  brindes). A depreciação do arrendamento mercantil (R$ 100,8M direito de uso) **não achamos** em conta
  de despesa com movimento → é **questão pro controller**, não pra SQL.

## Decisão de escopo (pronta para o financeiro)

O `ATFITEM` reabre a opção "por bem" — desde que esteja atualizado (rodada 4 confirma). Três caminhos:

| Opção | O que é | Depende de | Esforço |
|---|---|---|---|
| **A — Leitor contábil por classe** | espelha o que está lançado (`3.1.02.07.*` + base `1.3.02.*`), por classe e mês, conciliado c/ DRE | nada (dado pronto) | ~1 sem |
| **B — Leitor por bem (ATFITEM)** | lista bens, calcula deprec linear por bem, agrega por classe/garagem, total bate com a contabilidade | ATFITEM estar atualizado | ~2 sem |
| **C — Trazer a planilha pra dentro** | cadastro + cálculo oficial no sistema (substitui a planilha externa) | apetite do financeiro | ~3-4 sem |

**Recomendação:** começar pela **A** (entrega valor já, zero risco), e evoluir pra **B** se a rodada 4
mostrar `ATFITEM` vivo. **C** só se o financeiro quiser aposentar a planilha.

## Resultados da rodada 4 (2026-07-03) — ATFITEM está VIVO

- Empresa 4: **2.492 bens**, **1.066 ativos** (sem baixa). Aquisições até **24/06/2026**, `INICIODEPREC`
  até **01/07/2026** → cadastro **mantido em dia**.
- Taxas nos ativos: **20% (5 anos) = 796 bens / R$ 152,25M** (frota); 10% (10 anos) = 218 / R$ 2,05M;
  **0% (terrenos, não deprecia) = 31 / R$ 1,66M**; 30% = 6; 20,3% = 1. Total ativo = **R$ 156,6M**.
- ⚠️ **Reconciliação:** R$ 156,6M a 20% dariam ~R$ 2,5M/mês, mas o contabilizado é ~R$ 34–39k/mês →
  **a maior parte da frota já passou dos 5 anos e está 100% depreciada**; só bens recentes ainda depreciam.
  Um cálculo por bem (opção B) **precisa aplicar o teto** (para em 100%, usando `INICIODEPREC` + `TAXADEPREC`)
  e reconciliar com o total contabilizado — não é `AQUISVALOR × TAXA` cru.
- `ATFITEM.CONTA` é a conta contábil analítica por bem (ex.: `103012xxx`), permite agregar por classe e
  amarrar na contabilidade. Placa/chassi na `CARACTERISTICA` + ponte `ATFITEMCOMPRAVEIC` → dá pra ligar ao
  `FRT_CADVEICULOS` (garagem/centro de custo).

**Conclusão:** opção **B é viável** (cadastro vivo, com valor/taxa/datas por bem). Exploração encerrada.

## Construção — Opção A entregue (2026-07-03)

Escolha do financeiro: **Opção A (leitor por classe)**. Implementado no padrão dos adapters Globus:

- Query `GLOBUS_QUERIES.depreciacaoContabil` (CTBSALDO × CTBCONTA, famílias 3.1.02.07 + 1.3.02.01/02/50/51).
- Stage `integration.globus_ctbsaldo_stage` + adapter `globus-depreciacao.adapter.ts` (idempotente por hash).
- Canônico `finance.depreciacao_mensal` + ETL `depreciacao.etl.ts` (classifica grupo + classe, descarta rollups `.0000`).
- Migration `1700000040000-depreciacao.ts`.
- Shared `schemas/depreciacao.ts`; service `depreciacao.service.ts` (resumo + série + sincronizar); rotas `/api/depreciacao`.
- Front `(private)/depreciacao/page.tsx`: KPIs (despesa do mês, bruto, acumulada, líquido), despesa por classe, base por classe, evolução 24m. `module-status` = `parcial`.

Validado: `pnpm typecheck` + build backend + build frontend OK. **Pendente de execução pelo usuário:**
rodar a migration `1700000040000` e o `POST /api/depreciacao/sincronizar` (precisa do Oracle ligado) pra popular.

Próximo (opcional): opção **B** (por bem via ATFITEM) quando o financeiro quiser drill-down por veículo/garagem.

## Modelo de dados (rascunho — preencher após rodada 1)

- Schema `finance`, valores em **centavos (BIGINT)**, `empresa_id`, datas `timestamptz`.
- Rastreabilidade: `origem_sistema='globus'`, `origem_id_externo`, `metodo`.
- Estados explícitos (real / calculado / projetado / sem dado) na apresentação.
