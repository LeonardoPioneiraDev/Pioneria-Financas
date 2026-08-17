# Depreciação — SQL completo (exploração + produção)

> Referência única de **todo o SQL** do módulo Depreciação: as 4 rodadas de
> exploração no Oracle do Globus (com o resultado de cada bloco) + a query que
> ficou em produção. Fonte de verdade do mapeamento narrativo:
> [`depreciacao-mapeamento.md`](depreciacao-mapeamento.md).
>
> Convenções Globus (ver [`globus.queries.ts`](../apps/FinancasBackend/src/integrations/globus/globus.queries.ts)):
> empresa Pioneira = `4`; hint `/*+ NO_PARALLEL */` sempre (Oracle compartilhado
> com a operação); `PERIODOSALDO` é `CHAR(6)` no formato `AAAAMM`.

---

## 0. Query de PRODUÇÃO — `depreciacaoContabil`

A que o módulo usa. Lê o saldo contábil mensal (`CTBSALDO`) das famílias de
imobilizado/depreciação, juntando `CTBCONTA` pra trazer o classificador pontilhado
e o nome. Toda a história (tabela é agregado mensal, pequena). Bind: `:empresa`.

```sql
SELECT /*+ NO_PARALLEL */
  S.CODIGOEMPRESA          AS CODIGO_EMPRESA,
  S.PERIODOSALDO           AS PERIODO,
  S.NROPLANO               AS NRO_PLANO,
  S.CODCONTACTB            AS COD_CONTA_CTB,
  C.CLASSIFICADOR          AS CLASSIFICADOR,
  C.NOMECONTA              AS NOME_CONTA,
  SUM(S.VLDEBITOSALDO)     AS VL_DEBITO,
  SUM(S.VLCREDITOSALDO)    AS VL_CREDITO
FROM   CTBSALDO S
JOIN   CTBCONTA C ON C.CODCONTACTB = S.CODCONTACTB AND C.NROPLANO = S.NROPLANO
WHERE  S.CODIGOEMPRESA = :empresa
  AND (C.CLASSIFICADOR LIKE '3.1.02.07%'   -- despesa de depreciacao
    OR C.CLASSIFICADOR LIKE '1.3.02.01%'   -- imobilizado bruto (proprio)
    OR C.CLASSIFICADOR LIKE '1.3.02.02%'   -- direito de uso (arrend mercantil)
    OR C.CLASSIFICADOR LIKE '1.3.02.50%'   -- depreciacao acumulada
    OR C.CLASSIFICADOR LIKE '1.3.02.51%')  -- deprec acumulada de direito de uso
GROUP BY S.CODIGOEMPRESA, S.PERIODOSALDO, S.NROPLANO, S.CODCONTACTB,
         C.CLASSIFICADOR, C.NOMECONTA
ORDER BY S.PERIODOSALDO DESC, C.CLASSIFICADOR;
```

**Por que agregar (`SUM` + `GROUP BY`):** a PK do `CTBSALDO` inclui `CODTPLNC` e
`CODIGOFL`, então há várias linhas por conta/período — somamos pra ter o total
consolidado da conta no mês (todas as filiais). Contas sintéticas (`.0000`, que
repetem a soma dos filhos) vêm na leitura mas o ETL descarta pra não duplicar.

### Como o ETL classifica cada linha
- **grupo** (prefixo do `CLASSIFICADOR`): `3.1.02.07`→despesa · `1.3.02.01`→imobilizado_bruto ·
  `1.3.02.02`→direito_uso · `1.3.02.50`/`1.3.02.51`→deprec_acumulada.
- **classe** (último segmento): `1501`→frota_operacional · `1508`→caminhoes ·
  `6301`→veiculos_auxiliares · `0602`→computadores · `2401`→instalacoes ·
  `3601`→maquinas_oficina · `3602`→maquinas_escritorio · `3603`→moveis ·
  nome com TERRENO/CASA/LOTE/IMÓVEL→imoveis · resto→outros.
- **valor_cents**: despesa e base = `débito − crédito`; acumulada (redutora) = `crédito − débito`.

---

## 1. Rodada 1 — mapear frota + achar se a depreciação já existe

Arquivo: [`sql-exploracao/2026-07-03-depreciacao-rodada-1.sql`](../sql-exploracao/2026-07-03-depreciacao-rodada-1.sql)

### A1/A2 — estrutura das tabelas (metadado)
```sql
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, DATA_PRECISION, DATA_SCALE, NULLABLE, COLUMN_ID
FROM   ALL_TAB_COLUMNS
WHERE  OWNER = 'GLOBUS'
  AND  TABLE_NAME IN ('FRT_CADVEICULOS','FRT_COMPRAVEIC','FRT_TIPODEFROTA','FRT_MARCACARROC','FRT_MODCARROC');
-- + CTBITLNC (item do lançamento contábil)
```
**Resultado:** `FRT_CADVEICULOS` (81 cols): `CODIGOVEIC` PK, `PREFIXOVEIC`, `PLACAATUALVEIC`,
`DTINICIOUTILVEIC`, `CODIGOTPFROTA`, `CODIGOGA` (garagem), `CODCUSTOFIN`, `CODIGOEMPRESA/FL`.
`CTBITLNC`: `VRITEMLANCA` (valor 15,2), `DEBITOCREDITOITEMLANCA`, `CODCONTACTB`, `CODCUSTO`, `HISTORICOITEMLANCA`.

### B1–B3 — amostras (`SELECT * ... WHERE ROWNUM <= 20`)
Veículos com prefixo/placa/`CONDICAOVEIC`; categorias de frota:
`RODOVIARIO, URBANO BÁSICO, URBANO ARTICULADO, URBANO MICRO, ESCOLAR, CARRO DE APOIO, ...`.

### C1/C2 — volumetria da frota
```sql
SELECT COUNT(*) FROM FRT_CADVEICULOS;                        -- 3.515 (grupo)
SELECT COUNT(*) FROM FRT_CADVEICULOS WHERE CODIGOEMPRESA=4;  -- 2.143 (Pioneira)
```

### D1 — contas de depreciação/imobilizado no plano
```sql
SELECT C.NROPLANO, C.CODCONTACTB, C.CLASSIFICADOR, C.NOMECONTA
FROM   CTBCONTA C
WHERE  UPPER(C.NOMECONTA) LIKE '%DEPREC%'
    OR UPPER(C.NOMECONTA) LIKE '%IMOBILIZ%'
    OR UPPER(C.NOMECONTA) LIKE '%AMORTIZ%'
ORDER BY C.CLASSIFICADOR;
```
**Resultado (contas-chave):** `14500 = 1.3.02.50` depreciação acumulada · `31500 = 3.1.02.07`
despesa de depreciação · `13901 = 1.3.02.01` imobilizado valor original · `1.3.02.51` direito de uso.

### D2 — a depreciação está lançada? (saldo mensal)
```sql
SELECT S.PERIODOSALDO, S.CODCONTACTB, C.NOMECONTA,
       SUM(S.VLDEBITOSALDO) AS TOTAL_DEBITO, SUM(S.VLCREDITOSALDO) AS TOTAL_CREDITO
FROM   CTBSALDO S
JOIN   CTBCONTA C ON C.CODCONTACTB=S.CODCONTACTB AND C.NROPLANO=S.NROPLANO
WHERE  S.CODIGOEMPRESA=4
  AND (UPPER(C.NOMECONTA) LIKE '%DEPREC%' OR UPPER(C.NOMECONTA) LIKE '%AMORTIZ%')
  AND  S.PERIODOSALDO >= TO_CHAR(ADD_MONTHS(SYSDATE,-12),'YYYYMM')
GROUP BY S.PERIODOSALDO, S.CODCONTACTB, C.NOMECONTA
ORDER BY S.PERIODOSALDO DESC, S.CODCONTACTB;
```
**Resultado:** SIM — despesa na `31500` ≈ **R$ 38.958,37/mês** (202605), casando com crédito na `14500`.
Meses 202606+ zerados = fechamento não rodado (hoje jul/2026).

### E1 — ⚠️ bug: filtrei `PERIODOSALDO = MAX(...)`, que pega período futuro vazio → tudo zero. Corrigido na rodada 2.

### F1 — inventário de tabelas de ativo/depreciação
```sql
SELECT TABLE_NAME FROM ALL_TABLES
WHERE  OWNER='GLOBUS'
  AND (TABLE_NAME LIKE '%IMOBIL%' OR TABLE_NAME LIKE '%PATRIM%' OR TABLE_NAME LIKE '%DEPREC%'
    OR TABLE_NAME LIKE '%ATIVO%' OR TABLE_NAME LIKE 'ATV\_%' ESCAPE '\' OR TABLE_NAME LIKE 'AIM\_%' ESCAPE '\')
  AND  TABLE_NAME NOT LIKE '%\_BAK' ESCAPE '\' ...;
```
**Resultado ⭐:** revelou o módulo de Ativo Fixo do Globus — `ATF_DEPRECIACAO`, `ATFITEM_DEPRECMES`,
`FRE_TABELADEPRECO`.

---

## 2. Rodada 2 — mapear o ATF + corrigir o E1

Arquivo: [`sql-exploracao/2026-07-03-depreciacao-rodada-2.sql`](../sql-exploracao/2026-07-03-depreciacao-rodada-2.sql)

### G1b — inventário completo `ATF_*`
```sql
SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER='GLOBUS' AND TABLE_NAME LIKE 'ATF%' ORDER BY 1;
```
**Resultado:** `ATFITEM` (o bem), `ATF_AQUISICOES`, `ATFITEM_DEPRECMES`, `ATFITEMCOMPRAVEIC`, `ATFMOVTO`, ...

### H1/H2/I1 — o ATF está populado?
```sql
SELECT * FROM ATF_DEPRECIACAO   WHERE ROWNUM <= 20;   -- VAZIO
SELECT * FROM ATFITEM_DEPRECMES WHERE ROWNUM <= 20;   -- VAZIO
SELECT COUNT(*) FROM ATFITEM_DEPRECMES;               -- 0
```
**Resultado decisivo:** a rotina de depreciação do Globus **não é usada** → a depreciação é
calculada por fora (planilha) e só o resultado é lançado na contabilidade.

### I2 — despesa mensal por conta (família 3.1.02.07), 18 meses
```sql
SELECT S.PERIODOSALDO, C.CLASSIFICADOR, C.NOMECONTA,
       SUM(S.VLDEBITOSALDO) AS DESPESA_DEBITO, SUM(S.VLCREDITOSALDO) AS DESPESA_CREDITO
FROM   CTBSALDO S
JOIN   CTBCONTA C ON C.CODCONTACTB=S.CODCONTACTB AND C.NROPLANO=S.NROPLANO
WHERE  S.CODIGOEMPRESA=4
  AND  C.CLASSIFICADOR LIKE '3.1.02.07%'
  AND  S.PERIODOSALDO BETWEEN TO_CHAR(ADD_MONTHS(SYSDATE,-18),'YYYYMM')
                          AND TO_CHAR(ADD_MONTHS(SYSDATE,-1),'YYYYMM')
GROUP BY S.PERIODOSALDO, C.CLASSIFICADOR, C.NOMECONTA
ORDER BY S.PERIODOSALDO DESC, C.CLASSIFICADOR;
```
**Resultado:** total ~R$ 34–39k/mês. `FROTA OPERACIONAL` R$ 7–10k/mês, `VEÍCULOS AUXILIARES` R$ 5,5k,
`INSTALAÇÕES` R$ 6,95k fixos, etc. (dezembro traz crédito de encerramento).

### J1 — saldo em aberto do imobilizado (corrige E1: soma histórica, não MAX)
```sql
SELECT C.CLASSIFICADOR, C.NOMECONTA, SUM(S.VLDEBITOSALDO - S.VLCREDITOSALDO) AS SALDO_ATUAL
FROM   CTBSALDO S
JOIN   CTBCONTA C ON C.CODCONTACTB=S.CODCONTACTB AND C.NROPLANO=S.NROPLANO
WHERE  S.CODIGOEMPRESA=4
  AND (C.CLASSIFICADOR LIKE '1.3.02.01%' OR C.CLASSIFICADOR LIKE '1.3.02.02%'
    OR C.CLASSIFICADOR LIKE '1.3.02.50%' OR C.CLASSIFICADOR LIKE '1.3.02.51%')
GROUP BY C.CLASSIFICADOR, C.NOMECONTA
HAVING SUM(S.VLDEBITOSALDO - S.VLCREDITOSALDO) <> 0
ORDER BY C.CLASSIFICADOR;
```
**Resultado (base patrimonial):** imobilizado bruto **R$ 109,77M** (frota própria R$ 101,77M),
direito de uso/arrend mercantil **R$ 100,83M**, depreciação acumulada **-R$ 113,19M**.

### K1 — drill de um lançamento de depreciação real
```sql
SELECT L.CODLANCA, L.DTLANCA, I.CODCONTACTB, C.CLASSIFICADOR, C.NOMECONTA,
       I.DEBITOCREDITOITEMLANCA, I.VRITEMLANCA, I.CODCUSTO, SUBSTR(I.HISTORICOITEMLANCA,1,200) AS HISTORICO
FROM   CTBLANCA L
JOIN   CTBITLNC I ON I.CODLANCA=L.CODLANCA
JOIN   CTBCONTA C ON C.CODCONTACTB=I.CODCONTACTB AND C.NROPLANO=I.NROPLANO
WHERE  L.CODIGOEMPRESA=4 AND C.CLASSIFICADOR LIKE '3.1.02.07%'
  AND  L.DTLANCA >= ADD_MONTHS(TRUNC(SYSDATE,'MM'),-3) AND ROWNUM <= 30
ORDER BY L.DTLANCA DESC;
```
**Resultado:** 1 lançamento/mês (ex.: `CODLANCA 955961`, 31/05/2026) com ~7 itens D, um por classe,
histórico "DEPRECIAÇÃO - NO MÊS dd/mm/aaaa". Confirma: escrituração manual por classe.

---

## 3. Rodada 3 — existe cadastro de bens?

Arquivo: [`sql-exploracao/2026-07-03-depreciacao-rodada-3.sql`](../sql-exploracao/2026-07-03-depreciacao-rodada-3.sql)

### L1 — estrutura `ATFITEM`
**Resultado:** `CODIGO` PK, `CONTA`, `PATRIMONIO`, `DESCRICAO`, **`AQUISVALOR`** (13,2), **`AQUISDATA`**,
**`TAXADEPREC`** (7,4), **`INICIODEPREC`**, **`DATABAIXA`** + `VLRBAIXA`/`HISTBAIXA`, `CODIGOEMPRESA/FL`.

### L2 — populado?
```sql
SELECT 'ATFITEM' AS TABELA, COUNT(*) FROM ATFITEM
UNION ALL SELECT 'ATF_AQUISICOES', COUNT(*) FROM ATF_AQUISICOES
UNION ALL SELECT 'ATFITEMCOMPRAVEIC', COUNT(*) FROM ATFITEMCOMPRAVEIC;
```
**Resultado:** `ATFITEM` = **7.686** · `ATF_AQUISICOES` = 0 · `ATFITEMCOMPRAVEIC` = 1.509.
→ o cadastro de bens EXISTE, com valor/taxa/datas por bem. `TAXADEPREC` na amostra = **20% (5 anos)**.

### M1 — ❌ correção: `3.2.02.05` NÃO é depreciação de arrendamento, é "NÃO DEDUTÍVEIS" (multas de
trânsito, brindes). A depreciação do arrendamento é assunto do controller, não de SQL.

---

## 4. Rodada 4 — o `ATFITEM` está vivo? (decide A × B)

Arquivo: [`sql-exploracao/2026-07-03-depreciacao-rodada-4.sql`](../sql-exploracao/2026-07-03-depreciacao-rodada-4.sql)

### N1 — freshness
```sql
SELECT COUNT(*) TOTAL, COUNT(CASE WHEN DATABAIXA IS NULL THEN 1 END) ATIVOS,
       MIN(AQUISDATA), MAX(AQUISDATA), MIN(INICIODEPREC), MAX(INICIODEPREC), MAX(DATABAIXA)
FROM   ATFITEM WHERE CODIGOEMPRESA=4;
```
**Resultado:** 2.492 bens / **1.066 ativos**; aquisições até **24/06/2026**, `INICIODEPREC` até
01/07/2026 → **cadastro mantido em dia**.

### N2 — taxas (vida útil) dos ativos
```sql
SELECT TAXADEPREC, COUNT(*) QTD_ATIVOS, ROUND(SUM(AQUISVALOR),2) VLR_AQUISICAO
FROM   ATFITEM WHERE CODIGOEMPRESA=4 AND DATABAIXA IS NULL
GROUP BY TAXADEPREC ORDER BY QTD_ATIVOS DESC;
```
**Resultado:** 20% (5 anos) = 796 bens / R$ 152,25M (frota) · 10% (10 anos) = 218 · 0% (terrenos) = 31 · 30% = 6.

### N3/N4 — reconciliação com a contabilidade
```sql
SELECT CONTA, COUNT(*) QTD_BENS, ROUND(SUM(AQUISVALOR),2) VLR_AQUISICAO
FROM   ATFITEM WHERE CODIGOEMPRESA=4 AND DATABAIXA IS NULL GROUP BY CONTA ORDER BY 3 DESC;

SELECT COUNT(*) QTD_BENS_ATIVOS, ROUND(SUM(AQUISVALOR),2) VLR_AQUISICAO_TOTAL
FROM   ATFITEM WHERE CODIGOEMPRESA=4 AND DATABAIXA IS NULL;
```
**Resultado:** total ativo = **R$ 156,62M**. A R$ 152M a 20% dariam ~R$ 2,5M/mês, mas o contabilizado é
~R$ 34–39k/mês → **a maior parte da frota já passou dos 5 anos e está 100% depreciada**; um cálculo por
bem (opção B) precisa aplicar o teto (para em 100%, via `INICIODEPREC + TAXADEPREC`).

---

## 5. Números-âncora (pra conferência com o contador)

| Métrica | Valor | Fonte |
|---|---|---|
| Veículos empresa 4 | 2.143 | `FRT_CADVEICULOS` |
| Bens ativos (ATFITEM) | 1.066 | rodada 4 N4 |
| Vida útil ônibus | 5 anos (20%/ano) | `ATFITEM.TAXADEPREC` |
| Despesa depreciação/mês | ~R$ 34–39k | `CTBSALDO 3.1.02.07.*` |
| Imobilizado bruto | R$ 109,77M | `CTBSALDO 1.3.02.01.*` |
| Direito de uso (arrend) | R$ 100,83M | `CTBSALDO 1.3.02.02.*` |
| Depreciação acumulada | -R$ 113,19M | `CTBSALDO 1.3.02.50.*` |

Quando o módulo popular (após migration + sync), a tela `/depreciacao` deve reproduzir estes números.
Divergência = investigar antes de dar como pronto.
