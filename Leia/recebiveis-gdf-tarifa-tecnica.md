# Recebíveis GDF — Tarifa técnica × Bilhetagem (por que 28 M ≠ 4,37 M)

Origem: o card "Repasse do GDF" (Recebíveis) mostrava ~R$ 28 M, mas a tela "Recebíveis GDF"
mostrava só R$ 4,37 M resgatado — parecia contradição. Investigado com consultas no Globus
(jun/2026). **Não era erro: são réguas diferentes.**

## As 3 réguas

| Régua | Fonte | O que mede | Eixo de data |
|---|---|---|---|
| **Bilhetagem** (~4,37 M) | matriz BRB (`recebivel_gdf_celula`, API horários) | o que o **passageiro pagou** no cartão (gratuidade ≈ R$ 0) | data de **transporte** |
| **Devido** (~100 M+/mês) | Contas a Receber (`CRCDOCTO/CRCITDOC`) | receita faturada, por categoria | competência |
| **Recebido** (~28–32 M/mês) | extrato (`banco_movto`, `eh_repasse_brb`) | o que **caiu no banco** pela BRB | data de **crédito** |

A bilhetagem é baixa porque inclui gratuidades. O recebido no banco é a **tarifa técnica**
(valor cheio que o GDF paga), por isso muito maior que a bilhetagem.

## Tarifa técnica (SEMOB, data-base 01/01/2026)

A Pioneira recebe a tarifa técnica por **passageiro pagante equivalente** (não acesso bruto).
O passageiro paga até R$ 5,50; o GDF arca com o **complemento tarifário**. Reajuste anual em
**14/set** (INPC/IGP + pesos diesel/pessoal/veículos).

| Bacia | Empresa | Tarifa técnica |
|---|---|---|
| 1 | Piracicabana | R$ 8,5344 |
| **2** | **Pioneira** | **R$ 7,9895** |
| 3 | Urbi | R$ 9,4881 |
| 4 | Marechal | R$ 10,7887 |
| 5 | São José | R$ 10,2308 |

## O que o Globus separa (Contas a Receber)

O extrato (`BCOMOVTO`) **não** carrega tipo de receita — o repasse vem como um stream só
("RECEBIMENTO ARR/CRC/BCO", CODHISTOBCO 908), referenciando docs "AD" no texto. A **quebra por
tipo vive no Contas a Receber** (`CRCITDOC.CODTPRECEITA` → `CRCTPREC`):

- Receita por categoria/instrumento: 40006 VT e Cidadão (~R$897M/ano), 40012 PLE/Estudante,
  40018 PNE/Especial, 40027 EMV contactless, 40005 espécie.
- **Complemento Tarifário** (subsídio GDF) só pras **gratuidades**: 40022 Estudante-PLE (~R$89M/ano),
  40023 Especial-PNE (~R$28,8M/ano). Os tipos 40019/20/21 (complemento em dinheiro/VT/Cidadão) e
  40013 (Diferença de Arrecadação) **não são usados**.
- **O complemento atrasa ~2 meses** (última emissão 40022/40023 = 01/04/2026) → não aparece em
  mai/jun. Confirma o "governo paga aos poucos, de meses anteriores".

### Query da decomposição por tipo de receita

```sql
SELECT I.CODTPRECEITA, R.DESCTPRECEITA, MIN(D.EMISSAOCRC) PRIMEIRA, MAX(D.EMISSAOCRC) ULTIMA,
       COUNT(DISTINCT D.CODDOCTOCRC) QTD_DOCS, SUM(I.VALORITEMDOC) VALOR
FROM CRCDOCTO D JOIN CRCITDOC I ON I.CODDOCTOCRC=D.CODDOCTOCRC
LEFT JOIN CRCTPREC R ON R.CODTPRECEITA=I.CODTPRECEITA
WHERE D.CODIGOEMPRESA=4 AND D.EMISSAOCRC >= DATE '2025-06-01'
GROUP BY I.CODTPRECEITA, R.DESCTPRECEITA ORDER BY SUM(I.VALORITEMDOC) DESC;
```

## Implementado (camada de clareza — Recebíveis)

- Card "Repasse do GDF" + ajuda explicam **tarifa técnica × bilhetagem × recebido** (as 3 réguas) e o lag do complemento.
- Classificação corrigida: **empréstimo/capital de giro/financiamento** e **devolução** saem da receita
  (bucket "não é receita"); antes o empréstimo (R$ 2,65 M) entrava como "Outras entradas".
- Reconciliação numérica exata (devido × recebido por competência, por canal) ficou pra **fase 2** —
  a receita no CR (~100M/mês) vem por vários canais, maior que o stream único do banco BRB (32,8M/mês).

Ver `memory/gdf-tarifa-tecnica-bilhetagem.md` e `memory/recebivel-gdf-modelo.md`.
