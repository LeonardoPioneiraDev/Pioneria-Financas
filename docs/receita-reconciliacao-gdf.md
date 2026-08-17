# Resposta — Reconciliação Receita TD Max × Repasse do GDF

**De:** equipe do sistema de Receita / TD Max (horarios.vpioneira.com.br)
**Para:** Sistema Financeiro — Viação Pioneira
**Data:** 2026-07-16
**Assunto:** o que a API `/integrations/receita/passageiro-receita` mede, por que não bate com o repasse do banco, e como reconciliar.

---

## Resumo executivo (leia isto primeiro)

1. **A "receita" da API NÃO é dinheiro a receber.** É um valor **contábil/nominal**: literalmente `passageiros_líquidos × tarifa_técnica`, onde a tarifa técnica é uma **tabela fixa por data** (R$ **8,4242** em 2026). Ela **não** passa por gratuidade, meia, transbordo/integração, câmara de compensação, glosa ou prazo de pagamento. É **passageiro contado × tarifa cheia**.

2. **O gap de R$ 47,78 M em 60 dias é ~86% estrutural (fator), ~14% atraso.** Fazendo a conta com os números de vocês:
   - Um atraso de ~3 dias sobre ~R$ 66,9 M/mês explica só **~R$ 6,7 M** (14% do gap).
   - Os outros **~R$ 41,1 M** (86%) **não são timing** — é a diferença entre a tarifa técnica nominal e o que o GDF **efetivamente paga por passageiro**.
   - Realização ≈ **64,3%** (recebido ÷ gerado). Isso implica um valor efetivamente pago de **~R$ 5,41 por passageiro contado**, contra os R$ 8,4242 nominais.

3. **Resposta curta à sua pergunta 1:** é **majoritariamente (b)** — a tarifa técnica do relatório é um valor **bruto/nominal maior do que o GDF paga** — **com uma parcela pequena de (a)** (atraso de poucos dias). **Não é** meses inteiros sendo parcelados; se fosse, a razão seria muito mais volátil mês a mês.

4. **Dá para reconciliar de forma automática, mas a API precisa expor mais campos.** A chave existe na origem (Globus `T_ARR_GUIA`), só não está publicada hoje. Ver §"O que podemos expor".

> ⚠️ **O que é fato do sistema × o que precisa de confirmação:** os itens marcados **[SISTEMA]** são verificáveis no nosso código/banco e você pode tomar como certos. Os marcados **[CONFIRMAR]** dependem do contrato de remuneração com o GDF/DFTRANS e do extrato do BRB — não moram no nosso sistema; damos a melhor leitura, mas a confirmação final é do Financeiro/GDF.

---

## Como o número da API é construído  [SISTEMA]

Fonte: `apps/controle-de-horarios-backend/src/receita/sql/passageiro-receita.sql.ts` + `util/tarifa-tecnica.util.ts`.

- **Passageiros** = soma das validações do dia (`QTD_PASSAG_TRANS`) nas tabelas de arrecadação do Globus (`T_ARR_GUIA` / `T_ARR_DETALHE_GUIA`), **líquidas de funcionários** (subtrai `FLG_PASSE='S'`). Separa **Estações (BTCs)** de **Área 2** (convencionais) pelo prefixo do veículo.
- **Receita R$** = `passageiros × tarifaTecnica(data)`. A tarifa **não vem do banco** — é a tabela fixa abaixo (trecho):

  | Vigência | Tarifa técnica |
  |---|--:|
  | 2024-09-14 | R$ 7,8752 |
  | 2025-01-01 | R$ 7,9895 |
  | **2026-01-01** | **R$ 8,4242** |

**Consequência direta:** o número trata **todo passageiro contado como se pagasse a tarifa técnica cheia**. Na prática, a validação inclui categorias que **o GDF remunera por valor menor ou zero**:

- **Transbordo / integração** (2ª perna dentro da janela) → conta como embarque, gera **receita adicional zero ou reduzida**.
- **Meia-tarifa** (estudante) → metade.
- **Gratuidades** (idoso, PCD, etc.) → compensadas por regra própria, tipicamente **abaixo** da tarifa cheia.

É exatamente essa mistura que produz a realização de ~64%. **A informação para provar isso já existe** no Globus (`T_ARR_DETALHE_GUIA.COD_TIPOPAGTARIFA` — passageiros por tipo de pagamento), só não está exposta na API hoje.

---

## Respostas às perguntas

### 1) Por que o gerado (60d) é 1,56× o recebido? (a) atraso ou (b) tarifa nominal maior?

**Majoritariamente (b), com uma fração de (a).**  [SISTEMA para (b); CONFIRMAR a magnitude exata com o GDF]

- **(b) domina (~86% do gap):** a tarifa técnica é nominal/cheia e o mix de gratuidade + meia + transbordo derruba o valor efetivamente pago para **~R$ 5,41/passageiro** (≈64% da nominal). Isso é estrutural e recorrente.
- **(a) é secundário (~14%):** um atraso de poucos dias existe, mas explica só ~R$ 6,7 M do gap de R$ 47,8 M. **Não** há indício de "meses parcelados": isso apareceria como razão instável mês a mês; a de vocês é ~1,55 nos dois meses.

> **Aritmética (com seus números):** gap 60d = R$ 47,79 M · lag ~3d ≈ R$ 6,69 M (14%) · resíduo estrutural ≈ R$ 41,10 M (86%) · realização = 64,3% · efetivo/pax ≈ R$ 5,41.

### 2) Qual o prazo REAL entre a viagem e o crédito no banco?  [CONFIRMAR]

**Não é determinável pelo nosso sistema** — nós não recebemos o extrato bancário nem a data de repasse; só temos a data da viagem (`DAT_VIAGEM_GUIA`). O prazo é definido pelo ciclo da câmara de compensação do SBA/DFTRANS + o TED do BRB.

**Como medir com precisão (recomendado):** casar, por alguns ciclos, o **total gerado de um período fechado** (ex.: uma semana) com o **crédito que o quita**, usando a referência da guia/AD (ver Q4). O lag médio e sua variância saem daí. Pelo tamanho do resíduo, o lag é **da ordem de poucos dias**, não de semanas — mas o valor exato precisa vir do casamento guia↔crédito.

### 3) O repasse chega todo por um lançamento (cód. 908) ou parte por outro (ex. 909)?  [CONFIRMAR — dado do banco, não do nosso sistema]

Não temos o extrato, então **não podemos afirmar** quais códigos são repasse. Porém, pela ordem de grandeza dos seus próprios números, **o cód. 908 sozinho (R$ 85,9 M) não fecha nem com a hipótese do fator**: se o efetivo fosse ~64% do nominal, o repasse total esperado em 60d seria ~R$ **86 M** — o que **bate quase exatamente com o 908 sozinho**. Ou seja:

- Se **908 já é ~R$ 86 M**, então o **909 (R$ 22,4 M) provavelmente NÃO é repasse tarifário do GDF** (seria outra natureza — ver abaixo), senão a realização subiria para ~82% e sobraria receita "a mais".
- **Recomendação:** confirmar a natureza do 909 com o BRB/GDF. Bilhetagem no DF costuma separar **arrecadação tarifária** (a que casa com a receita técnica) de **outros créditos** (subsídio/CIDE, ressarcimento de gratuidade, acerto de câmara). Só o Financeiro/BRB fecha isso.

> Ação concreta: liste, por 1 mês, **todos** os créditos com origem "GDF / SBA / câmara / DFTRANS / BRB-arrecadação" e classifique por natureza. É no banco que essa resposta existe.

### 4) Existe referência que ligue o gerado ao pago (AD/guia/CRC)?  [SISTEMA: a chave existe · CONFIRMAR: o casamento com o crédito]

**Sim, do lado do gerado.** Cada dia/movimento de receita tem uma **guia de arrecadação** no Globus: `T_ARR_GUIA.COD_SEQ_GUIA` (+ `DAT_VIAGEM_GUIA`, `COD_EMPRESA`). É o identificador natural para casar "receita gerada" com "guia".

**Limitação atual:** a API **não expõe** esse número hoje — o endpoint devolve só data/setor/passageiros/receita. E o **lado do crédito bancário** (o "AD-xxxx / CRC" que aparece no histórico do extrato) **não mora no nosso sistema** — vem do BRB/câmara. A reconciliação automática fica pronta quando:
1. **nós** publicarmos a guia/AD por dia na API (fácil, ver abaixo), e
2. **o Financeiro** tiver, no extrato, a mesma referência no crédito (a confirmar com o BRB).

### 5) Se há fator de conversão (gerado → pago), qual é e é estável?  [SISTEMA calcula · CONFIRMAR estabilidade real]

- **Valor observado agora:** fator ≈ **0,643** (recebido ÷ gerado) → efetivo ≈ **R$ 5,41/pax**.
- **Estabilidade:** os dois meses de vocês deram razão ~1,55, então **parece estável no curto prazo** — coerente com um fator estrutural (mix de tarifa), não com atraso. **Mas** o fator **muda quando:** (i) entra nova tarifa (houve reajuste em 2026-01-01), (ii) muda a política de gratuidade/integração, (iii) muda o mix Estação × Área 2. **Não projete com um número fixo cravado** — recalibre mensalmente (ver fórmula).

---

## O que podemos expor na API para automatizar a reconciliação

Tudo abaixo já existe no Globus; é só publicar (mesma lógica do endpoint atual). Podemos entregar num PR:

1. **Quebra por tipo de pagamento** (`COD_TIPOPAGTARIFA` → integral / meia / gratuidade / integração / vale-transporte): passageiros **e** receita por categoria, por dia/setor. **É isto que explica o fator de 64%** — e permite você aplicar o valor de remuneração correto de cada categoria em vez da tarifa cheia.
2. **Número da guia/AD por dia** (`COD_SEQ_GUIA` + `DAT_VIAGEM_GUIA`): a chave para casar gerado ↔ crédito.
3. **Opcional — "receita remuneratória"**: se o Financeiro nos passar o **valor pago por categoria** (do contrato/câmara), calculamos e devolvemos direto o **valor esperado a receber** (não só o nominal), e o gap vira só o lag.

Diga qual desses ajuda mais e priorizamos.

---

## Como projetar o caixa enquanto isso (recomendação)  [CONFIRMAR premissas com Financeiro]

Não use a receita técnica cheia — superprojeta ~56%. Use:

```
repasse_previsto(dia D) ≈ receita_tecnica_API(D) × fator_realizacao × chega_em(D + lag)

onde:
  fator_realizacao  = média móvel de (repasse_conciliado ÷ receita_tecnica) dos últimos ~2–3 meses  (hoje ≈ 0,643)
  lag               = defasagem média medida no casamento guia↔crédito (poucos dias)
  a_receber_do_GDF  = Σ receita_tecnica_API(dias já gerados) × fator_realizacao − repasses já creditados
```

**Cuidados:**
- **Recalibre `fator_realizacao` todo mês** (some com reajuste de tarifa / mudança de gratuidade).
- **Não conte duas vezes:** o "a receber" é só o gerado × fator que **ainda não** apareceu como crédito no banco.
- Trate **Estação** e **Área 2** com fatores separados se o mix de gratuidade diferir entre eles (a quebra por tipo de pagamento mostra isso).

---

## Próximos passos sugeridos

| # | Ação | Dono |
|---|---|---|
| 1 | Confirmar quais códigos de extrato (908/909/outros) são repasse tarifário do GDF e sua natureza | **Financeiro + BRB/GDF** |
| 2 | Passar 1 mês fechado de créditos GDF com data e valor, p/ medir lag e fator reais | **Financeiro** |
| 3 | Expor na API: quebra por tipo de pagamento + guia/AD por dia | **Receita/TD Max (nós)** |
| 4 | (Se houver tabela de remuneração por categoria) devolver "receita remuneratória" pronta | **nós, com dados do Financeiro** |
| 5 | Fechar a fórmula de projeção com fator recalibrado mensalmente | **Financeiro (nós apoiamos)** |

---

### Referências técnicas (nosso sistema)
- Cálculo da receita: `src/receita/sql/passageiro-receita.sql.ts`, `src/receita/util/tarifa-tecnica.util.ts`, `src/receita/services/receita.service.ts` (`getPassageiroReceita`).
- API pública: `GET /integrations/receita/passageiro-receita` — ver `docs/funcionalidades/receita-integracao.md`.
- Tabelas Globus: `T_ARR_GUIA`, `T_ARR_DETALHE_GUIA`, `T_TRF_TIPOPAGTO`, `FRT_CADVEICULOS`.
