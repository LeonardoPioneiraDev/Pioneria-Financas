# Exploração GLOBUS — 2026-05-18

**Empresa:** Viação Pioneira (`CODIGOEMPRESA = 4`) · **Filial:** 1
**Owner do schema:** `GLOBUS` (confirmado)
**Sessão:** ampliação do mapa de `Leia/globus-tabelas-financeiras-documentacao.md` (13/05) com domínios bancário, fornecedor, tipos de despesa e volumetria real do mês corrente.

Regras seguidas em toda query: `empresa=4` · janela só do mês corrente · read-only · `NO_PARALLEL`. Ver [globus-sync-regras](../../.claude/.../memory/globus-sync-regras.md).

---

## 1. Volumetria real do mês corrente

Medições efetivas (não estimativas) — base para dimensionar batches do sync.

### CP (CPGDOCTO)

- **1.975 títulos** no mês (`VENCIMENTOCPG` em `[1º dia mês, próximo mês)`, `STATUSDOCTOCPG <> 'C'`)

Distribuição por `CODTPDOC`:

| Tipo | Qtd | % | Observação |
|---|---|---|---|
| `NF` | 900 | 45,6 % | nota fiscal de entrada |
| `REC` | 479 | 24,3 % | recibo |
| `BOL` | 339 | 17,2 % | boleto |
| `NFV` | 97 | 4,9 % | NF avulsa |
| `BO` | 34 | 1,7 % | |
| `DAR` | 29 | 1,5 % | DARF |
| `FIN` | 26 | 1,3 % | financeiro |
| **`002`** | **21** | **1,1 %** | ⚠️ código sujo |
| `NFS` | 17 | 0,9 % | NF serviço |
| `AD` | 17 | 0,9 % | adiantamento |
| **`001`** | **13** | **0,7 %** | ⚠️ código sujo |
| `RET` | 2 | 0,1 % | retenção |
| `GPS` | 1 | 0,1 % | guia previdência |

Distribuição por `MODULO_INCLUSAO`:

| Módulo | Qtd | % |
|---|---|---|
| `NULL` | 1.169 | 59,2 % |
| `CPG` | 806 | 40,8 % |

### CR (CRCDOCTO)

- **20 títulos** · 3 clientes · 16 quitados · 0 cancelados
- 1 item por título (sempre — sem variância)
- Confirma `Leia/01_VISAO.md`: **Pioneira não fatura no Globus**. Receita real vem por outra via (repasse GDF). CR existente é provavelmente venda esporádica (sucata, ativo imobilizado).

### FLP (FLP_FICHAEVENTOS, normalização Praxio)

| TIPOFOLHA | Lançamentos | Funcionários | COMPETFICHA |
|---|---|---|---|
| 1 | 102.071 | 3.406 | 30/04/2026 |
| 2 | 24.541 | 3.075 | 20/05/2026 |
| 3 | 908 | 278 | 03 → 19/05/2026 |
| **Total** | **127.520** | — | — |

- Convenção Praxio confirmada: `COMPETFICHA` dia ≥ 28 entra no mês seguinte (TIPOFOLHA 1 com data 30/04 pertence ao mês 05).
- **Volume crítico:** 127k lançamentos/mês exige cursor/paginação no sync — batch único é inviável.

### NF emitida pela Pioneira (BGM_NOTAFISCAL)

- **406 NFs** no mês (`STATUSNF='F'`, `CODTPDOC='NF'`)
- Itens: min=1, méd=3,01, max=32

### Movimento bancário (BCOMOVTO)

- **415 movimentos** no mês · 6 contas distintas · **357 conciliados (≈86 %)**
- Volume baixo, sync direto sem paginação.

### Fornecedores ativos no mês

- **241** fornecedores com pelo menos 1 título CP vencendo no mês (`CONDICAOFORN='A'`)

---

## 2. Schemas mapeados nesta sessão

Complementam o `globus-tabelas-financeiras-documentacao.md` (que cobre BGM_NOTAFISCAL, EST_ITENSNF, EST_VENCTONF, EST_CADMATERIAL, EST_GRUPOCOMPRAS, CPGDOCTO, CPGITDOC).

### 2.1 BCOCONTA (52 colunas) — cadastro de conta bancária

- **PK natural:** `(CODBANCO, CODAGENCIA, CODCONTABCO)` · **escopo:** `(CODIGOEMPRESA, CODIGOFL)`
- **Flags-chave:**
  - `COMPOEPOSICAOFINANCEIRA(1)` — **decisivo:** filtra contas que entram no fluxo de caixa
  - `CONTACAIXA(1)` · `CONTA_ATIVA(1)` · `INATIVA(1)` — atenção: dois flags de status (validar regra de uso real)
- **Saldo:** `SALDOINICIALCONTABCO`, `DATA_SALDO_ACM`, `SALDO_ACM_ATE_DATA` — snapshot disponível para reconciliação
- **Contábil:** `NROPLANO`, `CODCONTACTB`, `CODCONTACTBTRANSITORIA`, `CODCUSTO`
- **PIX:** `TIPO_CHAVE_PIX`, `CHAVE_PIX(80)`
- **Cheque especial / garantia:** `LIMITECREDITO`, `CONTAGARANTIDA`
- **Cobrança:** `CARTEIRADACOBRANCA`, `CODIGONOBANCO(20)`, `EXIGE_LIBERACAO_TRANSF`
- Pagamento eletrônico: `CODIGOCOMUNICACAOPE`, `CONTACOMPLEMENTARPE`, `CODIGOCOMUNICACAOPE_ALFANUM`

### 2.2 BCOCONTA_ASSOCEMPFIL (5 colunas) — N:N conta × empresa/filial

Colunas: `CODBANCO`, `CODAGENCIA`, `CODCONTABCO`, `CODIGOEMPRESA`, `CODIGOFL`.

Permite uma conta bancária ser compartilhada entre empresas do consórcio. No sync, fazer **`EXISTS` nesta tabela** garante que só puxamos contas autorizadas para a Pioneira, mesmo que a conta principal seja de outra empresa.

### 2.3 BCOMOVTO (43 colunas) — extrato bancário

- **PK:** `CODMOVTOBCO` (surrogate)
- **FK conta:** `(CODBANCO, CODAGENCIA, CODCONTABCO, CODIGOEMPRESA, CODIGOFL)`
- **Categorização:** `CODHISTOBCO` → `BCOHISTO`, `CODTPDESPESA`/`CODTPRECEITA`, `CODCUSTO`/`CODCUSTOFIN`, `NROPLANO`/`CODCONTACTB`
- **Datas (três):**
  - `DTMOVTOBCO` — data lançada (canônica)
  - `DTEFETIVAMOVTOBCO` — data de efetivação
  - `DATA_CREDITO` — data de crédito (D+1 etc)
  - Decidir no sync qual usar como `dt_movimento` canônica. **Sugestão:** `DTEFETIVAMOVTOBCO` se preenchido, fallback `DTMOVTOBCO`.
- **Valor:** `VLMOVTOBCO` (NUMBER) → converter para **centavos BIGINT** no Postgres
- **Flags:** `CONFIRMADOMOVTOBCO`, `CONCILIADOMOVTOBCO`, `STATUSMOVTOBCO`
- **Histórico livre:** `HISTMOVTOBCO(2000)` — útil para match fuzzy com extrato bancário
- **Links cruzados:**
  - `CODDOCTOCRC_CQTERC` → CR (cheque de terceiro)
  - `CODINTCHEQUE` → cheque emitido
  - `CH_TRANSF` + `CODLANCA_TRANSF` → transferência entre contas
  - `ID_MOVTO_ORC` → movimento orçamentário
- **Auditoria de exclusão:** `USUARIOBCO_EXC`, `DATAHORABCO_EXC` — usar no sync incremental para detectar registros removidos no Globus

### 2.4 BCOHISTO (21 colunas) — categorização do movimento bancário

- **PK natural:** `(CODIGOEMPRESA, CODIGOFL, CODHISTOBCO)`
- `DESCHISTOBCO(80)` — descrição
- `DEBCREDHISTBCO(1)` — sentido D/C
- **Liga ao plano de contas:** `NROPLANO` + `CODCONTACTB`
- **Liga aos tipos:** `CODTPDESPESA(5)` / `CODTPRECEITA(5)`
- `CODCUSTOCTB(5)` — centro de custo contábil
- Flags: `BLOQUEADO`, `CONTABILIZAR`, `DEPOSITO`, `ESTORNODOCTED`, `PEDETPDESPHISTOBCO`/`PEDETPRECHISTOBCO` (controle de input)

### 2.5 CPGTPDES (23 colunas) — tipos de despesa CP

- **PK:** `CODTPDESPESA(5)`
- `DESCTPDESPESA(50)`, `CLASSIFICADOR(20)`
- **Hierarquia de agrupamento:** `CODRESUMOFINANC(20)`, `CODRESUMOGERENCIAL(20)`
- **Controles operacionais:**
  - `ACEITALANCAMENTO(1)` — tipo está ativo
  - `EXIGECCUSTOSFIN(1)` — **validação no sync:** se `S` e título sem ccusto, marcar `_stage` como inconsistente
  - `CONTROLAORCAMENTO(1)`, `EXIGEAUTORIZACAO(1)`
- **Tributário (completo):** `RETEM_IMPOSTO`, `CODIGO_SERVICO(9)`, `CODIGO_OP_PIS`, `CODIGO_OP_COFINS`, `CODBASECALCCRED`, `CODNATREND(5)`, `REINF_CPG`, `RENDIMENTO`, `TIPO_ISENCAO(2)`, `CODCCLASSTRIB(6)`, `CODRECEITA(6)`

### 2.6 CPGTPDES_EMPFIL (3 colunas) — habilitação por empresa/filial

Colunas: `CODTPDESPESA`, `CODIGOEMPRESA`, `CODIGOFL`. Define quais tipos de despesa estão habilitados para a Pioneira (`empresa=4, filial=1`). No sync, fazer `EXISTS` aqui ao trazer `CPGTPDES` evita poluir nossa base com tipos de outras empresas.

### 2.7 CPG_ASSOC_DESPESA_CCUSTO (2 colunas) — N:N despesa × centro de custo

Colunas: `CODTPDESPESA`, `CODIGOCUSTO`. Cardinalidade implícita: um tipo de despesa pode ser usado em múltiplos centros de custo (e vice-versa). Tabela auxiliar para validação no front (autocomplete restringe ccustos válidos por tipo).

### 2.8 BGM_FORNECEDOR (76 colunas) — cadastro de fornecedor

- **PKs:** `CODIGOFORN` (NUMBER, interno) + `NRFORN(6)` (alfanumérico, externo)
- **Status:** `CONDICAOFORN(1)` (`'A'` = ativo)
- **Identidade fiscal:** `TPINSCRICAOFORN(5)`, `NRINSCRICAOFORN(20)`, `INSCESTADUALFORN(20)`, `INSCMUNICIPALFORN(20)`
- **Nomes:** `RSOCIALFORN(100)`, `NFANTASIAFORN(30)`
- **Endereço:** `ENDERECOFORN`, `BAIRROFORN`, `CIDADEFORN`, `CEPFORN`, `NR_ENDERECO`, `COMPLFORN`, `NRMUNICIPIO`, `CODIGOUF`, `SIGLA_PAIS`, `SIGLA_PAIS_ORIGEM(2)`
- **Contato:** `TELEFONEFORN`, `HOMEPAGEFORN(80)`, `EMAILFORN(80)`, `CONTATOFORN`, `OBSERVACAOFORN(80)`
- **Regime tributário (combinação define toda a tributação):**
  - `AUTONOMO(1)` · `FORN_OPT_SIMPLES_NACIONAL(1)` · `FORN_OPT_SIMEI(1)` · `CONTRIBUINTEICMS(1)` · `CONTRIBUINTECPRB(1)`
- **Pagamento:**
  - Conta bancária própria: `CODBANCOFORN`, `CODAGENCIAFORN`, `CODCONTABCOFORN`, `DVAGENCIAFORN(2)`, `DVCONTABCOFORN(2)`, `TIPOCONTABCO(1)`
  - PIX: `TIPO_CHAVE_PIX`, `CHAVE_PIX(80)`
  - Exterior: `IBAN(40)`, `INST_PAGADORA_INTERMEDIADORA(1)`
- **Defaults úteis:** `CODTPDESPESA(5)` (tipo despesa padrão), `CONDPGTOFORN(6)` (condição pagamento), `PERCJUROS`, `PERCDESCONTO`
- **Favorecido distinto do fornecedor** (resolve problema histórico do v1):
  - `NOME_FAV_FORN(50)`, `TPINSCR_FAV_FORN(5)`, `NRINSCR_FAV_FORN(20)`
- **Transporte:** `NRRNTRC(40)` + `VALIDADERNTRC` (RNTRC, registro do transportador)
- **Auditoria:** `DTCADASTROFORN`, `DATAULTIMOMOVTOFORN`, `DT_ULT_ALTERACAO`, `USR_ULT_ALTERACAO(15)`
- **Matriz/filial:** `CODFORNMATRIZ`, `UTILIZAINSCMATRIZPE`
- **Gestão:** `CODSITUACAO(5)`, `CODAVALIACAO(5)`, `AVALIADOPELORANKFORN`, `EMAILRANKFORN(250)`
- **Identificação externa:** `ID_EXTERNO RAW(16)` — **UUID já presente**, útil para dedup
- **Validação Receita:** `CONSULTOU_CNPJ_RECEITA(1)` — flag mas **sem data** (pode ter checado em 2018 e nunca mais)
- Outros: `ATIVOSNAP(1)` (SPED?), `CODATIVIDADE(20)` (CNAE?), `TIPO_EMPRESA`, `RAMOEMPRESA`, `INF_ADICIONAIS(1000)`

---

## 3. Inventário do schema GLOBUS (604 tabelas relevantes)

Filtrado por prefixos `BCO%`, `BGM_%`, `CPG%`, `CRC%`, `CTR_%`, `EST_%`. Lista completa salva na exploração; destaques abaixo (excluindo `*_BAK`, `*_BKP_*`, `*OLD*`, `*_DE`, `*_PARA`):

### Bancário (BCO*)
`BCOBANCO`, `BCOAGENC`, `BCOCONTA` + `BCOCONTA_ASSOCEMPFIL` + `BCOCONTA_CONTACTB` + `BCOCONTA_DADOS_PE` + `BCOCONTA_ASSOC_USUARIOS`, `BCOHISTO` + `BCOHISTO_CONTACTB`, `BCOMOVTO`, `BCONOSSONUMERO`, **`BCOSALDO`** ⭐, `BCOCARTEIRA` + `BCOCARTEIRA_CONTACTB`, `BCO_CONCILIACAO_ARQ` (CNAB), `BCO_OCORRENCIA`, `BCO_ASSOC_DEPOSITO`, `BCOTALAO`, `BCOPARAM`.

### Fornecedor (BGM_FORN*)
`BGM_FORNECEDOR`, `BGM_FORNECEDOR_CEDENTES`, `BGM_FORNECEDOR_SOFTWARE`, `CPG_CONTATOFORNECEDOR`, `CPGCONTACTB_FORNECEDOR`, `CPG_ASSOC_BCO_X_FORN`, `CPG_ASSOCFORNGRPECONOM`, `CPG_AUTONOMOS_FORN`.

### Contas a Pagar (CPG*)
- **Núcleo:** `CPGDOCTO`, `CPGITDOC`, `CPGDOCTO_HISTORICO_NEGOCIACOES`, `CPGDOCTO_TIPO_EVENTOS`, `CPGDOCTO_ANEXO`, `CPGDOCTO_TITULO_TERCEIRO`
- **Tipos e classificação:** `CPGTPDES`, `CPGTPDES_EMPFIL`, `CPGTPDES_CTBCONTA`, `CPGTPDES_CTBCONTA_OUTRAS`, `CPGRESUMOFINANC`, `CPGRESUMOGERENCIAL`, `CPGSITUACAO`, `CPGTPPAGTO`
- **Tributário:** `CPGIMPOSTOS`, `CPGRETENCAO_IMPOSTOS`, `CPG_DOCTOS_IMPOSTO_RETIDO`, `CPG_PARAM_IMPOSTOS_REINF`, `CPG_GRUPOIMPOSTOSFEDERAIS`, `CPG_CAD_NAT_RENDIMENTO`, `CPG_CODRECEITA_GARE`, `CPG_DCTF_COMPENSACAO`
- **Centro custo:** `CPG_ASSOC_DESPESA_CCUSTO`, `CPG_ASSOC_RESFIN_CCUSTO`, `CPG_RESUMOFIN_CCUSTO`, `CPG_RATEIOFLP_PERCCCUSTO`
- **Rateio:** `CPGGRUPORATEIO`, `CPGITGRPRATEIO`, `CPG_RATEIOFOLHA`, `CPGITGRRATFIN`
- **Contratos:** ⭐ `CPG_CONTRATOS`, `CPG_CONTRATOS_PARCELAS`, `CPG_CONTRATOS_PARC_NOTA`, `CPG_CONTRATOS_ASSOC`, `CPG_CONTRATOS_ASSOC_NF`, `CPG_CONTRATOS_INTEG_CONTABIL`, `CPG_CONTRATOS_ANEXOS`, `CPG_CONTRATO_FORN`
- **Orçamento:** ⭐ `CPG_CAD_ORCAMENTO`, `CPG_CAD_ORCAMENTO_PREVISOES`, `CPG_CAD_ORCAMENTO_USUARIO`, `CPG_PREVISOES_HISTORICOS`, `CPG_MOVIMENTO_PLANO_FINANCEIRO`, `CPGORCESTRUTURA`, `CPGORCITESTRUTURA`, `CPGORCPREVISOES`
- **DDA bancário:** `CPG_IMPORTACAO_DDA`
- **Liberação de pagamento:** `CPG_PARAM_LIB_PAG`, `CPG_PARAM_LIB_PAG_TPDESP`, `CPGUSUARIOAUTALTCCFORN`, `EST_USU_AUTORIZADOS_PAGAMENTOS`
- **Outros:** `CPG_PLANO_PAGAMENTO`, `CPG_MULTAS`, `CPG_OCORRENCIASBANCARIAS`, `CPGREMESSAPE`

### Contas a Receber (CRC*)
- **Núcleo:** `CRCDOCTO`, `CRCITDOC`, `CRCDOCTO_HISTORICO_NEGOCIACOES`
- **Meios de pagamento:** `CRCDOCTO_PIX`, `CRCDOCTO_TEF`, `CRCDOCTO_DETALHECARTAO`, `CRCDOCTO_EMAIL`, `CRCCARTAO`
- **Tipos:** `CRCTPREC`, `CRCTPREC_EMPFIL`, `CRCTPREC_CTBCONTA`
- **Cheques:** `CRCCHEQUESDETERCEIROS`, `CRC_CADCHTERC`, `CRC_MOVTOBCOCHEQUE`
- **Cobrança:** `CRC_RENEGOCIACAO`, `CRC_MOTIVO_BAIXA_SERASA`, `CRC_MOVTO_SERASA`, `CRC_INSTRUCAO_PROTESTO`, `CRC_OCORRENCIASBANCARIAS`, `CRC_RESPONSAVELCOBRANCA`, `CRC_PARAM_COBELET`
- **Cliente:** `CRC_GRUPOECONOM`, `CRC_ASSOCCLIENTEGRPECONOM`, `CRC_CLASSIF_CLIENTE`, `CRC_CONTATOCLIENTE`, `CRC_FAIXA_CONTRIBUICAO`
- **Automatização** (avaliar se entra no escopo): família `CRC_AUTOMATIZACAO_*` e `CRC_AUTO_PARAM_*`

### Cadastros centrais (CTR_)
`CTR_CADEMP` (empresa), `CTR_FILIAL` (filial), `CTR_GARAGEM` + `CTR_FILIAL_GAR`, `CTR_EMPAUTORIZADAS` + `CTR_EMP_AUTORIZADAS_WS`, `CTR_PARAMETROS`, `CTR_CADLOCAL`, `CTR_MICROREGIAO`, `CTR_CONCEDENTE` + `CTR_CONCEDENTE_PARAMETROS`, `CTR_EMTU`.

### Estoque / NF (EST_*)
`EST_CADMATERIAL`, `EST_GRUPOCOMPRAS`, `EST_GRUPOESTOQUE`, `EST_GRUPOCONTABIL`, `EST_GRUPODESPESAS`, `EST_GRUPOGERENCIALCUSTO`, `EST_ITENSNF`, `EST_VENCTONF`, `EST_NFSERVICO`, `EST_ASSOCIACCUSTOFINANCITENSNF` ⭐, `EST_CTBESTOQUEPOREMPFILIAL`, `EST_CTBDESPESAPOREMPFILIAL`, `EST_PEDIDOITENSNFCCUSTOFIN`.

---

## 4. Achados de qualidade de dados

| Achado | Implicação no sync |
|---|---|
| `CPGDOCTO.CODTPDOC` tem códigos `'001'` e `'002'` (34 títulos = 1,7 %) onde deveria ter código alfa | Sanitizador no sync: marcar `_stage` como `tipo_doc_anomalo` e logar |
| `CPGDOCTO.MODULO_INCLUSAO` 59 % NULL | **Não usar** como pivô de origem; campo legacy semi-abandonado |
| FLP `COMPETFICHA` com dia ≥ 28 pertence ao mês seguinte | Normalizar no adapter antes de gravar `mes_competencia` no `_stage` |
| `BGM_FORNECEDOR.CONSULTOU_CNPJ_RECEITA` é flag sem timestamp | Não confiar no valor — fazer revalidação própria via Receita |
| `BCOCONTA` tem `CONTA_ATIVA` **e** `INATIVA` | Validar com Leonardo qual flag prevalece antes de filtrar |
| `BCOMOVTO` tem 3 datas (`DTMOVTOBCO`, `DTEFETIVAMOVTOBCO`, `DATA_CREDITO`) | Definir hierarquia: `DTEFETIVAMOVTOBCO` ?? `DTMOVTOBCO` como canônica |
| Pioneira tem só 20 títulos CR/mês | CR é módulo de **baixíssimo volume** — sync pode ser síncrono, sem batch |

---

## 5. Decisões derivadas para o sync

1. **`empresa=4` em toda query** — ver [globus-sync-regras](../../.claude/.../memory/globus-sync-regras.md) regra 1.
2. **Stage por domínio** em `integration.<dominio>_stage` (schema Postgres `integration`):
   - `integration.cpg_docto_stage`, `integration.cpg_itdoc_stage`
   - `integration.crc_docto_stage`, `integration.crc_itdoc_stage`
   - `integration.flp_ficha_eventos_stage` (com `mes_competencia` normalizado)
   - `integration.bgm_notafiscal_stage`, `integration.est_itensnf_stage`
   - `integration.bco_movto_stage`, `integration.bco_conta_stage`, `integration.bco_histo_stage`
   - `integration.bgm_fornecedor_stage`
   - Dimensões: `integration.cpg_tpdes_stage`, `integration.cpg_assoc_despesa_ccusto_stage`, `integration.bco_conta_associempfil_stage`
3. **Valores monetários → BIGINT centavos** (regra do projeto). Converter `NUMBER` na entrada.
4. **Sync incremental:** janela do mês corrente para fatos. Dimensões (`CPGTPDES`, `BCOCONTA`, `BCOHISTO`, `BGM_FORNECEDOR`) puxar mês inteiro mas com `EXISTS` ligando ao mês atual para não inflar.
5. **Cursor obrigatório para FLP** (127k linhas/mês) — chunk de 10k.
6. **Detecção de exclusão (soft-delete via flag):** filtrar `STATUS* <> 'C'` e capturar `USUARIOBCO_EXC IS NOT NULL` como sinal de deleção.
7. **Histórico = endpoint manual separado**, processa 1 mês por execução, fora de pico.

---

## 6. Gaps — o que ainda falta pra montar o sync

### 6.1 Schemas que ainda precisam ser explorados

| Tabela | Por que | Prioridade |
|---|---|---|
| `CRCDOCTO` | CR — mesmo que volume baixo, precisa do schema completo (paralelo a CPGDOCTO) | Alta |
| `CRCITDOC` | Itens do CR | Alta |
| `FLP_FICHAEVENTOS` | Fato da folha — coluna a coluna | **Crítica** (já tem rascunho em `Leia/folha-flp-detalhamento.md` — validar e completar) |
| `VW_FUNCIONARIOS` | Junta com FLP — checar quais colunas a view expõe | Alta |
| `CTR_CADEMP` | Mestre de empresas (saber colunas como CNPJ, IE, regime tributário) | Média |
| `CTR_FILIAL` | Mestre de filiais (1 = Brasília?) | Média |
| `CTR_GARAGEM` | Mestre de garagens (dimensional para alocação operacional) | Média |
| `BCOBANCO` + `BCOAGENC` | Para descrever movimento bancário sem só código numérico | Baixa |
| `BCOSALDO` | Já tem snapshot em `BCOCONTA.SALDO_ACM_*` — confirmar se `BCOSALDO` é a granular por dia | Média |
| `CPG_CONTRATOS` + `CPG_CONTRATOS_PARCELAS` | Habilita módulo de contratos do v2 | Média (depende do escopo) |
| `CPG_CAD_ORCAMENTO` + `CPG_CAD_ORCAMENTO_PREVISOES` | Habilita módulo de orçamento | Média |
| `EST_ASSOCIACCUSTOFINANCITENSNF` | Ccusto financeiro por item de NF (para DRE gerencial) | Média |

### 6.2 Tabelas mestre que ainda não localizamos no inventário

- **Plano de contas contábil:** `CTB_*` não apareceu no filtro (filtro foi `CPG%`, `CRC%`, `CTR_%`, `BCO%`, `BGM_FORN%`, `EST_%`). Rodar `LIKE 'CTB%'` em sessão futura.
- **Centro de custo mestre:** `CPG_ASSOC_DESPESA_CCUSTO.CODIGOCUSTO` referencia uma tabela — `CTB_CADCCUSTO`? `CCUSTO`? Identificar.
- **Cliente:** `BGM_CLIENTE` apareceu em CRC mas não foi mapeado coluna a coluna.
- **Tabela de planos financeiros:** `CPG_MOVIMENTO_PLANO_FINANCEIRO` aponta para algo — identificar a mestre.

### 6.3 Validações pendentes com Leonardo

1. **Qual flag de status real** em `BCOCONTA`: `CONTA_ATIVA` ou `INATIVA`?
2. **Os 34 títulos com `CODTPDOC='001'/'002'`** são lixo ou têm semântica conhecida?
3. **A data canônica do extrato** é `DTMOVTOBCO`, `DTEFETIVAMOVTOBCO` ou `DATA_CREDITO`?
4. **Pioneira emite NF de saída** (406/mês) — é só locação de garagem/sucata/ativo, ou tem algum fluxo recorrente que entra na DRE gerencial?

### 6.4 Próximos blocos SQL a rodar (todos mês corrente, `empresa=4`, `NO_PARALLEL`)

1. Schemas: `CRCDOCTO`, `CRCITDOC`, `FLP_FICHAEVENTOS`, `VW_FUNCIONARIOS`, `CTR_CADEMP`, `CTR_FILIAL`, `CTR_GARAGEM`
2. Inventário `CTB_*` (plano de contas + lançamentos)
3. Validação dos 34 registros `CODTPDOC IN ('001','002')`: trazer 5 amostras (sem `*`, só colunas-chave) para entender se é lixo
4. `BCOSALDO` schema + amostra do mês corrente
5. Volume mensal `CPG_CONTRATOS` (decidir se entra no MVP)

---

## 7. Segunda rodada de exploração (gaps preenchidos)

### 7.1 `FLP_FICHAEVENTOS` — 12 colunas

PK lógica: `(CODINTFUNC, TIPOFOLHA, COMPETFICHA, CODEVENTO)`.

| Coluna | Tipo | Nota |
|---|---|---|
| `CODINTFUNC` | NUMBER | FK → `VW_FUNCIONARIOS` |
| `TIPOFOLHA` | NUMBER | 1=mensal, 2=adiantamento, 3=variável/rescisão (validado pela volumetria) |
| `COMPETFICHA` | DATE | dia ≥ 28 → mês seguinte (convenção Praxio) |
| `CODEVENTO` | NUMBER | identifica natureza do evento (salário, INSS, FGTS, hora extra…) |
| `REFERENCIA` | NUMBER | **formato `HHH.MM` (horas/minutos)** — não somar direto, ver [globus-referencia-formato-horas](../../.claude/.../memory) |
| `VALORFICHA` | NUMBER | valor monetário do evento → centavos BIGINT |
| `TRANSFLEGALFICHA` | NUMBER | transferência legal (subsídio?) |
| `TIPOEVENTOFICHA` | VARCHAR2(2) | provento/desconto/base |
| `INCIDENCIAS` | VARCHAR2(15) | flags de incidência (INSS/IRRF/FGTS) |
| `INCIDENCIAS_ESOCIAL` | VARCHAR2(30) | mapeamento eSocial |
| `ROTINAEVEN`, `ACRESCIMOEVEN` | NUMBER | controle interno do cálculo |

### 7.2 `VW_FUNCIONARIOS` — 142 colunas (view)

Mistura 3 entidades num só objeto: **funcionário** (pessoal/endereço/banco), **histórico salarial** (IDHISTSAL, DTHISTSAL, SALBASE, SALAUX1-6, MOTIVOHISTSAL), e **descritivos pré-resolvidos** (DESCFUNCAO, DESCAREA, DESCDEPTO, DESCSETOR, DESCSECAO, DESCSINDI, DESCESTCIV, DESCINSTR, DESCNAC, DESCTPADM).

Cols-chave:
- PK funcionário: `CODINTFUNC` (NUMBER). Código alfanumérico: `CODFUNC(6)`, chapa: `CHAPAFUNC(6)`
- Empresa/filial: `CODIGOEMPRESA`, `CODIGOFL` (ambos NULLABLE — atenção)
- Status: `SITUACAOFUNC(1)`, **`SITUACAONACOMPET(1)`** + **`COMPETENCIA DATE`** ⭐ (situação na competência — útil pra DRE da folha)
- Nomes: `NOMEFUNC(30)`, `NOMECOMPLETOFUNC(70)`, `APELIDOFUNC(30)`, mais `NOMEFUNC_ORIGINAL` / `NOMECOMPLETOFUNC_ORIGINAL` (provável LGPD — dados sensíveis)
- Datas: `DTADMFUNC`, `DTNASCTOFUNC`, `DTAPOSENTFUNC`, `DATAAVISOPREVIOFUNC`, `DATATERMINOCONTRATO`, `DTHISTSAL` (data do histórico salarial)
- Hierarquia: `CODSINDI`, `CODSETOR`, `CODSECAO`, `CODDEPTO`, `CODAREA`, `CODFUNCAO`, `CODCARGO`
- Bancário do funcionário: `CODBANCO`, `CODAGENCIA`, `CONTACORFUNC(15)`, `TIPOCONTA`
- Incidências: `INCINSSFUNC`, `INCIRFFUNC`, `INCFGTSFUNC`, `RECEBEADTFUNC`, `CESTABASICAFUNC`, `VALEREFEICFUNC`
- Salários: `SALBASE`, `SALAUX1..6`, `TPSALFUNCAO(1)`, `HRSEMFUNCAO`, `HRSEMAUX1..6FUNCAO`

⚠️ Recomendação de sync: **separar a VW dos eventos**. Sync FLP_FICHAEVENTOS guarda apenas `CODINTFUNC` como FK; VW_FUNCIONARIOS sincroniza como snapshot mensal próprio. Senão JOIN em 127k linhas × 142 colunas explode o cursor.

⚠️ LGPD: nome, endereço, telefone, data nascimento são pessoais. Tratar com cuidado (campos `NOMEFUNC_ORIGINAL` indicam que já houve regravação).

### 7.3 `CRCDOCTO` — 94 colunas

Vs `CPGDOCTO` (160 cols): mais simples, mas com **cobrança eletrônica completa** e **integração de cartão/PIX/TEF**. Pontos relevantes:

- PK: `CODDOCTOCRC`
- Cliente/empresa: `CODCLI`, `CODIGOEMPRESA`, `CODIGOFL`
- Tipo/série/número: `CODTPDOC(3)`, `SERIEDOCTOCRC(5)`, `NRODOCTOCRC(10)`, `NROPARCELACRC`
- Datas: `EMISSAOCRC`, `SAIDACRC`, `VENCIMENTOCRC`, `VENCIMENTOORIGINALCRC`, `RECEBIMENTOCRC`, `DATAPROTESTO`, `DATA_REFERENCIA`, `DATA_INCLUSAO`, `ALTERADOEM`
- Status: `STATUSDOCTOCRC(1)`, `QUITADODOCTOCRC(1)`, `PROTESTADO(1)`, `RENEGOCIADO(1)`, `STATUSCHQTER_BI(1)`
- Tributário: `VLRINSSCRC`, `VLRIRRFCRC`, `VLRPISCRC`, `VLRCOFINSCRC`, `VLRCSLCRC`, `VLRISSCRC`, `IRAUTORETIDO`, e reforma `CBS`, `IBSMUNICIPAL`, `IBSESTADUAL` (zerados até 2027)
- **Cobrança eletrônica:** `COBELETNOSSONUMERO(20)`, `COBELETCARTEIRA(20)`, `COBELETSTATUS(2)`, `COBELETDTENVIO`, `COBELETNRREMESSA`, `COBELETREGISTRADO`, `COBELETRESPIMP`, `COBELETMSGBOLETO(400)`, `COBELETSTATUSMOD(2)`, `COBELETMOTIVO(300)`, `COBELETNOSSONROINTERNOBCO(20)`, `TIPO_REGISTRO_COBRANCA(4)`
- Banco origem: `CODBANCO`, `CODAGENCIA`, `CODCONTABCO(15)`
- Cartão: `CARTAO_CODAUTORIZ(6)`, `CARTAO_ESTABEL`, `CARTAO_TID(40)`, `CARTAO_RESUMO`, `NROTOTALPARCELAS_CARTAO`, `TIPOMOVTO_CARTAO(20)`, `FORMARECEBCRC(2)`
- Devolução/adiantamento/substituição: `DOCTODEDEVOL(1)` + `CODDOCTOCRC_DEVOL` + `VALOR_DEVOL`, `CODDOCTOCRC_ADTO` + `VALOR_ADTO`, `DOCTODESUBSTITUICAO(1)` + `CODDOCTOCRCSUBST`, `CODDOCTONOVO_CANCEL`
- Integrações: `ID_CASHMONITOR`, `SISTEMA_INTEGRACAO(10)`, `CODDOCTOESF` (escrita fiscal), `CODMOVTOBCO`, `CODMOVTOBCO_DEB`, `CODMOVTOBCO_ESTORNO`, `CODLANCA`, `CODLANCABX_DESC`, `CODLANCA_BAIXA`, `ID_MOVTO_ORC`
- Cobrança: `COD_RESP_COB(6)`, `INSTRUCAO_PROTESTO(2)`, `FATURA_IMPRESSA(1)`, `CALCULAR_DESCONTO(1)`, `DESCFINANCEIROCRC`
- Diversos (?): `CONTRATO_DVS(30)`, `OF_DVS(10)` — provável vínculo "Diversos" (DVS)
- Auditoria: `USUARIO_INCLUSAO(15)`, `DATA_INCLUSAO`, `USUARIOCRC_EXC(15)`, `DATAHORACRC_EXC`

### 7.4 `CRCITDOC` — 11 colunas (mínimo)

PK: `(CODDOCTOCRC, CODITEMDOCCRC)`. Cols: `VALORITEMDOC`, `CODTPRECEITA(5)`, `NROPLANO`, `CODCONTACTB`, `CODCUSTO`, `CODCUSTOFIN`, `ITEMRATEADO(1)`, `CODGRPRATEIO`, `OBSITEMDOCTOCRC(255)`.

### 7.5 `CTR_CADEMP` — 29 colunas (mestre empresa)

PK: `CODIGOEMPRESA`. **Não tem CNPJ aqui** — apontador `CODINTEMPAUT` para `CTR_EMPAUTORIZADAS` (que tem o CNPJ — ainda não explorada).

Cols úteis: `IESTADUALEMPRESA(20)`, `IMUNICIPALEMPRESA(15)`, `CNAE`, `EMP_OPT_SIMPLES_NACIONAL(1)`, `DATA_ADESAO_SIMPLES_NACIONAL`, `REGISTRO_RNTRC`, `REGISTRO_ESTADUAL`, `TERMO_AUT_FRETAMENTO`, endereço completo, `BANCO_FAT`/`AGENCIA_FAT`/`CONTA_FAT` (conta de faturamento).

### 7.6 `CTR_FILIAL` — 29 colunas (mestre filial)

PK: `(CODIGOEMPRESA, CODIGOFL)`. Mesmo padrão (sem CNPJ próprio, FK em `CODINTEMPAUT`). Flags: `MATRIZFL(1)`, `INATIVAFL(1)`, `CONTRIBUINTEDEICMS(1)`, `POSSUIBENEFICIOFISCAL(1)`.

### 7.7 `CTR_GARAGEM` — 17 colunas

**Sem `CODIGOEMPRESA`** — recurso compartilhado entre empresas do consórcio. PK: `CODIGOGA`. Associação via `CTR_FILIAL_GAR`. Possui até 4 microrregiões (`MICROREGIAO_1..4`).

### 7.8 `BCOSALDO` — 5 colunas (granularidade MENSAL)

`(CODBANCO, CODAGENCIA, CODCONTABCO, MESANOSALDOBCO CHAR(6), VLSALDOBCO)`.

- **Não é diário.** Reconciliação fim-de-mês usa essa tabela; saldo intra-mês calcula a partir de `BCOMOVTO`.
- `MESANOSALDOBCO CHAR(6)` — formato a confirmar (`MMYYYY` ou `YYYYMM`). Validar com amostra antes do sync.

### 7.9 `BCOBANCO` + `BCOAGENC`

**`BCOBANCO`** (9 cols): PK `CODBANCO` (interno), `NROBANCO` (código FEBRABAN 3 dígitos), `NOMEBANCO(50)`, `HOMEPAGEBANCO(80)`, `CODTPPREST`, `DIGITOCONTA`, `INSTITUICAO_PAGADORA`, `TIPO_PAGADORA(1)`, **`ISBP(8)`** ← código ISPB do BCB (chave universal pra integrações PIX/Open Finance/SPI).

**`BCOAGENC`** (13 cols): PK `(CODBANCO, CODAGENCIA)`, `NOMEAGENCBCO(40)`, `DIGITO(2)`, `AGENCIACENTRAL`, endereço/contato.

### 7.10 Schema CTB — 140 tabelas (descoberta crítica)

| Tabela | Provável papel |
|---|---|
| **`CTBPLANO`** | mestre do plano de contas |
| **`CTBCONTA`** | conta contábil individual |
| **`CTBCUSTO`** ⭐ | **mestre de centro de custo (faltava!)** |
| **`CTBLANCA`** | lançamentos contábeis (fato grande) |
| **`CTBSALDO`** | saldo por conta |
| **`CTBSALDOCCUSTO`** | saldo por centro de custo |
| **`CTBCDDRE`** + **`CTBITDRE`** ⭐ | estrutura da DRE — **input direto pro módulo DRE do v2** |
| `CTBHISTO` | histórico contábil |
| `CTBEXERC` + `CTBPARAM` | exercícios e parâmetros |
| `CTBPREVISOES` | previsões orçamentárias |
| `CTBTIPOCONTA`, `CTBTIPOLANCA` | dimensões |
| `CTBRATEIOPORATIVIDADES` + `CTBRATEIOPORATIV_CTA` | rateio por atividade |
| `CTBASSCONTAS`, `CTBASSCONTATRANSITORIA` | associações entre contas |
| `CTBCONTAPAS`, `CTBCONTA_CTAPLANREF`, `CTBCONTA_REFERENCIAL` | mapeamentos auxiliares (plano referencial SPED) |
| `CTBCONTA_DEB_TPRECEITA` | ponte conta×tipo receita |
| `CTB_CADCCUSTO_KM` + `CTB_ITENSCCUSTO_KM` + `CTB_KM_ORCAMENTARIO` | rateio por quilometragem (específico do setor) |
| `CTB_FUNC_ORCAMENTARIO`, `CTB_STRUCT_ORCAMENT`, `CTB_STRUCT_ITEMS` | estrutura orçamentária |
| `CTBAPULALUR`, `CTBLALUR`, `CTBVLRAPULALUR`, `CTBCONTASLALUR` | apuração LALUR (IR pessoa jurídica) |
| `CTB_APUR_IRPJCSLL_DEDUCOES`, `CTB_APUR_PAS`, `CTBIMPAPULALUR` | apuração de impostos |
| `CTBLANCA_APURPISCOFINS`, `CTB_SINTETICO_APURPISCOFINS` | apuração PIS/COFINS |
| Família **`CTB_ECF_*`** (28 tabelas) | Escrituração Contábil Fiscal (entrega à Receita) |
| `CTB_API_ACESSO_LIVRO_RAZAO`, `CTB_API_HIST_LIVRO_RAZAO`, `CTB_API_INTEGRACAO_LIVRO_RAZAO`, `CTB_API_LOG_LIVRO_RAZAO` | API do livro razão (Globus expõe API?) |
| `CTB_SPED_ECD_*`, `CTB_SPED_ECF_*` | entrega SPED Contábil/ECF |
| Família `CTB_K100..K315` | livro razão auxiliar EFD-Reinf? |

### 7.11 Mestres complementares

- **`CODIGOCUSTO`** só aparece em `CPG_CUSTOS_USUARIO` (33 rows) e `CPG_ASSOC_DESPESA_CCUSTO` (1 row) — **confirma:** o mestre real está no schema CTB, com nome de coluna `CODCUSTO`, provavelmente em **`CTBCUSTO`**. **Próximo SQL deve mapear schema de `CTBCUSTO`**.
- **`BGM_CLIENTE`** existe (+ `BGM_CLIENTE_AUTOMATICO_LOG`, `BGM_CLIENTE_BAK`). Schema ainda não mapeado.
- **`PI_PLANO_FIN`** ⚠️ — prefixo `PI_` **não-padrão** Praxio. Provavelmente **customização criada pela Pioneira no schema GLOBUS**. Antes de depender, validar com DBA: contrato estável? Quem mantém? É sobrescrita em upgrade do Globus? Não tem garantia de retrocompatibilidade.
- Plano financeiro padrão Praxio: `CPG_GRUPO_CONTAS_FINANCEIRAS` + `CPG_MOVIMENTO_PLANO_FINANCEIRO` + `CPG_ASSOC_USU_PLANO_FINANCEIRO`. Esses três são padrão.

---

## 8. Múltiplos conceitos de "centro de custo" (atenção!)

| Coluna | Onde aparece | Mestre |
|---|---|---|
| `CODCUSTO` | BCOCONTA, BCOMOVTO, BGM_FORNECEDOR, CPGITDOC, CRCITDOC | `CTBCUSTO` (provável) |
| `CODCUSTOFIN` | BCOMOVTO, CPGITDOC, CRCITDOC | mestre **financeiro/gerencial** distinto — investigar |
| `CODCUSTOCTB` | BCOHISTO (VARCHAR2(5)!) | centro de custo **contábil** (string) |
| `CODIGOCUSTO` | CPG_CUSTOS_USUARIO, CPG_ASSOC_DESPESA_CCUSTO | aponta pro mesmo mestre de `CODCUSTO` (alias semântico) |

⚠️ **Decisão pendente:** no nosso modelo Postgres, ter UM mestre `centro_custo` e múltiplas FKs nomeadas por finalidade, ou três mestres distintos. Depende de saber se `CODCUSTO` e `CODCUSTOFIN` apontam pro mesmo universo de chaves ou universos diferentes. **Validar com query: `SELECT COUNT(*) FROM CTBCUSTO WHERE CODCUSTO NOT IN (SELECT DISTINCT CODCUSTOFIN FROM BCOMOVTO WHERE ...)`** (após mapear CTBCUSTO).

---

## 9. Próxima rodada de exploração (gaps remanescentes)

Bloquearam na rodada de hoje: blocos 20-28 (dados + alguns metadados). Refazer com:

1. Schema **`CTBCUSTO`** + **`CTBPLANO`** + **`CTBCONTA`** + **`CTBCDDRE`** + **`CTBITDRE`** (metadado, rápido)
2. Schema **`CTR_EMPAUTORIZADAS`** (mestre real com CNPJ)
3. Schema **`BGM_CLIENTE`**
4. Schema **`PI_PLANO_FIN`** (validar com DBA antes; se custom, perguntar contrato)
5. Schema **`CTBLANCA`** + volume mensal Pioneira (decisão: sincronizar ou não — pode ser brutal)
6. Schema **`CPG_CONTRATOS`** (apenas metadado, evita o erro de coluna inexistente que travou bloco 25)
7. Schema **`CPG_CAD_ORCAMENTO`**
8. Re-tentar bloco 20 (amostra `CODTPDOC IN '001','002'`) — provavelmente o que travou foi o bloco 25 (`CPG_CONTRATOS` com `DT_INI`/`DT_FIM` que não existem), não esse
9. Re-tentar bloco 22/23 (datas BCOMOVTO) — leves, devem rodar

---

## 10. Terceira rodada de exploração (CTB + complementares)

### 10.1 Plano de contas e DRE

**`CTBCDDRE`** (3 cols) — define um relatório DRE.
- PK: `NUMERO` (NUMBER)
- `DESCRICAO(50)`, `NROPLANO` (FK → plano de contas)

**`CTBITDRE`** (14 cols) — linhas (itens) do relatório DRE.
- PK composta: `(NUMERO, ITEM)`
- `OPERACAO(2)` — tipo de operação (soma, totalizador, percentual)
- `TEXTO(255)` — descrição da linha
- `ALINHAMENTO(1)`, `SINAL(1)`, `EXIBE_LINHA(1)`, `SINAL_EXIBICAO(1)` — formatação visual
- `CONTA_INICIAL(30)`, `CONTA_FINAL(30)` — faixa de contas que entra na linha
- `VALOR`, `ACUMULADOR`, `ACM_AUXILIAR`, `PERCENTUAL` — geralmente NULL (estrutura, não dados)

**→ Input direto pro módulo DRE do v2.** O Globus já entrega estrutura formatada — não vamos reinventar.

### 10.2 Lançamento contábil (CTBLANCA + CTBITLNC)

**`CTBLANCA`** (18 cols) — cabeçalho do lançamento contábil.
- PK: `CODLANCA`
- `DTLANCA`, `DTAPURACAO`, `DTLANCAEXTEMPORANEO`
- `SISTEMA(3)`, `USUARIO(15)`, `CODIGOEMPRESA`, `CODIGOFL`
- `DOCUMENTOLANCA(10)`, `LOTELANCA(3)`, `CODTPLNC` (tipo de lançamento)
- **Versionamento:** `LCTOMODIFICADO(1)`, `CODLANCA_ORIGINAL`, `CODTPLNC_ORIGINAL`
- `LANCAMENTO_SUB_CONTA(1)` — flag pra desdobramento
- Auditoria: `USUARIO_INCLUSAO`, `DATA_INCLUSAO`, `CODIGOFL_ORIGEM`
- ⚠️ **Valor não está aqui** — está em `CTBITLNC` (itens). Cabeçalho×itens, igual NF/CPG. **`CTBITLNC` ainda não mapeada** — adicionar à próxima rodada.

### 10.3 Saldo contábil

**`CTBSALDO`** (10 cols) — saldo agregado por mês/conta.
- PK lógica: `(CODIGOEMPRESA, CODIGOFL, NROPLANO, CODCONTACTB, PERIODOSALDO CHAR(6), CODTPLNC)`
- `VLDEBITOSALDO`, `VLCREDITOSALDO` (mês), `VLDEBANTSALDO`, `VLCREDANTSALDO` (mês anterior)

**`CTBSALDOCCUSTO`** (11 cols) — igual mas com `CODCUSTO` no PK.
- Confirma: `CODCUSTO` é a chave canônica de centro de custo no schema CTB (alinha com a hipótese de `CTBCUSTO` ser o mestre).

### 10.4 Histórico e exercício

**`CTBHISTO`** (6 cols) — histórico padrão (template de descrição).
- PK: `CODHISTO` + `NROPLANO`
- `DESCHISTO(100)`, `INFORMA_COMPLEMENTOHISTO(1)`, `UTILIZADO_EM(255)`, `EXEMPLO(100)`

**`CTBEXERC`** (10 cols) — exercício fiscal.
- PK: `(CODIGOEMPRESA, CODIGOFL, NOME_EX(10))`
- `DATA_INI_EX`, `DATA_FIN_EX`, `NROPLANO`
- **`SITUACAO_EX(1)`** ⭐ — aberto/fechado (importante: travar edição em exercício fechado)
- `RESULTADO_APURADO_EX(1)`, `SALDO_TRANSFERIDO_EX(1)`, `SALDOCC_TRANSFERIDO_EX(1)` — flags de fim de exercício

### 10.5 CTR_EMPAUTORIZADAS (mestre real com CNPJ) — 9 cols

- PK: `CODINTEMPAUT`
- **`INSCRICAOEMPRESA(18)`** ← CNPJ
- `RSOCIALEMPRESA(50)`, `NOMEFANTASIAEMPRESA(30)`
- `TIPOINSCRICAOEMPAUT(5)` — distingue PJ/PF
- `CHECKSUMEMPRESA(10)` — checksum interno (validação?)
- `CODINTCONCEDENTE` — FK para concedente (DGM/concessão)
- `TIPINSSUB(5)`, `NUMINSSUB(14)` — inscrição substituta

Pra montar o "perfil completo" da empresa: `CTR_CADEMP JOIN CTR_EMPAUTORIZADAS ON CODINTEMPAUT`.

### 10.6 BGM_CLIENTE — 176 colunas

Cadastro de cliente CR. Pontos relevantes:

- **PK:** `CODCLI` (NUMBER) + `NRCLI(6)` (alfanumérico)
- **Identidade:** `RSOCIALCLI(100)`, `NFANTASIACLI(30)`, `TPINSCRICAOCLI(5)`, `NRINSCRICAOCLI(20)`, `INSCESTADUALCLI`, `INSCMUNICIPALCLI`
- **Endereço normal + endereço de cobrança separado:** todos os campos `*COBRANCACLI`
- **Geolocalização:** `LATITUDE_CLI(20)`, `LONGITUDE_CLI(20)` ⭐
- **Crédito:** `VLRLIMITECOMPRACLI`, `DT_CANC_CRED`, `DT_REAB_CRED`, `PROTESTAR(1)`, `INSTRUCAO_PROTESTO(2)`
- **Cobrança:** `TIPO_COBRANCA(1)`, `DIA_VENCIMENTO`, `TIPO_VENCTO(1)`, `BANCO_FAT`, `AGENCIA_FAT`, `CONTA_FAT(15)`, `COD_RESP_COB(6)`
- **Múltiplas condições de pagamento:** `COND_PGTO_1..6`, `COD_CONDPAGTO_COMBUST`, `COD_CONDPAGTO_LUBR`, `COD_CONDPAGTO_FILTRO`, `COD_CONDPAGTO_OUTROS`
- **Turismo (Pioneira faz?):** `AGENCIADETURISMO(1)`, `PARCELAPAGTOSTUR(1)`, `REGISTROEMBRATUR(30)`, `PERCDESCONTOTUR`, `SALDOCREDORTUR`, `TEMDIREITOACORTESIATUR`, `TEMDIREITOADESCONTOTUR`, `PERMITEFATURARPEDIDOSTUR`, `TIPO_CLIENTE_TURISMO`
- **Tributário:** `CONTRIBUINTEICMS`, `MICRO_EMPRESA`, `CLI_OPT_SIMPLES_NACIONAL`, `CLI_OPT_SIMEI`, `PRODUTORRURAL`, `RETER_INSS`, `RETEMIR`, `NATUREZA_RETENCAO(2)`, `CONTRIBUINTECPRB`
- **Reforma trib:** `NBS(12)`, `TRIBUTACAONACIONAL(6)`, `CST(3)`, `CLASSTRIB(6)`, `INDICADOROPERACAO(6)`
- **Frete/transporte:** `FRETE_DIRIGIDO`, `ROTA_ENTREG_COL`, `CUBAGEM`, `COMPROVA_ENTREG`, `INDICE_REENTREG`, `SIT_PEDAGIO`, `RCTR_C`, `RCF_DC`
- **Auditoria:** `DATA_CADASTRO`, `DATA_ALTERACAO`, `DATA_INTEGRACAO`, `CONSULTOU_CNPJ_RECEITA(1)`
- **Cliente tomador (split billing):** `CODCLI_TOMADOR`, `NRINSCRICAOCLI_TOMADOR(20)`, `TIPO_TOMADOR`
- **Renegociação/SERASA:** `ENVIO_SERASA_RELATO`, `ENVIO_TEMPO_RELACIONAMENTO`
- `ID_EXTERNO RAW(16)` — UUID já existe

### 10.7 PI_PLANO_FIN ⭐ — customização Pioneira

**14 colunas, plano de contas hierárquico até 8 níveis.**

- `ID(9)` — PK (string, não NUMBER)
- `CODIGO(5)`, `DESCRICAO(50)`, `CLASSIFICADOR(20)`
- **`GRAU_1` ... `GRAU_8` VARCHAR2(100)** — descrição em cada nível hierárquico (espelha a posição no plano)
- `TIPO(1)` — provável: analítica (A) / sintética (S)
- `DATA_ATUALIZACAO` — single source of truth de mudança
- **Sem `CODIGOEMPRESA`** — global ao schema, mas como prefixo é `PI_`, é razoável supor uso exclusivo Pioneira (validar com DBA)

⚠️ **Decisão de uso:** dado que é custom + sem garantia de retrocompatibilidade em upgrade do Globus, **considerar replicar a tabela no Postgres como dimension mantida pela Pioneira** (`finance.plano_financeiro`), com sync read-only do PI_PLANO_FIN como fallback. Conversar com DBA da Pioneira antes de fechar.

### 10.8 CPG_GRUPO_CONTAS_FINANCEIRAS (4 cols)

`CODIGO_GRUPO` PK · `DESCRICAO(100)` · `ENVIA_EMAIL_GESTOR(1)` · `ENVIAR_ANEXO_EMAIL(1)`.

### 10.9 CPG_MOVIMENTO_PLANO_FINANCEIRO (14 cols)

Movimentação orçamentária:
- PK: `ID_MOVTO_ORC`
- `CODINTORC` (FK → `CPG_CAD_ORCAMENTO_PREVISOES`?)
- `DATA_OPERACAO`, `VALOR_OPERACAO`, `STATUS(1)`
- `USUARIO`, `SISTEMA(3)`, `ROTINA(100)` — rastreabilidade
- `ID_MOVTO_ORC_ASSOCIADO` — link pra estorno/correção
- `ID_GRUPO` (FK `CPG_GRUPO_CONTAS_FINANCEIRAS`)
- `CODIGOEMPRESA`, `CODIGOFL`, `CODIGO_GRUPO_CONTA`, `CODIGO_ORCAMENTO`

### 10.10 CPG_CONTRATOS — 81 colunas (universal CP+CR)

Contratos (financiamento bancário, prestação de serviço, etc.). Atende **tanto CP quanto CR** — tem ambos `CODIGOFORN` e `CODCLI`.

- **PKs:** `CODIGO_CONTRATO` (composto com EMP/FL) + `ID_CONTRATO` (surrogate)
- `NUMERO_CONTRATO(50)`, `NUMERO_CONTROLE(50)`, `CODIGO_EMPRESA`, `CODIGO_FILIAL`
- **Valores:** `VLR_CONTRATO`, `VLR_CONTRATO_IND` (indexado), `NUMERO_PARCELAS`, `VLR_PARCELA`, `VLR_PARCELA_IND`, `VLR_ENTRADA`, `VLR_BRUTO_CONTRATO`
- **Vigência:** **`VIGENCIA_INICIO`/`VIGENCIA_FIM`** ⭐ (não `DT_INI`/`DT_FIM` — corrigir a hipótese da rodada 2)
- `DATA_CONTRATO`, `DATA_LIBERACAO`
- **Indexação:** `CODIGO_INDICE(3)`, `DATA_INDICE`, `VLR_INDICE`, `COD_INDICE_JUROS`
- **Juros:** `TAXA_JUROS`, `PERIOC_TAXA`, `DIAS_PARA_TAXA`, `JUROS_AO_DIA`, `TIPO_CALCULO_TAXA(1)`, `PERIOC_JUROS(1)`, `PRAZO_CARENCIA`, `PAGTOS_ENCARGOS`, `PERIOC_PAGTOS_ENC`
- **Específicos bancários:** `TAXA_TRC_CAIXA`, `TAXA_TRC_BMB`, `TAXA_SPREAD_BMB`, `PERIOC_TRC_CAIXA`, `PERIOC_TRC_BMB`, `PERIOC_SPREAD_BMB`, `INSTITUICAO_FIN(50)`, `TIPO_CONTRATO_BMB(1)`
- **Pagamentos:** `PRI_PAGTO_PRINCIPAL`, `ULT_PAGTO_PRINCIPAL`, `PAGTOS_REAL`, `AJUSTE_VENCTO`, `DIA_INICIAL(2)`, `PRI_VENCTO_CARENCIA`
- **Contábil/custos:**
  - CP: `CODCUSTOFIN_VALOR`, `CODCUSTOFIN_JUROS`, `CODTPDESPESA_VALOR(5)`, `CODTPDESPESA_JUROS(5)`, `CCUSTO_TPDESP_VALOR`, `CCUSTO_TPDESP_JUROS`, `CPCTB_TPDESP_VALOR`, `CPCTB_TPDESP_JUROS`
  - CR: `CODCUSTOFINCRC`, `CODTPRECEITA(5)`, `CCUSTO_TPREC(5)`, `CPCTB_TPREC(5)`
  - `CODLANCA_VLR`, `CODLANCA_JUR`
- **Fornecedor/cliente:** `CODIGOFORN`, `CODCLI`
- **Inativação/renovação:** `CONTRATO_INATIVO(1)`, `DATA_INATIVACAO`, `RESP_INATIVACAO(15)`, `ID_CONTRATORENOVADO`
- **Fiscal:** `TIPO_NOTA(1)`, `CODCLASSFISC`, `CODOPERFISCAL`, `CODNATPREST`, `CODGRUPOVALORES`, `CODGRPRATEIO`, `CONTABILIZA_TOT_CONTRATO`, `SERIE(5)`, `CODTPDOC(3)`
- **Gestor:** `USUARIO_GESTOR(15)`, `NOME_GESTOR(40)`
- `OBSERVACAO(500)`, `TIPO_CONTRATO`, `PRAZO_DIAS`

### 10.11 CPG_CONTRATOS_PARCELAS — 52 colunas

Amortização parcela a parcela, com cálculo completo.

- **PK:** `CODIGO_PARCELA` + `ID_CONTRATO` (FK)
- **Numeração:** `NUM_PARC_CALCULADA`, `NUM_PARC_PRINCIPAL`
- **Datas:** `DATA_PARCELA`, `DATA_VENCIMENTO`, `IND_DIA_VENC_PARC`, `IND_ULTIMO_DIA_MES`, `ULTIMO_DIA_MES`, `VIGENCIA_INICIO`, `VIGENCIA_FIM`, `VENCTO_MANUAL(1)`
- **Saldos:** `SALDO_INICIAL`, `SALDO_INICIAL_IND`, `SALDO_FINAL`, `SALDO_FINAL_IND`, `SALDO_FINAL_AJUST`, `SALDOFINAL_MANUAL(1)`
- **Juros decompostos:** `JUROS_PARC`, `JUROS_PROP`, `JUROS_PARC_IND`, `JUROS_PROP_IND`, `JUROS_TOTAL`, `JUROS_TOTAL_IND`, `JUROS_AO_DIA`, `PRAZO_JUROS_PARC`, `PRAZO_JUROS_PROP`, `VLR_INDICE_JUROS`, `VLR_TAXA_JUROS`
- **Juros específicos banco:** `JUROS_TRCC`, `JUROS_TRCB`, `JUROS_SPREAD`, `JUROS_TRCC_IND`, `JUROS_TRCB_IND`, `JUROS_SPREAD_IND`
- **Amortização:** `VLR_AMORTIZACAO`, `VLR_AMORTIZACAO_IND`, `AMORTIZACAO_AJUST`
- **Parcela:** `PARCELA_IND`, `PARCELA_CALCULADA`, `PARCELA_PAGA`, `JUROS_PARCELA_AJUST`, `VALOR_PARCELA_AJUST`
- **Variação:** `VARIACAO_MONETARIA`
- **Links:** `CODDOCTOCPG` (vira título CP), `CODDOCTOCRC` (vira título CR), `CODDOCTOESF`, `CODLANCA_JUR`, `CODLANCA_TRANSF_VLR`, `CODLANCA_TRANSF_JUR`
- `SISTEMA_ORIGEM_INTEGRACAO_FIN(3)`, `GLB_CONTROLA_PARC(1)`

**→ Não precisamos reimplementar lógica de juros/amortização — herdamos do Globus.**

### 10.12 CPG_CAD_ORCAMENTO (6 cols)

- PK: `CODIGO_ORCAMENTO`
- `DESCRICAO(100)`, `EXERCICIO`, `DATA_LIMITE_ALTERACAO`
- **`PERMITE_DESPESA_MAIOR_RECEITA(1)`** — regra de bloqueio
- `UTILIZA_CENTRO_CUSTO(1)` — flag

### 10.13 CPG_CAD_ORCAMENTO_PREVISOES (8 cols)

- PK: `CODINTORC`
- `CODIGO_ORCAMENTO` (FK)
- `DATAPREVISAO`, `VALOR`, `META`
- `TIPORECEITA(5)`, `TIPODESPESA(5)` — categorização
- `CODCUSTOFIN` — centro de custo

---

## 11. Schemas que ainda faltam (rodada 3 incompleta)

A rodada 3 trouxe 15 dos 18 schemas planejados. Faltam:

| # | Tabela | Status |
|---|---|---|
| 1 | **`CTBPLANO`** | mestre do plano de contas — ainda sem schema |
| 2 | **`CTBCONTA`** | conta contábil individual — ainda sem schema |
| 3 | **`CTBCUSTO`** ou **`CTBCDDRE`** | um dos dois ainda sem schema (1ª resposta é ambígua: 3 cols `NUMERO/DESCRICAO/NROPLANO` encaixa em ambos) |
| 4 | **`CTBITLNC`** | itens do lançamento contábil — **descoberta nova**, valor do CTBLANCA mora aqui |

Mais os blocos de dados que travaram: amostras (`CODTPDOC '001'/'002'`, status `BCOCONTA`, datas `BCOMOVTO`, NF emitida) e volumetrias (`CTBLANCA` mês, `CPG_CONTRATOS` total, `CPG_CAD_ORCAMENTO` total) + validação `CODCUSTO` vs `CODCUSTOFIN`.

---

## 12. Atualização do plano de modelagem (com base nas descobertas)

1. **Herdar a DRE do Globus:** sync `CTBCDDRE` + `CTBITDRE` como dimensão → módulo DRE renderiza direto.
2. **Plano de contas:** decidir entre `CTBPLANO` (padrão Praxio) e `PI_PLANO_FIN` (custom Pioneira). Se ambos coexistem, podem ter regras diferentes. **Validar com DBA qual é o "verdadeiro" hoje.**
3. **Contratos como entidade própria** no Postgres (`finance.contratos`), não apenas como CPG. Modelo no nosso lado pode até ser mais simples que o do Globus (52 cols de parcela), mas **trazer tudo no stage** para auditoria.
4. **Centro de custo único:** `CTBCUSTO.NUMERO` é o mestre. `CODCUSTO`/`CODCUSTOFIN` apontam pro mesmo universo (validar com bloco 50). `CODCUSTOCTB` é VARCHAR2(5) em BCOHISTO — pode ser um espaço de chaves diferente (string vs número).
5. **Exercício fiscal:** `CTBEXERC.SITUACAO_EX` controla janela editável — replicar no nosso modelo pra bloquear mudanças em meses fechados.
6. **Saldos:** `CTBSALDO`/`CTBSALDOCCUSTO` mensais; saldo intramês = cálculo a partir de `CTBLANCA` + `CTBITLNC`.

---

## 13. Arquivos relacionados

- `Leia/globus-tabelas-financeiras-documentacao.md` — 7 tabelas mapeadas em 13/05 (autor Leonardo)
- `Leia/folha-flp-detalhamento.md` — rascunho da folha
- `Leia/globus-arrecadacao-operacional.md` — receita operacional GDF
- `Leia/globus-contas-receber-caixa.md` — CR e caixa
- `sql-exploracao/2026-05-18-globus-mes-corrente.sql` — script padrão respeitando as 4 regras
- `sql-exploracao/2026-05-18-globus-gaps-mapeamento.sql` — rodada 2
- `sql-exploracao/2026-05-18-globus-rodada-3.sql` — rodada 3
- `sql-exploracao/2026-05-18-globus-volumetria-v2-leve.sql` — viola regra 2 (6 meses); **converter** em script de histórico mensal manual ou arquivar
- `sql-exploracao/2026-05-18-globus-volumetria.sql` — viola regra 2 (24 meses); **arquivar**
