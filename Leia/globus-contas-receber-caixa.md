# Globus — Contas a Receber (CRC) e Fluxo de Caixa Operacional

**Autor:** Leonardo · **Empresa:** Viação Pioneira Ltda. · **Sistema:** GLOBUS (Praxio) · **Versão:** 1.0 · **Data:** 14 de maio de 2026

> Documentação **validada com queries read-only** no banco Oracle de produção em 2026-05-14. Cobre o módulo **CRC (Contas a Receber)** — mirror do CPG documentado em `globus-tabelas-financeiras-documentacao.md` — e a tabela de **fechamento de caixa operacional** (`T_ARR_RELFECHCAIXA`, 1.5M linhas).

---

## Sumário

1. [Volumetria descoberta](#1-volumetria-descoberta)
2. [CRCDOCTO — Cabeçalho dos títulos a receber](#2-crcdocto--cabeçalho-dos-títulos-a-receber)
3. [CRCITDOC — Itens dos títulos (valor real)](#3-crcitdoc--itens-dos-títulos-valor-real)
4. [CRCTPREC — Tipos de receita (plano de contas)](#4-crctprec--tipos-de-receita-plano-de-contas)
5. [Tipos de documento (CODTPDOC) usados pela Pioneira](#5-tipos-de-documento-codtpdoc-usados-pela-pioneira)
6. [Status dos títulos](#6-status-dos-títulos)
7. [BGM_CLIENTE — Cadastro de clientes](#7-bgm_cliente--cadastro-de-clientes)
8. [BCOBANCO — Bancos parceiros](#8-bcobanco--bancos-parceiros)
9. [CRC_/CPG_OCORRENCIASBANCARIAS — Códigos CNAB](#9-crccpg_ocorrenciasbancarias--códigos-cnab)
10. [T_ARR_RELFECHCAIXA — Fechamento de caixa operacional](#10-t_arr_relfechcaixa--fechamento-de-caixa-operacional)
11. [Queries de referência (já testadas)](#11-queries-de-referência-já-testadas)
12. [Modelo canônico proposto](#12-modelo-canônico-proposto)

---

## 1. Volumetria descoberta

Queries `SELECT` rodadas em 14/05/2026 contra `GLOBUS@10.0.1.191/orcl_pdb1`:

### Tabelas de receita (todo o consórcio)

| Tabela | Linhas totais | Função |
|---|---:|---|
| `GLOBUS.CRCDOCTO` | **69.140** | Cabeçalho dos títulos a receber |
| `GLOBUS.CRCITDOC` | **74.352** | Itens (1 título → N itens, média 1.07) |
| `GLOBUS.CRCDOCTO_HISTORICO_NEGOCIACOES` | 144.487 | Histórico de renegociações |
| `GLOBUS.CRCVLRCOMPLDOCTOS` | 4.135 | Valores complementares |
| `GLOBUS.CRCTPREC` | 241 | Tipos de receita (plano de contas) |

### Volume Pioneira (`CODIGOEMPRESA = 4`), últimos 365 dias

| Status | Qtd títulos | Valor total R$ |
|---|---:|---:|
| **B (Baixado)** | 461 | 557.386.773,67 |
| **N (Normal/aberto)** | 1.012 | 633.119.145,51 |
| **C (Cancelado)** | 37 | 8.324.354,02 |
| **Total** | **1.510** | **≈ R$ 1,2 bilhão** |

### Operacional (`T_ARR_RELFECHCAIXA`) — Pioneira últimos 4 meses

| Mês | Qtd guias |
|---|---:|
| 2026-05 (parcial) | 13.810 |
| 2026-04 | 63.807 |
| 2026-03 | 22.003 |
| 2026-02 | 513 |

> ⚠ Campos `VLR_DINHEIRO`, `LANCC`, `LANCD`, `COMISSAO`, `DESPESAS` vieram **zerados** para a Pioneira em todos os meses testados. Confirmar com a equipe se: (a) Pioneira não usa esses campos (operação sem bilheteiro físico, tudo via cartão/bilhetagem eletrônica), ou (b) há outra tabela com os valores reais (vide `T_ARR_DETALHE_GUIA` documentada em `globus-arrecadacao-operacional.md`).

---

## 2. `CRCDOCTO` — Cabeçalho dos títulos a receber

**94 colunas. Mirror estrutural do `CPGDOCTO`.** Principais:

### Identificação
| Coluna | Tipo | Função |
|---|---|---|
| `CODDOCTOCRC` | NUMBER (PK) | Chave natural do título |
| `CODCLI` | NUMBER (FK) | → `BGM_CLIENTE.CODCLI` |
| `CODIGOEMPRESA` | NUMBER | Empresa (4 = Pioneira) |
| `CODIGOFL` | NUMBER | Filial (1 = principal) |
| `CODTPDOC` | VARCHAR2(3) | Tipo: 'AD', 'VT', 'RDH', 'EMV', 'INT', 'PNE', 'PLE', 'FAT' (ver §5) |
| `NRODOCTOCRC` | VARCHAR2(10) | Número do documento (formato 'NNNNNNN/AA') |
| `SERIEDOCTOCRC` | VARCHAR2(5) | Série (ex.: 'FT001') |
| `NROPARCELACRC` | NUMBER | Número da parcela (1, 2, 3…) |
| `SISTEMA` | VARCHAR2(3) | Sistema integrador (ex.: 'CGS') |

### Datas
| Coluna | Significado |
|---|---|
| `EMISSAOCRC` | Data de emissão do título |
| `SAIDACRC` | Data de saída do produto/serviço |
| `VENCIMENTOCRC` | **Data de vencimento atual** (após renegociações) |
| `VENCIMENTOORIGINALCRC` | Data de vencimento original (antes de renegociações) |
| `RECEBIMENTOCRC` | Data efetiva do recebimento (NULL se não recebido) |
| `DATA_INCLUSAO` | Quando o registro foi criado |
| `ALTERADOEM` | Última alteração |
| `DATAPROTESTO` | Data do protesto (se houver) |

### Status / quitação
| Coluna | Valores | Significado |
|---|---|---|
| `STATUSDOCTOCRC` | `B` / `N` / `C` | Baixado / Normal-aberto / Cancelado |
| `QUITADODOCTOCRC` | `S` / `N` | Quitado? |
| `RENEGOCIADO` | `S` / `N` | Houve renegociação? |
| `PROTESTADO` | `S` / `N` | Foi protestado? |
| `FATURA_IMPRESSA` | `S` / `N` | Boleto/fatura já impresso? |

### Impostos retidos pelo cliente (na fonte)
| Coluna | Imposto |
|---|---|
| `VLRINSSCRC` | INSS retido |
| `VLRIRRFCRC` | IRRF retido |
| `VLRPISCRC` | PIS retido |
| `VLRCOFINSCRC` | COFINS retido |
| `VLRCSLCRC` | CSLL retido |
| `VLRISSCRC` | ISS retido |
| `DESCONTOCRC` | Desconto concedido |
| `ACRESCIMOCRC` | Acréscimo aplicado |

### Cobrança eletrônica (CNAB)
| Coluna | Significado |
|---|---|
| `CODBANCO` | → `BCOBANCO.CODBANCO` (banco do cliente / cobrança) |
| `CODAGENCIA` | Agência |
| `CODCONTABCO` | Conta corrente |
| `COBELETNOSSONUMERO` | "Nosso número" do boleto |
| `COBELETCARTEIRA` | Carteira de cobrança |
| `COBELETSTATUS`, `COBELETSTATUSMOD` | Status no banco |
| `COBELETDTENVIO` | Data de envio da remessa |
| `COBELETNRREMESSA` | Número da remessa CNAB |
| `COBELETREGISTRADO` | `S` / `N` — boleto registrado? |
| `COBELETMSGBOLETO` | Mensagem livre no boleto (até 400 chars) |
| `COBELETMOTIVO` | Motivo de retorno (caso rejeitado) |
| `INSTRUCAO_PROTESTO` | Código da instrução de protesto |
| `TIPO_REGISTRO_COBRANCA` | Padrão do registro |

### Cartão de crédito / TEF
| Coluna | Significado |
|---|---|
| `CARTAO_CODAUTORIZ` | Código de autorização |
| `CARTAO_TID` | TID da transação |
| `CARTAO_ESTABEL` | Código do estabelecimento |
| `NROTOTALPARCELAS_CARTAO` | Parcelas no cartão |
| `CARTAO_RESUMO` | Resumo de vendas |
| `TIPOMOVTO_CARTAO` | Tipo do movimento |

### Renegociação / substituição
| Coluna | Significado |
|---|---|
| `CODDOCTOCRCSUBST` | Título que foi substituído por este |
| `CODCLIANTSUB` | Cliente anterior (caso houve substituição) |
| `DOCTODESUBSTITUICAO` | `S` / `N` — é resultado de substituição? |
| `CODDOCTOCRC_DEVOL` | Caso seja devolução, → título original |
| `CODDOCTOCRC_ADTO` | Caso seja adiantamento, → título original |
| `VALOR_ADTO`, `VALOR_DEVOL` | Valores de adiantamento/devolução |

### Auditoria
| Coluna | Significado |
|---|---|
| `USUARIO`, `USUARIO_INCLUSAO` | Usuário Praxio que criou |
| `USUARIOCRC_EXC` | Usuário que excluiu (se aplicável) |
| `DATAHORACRC_EXC` | Quando excluiu |

### Novidades 2025+
| Coluna | Significado |
|---|---|
| `CBS` | Contribuição sobre Bens e Serviços (Reforma Tributária) |
| `IBSESTADUAL` / `IBSMUNICIPAL` | Imposto sobre Bens e Serviços |
| `IRAUTORETIDO` | IR auto-retido |

---

## 3. `CRCITDOC` — Itens dos títulos (valor real)

**11 colunas. ⚠ É AQUI que mora o `VALORITEMDOC` — `CRCDOCTO` NÃO tem coluna de valor principal.**

| Coluna | Tipo | Função |
|---|---|---|
| `CODDOCTOCRC` | NUMBER (FK) | → `CRCDOCTO.CODDOCTOCRC` |
| `CODITEMDOCCRC` | NUMBER | Sequência do item dentro do título |
| **`VALORITEMDOC`** | NUMBER | **Valor do item em reais (com decimais)** ⭐ |
| `CODTPRECEITA` | VARCHAR2(5) | → `CRCTPREC.CODTPRECEITA` |
| `CODCONTACTB` | NUMBER | Conta contábil (plano contábil interno) |
| `CODCUSTO` | NUMBER | Centro de custo |
| `CODCUSTOFIN` | NUMBER | Centro de custo financeiro |
| `NROPLANO` | NUMBER | Plano (ex.: 1) |
| `OBSITEMDOCTOCRC` | VARCHAR2 | Observação (ex.: "INTEGRAÇÃO ARR/CRC-CARTÃO ESTUDANTIL") |
| `ITEMRATEADO` | VARCHAR2(1) | `S` / `N` |
| `CODGRPRATEIO` | NUMBER | Se rateado, grupo de rateio |

> **Como obter o valor de um título**: `SUM(I.VALORITEMDOC) FROM CRCITDOC I WHERE I.CODDOCTOCRC = :id`

---

## 4. `CRCTPREC` — Tipos de receita (plano de contas)

**241 tipos.** Mistura plano contábil hierárquico + categorias operacionais.

### Estrutura

| Coluna | Significado |
|---|---|
| `CODTPRECEITA` | Código (ex.: 40081) |
| `DESCTPRECEITA` | Descrição |
| `CLASSIFICADOR` | Hierarquia contábil (ex.: '1.1.1.05.001') |
| `ACEITALANCAMENTO` | `S` / `N` — permite lançamentos? |
| `EXIGECCUSTOSFIN` | Exige centro de custo? |
| `CODIGO_SERVICO` | Código de serviço (ISS) |
| `TIPO_ITEM`, `UNI_MEDIDA` | Unidade de medida |

### Exemplos reais encontrados

| CodTpReceita | DescTpReceita | Classificador | Categoria |
|---|---|---|---|
| 40024 | Receita de Integração | 1.1.1.01.022 | Receita operacional |
| 40080 | Receita de PNE - Cortesia | 1.1.1.05.000 | Gratuidade |
| **40081** | **Santa Maria** | 1.1.1.05.001 | **Linha de ônibus** |
| **40082** | **Gama** | 1.1.1.05.002 | **Linha de ônibus** |
| **40083** | **São Sebastião** | 1.1.1.05.003 | **Linha de ônibus** |
| 41603 | Antecipação de Clientes | 2.1.1.17.003 | Passivo |
| 40806 | Bradesco S/A | 2.1.1.08.006 | Conta bancária |
| 41806 | Banco Safra S/A | 2.1.1.19.006 | Conta bancária |

> 💡 **Insight contábil**: O CRCTPREC funciona como plano de contas. O prefixo `1.1.1.x` parece ser **receita operacional** (cada cidade/linha é uma conta), e `2.1.1.x` são **passivos** (bancos, antecipações). Confirmar com a contabilidade da Pioneira.

---

## 5. Tipos de documento (`CODTPDOC`) usados pela Pioneira

Top 7 em volume nos últimos 365 dias (`empresa=4`, `STATUS<>'C'`):

| `CODTPDOC` | Qtd | Significado provável |
|---|---:|---|
| **AD** | 464 | Adiantamento (entrada antecipada de cliente) |
| **VT** | 257 | Vale-Transporte (empresas pagando VT corporativo) |
| **RDH** | 243 | ? — confirmar (Receita-Direito-Habitação? RecibodeHonorários?) |
| **EMV** | 234 | EMV — transações cartão (Europay/Mastercard/Visa)? |
| **INT** | 231 | Integração (passageiro com cartão integrado entre linhas) |
| **PNE** | 22 | Pessoa com Necessidades Especiais (cortesia) |
| **PLE** | 22 | Passe Livre Estudantil? |

> ⚠ **Confirmar com a equipe** os 4 códigos não óbvios (RDH, EMV, PLE). Rodar no PL/SQL:
> ```sql
> SELECT CODTPDOC, COUNT(*) qtd
> FROM   CRCDOCTO WHERE CODIGOEMPRESA = 4
> GROUP  BY CODTPDOC ORDER BY 2 DESC;
> ```
> E pegar a descrição em uma tabela `CRCTPDOC` (se existir).

---

## 6. Status dos títulos

`CRCDOCTO.STATUSDOCTOCRC` (1 char):

| Status | Significado | Volume Pioneira 365d |
|---|---|---:|
| **N** | Normal — em aberto (a receber ou em atraso) | 1.012 títulos · R$ 633M |
| **B** | Baixado — quitado / pago | 461 títulos · R$ 557M |
| **C** | Cancelado | 37 títulos · R$ 8,3M |

**Cálculo de aging** (atrasados vs em-dia):
```sql
SELECT CASE
         WHEN VENCIMENTOCRC < TRUNC(SYSDATE) THEN 'atrasado'
         WHEN VENCIMENTOCRC <= TRUNC(SYSDATE)+7  THEN 'vence_em_7d'
         WHEN VENCIMENTOCRC <= TRUNC(SYSDATE)+30 THEN 'vence_em_30d'
         ELSE 'futuro'
       END                AS faixa,
       COUNT(*)            AS qtd,
       ROUND(SUM(NVL((SELECT SUM(I.VALORITEMDOC) FROM CRCITDOC I WHERE I.CODDOCTOCRC=D.CODDOCTOCRC),0)),2) AS total
FROM   CRCDOCTO D
WHERE  D.CODIGOEMPRESA = 4
  AND  D.STATUSDOCTOCRC = 'N'
GROUP  BY 1
ORDER  BY 1;
```

---

## 7. `BGM_CLIENTE` — Cadastro de clientes

**5.118 clientes ativos, 176 colunas.** Mais completa que `BGM_FORNECEDOR`.

### Identificação e contato
`CODCLI` (PK), `NRCLI`, `RSOCIALCLI` (razão social), `NFANTASIACLI`, `TPINSCRICAOCLI` (CNPJ/CPF), `NRINSCRICAOCLI`, `INSCESTADUALCLI`, `INSCMUNICIPALCLI`

### Endereço principal
`ENDERECOCLI`, `BAIRROCLI`, `CIDADECLI`, `CEPCLI`, `UFCOBRANCACLI`, `TELEFONECLI`, `EMAILCLI`, `HOMEPAGECLI`

### Endereço de cobrança (separado)
`RSCOBRANCACLI`, `ENDCOBRANCACLI`, `BAIRROCOBRANCACLI`, `CIDADECOBRANCACLI`, `CEPCOBRANCACLI`, `TPINSCCOBRANCACLI`, `NRINSCCOBRANCACLI`

### Comercial / financeiro
`CONDICAOCLI` (A=ativo / I=inativo), `CONDRECEBCLI` (condição de recebimento), `TIPOCLI`, `TIPO_COBRANCA`, `TIPO_FATURA` (M=mensal), `LOCAL_COLETA`, `BANCO_FAT`, `AGENCIA_FAT`, `CONTA_FAT`, `EMITE_A_PRAZO`, `PERC_DESC_FAT`, `PROTESTAR`, `MICRO_EMPRESA`, `DATA_CADASTRO`, `DATAULTIMOMOVTOCLI`

> 💡 Para a aplicação financeira, **as 176 colunas** são exagero — vamos canonical com **~15 colunas essenciais** (identificação, CNPJ, endereço, dados bancários, situação).

---

## 8. `BCOBANCO` — Bancos parceiros

**44 bancos cadastrados.** Cadastro mínimo.

| Coluna | Função |
|---|---|
| `CODBANCO` | PK interna (não é o número Febraban!) |
| `NROBANCO` | Número Febraban (ex.: 260 = Nubank, 3 = Banco Luso) |
| `NOMEBANCO` | Nome (até 50 chars) |
| `HOMEPAGEBANCO` | URL |
| `DIGITOCONTA` | Dígito verificador padrão |
| `INSTITUICAO_PAGADORA` | Identifica se é instituição pagadora |
| `TIPO_PAGADORA` | `B` (banco) etc. |
| `ISBP` | Código ISPB do BCB (8 chars) — necessário para Pix |

---

## 9. `CRC_`/`CPG_OCORRENCIASBANCARIAS` — Códigos CNAB

Códigos de retorno dos bancos (padrão CNAB) — usados para conciliar os boletos enviados.

### `CRC_OCORRENCIASBANCARIAS` (178 códigos)
| Código | Descrição |
|---|---|
| 02 | Entrada Confirmada |
| 03 | Entrada Rejeitada |
| … | (mais 176 — todos disponíveis na tabela) |

### `CPG_OCORRENCIASBANCARIAS` (587 códigos)
| Código | Descrição |
|---|---|
| 00 | Crédito ou Débito Efetivado |
| 01 | Insuficiência de Fundos/Débito Não Efetuado |
| … | (mais 585) |

**Estrutura idêntica**: `CODIGO VARCHAR2(2)` + `DESCRICAO VARCHAR2(200/400)`.

> 💡 Estes catálogos devem ser **sincronizados na primeira carga** e raramente atualizados (mudam com revisões do CNAB).

---

## 10. `T_ARR_RELFECHCAIXA` — Fechamento de caixa operacional

**1.527.689 linhas** — tabela mais volumosa do schema. Granularidade: **1 linha por (guia × viagem × conferência)** — o fechamento do turno de um motorista.

### 33 colunas essenciais

| Bloco | Colunas |
|---|---|
| **Identificação** | `COD_SEQ_GUIA`, `COD_GUIA`, `COD_INTTURNO`, `TURNO`, `COD_INTTURNOCAIXA`, `TURNOCAIXA`, `CODINTLINHA`, `CODIGOLINHA`, `FLG_TIPO_GUIA` |
| **Empresa / responsáveis** | `COD_EMPRESA`, `CODIGOFL`, `COD_FUNC_CONF`, `CONF` (nome conferente), `COD_FUNC_RESP`, `RESP` (nome responsável) |
| **Datas** | `DAT_PREST_CONTAS` (prestação contas), `DAT_VIAGEM_GUIA` (operação) |
| **Local** | `COD_LOCAL_ARR`, `COD_LOCALARR_AGENCIA`, `AGENCIA`, `COD_TIPO_SERVICO` |
| **Valores R$** | `VLR_DINHEIRO`, `LANCC` (lanç. crédito), `LANCD` (lanç. débito), `COMISSAO`, `APROPRIA`, `VLR_PEDAGIO_2`, `DESPESAS`, `VALORVT` |
| **Eventos** | `ASSALTO_CADASTRO` (R$ subtraído por assalto cadastrado), `ASSALTO_GUIA` (R$ subtraído na guia), `LANC` |
| **Terminal** | `TERMINAL` (estação de trabalho onde foi feito o fechamento) |

> ⚠ **Anomalia detectada no teste**: para a Pioneira (empresa=4), os campos `VLR_DINHEIRO`, `LANCC`, `LANCD`, `COMISSAO`, `DESPESAS` voltam **zerados**. Isso sugere:
> - Pioneira **não opera com bilheteiro físico** (todo movimento é via bilhetagem eletrônica em `T_ARR_DETALHE_GUIA`)
> - OU a tabela é só "casca" e os valores estão em outras tabelas conexas
>
> **Próximo passo**: comparar com `T_ARR_DETALHE_GUIA` que tem `VLR_RECEB` real (documentada em `globus-arrecadacao-operacional.md`).

---

## 11. Queries de referência (já testadas)

### 11.1 Sumário de Contas a Receber

```sql
SELECT D.STATUSDOCTOCRC                                                            AS STATUS,
       COUNT(*)                                                                    AS QTD,
       ROUND(SUM(NVL((SELECT SUM(I.VALORITEMDOC) FROM GLOBUS.CRCITDOC I
                       WHERE I.CODDOCTOCRC = D.CODDOCTOCRC), 0)), 2)               AS TOTAL_R$
FROM   GLOBUS.CRCDOCTO D
WHERE  D.CODIGOEMPRESA  = :empresa
  AND  D.VENCIMENTOCRC >= :dt_ini
  AND  D.VENCIMENTOCRC <  :dt_fim_excl
GROUP  BY D.STATUSDOCTOCRC;
```

### 11.2 Lista de títulos com cliente e valor

```sql
SELECT D.CODDOCTOCRC,
       D.NRODOCTOCRC,
       D.SERIEDOCTOCRC,
       D.NROPARCELACRC,
       D.CODTPDOC,
       D.EMISSAOCRC,
       D.VENCIMENTOCRC,
       D.RECEBIMENTOCRC,
       D.STATUSDOCTOCRC,
       D.QUITADODOCTOCRC,
       C.RSOCIALCLI,
       C.NRINSCRICAOCLI                                                            AS CNPJ_CPF,
       (SELECT SUM(I.VALORITEMDOC) FROM GLOBUS.CRCITDOC I
         WHERE I.CODDOCTOCRC = D.CODDOCTOCRC)                                      AS VLR_TOTAL,
       D.VLRINSSCRC + D.VLRIRRFCRC + D.VLRPISCRC + D.VLRCOFINSCRC + D.VLRCSLCRC
         + D.VLRISSCRC                                                             AS VLR_RETENCOES,
       D.CODBANCO,
       D.COBELETNOSSONUMERO,
       D.COBELETSTATUS
FROM   GLOBUS.CRCDOCTO D
LEFT JOIN GLOBUS.BGM_CLIENTE C ON C.CODCLI = D.CODCLI
WHERE  D.CODIGOEMPRESA  = :empresa
  AND  D.VENCIMENTOCRC >= :dt_ini
  AND  D.VENCIMENTOCRC <  :dt_fim_excl
  AND  D.STATUSDOCTOCRC <> 'C'
ORDER  BY D.VENCIMENTOCRC DESC, D.CODDOCTOCRC;
```

### 11.3 Aging — atrasados, em-dia, futuros

```sql
SELECT CASE
         WHEN D.VENCIMENTOCRC <  TRUNC(SYSDATE)        THEN 'atrasado'
         WHEN D.VENCIMENTOCRC <= TRUNC(SYSDATE) + 7    THEN 'vence_em_7d'
         WHEN D.VENCIMENTOCRC <= TRUNC(SYSDATE) + 30   THEN 'vence_em_30d'
         ELSE 'futuro'
       END                                                                         AS FAIXA,
       COUNT(*)                                                                    AS QTD,
       ROUND(SUM(NVL((SELECT SUM(I.VALORITEMDOC) FROM GLOBUS.CRCITDOC I
                       WHERE I.CODDOCTOCRC = D.CODDOCTOCRC), 0)), 2)               AS TOTAL_R$
FROM   GLOBUS.CRCDOCTO D
WHERE  D.CODIGOEMPRESA = :empresa
  AND  D.STATUSDOCTOCRC = 'N'
GROUP  BY 1
ORDER  BY 1;
```

### 11.4 Receita por tipo (CODTPRECEITA) no mês

```sql
SELECT R.DESCTPRECEITA,
       R.CLASSIFICADOR,
       COUNT(*)                                  AS QTD_ITENS,
       ROUND(SUM(I.VALORITEMDOC), 2)             AS TOTAL_R$
FROM   GLOBUS.CRCITDOC      I
JOIN   GLOBUS.CRCDOCTO      D ON D.CODDOCTOCRC = I.CODDOCTOCRC
JOIN   GLOBUS.CRCTPREC      R ON R.CODTPRECEITA = I.CODTPRECEITA
WHERE  D.CODIGOEMPRESA  = :empresa
  AND  D.VENCIMENTOCRC >= :dt_ini
  AND  D.VENCIMENTOCRC <  :dt_fim_excl
  AND  D.STATUSDOCTOCRC <> 'C'
GROUP  BY R.DESCTPRECEITA, R.CLASSIFICADOR
ORDER  BY 4 DESC FETCH FIRST 30 ROWS ONLY;
```

### 11.5 Volume operacional por mês (sanidade)

```sql
SELECT TO_CHAR(DAT_PREST_CONTAS, 'YYYY-MM')                                        AS MES,
       COUNT(*)                                                                    AS QTD_GUIAS,
       COUNT(DISTINCT COD_FUNC_RESP)                                               AS QTD_RESPONSAVEIS,
       ROUND(SUM(NVL(VLR_DINHEIRO, 0)), 2)                                         AS DINHEIRO_R$
FROM   GLOBUS.T_ARR_RELFECHCAIXA
WHERE  DAT_PREST_CONTAS >= ADD_MONTHS(SYSDATE, -6)
  AND  COD_EMPRESA       = :empresa
GROUP  BY TO_CHAR(DAT_PREST_CONTAS, 'YYYY-MM')
ORDER  BY 1 DESC;
```

---

## 12. Modelo canônico proposto

### Schema `finance` (canonical PostgreSQL)

```sql
-- ============ CLIENTES ============
CREATE TABLE finance.clientes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          INT NOT NULL DEFAULT 1,
  origem_sistema      VARCHAR(40) NOT NULL DEFAULT 'globus',
  cod_cli             VARCHAR(40) NOT NULL,
  razao_social        VARCHAR(200) NOT NULL,
  nome_fantasia       VARCHAR(100),
  tipo_inscricao      VARCHAR(5),                  -- 'CNPJ' | 'CPF'
  numero_inscricao    VARCHAR(20),
  inscricao_estadual  VARCHAR(20),
  inscricao_municipal VARCHAR(20),
  email               VARCHAR(120),
  telefone            VARCHAR(30),
  endereco            VARCHAR(200),
  bairro              VARCHAR(50),
  cidade              VARCHAR(80),
  uf                  CHAR(2),
  cep                 VARCHAR(9),
  ativo               BOOLEAN NOT NULL DEFAULT true,
  banco_padrao        VARCHAR(20),
  agencia_padrao      VARCHAR(20),
  conta_padrao        VARCHAR(30),
  data_cadastro       DATE,
  ultimo_movto        DATE,
  ultimo_sync_em      TIMESTAMPTZ,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (origem_sistema, cod_cli)
);
CREATE INDEX clientes_doc_idx ON finance.clientes (numero_inscricao);
CREATE INDEX clientes_nome_idx ON finance.clientes USING gin (razao_social gin_trgm_ops);

-- ============ CONTAS A RECEBER ============
CREATE TYPE finance.cr_status AS ENUM ('aberto', 'pago', 'cancelado', 'renegociado', 'protestado');

CREATE TABLE finance.contas_receber (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  INT NOT NULL DEFAULT 1,
  cliente_id                  UUID REFERENCES finance.clientes(id),
  numero_documento            VARCHAR(40),
  serie_documento             VARCHAR(10),
  numero_parcela              INT,
  tipo_documento              VARCHAR(10),         -- AD, VT, RDH, EMV, INT, FAT, PNE, PLE
  data_emissao                DATE,
  data_vencimento             DATE NOT NULL,
  data_vencimento_original    DATE,
  data_recebimento            DATE,
  valor_bruto_cents           BIGINT NOT NULL,
  desconto_cents              BIGINT NOT NULL DEFAULT 0,
  acrescimo_cents             BIGINT NOT NULL DEFAULT 0,
  vlr_inss_cents              BIGINT NOT NULL DEFAULT 0,
  vlr_irrf_cents              BIGINT NOT NULL DEFAULT 0,
  vlr_pis_cents               BIGINT NOT NULL DEFAULT 0,
  vlr_cofins_cents            BIGINT NOT NULL DEFAULT 0,
  vlr_csll_cents              BIGINT NOT NULL DEFAULT 0,
  vlr_iss_cents               BIGINT NOT NULL DEFAULT 0,
  valor_liquido_cents         BIGINT GENERATED ALWAYS AS
    (valor_bruto_cents - desconto_cents + acrescimo_cents
     - vlr_inss_cents - vlr_irrf_cents - vlr_pis_cents
     - vlr_cofins_cents - vlr_csll_cents - vlr_iss_cents) STORED,
  status                      finance.cr_status NOT NULL DEFAULT 'aberto',
  quitado                     BOOLEAN NOT NULL DEFAULT false,
  renegociado                 BOOLEAN NOT NULL DEFAULT false,
  protestado                  BOOLEAN NOT NULL DEFAULT false,
  data_protesto               DATE,
  -- cobrança eletrônica (boleto)
  banco_cobranca              VARCHAR(20),
  agencia_cobranca            VARCHAR(20),
  conta_cobranca              VARCHAR(30),
  nosso_numero                VARCHAR(40),
  cobeletronica_status        VARCHAR(2),
  msg_boleto                  VARCHAR(500),
  -- cartão
  cartao_autorizacao          VARCHAR(40),
  cartao_tid                  VARCHAR(60),
  cartao_parcelas             INT,
  -- origem
  origem_sistema              VARCHAR(40) NOT NULL DEFAULT 'globus',
  origem_id_externo           VARCHAR(80) NOT NULL,
  origem_documento            VARCHAR(20),         -- 'fatura' | 'adiantamento' | 'integracao' | etc
  ultimo_sync_em              TIMESTAMPTZ,
  criado_em                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (origem_sistema, origem_id_externo)
);
CREATE INDEX cr_vencimento_idx ON finance.contas_receber (data_vencimento, status);
CREATE INDEX cr_cliente_idx ON finance.contas_receber (cliente_id, data_vencimento);
CREATE INDEX cr_status_idx ON finance.contas_receber (status, data_vencimento)
  WHERE status IN ('aberto', 'renegociado');

-- ============ ITENS DO CR (decomposição por tipo de receita) ============
CREATE TABLE finance.contas_receber_itens (
  id                  BIGSERIAL PRIMARY KEY,
  conta_receber_id    UUID NOT NULL REFERENCES finance.contas_receber(id) ON DELETE CASCADE,
  cod_tp_receita      VARCHAR(20),                 -- → tipo_receita
  conta_contabil      VARCHAR(40),
  centro_custo        VARCHAR(40),
  observacao          VARCHAR(200),
  valor_cents         BIGINT NOT NULL,
  origem_id_externo   VARCHAR(80),
  UNIQUE (conta_receber_id, origem_id_externo)
);

-- ============ PLANO DE RECEITA (catálogo CRCTPREC) ============
CREATE TABLE finance.tipos_receita (
  cod_tp_receita      VARCHAR(20) PRIMARY KEY,
  descricao           VARCHAR(200) NOT NULL,
  classificador       VARCHAR(40),                  -- '1.1.1.05.001'
  natureza            VARCHAR(20),                  -- 'receita_operacional' | 'passivo' | 'banco' | 'gratuidade' | ...
  origem_sistema      VARCHAR(40) NOT NULL DEFAULT 'globus',
  ultimo_sync_em      TIMESTAMPTZ
);

-- ============ BANCOS ============
CREATE TABLE finance.bancos (
  id                  SERIAL PRIMARY KEY,
  numero_febraban     INT NOT NULL UNIQUE,         -- 260, 3, etc
  nome                VARCHAR(80) NOT NULL,
  homepage            VARCHAR(120),
  ispb                VARCHAR(8),
  origem_sistema      VARCHAR(40) NOT NULL DEFAULT 'globus',
  origem_id_externo   VARCHAR(40),                  -- CODBANCO interno do Globus
  ultimo_sync_em      TIMESTAMPTZ,
  UNIQUE (origem_sistema, origem_id_externo)
);

-- ============ CÓDIGOS CNAB (RETORNO BANCÁRIO) ============
CREATE TABLE finance.cnab_ocorrencias (
  id            SERIAL PRIMARY KEY,
  modulo        VARCHAR(3) NOT NULL,                -- 'crc' | 'cpg'
  codigo        VARCHAR(2) NOT NULL,
  descricao     VARCHAR(400) NOT NULL,
  ultimo_sync_em TIMESTAMPTZ,
  UNIQUE (modulo, codigo)
);

-- ============ STAGE para sync idempotente (mesmo padrão do CPG/FLP) ============
CREATE TABLE integration.globus_crc_stage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_empresa  INT NOT NULL,
  cod_docto_crc   VARCHAR(40) NOT NULL,
  sync_job_id     UUID,
  raw_payload     JSONB NOT NULL,
  recebido_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processado_em   TIMESTAMPTZ,
  UNIQUE (codigo_empresa, cod_docto_crc)
);
```

### Modelo canônico para fluxo de caixa REAL (movimento bancário)

Para evitar confusão com `T_ARR_RELFECHCAIXA` (que parece estar zerada na Pioneira), o **fluxo de caixa real** virá de:

1. **CPG pago** (`finance.contas_pagar` com `status='pago'` e `data_pagamento` no dia) → saídas
2. **CRC recebido** (`finance.contas_receber` com `status='pago'` e `data_recebimento` no dia) → entradas
3. **Movimento bancário direto** (Open Finance — futuro) → conciliação

Tabela `finance.movimento_caixa` (já proposta em `previsao-fluxo-caixa.md`) é o agregado.

---

## 13. Próximos passos

1. ✅ **Validação read-only concluída** — todas as tabelas testadas com SQL no banco de prod
2. ⏳ **Confirmar com a equipe** os `CODTPDOC` não óbvios (RDH, EMV, PLE)
3. ⏳ **Confirmar** se `T_ARR_RELFECHCAIXA` é só esqueleto pra Pioneira (use `T_ARR_DETALHE_GUIA` em vez)
4. ⏳ Quando aprovado: **migration** das 7 tabelas canonical acima
5. ⏳ Adapter `globus-crc.adapter.ts` + ETL `crc.etl.ts` (mesmo padrão do CPG)
6. ⏳ Module `apps/FinancasBackend/src/modules/contas-receber/` (espelho do contas-pagar)
7. ⏳ UI `/contas-receber` (espelho do `/contas-pagar`, com aging, próximos vencimentos, top clientes)
