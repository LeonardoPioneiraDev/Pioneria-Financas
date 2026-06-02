# 03 · Banco de Dados Próprio

> Banco: `pioneira_finance_db` (PostgreSQL 16). Organizado em **4 schemas** com responsabilidades claras. Toda escrita é auditada.

## Princípios de modelagem

1. **Single source of truth dentro do escopo financeiro**: cada fato financeiro vive em **uma** tabela canônica de `finance.*`. Nada de duplicar entre tabelas.
2. **Dados externos são SNAPSHOTS materializados**: nunca lidos em runtime do sistema-fonte. Vivem em `integration.*_stage` (raw) e são processados para `finance.*` (canônico).
3. **Cada linha financeira é rastreável**: `origem_sistema`, `origem_id_externo`, `metodo` (manual/api/calculado), `created_by`, `created_at`, `updated_by`, `updated_at`, `version` (controle otimista de concorrência).
4. **Soft delete só quando necessário** — preferir status enum (`ativo` / `cancelado` / `estornado`) com `cancelado_em` e `cancelado_motivo`. Permite histórico sem perder integridade.
5. **Tudo é em centavos** (BIGINT). Evita drift de `NUMERIC(14,2)` em operações pesadas.
6. **Multi-tenant ready** (mesmo sem ser usado agora): toda tabela financeira tem `empresa_id`. Hoje sempre = 1 (Pioneira). Permite expandir se a holding crescer.

## Schemas

```sql
CREATE SCHEMA identity;     -- usuários, permissões locais (espelho do Keycloak)
CREATE SCHEMA finance;      -- tabelas canônicas de negócio
CREATE SCHEMA integration;  -- staging + metadata de sincronização
CREATE SCHEMA audit;        -- trilha completa de mudanças
```

---

## Schema `identity`

> Espelho **mínimo** do Keycloak para uso local (cache de roles, preferências de UI, permissões granulares por recurso). Keycloak é a fonte de verdade.

```
identity.usuarios
  id (UUID, PK)            -- mesmo do Keycloak `sub`
  email                    -- único
  nome_completo
  ativo                    -- denormalizado do Keycloak
  ultimo_login_em
  preferencias_ui (JSONB)  -- tema, idioma, filtros default
  created_at, updated_at

identity.papeis
  id (PK)
  nome                     -- ex: 'cfo', 'controller', 'cp_analista', 'cr_analista', 'auditor'
  descricao

identity.permissoes
  id (PK)
  papel_id (FK -> papeis)
  recurso                  -- ex: 'contas_pagar', 'fluxo_caixa', 'folha'
  acao                     -- ex: 'ler', 'criar', 'aprovar', 'cancelar'

identity.usuario_papel
  usuario_id (FK)
  papel_id (FK)
  empresa_id
  PRIMARY KEY (usuario_id, papel_id, empresa_id)

identity.aprovacao_workflow
  id, recurso, etapa_ordem, papel_id, valor_minimo (cents)
  -- ex: contas_pagar > R$ 50k exige cfo
```

---

## Schema `finance`

### Plano de contas

```
finance.plano_contas
  id (PK)
  codigo                   -- ex: '3.1.01.001'
  descricao                -- 'Folha de Pagamento'
  tipo                     -- 'ativo' | 'passivo' | 'receita' | 'despesa' | 'patrimonio'
  natureza                 -- 'operacional' | 'financeiro' | 'tributario' | 'nao_operacional'
  pai_id (FK self)         -- hierárquico
  ativo (bool)
```

### Contas a receber

```
finance.contas_receber
  id (PK), empresa_id
  cliente_tipo             -- 'gdf_subsidio' | 'usuario_bilhetagem' | 'venda_avulsa' | 'outros'
  cliente_id (UUID)        -- referência externa quando aplicável
  cliente_nome
  competencia (date)       -- mês de referência (sempre dia 1)
  data_emissao
  data_vencimento
  valor_bruto_cents (BIGINT)
  glosa_cents              -- DEFAULT 0
  juros_cents              -- DEFAULT 0
  multa_cents              -- DEFAULT 0
  valor_liquido_cents      -- GENERATED: bruto - glosa + juros + multa
  numero_documento         -- NF, ofício, etc.
  motivo_glosa
  status                   -- 'a_receber' | 'parcial' | 'quitado' | 'cancelado'
  plano_conta_id (FK)
  origem_sistema           -- 'gdf' | 'bilhetagem' | 'manual' | 'erp'
  origem_id_externo
  observacao
  created_by, created_at, updated_by, updated_at, version
```

### Recebimentos (lançamentos efetivos de entrada de caixa)

```
finance.recebimentos
  id (PK), empresa_id
  conta_receber_id (FK)    -- pode ser NULL para entradas sem CR previa
  data_recebimento
  valor_cents
  forma                    -- 'ted' | 'pix' | 'boleto' | 'dinheiro' | 'cheque' | 'compensacao'
  conta_bancaria_id (FK)
  numero_documento
  conciliacao_id (FK)      -- preenchido após conciliação bancária
  origem_sistema, origem_id_externo
  created_by, created_at, updated_at, version
```

### Contas a pagar

```
finance.contas_pagar
  id (PK), empresa_id
  fornecedor_id (FK -> fornecedores)
  competencia (date)
  data_emissao, data_vencimento
  valor_bruto_cents
  desconto_cents, juros_cents, multa_cents
  valor_liquido_cents (GENERATED)
  numero_documento         -- NF, contrato
  plano_conta_id (FK)
  status                   -- 'pendente' | 'aprovado' | 'pago' | 'cancelado' | 'em_aprovacao'
  aprovacoes (JSONB)       -- histórico de etapas do workflow
  observacao
  origem_sistema, origem_id_externo
  created_by, created_at, updated_by, updated_at, version

finance.pagamentos
  id (PK), empresa_id
  conta_pagar_id (FK)
  data_pagamento
  valor_cents
  forma                    -- 'ted' | 'pix' | 'boleto' | 'cheque'
  conta_bancaria_id (FK)
  conciliacao_id (FK)
  numero_documento
  origem_sistema, origem_id_externo
  created_by, created_at, version

finance.fornecedores
  id (PK), empresa_id
  cnpj_cpf, razao_social, nome_fantasia
  banco_padrao_id, agencia, conta
  ativo
  origem_sistema, origem_id_externo
```

### Contas bancárias e conciliação

```
finance.contas_bancarias
  id (PK), empresa_id
  banco, agencia, conta, tipo
  saldo_inicial_cents, saldo_inicial_data
  ativo

finance.movimentos_bancarios
  id (PK), conta_bancaria_id (FK)
  data, valor_cents (negativo = saída)
  descricao_extrato         -- string original do banco
  identificador_extrato     -- hash ou ID único do banco para idempotência
  conciliacao_id (FK)       -- aponta para o lançamento conciliado
  fonte                     -- 'open_finance' | 'ofx_upload' | 'manual'
  created_at

finance.conciliacao
  id (PK)
  tipo                      -- 'receber' | 'pagar'
  lancamento_id             -- aponta para recebimentos.id ou pagamentos.id
  movimento_bancario_id (FK)
  diferenca_cents           -- 0 = perfeita; >0 = sobra; <0 = falta
  motivo_diferenca
  conciliado_em, conciliado_por
```

### Receita técnica (cálculo derivado, NÃO é caixa)

```
finance.receita_tecnica_mensal
  id (PK), empresa_id
  competencia (date)        -- sempre dia 1 do mês
  pax_total                 -- da integração bilhetagem
  tarifa_aplicada_cents     -- snapshot da tarifa SEMOB do mês
  receita_tecnica_cents     -- GENERATED: pax * tarifa
  fonte_pax                 -- 'controle_horarios' | 'transdata' | 'manual'
  data_calculo
  parametro_externo_id (FK) -- aponta para o snapshot de tarifa usado
```

> Por que isso é necessário: a receita "teórica" precisa de uma tabela só dela. É o número que entra nos painéis de "Receita Tarifa Técnica/KM". O caixa real vive em `contas_receber` + `recebimentos`. **Cruzar os dois** é o coração do painel de Recebíveis.

### Fluxo de caixa

```
finance.fluxo_caixa_realizado_mensal
  id (PK), empresa_id, competencia
  entradas_cents, saidas_cents
  saldo_mes_cents (GENERATED)
  saldo_acumulado_cents     -- calculado por job, snapshot
  computado_em
  -- view materializada a partir de recebimentos + pagamentos

finance.fluxo_caixa_projecao
  id (PK), empresa_id
  data_projecao             -- quando essa projeção foi calculada
  competencia               -- mês projetado
  entradas_projetadas_cents
  saidas_projetadas_cents
  saldo_projetado_cents
  metodo                    -- 'prophet' | 'media_movel_6m' | 'orcamento'
  pontos_historicos
  premissas (JSONB)
  intervalo_confianca_inf_cents, intervalo_confianca_sup_cents
```

### Folha de pagamento (espelho do RH/Globus)

```
finance.folha_mensal_consolidada
  id (PK), empresa_id, competencia
  qtd_funcionarios_ativos
  salario_base_cents        -- REAL, do RH
  outros_proventos_cents    -- REAL, do RH
  inss_patronal_cents       -- CALCULADO ou REAL (quando integração)
  fgts_cents
  sistema_s_cents
  rat_fap_cents
  provisao_13_cents
  provisao_ferias_cents
  provisao_rescisao_cents
  custo_total_pessoal_cents (GENERATED)
  origem_dados              -- 'globus_api' | 'sefip_upload' | 'esocial_api'
  status_dados              -- 'real' | 'calculado_aliquotas' | 'mistura'
  computado_em

finance.folha_funcionario_mensal   -- detalhe granular quando disponível
  id, competencia, funcionario_id_externo
  cpf_hash                  -- nunca CPF aberto
  nome (criptografado em repouso)
  area, funcao
  salario_base_cents, total_proventos_cents
  -- só populado quando há integração com Globus/eSocial
```

### Tributos

```
finance.tributos_mensais
  id (PK), competencia
  tributo                   -- 'pis' | 'cofins' | 'icms' | 'iss' | 'ir' | 'csll'
  base_calculo_cents
  aliquota_pct
  valor_devido_cents
  valor_pago_cents
  vencimento, pago_em
  status, origem_sistema
```

### Depreciação

```
finance.ativos_imobilizados        -- frota, prédios, equipamentos
  id, descricao, categoria         -- 'veiculo' | 'equipamento' | 'imovel'
  valor_aquisicao_cents
  data_aquisicao
  vida_util_meses
  metodo_depreciacao        -- 'linear' default; permite 'soma_digitos'
  origem_sistema_id_externo -- se vem do workshop, mantém o vínculo

finance.depreciacao_mensal
  id, ativo_id, competencia
  valor_depreciado_cents
  saldo_residual_cents
  -- gerada por job; pode ser regerada por completo se metodologia mudar
```

### Orçamento e planejamento

```
finance.orcamento_anual
  id, ano, plano_conta_id, empresa_id
  valor_orcado_cents
  versao                    -- 'aprovado' | 'revisao_1' | 'revisao_2' ...
  aprovado_em, aprovado_por

finance.orcamento_mensal     -- detalhe mensal do anual
  orcamento_anual_id (FK)
  competencia
  valor_orcado_mes_cents
```

### Parâmetros externos com histórico

```
finance.parametros_externos
  id (PK)
  chave                     -- 'tarifa_tecnica_brl' | 'diesel_brl' | 'multa_grave_brl' ...
  valor_cents               -- ou JSON para tipos complexos
  vigencia_inicio, vigencia_fim
  fonte_documento           -- 'SEMOB Cálculo da Tarifa Técnica'
  fonte_url
  status                    -- 'oficial' | 'estimativa' | 'ausente'
  criado_em, criado_por
  -- nova linha a cada atualização (NÃO faz UPDATE)
```

> Permite responder: "qual era a tarifa em fev/2026 quando esse repasse foi feito?". Crítico para auditoria.

---

## Schema `integration`

> Cada sistema-fonte tem suas tabelas `*_stage` (raw, espelho do que veio da API) e metadata de jobs.

```
integration.sistemas_fonte
  id (PK)
  nome                      -- 'workshop' | 'globus' | 'transdata' | 'sgd' | 'gdf_repasses' | 'anp' | 'open_finance'
  base_url
  metodo_auth               -- 'bearer' | 'oauth2' | 'api_key' | 'mtls'
  credenciais_vault_path    -- nunca armazena segredo aqui; aponta para o Vault
  ativo
  ultimo_sync_em
  ultimo_sync_status        -- 'sucesso' | 'erro' | 'parcial'
  ultimo_sync_mensagem

integration.sync_jobs
  id (PK), sistema_id (FK)
  iniciado_em, terminado_em
  status                    -- 'rodando' | 'ok' | 'erro' | 'cancelado'
  registros_lidos, registros_gravados, registros_com_erro
  parametros (JSONB)        -- ex: since=2026-01-01
  erros (JSONB)             -- até N primeiros erros para debug
  correlation_id            -- vincula com logs

integration.workshop_custos_stage
  id, competencia, categoria
  valor_cents, raw_payload (JSONB)
  origem_id_externo, sync_job_id (FK)
  recebido_em

integration.globus_funcionarios_stage
  id, snapshot_date, raw_payload (JSONB)
  -- daily snapshot da base funcionarios_globus
  sync_job_id (FK)

integration.transdata_viagens_stage
  id, data_referencia, raw_payload (JSONB)
  sync_job_id (FK)

integration.sgd_documentos_stage
  id, tipo, numero, valor_cents, vencimento
  raw_payload (JSONB), sync_job_id (FK)

integration.gdf_repasses_stage
  id, ano_ref, mes_ref, numero_oficio, valor_bruto_cents, glosa_cents
  raw_payload (JSONB), sync_job_id (FK)
  -- pode vir de CSV manual (origem='upload') ou de API GDF (origem='api')

integration.anp_precos_stage
  id, data, produto, uf, preco_revenda
  raw_payload (JSONB), sync_job_id (FK)

integration.open_finance_extratos_stage
  id, conta_bancaria_id, data, valor_cents, descricao
  identificador_externo, raw_payload (JSONB)
  sync_job_id (FK)
```

> **Padrão:** raw_payload (JSONB) sempre guardado. Permite reprocessar quando o ETL evolui. O ETL lê do stage e popula `finance.*`.

---

## Schema `audit`

```
audit.eventos
  id (PK, BIGSERIAL)
  evento                    -- 'finance.contas_pagar.criar' | 'finance.fluxo_caixa.recalcular' ...
  usuario_id, sessao_id
  recurso_tipo, recurso_id  -- ex: 'contas_pagar', 12345
  ip_origem, user_agent
  payload_antes (JSONB)     -- snapshot do estado anterior (em UPDATE)
  payload_depois (JSONB)    -- snapshot do estado novo
  metadata (JSONB)          -- correlation_id, request_id, etc.
  criado_em

audit.aprovacoes
  id, recurso_tipo, recurso_id
  papel_aprovador, usuario_aprovador
  decidiu_em, decisao         -- 'aprovado' | 'rejeitado' | 'devolvido'
  motivo
  evento_id (FK)

audit.login_eventos
  id, usuario_id, ip, user_agent
  sucesso (bool), motivo_falha
  ocorreu_em
  -- tipos: 'login' | 'logout' | 'token_refresh' | 'mfa_falha'
```

---

## Índices essenciais

```sql
-- Hot path do fluxo de caixa
CREATE INDEX finance_recebimentos_competencia  ON finance.recebimentos(empresa_id, data_recebimento);
CREATE INDEX finance_pagamentos_competencia    ON finance.pagamentos  (empresa_id, data_pagamento);

-- Hot path de contas a receber/pagar
CREATE INDEX finance_cr_vencimento_status  ON finance.contas_receber(status, data_vencimento)
  WHERE status IN ('a_receber','parcial');
CREATE INDEX finance_cp_vencimento_status  ON finance.contas_pagar  (status, data_vencimento)
  WHERE status IN ('pendente','em_aprovacao','aprovado');

-- Recebíveis GDF
CREATE INDEX finance_cr_gdf_competencia
  ON finance.contas_receber(competencia)
  WHERE cliente_tipo = 'gdf_subsidio';

-- Audit
CREATE INDEX audit_eventos_recurso  ON audit.eventos(recurso_tipo, recurso_id, criado_em DESC);
CREATE INDEX audit_eventos_usuario  ON audit.eventos(usuario_id, criado_em DESC);

-- Integration
CREATE INDEX integration_sync_jobs_sistema  ON integration.sync_jobs(sistema_id, iniciado_em DESC);
```

## Migrations

Tudo em **Alembic**. Numeradas sequencialmente (`0001_initial.py`, `0002_...py`). Nenhuma migration destrutiva sem **revisão dupla** + backup.

Princípio: migrations são **aditivas** sempre que possível. Para mudar tipo de coluna, criar nova coluna, migrar dado, depois dropar a antiga em release separada.

## Snapshots de exemplo (queries úteis)

```sql
-- Recebíveis vencidos do GDF
SELECT competencia, sum(valor_liquido_cents)/100.0 AS valor
FROM finance.contas_receber
WHERE cliente_tipo = 'gdf_subsidio' AND status IN ('a_receber','parcial')
  AND data_vencimento < CURRENT_DATE
GROUP BY competencia
ORDER BY competencia DESC;

-- Fluxo de caixa últimos 12 meses
SELECT date_trunc('month', data) AS mes,
       sum(CASE WHEN tipo='entrada' THEN valor_cents ELSE 0 END)/100.0 AS entradas,
       sum(CASE WHEN tipo='saida'   THEN valor_cents ELSE 0 END)/100.0 AS saidas
FROM (
  SELECT data_recebimento AS data, valor_cents, 'entrada' AS tipo FROM finance.recebimentos
  UNION ALL
  SELECT data_pagamento, valor_cents, 'saida' FROM finance.pagamentos
) t
WHERE data >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY 1 ORDER BY 1;

-- Tarifa técnica vigente em data X
SELECT valor_cents/100.0 AS tarifa
FROM finance.parametros_externos
WHERE chave = 'tarifa_tecnica_brl'
  AND vigencia_inicio <= '2026-03-01'
  AND (vigencia_fim IS NULL OR vigencia_fim > '2026-03-01')
ORDER BY vigencia_inicio DESC LIMIT 1;
```
