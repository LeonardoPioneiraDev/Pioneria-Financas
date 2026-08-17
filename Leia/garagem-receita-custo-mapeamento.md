# Garagem — Receita × Custo × Rateio da Administração (mapeamento)

**Autor:** Leonardo (PM) + levantamento assistido · **Empresa:** Viação Pioneira — Bacia 2 / STPC-DF · **Data:** 13 de julho de 2026 · **Status:** levantamento / design (nada implementado)

> Objetivo do financeiro: saber **quanto cada garagem gera de receita** e **quanto custa**, e **ratear o custo das unidades que só geram custo** (administração etc.) entre as garagens que geram receita, **proporcional à receita**. No futuro, isso vira o **orçamento real por setor** (ver [orcamento-mapeamento.md](orcamento-mapeamento.md)).

---

## 1. As 4 garagens que geram receita (confirmado pelo financeiro)

| Gera receita? | Unidade (CODCUSTOFIN do CP) | Observação |
|---|---|---|
| ✅ | 10003 Santa Maria | garagem operacional |
| ✅ | 20003 Gama | garagem operacional |
| ✅ | 30003 **Itapoã** | **é a "Paranoá"** que o financeiro cita — mesmo lugar |
| ✅ | 40004 São Sebastião | garagem operacional |
| ❌ | 50003 União | **garagem antiga NÃO operacional** (imóvel da empresa, ainda não roda carros) — ativo ocioso, mesmo caso do Setor "O" |
| ❌ | 60003 Setor "O" | **garagem antiga NÃO operacional** (pertence à empresa, não operável em carros ainda) — ativo ocioso |
| ❌ | 80003 Administração N. Bandeirante | a "administração" — overhead puro, rateia por receita |
| ❌ | 90003 Abastecimento | combustível — **cada garagem tem a própria bomba**, consumo é por garagem → ratear **por consumo**, não por receita (ver §5/§6, Q3) |

> **Três naturezas de custo não-gerador, com tratamento diferente no rateio:**
> - **Administração N. Bandeirante (80003)** = overhead corporativo → rateia **por receita** (proporcional).
> - **Abastecimento (90003)** = combustível, cada garagem tem bomba própria → rateia **por consumo** de cada garagem (ou já vem por garagem — confirmar como o Globus grava; ver Q3).
> - **União (50003) + Setor "O" (60003)** = garagens **ociosas** (imóveis não operacionais) → custo de ativo parado, **não** deriva de operação. Decisão em aberto (§6, Q4): ratear como overhead OU mostrar como linha própria "ativos não operacionais" (recomendado — não penaliza a garagem operante por um imóvel parado).

---

## 2. Descoberta central — existem TRÊS eixos de "setor" que NÃO batem

Este é o nó do épico. "Garagem/setor" significa coisas diferentes em cada subsistema, com **códigos distintos**:

| Eixo | Fonte no Globus | Códigos | Já temos? |
|---|---|---|---|
| **Custo (Contas a Pagar)** | `CPGITDOC.CODCUSTOFIN` → `CPGCUSTOS` | 10003, 20003, 30003, 40004… | ✅ pronto em `finance.contas_pagar` (ver [globus-tabelas-financeiras-documentacao.md](globus-tabelas-financeiras-documentacao.md)) |
| **Custo (Folha)** | `VW_FUNCIONARIOS.CODAREA/DESCAREA` | área de RH (outro código) | parcial — módulo `/folha-detalhe`, **eixo diferente do CODCUSTOFIN** |
| **Receita (Bilhetagem)** | `FRT_CADVEICULOS.CODIGOGA` / `BGM_CADLINHAS.CODIGOGA` | ex.: **31** (garagem operacional) | ❌ não integrado |

> ⚠️ **O de-para que falta:** o `CODIGOGA` da bilhetagem (ex. 31) **não é** o `CODCUSTOFIN` do CP (ex. 10003). Sem uma tabela de-para **CODIGOGA ↔ CODCUSTOFIN ↔ CODAREA**, não dá pra colocar receita e custo da mesma garagem lado a lado. **Construir esse de-para é o pré-requisito de tudo.** (ver §6, Q1)

---

## 3. Receita por garagem — dá pra fazer (com ressalva de "técnica vs real")

Fonte: `Leia/globus-arrecadacao-operacional.md`. **Existe o elo garagem**, então é viável.

### 3.1 De onde vem
- `T_ARR_DETALHE_GUIA` (bilhetagem) → `QTD_PASSAG_TRANS` (passageiros) e `VLR_RECEB` (valor bilhetado).
- Garagem da viagem: `CASE WHEN LENGTH(LTRIM(VE.PREFIXOVEIC,0)) <= 4 THEN FRT_CADVEICULOS.CODIGOGA ELSE BGM_CADLINHAS.CODIGOGA END` (regra histórica: prefixo curto usa a garagem da linha).
- Receita técnica = `Σ (QTD_PASSAG_TRANS × TARIFA_SEMOB_da_data)`, **excluindo `COD_TIPOPAGTARIFA = 3`** (gratuidade/passe livre).

### 3.2 A ressalva inviolável (CLAUDE.md / v1)
A receita atribuível por garagem é a **receita técnica** (Pax × tarifa SEMOB / bilhetagem). O **repasse real do GDF cai consolidado** para a empresa (tarifa técnica de bacia), **não por garagem** — ver [gdf-tarifa-tecnica-bilhetagem](../CLAUDE.md) e [recebiveis-gdf.md](recebiveis-gdf.md).

Consequência para o objetivo do financeiro:
- **"Quanto cada garagem gera"** = receita **técnica** por garagem, rotulada como técnica (nunca como receita real/repasse).
- O **repasse real** só pode ser **apropriado por garagem proporcionalmente** à receita técnica de cada uma — é uma **alocação modelada**, marcada como `calculado`, não `real`.

Ou seja: a receita técnica por garagem vira, ao mesmo tempo, o **número de receita da garagem** E a **chave de rateio** (do repasse real e dos custos administrativos).

---

## 4. Custo por garagem

| Componente | Estado | Nota |
|---|---|---|
| **Contas a Pagar** | ✅ pronto | `finance.contas_pagar` por `CODCUSTOFIN`, com rateio interno do título (`rateio_setores`) quando um título tem itens em >1 unidade. É a base sólida. |
| **Folha** | ⚠️ reconciliar | custo de pessoal existe em `/folha-detalhe`, mas por `CODAREA` (RH), **não** por `CODCUSTOFIN`. Precisa de de-para `CODAREA → garagem` pra somar no mesmo eixo. Folha é o maior custo — sem isso o "custo da garagem" fica muito subestimado. |
| **Depreciação** | ➖ fora de escopo aqui | lançada por classe na contabilidade, não por garagem (ver [depreciacao-mapeamento.md](depreciacao-mapeamento.md)). |

---

## 5. Rateio da administração — modelo proposto

O custo não-gerador **não** é um bolo único rateado por uma chave só — cada natureza tem sua chave (ver §1). O rateio é **por unidade-fonte, com a chave certa**:

```
Para cada mês (competência), para cada garagem operante g (∈ 4):
  receita_tecnica[g] = Σ bilhetagem da garagem g
  share_receita[g]   = receita_tecnica[g] / Σ receita_tecnica[4 garagens]
  share_consumo[g]   = consumo_combustivel[g] / Σ consumo[4 garagens]   (litros/valor)

  # 80003 Administração → chave RECEITA
  rateio_admin[g]        = custo(80003) × share_receita[g]
  # 90003 Abastecimento  → chave CONSUMO (cada garagem tem bomba própria)
  rateio_combustivel[g]  = custo(90003) × share_consumo[g]
      (ou 0 se o custo já vem lançado por garagem — confirmar Q3)
  # 50003 União + 60003 Setor "O" → ativos ociosos, NÃO rateados por padrão
  #   (linha própria "ativos não operacionais"); ratear só se o financeiro pedir (Q4)

  custo_total_garagem[g] = custo_direto[g] (CP+folha da própria garagem)
                         + rateio_admin[g] + rateio_combustivel[g]
  resultado_garagem[g]   = receita[g] − custo_total_garagem[g]
```

- Cada unidade-fonte tem uma **chave configurável** (receita / consumo / km / nº veículos). Default por unidade conforme §1.
- **Ativos ociosos (União, Setor O)** ficam **fora** do rateio por padrão e aparecem como linha separada — não é justo o imóvel parado inflar o custo da garagem que opera. (decisão do financeiro, Q4).
- Rastreabilidade: toda linha de rateio diz **de qual unidade veio, por qual chave, e o fator** — princípio "todo número rastreável até a fonte".
- Estado do número: receita técnica = `real` (bilhetagem) / `calculado` (× tarifa); rateio = `calculado`. Nunca `real`.

---

## 6. Perguntas abertas (resolver com Oracle ligado + financeiro)

- **Q1 (bloqueante) — de-para de garagem.** Enumerar `SELECT DISTINCT CODIGOGA` em `FRT_CADVEICULOS`/`BGM_CADLINHAS` e mapear cada `CODIGOGA` → a garagem física → `CODCUSTOFIN` (10003/20003/30003/40004). Confirmar que há 1 CODIGOGA por garagem (ou vários).
- **Q2 — folha por garagem.** Existe de-para `CODAREA` (RH) → garagem? Sem ele, o custo de pessoal não entra por garagem.
- **Q3 — Abastecimento (90003).** Confirmado: cada garagem tem **bomba própria**, consumo é por garagem → chave = **consumo**. Falta saber **como o Globus grava**: o custo de combustível já vem lançado por garagem (CODCUSTOFIN da garagem) e o 90003 é só um resíduo central? Ou tudo cai em 90003 e precisamos de dados de **litros/valor por garagem** (fonte a achar: `T_ARR_*`? abastecimento no Globus?) pra ratear. Verificar antes de modelar.
- **Q4 — União (50003) e Setor "O" (60003).** Confirmado: **garagens antigas NÃO operacionais** (imóveis ociosos). Decisão do financeiro: mostrar o custo delas como **linha própria "ativos não operacionais"** (recomendado — não penaliza a garagem que opera) ou **ratear como overhead** entre as 4? Recomendação: linha separada, com opção de ligar o rateio.
- **Q5 — gratuidades.** A receita técnica exclui `COD_TIPOPAGTARIFA=3`. Confirmar os códigos reais de gratuidade em `T_TRF_TIPOPAGTO` (hoje inferidos).

---

## 7. Faseamento proposto

1. **Fase 0 — de-para (Q1).** Sem Oracle não anda. Levantar CODIGOGA↔CODCUSTOFIN (e CODAREA) e cadastrar `finance.garagem` + de-paras. É o desbloqueio.
2. **Fase 1 — receita técnica por garagem.** ETL `T_ARR_*` → `finance.movimento_diario` (por garagem/dia) + `finance.tarifa_semob`. Tela: receita técnica por garagem/mês, rotulada como técnica. (schema-base já proposto em `globus-arrecadacao-operacional.md §9`).
3. **Fase 2 — custo total por garagem.** CP (pronto) + folha reconciliada (Q2) por garagem.
4. **Fase 3 — rateio + resultado.** Aplicar o modelo do §5; tela "resultado por garagem" (receita − custo direto − rateio admin), com o critério explícito.
5. **Fase 4 — orçamento por setor.** Amarra no [orcamento-mapeamento.md](orcamento-mapeamento.md) (realizado por CODCUSTOFIN já existe; falta o orçado).

> **Ponto de corte honesto:** as fases 1–4 dependem da **Fase 0**, que exige **Oracle ligado** (read-only) e **confirmação do financeiro** nas perguntas do §6. Antes disso, nenhum número de receita/rateio por garagem pode ser calculado — o sistema deve dizer "sem dado", não estimar.
