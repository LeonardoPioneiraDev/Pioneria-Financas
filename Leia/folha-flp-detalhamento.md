# Folha de Pagamento — Detalhamento por Funcionário e Setor

**Autor:** Leonardo · **Empresa:** Viação Pioneira Ltda. · **Sistema:** GLOBUS (Praxio) · **Data:** maio/2026

> Este documento complementa `globus-tabelas-financeiras-documentacao.md` e descreve as tabelas da **folha de pagamento operacional** (FLP — Folha de Pagamento Praxio) usadas para gerar contra-cheques, totalizar por setor e auditar eventos por funcionário.

---

## 1. Por que duas visões de folha?

A Pioneira lida com duas perspectivas distintas sobre folha — fonte de confusão recorrente:

| Visão | Tabela origem | Granularidade | Quem usa |
|---|---|---|---|
| **Financeira (CPG)** | `CPGDOCTO` (com `COMPETENCIA_FLP` preenchido) | 1 título = 1 pagamento bancário consolidado | Tesouraria, conciliação bancária |
| **Operacional (FLP)** | `FLP_FICHAEVENTOS` + `FLP_EVENTOS` | 1 linha por evento por funcionário por competência | RH, supervisores de setor, auditoria |

**Exemplo prático para Maio/2026:**

- Lado **CPG** → 12 títulos de R$ 13.472,23 (1 transferência por banco / 1 GPS para INSS / 1 GRF para FGTS etc.)
- Lado **FLP** → ~30.000 linhas (3.000 funcionários × ~10 eventos médios cada: salário base, horas extras, INSS descontado, IRRF, vale-transporte, sindical, etc.)

A tela `/folha` atual lê do CPG (visão financeira). A nova tela `/folha-detalhe` lê do FLP (visão operacional) e permite quebrar por **setor (`CODAREA`/`DESCAREA`)**, **funcionário** e **evento**.

---

## 2. Tabelas envolvidas

### 2.1 `VW_FUNCIONARIOS`

View consolidada do cadastro de funcionários. **Não é tabela física** — é uma view que junta `FLP_FUNCIONARIOS` + cadastros de função, área, agência etc. Já vem com tudo "mastigado", então é o ponto de entrada preferido.

**Colunas principais (uso garantido pela query do Leonardo):**

| Coluna | Tipo provável | Significado |
|---|---|---|
| `CODINTFUNC` | NUMBER | PK interna — junta com `FLP_FICHAEVENTOS` |
| `CODFUNC` | NUMBER | Matrícula visível (a que aparece no holerite) |
| `NOMEFUNC` / `NOMECOMPLETOFUNC` | VARCHAR2 | Nome do funcionário |
| `CODAREA` | NUMBER | Código do setor / lotação |
| `DESCAREA` | VARCHAR2 | Descrição do setor (ex.: "Operação - Bacia 2", "Manutenção", "Administrativo") |
| `CODDEPTO` | NUMBER | Departamento (mais agrupado que área — ex.: 1000=Operação, 2000=Manutenção) |
| `DESCFUNCAO` | VARCHAR2 | Função (ex.: "Motorista", "Cobrador", "Mecânico", "Auxiliar Administrativo") |
| `CODAGENCIA` / `CONTACORFUNC` | VARCHAR2 | Conta bancária do funcionário (para crédito de salário) |
| `CODIGOEMPRESA` | NUMBER | Empresa (4 = Pioneira) |
| `CODIGOFL` | NUMBER | Filial (1 = principal) |

**Filtros padrão:** `CODIGOEMPRESA = 4 AND CODIGOFL = 1` para Pioneira.

### 2.2 `FLP_FICHAEVENTOS`

A **ficha financeira** — onde mora cada lançamento individual de folha.

| Coluna | Significado |
|---|---|
| `CODINTFUNC` | FK para `VW_FUNCIONARIOS` |
| `CODEVENTO` | FK para `FLP_EVENTOS` |
| `COMPETFICHA` | Data da competência da folha (ex.: `30-APR-2026` para folha de abril paga em maio) |
| `REFERENCIA` | Quantidade / horas / dias / referência do evento (ex.: 220h, 30 dias) |
| `VALORFICHA` | Valor em reais daquele evento para aquele funcionário |
| `TIPOFOLHA` | Subtipo da folha (1=mensal, 2=adiantamento, 3=13º, 4=férias, 5=rescisão — **confirmar com Pioneira**) |

**Chave natural:** `(CODINTFUNC, COMPETFICHA, CODEVENTO, TIPOFOLHA)` — confirmar depois.

### 2.3 `FLP_EVENTOS`

Catálogo de eventos da folha (os "verbas" do holerite).

| Coluna | Significado |
|---|---|
| `CODEVENTO` | Código numérico do evento |
| `DESCEVEN` | Descrição (ex.: "Salário Base", "Hora Extra 50%", "INSS", "Vale Transporte") |
| `TIPOEVEN` | `P` = Provento (soma) · `D` = Desconto (subtrai) · `B` = Base / Totalizador (não soma — apenas referência) |

**Eventos especiais (`TIPOEVEN = 'B'`) — identificados pela query do contra-cheque:**

| CODEVENTO | Significado | Fórmula |
|---|---|---|
| 300 | Base salarial | Salário-base do funcionário |
| 315 | Base INSS | Valor sobre o qual incide INSS |
| 318 | Total de proventos | SUM(P) |
| 319 | Total de descontos | SUM(D) |
| 322 | Base IRRF | Valor sobre o qual incide IRRF |
| 330 | Base FGTS | Valor sobre o qual incide FGTS |
| 500 | Total líquido | 318 − 319 |
| 503 | Adiantamento (proventos parciais) | Usado na geração do adiantamento (10% — ver query 2) |
| 508 | FGTS calculado | 8% sobre 330 |

> ⚠️ **Esses códigos são os identificados na query do Leonardo.** Confirmar com a equipe se há mais bases (ex.: base 13º, base férias). Vale rodar `SELECT CODEVENTO, DESCEVEN, TIPOEVEN FROM FLP_EVENTOS WHERE TIPOEVEN='B' ORDER BY CODEVENTO` no PL/SQL e mandar para mim — vou anexar aqui.

---

## 2.4 ⚠ Convenção de COMPETFICHA (importante para filtros)

A coluna `FLP_FICHAEVENTOS.COMPETFICHA` é a **data** que identifica a folha. **A Praxio usa duas convenções dependendo da instalação**:

| Convenção | Significado | Exemplo |
|---|---|---|
| **A — mês trabalhado** | Último dia do mês em que o funcionário trabalhou | Folha "de Maio" → `COMPETFICHA = 30/04/2026` (porque o mês trabalhado é Abril; a folha sai em Maio) |
| **B — mês pago** | Último dia do mês em que a folha foi processada | Folha "de Maio" → `COMPETFICHA = 31/05/2026` |

**Na Pioneira parece ser a convenção A** (comprovado pela query do Leonardo que filtra `30-APR-2026` e comenta "competência de maio"). Para nosso sistema **não importa qual é** — nossa adapter usa **range semi-aberto** que pega as duas:

```ts
// Para usuário selecionar competência YYYY-MM no UI:
const dtIni     = ultimo_dia_do_mes_anterior(YYYY-MM);  // 2026-04-30
const dtFimExcl = primeiro_dia_do_mes_seguinte(YYYY-MM); // 2026-06-01
// SQL filtro: WHERE COMPETFICHA >= :dt_ini AND COMPETFICHA < :dt_fim_excl
```

Assim, "Folha de Maio" busca `[30/04, 01/06)` e funciona em qualquer convenção.

**TIPOFOLHA** complementa o filtro: na mesma competência podem existir vários (mensal + adiantamento + 13º simultâneos). Códigos típicos:

| TIPOFOLHA | Significado |
|---|---|
| 1 | Mensal (regular) |
| 2 | Adiantamento |
| 3 | 13º Salário |
| 4 | Férias |
| 5 | Rescisão |

> ⚠ Confirmar com a Pioneira via:
> ```sql
> SELECT DISTINCT TIPOFOLHA, COUNT(*) qtd
> FROM   FLP_FICHAEVENTOS
> WHERE  COMPETFICHA >= TO_DATE('01/01/2026','DD/MM/YYYY')
> GROUP  BY TIPOFOLHA ORDER BY TIPOFOLHA;
> ```

---

## 3. Query 1 — Contra-cheque (holerite) de um funcionário

Mostra **todos os eventos P/D** de um funcionário em uma competência, mais os totalizadores agregados (PROVENTOS, DESCONTOS, bases, FGTS, líquido).

```sql
SELECT A.CODFUNC, A.DESCFUNCAO, A.NOMEFUNC, A.CODAREA, A.DESCAREA,
       A.CODEVENTO, A.DESCEVEN, A.TIPOEVEN, A.REFERENCIA, A.VALORFICHA,
       A.CODAGENCIA, A.CONTACORFUNC,
       A.PROVENTOS, A.DESCONTOS,
       A.BASESALARIAL, A.BASEINSS, A.BASEFGTS, A.FGTS, A.BASEIRRF,
       A.TOTALPROV, A.TOTALDESC, A.TOTALLIQ
FROM (
  SELECT F.CODFUNC, F.DESCFUNCAO, F.NOMEFUNC, F.CODAREA, F.DESCAREA,
         E.CODEVENTO, E.DESCEVEN, E.TIPOEVEN,
         FE.REFERENCIA, FE.VALORFICHA,
         F.CODAGENCIA, F.CONTACORFUNC,
         SUM(CASE WHEN E.TIPOEVEN='P' AND FE.VALORFICHA>0 THEN FE.VALORFICHA END)
           OVER (PARTITION BY E.DESCEVEN, E.TIPOEVEN) AS PROVENTOS,
         SUM(CASE WHEN E.TIPOEVEN='D' AND FE.VALORFICHA>0 THEN FE.VALORFICHA END)
           OVER (PARTITION BY E.DESCEVEN, E.TIPOEVEN) AS DESCONTOS,
         SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=300 THEN FE.VALORFICHA END) OVER() AS BASESALARIAL,
         SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=315 THEN FE.VALORFICHA END) OVER() AS BASEINSS,
         SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=330 THEN FE.VALORFICHA END) OVER() AS BASEFGTS,
         SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=508 THEN FE.VALORFICHA END) OVER() AS FGTS,
         SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=322 THEN FE.VALORFICHA END) OVER() AS BASEIRRF,
         SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=318 THEN FE.VALORFICHA END) OVER() AS TOTALPROV,
         SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=319 THEN FE.VALORFICHA END) OVER() AS TOTALDESC,
         SUM(CASE WHEN E.TIPOEVEN='B' AND E.CODEVENTO=500 THEN FE.VALORFICHA END) OVER() AS TOTALLIQ
  FROM VW_FUNCIONARIOS F, FLP_FICHAEVENTOS FE, FLP_EVENTOS E
  WHERE F.CODINTFUNC = FE.CODINTFUNC
    AND FE.CODEVENTO = E.CODEVENTO
    AND F.CODIGOEMPRESA = :empresa
    AND F.CODIGOFL = :filial
    AND FE.COMPETFICHA = :competencia    -- ex.: TO_DATE('30/04/2026','DD/MM/YYYY')
    AND F.CODFUNC = :cod_func
) A
WHERE A.TIPOEVEN IN ('P','D')
ORDER BY A.TIPOEVEN, A.CODEVENTO;
```

**Binds esperados:** `:empresa = 4`, `:filial = 1`, `:competencia = DATE`, `:cod_func = NUMBER`.

**Retorno:** uma linha por evento P/D do funcionário. As colunas de totalizadores (`PROVENTOS`, `DESCONTOS`, `BASESALARIAL`, `BASEINSS`, ...) **repetem em todas as linhas** porque vêm de window functions — o front-end deve pegar apenas o primeiro registro para exibir os totais e iterar as linhas para mostrar a tabela de eventos.

---

## 4. Query 2 — Geração de adiantamento (10% sobre evento 503)

Calcula adiantamento como **10% do valor lançado no `CODEVENTO=503` na folha de adiantamento (`TIPOFOLHA=2`)**, formatado em centavos com padding zero para layout de remessa bancária.

```sql
WITH EMPRESAS AS (
  SELECT EMP.CODIGOEMPRESA AS EMPRESA,
         AUE.RSOCIALEMPRESA AS RSEMPRESA,
         AUE.NOMEFANTASIAEMPRESA AS NFEMPRESA
  FROM CTR_CADEMP EMP
  JOIN CTR_EMPAUTORIZADAS AUE ON EMP.CODINTEMPAUT = AUE.CODINTEMPAUT
),
BASE AS (
  SELECT F.CODINTFUNC, F.CODFUNC, F.NOMECOMPLETOFUNC,
         E.RSEMPRESA, F.DESCFUNCAO,
         SUM(L.REFERENCIA) AS REFERENCIA,
         SUM(L.VALORFICHA) AS VALORFICHA,
         ROUND(SUM(L.VALORFICHA) * 0.10, 2) AS DIF   -- 10% do valor
  FROM VW_FUNCIONARIOS F
  JOIN FLP_FICHAEVENTOS L ON F.CODINTFUNC = L.CODINTFUNC
  JOIN EMPRESAS E ON E.EMPRESA = F.CODIGOEMPRESA
  WHERE L.COMPETFICHA = :competencia       -- TO_DATE('20/05/2026','DD/MM/YYYY')
    AND L.CODEVENTO = 503
    AND L.TIPOFOLHA IN (2)                 -- folha de adiantamento
    AND E.EMPRESA IN (:empresa)
    AND F.CODFUNC = :cod_func              -- opcional (omitir para todos)
  GROUP BY F.CODINTFUNC, F.CODFUNC, F.NOMECOMPLETOFUNC, E.RSEMPRESA, F.DESCFUNCAO
)
SELECT B.CODFUNC,
       B.VALORFICHA AS VLR_REAIS,
       B.DIF AS DIF_REAIS,
       LPAD(TO_CHAR(ROUND(B.DIF * 100)), 6, '0') AS DIF,
       LPAD(TO_CHAR(ROUND(B.VALORFICHA * 100)), 6, '0') AS VLR,
       B.CODFUNC || LPAD(TO_CHAR(ROUND(B.VALORFICHA * 100)), 6, '0') AS TXT,
       B.CODFUNC || LPAD(TO_CHAR(ROUND(B.DIF * 100)), 6, '0') AS TXT_DIF
FROM BASE B
ORDER BY B.CODFUNC;
```

**Uso:** gera o arquivo de remessa bancária do adiantamento (formato posicional). As colunas `TXT` / `TXT_DIF` já vêm prontas pra concatenar a linha do arquivo `.REM`.

> ⚠️ **TIPOFOLHA é a coluna chave para distinguir folhas mensais de adiantamentos / 13º / férias / rescisão.** Hoje na visão CPG essa distinção não existe — todos os títulos com `COMPETENCIA_FLP` preenchido são tratados igual. Quando puxarmos do FLP, essa quebra fica natural.

---

## 5. Visões/relatórios que pretendemos construir

A partir das tabelas FLP, vamos servir 4 telas:

### 5.1 Folha consolidada por setor

```
GET /api/folha-detalhe/setores?competencia=2026-04&tipoFolha=1

→ [{
    codArea: 1000, descArea: "Operação - Bacia 2",
    qtdFuncionarios: 1840,
    proventosCents: 924_500_00, descontosCents: 187_200_00, liquidoCents: 737_300_00,
    fgtsCents: 73_960_00, inssCents: 92_450_00,
    porFuncao: [
      { funcao: "Motorista", qtd: 1100, liquidoCents: 510_200_00 },
      { funcao: "Cobrador", qtd: 540, liquidoCents: 178_500_00 },
      ...
    ]
  }, ...]
```

### 5.2 Lista de funcionários da competência

```
GET /api/folha-detalhe/funcionarios?competencia=2026-04&codArea=1000&q=joao

→ [{ codFunc: 24121, nome: "João Silva", funcao: "Motorista", area: "Operação Bacia 2", liquidoCents: 320_500 }, ...]
```

### 5.3 Contra-cheque individual

```
GET /api/folha-detalhe/contra-cheque/24121?competencia=2026-04

→ {
    funcionario: { codFunc: 24121, nome, funcao, area, agencia, conta },
    eventos: [
      { codigo: 1, desc: "Salário Base", tipo: "P", referencia: 220, valorCents: 280_000 },
      { codigo: 15, desc: "INSS", tipo: "D", valorCents: 30_800 },
      ...
    ],
    totais: {
      baseSalarialCents, baseInssCents, baseFgtsCents, baseIrrfCents,
      fgtsCents, totalProventosCents, totalDescontosCents, totalLiquidoCents
    }
  }
```

### 5.4 Geração de arquivo de adiantamento (futuro)

Tela que dispara a query 2, mostra preview e exporta `.REM` no formato do banco da Pioneira.

---

## 6. Modelo canônico proposto (PostgreSQL local)

```sql
-- schema finance

CREATE TABLE finance.funcionarios (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         INT NOT NULL DEFAULT 1,
  origem_sistema     VARCHAR(40) NOT NULL DEFAULT 'globus',
  cod_int_func       VARCHAR(40) NOT NULL,     -- CODINTFUNC do Globus
  cod_func           VARCHAR(40) NOT NULL,     -- matrícula visível
  nome               VARCHAR(200) NOT NULL,
  cod_area           VARCHAR(20),
  desc_area          VARCHAR(200),
  cod_depto          VARCHAR(20),
  desc_funcao        VARCHAR(200),
  agencia            VARCHAR(20),
  conta_corrente     VARCHAR(30),
  ativo              BOOLEAN NOT NULL DEFAULT true,
  ultimo_sync_em     TIMESTAMPTZ,
  UNIQUE (origem_sistema, cod_int_func)
);
CREATE INDEX funcionarios_area_idx ON finance.funcionarios (cod_area);
CREATE INDEX funcionarios_nome_idx ON finance.funcionarios USING gin (nome gin_trgm_ops);

CREATE TABLE finance.eventos_folha (
  id                 SERIAL PRIMARY KEY,
  cod_evento         INT NOT NULL UNIQUE,
  descricao          VARCHAR(200) NOT NULL,
  tipo               CHAR(1) NOT NULL CHECK (tipo IN ('P','D','B')),  -- Provento, Desconto, Base
  grupo              VARCHAR(30)                                       -- 'salario', 'hora_extra', 'inss', 'irrf', 'fgts', 'vt', 'va', 'sindical', ...
);

CREATE TABLE finance.ficha_evento (
  id                 BIGSERIAL PRIMARY KEY,
  funcionario_id     UUID NOT NULL REFERENCES finance.funcionarios(id),
  cod_evento         INT NOT NULL REFERENCES finance.eventos_folha(cod_evento),
  competencia        DATE NOT NULL,            -- COMPETFICHA
  tipo_folha         INT NOT NULL,             -- 1=mensal, 2=adiantamento, 3=13o, 4=ferias, 5=rescisao
  referencia         NUMERIC(12,4),            -- horas / dias / quantidade
  valor_cents        BIGINT NOT NULL,          -- VALORFICHA * 100
  origem_sistema     VARCHAR(40) NOT NULL DEFAULT 'globus',
  origem_id_externo  VARCHAR(80) NOT NULL,     -- CODINTFUNC|COMPETFICHA|CODEVENTO|TIPOFOLHA
  ultimo_sync_em     TIMESTAMPTZ,
  UNIQUE (origem_sistema, origem_id_externo)
);
CREATE INDEX ficha_evento_comp_idx ON finance.ficha_evento (competencia, tipo_folha);
CREATE INDEX ficha_evento_func_idx ON finance.ficha_evento (funcionario_id, competencia);
```

---

## 7. API REST implementada (`/api/folha-detalhe/*`)

Todas as rotas requerem `Bearer JWT` e role em (`admin`, `cfo`, `controller`, `rh`).

### 7.1 `GET /setores?competencia=YYYY-MM&tipoFolha={1..5}` (opcional)

Folha consolidada por setor com quebra por função e totais gerais. **Filtro de competência usa range semi-aberto** (cobre as 2 convenções Praxio — ver seção 2.4).

```jsonc
{
  "competencia": "2026-05",
  "tipoFolha": null,
  "totais": {
    "qtdSetores": 8, "qtdFuncionarios": 3012,
    "proventosCents": 1234500000, "descontosCents": 234500000,
    "liquidoCents": 1000000000,
    "inssCents": 92450000, "fgtsCents": 73960000, "irrfCents": 18500000,
    "vtCents": 30200000, "vaCents": 45100000
  },
  "setores": [
    {
      "codArea": "1000", "descArea": "Operação - Bacia 2",
      "qtdFuncionarios": 1840,
      "proventosCents": 920500000, "descontosCents": 183200000, "liquidoCents": 737300000,
      "inssCents": 65400000, "fgtsCents": 51380000, "irrfCents": 8200000,
      "vtCents": 22100000, "vaCents": 30200000,
      "porFuncao": [
        { "descFuncao": "Motorista", "qtdFuncionarios": 1100, "liquidoCents": 510200000 },
        { "descFuncao": "Cobrador",  "qtdFuncionarios": 540,  "liquidoCents": 178500000 }
      ]
    }
  ],
  "syncInfo": {
    "ultimoSyncEm": "2026-05-14T15:24:11.000Z",
    "totalFuncionarios": 3012, "totalFichas": 31875,
    "precisaSincronizar": false
  }
}
```

### 7.2 `GET /funcionarios?competencia=YYYY-MM&codArea=...&busca=...&pagina=1&porPagina=50`

Lista paginada de funcionários com sumário individual (proventos / descontos / líquido).

```jsonc
{
  "competencia": "2026-05", "total": 1840, "pagina": 1, "porPagina": 50, "totalPaginas": 37,
  "itens": [
    { "id": "uuid", "codFunc": "24121", "nome": "João Silva",
      "codArea": "1000", "descArea": "Operação - Bacia 2", "descFuncao": "Motorista",
      "proventosCents": 380000, "descontosCents": 59800, "liquidoCents": 320200 }
  ]
}
```

### 7.3 `GET /contra-cheque/:codFunc?competencia=YYYY-MM&tipoFolha={1..5}` (opcional)

**Holerite completo** de um funcionário em uma competência. Retorna:
- **Cabeçalho**: id, matrícula, nome, função, área, agência, conta corrente
- **Proventos** (TIPOEVEN='P'): lista com codEvento, descricao, grupo, referencia, valorCents
- **Descontos** (TIPOEVEN='D'): mesma estrutura
- **Totais** com **bases calculadas** a partir dos eventos B do FLP:

```jsonc
{
  "funcionario": {
    "id": "uuid", "codFunc": "24121", "nome": "João Silva da Costa",
    "descFuncao": "Motorista", "descArea": "Operação - Bacia 2",
    "agencia": "0001", "contaCorrente": "12345-6"
  },
  "competencia": "2026-05", "tipoFolha": 1,
  "proventos": [
    { "codEvento": 1,  "descricao": "Salário Base",     "tipo": "P", "grupo": "salario",     "referencia": 220.00, "valorCents": 320000 },
    { "codEvento": 10, "descricao": "Hora Extra 50%",   "tipo": "P", "grupo": "hora_extra",  "referencia": 12.50,  "valorCents": 15625 },
    { "codEvento": 25, "descricao": "Adicional Noturno","tipo": "P", "grupo": "adic_noturno","referencia": 40.00,  "valorCents": 8000  }
  ],
  "descontos": [
    { "codEvento": 100, "descricao": "INSS",              "tipo": "D", "grupo": "inss",     "referencia": null, "valorCents": 30800 },
    { "codEvento": 105, "descricao": "IRRF",              "tipo": "D", "grupo": "irrf",     "referencia": null, "valorCents": 5400  },
    { "codEvento": 120, "descricao": "Vale Transporte",   "tipo": "D", "grupo": "vt",       "referencia": null, "valorCents": 9600  },
    { "codEvento": 130, "descricao": "Contrib. Sindical", "tipo": "D", "grupo": "sindical", "referencia": null, "valorCents": 1500  }
  ],
  "totais": {
    "proventosCents": 343625,     // soma dos P
    "descontosCents": 47300,      // soma dos D
    "liquidoCents":   296325,     // P - D
    "baseInssCents":  343625,     // CODEVENTO=315 (Base INSS) do FLP_FICHAEVENTOS
    "baseFgtsCents":  343625,     // CODEVENTO=330 (Base FGTS)
    "baseIrrfCents":  312825,     // CODEVENTO=322 (Base IRRF)
    "fgtsCents":      27490       // CODEVENTO=508 (8% sobre 330)
  }
}
```

**Fórmulas implícitas** (calculadas pela Praxio e armazenadas como eventos `B`):
- Base INSS = salário base + adicionais + comissões + horas extras (variáveis) − benefícios não tributáveis
- Base FGTS = Base INSS + adicionais tributáveis pelo FGTS (gratificações, prêmios)
- Base IRRF = Base INSS − INSS descontado − dependentes (R$ 189,59 × n) − pensão alimentícia
- FGTS calculado = Base FGTS × 8% (depósito mensal pago pela empresa, **não é desconto** do funcionário)

**Uso para impressão**: o frontend renderiza essa estrutura no formato holerite tradicional (cabeçalho da empresa + identificação do funcionário + 2 colunas de eventos P/D + rodapé com totais + bases). Cada abertura desta rota é **auditada** em `audit.acesso_dados` com `acao=visualizou, recurso=contra-cheque, recursoId=:codFunc`.

### 7.4 `GET /eventos`

Catálogo completo das verbas da folha — útil pra UI montar legendas, filtros, glossário.

### 7.5 `GET /diagnostico`

Estado da integração (usado pelo empty state da UI):

```jsonc
{
  "stage":     { "funcionarios": 3012, "eventos": 487, "fichas": 31875, "fichasPendentes": 0 },
  "canonical": { "funcionarios": 3012, "eventos": 487, "fichas": 31875 },
  "competenciasDisponiveis": [
    { "competencia": "2026-04-30", "tipoFolha": 1, "qtdLancamentos": 31875, "qtdFuncionarios": 3012, "somaCents": "12345678900" },
    { "competencia": "2026-04-20", "tipoFolha": 2, "qtdLancamentos": 3012,  "qtdFuncionarios": 3012, "somaCents": "1234567800"  }
  ],
  "ultimoJob": {
    "id": "...", "status": "ok", "iniciadoEm": "...", "terminadoEm": "...",
    "registrosLidos": 35374, "registrosGravados": 35374, "registrosComErro": 0,
    "parametros": { "empresa": 4, "filial": 1, "competencia": "2026-05", "dtIni": "2026-04-30", "dtFimExcl": "2026-06-01", "tipoFolha": null }
  }
}
```

### 7.6 `POST /sync` `{ competencia: "YYYY-MM", tipoFolha?: 1..5 }`

Sincroniza FLP do Globus + roda ETL. Rate-limit 3 chamadas / 5 min.

---

## 8. Modelo canônico (já aplicado em PostgreSQL)

Aplicado pela migration `1700000008000-folha-flp.ts`:

- **Stage** (`integration.*_stage`): preserva o raw do Oracle como JSONB, upsert idempotente
  - `globus_flp_func_stage` — chave `(codigo_empresa, cod_int_func)`
  - `globus_flp_evento_stage` — chave `cod_evento`
  - `globus_flp_ficha_stage` — chave `(cod_int_func, competencia, cod_evento, tipo_folha)`
- **Canonical** (`finance.*`):
  - `funcionarios` (UUID PK, índice trigram em `nome`)
  - `eventos_folha` (cod_evento PK, coluna `grupo` populada pelo ETL)
  - `ficha_evento` (BIGSERIAL PK, FK para funcionarios + eventos_folha, valor em centavos BIGINT)

**Classificação automática de grupo** (ETL `folha-flp.etl.ts`, função `classificarGrupoEvento`):
20 grupos detectados por regex sobre `DESCEVEN`: `salario`, `hora_extra`, `adic_noturno`, `insalubridade`, `periculosidade`, `inss`, `fgts`, `irrf`, `vt`, `va`, `sindical`, `pensao`, `adiantamento`, `ferias`, `decimo_terceiro`, `rescisao`, `premio`, `comissao`, `falta`, `saude`, `consignado`, `base` (TIPOEVEN=B), `outros_proventos`, `outros_descontos`.

---

## 9. Auditoria LGPD

Toda navegação em `/folha-detalhe` é registrada em `audit.acesso_dados` com `usuario_id`, `recurso`, `recurso_id` (cod_func quando abre contra-cheque), `acao` (visualizou / imprimiu / exportou / filtrou / sincronizou), IP, user-agent, timestamp (fuso de Brasília via `audit.criado_em`) e filtros aplicados (competência, tipo, área, busca).

Antes do primeiro acesso o usuário aceita o **Termo de Comprometimento** (`audit.termo_aceite`) — versão atual `2026.05.1`. Para forçar re-aceite quando o texto mudar, basta incrementar `VERSAO_TERMO_ATUAL` em `packages/shared/src/schemas/audit.ts`.
