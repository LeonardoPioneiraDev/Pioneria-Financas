# DRE — mapeamento

> Módulo **planejado** (Fase 4). Página é placeholder (`(private)/dre/page.tsx`).
> Fonte de verdade do status: `apps/FinancasFrontend/src/lib/module-status.ts`.

## Onde estamos

Diferente de Orçamento, aqui o **dado de base já existe e já foi lido**: o razão contábil
(`CTBSALDO` / `CTBLANCA` / `CTBITLNC`) está populado — usamos ele no módulo Depreciação. Uma DRE é
agrupar as contas de **resultado** (classe 3 = despesa, classe 4 = receita) por linha e somar. Logo
a **DRE contábil é calculável hoje**.

Estrutura de DRE do Globus (mapeada em 18/05, dados a confirmar):
- **`CTBCDDRE`** (3 cols): `NUMERO` (PK), `DESCRICAO`, `NROPLANO` — define um relatório DRE.
- **`CTBITDRE`** (14 cols): `(NUMERO, ITEM)`, `OPERACAO`, `SINAL`, `EXIBE_LINHA`, **`CONTA_INICIAL` /
  `CONTA_FINAL`** (faixa de contas por linha), `TEXTO`. `VALOR/ACUMULADOR` geralmente NULL (é
  **template**, não valores — os valores vêm do razão).

Primeiro passo = rodar [`sql-exploracao/2026-07-03-dre-rodada-1.sql`](../sql-exploracao/2026-07-03-dre-rodada-1.sql).

## A pergunta que decide o caminho (não o "se", mas o "como")

**O Globus tem uma estrutura de DRE definida (`CTBITDRE` populado) pra herdarmos?**

| Cenário | O que fazemos | Esforço |
|---|---|---|
| **A — Globus tem a DRE montada** (`CTBITDRE` com as linhas por faixa de conta) | Herdamos a estrutura oficial: cada linha soma sua faixa de contas do `CTBSALDO`. Bate com o que a contadora usa. | menor |
| **B — estrutura vazia** (como `CPGORCESTRUTURA` estava) | Montamos a DRE a partir da **hierarquia do plano de contas** (classificador 3.x/4.x). Funciona igual, só definimos as linhas nós. | +alguns dias |

Nos **dois casos o módulo sai** — a diferença é só de onde vem o desenho das linhas. Por isso a
resposta pro financeiro é "**sim, pode ser feito**", não "depende".

## Sinergia com o que já existe

- O módulo Depreciação **já sincroniza `CTBSALDO`** (subconjunto: imobilizado/depreciação). A DRE
  estende o **mesmo adapter/stage** pras contas de resultado (classe 3 + 4). Reuso alto.
- O **realizado por centro de custo** (pro drill-down por garagem) já está no `finance.contas_pagar`.

## Perguntas ao financeiro (com dado)

1. **A estrutura de DRE do Globus atende ou precisa refazer?** → A2/A3 mostram a DRE que o Globus já
   tem; o financeiro confirma se é a que usam.
2. **Quem é o público?** (diretoria / conselho / contadora) → define nível de detalhe e export (Excel/PDF).
3. **Precisa gerencial ≠ contábil?** → a contábil sai do razão; a gerencial é uma reorganização das
   mesmas contas (ex.: agrupar por natureza operacional, separar receita técnica de repasse). É
   decisão de escopo, não de dado.

## Resultados da rodada 1

> _(colar aqui: estrutura CTBCDDRE/CTBITDRE, populações, amostra das linhas, mini-DRE do B2)_

### A — estrutura de DRE do Globus (existe/definida?)
Rodada 1 (2026-07-03): existe **1 relatório de DRE** no Globus — `CTBCDDRE`: `NUMERO=1`,
`DESCRICAO="DEMONSTRAÇÃO DE RESULTADO DO EXERCÍCIO"`, `NROPLANO=1` — mas com **só 6 linhas**
(`CTBITDRE` = 6 registros). Uma DRE completa tem 15–30 linhas, então isso é uma estrutura
**esquelética** (provável que a DRE de verdade seja montada por fora, ou seja um resumo bem alto).
Colunas confirmadas do `CTBITDRE`: `NUMERO, ITEM, OPERACAO, TEXTO, ALINHAMENTO, SINAL,
CONTA_INICIAL(30), CONTA_FINAL(30), VALOR, ACUMULADOR, ACM_AUXILIAR, PERCENTUAL, EXIBE_LINHA,
SINAL_EXIBICAO`. **Ver o conteúdo das 6 linhas** = rodada 1b (o A3 original errou: usei coluna
`SINAL_OPERACAO`, que é da tabela de orçamento; na `CTBITDRE` é `SINAL`).

**Leitura preliminar:** tende ao **cenário B** (montamos a DRE a partir do plano de contas), usando
as 6 linhas do Globus no máximo como esqueleto de alto nível. A confirmar com as 6 linhas + o
financeiro.

**Rodada 1b — as 6 linhas estão EM BRANCO:** texto vazio, `CONTA_INICIAL/FINAL` vazias ou
`0.0.00.00.0000`. A estrutura de DRE do Globus **não está configurada** → **cenário B confirmado**
(montamos a DRE do plano de contas; o Globus não dá esqueleto aproveitável).

### B — plano de contas + mini-DRE (prova de conceito)
- **B1:** `NROPLANO=1` é o plano principal — classe 1 = 2244 contas, classe 2 = 4495, **classe 3
  (despesa) = 495**, **classe 4 (receita) = 131**, classe 5 = 33. (NROPLANO=2 é residual.) Material de
  sobra pra DRE.
- **B2 (mini-DRE do último período):** despesa `3.1` = **R$ 31,8M** ✓. Mas receita (classe 4) veio só
  **R$ 414k**, e o grupo **`4.1` "CARTÃO CIDADÃO"** (receita de transporte/GDF) veio **R$ 0**. ⚠️
  Identificamos a conta certa de receita, mas o mês pego não tinha receita lançada (provável **atraso
  de fechamento** — receita entra com defasagem). **A confirmar na rodada 2** em qual mês a receita
  aparece cheia, pra não afirmar que a DRE fecha sem prova.

**Status:** estruturalmente a DRE contábil é montável do razão (`CTBSALDO` classe 3/4, plano 1). Falta
só cravar o padrão de lançamento da receita (mês de referência correto) — rodada 2.

## Modelo de dados (rascunho — preencher após rodada 1)

- Reusa `integration.globus_ctbsaldo_stage` (ampliar filtro pra classe 3/4) + adapter da Depreciação.
- Canônico: `finance.dre_linha` (estrutura, herdada de CTBITDRE ou definida por nós) + cálculo
  query-time sobre `CTBSALDO` por período/faixa de conta. Valores em centavos. Comparativo mês / YTD.
- Drill-down: linha → contas → `CTBLANCA/CTBITLNC` (lançamentos) ou `finance.contas_pagar` (títulos).
