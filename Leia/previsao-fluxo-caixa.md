# Previsão de Fluxo de Caixa — Pioneira

**Autor:** Leonardo · **Empresa:** Viação Pioneira Ltda. · **Versão:** 1.0 · **Data:** 14 de maio de 2026

> Documenta o modelo conceitual e as queries-fonte da **previsão de fluxo de caixa** (cash flow forecast) — uma das telas centrais do sistema. Junta entradas de várias fontes (folha, CPG, arrecadação, repasse GDF) para projetar caixa nos próximos N dias/meses.

---

## Sumário

1. [O que é fluxo de caixa projetado](#1-o-que-é-fluxo-de-caixa-projetado)
2. [Entradas (receitas previstas) e saídas (pagamentos previstos)](#2-entradas-e-saídas-do-fluxo)
3. [Como cada fonte alimenta o forecast](#3-como-cada-fonte-alimenta-o-forecast)
4. [Query — extração de horas/custo por evento (CODEVENTO 207)](#4-query--extração-de-horascusto-por-evento)
5. [Lógica de conversão `REFERENCIA` Praxio (HHH.MM → horas decimais)](#5-lógica-de-conversão-referencia-praxio-hhhmm--horas-decimais)
6. [Modelo de forecast (3 horizontes)](#6-modelo-de-forecast-3-horizontes)
7. [Modelo canônico proposto](#7-modelo-canônico-proposto)
8. [API REST prevista](#8-api-rest-prevista)

---

## 1. O que é fluxo de caixa projetado

Diferente do **fluxo realizado** (extratos bancários + CPG pago + receita batida), o **projetado** responde:

> "Daqui a N dias, **quanto vou ter na conta** depois de todas as obrigações conhecidas e receitas previstas?"

Para uma empresa de transporte coletivo é vital porque:
- **Folha é fixa e grande** (~R$ 12-15 M/mês na Pioneira) e cai sempre no mesmo dia útil
- **Encargos** (INSS, FGTS, IRRF) caem em datas conhecidas do mês seguinte
- **Receita** (repasse GDF) tem padrão sazonal e varia ±10% mês a mês
- **CPG** (fornecedores) tem vencimentos pulverizados

Sem projeção, a tesouraria opera no escuro — descobre amanhã que faltam R$ 2 M para o pagamento da folha.

---

## 2. Entradas e saídas do fluxo

### Saídas previstas (com data já conhecida)

| Fonte | Confiança | Janela típica |
|---|---|---|
| **Folha líquida** (FLP) | Alta — datas contratuais | mês a mês, dia útil padrão |
| **Encargos da folha** (INSS, FGTS, IRRF) | Alta — datas legais | dia 20 / 7 / 20 do mês seguinte |
| **CPG em aberto** (`finance.contas_pagar` em status `pendente`/`aprovado`) | Alta | conforme `data_vencimento` |
| **Tributos próprios** (ICMS, ISS, COFINS, PIS) | Alta — calendário fiscal | datas fixas do mês seguinte |
| **Despesas recorrentes** (combustível, peças, manutenção) | Média — sazonalidade + tendência | projeção por média móvel |

### Entradas previstas

| Fonte | Confiança | Janela típica |
|---|---|---|
| **Repasse GDF** (receita real do consórcio) | Média-Alta | repasse mensal, varia |
| **Receita técnica acumulada** (T_ARR_*) | Alta — já realizada | retroativa (não é projeção, é o direito) |
| **Recebíveis diversos** (vendas de sucata, indenizações) | Baixa | esporádico |

---

## 3. Como cada fonte alimenta o forecast

### 3.1 Folha (FLP) → maior saída prevista

A partir de `finance.ficha_evento`:

```sql
-- Próxima folha (líquido a pagar)
SELECT data_pagamento_prevista,
       SUM(CASE WHEN ev.tipo = 'P' THEN fe.valor_cents
                WHEN ev.tipo = 'D' THEN -fe.valor_cents
                ELSE 0 END) AS liquido_cents
FROM   finance.ficha_evento fe
JOIN   finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
WHERE  fe.competencia = :competencia_atual
  AND  fe.tipo_folha = 1   -- mensal
GROUP  BY data_pagamento_prevista;
```

**Encargos** (INSS, FGTS, IRRF) são extraídos como **agregados próprios**:

```sql
SELECT ev.grupo,                              -- 'inss' | 'fgts' | 'irrf'
       SUM(fe.valor_cents) AS valor_cents,
       data_vencimento_calculada AS venc      -- regra fiscal: dia 7 / 20 do mês seguinte
FROM   finance.ficha_evento fe
JOIN   finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
WHERE  fe.competencia = :competencia
  AND  ev.grupo IN ('inss', 'fgts', 'irrf')
GROUP  BY ev.grupo;
```

Quando **horas extras** dispararem (período de pico), entram como **variável de projeção** — daí a importância da query abaixo (seção 4).

### 3.2 CPG (`finance.contas_pagar`) → fornecedores

```sql
SELECT data_vencimento, SUM(valor_liquido_cents) AS total_cents
FROM   finance.contas_pagar
WHERE  status IN ('pendente', 'aprovado')
  AND  data_vencimento BETWEEN :hoje AND :hoje + INTERVAL '90 days'
GROUP  BY data_vencimento
ORDER  BY data_vencimento;
```

### 3.3 Receita técnica (T_ARR_*) → indicador de tendência

A receita técnica do mês corrente (calculada via query 1 do `globus-arrecadacao-operacional.md`) **não é caixa direto**, mas é o melhor indicador para projetar o repasse GDF (relação ~85-95% típica após gratuidades).

### 3.4 Repasse GDF → entrada principal

Quando integrarmos com o canal de repasse do consórcio, virá como título CPG **reverso** (a receber) com origem `'repasse_gdf'`. Por enquanto, projeção via **média móvel de 3-6 meses** dos repasses históricos.

---

## 4. Query — Extração de horas/custo por evento

Esta é a **base** para projetar custos variáveis da folha (especialmente horas extras). Para um período, retorna por evento (`CODEVENTO`):

- Quantidade de funcionários impactados
- Valor financeiro total (R$)
- Horas totais (em formato decimal — soma de horas inteiras + frações de minutos convertidas)

### SQL completo (caso CODEVENTO 207 — horas extras)

```sql
SELECT
  T2.CODEVENTO,
  T2.DESCCOMPLEVEN,
  T2.DESCEVEN,
  T2.TIPOEVEN,
  T2.VALOR,                                                                
  T2.HORAS
FROM (
  SELECT
    T1.CODEVENTO,
    T1.DESCCOMPLEVEN,
    T1.DESCEVEN,
    T1.TIPOEVEN,
    SUM(T1.QTD)              AS QTD,
    SUM(T1.VALORFICHA) * 10  AS VALOR,           -- ⚠ multiplicação por 10 - ver nota abaixo
    SUM(T1.HR)               AS HORAS
  FROM (
    SELECT
      T.QTD, T.EMPRESA, T.RSEMPRESA,
      T.CODEVENTO, T.VALORFICHA,
      T.DESCCOMPLEVEN, T.DESCEVEN, T.TIPOEVEN,
      T.HE01,                                    -- horas inteiras (TRUNC da referência)
      T.HE02,                                    -- minutos transformados em segundos*100
      -- Converte HE02 (segundos × 100) para fração decimal de hora
      TRUNC((T.HE02 / 60) / 60)
        + ((T.HE02 / 60) - (TRUNC((T.HE02 / 60) / 60) * 60)) / 100  AS MIN,
      -- Total em decimal: horas inteiras + fração
      T.HE01
        + (TRUNC((T.HE02 / 60) / 60)
           + ((T.HE02 / 60) - (TRUNC((T.HE02 / 60) / 60) * 60)) / 100) AS HR
    FROM (
      SELECT
        E.EMPRESA, E.RSEMPRESA,
        L.CODEVENTO,
        V.DESCCOMPLEVEN, V.DESCEVEN, V.TIPOEVEN,
        COUNT(F.CODFUNC)                                                                 AS QTD,
        SUM(L.VALORFICHA)                                                                AS VALORFICHA,
        SUM(TRUNC(L.REFERENCIA))                                                         AS HE01,
        SUM((((((TRUNC(L.REFERENCIA) * 60 + (L.REFERENCIA - TRUNC(L.REFERENCIA)) * 100)
                  - (TRUNC((TRUNC(L.REFERENCIA) * 60 + (L.REFERENCIA - TRUNC(L.REFERENCIA)) * 100) / 60) * 60))
              / 100)) * 60) * 100)                                                      AS HE02
      FROM VW_FUNCIONARIOS   F,
           FLP_FICHAEVENTOS  L,
           FLP_EVENTOS       V,
           (SELECT EMP.CODIGOEMPRESA          EMPRESA,
                   AUE.RSOCIALEMPRESA         RSEMPRESA,
                   AUE.NOMEFANTASIAEMPRESA    NFEMPRESA
            FROM   CTR_CADEMP           EMP,
                   CTR_EMPAUTORIZADAS   AUE
            WHERE  EMP.CODINTEMPAUT = AUE.CODINTEMPAUT) E
      WHERE F.CODINTFUNC      = L.CODINTFUNC
        AND E.EMPRESA         = F.CODIGOEMPRESA
        AND L.COMPETFICHA     BETWEEN :dt_ini AND :dt_fim
        AND L.CODEVENTO       = V.CODEVENTO
        AND F.CODDEPTO        BETWEEN :deptoIni    AND :deptoFim
        AND F.CODSECAO        BETWEEN :secaoIni    AND :secaoFim
        AND F.CODSETOR        BETWEEN :setorIni    AND :setorFim
        AND L.TIPOFOLHA       BETWEEN :tipoFolhaIni AND :tipoFolhaFim
        AND E.EMPRESA         BETWEEN :empIni      AND :empFim
        AND E.EMPRESA        <> 3                              -- exclui empresa terceirizada/extinta
        AND V.CODEVENTO       = 207                            -- ⚠ código do evento (parametrizar!)
        -- AND V.TIPOEVEN     = 'P'                            -- opcional: só proventos
      GROUP BY E.EMPRESA, E.RSEMPRESA, L.CODEVENTO,
               V.DESCCOMPLEVEN, V.DESCEVEN, V.TIPOEVEN
    ) T
  ) T1
  GROUP BY T1.CODEVENTO, T1.DESCCOMPLEVEN, T1.DESCEVEN, T1.TIPOEVEN
) T2;
```

### Pontos de atenção

- **`V.CODEVENTO = 207`** está **hard-coded** na query. Provavelmente é "Hora Extra 50%" ou "Hora Extra Diurna" da Pioneira. **Parametrizar** para `:codEvento` ou usar `WHERE V.CODEVENTO IN (:codEventos)` quando portar.
- **`SUM(T1.VALORFICHA) * 10`** — multiplicação por 10 no nível T1. **Verificar com a equipe** se é intencional (talvez ajuste por escala) ou bug. Em centavos no nosso sistema isso não deveria existir.
- **`E.EMPRESA <> 3`** — exclui uma empresa específica (provavelmente terceirizada ou extinta). Documentar qual é antes de portar.
- **Filtros hierárquicos** (`CODDEPTO`, `CODSECAO`, `CODSETOR`) usam o range `BETWEEN :ini AND :fim` — útil quando os códigos são sequenciais. Para a Pioneira pode ser `1000..9999` (toda a empresa) ou ranges específicos por área.

---

## 5. Lógica de conversão `REFERENCIA` Praxio (HHH.MM → horas decimais)

Praxio **armazena horas em `FLP_FICHAEVENTOS.REFERENCIA` no formato `HHH.MM`**, onde:
- Parte inteira = horas
- Parte fracionária × 100 = **minutos** (não centésimos de hora!)

**Exemplo:** `REFERENCIA = 8.30` significa **8 horas e 30 minutos**, NÃO 8,3 horas decimais (que seriam 8h18m).

Para somar horas corretamente (ex.: total de horas extras do mês), precisa converter:

```
horas_decimais = TRUNC(REF) + ((REF - TRUNC(REF)) × 100) / 60
```

Que é o que a query faz, só que de forma rebuscada (`HE01` + `HE02` em "segundos × 100" → divide novamente):

| Variável | Cálculo | Significado |
|---|---|---|
| `HE01` | `TRUNC(REFERENCIA)` | Horas inteiras |
| `HE02` | minutos da parte fracionária expandidos para segundos × 100 | Forma intermediária para soma sem perda |
| `MIN`  | `(HE02 / 3600) + fração` | Recompõe a fração de hora |
| `HR`   | `HE01 + MIN` | Total em **horas decimais reais** |

**Versão simplificada** (mais legível, mesmo resultado):

```sql
SELECT SUM(
  TRUNC(REFERENCIA) +                                  -- horas inteiras
  ((REFERENCIA - TRUNC(REFERENCIA)) * 100) / 60        -- minutos → fração de hora
) AS horas_totais
FROM   FLP_FICHAEVENTOS
WHERE  CODEVENTO = 207
  AND  COMPETFICHA BETWEEN :dt_ini AND :dt_fim;
```

> 💡 No nosso backend (Node.js/TypeScript), essa conversão deve ficar **em um único helper** `referenciaParaHorasDecimais(ref: number): number` em `apps/FinancasBackend/src/shared/utils/horas.ts` para evitar duplicação espalhada por queries.

---

## 6. Modelo de forecast (3 horizontes)

| Horizonte | Janela | Estratégia | Confiança |
|---|---|---|---|
| **Curto** | D+1 a D+30 | Soma direta de obrigações conhecidas (folha do mês, CPG aberto, encargos do mês seguinte). Receita = repasse GDF projetado por **média móvel 3M** + adjuste por receita técnica do mês corrente. | Alta |
| **Médio** | D+31 a D+90 | Curto + folha projetada (assumir constância da folha + sazonalidade conhecida tipo 13º). | Média |
| **Longo** | D+91 a D+365 | Modelagem por média móvel histórica + reajustes contratuais conhecidos + premissas (crescimento da frota, gratuidades, IPK). | Baixa — só direcional |

### Indicadores que a tela do fluxo de caixa precisa expor

- **Saldo projetado por dia** (gráfico de linha)
- **Pontos críticos** — dias com saldo < buffer mínimo (configurável, ex.: 30% da folha)
- **Decomposição** do saldo: entradas/saídas por categoria
- **Variações vs realizado** (quando o dia for `<= hoje`)
- **Sensibilidade** — botões "e se?" (ex.: "e se atrasar X dias o repasse?")

---

## 7. Modelo canônico proposto

```sql
-- Schema finance (novo)

CREATE TABLE finance.previsao_movimento (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      INT NOT NULL DEFAULT 1,
  data_movimento  DATE NOT NULL,
  tipo            VARCHAR(20) NOT NULL,           -- 'entrada' | 'saida'
  categoria       VARCHAR(40) NOT NULL,           -- 'folha_liquida' | 'inss' | 'fgts' | 'irrf' | 'cpg' | 'repasse_gdf' | 'tributos' | 'outros'
  origem_id       VARCHAR(80),                    -- referencia opcional (ex.: id da ficha_evento ou conta_pagar)
  valor_cents     BIGINT NOT NULL,
  confianca       VARCHAR(10) NOT NULL DEFAULT 'alta',  -- 'alta' | 'media' | 'baixa'
  metodo          VARCHAR(40) NOT NULL,           -- 'derivado_folha' | 'cpg_aberto' | 'media_movel_3m' | 'manual'
  observacao      TEXT,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX previsao_data_idx ON finance.previsao_movimento (data_movimento, tipo);
CREATE INDEX previsao_categoria_idx ON finance.previsao_movimento (categoria, data_movimento);

CREATE TABLE finance.saldo_caixa_diario (
  data_referencia    DATE PRIMARY KEY,
  saldo_inicial      BIGINT NOT NULL,
  entradas           BIGINT NOT NULL DEFAULT 0,
  saidas             BIGINT NOT NULL DEFAULT 0,
  saldo_final        BIGINT GENERATED ALWAYS AS (saldo_inicial + entradas - saidas) STORED,
  realizado          BOOLEAN NOT NULL DEFAULT false, -- true quando data <= hoje e foi conciliado
  atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Job/recálculo

Toda mudança em `finance.contas_pagar`, `finance.ficha_evento` ou nova receita lançada **dispara recálculo incremental** das previsões dos próximos 90 dias via BullMQ:

```ts
// src/jobs/recalcular-previsao-fluxo.ts
async function recalcular(dataReferencia: Date): Promise<void> {
  // 1. Apaga previsões futuras da janela
  // 2. Lê obrigações de CPG aberto
  // 3. Lê próxima folha + encargos
  // 4. Aplica média móvel para repasse GDF projetado
  // 5. INSERT batch em finance.previsao_movimento
  // 6. Recalcula finance.saldo_caixa_diario do range
}
```

---

## 8. API REST prevista

```
GET /api/fluxo-caixa/projetado?dtIni=YYYY-MM-DD&dtFim=YYYY-MM-DD&buffer=300000000
    → [{ data, saldoFinalCents, entradas: {...}, saidas: {...}, alertas: [...] }, ...]

GET /api/fluxo-caixa/decomposicao?mes=YYYY-MM
    → totais por categoria + comparativo realizado vs projetado

POST /api/fluxo-caixa/cenario
    Body: { ajustes: [{ data, categoria, deltaCents }, ...] }
    → simula "e se" sem persistir

POST /api/fluxo-caixa/recalcular
    → dispara job BullMQ que repopula previsao_movimento

GET /api/fluxo-caixa/horas-evento?codEvento=207&dtIni=YYYY-MM-DD&dtFim=YYYY-MM-DD
    → soma horas decimais por evento (usa o util de conversão REFERENCIA Praxio)
```

### Auditoria

Toda visualização do fluxo de caixa cai em `audit.acesso_dados` (`recurso = 'fluxo-caixa'`). É **a tela mais estratégica do CFO** — quem viu, quando, com que filtros, **fica registrado**.

---

## 9. Relação com outras docs

| Doc | Conexão |
|---|---|
| `Leia/folha-flp-detalhamento.md` | Fonte da folha + encargos previstos |
| `Leia/globus-tabelas-financeiras-documentacao.md` | Fonte do CPG (saídas) |
| `Leia/globus-arrecadacao-operacional.md` | Fonte da receita técnica (input para projetar repasse) |
| `Leia/01_VISAO.md` | Princípios "sem dado, sem interpolação" — aplicado nos níveis de confiança |
| `Leia/06_ROADMAP.md` | Fase em que o módulo entra (provavelmente F2/F3) |
