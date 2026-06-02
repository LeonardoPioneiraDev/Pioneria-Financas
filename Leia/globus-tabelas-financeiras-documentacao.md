# Documentação Técnica — Tabelas Financeiras do GLOBUS

**Escopo:** notas fiscais de entrada, contas a pagar e cadastros de apoio
**Autor:** Leonardo
**Empresa:** Viação Pioneira Ltda. — Bacia 2 / STPC-DF
**Sistema:** GLOBUS (Praxio) — schema Oracle
**Versão:** 1.0
**Data:** 13 de maio de 2026

---

## Sumário

1. [Sumário executivo](#1-sumário-executivo)
2. [Contexto técnico](#2-contexto-técnico)
3. [Modelo de dados — visão geral](#3-modelo-de-dados--visão-geral)
4. [Detalhamento por tabela](#4-detalhamento-por-tabela)
   - 4.1 [EST_GRUPOCOMPRAS](#41-est_grupocompras)
   - 4.2 [EST_VENCTONF](#42-est_vencttonf)
   - 4.3 [CPGITDOC](#43-cpgitdoc)
   - 4.4 [EST_ITENSNF](#44-est_itensnf)
   - 4.5 [EST_CADMATERIAL](#45-est_cadmaterial)
   - 4.6 [CPGDOCTO](#46-cpgdocto)
   - 4.7 [BGM_NOTAFISCAL](#47-bgm_notafiscal)
5. [Fluxo operacional NF → CPG → Pagamento](#5-fluxo-operacional-nf--cpg--pagamento)
6. [Padrões de status, filtros e exclusões](#6-padrões-de-status-filtros-e-exclusões)
7. [Análises possíveis com este escopo](#7-análises-possíveis-com-este-escopo)
8. [Campos prioritários para enriquecimento](#8-campos-prioritários-para-enriquecimento)
9. [Limitações e cuidados](#9-limitações-e-cuidados)
10. [Glossário](#10-glossário)
11. [Apêndice A — Consulta ao dicionário](#11-apêndice-a--consulta-ao-dicionário)
12. [Apêndice B — Próximos passos sugeridos](#12-apêndice-b--próximos-passos-sugeridos)

---

## 1. Sumário executivo

Esta documentação consolida o mapeamento das **7 tabelas financeiras do GLOBUS** identificadas durante uma análise iniciada a partir de uma consulta legada de 2009 (relatório mensal de Compras × Pagamentos × Vencimentos Financeiros). Cobre:

- Cabeçalho e itens da nota fiscal de entrada (`BGM_NOTAFISCAL`, `EST_ITENSNF`, `EST_VENCTONF`).
- Cadastros mestres de material e categoria de compra (`EST_CADMATERIAL`, `EST_GRUPOCOMPRAS`).
- Documento e itens do Contas a Pagar (`CPGDOCTO`, `CPGITDOC`).

Total: **497 colunas** mapeadas. Os comentários do dicionário Oracle (`ALL_TAB_COMMENTS` / `ALL_COL_COMMENTS`) retornaram vazios para todas as tabelas — comportamento típico do GLOBUS, que não usa `COMMENT ON` no schema. As descrições deste documento foram **inferidas a partir do padrão de nomenclatura da Praxio**, do uso observado em consultas legadas e do domínio operacional de uma empresa de transporte coletivo urbano. Campos cujo significado não é inequívoco estão explicitamente marcados como "provavelmente" ou "?".

### Para que serve este documento

- **Consulta rápida** para construção de novas queries gerenciais e relatórios.
- **Onboarding** de novos integrantes da equipe que precisem trabalhar com dados financeiros.
- **Base para integração** com BI, data warehouse interno ou painéis operacionais.
- **Referência de auditoria** para validar relatórios contábeis-financeiros existentes.

---

## 2. Contexto técnico

### Schema e ambiente

- **SGBD:** Oracle Database
- **Schema:** `GLOBUS` (confirmar nome em outras instalações — pode variar)
- **Ferramenta de acesso recomendada:** PL/SQL Developer (SQL Window para `ALL_TAB_COLUMNS`; Command Window para `DESC`)
- **Reforma tributária:** todas as tabelas com componente fiscal já contêm campos para **CBS** (Contribuição sobre Bens e Serviços) e **IBS** (Imposto sobre Bens e Serviços) — sinal de que o schema foi atualizado para a transição EC 132/2023.

### Padrão de nomenclatura por prefixo

| Prefixo | Módulo | Exemplo |
|---|---|---|
| `BGM_` | Base Geral / Movimento (núcleo comum) | `BGM_NOTAFISCAL`, `BGM_CADLINHAS` |
| `EST_` | Estoque | `EST_CADMATERIAL`, `EST_ITENSNF` |
| `CPG` | Contas a Pagar | `CPGDOCTO`, `CPGITDOC`, `CPGPARAM` |
| `CRC` | Contas a Receber | `CRCDOCTO`, `CRCPARAM` |
| `CTB` | Contábil | `CTBLANCA`, `CTBPARAM` |
| `ESF` | Escrita Fiscal | `ESFNOTAFISCAL`, `ESFPARAM` |
| `FLP` | Folha de Pagamento | `FLP_FUNCIONARIOS`, `FLP_FICHAFINANCEIRA` |
| `FRT` | Frota | `FRT_CADVEICULOS` |
| `T_ARR_` | Arrecadação | `T_ARR_BCO`, `T_ARR_GUIA` |
| `T_ESC_` | Escala operacional | `T_ESC_SERVICODIARIA` |
| `VW_` / `VW...` | Views (consolidações) | `VW_EMPRESA`, `VW_FILIAL` |

### Sufixos comuns

- `_BAK`, `_BKP`, `_AUX`, `_TMP`, `_HIST` → tabelas auxiliares, backup ou histórico. **Não usar em produção** sem confirmar finalidade.
- `_20YYMMDD` → snapshot/backup datado, geralmente legado de migração.

---

## 3. Modelo de dados — visão geral

### Diagrama conceitual de relacionamentos

```
                    ┌──────────────────────┐
                    │   BGM_NOTAFISCAL     │  Cabeçalho da NF
                    │   PK: CODINTNF       │
                    └──────────┬───────────┘
                               │ 1
                ┌──────────────┼──────────────┐
                │              │              │
              N │            N │            1 │ (opcional)
        ┌───────▼──────┐  ┌────▼──────┐  ┌────▼──────────┐
        │ EST_ITENSNF  │  │EST_VENCTON│  │   CPGDOCTO    │
        │ Itens da NF  │  │ Parcelas  │  │ Título a pagar│
        └───────┬──────┘  └───────────┘  └───────┬───────┘
                │ N                              │ 1
                │                                │
            N   │ 1                              │ N
        ┌───────▼─────────┐                ┌─────▼─────┐
        │ EST_CADMATERIAL │                │ CPGITDOC  │
        │  Mestre material│                │Itens do CPG│
        └───────┬─────────┘                └───────────┘
                │ N
                │ 1
        ┌───────▼─────────┐
        │EST_GRUPOCOMPRAS │
        │   Categoria     │
        └─────────────────┘
```

### Tabela resumo

| # | Tabela | Granularidade | Volume típico | PK |
|---|---|---|---|---|
| 1 | `EST_GRUPOCOMPRAS` | 1 linha por categoria | ~dezenas | `CODIGOGRC` |
| 2 | `EST_VENCTONF` | 1 linha por parcela de NF | médio | `CODINTNF` + `DATAVENCTONF` |
| 3 | `CPGITDOC` | 1 linha por item de título CPG | médio | `CODDOCTOCPG` + `CODITEMDOCCPG` |
| 4 | `EST_ITENSNF` | 1 linha por item de NF | alto | `CODINTNF` + `CODIGOMATINT` + ... |
| 5 | `EST_CADMATERIAL` | 1 linha por material | ~dezenas de milhares | `CODIGOMATINT` |
| 6 | `CPGDOCTO` | 1 linha por título (parcela) | alto | `CODDOCTOCPG` |
| 7 | `BGM_NOTAFISCAL` | 1 linha por NF | alto | `CODINTNF` |

---

## 4. Detalhamento por tabela

### 4.1 EST_GRUPOCOMPRAS

**Propósito:** categorização de materiais para análise de compras. É o agrupador mais usado em relatórios gerenciais (gastos por combustível, peças, lubrificantes, EPIs, etc.).

**Granularidade:** 1 registro por grupo.

**Total de colunas:** 5

| Coluna | Tipo | Nullable | Descrição |
|---|---|---|---|
| `CODIGOGRC` | NUMBER(3,0) | N | **PK.** Código do grupo. |
| `DESCRICAOGRC` | VARCHAR2(40) | N | Descrição do grupo (ex.: "ÓLEO DIESEL", "PEÇAS DE REPOSIÇÃO"). |
| `CODGRPANA` | NUMBER(3,0) | Y | Grupo analítico — agrupador superior, permite consolidação maior. |
| `PERMITEPEDIDOMANUALGRC` | VARCHAR2(1) | Y | Flag S/N — se o grupo aceita pedido manual de compra. |
| `PERCACEITAVELVARIACAOPRECO` | NUMBER(3,0) | Y | % máximo aceitável de variação de preço em compras. |

**Observação:** referenciada por `EST_CADMATERIAL.CODIGOGRC`.

---

### 4.2 EST_VENCTONF

**Propósito:** registra as **parcelas de vencimento** de cada NF de entrada. Uma NF parcelada em 3 vezes gera 3 registros nesta tabela.

**Granularidade:** 1 registro por parcela de NF.

**Total de colunas:** 9

| Coluna | Tipo | Nullable | Descrição |
|---|---|---|---|
| `CODINTNF` | NUMBER | N | **FK** → `BGM_NOTAFISCAL`. |
| `DATAVENCTONF` | DATE | N | Data de vencimento da parcela. |
| `TIPOVENCTONF` | VARCHAR2(3) | Y | Tipo da parcela (códigos internos). |
| `DIASVENCTONF` | NUMBER(4,0) | Y | Prazo em dias a partir da emissão (ex.: 30, 60, 90). |
| `VALORVENCTONF` | NUMBER(15,2) | Y | Valor monetário da parcela. |
| `CONDPAGTONF` | VARCHAR2(20) | Y | Condição de pagamento (texto livre, ex.: "30/60/90 DDL"). |
| `CODTPPAGTO` | VARCHAR2(3) | Y | Código do tipo de pagamento. |
| `CODIGOBARRASPE` | VARCHAR2(100) | Y | Código de barras do boleto, quando houver. |
| `LINHADIGITAVELPE` | VARCHAR2(100) | Y | Linha digitável do boleto. |

**Uso:** base da métrica "**Pagamento programado para o mês**" (somatório de `VALORVENCTONF` no período). Compõe o relatório de compras × pagamentos × CPG.

---

### 4.3 CPGITDOC

**Propósito:** itens do título do Contas a Pagar. Um único título do CPG pode ter múltiplos itens com rateios diferentes (centro de custo, conta contábil, tipo de despesa).

**Granularidade:** 1 registro por item de título.

**Total de colunas:** 12

| Coluna | Tipo | Nullable | Descrição |
|---|---|---|---|
| `CODITEMDOCCPG` | NUMBER(3,0) | N | **PK parcial.** Sequencial do item dentro do título. |
| `CODDOCTOCPG` | NUMBER(10,0) | N | **PK parcial / FK** → `CPGDOCTO`. |
| `NROPLANO` | NUMBER(2,0) | Y | Plano de contas do item. |
| **`CODTPDESPESA`** | VARCHAR2(5) | **N** | **Tipo de despesa — categoria do gasto.** Chave para análises por natureza (combustível, salário, encargos, manutenção…). |
| `CODCUSTO` | NUMBER(5,0) | Y | Centro de custo contábil. |
| `VALORITEMDOC` | NUMBER(15,6) | Y | Valor do item — esta é a coluna somada em métricas financeiras. |
| `OBSITEMDOCTOCPG` | VARCHAR2(100) | Y | Observação. |
| `CODCONTACTB` | NUMBER(5,0) | Y | Conta contábil destino. |
| **`CODCUSTOFIN`** | NUMBER(5,0) | Y | **Centro de custo financeiro = SETOR/UNIDADE do título.** Fonte oficial do setor no SFN (≈95% preenchido). Mestre: `CPGCUSTOS`. Ver box abaixo. |
| `CODGRPRATEIO` | NUMBER(5,0) | Y | Grupo de rateio (quando aplicável). |
| `ITEMRATEADO` | VARCHAR2(1) | N | Flag S/N — se foi rateado. |
| `CODNATPREST` | NUMBER(5,0) | Y | Natureza da prestação (usado em obrigações fiscais como DCTF). |

**Observação crítica:** `CODTPDESPESA` é a granularidade **mais útil** para análise de despesa, pois cobre **tanto gastos de NF quanto despesas que entram direto no CPG sem NF** (folha, impostos, despesas administrativas). É mais abrangente que `EST_GRUPOCOMPRAS` (que só cobre o que passa por NF).

> ### 📌 SETOR do Contas a Pagar — decisão de origem (validado 28/05/2026)
>
> O **setor/unidade** de um título do CP **vem de `CPGITDOC.CODCUSTOFIN`** (centro de custo financeiro do item), **não** de `CPGDOCTO.CODSETOR`.
>
> Motivo: `CPGDOCTO.CODSETOR` está **NULL em 100% dos CPs da Pioneira** (validado em 543k linhas) e `CPGITDOC.CODCUSTO` (contábil) idem (0,5% preenchido). Já `CPGITDOC.CODCUSTOFIN` está **~95% preenchido** e resolve para as 8 unidades operacionais. A descrição vem do mestre **`CPGCUSTOS`** (`CODIGO → DESCRICAO`).
>
> **As 8 unidades em uso** (folhas analíticas, `CPGCUSTOS.ACEITALANCAMENTO='S'`):
>
> | CODCUSTOFIN | Setor / Unidade |
> |---|---|
> | 10003 | UNIDADE SANTA MARIA |
> | 20003 | UNIDADE GAMA |
> | 30003 | UNIDADE ITAPOÃ |
> | 40004 | UNIDADE SÃO SEBASTIÃO |
> | 50003 | UNIDADE UNIÃO |
> | 60003 | UNIDADE SETOR "O" |
> | 80003 | ADMINISTRAÇÃO N. BANDEIRANTE |
> | 90003 | ABASTECIMENTO |
>
> **Rateio:** um título pode ter itens em mais de uma unidade (~1% dos casos, até 5 unidades). Regra do SFN: gravar a unidade **DOMINANTE por valor** (`ORDER BY SUM(VALORITEMDOC) DESC, CODCUSTOFIN` + `ROWNUM=1`) e marcar `contas_pagar.setor_rateado = true` quando `COUNT(DISTINCT CODCUSTOFIN) > 1`.
>
> **No SFN:** `GLOBUS_QUERIES.contasAPagar` traz `COD_SETOR`/`SETOR_NOME`/`QTD_SETORES`; ETL grava em `finance.contas_pagar.cod_setor` / `setor_nome` / `setor_rateado`. Cadastro manual de setor foi **descartado** (decisão: setor 100% do Globus).

---

### 4.3.1 CPGCUSTOS — mestre de centro de custo financeiro (setor)

**Propósito:** cadastro dos centros de custo financeiros (= unidades/setores). É o mestre que descreve `CPGITDOC.CODCUSTOFIN`.

**Granularidade:** 1 linha por centro de custo. ~45 linhas (sintéticos + analíticos), 8 analíticos em uso no CP.

| Coluna | Tipo | Descrição |
|---|---|---|
| `CODIGO` | NUMBER | **PK.** Igual a `CPGITDOC.CODCUSTOFIN`. |
| `DESCRICAO` | VARCHAR2(50) | Nome do setor/unidade (ex.: "UNIDADE GAMA"). |
| `CLASSIFICADOR` | VARCHAR2(30) | Hierarquia (ex.: "2.1.1.001"). Sintético vs analítico. |
| `ACEITALANCAMENTO` | VARCHAR2(1) | S/N. `S` = folha analítica (recebe lançamento) — só esses aparecem nos itens. |
| `DESC_REGIONAL` | VARCHAR2(50) | Regional (vazio na Pioneira). |

**Join:** `CPGITDOC.CODCUSTOFIN = CPGCUSTOS.CODIGO`.

---

### 4.3.2 CPGTPDES — mestre de tipo de despesa

**Propósito:** descreve `CPGITDOC.CODTPDESPESA` (natureza do gasto). 2º eixo de análise possível (ainda **não** integrado no SFN — disponível para evolução).

| Coluna | Tipo | Descrição |
|---|---|---|
| `CODTPDESPESA` | VARCHAR2(5) | **PK.** Igual a `CPGITDOC.CODTPDESPESA`. |
| `DESCTPDESPESA` | VARCHAR2 | Descrição (ex.: "Serv. de Terceiros - P. Jurídica (Manutenção)"). |
| `CLASSIFICADOR` | VARCHAR2 | Plano hierárquico (ex.: "1.2.3.05.002"). |

**Join:** `CPGITDOC.CODTPDESPESA = CPGTPDES.CODTPDESPESA`.

---

### 4.4 EST_ITENSNF

**Propósito:** detalhamento item a item da nota fiscal de entrada. Cada linha é um material adquirido com seu valor e impostos.

**Granularidade:** 1 registro por item da NF.

**Total de colunas:** 90

Campos agrupados por finalidade:

#### 4.4.1 Identificação e estoque

| Coluna | Tipo | Descrição |
|---|---|---|
| `CODINTNF` | NUMBER | **FK** → `BGM_NOTAFISCAL`. |
| `CODIGOMATINT` | NUMBER | **FK** → `EST_CADMATERIAL`. |
| `CODIGOLOCAL` | NUMBER(3,0) | Local de estoque destino. |
| `CODIGOMARCAMAT` | NUMBER(4,0) | Marca do material no item (pode diferir do cadastro). |
| `NUMERORQ` | NUMBER(10,0) | Número da requisição de origem, se houver. |

#### 4.4.2 Quantidades e valores

| Coluna | Tipo | Descrição |
|---|---|---|
| `QTDEITENSNF` | NUMBER(10,3) | Quantidade efetiva. |
| `QTDEPEDIDOITENSNF` | NUMBER(10,3) | Quantidade originalmente pedida. |
| `QTDECONSIGNACAOITENSNF` | NUMBER(10,3) | Quantidade em consignação. |
| `VALORUNITARIOITENSNF` | NUMBER(19,10) | Preço unitário. |
| `VALORTOTALITENSNF` | NUMBER(19,6) | **Valor total do item — somado nas métricas.** |
| `VALORFRETEITENSNF` | NUMBER(19,10) | Frete atribuído ao item. |
| `VALORSEGUROITENSNF` | NUMBER(19,10) | Seguro atribuído ao item. |
| `VALORDESCONTOITENSNF` | NUMBER(19,10) | Desconto. |
| `VLROUTRASDESPESASITNF` | NUMBER(19,10) | Outras despesas. |

#### 4.4.3 Status

| Coluna | Tipo | Descrição |
|---|---|---|
| `STATUSITENSNF` | VARCHAR2(1) | `F`=Finalizado, `C`=Cancelado. **Sempre filtrar `<> 'C'`** em relatórios. |
| `AUTORIZADONF` | VARCHAR2(1) | Flag S/N de autorização. |

#### 4.4.4 Tributação convencional (sistema atual)

Campos para ICMS, IPI, PIS, COFINS, ISS, INSS, IR, ICMS ST, DIFAL — cobrem base de cálculo, alíquota e valor para cada tributo. Os mais relevantes:

| Coluna | Descrição |
|---|---|
| `BASECALCICMSITENSNF`, `ALIQUOTAICMSITENSNF`, `VALORICMSITENSNF` | ICMS próprio. |
| `BASECALCICMSSUBSTITENSNF`, `ALIQICMSSUBSITENSNF`, `VALORICMSSUBSITENSNF` | ICMS Substituição Tributária. |
| `VLRPISITNF`, `ALIQPISITNF` | PIS. |
| `VLRCONFINSITNF`, `ALIQCONFINSITNF` | COFINS. |
| `VLRINSSITNF`, `VLRISSITNF`, `VLRIRITNF` | Retenções. |
| `VALORDIFALITENSNF`, `ALIQDIFALITENSNF`, `ARECOLHERDIFALITENSNF` | DIFAL (operações interestaduais). |
| `BASEFCPSTNF`, `ALIQFCPSTNF`, `VALORFCPSTNF` | Fundo de Combate à Pobreza ST. |

#### 4.4.5 Reforma tributária (EC 132/2023)

| Coluna | Descrição |
|---|---|
| `ALIQBASETRIB`, `VLRBASETRIB` | Base tributável. |
| `ALIQCBS`, `VLRBRUTOCBS`, `VLRCBS`, `ALIQREDCBS`, `ALIQEFETCBS` | **CBS** (Contribuição sobre Bens e Serviços). |
| `ALIQIBSMUN`, `VLRBRUTOIBSMUN`, `VLRIBSMUN`, `ALIQREDIBSMUN`, `ALIQEFETIBSMUN` | **IBS Municipal**. |
| `ALIQIBSEST`, `VLRBRUTOIBSEST`, `VLRIBSEST`, `ALIQREDIBSEST`, `ALIQEFETIBSEST` | **IBS Estadual**. |
| `CODCLASSTRIB` | Classificação tributária da reforma. |

#### 4.4.6 Outros campos relevantes

| Coluna | Descrição |
|---|---|
| `CODTPRECEITA` | Tipo de receita (cruza com módulo CRC). |
| `CODSITTRIBUTARIA`, `CODOPERFISCAL`, `CODCLASSFISC` | Classificações fiscais. |
| `PESOBRUTO`, `PESOLIQUIDO` | Pesos do item. |
| `OBSITENSNF` | Observação livre (255 chars). |

---

### 4.5 EST_CADMATERIAL

**Propósito:** cadastro mestre de materiais. Centraliza descrição, agrupamentos e parâmetros fiscais/operacionais de cada item comprado, estocado ou consumido.

**Granularidade:** 1 registro por material.

**Total de colunas:** 93

#### 4.5.1 Identificação

| Coluna | Tipo | Descrição |
|---|---|---|
| `CODIGOMATINT` | NUMBER | **PK.** Código interno (sequencial). |
| `CODIGOINTERNOMATERIAL` | VARCHAR2(8) | Código curto exibido nas telas/relatórios. |
| `DIGITOVERMAT` | NUMBER(1,0) | Dígito verificador. |
| `CODIGOORIGINALMAT` | VARCHAR2(20) | Código do fabricante original. |
| `CODIGOPARALELO1MAT`, `2MAT`, `3MAT` | VARCHAR2(20) | Códigos paralelos (alternativos / outros fornecedores). |
| `CODIGOGENERO` | VARCHAR2(3) | Gênero do produto. |

#### 4.5.2 Descrição

| Coluna | Tipo | Descrição |
|---|---|---|
| `DESCRICAOMAT` | VARCHAR2(255) | Descrição principal. |
| `DESCRICAOABREVMAT` | VARCHAR2(50) | Descrição abreviada. |
| `OBSMAT` | VARCHAR2(100) | Observação geral. |
| `OBSERVACAO` | VARCHAR2(80) | Observação secundária. |
| `OBSCOMPRA` | VARCHAR2(200) | Observação específica para compra. |
| `MEDIDAMAT` | VARCHAR2(20) | Medida descritiva. |
| `UTILIZACAOMAT` | VARCHAR2(50) | Utilização típica. |

#### 4.5.3 Agrupamentos hierárquicos

| Coluna | Tipo | Descrição |
|---|---|---|
| `CODIGOGRC` | NUMBER(3,0) | **FK** → `EST_GRUPOCOMPRAS` — grupo de compras (o mais usado). |
| `CODGRR` | NUMBER(3,0) | Grupo de ressuprimento. |
| `CODIGOGRD` | NUMBER(3,0) | Grupo de despesa. |
| `CODIGOGRE` | NUMBER(3,0) | Grupo de estoque. |
| `CODIGOGRCON` | NUMBER(3,0) | Grupo de consumo. |
| `CODIGOGRDH` | NUMBER(3,0) | Grupo desconhecido (provavelmente histórico). |
| `CODIGOGERCUSTO` | NUMBER(3,0) | Gerador de custo. |

#### 4.5.4 Unidades

| Coluna | Tipo | Descrição |
|---|---|---|
| `CODIGOUM` | VARCHAR2(3) | Unidade de medida principal. |
| `CODIGOUMCOMPRA` | VARCHAR2(3) | Unidade de medida de compra. |
| `CODUNDTRIBUTAVEL` | VARCHAR2(3) | Unidade tributável (SPED). |
| `QTDEUNIDADEMEDIDAMAT` | NUMBER(15,2) | Fator de conversão. |
| `QTDEEQUIVUNDTRIB` | NUMBER(15,3) | Quantidade equivalente em unidade tributável. |

#### 4.5.5 Flags operacionais (S/N)

| Coluna | Descrição |
|---|---|
| `ORIGINALMAT` | É material original (não substituto). |
| `GERARATEIOMAT`, `GERACOTACAOMAT`, `GERACRITICAMAT`, `GERACUSTOFROTAMAT` | Comportamentos do material. |
| `ACEITAMOVTOMAT` | Aceita movimentação. |
| `GERALANCTOCTBMAT` | Gera lançamento contábil. |
| `EMCONSIGNACAOMAT`, `MATERIALCRITICO`, `MATERIALCORTESIAMAT`, `MATERIALDEREVENDA` | Tipos especiais. |
| `CONTROLAGARANTIA`, `CONTROLAMATERIALPORLOTE`, `CONTROLANRMAT`, `CONTROLACOMOIMPRESSOMAT` | Controles. |
| `EXIBEEMRELATORIOS`, `GERAETIQUETAMAT`, `IMPRIMEUMAETIQUETAMAT`, `GERARINVENTARIOSPED` | Exibição/geração. |
| `LIBERAR_REQ_KM_ESP`, `BLOQ_REQ_PC_GARANTIA` | Requisições. |

#### 4.5.6 Fiscal

| Coluna | Descrição |
|---|---|
| `CODCLASSFISC` | Classificação fiscal. |
| `CODNCM` | NCM (Nomenclatura Comum do Mercosul). |
| `CODIGOANP` | Código ANP (combustíveis). |
| `CODSITTRIBUTARIA`, `CODSITTRIBUTARIA_PIS`, `CODSITTRIBUTARIA_COFINS` | CST por tributo. |
| `INCIDEPISMAT`, `INCIDEICMSMAT`, `INCIDECOFINSMAT`, `INCIDEICMSSTMAT`, `INCIDEICMSMONOFASICO`, `INCIDEICMSNFTRANSF` | Flags S/N de incidência. |
| `CODOPERFISCALNOESTADO`, `CODOPERFISCALFORAESTADO` | Operações fiscais por origem. |
| `CODTABELAIVA` | Tabela IVA. |
| `CODIGOAPURCOFINSEN`, `CODIGOAPURPISEN`, `CODIGOAPURCOFINSSA`, `CODIGOAPURPISSA` | Códigos de apuração (entrada/saída). |
| `TIPO_ITEM_ENTRADA`, `TIPO_ITEM_SAIDA` | Tipo SPED. |
| `CODCLASSTRIB` | Classificação tributária da reforma. |
| `COD_IDENT_CST` | Identificador CST. |
| `CODIGOAJUSTECST` (em EST_ITENSNF) | Ajustes. |

#### 4.5.7 Auditoria

| Coluna | Descrição |
|---|---|
| `DATACADASTROMAT` | Data de criação do cadastro. |
| `DATAEXCLUSAOMAT` | Data de exclusão (logical delete). |
| `USR_ULT_ALTERACAO` | Usuário da última alteração. |
| `DT_ULT_ALTERACAO` | Data/hora da última alteração. |

---

### 4.6 CPGDOCTO

**Propósito:** documento (parcela/título) do Contas a Pagar. **Cada parcela de uma NF parcelada vira um `CPGDOCTO` distinto.** Também recebe lançamentos que não passam por NF (folha, impostos, despesas administrativas).

**Granularidade:** 1 registro por título a pagar.

**Total de colunas:** 160

#### 4.6.1 Identificação

| Coluna | Tipo | Descrição |
|---|---|---|
| `CODDOCTOCPG` | NUMBER(10,0) | **PK.** Código interno. |
| `CODDOCTOCPGSUBST` | NUMBER(10,0) | Código do documento que substituiu este (renegociação). |
| `NRODOCTOCPG` | VARCHAR2(10) | Número do documento (geralmente número da NF ou guia). |
| `SERIEDOCTOCPG` | VARCHAR2(5) | Série. |
| `NROPARCELACPG` | NUMBER(3,0) | Número da parcela. |
| `CODTPDOC` | VARCHAR2(3) | Tipo de documento (NF, DUP, BOL, etc.). |
| `SISTEMA` | VARCHAR2(3) | Sistema de origem do lançamento. |
| `MODULO_INCLUSAO` | VARCHAR2(3) | Módulo que incluiu o registro. |
| `USUARIO_INCLUSAO` + `DATA_INCLUSAO` | Quem incluiu + quando (hora real). Confiável. |
| `USUARIO_LIB_PAGTO_APROVE_ME` / `USUARIO_LIBEROU_PAGTO` | Quem liberou pra pagamento (fluxo APROVE-ME / comum). |
| `USUARIO_ASS_ELETRON_APROVE_ME` | Assinante eletrônico — **vazio em ~100% dos títulos** (assinatura separada quase nunca ocorre). |
| `USUARIO` | ⚠️ **"Último a alterar" — NÃO é "quem pagou".** Varia (incluidor/liberador/analista). Nunca usar como executor da baixa (achismo contestável). |
| `USUARIOCPG_EXC` | Quem excluiu. |

> **🔑 Trilha de auditoria REAL → `CPGDOCTO_HISTORICO_NEGOCIACOES`** (nome enganoso): é o log de eventos por documento — 1 linha por ato, com `USUARIO` + timestamp real + `COD_TP_EVENTO` (dicionário em `CPGDOCTO_TIPO_EVENTOS`) + descrição. Join por `CODDOCTOCPG`. **É a única fonte de "quem efetivou a baixa"** (evento "Pagamento de documento", status `B`). O `CPGDOCTO` **não** tem coluna de executor de pagamento; `PAGAMENTOCPG` é coluna de DATE, não tabela. Aprovação/liberação completa também em `BGM_APROVEME` (join por `REQUISICAO` = nº doc/parcela). Consultas e achados completos: `sql-exploracao/2026-05-26-cp-trilha-auditoria-globus.sql`.

#### 4.6.2 Empresa e filial

| Coluna | Descrição |
|---|---|
| `CODIGOEMPRESA` | Empresa do título. |
| `CODIGOFL` | Filial. |
| `CODIGOFL_ORIGEM` | Filial de origem. |
| `CODIGOFL_DOCTO` | Filial do documento. |

#### 4.6.3 Fornecedor / Favorecido

| Coluna | Descrição |
|---|---|
| `CODIGOFORN` | Código do fornecedor. |
| `FAVORECIDODOCTOCPG` | Favorecido (200 chars, texto livre — pode diferir do fornecedor cadastrado). |
| `CODFORNANTSUB` | Código do fornecedor anterior em caso de substituição. |
| `TPINSCR_FAV`, `NRINSCR_FAV` | Tipo (CPF/CNPJ) e número de inscrição do favorecido. |
| `CONTRIB_GAR`, `TPINSCR_GAR`, `NRINSCR_GAR`, `INS_EST_GAR` | Dados de contribuinte para guias. |

#### 4.6.4 Ciclo de vida (datas)

| Coluna | Descrição |
|---|---|
| `EMISSAOCPG` | Data de emissão do documento. |
| `ENTRADACPG` | Data de entrada no sistema. |
| `VENCIMENTOCPG` | Data de vencimento. **Base do filtro de carteira do mês.** |
| `VENCPRORROGCPG` | Vencimento prorrogado (se houve renegociação). |
| `PAGAMENTOCPG` | Data de pagamento efetivo. |
| `DATALIBERACAOPGTO` | Data de liberação para pagamento. |
| `PAGTO_ANTECIPADO` | Data de pagamento antecipado. |
| `DATA_PAGTO_DARF` | Pagamento de DARF (impostos). |
| `DATA_REFERENCIA` | Data de referência. |
| `COMPETENCIA`, `COMPETENCIA_FLP` | Competência. |
| `DATAHORACPG_EXC` | Data/hora de exclusão lógica. |

#### 4.6.5 Status

| Coluna | Descrição |
|---|---|
| `STATUSDOCTOCPG` | Status principal: `A`=Aberto, `F`=Finalizado, `C`=Cancelado. |
| `QUITADODOCTOCPG` | Flag S/N — se já foi quitado. |
| `PAGAMENTOLIBERADO` | Flag S/N — se está liberado para pagamento. |
| `DOCTODEDEVOL` | Flag S/N — se é documento de devolução. |
| `STATUSPE`, `STATUSPEMOD` | Status do Pagamento Eletrônico. |

#### 4.6.6 Valores e ajustes

| Coluna | Descrição |
|---|---|
| `DESCONTOCPG` | Valor de desconto. |
| `ACRESCIMOCPG` | Valor de acréscimo (juros, multa). |
| `VLR_ORIGINAL` | Valor original do título. |
| `VLR_MULTA_DARF`, `VLR_JUROS_DARF` | Específico de DARFs. |
| `VALOR_ADTO`, `VALOR_DEVOL` | Adiantamentos e devoluções. |
| `VALOR_REFERENCIA` | Valor de referência. |

#### 4.6.7 Retenções na fonte

| Coluna | Descrição |
|---|---|
| `VLRINSSCPG`, `VLR_INSS_CALC_FLP` | INSS. |
| `VLRIRRFCPG`, `VLR_IRRF_CALC_FLP` | IRRF. |
| `VLRPISCPG`, `VLRCOFINSCPG`, `VLRCSLCPG` | PIS, COFINS, CSLL. |
| `VLRISSCPG` | ISS. |
| `VLRSESTSENATCPG`, `VLR_SESTSENAT_CALC_FLP` | SEST/SENAT (autônomos transportadores). |
| `PIS_COFINS_CSL_RETIDO` | Flag S/N. |

#### 4.6.8 Pagamento eletrônico (PE) e PIX

| Coluna | Descrição |
|---|---|
| `TIPODOCPAGTOCPG`, `MODALIDADEPE` | Modalidade. |
| `CODIGOBARRASPE`, `LINHADIGITAVELPE` | Boleto. |
| `NROREMESSAPE`, `DTREMESSAPE` | Remessa bancária. |
| `NRDOCTORETBCOPE` | Documento de retorno do banco. |
| `AUTELETRONICA` | Autenticação eletrônica. |
| `TIPO_CHAVE_PIX_FAV`, `CHAVE_PIX_FAV` | Chave PIX do favorecido. |
| `LINK_PAGAMENTO_PIX_PE` | Link de pagamento PIX. |
| `CODMOVTOBCO`, `CODMOVTOBCO_ESTORNO`, `CODMOVTOBCO_ESTORNO_PE` | Movimento bancário associado. |
| `ASSINATURA_1`, `ASSINATURA_2`, `USUARIO_ASS_ELETRON_APROVE_ME` | Assinaturas. |

#### 4.6.9 Conta bancária do favorecido

| Coluna | Descrição |
|---|---|
| `CODBANCO_FAV`, `CODAGENCIA_FAV`, `DVAGENCIA_FAV` | Banco e agência. |
| `CODCONTABCO_FAV`, `DVCONTA_FAV`, `TIPOCONTA_FAV` | Conta. |

#### 4.6.10 Vínculos com outros módulos

| Coluna | Aponta para |
|---|---|
| `CODLANCA`, `CODLANCA_PG` | Lançamento contábil (`CTBLANCA`). |
| `CODDOCTOESF` | Documento na escrita fiscal. |
| `CODDOCTOCPG_ADTO`, `CODDOCTOCPG_DEVOL` | Outros documentos do CPG (adiantamento, devolução). |
| `CODDOCTOCPG_INSS/IRRF/ISS/COFINS/CSL/PIS` | Parcelas-filho de retenção (cada retenção gera um título separado a pagar para o fisco). |
| `CODDOCTONOVO_CANCEL` | Documento que substituiu este após cancelamento. |
| `CODINTDADOSTRANSP` | Dados de transporte. |
| `DATA_INTEGROU_FLP` | Quando foi integrado da folha. |

#### 4.6.11 Específicos de guia / imposto / veículo

| Coluna | Descrição |
|---|---|
| `CODRECEITA_GUIA`, `PERIODOAPURACAO_GUIA`, `REFERENCIA_GUIA`, `IMPOSTO_GUIA` | Guias de imposto. |
| `RENAVAM`, `PLACA_VEICULO`, `IPVA_DPVAT`, `ANOBASE` | Tributos veiculares (IPVA, DPVAT, licenciamento). |
| `CODIGOUF`, `CODIGOMUNIC` | UF/município de origem. |
| `NUMEROOP` | Número de Ordem de Pagamento. |
| `NRAUTORIZACAOPAGTO` | Autorização. |
| `IDENTIFICADOR_FGTS`, `NUM_LACRE_FGTS`, `DIG_LACRE_FGTS` | FGTS. |

#### 4.6.12 Reforma tributária

| Coluna | Descrição |
|---|---|
| `CBS` | Valor de CBS. |
| `IBSMUNICIPAL` | IBS Municipal. |
| `IBSESTADUAL` | IBS Estadual. |

---

### 4.7 BGM_NOTAFISCAL

**Propósito:** cabeçalho da nota fiscal de entrada. Tabela central — todas as demais (`EST_ITENSNF`, `EST_VENCTONF`, `CPGDOCTO` parcial) referenciam-na.

**Granularidade:** 1 registro por NF.

**Total de colunas:** 128

#### 4.7.1 Identificação

| Coluna | Tipo | Descrição |
|---|---|---|
| `CODINTNF` | NUMBER | **PK.** Código interno sequencial. |
| `NUMERONF` | VARCHAR2(20) | Número da NF na origem. |
| `SERIENF` | VARCHAR2(5) | Série da NF. |
| `CODMODELO` | VARCHAR2(3) | Modelo (55 para NFe, 01 para NF tradicional, etc.). |
| `CODTPDOC` | VARCHAR2(3) | Tipo de documento (NF, CTE, etc.). |
| `CHAVEDEACESSONFE` | VARCHAR2(80) | Chave de acesso da NFe (44 dígitos). |
| `NUMEROFAT` | VARCHAR2(10) | Número da fatura (se houver). |
| `CODINTNFOUTROFORN` | NUMBER | Vínculo com NF de outro fornecedor (operações triangulares). |

#### 4.7.2 Empresa e classificação

| Coluna | Descrição |
|---|---|
| `CODIGOEMPRESA` | **Empresa principal** do lançamento. |
| `CODIGOEMPRESATIPODOC` | Empresa do tipo de documento. **Atenção: pode diferir de `CODIGOEMPRESA`.** |
| `CODIGOGA` | Grupo de atividade. |
| `CODIGOFL` | Filial. |
| `CODIGOFLTIPODOC` | Filial do tipo de documento. |
| `CODCLASSFISC` | Classificação fiscal. |
| `CODCLASSFISCSERV`, `CODCLASSFISC_EN` | Variações (serviço, entrada). |

#### 4.7.3 Fornecedor / Cliente

| Coluna | Descrição |
|---|---|
| `CODIGOFORN` | Código do fornecedor (na maioria das NFs de entrada). |
| `CODCLI` | Código do cliente (em NFs de saída). |

#### 4.7.4 Datas

| Coluna | Descrição |
|---|---|
| `DATAEMISSAONF` | Data de emissão da NF (data fiscal). |
| `ENTRADASAIDANF` | Data de entrada/saída da mercadoria. |
| `DATASAIDANF` | Data de saída específica. |
| `DATALANCTO` | Data de lançamento no sistema (data operacional, geralmente posterior). |

#### 4.7.5 Status

| Coluna | Descrição |
|---|---|
| `STATUSNF` | `F`=Finalizada (efetivada), `A`=Aberta, `C`=Cancelada. **Sempre filtrar `= 'F'`** em relatórios. |
| `BLOQUEIANF` | Flag S/N de bloqueio. |
| `INTEGRAR` | Flag S/N — se deve integrar com outros módulos. |
| `INTEGRARCTB` | Flag S/N específico para contábil. |

#### 4.7.6 Operação fiscal

| Coluna | Descrição |
|---|---|
| `NATUREZAOPERACAONF` | Natureza da operação (texto). |
| `NATUREZAOPERACAOSERV` | Natureza específica para serviço. |
| `CODOPERFISCAL` | Código da operação fiscal. |
| `TIPOOPERACAONF` | Tipo (entrada/saída). |
| `CONSUMODIRETONF` | Flag S/N — se é consumo direto (sem estoque). |
| `TIPODEFRETE` | Tipo de frete (CIF, FOB, etc.). |
| `TIPONFSAIDA` | Tipo de NF saída. |
| `VENDAPRESENCIAL` | Flag S/N. |

#### 4.7.7 Valores totais no cabeçalho

| Coluna | Descrição |
|---|---|
| `VALORTOTALNF` | **Valor total da NF.** |
| `BASECALCICMSNF`, `ALIQUOTAICMSNF`, `VALORICMSNF` | ICMS no total. |
| `BASEICMSUBST`, `VALORICMSSUBST` | ICMS ST no total. |
| `BASECALCIPINF`, `ALIQUOTAIPINF`, `VALORIPINF` | IPI no total. |
| `BASEPISNF`, `VLRPISNF`, `ALIQPISNF` | PIS retido no total. |
| `BASECONFINSNF`, `VLRCONFINSNF`, `ALIQCONFINSNF` | COFINS retido no total. |
| `BASEINSSNF`, `VLRINSSNF`, `ALIQINSSNF` | INSS retido. |
| `BASEISSNF`, `VLRISSNF`, `ALIQISSNF` | ISS retido. |
| `BASEIRNF`, `VLRALIQNF`, `ALIQIRNF` | IRRF retido. |
| `BASECSLLNF`, `VLRCSLLNF`, `ALIQCSLLNF` | CSLL retido. |
| `BASEFCPSTNF`, `ALIQFCPSTNF`, `VALORFCPSTNF` | Fundo de Combate à Pobreza ST. |
| `VALORSEGURONF`, `VALORFRETENF`, `VALORDESCONTONF`, `PERCDESCONTONF`, `OUTRASDESPESASNF`, `VLRIMPOSTORENDANF` | Outros valores. |
| `BASEICMSDIFNF`, `ALIQUOTAICMSDIFNF`, `VALORICMSDIFNF`, `VALORSERVICODIFNF` | Diferencial de alíquota. |
| `ICMS_ISENTANF`, `ICMS_OUTRASNF` | Outras situações ICMS. |
| `ALIQUOTAICMSNFDEDPISCOFINS` | Reforma tributária — alíquota ICMS deduzida de PIS/COFINS. |

#### 4.7.8 Flags de distribuição de valor

| Coluna | Descrição |
|---|---|
| `FRETESOBRETOTALNF` | S/N — se frete entra no total. |
| `OUTDESPSOBRETOTALNF` | S/N — outras despesas no total. |
| `IPISOBRETOTALNF` | S/N — IPI no total. |
| `DESCONTOSOBRETOTALNF` | S/N — desconto no total. |
| `ICMSSUBSTSOBRETOTALNF` | S/N — ICMS ST no total. |
| `ATRIBUIICMSSUBTOTALNF` | S/N — atribuição ICMS ST. |

#### 4.7.9 Integração entre módulos

| Coluna | Aponta para |
|---|---|
| `CODDOCTOCPG` | Título no CPG gerado a partir desta NF. |
| `CODDOCTOESF` | Documento na escrita fiscal. |
| `CODDOCTOESF_TE` | Variante (transferência eletrônica). |
| `CODDOCTOESF_ESTORNO` | Estorno na escrita fiscal. |
| `CODDOCTOCRC` | Documento no CRC (Contas a Receber, em NFs de saída). |
| `CODLANCA` | Lançamento contábil. |
| `CODISSINT` | Integração ISS. |
| `LANCTOINTEGRADOCPG`, `LANCTOINTEGRADOESF`, `LANCTOINTEGRADOCTB`, `LANCTOINTEGRADOCRC` | Flags S/N de integração. |
| `ID_MOVTO_ORC` | Movimento orçamentário. |
| `SHORTCODE_SISTEMA`, `SISTEMANF` | Origem da integração. |

#### 4.7.10 Aprovação e auditoria

| Coluna | Descrição |
|---|---|
| `USU_APROVADOR` | Usuário aprovador. |
| `USUARIO` | Usuário responsável. |
| `OBSNF`, `OBSESFNF`, `OBSDADOSSPED` | Observações. |
| `DADOSADICIONAISIMP`, `OBSCORPONFIMP`, `INFOCOMPLEMENTARES` | Dados complementares. |
| `NRPROCESSO` | Número do processo. |

#### 4.7.11 Dados do favorecido (em NFs com pagamento direto)

| Coluna | Descrição |
|---|---|
| `FAVORECIDODOCTO` | Favorecido. |
| `CODBANCO_FAV`, `CODAGENCIA_FAV`, `DVAGENCIA_FAV` | Banco e agência. |
| `CODCONTABCO_FAV`, `DVCONTA_FAV`, `TIPOCONTA_FAV` | Conta. |
| `TPINSCR_FAV`, `NRINSCR_FAV` | Inscrição. |
| `TIPO_CHAVE_PIX_FAV`, `CHAVE_PIX_FAV` | PIX. |
| `NRAUTPAGTO` | Autorização de pagamento. |

#### 4.7.12 Outros

| Coluna | Descrição |
|---|---|
| `NROPLANO` | Plano de contas. |
| `CODCONTACTB` | Conta contábil. |
| `CODCUSTO` | Centro de custo. |
| `UFEMBARQUE`, `LOCALEMBARQUE` | Local de embarque (transporte). |
| `CODMUNICFEDERAL_ORIGEM`, `CODMUNICFEDERAL_DESTINO` | Município origem/destino. |
| `MATSERUTILIZADOMESANTERIOR` | Flag S/N. |
| `TELANF` | Telefone na NF. |

---

## 5. Fluxo operacional NF → CPG → Pagamento

```
   FORNECEDOR
       │
       │ emite NF
       ▼
┌──────────────────┐
│ BGM_NOTAFISCAL   │  Status='A' (Aberta)
│    + itens       │
│    + parcelas    │
└──────────────────┘
       │
       │ usuário efetiva (Status='F')
       ▼
┌──────────────────┐         ┌──────────────────┐
│   Geração        │────────▶│  CPGDOCTO        │  Status='A'
│ automática CPG   │ N parc. │  + CPGITDOC      │
└──────────────────┘         └──────────────────┘
                                    │
                                    │ ciclo de aprovação
                                    │ (PAGAMENTOLIBERADO='S')
                                    ▼
                             ┌──────────────────┐
                             │  Remessa banco   │
                             │  (NROREMESSAPE)  │
                             └──────────────────┘
                                    │
                                    │ retorno banco / pagamento PIX
                                    ▼
                             ┌──────────────────┐
                             │ STATUSDOCTOCPG='F'│
                             │ QUITADO='S'      │
                             │ PAGAMENTOCPG=dt  │
                             └──────────────────┘
                                    │
                                    │ paralelo
                                    ▼
                             ┌──────────────────┐
                             │   Integração     │
                             │  CTB, ESF, BCO   │
                             └──────────────────┘
```

### Observações sobre o fluxo

- **Uma NF parcelada em N vezes** gera **N registros** em `EST_VENCTONF` **e N registros** em `CPGDOCTO` (um por parcela).
- O somatório de `EST_VENCTONF.VALORVENCTONF` ≈ soma de `CPGDOCTO.VLR_ORIGINAL` quando a integração rodou corretamente. **Divergência → investigar `LANCTOINTEGRADOCPG` da NF.**
- `CPGDOCTO` recebe lançamentos diretos que **não passam por NF** (folha, impostos diretos, ressarcimentos, IPVA). Por isso `SUM(CPGDOCTO) > SUM(parcelas de NF)` é normal.
- Retenções de imposto na fonte geram **títulos-filho** em `CPGDOCTO` (`CODDOCTOCPG_INSS`, `_IRRF`, `_PIS`, etc.), cada um a pagar para o fisco. O valor líquido pago ao fornecedor = valor original − retenções.

---

## 6. Padrões de status, filtros e exclusões

### Status de documento (`STATUSNF` / `STATUSDOCTOCPG` / `STATUSITENSNF`)

| Valor | Significado | Tratamento típico em relatórios |
|---|---|---|
| `A` | Aberto / Em digitação | **Excluir** em relatórios financeiros oficiais (não efetivado ainda). |
| `F` | Finalizado / Efetivado | **Incluir.** Documento válido. |
| `C` | Cancelado | **Excluir sempre.** |

### Filtros obrigatórios em relatórios

```sql
-- Padrões reusáveis:
AND R.STATUSNF        = 'F'
AND I.STATUSITENSNF  <> 'C'
AND D.STATUSDOCTOCPG <> 'C'
AND R.CODTPDOC        = 'NF'   -- quando se quer só NF (excluir CTE, etc.)
```

### Exclusão padrão de material 95079

Em todas as queries financeiras analisadas, há a exclusão:

```sql
AND I.CODIGOMATINT <> 95079
```

**Provável motivação:** material técnico usado para registrar frete embutido, ajuste ou diferença — pode distorcer somatórios se incluído. **Validar localmente** o que é este material:

```sql
SELECT CODIGOMATINT, CODIGOINTERNOMATERIAL, DESCRICAOMAT, TPMATERIAL
FROM   EST_CADMATERIAL
WHERE  CODIGOMATINT = 95079;
```

### Filtro de intervalo de mês

Para evitar perder lançamentos do último dia que tenham horário > 00:00:00, **prefira intervalo semi-aberto**:

```sql
-- Recomendado:
AND CAMPO_DATA >= TRUNC(SYSDATE,'MM')
AND CAMPO_DATA <  TRUNC(ADD_MONTHS(SYSDATE,1),'MM')

-- Equivalente para "mês corrente" via BETWEEN (cuidado: trunca último dia em 00:00:00):
AND CAMPO_DATA BETWEEN TRUNC(SYSDATE,'MM') AND LAST_DAY(TRUNC(SYSDATE))
```

---

## 7. Análises possíveis com este escopo

| Indicador / Relatório | Tabelas envolvidas | Métrica-base |
|---|---|---|
| Volume mensal de compras | `BGM_NOTAFISCAL` + `EST_ITENSNF` | `SUM(VALORTOTALITENSNF)` |
| Volume mensal de pagamentos programados (via NF) | `BGM_NOTAFISCAL` + `EST_VENCTONF` | `SUM(VALORVENCTONF)` |
| Carteira a pagar do mês (total) | `CPGDOCTO` + `CPGITDOC` | `SUM(VALORITEMDOC)` |
| Diferença NF vs CPG (lançamentos não-NF) | `CPGDOCTO` + `BGM_NOTAFISCAL` | `CPGDOCTO` sem link com `CODDOCTOCPG` em `BGM_NOTAFISCAL` |
| Top fornecedores do mês | `BGM_NOTAFISCAL.CODIGOFORN` | Agregação por fornecedor |
| Gasto por categoria de compra | `EST_GRUPOCOMPRAS.DESCRICAOGRC` | Agregação por GRC |
| Gasto por tipo de despesa (incl. não-NF) | `CPGITDOC.CODTPDESPESA` | Agregação por tipo despesa |
| Concentração em diesel / lubrificantes / peças | `EST_GRUPOCOMPRAS` filtrado | Subset por GRC específico |
| Pagamento antecipado vs no vencimento vs atrasado | `CPGDOCTO.PAGAMENTOCPG` vs `VENCIMENTOCPG` | Diferença de dias |
| Carteira vencida em aberto | `CPGDOCTO` com `VENCIMENTOCPG < SYSDATE` e `QUITADODOCTOCPG = 'N'` | `SUM(VLR_ORIGINAL)` |
| Mix de modalidades de pagamento | `CPGDOCTO.MODALIDADEPE`, `TIPO_CHAVE_PIX_FAV` | Contagem/Soma |
| Análise de prazo médio NF→pagamento | `BGM_NOTAFISCAL.DATAEMISSAONF` × `CPGDOCTO.PAGAMENTOCPG` | Média de dias |
| Retenções totais na fonte (mensal) | `CPGDOCTO.VLRINSSCPG`, `VLRIRRFCPG`, etc. | Soma |
| Carga tributária por NF | `BGM_NOTAFISCAL` campos de imposto | Somas |

---

## 8. Campos prioritários para enriquecimento

Sugestão de ordem de adição aos relatórios atuais, ordenada por valor analítico:

### Prioridade alta

1. **`EST_GRUPOCOMPRAS.DESCRICAOGRC`** — quebra por categoria de compra. Mudança simples (já há join), só falta levar ao SELECT/GROUP BY.
2. **`CPGITDOC.CODTPDESPESA`** — quebra por tipo de despesa no CPG. Permite ver gastos não-NF (folha, impostos diretos, etc.).
3. **`BGM_NOTAFISCAL.CODIGOFORN`** + tabela de cadastro de fornecedor — top fornecedores.
4. **`CPGDOCTO.QUITADODOCTOCPG`** + `PAGAMENTOCPG` — quanto da carteira já foi efetivamente paga.

### Prioridade média

5. **`CPGDOCTO.MODALIDADEPE`, `TIPO_CHAVE_PIX_FAV`** — mix de modalidades de pagamento.
6. **`EST_VENCTONF.DIASVENCTONF`** — prazo médio de compra.
7. **`BGM_NOTAFISCAL.NATUREZAOPERACAONF`** — tipos de operação (revenda, consumo, ativo imobilizado).
8. **`CPGDOCTO.VLRINSSCPG, VLRIRRFCPG, VLRPISCPG, VLRCOFINSCPG, VLRCSLCPG, VLRISSCPG`** — bloco de retenções na fonte.

### Prioridade baixa (consulta específica)

9. Campos de reforma tributária (`CBS`, `IBSMUNICIPAL`, `IBSESTADUAL`) — relevância crescerá conforme a transição.
10. `BGM_NOTAFISCAL.CHAVEDEACESSONFE` — para conciliação SEFAZ.

---

## 9. Limitações e cuidados

### 9.1 Dicionário sem comentários

- `ALL_TAB_COMMENTS` e `ALL_COL_COMMENTS` estão vazios para todas as tabelas do GLOBUS.
- Significados foram inferidos por nome e contexto. **Sempre validar com amostra de dados** (`SELECT * FROM tabela WHERE ROWNUM = 1`) antes de usar em produção.

### 9.2 Códigos de empresa potencialmente distintos

`BGM_NOTAFISCAL` tem `CODIGOEMPRESA` **e** `CODIGOEMPRESATIPODOC`. Eles podem ser diferentes (NF emitida pela filial X registrada como tipo-de-doc da filial Y). **Para análises gerenciais use `CODIGOEMPRESA`.**

### 9.3 Múltiplas datas com semânticas diferentes

| Campo | O que registra |
|---|---|
| `DATAEMISSAONF` | Data fiscal (quando o fornecedor emitiu) |
| `ENTRADASAIDANF` | Data de entrada da mercadoria |
| `DATALANCTO` | Data de lançamento no GLOBUS (operacional) |
| `DATASAIDANF` | Data de saída específica |

Defina explicitamente qual data fundamenta cada relatório.

### 9.4 BETWEEN em DATE — cuidado com o horário

Oracle `DATE` armazena horário. `BETWEEN '01/05/2026' AND '31/05/2026'` em formato `DD/MM/YYYY` resolve para `31/05/2026 00:00:00` e **perde** lançamentos de `31/05/2026 09:15:42`. Use intervalo semi-aberto (ver seção 6).

### 9.5 Reforma tributária — campos ainda zerados

Os campos `CBS`, `IBS*`, `ALIQEFETCBS`, etc. existem no schema mas estarão zerados até a entrada em vigor da nova tributação. Não os use em análises **antes** da virada.

### 9.6 Material 95079

Excluído por padrão em consultas legadas. Validar localmente o que é este material — pode ser específico desta instalação da Pioneira.

### 9.7 Soft delete vs hard delete

- `EST_CADMATERIAL.DATAEXCLUSAOMAT` indica exclusão lógica — o registro permanece.
- `CPGDOCTO.STATUSDOCTOCPG = 'C'` indica cancelamento — o registro permanece.
- Em ambos os casos, filtre explicitamente. **Não confie em "tabela limpa".**

### 9.8 Performance

- `BGM_NOTAFISCAL` e `CPGDOCTO` são tabelas grandes em produção. Filtros por **data** e **empresa** são essenciais — sem eles a query pode levar minutos.
- Os índices padrão da Praxio costumam cobrir `(CODIGOEMPRESA, DATAEMISSAONF)`, `(CODIGOEMPRESA, VENCIMENTOCPG)` e `(CODIGOFORN)`. Confirmar com `USER_INDEXES` se necessário.

---

## 10. Glossário

| Sigla | Significado |
|---|---|
| **BGM** | Base Geral / Movimento (núcleo comum do GLOBUS) |
| **BPE** | Bilhete de Passagem Eletrônico |
| **CBS** | Contribuição sobre Bens e Serviços (reforma tributária) |
| **CFOP** | Código Fiscal de Operações e Prestações |
| **COFINS** | Contribuição para Financiamento da Seguridade Social |
| **CPG** | Contas a Pagar (módulo) |
| **CRC** | Contas a Receber (módulo) |
| **CSLL** | Contribuição Social sobre o Lucro Líquido |
| **CST** | Código de Situação Tributária |
| **CTB** | Contábil (módulo) |
| **CTE** | Conhecimento de Transporte Eletrônico |
| **DARF** | Documento de Arrecadação de Receitas Federais |
| **DCTF** | Declaração de Débitos e Créditos Tributários Federais |
| **DIFAL** | Diferencial de Alíquota |
| **DPVAT** | Seguro Obrigatório de Veículos |
| **ESF** | Escrita Fiscal (módulo) |
| **EST** | Estoque (módulo) |
| **FCP** | Fundo de Combate à Pobreza |
| **FLP** | Folha de Pagamento (módulo) |
| **FRT** | Frota (módulo) |
| **GRC** | Grupo de Compras |
| **GRR** | Grupo de Ressuprimento |
| **GRD** | Grupo de Despesa |
| **GRE** | Grupo de Estoque |
| **GRCON** | Grupo de Consumo |
| **IBS** | Imposto sobre Bens e Serviços (reforma tributária) |
| **ICMS** | Imposto sobre Circulação de Mercadorias e Serviços |
| **ICMS ST** | ICMS Substituição Tributária |
| **IPI** | Imposto sobre Produtos Industrializados |
| **IPVA** | Imposto sobre Propriedade de Veículos Automotores |
| **IRRF** | Imposto de Renda Retido na Fonte |
| **ISS** | Imposto Sobre Serviços |
| **NCM** | Nomenclatura Comum do Mercosul |
| **NFe** | Nota Fiscal Eletrônica (modelo 55) |
| **OP** | Ordem de Pagamento |
| **PE** | Pagamento Eletrônico |
| **PIS** | Programa de Integração Social |
| **RM/RQ** | Requisição de Material |
| **SEFIP** | Sistema de Recolhimento do FGTS e Informações à Previdência Social |
| **SEMOB** | Secretaria de Transporte e Mobilidade do DF |
| **SEST/SENAT** | Serviço Social do Transporte / Serviço Nacional de Aprendizagem do Transporte |
| **SPED** | Sistema Público de Escrituração Digital |
| **STPC** | Sistema de Transporte Público Coletivo |
| **TPDESPESA** | Tipo de Despesa |
| **TPRECEITA** | Tipo de Receita |
| **UF** | Unidade Federativa |

---

## 11. Apêndice A — Consulta ao dicionário

### Para descobrir colunas de uma tabela

```sql
SELECT  c.TABLE_NAME,
        c.COLUMN_ID,
        c.COLUMN_NAME,
        c.DATA_TYPE
            || CASE
                 WHEN c.DATA_TYPE IN ('VARCHAR2','CHAR','NVARCHAR2','NCHAR')
                      THEN '(' || c.DATA_LENGTH || ')'
                 WHEN c.DATA_TYPE = 'NUMBER' AND c.DATA_PRECISION IS NOT NULL
                      THEN '(' || c.DATA_PRECISION || ',' || NVL(c.DATA_SCALE,0) || ')'
                 ELSE NULL
               END                                  AS TIPO,
        c.NULLABLE,
        cc.COMMENTS                                  AS DESCRICAO
FROM    ALL_TAB_COLUMNS    c
LEFT JOIN ALL_COL_COMMENTS cc
       ON  cc.OWNER       = c.OWNER
       AND cc.TABLE_NAME  = c.TABLE_NAME
       AND cc.COLUMN_NAME = c.COLUMN_NAME
WHERE   c.TABLE_NAME IN ( 'BGM_NOTAFISCAL',
                          'EST_ITENSNF',
                          'EST_CADMATERIAL',
                          'EST_GRUPOCOMPRAS',
                          'EST_VENCTONF',
                          'CPGDOCTO',
                          'CPGITDOC' )
  AND   c.OWNER = 'GLOBUS'    -- ajustar conforme schema
ORDER   BY c.TABLE_NAME, c.COLUMN_ID;
```

### Para localizar uma coluna em qualquer tabela

```sql
SELECT TABLE_NAME, COLUMN_NAME
FROM   ALL_TAB_COLUMNS
WHERE  COLUMN_NAME LIKE '%TERMO_BUSCA%'
  AND  OWNER = 'GLOBUS'
ORDER  BY TABLE_NAME, COLUMN_ID;
```

### Para ver chaves estrangeiras de uma tabela

```sql
SELECT  c.CONSTRAINT_NAME,
        c.TABLE_NAME,
        cc.COLUMN_NAME,
        r.TABLE_NAME      AS REFERENCED_TABLE,
        rcc.COLUMN_NAME   AS REFERENCED_COLUMN
FROM    ALL_CONSTRAINTS      c
JOIN    ALL_CONS_COLUMNS    cc  ON cc.CONSTRAINT_NAME = c.CONSTRAINT_NAME
                               AND cc.OWNER          = c.OWNER
JOIN    ALL_CONSTRAINTS      r  ON r.CONSTRAINT_NAME = c.R_CONSTRAINT_NAME
                               AND r.OWNER          = c.R_OWNER
JOIN    ALL_CONS_COLUMNS    rcc ON rcc.CONSTRAINT_NAME = r.CONSTRAINT_NAME
                               AND rcc.OWNER         = r.OWNER
                               AND rcc.POSITION      = cc.POSITION
WHERE   c.CONSTRAINT_TYPE = 'R'
  AND   c.TABLE_NAME      = 'BGM_NOTAFISCAL'  -- ajustar
  AND   c.OWNER           = 'GLOBUS'
ORDER   BY c.TABLE_NAME, cc.POSITION;
```

### Para amostrar dados de uma tabela

```sql
SELECT * FROM BGM_NOTAFISCAL WHERE ROWNUM <= 10;
```

---

## 12. Apêndice B — Próximos passos sugeridos

Em ordem de utilidade prática:

1. **Mapear `BGM_FORNECEDOR`** — para complementar análises com nome do fornecedor e CNPJ.
2. **Mapear `BGM_CLIENTE`** — equivalente para o lado de saída (NFs de saída, CRC).
3. ✅ **Tipos de despesa** — resolvido (28/05/2026): a tabela é **`CPGTPDES`** (`CODTPDESPESA → DESCTPDESPESA`). Ver seção 4.3.2.
4. ✅ **Centros de custo (setor)** — resolvido (28/05/2026): o centro de custo **financeiro** é **`CPGCUSTOS`** (`CPGITDOC.CODCUSTOFIN → CPGCUSTOS.CODIGO`), e é a fonte oficial do **setor** no SFN. Ver seção 4.3.1 e o box em 4.3. (O `CTB_CADCCUSTO` é o contábil, não usado.)
5. **Documentar a tabela de Lançamentos Contábeis (`CTBLANCA`)** — fechar o ciclo NF → CPG → CTB → BCO.
6. **Mapear `BCOMOVTO`** — pagamento efetivo no banco, conciliação bancária.
7. **Mapear tabelas de orçamento (`CPGORC...`)** — análise orçado × realizado.

---

**Fim do documento.**

*Versão 1.0 — preparado por Leonardo, Viação Pioneira, 13 de maio de 2026.*
