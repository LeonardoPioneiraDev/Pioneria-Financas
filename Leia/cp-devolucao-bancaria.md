# Contas a Pagar — Pagamento devolvido pelo banco (retentativa)

Follow-up do SFN-48 ("retorno bancário não tratado"). Constatado na reunião de sprint de
**12/06/2026** com o financeiro e confirmado com consultas no Globus.

## O fenômeno

O banco **aceita** o arquivo de pagamento eletrônico → o Globus já grava o título como
**pago** (`STATUSPE='PG'`, `PAGAMENTOCPG` preenchida, `STATUSDOCTOCPG='B'`). Mas se o banco
**não liquida**, o dinheiro **volta** (devolução) e o título é **refeito** por outro borderô.
O título devolvido fica com **`QUITADODOCTOCPG='N'`** (não compensou).

Isso inflava o sistema de dois jeitos:
1. **"Foi pago" (perna A)** contava o título devolvido + o refeito → mesmo valor 2×.
2. **"Total movimento"** somava o débito devolvido mas **não subtraía** o crédito de
   devolução (que escapava do filtro despesa/CP) → caixa inflado.

## Assinatura nos dados (confirmada)

- **Devolução = crédito no extrato (`banco_movto`) com `cod_histo_bco IN (10, 541)`** —
  10 = "DOC DEVOLVIDO", 541 = "CHEQUE DEVOLVIDO" (BCOHISTO). É um crédito (`debito_credito='C'`)
  de mesmo valor, mesma conta, casando um débito de pagamento.
- **Discriminador do título = `QUITADO` real do Globus**. O ETL antigo marcava
  `quitado=true` só por ter data de pagamento, mascarando o `N`. Passamos a guardar o
  QUITADO real em **`contas_pagar.quitado_globus`** (sem o override de data).
- Raro: em junho/2026 só 2 devoluções (R$ 1.120 em 03/06 e R$ 8.000 em 10/06).

### Query que achou as devoluções (par débito↔crédito)

```sql
SELECT D.CODMOVTOBCO AS DEB_ID, D.DTMOVTOBCO AS DEB_DT, D.VLMOVTOBCO AS DEB_VLR, D.DOCMOVTOBCO,
       C.CODMOVTOBCO AS CRE_ID, C.DTMOVTOBCO AS CRE_DT, C.VLMOVTOBCO AS CRE_VLR, HC.DESCHISTOBCO
FROM BCOMOVTO D
JOIN BCOHISTO HD ON HD.CODHISTOBCO=D.CODHISTOBCO AND HD.CODIGOEMPRESA=D.CODIGOEMPRESA AND HD.CODIGOFL=D.CODIGOFL
JOIN BCOMOVTO C ON C.CODIGOEMPRESA=D.CODIGOEMPRESA
  AND C.CODBANCO=D.CODBANCO AND C.CODAGENCIA=D.CODAGENCIA AND C.CODCONTABCO=D.CODCONTABCO
  AND ABS(C.VLMOVTOBCO)=ABS(D.VLMOVTOBCO)
  AND C.DTMOVTOBCO BETWEEN D.DTMOVTOBCO AND D.DTMOVTOBCO + 15 AND C.CODMOVTOBCO <> D.CODMOVTOBCO
JOIN BCOHISTO HC ON HC.CODHISTOBCO=C.CODHISTOBCO AND HC.CODIGOEMPRESA=C.CODIGOEMPRESA AND HC.CODIGOFL=C.CODIGOFL
WHERE D.CODIGOEMPRESA=4 AND HD.DEBCREDHISTBCO='D' AND HC.DEBCREDHISTBCO='C'
  AND D.DTMOVTOBCO >= DATE '2026-06-01' AND D.DTMOVTOBCO < DATE '2026-07-01';
```

### Exemplo confirmado (recibo AVULSO 1.120)

- `3577871765` — pago 03/06 (`STATUSPE='PG'`, `QUITADO='N'`), movimento PE-000003 — **devolvido no mesmo dia** ("DOC DEVOLVIDO").
- `3577871764` — pago 05/06 (`QUITADO='S'`, borderô BO-010438) — **o pagamento real**.
- "Total movimento" caía de R$ 2.276.487,24 → **R$ 2.275.367,24** (= o que o banco mostra), netando o 1.120.

## Implementado

- Coluna `contas_pagar.quitado_globus` (migration `1700000035000`).
- Detector `DEVOLVIDO_SQL_CP` no service: `quitado_globus=false AND não substituído AND
  data_pagamento NOT NULL AND EXISTS(crédito DOC/CHEQUE DEVOLVIDO casando conta+valor+data ±10d)`.
- Devolvidos **saem do "Foi pago"**; `movimentoDia`/`movimentoBanco` **netam** a devolução (categoria `devolucao`).
- UI: selo azul **"↩ Devolvido · refeito"** na lista + faixa no `DetalheCpDialog` + legenda de cores.

Ver `memory/cp-devolucao-bancaria-retentativa.md`.
