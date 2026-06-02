# Globus — Arrecadação Operacional (Passageiros, Linhas, Veículos)

**Autor:** Leonardo · **Empresa:** Viação Pioneira Ltda. — Bacia 2 / STPC-DF · **Sistema:** GLOBUS (Praxio) — schema Oracle · **Versão:** 1.0 · **Data:** 14 de maio de 2026

> Documenta as **tabelas operacionais** do Globus que alimentam a receita real do transporte: guias de viagem (turnos), viagens individuais, detalhe de bilhetagem, frota e linhas. Complementa `globus-tabelas-financeiras-documentacao.md` (NF/CPG) e `folha-flp-detalhamento.md` (folha).

---

## Sumário

1. [Contexto — receita operacional vs receita financeira](#1-contexto--receita-operacional-vs-receita-financeira)
2. [Tabelas mapeadas](#2-tabelas-mapeadas)
3. [Conceito central — Receita Técnica vs Receita Real (GDF)](#3-conceito-central--receita-técnica-vs-receita-real-gdf)
4. [Query 1 — Movimento diário com análise por tipo de dia (UT/SA/DO)](#4-query-1--movimento-diário-com-análise-por-tipo-de-dia-utsado)
5. [Query 2 — Passageiros por veículo (frota)](#5-query-2--passageiros-por-veículo-frota)
6. [Tarifas SEMOB históricas](#6-tarifas-semob-históricas)
7. [Tipos de pagamento e agrupamentos](#7-tipos-de-pagamento-e-agrupamentos)
8. [Análises possíveis e queries derivadas](#8-análises-possíveis-e-queries-derivadas)
9. [Próximos passos para integração](#9-próximos-passos-para-integração)

---

## 1. Contexto — receita operacional vs receita financeira

No transporte coletivo da Pioneira existem **duas óticas de receita** que precisam ficar separadas no sistema (princípio do CLAUDE.md):

| Ótica | Origem dos dados | O que mede |
|---|---|---|
| **Operacional (técnica)** | `T_ARR_DETALHE_GUIA` (bilhetagem nos veículos) | Quantos passageiros entraram, em qual carro, em qual linha, qual forma de pagamento — base para o **direito a repasse** |
| **Financeira (real)** | Repasse do GDF / SEMOB no CPG | Quanto **efetivamente** entrou no caixa após cálculo do sistema tarifário, descontos, IPK, ajustes contratuais |

> **Regra inviolável:** receita técnica (Pax × Tarifa SEMOB) **nunca** é apresentada como receita real (repasse GDF). São números diferentes, com finalidades diferentes, e misturar quebra a rastreabilidade exigida pelo regulador.

Esta documentação cobre **só a ótica operacional**. A financeira vive no CPG (já documentado).

---

## 2. Tabelas mapeadas

### 2.1 `T_ARR_GUIA` — Guia de viagem (turno do motorista)

Cabeçalho do "turno" de um motorista num veículo num dia. Cada guia agrupa N viagens.

| Coluna | Significado |
|---|---|
| `COD_SEQ_GUIA` | PK — chave natural da guia |
| `COD_EMPRESA` | Empresa operadora (4 = Pioneira) |
| `DAT_VIAGEM_GUIA` | Data da operação do turno |
| `COD_VEICULO` | FK → `FRT_CADVEICULOS` |

### 2.2 `T_ARR_VIAGENS_GUIA` — Viagens individuais

Cada saída do garage até retorno (ou cada trip-leg, dependendo do modelo).

| Coluna | Significado |
|---|---|
| `COD_SEQ_GUIA` | FK → `T_ARR_GUIA` |
| `COD_SEQ_VIAGEM` | PK composta com a guia |
| `COD_INTLINHA` | FK → `BGM_CADLINHAS` (qual linha estava operando) |
| `COD_VEICULO` | FK → `FRT_CADVEICULOS` |

### 2.3 `T_ARR_DETALHE_GUIA` — Bilhetagem (passageiros + receita)

**A tabela mais importante para receita operacional.** 1 linha por (guia, viagem, tipo de pagamento) com agregados.

| Coluna | Significado |
|---|---|
| `COD_SEQ_GUIA`, `COD_SEQ_VIAGEM`, `CODINTLINHA` | Identificação da viagem |
| `COD_TIPOPAGTARIFA` | FK → `T_TRF_TIPOPAGTO` (ver seção 7) |
| `QTD_PASSAG_TRANS` | **Passageiros transportados** (estes geram receita técnica) |
| `VLR_RECEB` | Valor recebido (real, conforme bilhetagem) |

> ⚠️ **Excluir `COD_TIPOPAGTARIFA = 3`** quando calcular receita técnica — é "passe livre / gratuidade" que conta como passageiro mas **não gera direito a tarifa**.

### 2.4 `FRT_CADVEICULOS` — Cadastro de frota

| Coluna | Significado |
|---|---|
| `CODIGOVEIC` | PK do veículo |
| `PREFIXOVEIC` | Prefixo visível (ex.: `01234`) — alguns têm `0` à esquerda |
| `CODIGOGA` | Garagem onde fica lotado (`31` = garagem específica da Pioneira) |

### 2.5 `BGM_CADLINHAS` — Cadastro de linhas

| Coluna | Significado |
|---|---|
| `CODINTLINHA` | PK |
| `NROFICIALLINHA` | Número oficial publicado (ex.: `0.005`, `0.140`) |
| `NOMELINHA` | Descrição (`PLANO PILOTO - SAMAMBAIA`) |
| `CODIGOGA` | Garagem da linha — usado como fallback quando o prefixo do veículo tem < 4 caracteres |

### 2.6 `FRT_COMPRAVEIC` — Tipo de bem do veículo

Usado para filtrar **só ônibus** (excluir vans, motos, carros de apoio).

| Coluna | Significado |
|---|---|
| `CODIGOVEIC` | FK → `FRT_CADVEICULOS` |
| `CODIGOTIPOBEM` | `1` = ônibus (filtro padrão), 2+ = outros bens |
| `MESANOFABRCPRVEIC` | Ano de fabricação (string `MMAAAA`) — útil para idade da frota |

### 2.7 `T_TRF_TIPOPAGTO` — Tipos de pagamento

Códigos das formas de pagamento (catálogo). Ver seção 7.

### 2.8 `T_TRF_AGRUPATIPOPAGTO_TIPOS` — Agrupamento de tipos de pagamento

Tabela de-para que agrupa os ~20 tipos em **7 grupos visuais** (`col1`–`col7`).

| Coluna | Significado |
|---|---|
| `COD_TIPOPAGTO` | FK → `T_TRF_TIPOPAGTO` |
| `CODAGRUPA` | 1 a 7 — o grupo (ver query 2) |
| `TIPOAGRUPA` | `999` é o agrupamento padrão usado nos relatórios |

### 2.9 `FC_ARR_NOMEEMPFIL(emp, filial)` — Função PL/SQL

Retorna o nome da empresa/filial para um código. Usada como `FC_ARR_NOMEEMPFIL(max(a.cod_empresa), 0)`.

---

## 3. Conceito central — Receita Técnica vs Receita Real (GDF)

### Receita Técnica (operacional)

```
RECEITA_TECNICA = Σ (QTD_PASSAG_TRANS × TARIFA_SEMOB_DA_DATA)
```

Onde `TARIFA_SEMOB_DA_DATA` segue a tabela histórica da SEMOB-DF (seção 6).

**O que ela representa:** quanto a Pioneira **teria a receber** se o sistema fosse pago por passageiro transportado × tarifa cheia. **Não é o que entra no caixa.**

### Receita Real (financeira)

É o **repasse mensal do GDF** (via consórcio operador), calculado pela fórmula contratual STPC-DF que considera:
- Receita técnica do consórcio inteiro
- Quilometragem rodada (IPK = índice de passageiros por km)
- Ajustes por gratuidades (idosos, estudantes, deficientes)
- Equilíbrio econômico-financeiro (reajustes, subsídios)

**Aparece como título no CPG** com origem = `'repasse_gdf'` (futuro — a documentar quando integrarmos).

> ⚠️ **Princípio operacional:** se uma tela mostra "receita", deve estar **explicitamente etiquetada** como uma das duas (técnica ou real). Estados aceitáveis no sistema: `real` · `calculado` · `projetado` · `sem dado` — **nunca** interpolar em silêncio (regra herdada do v1 — ver `Leia/01_VISAO.md`).

---

## 4. Query 1 — Movimento diário com análise por tipo de dia (UT/SA/DO)

### Objetivo

Para um mês selecionado, retorna 1 linha por dia operado contendo:
- **Passageiros transportados** (excluindo gratuidades)
- **Valor recebido** (bruto, conforme bilhetagem)
- **Receita técnica calculada** (Pax × tarifa SEMOB da data)
- **Tipo de dia** (`ÚTEIS`, `SÁBADO`, `DOMINGO`)
- **Pico de movimento** por tipo de dia no mês (`ML_PASS_UT`, `ML_PASS_SA`, `ML_PASS_DO`) e a **data** em que esse pico ocorreu (`ML_DT_*`)

Útil para: análise sazonal, comparativo semana-vs-semana, identificação do dia útil/sábado/domingo de maior movimento.

### SQL (4 níveis de subquery + window functions)

```sql
SELECT H.DATA,
       H.DAT_VIAGEM_GUIA,
       H.SEMANA,
       H.TP_SEMANA,
       H.QTD_PASS,
       H.VLR_RECEB,
       H.RECEITA_TEC,
       H.CODIGOGA,
       H.ML_PASS_UT,
       H.ML_PASS_SA,
       H.ML_PASS_DO,
       MAX(H.ML_DT_UT) OVER () AS ML_DT_UT,
       MAX(H.ML_DT_SA) OVER () AS ML_DT_SA,
       MAX(H.ML_DT_DO) OVER () AS ML_DT_DO
FROM (
  SELECT E.*,
         CASE WHEN E.ML_PASS_UT = E.QTD_PASS THEN E.DAT_VIAGEM_GUIA END AS ML_DT_UT,
         CASE WHEN E.ML_PASS_SA = E.QTD_PASS THEN E.DAT_VIAGEM_GUIA END AS ML_DT_SA,
         CASE WHEN E.ML_PASS_DO = E.QTD_PASS THEN E.DAT_VIAGEM_GUIA END AS ML_DT_DO
  FROM (
    SELECT D.*,
           MAX(CASE WHEN D.TP_SEMANA = ' TEIS'   THEN D.QTD_PASS END) OVER () AS ML_PASS_UT,
           MAX(CASE WHEN D.TP_SEMANA = 'S BADO'  THEN D.QTD_PASS END) OVER () AS ML_PASS_SA,
           MAX(CASE WHEN D.TP_SEMANA = 'DOMINGO' THEN D.QTD_PASS END) OVER () AS ML_PASS_DO
    FROM (
      SELECT TO_CHAR(C.DAT_VIAGEM_GUIA, 'dd/MM/yyyy') || ' - ' || C.SEMANA AS DATA,
             C.DAT_VIAGEM_GUIA, C.SEMANA,
             CASE WHEN C.DIA_SEMANA BETWEEN 2 AND 6 THEN ' TEIS'   -- 2-6 = Seg a Sex
                  WHEN C.DIA_SEMANA = 7              THEN 'S BADO'  -- 7   = Sábado
                  ELSE 'DOMINGO' END AS TP_SEMANA,
             C.QTD_PASS, C.VLR_RECEB, C.RECEITA_TEC, C.CODIGOGA
      FROM (
        SELECT B.DAT_VIAGEM_GUIA,
               TO_CHAR(B.DAT_VIAGEM_GUIA, 'DY', 'NLS_DATE_LANGUAGE = PORTUGUESE') AS SEMANA,
               TO_CHAR(B.DAT_VIAGEM_GUIA, 'D') AS DIA_SEMANA,
               B.QTD_PASS, B.VLR_RECEB,
               B.QTD_PASS * CASE
                   WHEN B.DAT_VIAGEM_GUIA BETWEEN DATE '2022-12-31' AND DATE '2023-06-30' THEN 8.7714
                   WHEN B.DAT_VIAGEM_GUIA > DATE '2023-06-30' THEN 7.1417
                   ELSE 0
               END AS RECEITA_TEC,
               B.CODIGOGA
        FROM (
          SELECT A.DAT_VIAGEM_GUIA,
                 SUM(A.QTD_PASSAG_TRANS) AS QTD_PASS,
                 SUM(A.VLR_RECEB)        AS VLR_RECEB,
                 A.CODIGOGA
          FROM (
            SELECT G.DAT_VIAGEM_GUIA,
                   D.QTD_PASSAG_TRANS,
                   D.VLR_RECEB,
                   CASE WHEN LENGTH(LTRIM(VE.PREFIXOVEIC, 0)) <= 4 THEN VE.CODIGOGA
                        ELSE L.CODIGOGA END AS CODIGOGA   -- fallback: prefixo curto usa garagem da linha
            FROM T_ARR_GUIA          G,
                 T_ARR_VIAGENS_GUIA  V,
                 T_ARR_DETALHE_GUIA  D,
                 FRT_CADVEICULOS     VE,
                 BGM_CADLINHAS       L,
                 T_TRF_TIPOPAGTO     T
            WHERE G.DAT_VIAGEM_GUIA BETWEEN :dt_ini AND :dt_fim
              AND G.COD_SEQ_GUIA      = V.COD_SEQ_GUIA
              AND G.COD_SEQ_GUIA      = D.COD_SEQ_GUIA
              AND V.COD_SEQ_VIAGEM    = D.COD_SEQ_VIAGEM
              AND V.COD_INTLINHA      = D.CODINTLINHA
              AND V.COD_VEICULO       = VE.CODIGOVEIC
              AND V.COD_INTLINHA      = L.CODINTLINHA
              AND D.COD_TIPOPAGTARIFA = T.COD_TIPOPAGTO
              AND D.COD_TIPOPAGTARIFA NOT IN (3)            -- exclui gratuidade
          ) A
          WHERE A.CODIGOGA = :garagem                       -- ex: 31
          GROUP BY A.DAT_VIAGEM_GUIA, A.CODIGOGA
        ) B
      ) C
    ) D
  ) E
) H;
```

### Saída esperada (exemplo Maio/2024, garagem 31)

| DATA | QTD_PASS | VLR_RECEB | RECEITA_TEC | ML_PASS_UT | ML_DT_UT |
|---|---:|---:|---:|---:|---|
| 02/05/2024 - QUI | 63.162 | 154.179,60 | 451.084,06 | 64.629 | 15/05/2024 |
| 11/05/2024 - SÁB | 32.856 | 88.798,70 | 234.647,70 | 32.856 (ML_PASS_SA) | 11/05/2024 |
| 19/05/2024 - DOM | 14.910 | 45.936,40 | 106.482,75 | 15.312 (ML_PASS_DO) | 12/05/2024 |
| 15/05/2024 - QUA | **64.629** ⬅ pico UT | 156.101,20 | 461.560,93 | 64.629 | 15/05/2024 |

### Pontos de atenção

- **Encoding do `TO_CHAR(...'DY', ...PORTUGUESE)`**: retorna `'SEG'`, `'TER'`, `'QUA'`, `'QUI'`, `'SEX'`, `'SÁB'`, `'DOM'` — note que **`'SÁB'` tem acento na maioria das instalações**, mas o CASE no SQL usa `'S BADO'` (sem acento, com espaço) porque a coluna PT_BR vem com encoding diferente. **Cuidado** ao portar: testar primeiro `SELECT DISTINCT TO_CHAR(SYSDATE, 'DY', ...)` no PL/SQL.
- **Tarifa hard-coded** (8.7714, 7.1417): quando criarmos uma tabela de tarifas SEMOB no Postgres (seção 6), substituir o CASE por LEFT JOIN.
- **Garagem fallback**: `LENGTH(LTRIM(VE.PREFIXOVEIC, 0)) <= 4` — veículos com prefixo "curto" (< 4 dígitos após remover zeros à esquerda) usam a garagem da linha em vez da garagem do veículo. Regra operacional histórica da Pioneira.

---

## 5. Query 2 — Passageiros por veículo (frota)

### Objetivo

Para um período + faixa de empresas, retorna **passageiros transportados por veículo** (só ônibus — `CODIGOTIPOBEM = 1`), agregando por **forma de pagamento** em 7 colunas (`COL1` a `COL7`).

Útil para: ranking de carros mais utilizados, ociosidade da frota, base para alocação de motoristas.

### SQL (subquery agregadora + filtro por tipo de bem)

```sql
SELECT Q.EMPRESA, Q.NOMEEMPRESA, Q.CODIGOVEIC, Q.PREFIXOVEIC,
       SUM(Q.COL1 + Q.COL2 + Q.COL3 + Q.COL4 + Q.COL5 + Q.COL6 + Q.COL7) AS QTDPASSAG
FROM (
  SELECT
    L.NROFICIALLINHA,
    MAX(A.COD_EMPRESA)                                 AS EMPRESA,
    FC_ARR_NOMEEMPFIL(MAX(A.COD_EMPRESA), 0)           AS NOMEEMPRESA,
    MAX(L.CODIGOLINHA)                                 AS CODIGOLINHA,
    MAX(L.NOMELINHA)                                   AS NOMELINHA,
    MAX(A.COD_GUIA)                                    AS COD_GUIA,
    MAX(CV.CODIGOVEIC)                                 AS CODIGOVEIC,
    MAX(CV.PREFIXOVEIC)                                AS PREFIXOVEIC,
    MAX(A.DAT_VIAGEM_GUIA)                             AS DATA,
    -- Passageiros agrupados por TIPO DE PAGAMENTO (col1..col7)
    SUM(DECODE(T.CODAGRUPA, 1, B.QTD_PASSAG_TRANS, 0)) AS COL1,
    SUM(DECODE(T.CODAGRUPA, 2, B.QTD_PASSAG_TRANS, 0)) AS COL2,
    SUM(DECODE(T.CODAGRUPA, 3, B.QTD_PASSAG_TRANS, 0)) AS COL3,
    SUM(DECODE(T.CODAGRUPA, 4, B.QTD_PASSAG_TRANS, 0)) AS COL4,
    SUM(DECODE(T.CODAGRUPA, 5, B.QTD_PASSAG_TRANS, 0)) AS COL5,
    SUM(DECODE(T.CODAGRUPA, 6, B.QTD_PASSAG_TRANS, 0)) AS COL6,
    SUM(DECODE(T.CODAGRUPA, 7, B.QTD_PASSAG_TRANS, 0)) AS COL7,
    -- Valor recebido agrupado (col8..col14) - mesma lógica
    SUM(DECODE(T.CODAGRUPA, 1, B.VLR_RECEB, 0)) AS COL8,
    SUM(DECODE(T.CODAGRUPA, 2, B.VLR_RECEB, 0)) AS COL9,
    SUM(DECODE(T.CODAGRUPA, 3, B.VLR_RECEB, 0)) AS COL10,
    SUM(DECODE(T.CODAGRUPA, 4, B.VLR_RECEB, 0)) AS COL11,
    SUM(DECODE(T.CODAGRUPA, 5, B.VLR_RECEB, 0)) AS COL12,
    SUM(DECODE(T.CODAGRUPA, 6, B.VLR_RECEB, 0)) AS COL13,
    SUM(DECODE(T.CODAGRUPA, 7, B.VLR_RECEB, 0)) AS COL14
  FROM T_TRF_AGRUPATIPOPAGTO_TIPOS T,
       T_ARR_GUIA                  A,
       T_ARR_DETALHE_GUIA          B,
       BGM_CADLINHAS               L,
       T_ARR_VIAGENS_GUIA          V,
       FRT_CADVEICULOS             CV
  WHERE CV.CODIGOVEIC      = V.COD_VEICULO
    AND V.COD_SEQ_GUIA     = B.COD_SEQ_GUIA
    AND V.COD_SEQ_VIAGEM   = B.COD_SEQ_VIAGEM
    AND T.COD_TIPOPAGTO    = B.COD_TIPOPAGTARIFA
    AND T.TIPOAGRUPA       = 999                       -- agrupamento padrão de relatórios
    AND L.CODINTLINHA      = B.CODINTLINHA
    AND A.COD_SEQ_GUIA     = B.COD_SEQ_GUIA
    AND A.DAT_VIAGEM_GUIA  BETWEEN :dataInicio AND :dataFim
    AND A.COD_EMPRESA      BETWEEN :empIni AND :empFim
  GROUP BY A.COD_EMPRESA, L.NROFICIALLINHA, CV.PREFIXOVEIC,
           A.DAT_VIAGEM_GUIA, V.COD_SEQ_GUIA, V.COD_SEQ_VIAGEM
  ORDER BY A.COD_EMPRESA, A.DAT_VIAGEM_GUIA, CV.PREFIXOVEIC ASC
) Q,
FRT_COMPRAVEIC P
WHERE Q.CODIGOVEIC = P.CODIGOVEIC
  AND P.CODIGOTIPOBEM = 1                              -- só ônibus
  -- AND SUBSTR(P.MESANOFABRCPRVEIC, 3, 6) > 2006      -- filtro de idade (opcional)
GROUP BY Q.EMPRESA, Q.NOMEEMPRESA, Q.CODIGOVEIC, Q.PREFIXOVEIC
ORDER BY Q.EMPRESA, Q.NOMEEMPRESA ASC;
```

### Pontos de atenção

- **`TIPOAGRUPA = 999`** é o agrupamento "para relatórios". Outros valores (1-N) podem existir para diferentes visões (gerencial, fiscal). Confirmar com a equipe quando integrar.
- **`COL1`–`COL7`** são as colunas que materializam o **pivot por tipo de pagamento agrupado**. Os significados precisam ser confirmados na `T_TRF_AGRUPATIPOPAGTO_TIPOS` com `TIPOAGRUPA=999`:
  ```sql
  SELECT CODAGRUPA, COUNT(*) qtd_tipos,
         LISTAGG(COD_TIPOPAGTO, ',') WITHIN GROUP (ORDER BY COD_TIPOPAGTO) tipos
  FROM   T_TRF_AGRUPATIPOPAGTO_TIPOS WHERE TIPOAGRUPA = 999
  GROUP  BY CODAGRUPA ORDER BY CODAGRUPA;
  ```
- **`COL8`–`COL14`** são `VLR_RECEB` por grupo — não somados no SELECT externo neste caso, mas disponíveis para análises de valor (R$) por grupo.
- **`FC_ARR_NOMEEMPFIL(emp, 0)`** é uma função PL/SQL — se for portar a query pra outro sistema sem chamar a function, substitui por JOIN com `CTR_EMPAUTORIZADAS` (ver query do adiantamento na `folha-flp-detalhamento.md`).

---

## 6. Tarifas SEMOB históricas

Tabela hard-coded na query 1 (vai virar `finance.tarifa_semob` no Postgres quando integrarmos):

| Vigência início | Vigência fim | Tarifa cheia | Fonte |
|---|---|---:|---|
| (anterior a 31/12/2022) | 30/12/2022 | (não documentado) | — |
| 31/12/2022 | 30/06/2023 | **R$ 8,7714** | Reajuste SEMOB-DF |
| 01/07/2023 | (vigente até `<data atual>`) | **R$ 7,1417** | Decreto GDF — redução tarifária |

> ⚠️ A **redução** de 8,7714 → 7,1417 em 01/07/2023 reflete subsídio operacional do GDF (passageiros pagam menos, governo compensa o consórcio). **Não é desconto da Pioneira.** Quando integrarmos, a tabela deve ter `tipo` (`cheia` / `subsidiada` / `gratuidade`) para análise correta.

### Modelo canônico proposto

```sql
CREATE TABLE finance.tarifa_semob (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarifa_cents    BIGINT NOT NULL,           -- 87714 para R$ 8,7714
  vigencia_inicio DATE NOT NULL,
  vigencia_fim    DATE,                       -- NULL = vigente
  tipo            VARCHAR(20) NOT NULL DEFAULT 'cheia', -- 'cheia' | 'subsidiada' | 'gratuidade'
  fonte           VARCHAR(200),                -- decreto/portaria SEMOB
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);
CREATE UNIQUE INDEX tarifa_semob_vigente_uq
  ON finance.tarifa_semob (tipo)
  WHERE vigencia_fim IS NULL;  -- só 1 tarifa vigente por tipo

INSERT INTO finance.tarifa_semob (tarifa_cents, vigencia_inicio, vigencia_fim, tipo, fonte) VALUES
  (87714, '2022-12-31', '2023-06-30', 'cheia', 'Reajuste SEMOB-DF 2022'),
  (71417, '2023-07-01', NULL,         'cheia', 'Decreto GDF 2023 — subsídio operacional');
```

---

## 7. Tipos de pagamento e agrupamentos

### `T_TRF_TIPOPAGTO` (códigos vistos nas queries)

| `COD_TIPOPAGTO` | Significado provável | Observação |
|---|---|---|
| 1 | Bilhete inteiro dinheiro | — |
| 2 | Bilhete eletrônico (cartão BRB Mobilidade?) | confirmar |
| **3** | **Gratuidade / passe livre** | **excluir** ao calcular receita técnica |
| 4 | Estudante | gratuidade parcial (50%) |
| 5 | Idoso | gratuidade total |
| 6 | Deficiente | gratuidade total |
| 7 | Vale-transporte empresarial | pago pelo empregador |
| 8+ | Outros (validar com SEMOB) | — |

> ⚠️ **Códigos inferidos** — confirmar com:
> ```sql
> SELECT COD_TIPOPAGTO, DESCTPPAGTO, ATIVO FROM T_TRF_TIPOPAGTO ORDER BY COD_TIPOPAGTO;
> ```

### `T_TRF_AGRUPATIPOPAGTO_TIPOS` (de-para de agrupamento)

A tabela mapeia cada `COD_TIPOPAGTO` para um `CODAGRUPA` (1–7) dentro de um `TIPOAGRUPA` (visão — 999 = relatórios padrão).

```sql
-- Conferir o mapeamento atual
SELECT  T.CODAGRUPA AS GRUPO,
        LISTAGG(T.COD_TIPOPAGTO || '=' || P.DESCTPPAGTO, ' | ')
          WITHIN GROUP (ORDER BY T.COD_TIPOPAGTO) AS TIPOS
FROM    T_TRF_AGRUPATIPOPAGTO_TIPOS T
JOIN    T_TRF_TIPOPAGTO P ON P.COD_TIPOPAGTO = T.COD_TIPOPAGTO
WHERE   T.TIPOAGRUPA = 999
GROUP   BY T.CODAGRUPA
ORDER   BY T.CODAGRUPA;
```

---

## 8. Análises possíveis e queries derivadas

A partir do par de queries documentado:

### 8.1 Variação semanal de movimento

```sql
-- Por linha, qual o dia útil/sábado/domingo médio na semana?
SELECT L.NOMELINHA, D.DAT_VIAGEM_GUIA,
       SUM(D.QTD_PASSAG_TRANS) qtd_pax,
       TO_CHAR(D.DAT_VIAGEM_GUIA, 'DY', 'NLS_DATE_LANGUAGE=PORTUGUESE') dia
FROM ...
GROUP BY L.NOMELINHA, D.DAT_VIAGEM_GUIA;
```

### 8.2 Top 10 linhas por receita técnica do mês

Reusa query 1 trocando o agrupamento de `(data, garagem)` para `(linha)`.

### 8.3 Ociosidade da frota

Frota ativa do mês = `COUNT(DISTINCT CODIGOVEIC)` na query 2. Comparar com `COUNT(*)` em `FRT_CADVEICULOS WHERE CODIGOSIT = 'ativo'` para descobrir carros parados.

### 8.4 % de gratuidades

```sql
SELECT TRUNC(SUM(CASE WHEN B.COD_TIPOPAGTARIFA = 3 THEN B.QTD_PASSAG_TRANS ELSE 0 END)
             / NULLIF(SUM(B.QTD_PASSAG_TRANS), 0) * 100, 2) AS pct_gratuidades
FROM T_ARR_DETALHE_GUIA B JOIN T_ARR_GUIA A ...
```

### 8.5 Comparativo Receita Técnica vs Receita Real (futuro, quando integrarmos o repasse GDF)

```sql
SELECT a.competencia,
       a.receita_tecnica_cents,                 -- da bilhetagem
       b.repasse_gdf_cents,                     -- do CPG
       (b.repasse_gdf_cents - a.receita_tecnica_cents) AS diferenca,
       ROUND(b.repasse_gdf_cents::numeric / NULLIF(a.receita_tecnica_cents, 0) * 100, 2) pct_recuperacao
FROM   finance.receita_tecnica_mensal a
LEFT JOIN finance.repasse_gdf_mensal  b ON b.competencia = a.competencia;
```

---

## 9. Próximos passos para integração

Quando o módulo de receita operacional entrar no roadmap (F3 prevista no `Leia/06_ROADMAP.md`):

### Modelo canônico proposto

```sql
-- Schema operational (novo) ou finance
CREATE TABLE finance.guia_viagem (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         INT NOT NULL,
  origem_sistema     VARCHAR(40) NOT NULL DEFAULT 'globus',
  cod_seq_guia       VARCHAR(40) NOT NULL,
  data_operacao      DATE NOT NULL,
  veiculo_id         UUID,
  garagem_id         INT,
  ultimo_sync_em     TIMESTAMPTZ,
  UNIQUE (origem_sistema, cod_seq_guia)
);
CREATE INDEX guia_viagem_data_idx ON finance.guia_viagem (data_operacao);

CREATE TABLE finance.movimento_diario (
  id                          BIGSERIAL PRIMARY KEY,
  empresa_id                  INT NOT NULL,
  data_operacao               DATE NOT NULL,
  garagem_id                  INT NOT NULL,
  linha_id                    UUID,
  qtd_passageiros_pagantes    INT NOT NULL DEFAULT 0,
  qtd_gratuidades             INT NOT NULL DEFAULT 0,
  valor_recebido_cents        BIGINT NOT NULL DEFAULT 0,
  receita_tecnica_cents       BIGINT NOT NULL DEFAULT 0,    -- pagantes × tarifa SEMOB
  tarifa_semob_aplicada_cents BIGINT NOT NULL,
  origem_sistema              VARCHAR(40) NOT NULL DEFAULT 'globus',
  origem_id_externo           VARCHAR(80) NOT NULL,
  ultimo_sync_em              TIMESTAMPTZ,
  UNIQUE (origem_sistema, origem_id_externo)
);

CREATE TABLE finance.frota_movimento (
  id                  BIGSERIAL PRIMARY KEY,
  empresa_id          INT NOT NULL,
  data_operacao       DATE NOT NULL,
  veiculo_id          UUID NOT NULL,
  prefixo             VARCHAR(20),
  qtd_passageiros     INT NOT NULL DEFAULT 0,
  qtd_por_grupo       JSONB,                  -- {col1: 1234, col2: 567, ...}
  valor_recebido_cents BIGINT NOT NULL DEFAULT 0,
  origem_sistema      VARCHAR(40) NOT NULL DEFAULT 'globus',
  origem_id_externo   VARCHAR(80) NOT NULL,
  ultimo_sync_em      TIMESTAMPTZ,
  UNIQUE (origem_sistema, origem_id_externo)
);

CREATE TABLE finance.tarifa_semob (...);  -- ver seção 6
```

### Endpoints REST previstos

```
GET  /api/arrecadacao/movimento-diario?mes=YYYY-MM&garagem=31
     → lista por dia + análise UT/SA/DO (query 1)

GET  /api/arrecadacao/frota?dtIni=YYYY-MM-DD&dtFim=YYYY-MM-DD&empIni=4&empFim=4
     → lista por veículo com quebra por tipo de pagamento (query 2)

GET  /api/arrecadacao/sumario-mes?mes=YYYY-MM
     → totais consolidados + comparativo Técnica vs Real (futuro)

GET  /api/arrecadacao/tarifas-semob
     → tabela histórica de tarifas (seção 6)

POST /api/arrecadacao/sync
     → puxa T_ARR_* do Oracle para o stage + ETL
```

### Auditoria

Toda visualização desses dados também passa por `audit.acesso_dados` (recurso = `arrecadacao` / `frota-movimento` / etc), pelo mesmo padrão da folha. Receita operacional **não é tão sensível quanto folha de funcionários** (não é dado pessoal LGPD), mas continua sendo dado **comercial estratégico** — IPK e ocupação são informações competitivas.

---

## 10. Glossário rápido

| Termo | Significado |
|---|---|
| **SEMOB-DF** | Secretaria de Mobilidade do DF — regulador tarifário |
| **STPC-DF** | Sistema de Transporte Público Coletivo do DF |
| **Bacia 2** | Subdivisão geográfica do STPC que a Pioneira opera |
| **IPK** | Índice de Passageiros por Km — métrica de produtividade |
| **Receita técnica** | Pax × Tarifa SEMOB (direito teórico) |
| **Receita real** | Repasse efetivo do GDF (após cálculos contratuais) |
| **Guia** | "Turno" — conjunto de viagens de um motorista num dia |
| **Bilhetagem** | Registro eletrônico de cada passageiro no validador |
| **Gratuidade** | Passageiro isento (idoso, deficiente, estudante) |
