# Globus — Pagamentos Realizados (CPG + BCOMOVTO)

**Autor:** Leonardo · **Empresa:** Viação Pioneira Ltda. · **Sistema:** GLOBUS (Praxio) · **Versão:** 1.0 · **Data:** 22 de maio de 2026

> Documentação da query oficial de **saídas reais de caixa do mês**, combinando pagamentos efetivados via Contas a Pagar (`CPGDOCTO`) + movimentações bancárias diretas (`BCOMOVTO`). Query validada em produção (Pioneira, empresa=4, mês 05/2026). Espelho de `globus-contas-receber-caixa.md` para o lado de saídas.

---

## Sumário

1. [Para que serve](#1-para-que-serve)
2. [Tabelas envolvidas](#2-tabelas-envolvidas)
3. [Query de referência (validada)](#3-query-de-referência-validada)
4. [Como cada bloco funciona](#4-como-cada-bloco-funciona)
5. [Resultado exemplo (mai/2026)](#5-resultado-exemplo-mai2026)
6. [Filtros padrão e regras](#6-filtros-padrão-e-regras)
7. [Observações operacionais](#7-observações-operacionais)
8. [Como integrar no Pioneira-Financas](#8-como-integrar-no-pioneira-financas)
9. [Próximos passos](#9-próximos-passos)

---

## 1. Para que serve

Responde uma pergunta concreta: **"quanto saiu de caixa nesse mês, por classificador contábil e por fornecedor?"**

Diferente da carteira de CP (`CPGDOCTO` filtrado por `VENCIMENTOCPG`), que mostra **o que está programado pra pagar**, esta query mostra **o que efetivamente saiu**. Inclui dois tipos de saída:

- **Via CPG:** títulos pagos (`PAGAMENTOCPG` não nulo, dentro do range)
- **Via banco direto:** lançamentos no `BCOMOVTO` que não passaram pelo CPG (tarifas bancárias, transferências entre contas, débitos automáticos sem título registrado)

Junta os dois em UNION ALL com schema homogêneo: classificador, empresa, fornecedor, tipo despesa, número doc, data, valor.

## 2. Tabelas envolvidas

### Já documentadas em `globus-tabelas-financeiras-documentacao.md`
- `CPGDOCTO` (cabeçalho do título a pagar)
- `CPGITDOC` (rateio do título por tipo de despesa)

### Novas (documentadas aqui)

#### `CPGTPDES` — Tipos de despesa (plano de contas do CPG)
Mirror do `CRCTPREC`. Catálogo hierárquico onde cada `CODTPDESPESA` tem um `CLASSIFICADOR` contábil.

| Coluna | Função |
|---|---|
| `CODTPDESPESA` | PK numérica |
| `DESCTPDESPESA` | Descrição (ex.: "Oleo Diesel", "Tarifa Bancaria", "Conservacao e Limpeza") |
| `CLASSIFICADOR` | Hierarquia contábil (ex.: `1.2.3.04.004`, `2.2.1.09.004`) |

> **Padrão observado nos classificadores:**
> - `1.2.x.x.x` — Despesa operacional (combustível, manutenção, terceiros, despesas gerais)
> - `2.2.x.x.x` — Passivo financeiro / movimentações bancárias (tarifas, transferências, empréstimos)
> Confirmar com a contabilidade da Pioneira.

#### `BGM_FORNECEDOR` — Cadastro de fornecedores
**Mirror estrutural do `BGM_CLIENTE`.** Tem nome/razão social/CNPJ — informação que faltava nos relatórios.

| Coluna | Função |
|---|---|
| `CODIGOFORN` | PK numérica → referenciada em `CPGDOCTO.CODIGOFORN` |
| `RSOCIALFORN` | Razão social |
| `NFANTASIAFORN` | Nome fantasia (usado nesta query) |
| `TPINSCRICAOFORN` | Tipo de inscrição (CNPJ/CPF) |
| `NRINSCRICAOFORN` | CNPJ/CPF |

> **Pode (e deve) ser usado também no CR.** Embora `globus-contas-receber-caixa.md` documente `BGM_CLIENTE`, o cadastro de fornecedor segue o mesmo padrão e pode ser cruzado em qualquer relatório de pagamentos.

#### `BCOMOVTO` — Movimento bancário (lançamentos)
Granularidade: **1 linha por movimentação bancária** (entrada ou saída, com ou sem vínculo a título CPG/CRC).

| Coluna | Função |
|---|---|
| `CODBANCO` | → `BCOBANCO.CODBANCO` |
| `CODIGOEMPRESA` | Empresa (4 = Pioneira) |
| `CODHISTOBCO` | → `BCOHISTO.CODHISTOBCO` (histórico bancário) |
| `CODTPDESPESA` | → `CPGTPDES.CODTPDESPESA` (classificação contábil) |
| `DTMOVTOBCO` | Data do movimento (data contábil) |
| `DTEFETIVAMOVTOBCO` | Data de efetivação (compensação) |
| `DTHORACHAVE` | Timestamp único (chave de auditoria) |
| `DOCMOVTOBCO` | Número do documento |
| `VLMOVTOBCO` | Valor (negativo = saída, positivo = entrada — confirmar) |
| `STATUSMOVTOBCO` | `'C'` = cancelado, demais = ativo |

#### `BCOHISTO` — Históricos bancários (catálogo)
Catálogo de tipos de lançamento bancário com indicador de débito/crédito.

| Coluna | Função |
|---|---|
| `CODHISTOBCO` | PK |
| `CODIGOEMPRESA` | Empresa (cada empresa tem seus históricos) |
| `DEBCREDHISTBCO` | `'D'` = débito (saída) / `'C'` = crédito (entrada) |

> **Diferença entre `BCOMOVTO` e `BCOSALDO`:** `BCOSALDO` está morta (5 linhas 2006-2007), `BCOMOVTO` é a fonte viva. Ver `[[globus-saldo-bancario]]` na memória para histórico da decisão.

## 3. Query de referência (validada)

Salva em `sql-exploracao/2026-05-22-globus-cpg-pagos-mais-bcomovto.sql`.

```sql
SELECT A.classificador,
       A.CODIGOEMPRESA,
       A.NFANTASIAFORN,
       A.DESCTPDESPESA,
       A.NRDOCTO,
       A.DATA,
       A.VLR
FROM (
    -- =====================================================
    -- BLOCO 1: Pagamentos via Contas a Pagar (CPGDOCTO)
    -- =====================================================
    SELECT TD.CLASSIFICADOR,
           D.CODTPDOC,
           D.STATUSDOCTOCPG,
           D.CODIGOEMPRESA,
           D.CODIGOFORN,
           F.RSOCIALFORN,
           F.NFANTASIAFORN,
           I.CODTPDESPESA,
           TD.DESCTPDESPESA,
           D.NRODOCTOCPG AS NRDOCTO,
           TO_CHAR(D.VENCIMENTOCPG, 'MM/YYYY') AS VENCIMENTO,
           D.VENCIMENTOCPG,
           D.PAGAMENTOCPG AS DATA,
           D.ACRESCIMOCPG,
           D.DESCONTOCPG,
           I.VALORITEMDOC,
           ( (I.VALORITEMDOC + D.ACRESCIMOCPG)
           - (D.DESCONTOCPG + D.VLRPISCPG + D.VLRCOFINSCPG
             + D.VLRCSLCPG + D.VLRINSSCPG + D.VLRIRRFCPG + D.VLRISSCPG)
           ) AS VLR
      FROM CPGDOCTO        D,
           CPGITDOC        I,
           CPGTPDES        TD,
           BGM_FORNECEDOR  F
     WHERE I.CODDOCTOCPG    = D.CODDOCTOCPG
       AND I.CODTPDESPESA   = TD.CODTPDESPESA
       AND D.CODIGOFORN     = F.CODIGOFORN
       AND D.CODIGOEMPRESA  = 4
       AND D.STATUSDOCTOCPG <> 'C'
       AND D.CODTPDOC       NOT IN ('BOL', 'BO')
       AND D.PAGAMENTOCPG   BETWEEN TO_DATE('01/05/2026', 'DD/MM/YYYY')
                                AND TO_DATE('31/05/2026', 'DD/MM/YYYY')
) A
UNION ALL
SELECT A.CLASSIFICADOR,
       A.CODIGOEMPRESA,
       A.NFANTASIAFORN,
       A.DESCTPDESPESA,
       A.NRDOCTO,
       A.DATA,
       A.VLR
FROM (
    -- =====================================================
    -- BLOCO 2: Movimentações bancárias (BCOMOVTO)
    -- =====================================================
    SELECT DISTINCT
           'BANCO'              AS NFANTASIAFORN,
           M.CODBANCO,
           H.CODIGOEMPRESA,
           H.CODHISTOBCO,
           R.CLASSIFICADOR,
           M.CODTPDESPESA,
           R.DESCTPDESPESA,
           H.DEBCREDHISTBCO,
           M.DTMOVTOBCO         AS DATA,
           M.DTEFETIVAMOVTOBCO,
           M.DTHORACHAVE,
           M.DOCMOVTOBCO        AS NRDOCTO,
           M.STATUSMOVTOBCO,
           (M.VLMOVTOBCO * -1)  AS VLR
      FROM BCOMOVTO  M,
           BCOHISTO  H,
           CPGTPDES  R
     WHERE H.CODHISTOBCO    = M.CODHISTOBCO
       AND H.CODIGOEMPRESA  = M.CODIGOEMPRESA
       AND M.CODTPDESPESA   = R.CODTPDESPESA
       AND H.CODIGOEMPRESA  = 4
       AND M.STATUSMOVTOBCO <> 'C'
       AND M.DTMOVTOBCO     BETWEEN TO_DATE('01/05/2026', 'DD/MM/YYYY')
                                AND TO_DATE('31/05/2026', 'DD/MM/YYYY')
) A
ORDER BY 2, 6;
```

## 4. Como cada bloco funciona

### Bloco 1 — CPG pagos
Itens de títulos a pagar **efetivamente quitados** no período (`PAGAMENTOCPG` entre `:dt_ini` e `:dt_fim`).

Cálculo do valor pago líquido:
```
VLR = (VALORITEMDOC + ACRESCIMOCPG)
    − (DESCONTOCPG + VLRPISCPG + VLRCOFINSCPG + VLRCSLCPG
       + VLRINSSCPG + VLRIRRFCPG + VLRISSCPG)
```

Ou seja: valor do item + acréscimo, menos descontos e retenções. Isso representa o **valor que efetivamente saiu da conta da empresa** para o fornecedor (as retenções viram títulos-filho do CPG, ver `globus-tabelas-financeiras-documentacao.md` §2).

### Bloco 2 — BCOMOVTO direto
Movimentações bancárias **que não passaram pelo CPG**: tarifas, débitos automáticos, transferências entre contas, etc. Inclui `BCOHISTO` para sinalizar débito/crédito e `CPGTPDES` para herdar a classificação contábil.

Multiplicação por `-1` no `VLMOVTOBCO`: a coluna armazena o sinal contábil (negativo = saída), mas pra somar com o Bloco 1 (que é sempre positivo = saída) inverte o sinal.

**`NFANTASIAFORN` fixo como `'BANCO'`** sinaliza que a saída foi via banco direto, não via fornecedor cadastrado.

## 5. Resultado exemplo (mai/2026)

Primeiras 22 linhas executadas em 22/05/2026 (parcial do mês):

| # | Classificador | Empresa | Fornecedor | Tipo despesa | Doc | Data | Valor R$ |
|---|---|---|---|---|---|---|---:|
| 1 | 1.2.3.04.004 | 4 | SHELL | Oleo Diesel | 0000502437 | 01/05 | 212.400,00 |
| 2 | 1.2.3.04.004 | 4 | SHELL | Oleo Diesel | 0000502436 | 01/05 | 153.400,00 |
| 3 | 1.2.2.03.003 | 4 | RAIZEN S/A | Querosene de Aviação JET A1 | 0000108929 | 04/05 | 10.065,15 |
| 4 | 1.2.2.03.005 | 4 | HT2 AVIACAO LTDA | Serviços Prestados na Aeronave - PJ | 0000001014 | 04/05 | 1.800,00 |
| 5 | 1.2.2.03.005 | 4 | MARCIA´S CATERING LTDA EPP | Serviços Prestados na Aeronave - PJ | 0000016011 | 04/05 | 664,91 |
| 6 | 2.2.1.09.004 | 4 | BANCO | Tarifa Bancaria | 0000000001 | 04/05 | 9,90 |
| 7 | 2.2.1.09.004 | 4 | BANCO | Tarifa Bancaria | 0000000002 | 04/05 | 24,00 |
| 8 | 2.2.1.14.006 | 4 | BANCO | Banco Safra S/A | 0000000001 | 04/05 | 1.300,00 |
| 9 | 2.2.1.09.004 | 4 | BANCO | Tarifa Bancaria | 0000000001 | 04/05 | 30,02 |
| 10 | 2.2.1.05.003 | 4 | SAFRA | SAFRA | 0751730076 | 04/05 | 128.644,91 |
| 11 | 1.2.2.01.001 | 4 | CAESB | Agua e Esgoto | 0000955852 | 04/05 | 667,96 |
| 12 | 1.2.2.01.001 | 4 | CAESB | Agua e Esgoto | 0000955863 | 04/05 | 45,78 |
| 13 | 1.2.2.01.009 | 4 | RECLAMAÇAO TRABALHISTA | Judiciais e Cartorarias | 9613720245 | 04/05 | 4.752,75 |
| 14 | 1.2.2.01.009 | 4 | RECLAMAÇAO TRABALHISTA | Judiciais e Cartorarias | 1086232024 | 04/05 | 7.268,02 |
| 15 | 1.2.2.01.010 | 4 | RECLAMAÇAO TRABALHISTA | Reclamacoes Trabalhistas | 0118752202 | 04/05 | 22.319,95 |
| 16 | 1.2.2.01.013 | 4 | LORENZI - COMERCIO DE EXTINTOR | Servicos de Terceiros - P. Juridica (Administração) | 0000022810 | 04/05 | 114,00 |
| 17 | 1.2.2.01.013 | 4 | RODOTEC - TACOGRAFOS E ACESSOR | Servicos de Terceiros - P. Juridica (Administração) | 0000003983 | 04/05 | 80,00 |
| 18 | 1.2.2.01.022 | 4 | FORESTI SPORTS E LOCAÇÃO | Despesas Gerais | 0000000113 | 04/05 | 36.599,17 |
| 19 | 1.2.2.01.022 | 4 | L.S.M.S.P.E | Despesas Gerais | 0000000046 | 04/05 | 36.599,17 |
| 20 | 1.2.2.01.022 | 4 | OREGON PARTICIPACOES | Despesas Gerais | 0000000071 | 04/05 | 36.599,17 |
| 21 | 1.2.2.01.022 | 4 | PRETTY NEW | Despesas Gerais | 0000010616 | 04/05 | 36.599,17 |
| 22 | 1.2.2.02.006 | 4 | PEPE TINTAS | Conservacao e Limpeza | 0000094064 | 04/05 | 34,00 |

**Padrões observados:**
- Combustível (Shell, Raizen) — maior linha individual de despesa
- 4 fornecedores com **valor idêntico R$ 36.599,17** em "Despesas Gerais" mesmo dia → provável **rateio/aluguel paritário** ou pagamento coordenado a sócios
- Movimentações bancárias têm `NFANTASIAFORN = 'BANCO'` (sem fornecedor cadastrado)
- Reclamações trabalhistas concentradas (linhas 13-15) — tipo de saída relevante

## 6. Filtros padrão e regras

| Filtro | Por quê |
|---|---|
| `D.CODIGOEMPRESA = 4` | Pioneira (ver [[pioneira-empresa-filiais]]) |
| `D.STATUSDOCTOCPG <> 'C'` | Exclui cancelados (Praxio usa flag, não DELETE) |
| `D.CODTPDOC NOT IN ('BOL', 'BO')` | Exclui boletos (são geradores de pagamento, não pagamento em si) |
| `D.PAGAMENTOCPG BETWEEN ...` | **Data de pagamento efetivo**, não vencimento — vai pra fluxo realizado |
| `M.STATUSMOVTOBCO <> 'C'` | Idem para BCOMOVTO |
| `M.DTMOVTOBCO BETWEEN ...` | Data contábil do movimento bancário |

> **`BETWEEN` em DATE perde o último dia se hora > 00:00.** Em produção, considerar intervalo semi-aberto:
> ```sql
> AND CAMPO_DATA >= TRUNC(:dt_ini)
> AND CAMPO_DATA <  TRUNC(:dt_fim) + 1
> ```

## 7. Observações operacionais

1. **Possíveis duplicidades** entre Bloco 1 e Bloco 2: se um pagamento foi feito via CPG e também aparece em `BCOMOVTO` (porque o banco lançou), ambos os blocos podem retornar a mesma transação. Investigar antes de somar como agregado de "saída do mês".

2. **A query retorna SAÍDAS, mas BCOMOVTO também tem entradas.** O filtro `(M.VLMOVTOBCO * -1)` aceita entradas (sinal positivo no original vira negativo) — pode aparecer como crédito negativo no resultado. Aplicar `WHERE H.DEBCREDHISTBCO = 'D'` se quiser só saídas.

3. **Pagamentos rateados em múltiplos itens** (CPGITDOC com várias linhas para o mesmo CPGDOCTO) produzem múltiplas linhas no Bloco 1 — totaliza corretamente quando somado por `D.NRODOCTOCPG`.

4. **Retenções viram títulos-filho separados.** Ver §"Particularidades importantes" em `globus-tabelas-financeiras-documentacao.md`. A fórmula de VLR já desconta retenções, então **somar VLR dá o valor líquido pago ao fornecedor**, não o bruto da nota.

5. **Hardcode `'BANCO'` no Bloco 2** ajuda a separar visualmente, mas perde informação. Se quiser saber qual banco fez o lançamento, juntar com `BCOBANCO` via `M.CODBANCO`.

## 8. Como integrar no Pioneira-Financas

Estes são caminhos possíveis (não decisões — apenas opções):

### Caminho A — Aba "Realizado" no Fluxo de Caixa
Espelho das abas "A pagar" e "A receber" (em desenvolvimento na Sprint 04), mas mostrando **o que efetivamente saiu**. Permite comparar previsto vs realizado dia-a-dia.

### Caminho B — Drill-down a partir do CPG no Fluxo de Caixa
Quando o usuário clicar num CP "baixado" no Fluxo de Caixa, mostrar a linha do `BCOMOVTO` correspondente (data de efetivação, banco).

### Caminho C — Conciliação bancária parcial
Esta query é o "lado livro" da conciliação. O outro lado seria o extrato bancário real (Open Finance / CNAB). Conciliação = match entre os dois.

> **Pré-requisitos comuns aos 3 caminhos:**
> - Sync de `CPGTPDES`, `BGM_FORNECEDOR`, `BCOMOVTO`, `BCOHISTO` (hoje só `CPGDOCTO` + `CPGITDOC` sincronizam)
> - Modelo canônico `finance.pagamento_realizado` no Postgres
> - Endpoint `/api/fluxo-caixa/realizado?mes=YYYY-MM`

## 9. Próximos passos

1. ✅ **Query validada em 22/05/2026** — resultado conferido com primeiras 22 linhas
2. ⏳ **Confirmar `DEBCREDHISTBCO`** — saber se `'D'` é só débito ou inclui também movimentações internas
3. ⏳ **Identificar duplicidades CPG × BCOMOVTO** — alguns CPGs pagos podem aparecer em ambos os blocos
4. ⏳ **Mapear classificadores `1.2.x` vs `2.2.x`** com a contabilidade — confirmar se a separação é operacional vs financeira
5. ⏳ **Decisão de produto:** Caminho A / B / C ou ignorar por enquanto. Discutir na reunião de validação com financeiro (Sprint 04)
6. ⏳ **Se aprovado Caminho A:** adicionar como work item no backlog do Plane (SFN-NN — "Implementar aba 'Realizado' no Fluxo de Caixa")

## Relacionado

- `globus-tabelas-financeiras-documentacao.md` — CPGDOCTO, CPGITDOC, BGM_NOTAFISCAL detalhadas
- `globus-contas-receber-caixa.md` — espelho do lado CR (CRCDOCTO + BGM_CLIENTE)
- `globus-saldo-bancario.md` — por que `BCOCONTA.SALDO_ACM_ATE_DATA` foi descartado
- `fluxo-caixa.md` — módulo atual do Pioneira-Financas
- Memórias: [[globus-tabelas-financeiras]] · [[globus-saldo-bancario]] · [[pioneira-empresa-filiais]]
