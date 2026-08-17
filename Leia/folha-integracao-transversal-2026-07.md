# Integração transversal da Folha (FLP) — julho/2026

> **Resumo em uma frase:** vários módulos financeiros estavam **cegos para a folha
> de pagamento** — mostravam zero ou subestimavam onde, na verdade, está o maior
> peso financeiro da empresa. Esta leva conecta a folha real (FLP, que já
> sincronizávamos) a **4 módulos**: Folha, Tributos e Fluxo de Caixa.

Status: **implementado, no ar (Docker), validado por typecheck/build. Não commitado.**
Data: 2026-07-03.

---

## 0. O insight

A folha de pagamento gera os maiores números financeiros da Pioneira, mas grande
parte **não passa pelo Contas a Pagar (CP)**:

- **Salário líquido** (~R$ 12 mi/mês) → depósito direto na conta do funcionário.
- **Adiantamento** (~R$ 6,5 mi/mês) → depósito direto.
- **INSS/FGTS/IRRF** → recolhidos em guia (GPS/DARF/FGTS Digital), que *entram* no
  CP como `origem='guia'`.
- **Pensão alimentícia** → integrada pela folha no CP como `origem='folha'`.

Consequência: quem olhava só o CP via um retrato falso. A `/folha` só mostrava
pensão; o Tributos dizia "INSS = R$ 0"; o Fluxo de Caixa ignorava ~R$ 18 mi/mês
de saída. **A fonte correta é `finance.ficha_evento`** (a folha do RH, FLP, já
sincronizada pelo módulo Custo por Setor).

Princípio seguido em tudo: **estados explícitos** — `real` (o que a empresa
efetivamente desconta/deposita) vs `estimativa`/`projeção` (claramente marcada,
nunca cravada em silêncio).

---

## 1. Mapa de eventos da folha (fonte única)

`apps/FinancasBackend/src/shared/folha/eventos-pioneira.ts` — liga cada verba
(FLP_EVENTOS) a uma categoria, validado contra a folha real (maio/2026). Usado
pelo endpoint de encargos, pelo classificador do ETL e pelos Tributos/Fluxo.

| Categoria | Códigos (CODEVENTO) | Natureza |
|---|---|---|
| INSS retido (funcionário) | 171, 191, 169 | encargo |
| FGTS (depósito empresa) | 508, 505, 506, 507 | encargo |
| IRRF retido | 172, 170, 608 | encargo |
| Ticket alimentação | 900 | benefício |
| Cesta básica | 901 | benefício |
| Seguro de vida | 902 | benefício |
| Adiantamento (40%) | 607 | desconto |
| Consignados / empréstimos | 764, 766, 767, 768, 769, 824, 825, 826, 827 | desconto |
| Contribuição sindical | 195 | desconto |
| Pensão alimentícia | 163, 189, 161 | desconto |
| Plano de saúde / convênio | 284, 283, 249, 905 | desconto |

Totalizadores autoritativos (TIPOEVEN='B'): **318** = total proventos, **319** =
total descontos, **500** = líquido, **315** = base INSS.

**Atenção técnica:** o ETL da folha normaliza `TIPOEVEN` `A`/`C` → `P`. Por isso
os agregados são feitos **por CODEVENTO** (não por `SUM(tipo P/D)`), o que evita
inflar proventos com bases (ex.: 700 "SALARIO BASE" = R$ 18 mi é base, não
provento).

---

## 2. Folha — "Encargos & Benefícios" (`/folha`)

**Antes:** "Folha (CPG)" — só pensão alimentícia (o único `origem='folha'` no CP).
O nome prometia INSS/FGTS/IRRF/VT/VA que nunca apareciam.

**Agora:** tela real de encargos e benefícios da folha (FLP).

- **Endpoint:** `GET /api/folha/encargos?competencia=&tipoFolha=`
- **Fonte:** `finance.ficha_evento` + `finance.eventos_folha`, agregado por
  CODEVENTO; totais de 318/319.
- **Categorias:** encargos (INSS/FGTS/IRRF), benefícios (ticket/cesta/seguro),
  descontos (adiantamento/consignado/sindicato/pensão/plano de saúde) e o
  catch-all **"Outros descontos"** (todos os `TIPOEVEN='D'` não categorizados),
  para a soma fechar com o total (319). Nada fica escondido.
- **Drill-down por verba:** `GET /api/folha/encargos/evento?competencia=&codEvento=&tipoFolha=`
  → lista os funcionários que compõem a verba (nome, matrícula, função, setor,
  valor individual). **Dado sensível (LGPD)** — dialog com aviso + `useAuditView`
  (recurso `folha-encargos-evento`, ação `visualizou`).
- **Pensão** é destacada como o elo que vira `origem='folha'` no CP (bloco de
  repasse mais abaixo na tela).

**Descobertas de dados:**
- **VT (vale-transporte) não existe** na folha — empresa de ônibus, funcionário
  tem passe livre. A promessa antiga de VT nunca foi real.
- **Plano de saúde/convênio** existe no catálogo (eventos 249/283/284/905) mas
  veio **zerado** em maio; a categoria aparece sozinha quando tiver valor.

---

## 3. Custo por Setor (`/folha-detalhe`)

Tela que já existia (folha por setor/função). Ganhou **drill-down de 2 níveis**,
reaproveitando endpoints que já existiam:

- **Setor/função → funcionários:** clicar num setor ("Ver funcionários do setor")
  ou numa função abre a lista de funcionários. `GET /api/folha-detalhe/funcionarios`
  (paginado, com busca). Adicionado filtro opcional **`descFuncao`** para o clique
  na função já vir filtrado.
- **Funcionário → contracheque:** `GET /api/folha-detalhe/contra-cheque/:codFunc`
  → holerite completo (proventos/descontos verba a verba + bases INSS/FGTS/IRRF +
  líquido).
- **LGPD:** ambos os dialogs auditados (`folha-detalhe-funcionarios`,
  `folha-detalhe-contracheque`).

Correção de classificação: `classificarGrupoEvento` (ETL) ganhou override por
CODEVENTO (fonte: mapa da seção 1) + fix da regex de sindicato (`SIND\b` não
casava "SINDICATO"). Só reflete na tela após um **re-sync da folha**.

---

## 4. Tributos (`/tributos`)

**Antes:** olhava só o CP → dizia "INSS retido = R$ 0" (verdade só para NF de
serviço), passando a impressão falsa de que a empresa não tem INSS.

**Agora:** painel **"Tributos da folha"** com o peso tributário real.

- **Endpoint:** `GET /api/tributos/folha?competencia=&tipoFolha=`
- **Valores CERTOS:** INSS retido (funcionário), FGTS, IRRF retido, base INSS.
- **INSS patronal = ESTIMATIVA marcada:** base × **28,8%** (20% CPP + 3% RAT
  transporte + 5,8% terceiros). **Não cravado** — o transporte pode ter
  **desoneração da folha (CPRB)**, que troca a base para a receita bruta.
  Confirmar regime com o financeiro.
- Texto da transparência corrigido: o "INSS = zero" agora diz que é **só de NF**
  e aponta para a folha.
- **Página reorganizada** (era um paredão): duas camadas —
  - **Aberto (dado real):** Tributos da folha → Conferência de retenções → Guias
    do mês.
  - **Referência e detalhes (recolhível):** Transparência das fontes, Calendário
    de obrigações, Roadmap & pendências.
- Seletor de competência abre no **mês anterior** (o mês corrente raramente tem
  folha fechada) e, quando vazio, mostra **chips** das competências disponíveis.

---

## 5. Fluxo de Caixa (`/fluxo-caixa`) — tentativa REVERTIDA

**Hipótese (errada):** o fluxo somava só o CP como saída, e o salário/adiantamento
não passariam pelo CP (depósito direto) → a projeção estaria cega pra ~R$ 18 mi/mês.
Cheguei a adicionar a folha (FLP) como saída projetada.

**Verificação nos dados reais (Postgres) provou a hipótese ERRADA e a mudança foi
REVERTIDA:** a folha **já está no Contas a Pagar** como títulos manuais lançados
pelo financeiro — fornecedores `SALARIO E ORDENADOS` (~R$ 5,85 mi), `ADIANTAMENTO
DE SALÁRIO QUINZENAL` (~R$ 3,27 mi), `CONTRIBUICAO AO FGTS` (~R$ 2,17 mi), `FERIAS`,
`RESCISAO TRABALHISTA`. Como o `projecao()` soma o CP (status pendente/aprovado por
vencimento), **a folha já entra** — adicioná-la de novo **duplicava** ~R$ 9 mi/mês.

Estado atual: **fluxo-caixa voltou ao original** (schema, service e UI). A folha
NÃO é somada à parte.

**Ressalva real (não resolvida):** o financeiro lança a folha no CP com **atraso**
(o mês corrente costuma ter só parte — ex.: jul/2026 tinha férias pendente mas não
o salário principal). Então a projeção do **próximo pagamento** pode ficar
incompleta até o título ser lançado. Melhoria futura possível: detectar meses do
horizonte SEM títulos de folha no CP e só então projetar (evitando o double-count).
Requer heurística de detecção — não feito.

---

## 6. Nomes do sidebar

Encurtados (o grupo "Folha & Tributos" já dá o contexto):

- `/folha` → **"Encargos & Benefícios"** (era "Folha — Encargos e Benefícios")
- `/folha-detalhe` → **"Custo por Setor"** (era "Folha — por Setor (RH)")

Ajustado em `navigation.ts`, `module-status.ts`, títulos das páginas e links
cruzados.

---

## 6b. BUG dupla contagem da competência da folha — ✅ CORRIGIDO (2026-07-03)

**Corrigido:** `rangeCompetenciaFolha`/`rangeCompetencia` nos 3 services agora usam
o **mês simples** `[YYYY-MM-01, próximo-mês-01)`. Validado no banco: competência
`2026-05` passou de **R$ 29,26 mi** (dobrado) para **R$ 14,52 mi** (mês único,
3.458 func) de proventos. Descrição original abaixo.

---


A Pioneira grava a folha no **último dia do próprio mês** (abril → `2026-04-30`,
maio → `2026-05-31`). Mas `rangeCompetenciaFolha` (em `folha.service`,
`folha-detalhe.service` e `tributos.service`) usa janela larga
`[YYYY-(MM-1)-últimoDia, YYYY-(MM+1)-01)` — herança de uma convenção Praxio
alternativa ("folha de maio como 30/04 OU 31/05").

Para a Pioneira essa janela **pega dois meses**: ver competência `2026-05` soma o
`2026-04-30` (abril) + `2026-05-31` (maio) → **dobra** o valor. Confirmado no banco:
folha mensal real ≈ **R$ 14,5 mi de proventos/mês**, não os R$ 29 mi que apareciam
quando a janela apanhava dois meses.

- **Afeta:** Encargos & Benefícios, Custo por Setor, Tributos da folha — quando a
  competência selecionada apanha duas datas. (Ao ver "junho", a janela
  `[31/05, 01/07)` pega só `31/05` → valor único; por isso as telas de junho
  batiam. Ao ver "maio", dobra.)
- **NÃO afeta o fluxo de caixa** (usa `GROUP BY mês` + `LIMIT 1` = um mês só) — e
  de qualquer forma a folha do fluxo foi revertida (seção 5).
- **Correção proposta (não aplicada):** trocar a janela para o mês simples
  `[YYYY-MM-01, próximo-mês-01)`, que pega só `YYYY-MM-últimoDia`. Validar antes
  se NENHUMA folha da Pioneira está gravada como fim do mês anterior.

## 7. Pendências com o financeiro (não destraváveis só com o que temos)

- **INSS patronal:** confirmar regime (CPP × desoneração/CPRB do transporte) — a
  estimativa de 28,8% precisa de validação.
- **Datas de pagamento da folha:** confirmar dia do adiantamento e do salário
  (hoje: dia 20 e 5º dia útil, assumidos).
- **Tributos (continua dependendo de fonte externa / Q1-Q3):** apuração própria
  de PIS/COFINS, geração de DARF/GPS, ISS por município, cruzamento com SPED.

---

## 8. Arquivos de diagnóstico (SQL)

- `Leia/sql-diagnostico-folha.sql` — mapa de eventos da folha + tipos de folha
  (Q1/Q2/Q3).
- `Leia/sql-completude-encargos.sql` — descontos fora das categorias + busca por
  plano de saúde (Q4/Q5).

---

## 9. Arquivos tocados (resumo)

**Backend**
- `src/shared/folha/eventos-pioneira.ts` (novo) — mapa de eventos/códigos.
- `src/etl/folha-flp.etl.ts` — override do classificador + fix sindicato.
- `src/modules/folha/{folha.service.ts, folha.routes.ts}` — encargos + drill de evento.
- `src/modules/folha-detalhe/{folha-detalhe.service.ts}` — filtro `descFuncao`.
- `src/modules/tributos/{tributos.service.ts, tributos.routes.ts}` — tributos da folha.
- `src/modules/fluxo-caixa/fluxo-caixa.service.ts` — folha como saída projetada.

**Shared**
- `schemas/folha.ts`, `schemas/folha-detalhe.ts`, `schemas/tributos.ts`,
  `schemas/fluxo-caixa.ts` — schemas TypeBox dos novos endpoints/campos.

**Frontend**
- `app/(private)/folha/page.tsx` — tela Encargos & Benefícios + drill de verba.
- `app/(private)/folha-detalhe/page.tsx` — dialogs funcionários + contracheque.
- `app/(private)/tributos/page.tsx` — painel folha + reorganização (colapsáveis).
- `app/(private)/fluxo-caixa/page.tsx` + `_components/GraficoProjecao.tsx` — folha na projeção.
- `components/layout/navigation.ts`, `lib/module-status.ts` — nomes/roadmap.
