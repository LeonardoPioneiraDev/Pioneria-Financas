# 04 · Identidade & Integrações

> Dois temas no mesmo documento porque resolvem o mesmo problema fundamental: **parar de duplicar coisas entre sistemas Pioneira**. Identidade resolve "mesmo usuário em todos os sistemas". Integrações resolvem "mesmo dado, uma única fonte".

---

# Parte 1 · Identidade (SSO via Keycloak)

## Por que Keycloak

| Critério | Keycloak | Auth0 / Cognito | Solução caseira |
|---|---|---|---|
| Self-hosted | ✅ | ❌ paga | ✅ |
| OIDC + SAML padrão | ✅ | ✅ | ❌ |
| Custo | grátis | $$$ | tempo de dev |
| Pronto pra federação (LDAP, AD) | ✅ | ✅ | ❌ |
| Console admin | ✅ maduro | ✅ | tempo de dev |

**Decisão:** Keycloak 24+ self-hosted.

## Arquitetura de identidade

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ Workshop UI  │    │ SGD UI       │    │ Pioneira     │    │ Transdata    │
│              │    │              │    │ Insights v2  │    │ admin (se    │
│              │    │              │    │              │    │ existir)     │
└──────┬───────┘    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
       │                   │                   │                   │
       └───────────────────┴───────────────────┴───────────────────┘
                                   │
                                   ▼
                       ┌────────────────────────┐
                       │ KEYCLOAK (OIDC)        │
                       │ realm: pioneira        │
                       │ ┌────────────────────┐ │
                       │ │ Clients:           │ │
                       │ │  - workshop-fe     │ │
                       │ │  - workshop-be     │ │
                       │ │  - sgd-fe          │ │
                       │ │  - pioneira-fe v2  │ │
                       │ │  - pioneira-be v2  │ │
                       │ │  - transdata       │ │
                       │ ├────────────────────┤ │
                       │ │ Users (uma vez)    │ │
                       │ │ Groups, Roles      │ │
                       │ │ Federation (AD)    │ │
                       │ └────────────────────┘ │
                       └────────────────────────┘
```

## Modelo

### Realm

Um realm `pioneira` que cobre todos os sistemas da Pioneira. (Se a holding crescer e separar empresas, cada uma vira um realm e o Keycloak suporta isso nativo.)

### Clients

Um client por aplicação:

| Client ID | Tipo | Notas |
|---|---|---|
| `pioneira-insights-fe-v2` | public + PKCE | Frontend SPA, usa Authorization Code com PKCE |
| `pioneira-insights-be-v2` | confidential | Backend valida JWT; pode trocar tokens em fluxo machine-to-machine |
| `workshop-fe` | public + PKCE | (já existente, migrar) |
| `workshop-be` | confidential | (já existente, migrar) |
| `sgd-fe` | public + PKCE | (já existente, migrar) |
| `transdata-api` | confidential ou service account | depende de como ele autentica |

### Roles globais (no realm)

```
pioneira-employee            -- todo funcionário
pioneira-admin               -- super admin (raro, com MFA forçado)
```

### Roles por client (granularidade financeira fica aqui)

Para `pioneira-insights-be-v2`:

```
financeiro.ler                    -- ver dashboards, sem editar
financeiro.contas_pagar.criar
financeiro.contas_pagar.aprovar
financeiro.contas_receber.editar
financeiro.fluxo_caixa.recalcular
financeiro.folha.ver
financeiro.parametros.alterar
financeiro.auditoria.exportar
```

### Groups (atribuição em bulk)

```
/Diretoria                  → role: financeiro.ler, ...folha.ver, ...auditoria.exportar
/Financeiro/CFO             → todas as roles financeiras + aprovação ilimitada
/Financeiro/Controller      → ler tudo, aprovar até R$ X
/Financeiro/Contas_a_Pagar  → cp_analista (criar, ver, sem aprovar)
/Financeiro/Contas_a_Receber→ cr_analista
/Operacional                → role básica (sem acesso financeiro)
```

## Fluxos

### Login (browser → frontend → Keycloak → backend)

1. Usuário acessa `pioneira-insights.com.br`. Frontend detecta ausência de token.
2. Frontend redireciona para Keycloak (`/realms/pioneira/protocol/openid-connect/auth` com `response_type=code`, `code_challenge`).
3. Usuário entra credenciais no Keycloak. Se primeiro login no dia e MFA habilitado, faz TOTP.
4. Keycloak redireciona de volta com `code`.
5. Frontend troca `code` por `access_token` + `refresh_token` (PKCE).
6. Frontend chama backend com `Authorization: Bearer <access_token>`.
7. Backend valida o JWT (cache da JWKS do Keycloak). Extrai `sub`, `email`, roles. Se primeiro acesso, cria/atualiza `identity.usuarios`.

### Refresh

Frontend usa refresh token em background quando access expira em <2 min. Se refresh falhar, força novo login.

### Logout

`POST /logout` no Keycloak + invalida cookie/storage local. Outros sistemas detectam via SSO Logout (back-channel).

### Provisioning de usuário

- **Manual:** admin cria no console Keycloak; atribui groups.
- **Federação (futuro):** se a Pioneira tiver AD/LDAP, federa para criar usuários automaticamente.
- **Boot:** seed inicial com diretor financeiro + 2 admins TI.

## Migração dos sistemas atuais

Cada sistema atual (workshop, sgd, transdata, pioneira_insights v1) tem seu próprio login. Para unificar:

1. **Fase 1 (preparação):** seed dos usuários atuais no Keycloak (export → import). Email = identificador único.
2. **Fase 2 (paralela):** cada sistema aceita login pelo Keycloak **OU** login local (legado). Botão "entrar com Pioneira" aparece.
3. **Fase 3 (corte):** depois de 30 dias de paralelo sem incidentes, remove login local.

Esta migração roda **em paralelo** ao desenvolvimento do v2 financeiro. O v2 já nasce só com Keycloak.

---

# Parte 2 · Integrações com sistemas externos

## Princípio: cada sistema-fonte é um Adapter

```python
# Esqueleto conceitual (não código pronto)
class FonteSistemaAdapter(Protocol):
    nome: str

    def sync(self, since: datetime | None = None) -> SyncResult:
        """Pull idempotente. Popula integration.{nome}_stage."""

    def healthcheck(self) -> bool:
        """Verifica autenticação e conectividade."""
```

Implementações:

- `WorkshopAdapter` — fala com a API do workshop-backend (porta 3333)
- `GlobusAdapter` (e/ou `ControleHorariosAdapter`) — fala com a API do controle_horarios; se não tiver API, lê via banco read-only
- `TransdataAdapter` — fala com a transdata-api (porta 8088)
- `SgdAdapter` — fala com sgd-backend (porta 3340)
- `GdfRepassesAdapter` — pode ser via CSV manual (UploadAdapter) **OU** API GDF quando disponível
- `AnpAdapter` — scraping da síntese semanal ANP
- `SemobAdapter` — scraping da página oficial de tarifa técnica
- `OpenFinanceAdapter` — extratos bancários via Pix Receba ou OFX

## ETL: Stage → Canônico

Cada adapter alimenta `integration.{nome}_stage` (raw). Um **transformer** roda separado:

```
RawAdapter   →  integration.workshop_custos_stage
                       │
                       ▼
              ┌────────────────┐
              │ WorkshopETL    │  ← regras de negócio: rateio, categorização
              └────────────────┘
                       │
                       ▼
              finance.contas_pagar (categoria='custo_operacional')
              finance.depreciacao_mensal (se workshop traz ativos)
```

**Por quê separar:** quando uma regra de cálculo mudar, basta re-rodar o transformer sem chamar a API externa de novo (raw já está no stage).

## Frequência e métodos

| Sistema | Frequência | Método | Razão |
|---|---|---|---|
| Workshop (custos mensais) | Diária 02:00 | Pull (API REST) | Custos consolidam até o fim do mês |
| Globus (folha) | Diária 04:00 | Pull (API ou CDC se possível) | Snapshot da folha do dia |
| Transdata (viagens) | Horária | Pull (API REST) | Operação tempo real-ish |
| SGD (documentos) | A cada 4h | Pull (API REST) | NFs novas, contratos atualizados |
| GDF (repasses) | Semanal (segunda 06:00) | CSV manual / API quando disponível | Repasses não são diários |
| ANP (diesel) | Semanal (sexta 06:00) | Scraping síntese semanal | ANP publica semanal |
| SEMOB (tarifa) | Mensal | Scraping página oficial | Tarifa muda raramente |
| Open Finance (extratos) | Diária 05:00 | API (autorizada) | Conciliação no D+1 |

## Contrato de cada fonte

Para cada adapter, o documento descreve:

1. **Endpoint** (URL base, recursos)
2. **Autenticação** (bearer, OAuth, mTLS)
3. **Payload esperado** (schema JSON ou colunas)
4. **Frequência ideal** e **tolerância de atraso**
5. **Idempotência** (chave natural usada para dedup)
6. **Transformações aplicadas** no ETL
7. **Tabelas-destino canônicas**

### Exemplo: Workshop Adapter

```yaml
adapter: workshop
auth:
  tipo: oauth2_client_credentials  # via Keycloak
  client_id: pioneira-insights-be-v2
  audience: workshop-be
endpoints:
  - GET /api/custos/mensal?ano=YYYY&mes=MM
    response_schema:
      ano: int
      mes: int
      categoria: string  # folha_pgto, pecas, comblub, pneus, materiais, total
      valor_cents: int
      garagem: string
  - GET /api/frota/ativos
    response_schema:
      prefixo: string
      placa: string
      modelo: string
      ano: int
      garagem: string
      status: string
      valor_aquisicao_cents: int  # se disponível, para depreciação
      data_aquisicao: date
idempotencia:
  custos: (ano, mes, categoria, garagem)
  frota: (prefixo)
etl:
  stage_table: integration.workshop_custos_stage
  destino:
    - finance.contas_pagar  # categoria='custo_operacional', detalhamento por categoria
    - finance.ativos_imobilizados  # quando frota traz valor de aquisição
frequencia:
  cron: "0 2 * * *"          # 02:00 todo dia
  janela: ultimos_60_dias    # re-sincroniza para pegar correções
```

### Exemplo: GDF Repasses Adapter

```yaml
adapter: gdf_repasses
auth:
  tipo: csv_upload   # até a SECID-DF publicar API
  fallback: api_gdf  # quando disponível, switch transparente
endpoints:
  - POST /api/v1/integration/gdf_repasses/upload (multipart CSV)
    csv_columns:
      ano_referencia (int, obrig.)
      mes_referencia (int, obrig.)
      data_repasse (date, opc.)
      numero_oficio (string, opc., default 'PRINCIPAL')
      valor_bruto_cents (int, obrig.)
      glosa_cents (int, opc., default 0)
      valor_liquido_cents (int, opc., calculado se ausente)
      motivo_glosa (string, opc.)
      observacao (string, opc.)
idempotencia: (ano_referencia, mes_referencia, numero_oficio)
etl:
  stage_table: integration.gdf_repasses_stage
  destino:
    - finance.contas_receber  (cliente_tipo='gdf_subsidio')
    - finance.recebimentos    (quando data_repasse preenchida)
auditoria:
  usuario_upload: required  # quem subiu fica registrado
```

### Exemplo: ANP Diesel Adapter

```yaml
adapter: anp
auth:
  tipo: scraping_publico
endpoints:
  - GET https://www.gov.br/anp/.../sintese-precos-EDICAO.pdf (semanal)
parser:
  extrai:
    - preco_revenda_brasil_brl_l
    - preco_revenda_df_brl_l
    - semana_referencia
etl:
  stage_table: integration.anp_precos_stage
  destino:
    - finance.parametros_externos (chave='diesel_brl_l', vigencia_inicio=semana_inicio)
politica_publicacao:
  - NÃO atualiza automaticamente o parâmetro vigente
  - apenas registra o preço observado
  - usuário com role 'financeiro.parametros.alterar' confirma a atualização
  - motivo: o preço Pioneira ≠ ANP (ICMS reduzido 80%)
```

## Vault de credenciais

Nada de API key em `.env` em produção. Stack mínima:

- **HashiCorp Vault** rodando em container (ou KMS do cloud se for pra nuvem)
- Backend pede secrets ao Vault no boot e mantém em memória
- Rotação periódica (90 dias) com alerta

Em desenvolvimento, `.env` aceita keys diretas para não criar fricção.

## Observabilidade dos jobs

Cada execução de adapter gera linha em `integration.sync_jobs`. Frontend tem painel `/admin/integrações`:

| Sistema | Último sync | Status | Registros | Próximo | Erros recentes |
|---|---|---|---|---|---|
| Workshop | 2 min atrás | ✅ ok | 4 | 22:00 | — |
| Globus | 18h atrás | ⚠️ atrasado | — | 04:00 | timeout |
| Transdata | 12 min | ✅ ok | 180 | top da hora | — |
| SGD | erro | ❌ | — | retry 5 min | 401 unauthorized |

Alertas:

- Sync falha 3x consecutivas → notifica admin TI
- Diferença grande entre o que veio do stage e o anterior → alerta para fraud/bug

## Como adicionar uma nova fonte

1. Criar classe `XAdapter(FonteSistemaAdapter)` em `backend/app/integrations/`
2. Definir schema raw em `integration.x_stage`
3. Criar transformer em `backend/app/etl/x_etl.py`
4. Mapear cron em `backend/app/jobs/scheduler.py`
5. Cadastrar em `integration.sistemas_fonte` (seed migration)
6. Adicionar ao painel `/admin/integrações`
7. Documentar contrato em `docs/REBUILD/04_IDENTIDADE_INTEGRACOES.md` (esta seção)

## Idempotência: a regra de ouro

Toda escrita derivada de sync é **idempotente por chave natural**:

```sql
-- Padrão upsert (PostgreSQL)
INSERT INTO finance.contas_receber (...) VALUES (...)
ON CONFLICT (cliente_tipo, competencia, numero_documento)
DO UPDATE SET valor_bruto_cents = EXCLUDED.valor_bruto_cents,
              updated_at = NOW(),
              version = finance.contas_receber.version + 1
WHERE finance.contas_receber.valor_bruto_cents <> EXCLUDED.valor_bruto_cents;
```

> Resultado: rodar o sync 10x não cria 10 linhas duplicadas. E o `version` permite detectar concorrência (alguém editou manualmente entre dois syncs).
