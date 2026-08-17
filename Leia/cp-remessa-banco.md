# Contas a Pagar — Remessa enviada ao banco

Pedido do financeiro: ao abrir um título pago, mostrar **em qual remessa ele foi enviado ao
banco** — porque o pagamento não é feito um a um; mandam vários documentos de uma vez (um
arquivo de remessa). Investigado no dicionário de dados do Globus (jun/2026).

## Fonte no Globus

- **`CPGDOCTO.NROREMESSAPE`** (VARCHAR 10) + **`DTREMESSAPE`** (DATE com hora) = a remessa do
  título. Cabeçalho em **`CPGREMESSAPE`** (CODBANCO, CODAGENCIA, CODCONTABCO, DTREMESSAPE,
  NROREMESSAPE, TIPOREMESSA).
- **Chave real = conta (banco+agência+conta) + data + número.** O `NROREMESSAPE` sozinho
  **repete** entre dias/contas (10, 11, 12… resetam); `DTREMESSAPE` tem componente de hora.
- **Só pagamento ELETRÔNICO (PE) tem remessa.** Borderô/cheque/manual (ex.: DER recibo 996310)
  vêm com `NROREMESSAPE` vazio → o "lote" deles é o **borderô** (`DOCMOVTOBCO`, já agrupado).
- **Remessa ≠ borderô:** remessa = o que foi **enviado** num arquivo (ex.: remessa 20 de 01/06
  16:09 = 10 títulos, R$ 38.377,52); borderô = como o banco **liquidou** (agrupa diferente).

### Como foi descoberto (dicionário de dados)

```sql
-- colunas com REMESSA  → achou CPGDOCTO.NROREMESSAPE/DTREMESSAPE e a tabela CPGREMESSAPE
SELECT owner, table_name, column_name, data_type FROM all_tab_columns WHERE UPPER(column_name) LIKE '%REMESSA%';
-- confirmação: dois boletos PETROARLA com mesmo NROREMESSAPE='0000000020', DTREMESSAPE 01/06 16:09
SELECT D.CODDOCTOCPG, D.NRODOCTOCPG, D.STATUSPE, D.NROREMESSAPE, D.DTREMESSAPE
FROM CPGDOCTO D WHERE D.CODIGOEMPRESA=4 AND D.CODDOCTOCPG IN (996310, 995564, 995566);
```

## Implementado

- Sync de `NROREMESSAPE`/`DTREMESSAPE` → colunas `contas_pagar.numero_remessa` / `data_remessa`
  (migration `1700000036000`, globus query + adapter + ETL).
- Service `remessaGrupo(id)` — agrupa títulos pela chave **conta + data + número** (espelha o
  `pagamentoGrupo` do borderô). Rota `GET /api/contas-pagar/:id/remessa-grupo`.
- UI (`DetalheCpDialog`): linha "Remessa ao banco" + bloco **"📤 Enviado ao banco na remessa Nº X
  (DD/MM HH:mm), junto com N títulos — total R$ Y"**, com a lista do lote. Quando não há remessa
  (borderô/manual), cai no borderô que já existe.
- Caveat: só popula após **Sincronizar do Globus** (Oracle ligado); em Docker (Oracle off) fica vazio.

> `TIPOREMESSA` (char 1, ex.: 'F') = significado a confirmar. `BGM_VAN_REMESSA` /
> `BGM_VAN_REMESSA_DOCUMENTO` (camada VAN que transmite o arquivo) é fonte mais rica se precisar.

Ver `memory/globus-cp-remessa-pe.md`.
