# Tributos · Auditoria Inicial (Descoberta — SFN-46)

> **Status:** rascunho da descoberta (28/05/2026). Saída desta sprint
> [Tributos · Descoberta] no Plane. Documento vivo — completar quando as
> 3 respostas Q1-Q3 do financeiro (SFN-45) chegarem e quando o user puder
> rodar as queries no Globus listadas em §6.

## TL;DR

- **Head start enorme:** já existe módulo `retencoes/` no backend, página
  `/contas-pagar/divergencias` no front e heurística Lucro Real implementada
  pra PIS / COFINS / CSLL / IRRF.
- **Dado é magro:** dos 5.953 títulos ativos, **só 43 NFS** têm retenção
  registrada. INSS e ISS vêm **zerados em 100% dos casos**. R$ 19,5 mil
  retidos em R$ 279 M brutos.
- **Recomendação Fase 1 (sem depender de Q1-Q3):** completar a funcionalidade
  3 (Retenções na fonte) — INSS e ISS já dão pra atacar com tabelas de
  alíquotas + dado de município do fornecedor. As outras 5 funcionalidades
  dependem da resposta do escopo (Q1-Q3).

---

## 1. Head start — o que já temos

### 1.1 Módulo `retencoes/` no backend

`apps/FinancasBackend/src/modules/retencoes/`:

- **`retencoes.service.ts`** — heurística Lucro Real implementada:
  - Tipos de doc sujeitos: `NF`, `NFE`, `NFV`, `NFS`.
  - Origens excluídas: `folha` (eSocial calcula) e `guia` (é a própria retenção).
  - Alíquotas em `packages/shared/src/schemas/retencoes.ts → ALIQUOTAS_PADRAO`.
  - 3 endpoints: alíquotas em uso, conferência por título, listar divergências.
- **`retencoes.routes.ts`** — Fastify wiring.
- **Schema compartilhado:** `RetencaoComparacao` (esperado × retido por tipo + divergente?).

### 1.2 Alíquotas padrão (`ALIQUOTAS_PADRAO`)

| Tributo | % | Observação |
|---|---:|---|
| PIS | 0,65% | Lucro Real |
| COFINS | 3,00% | Lucro Real |
| CSLL | 1,00% | Lucro Real |
| IRRF | 1,50% | Transporte/serviços em geral (consultoria=4,8% / locação=1,5%) |
| INSS | 11,00% | Só quando aplicável (locação máq., mão de obra) — **não calculado automaticamente** |
| ISS | 2-5% | Depende do município (Brasília 2-5%) — **não calculado automaticamente** |
| Mínimo IRRF | R$ 1.500 | Abaixo disso, isento (Art. 67 Lei 9.430/96) |

### 1.3 Frontend

- **`/contas-pagar/divergencias`** — página dedicada listando divergências.
- Atalho do CFO em `/contas-pagar` (página principal).

### 1.4 Dado sincronizado em `finance.contas_pagar`

Já são gravadas 6 colunas de retenção: `vlr_inss_cents`, `vlr_irrf_cents`,
`vlr_pis_cents`, `vlr_cofins_cents`, `vlr_csll_cents`, `vlr_iss_cents`. Origem
no Globus: `CPGDOCTO.VLRINSSCPG`, `VLRIRRFCPG`, `VLRPISCPG`, `VLRCOFINSCPG`,
`VLRCSLCPG`, `VLRISSCPG`.

### 1.5 Cadastro de fornecedor (`finance.fornecedores`)

Tem `cnpjCpf`, `razaoSocial`, `nomeFantasia` — pré-requisito de DARF/GPS.
**Não tem** regime tributário (Simples / Lucro Real / Presumido / MEI) nem
município. Precisa investigar fonte no Globus (ver §6).

---

## 2. Realidade dos dados (medida em 28/05/2026)

### 2.1 Cobertura de retenções por tipo de documento

| Origem | Tipo doc | Total | IRRF | PIS | COFINS | CSLL | INSS | ISS |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| nf | **NFS** | 43 | 31 | 40 | 40 | 43 | **0** | **0** |
| nf | NF (mercadoria) | 2.701 | 0 | 0 | 0 | 0 | 0 | 0 |
| nf | BOL | 923 | 0 | 0 | 0 | 0 | 0 | 0 |
| manual | REC | 766 | 0 | 2 | 2 | 2 | 0 | 0 |
| folha | REC | 466 | 0 | 0 | 0 | 0 | 0 | 0 |
| nf | NFV | 244 | 0 | 1 | 1 | 1 | 0 | 0 |
| outros 11 tipos | — | 810 | 0 | 0 | 0 | 0 | 0 | 0 |

### 2.2 Volume financeiro

```
Bruto    : R$ 279.073.415,64
IRRF     : R$       4.164,90    (0,001%)
PIS      : R$       2.071,00
COFINS   : R$       9.558,43
CSLL     : R$       3.759,18
INSS     : R$           0,00    ← suspeito
ISS      : R$           0,00    ← suspeito
─────────
Pagos com alguma retenção: 42 de 4.485 (0,94%)
```

### 2.3 Leitura crua

- **NF de mercadoria (2.701 títulos)** sem retenção é **correto** — produto não tem retenção na fonte.
- **BOL (923) sem retenção** é correto (banco/emissor já reteve antes de chegar).
- **NFS (43) com PIS/COFINS/CSLL/IRRF 100%** é coerente com Lucro Real.
- **INSS = 0 em tudo** é o ponto crítico:
  - Pioneira não contrata serviços que exigem retenção INSS (locação máq., mão de obra, segurança)? Improvável.
  - OU o campo Globus não está sendo populado / lemos a coluna errada.
- **ISS = 0 em tudo** — duas hipóteses:
  - Pioneira (DF) não retém ISS porque o prestador é da mesma cidade (regra dependendo do município).
  - Ou Globus tem em outra coluna.

→ Precisa validação com o financeiro **e** com a tabela `CPGDOCTO` no Globus.

---

## 3. Status por funcionalidade do roadmap

| # | Funcionalidade | Status | Gap principal |
|---|---|:--:|---|
| 1 | Apuração mensal de PIS/COFINS (da Pioneira) | ⚪ 0% | Apuração ≠ retenção. Precisa **receita do mês** + regime tributário. Depende Q1/Q2. |
| 2 | ISS por município | ⚪ 0% | Precisa **município do fornecedor** + tabela de alíquotas por município. |
| 3 | **Retenções na fonte (INSS, IRRF, CSLL)** | 🟡 **~60%** | Já implementado p/ PIS/COFINS/CSLL/IRRF. Faltam: INSS calculado + ISS calculado + investigar dado zerado. |
| 4 | Geração de DARF/GPS | ⚪ 0% | Agrupar retenções por período + código de receita + gerar PDF. Temos os dados base. |
| 5 | Calendário tributário com alertas | ⚪ 0% | Calendário de vencimentos + alertas. Pode ser front-heavy. |
| 6 | Cruzamento com SPED Fiscal | ⚪ 0% | Parser SPED (texto delimitado) + reconciliação. |

---

## 4. Recomendação de Fase 1 (paralelizável com Q1-Q3)

Sem depender da reunião do financeiro, **dá pra entregar valor já** na
funcionalidade 3 — completar o módulo `retencoes/`:

1. **Investigar o INSS=0 absoluto** (rodar query no Globus em §6 — é dado ou bug).
2. **Adicionar cálculo INSS** ao service (alíquota 11% sobre base, com flag por tipo de serviço — talvez seja sempre opt-in via CFO).
3. **Adicionar cálculo ISS** ao service (precisa município do fornecedor — ver §6).
4. **Polir a página de divergências** com filtros (período / fornecedor / tributo).

As outras 5 funcionalidades **precisam de definição de escopo** (Q1-Q3):
- Apuração própria (#1) só faz sentido se Pioneira apura internamente.
- DARF/GPS (#4) só se a saída é "Pioneira paga", não "contador paga".
- SPED (#6) só se vai cruzar com sistema externo.

---

## 5. Perguntas remanescentes pro financeiro (a colocar na reunião Q1-Q3 / SFN-45)

Além das 3 originais (quem apura / sistema externo / prioridade), surgiram
estas:

- **Por que INSS está zerado em tudo?** Não contratam serviços com retenção INSS, ou o Globus não está populando?
- **Política de ISS:** retêm ISS de prestadores fora de Brasília? Ou só dentro?
- **Pioneira está em Lucro Real** (a heurística do código assume). Confirmar.
- **Volume de NF de serviço** parece baixo (43 NFS em 5.953 títulos = 0,7%). Falta sincronizar algo, ou a empresa realmente compra muito mais mercadoria que serviço?

---

## 9. Atualização 29/05/2026 — §6 respondido + Fase 1 (Simples-aware) entregue

As queries da §6 foram rodadas (scripts `explorar-globus-tributos.ts`). Resultados:

- **A) `CTB_ECF_*` existe e é robusto** — `CTB_ECF_APURACAO` (52k), `CTB_ECF_RETENCAO_FONTE`, `CTB_ECF_APUR_IRPJ_CSLL`. Base das funcionalidades #1 (apuração própria) e #6 (SPED). **Continuam dependendo de Q1-Q3.**
- **B) Regime tributário do fornecedor: `BGM_FORNECEDOR.FORN_OPT_SIMPLES_NACIONAL`** ('S'/'N'). No cadastro inteiro **só 2 fornecedores são Simples** — o impacto é pequeno, mas torna a conferência correta. Regime da própria Pioneira: `CTR_CADEMP.EMP_OPT_SIMPLES_NACIONAL` (não é Simples — porte muito acima do teto; heurística Lucro Real segue válida).
- **C) Município do fornecedor (pra ISS): `BGM_FORNECEDOR`** tem `CODIGOUF`, `CIDADEFORN`, `CODMUNIC`, `TPINSCRICAOFORN` (CNPJ/CPF/CEI), `INSCMUNICIPALFORN`.
- **D) INSS e ISS zerados = DADO, não bug.** ✅ Confirmado: mesmo numa NFS de R$ 18.770 com IRRF/PIS/COFINS/CSLL preenchidos, `VLRINSSCPG`/`VLRISSCPG` vêm 0. **Calcular INSS/ISS esperado automaticamente geraria falso divergente** — por isso seguem informativos.
- **E) Universo de NF de serviço é pequeno mesmo** — NFS=104, NF mercadoria=6.076 (sem retenção, correto). Pioneira compra muito mais mercadoria/combustível que serviço.

**Entregue (Fase 1, sem depender de Q1-Q3):** conferência de retenções **ciente do Simples Nacional**.
- Sync passa a trazer atributos fiscais do fornecedor (`opt_simples_nacional`, `tipo_inscricao`, `uf`, `cidade`, `cod_municipio`) — query `contasAPagar` + ETL `garantirFornecedor`. Migration `1700000031000`.
- `retencoes.service` marca fornecedor Simples como **não aplicável** (esperado=0, sem falso divergente) e a conferência expõe `fornecedorSimplesNacional/Uf/Municipio/TipoInscricao`.
- Front `/contas-pagar/divergencias` mostra UF/município e selo "Simples Nacional".
- **Requer re-sync** pra popular os atributos fiscais (fornecedores antigos vêm com null).

**Entregue tambem (29/05):**
- **Página `/tributos` real** (era placeholder) — landing do módulo: card da conferência de retenções (resumo ao vivo + link), nota INSS/ISS informativos, calendário, roadmap e as 3 perguntas.
- **Calendário tributário (referência)** — `modules/tributos` + `/api/tributos/calendario`: obrigações federais padrão (marcadas "referência — confirmar com contabilidade") + cruzamento com as guias reais (origem='guia') vencendo no mês. Sem fabricar política fiscal.
- **Pauta da reunião** — `Leia/tributos-pauta-reuniao-financeiro.md` (Q1-Q3 + A-D + matriz de decisão).

Pendente de Q1-Q3 (SFN-45), **NÃO construído de propósito** (evitar fabricar lógica fiscal): #1 apuração própria PIS/COFINS, #2 ISS por município (temos município, falta tabela de alíquotas + política de retenção), #4 DARF/GPS, #6 SPED, e o cálculo de INSS/ISS.

## 10. "Está no Globus?" — exploração das 4 bloqueadas (29/05)

Provocação do user: se o dado existir no Globus, a gente lê em vez de inventar.
Explorado (`explorar-globus-tributos-apuracao.ts` + checagens de população). **Veredito: as estruturas existem, mas a Pioneira quase não popula** — mesmo padrão do CODSETOR.

| Feature | Fonte candidata | Populado p/ empresa 4? | Conclusão |
|---|---|---|---|
| Regime tributário | `CTB_ECF_APUR_IRPJ_CSLL.FORMA_TRIB` | ✅ **'R' = Lucro Real** (exerc. 2024) | **Confirma a heurística + responde parte do Q1** |
| Apuração mensal PIS/COFINS | `CTB_ECF_APURACAO` (52k) | só **anual e defasada** (último = 2024) | ECF ≠ apuração mensal. Não serve p/ mensal. |
| DARF/GPS (geral) | colunas `*_GUIA` no CPGDOCTO | **~vazio** (5/803 cód. receita, 0 imposto; só período 100%) | Inutilizável, igual CODSETOR. |
| GPS/DARF **da folha** | `FLP_GPS_INTEGRACPG` (360), `FLP_DARF` (33) | ✅ **populado** | Slice real, porém estreito (só INSS/IRRF da folha). |
| ISS | `ESFISS` (10k), `ALIQISSNF`, `CGSTIPOSDESERVICOS` | a confirmar; ISS **retido=0** | Existe livro de ISS, mas retenção é zero; municipal. |
| SPED | `CTB_ECF_*` (ECF) | anual | Parte do SPED existe, mas anual/defasado. |

**Interpretação:** a apuração mensal PIS/COFINS **não está no Globus de forma utilizável** → é feita fora (sistema externo ou contador). Isso **responde antecipadamente o Q2** e reforça que #1/#4/#6 dependem do financeiro — não por teimosia, mas por **ausência de dado**.

**Ganhos concretos da exploração:** (a) regime **Lucro Real confirmado** pelo próprio Globus; (b) achado um slice real e estreito: **guias de imposto da folha** (`FLP_GPS_INTEGRACPG`/`FLP_DARF`, INSS/IRRF) — buildable lendo o Globus, liga no módulo Folha.

---

## 6. Queries pendentes pro user rodar no Globus

> **Resolvidas em 29/05** — ver §9. Mantidas aqui como referência das queries.


```sql
-- A) Tabelas CTB_ECF_* listadas no roadmap (fonte para SPED/apuração)
SELECT TABLE_NAME FROM ALL_TABLES
WHERE OWNER='GLOBUS' AND TABLE_NAME LIKE 'CTB_ECF%'
ORDER BY TABLE_NAME;

-- B) Cadastro de regime tributário — onde mora?
SELECT TABLE_NAME, COLUMN_NAME FROM ALL_TAB_COLUMNS
WHERE OWNER='GLOBUS'
  AND (COLUMN_NAME LIKE '%REGIME%' OR COLUMN_NAME LIKE '%LUCRO%'
    OR COLUMN_NAME LIKE '%SIMPLES%' OR COLUMN_NAME LIKE '%PRESUMID%')
ORDER BY TABLE_NAME, COLUMN_NAME;

-- C) Município do fornecedor (pra ISS) — onde mora?
SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS
WHERE OWNER='GLOBUS' AND TABLE_NAME='BGM_FORNECEDOR'
  AND (COLUMN_NAME LIKE '%MUNIC%' OR COLUMN_NAME LIKE '%CIDADE%'
    OR COLUMN_NAME LIKE '%UF%' OR COLUMN_NAME LIKE '%ENDE%')
ORDER BY COLUMN_ID;

-- D) INSS zerado é dado ou bug? Conferir no Globus uma amostra de NF
SELECT CODDOCTOCPG, CODTPDOC, VLRINSSCPG, VLRIRRFCPG, VLRPISCPG, VLRCOFINSCPG, VLRCSLCPG, VLRISSCPG
FROM   GLOBUS.CPGDOCTO
WHERE  CODIGOEMPRESA = 4
  AND  CODTPDOC = 'NFS'
  AND  STATUSDOCTOCPG IN ('A','F','C')
  AND  VENCIMENTOCPG >= TO_DATE('01/05/2026','DD/MM/YYYY')
FETCH FIRST 30 ROWS ONLY;
```

---

## 7. Correção da base de cálculo (entregue 28/05) 🐛 → ✅

Validando a heurística contra os 43 NFS reais, **TODAS marcavam divergente** —
e a proporção do erro era idêntica em todos os tributos (~6,55% off). Achado:

**A base de cálculo estava errada.** `valor_bruto_cents` no nosso banco vem do
`CPGDOCTO.VLR_ORIGINAL` do Globus, que é o **valor LÍQUIDO a pagar** (depois
das retenções). A heurística calculava `aliquota × líquido`, mas a base fiscal
correta é `líquido + total das retenções = valor da NF antes das retenções`.

Conferência no título 995466 (BGMRODOTEC, R$ 26.310,84 líquido + R$ 1.724,15 retenções = base R$ 28.034,99):

| Tributo | Retido (Globus) | Esperado (base errada) | Esperado (base correta) |
|---|---:|---:|---:|
| PIS 0,65% | 182,23 | 171,02 ❌ | **182,23 ✅** |
| COFINS 3% | 841,05 | 789,33 ❌ | **841,05 ✅** |
| CSLL 1% | 280,35 | 263,11 ❌ | **280,35 ✅** |
| IRRF 1,5% | 420,52 | 394,66 ❌ | **420,52 ✅** |

**Cobertura após o fix** (rodado no DB):

| Tributo | Antes | Depois |
|---|---:|---:|
| PIS ok | 0 / 43 | **40 / 43** |
| COFINS ok | 0 / 43 | **40 / 43** |
| CSLL ok | 0 / 43 | **43 / 43** ✅ |
| IRRF ok (elegíveis) | 0 / 13 | **13 / 13** ✅ |

Os 3 remanescentes têm CSLL ok mas PIS/COFINS/IRRF = 0 — **divergências
REAIS, provavelmente fornecedor no Simples Nacional** (não retém PIS/COFINS/IRRF
mas pode reter CSLL em alguns casos). Vão aparecer corretamente como
divergência na tela depois do deploy.

**Mudança no código:** `retencoes.service.ts` agora computa `baseCalculo =
valor_bruto + total_retencoes` e usa essa base nas alíquotas e na elegibilidade
do IRRF. Um alerta na conferência mostra a base usada quando ela difere do
"bruto" exibido (= "Base de cálculo R$ 28.034,99 = líquido R$ 26.310,84 +
retenções R$ 1.724,15").

> **Deploy:** o front (`/contas-pagar/divergencias`) já está pronto, só precisa
> recarregar o backend (dev 3334 hot-reload pega sozinho; Docker rebuild).
> Os títulos antigos no banco continuam com o `valor_bruto_cents = líquido` —
> nenhuma mudança de dado, só de cálculo.

---

## 8. Referências

- Roadmap: `Leia/06_ROADMAP.md` (Tributos é Fase 2).
- Código: `apps/FinancasBackend/src/modules/retencoes/`, `packages/shared/src/schemas/retencoes.ts`, `apps/FinancasFrontend/src/app/(private)/contas-pagar/divergencias/page.tsx`.
- Tickets no Plane:
  - **SFN-45** — Responder Q1-Q3 com financeiro (high, target 02/06) — destrava escopo.
  - **SFN-46** — Esta auditoria (medium, target 04/06) — em andamento.

---

## Anexo — fluxo do cálculo atual (referência)

```
ContaPagar (NF, NFE, NFV, NFS) — fora origem folha/guia
        │
        ▼
ehAplicavel(cp)?  ──► não: marca todos retencoes como "não aplicável" + motivo
        │ sim
        ▼
para cada tributo (PIS, COFINS, CSLL):
   esperadoCents = valorBruto * aliquota / 100
   divergente   = |retido - esperado| > 1 centavo

IRRF: mesmo, MAS só se valorBruto >= R$ 1.500

INSS / ISS: aplicavel = false (não calcula esperado, só mostra retido + observação)
        │
        ▼
ConferenciaRetencao { retencoes[], divergenciaTotalCents, temDivergencia, alertas[] }
```

---

## 11. Fechamento do módulo (14/07/2026) — "todas as respostas = não"

As perguntas ao financeiro/contabilidade (SFN-45: quem apura PIS/COFINS, uso de
sistema externo, prioridade de tributos) **não foram respondidas**. Orientação do
user: **considerar todas as respostas como "não"** e finalizar o módulo.

**Efeito no escopo** — as 5 features que estavam ⏳ *aguardando* passam a **fora de
escopo (feito fora do sistema)**, não pendência de desenvolvimento:

| Feature | Decisão | Por quê |
|---|---|---|
| #1 Apuração própria PIS/COFINS | Fora de escopo | Feita pelo contador; ECF do Globus é anual/defasada (§10). |
| #2 ISS por município | Fora de escopo | Municipal, sem política de retenção definida; ISS retido = 0 real (§9-D). |
| #4 Geração de DARF/GPS | Fora de escopo | Recolhimento feito fora; campos de código de receita ~vazios (§10). |
| #6 Cruzamento SPED | Fora de escopo | Sem fonte externa a integrar. |
| INSS/ISS calculados sobre NF | Fora de escopo | Globus registra zero de verdade — calcular geraria falso divergente (§9-D). |

Decisão **reversível**: se a política mudar, o item correspondente é reaberto. O que
depende do Globus continua refletindo o Globus automaticamente.

**O que entregou o fechamento** (correções internas, sem depender do financeiro):

- **Tributos da folha por tipo de folha** — seletor de `TIPOFOLHA` (Mensal, 13º,
  Rescisão etc.). Antes o painel só somava a Mensal e **subestimava a carga em
  nov/dez** (o 13º sai em folha à parte; tipos 5 e 35 são o mesmo 13º — não somar).
  O painel mostra **uma folha por vez**, explícito, sem soma silenciosa.
- **Semântica do total** — separado **custo do empregador** (FGTS + INSS patronal)
  de **retido e repassado** (INSS + IRRF do funcionário).
- **Base da conferência** — texto corrigido para **"valor bruto da NF"** (o código já
  usava bruto puro pós-migration 32000; a cópia ainda dizia "líquido + retenções").
- **Reconciliação folha↔guias** — nota explicando por que a "carga da folha" (~R$ 6 mi)
  não bate com as guias do calendário (a folha recolhe por GPS/FGTS Digital/DARF fora
  do borderô, não entra como `origem='guia'` no CP).
- **Timezone** — `calendario()` deixou de usar `new Date()` cru (regra #2).

Status do módulo: **`parcial` → `pronto` (Em produção)**.
