# Recebíveis GDF — Módulo

> Status: **em produção** (entregue 2026-05). 3 de 6 funcionalidades prontas. Falta drill-down banco, ajuste manual e cenários de glosa.

## Domínio

A Viação Pioneira opera linhas do **Sistema de Transporte Público Coletivo do DF** (STPC). Cada vez que um passageiro entra no ônibus usando cartão BRB Mobilidade, o sistema da BRB:

1. **Registra a passagem** (data de transporte + valor da tarifa SEMOB + tipo de passageiro)
2. **Resgata** (consolida e processa) o valor alguns dias depois
3. **Transfere via TED** o dinheiro pra conta da Pioneira no Banco de Brasília

O módulo de Recebíveis GDF acompanha essas 3 etapas e cruza com o **extrato bancário** (BCOMOVTO Globus) pra confirmar que tudo bateu.

### Conceitos-chave

| Termo | Significado |
|---|---|
| **Data de transporte** | Dia em que o passageiro pegou o ônibus |
| **Data de resgate** | Dia em que a BRB consolidou o valor pra repasse |
| **Repasse** | Transferência efetiva pra conta bancária (TED) |
| **Família** | Categoria do passageiro (CIDADAO, VT, EMV, QRCODE, idoso, estudante, etc.) |
| **Pagante** | Família onde o passageiro paga tarifa |
| **Gratuidade** | Família onde governo paga (subsídio) — passageiro embarca grátis |
| **Glosa** | Diferença entre o que a BRB diz que vai pagar e o que cai no banco |
| **Receita técnica** | Pax × Tarifa SEMOB (cálculo) — **não é** o que entra no caixa |
| **Receita real** | Repasse efetivo do GDF no banco — **é** o que entra no caixa |

> ⚠️ Princípio herdado do v1: **receita técnica NUNCA é apresentada como receita real**. Toda apresentação separa as duas.

## Fluxo end-to-end

```
┌─────────────────┐   1. transporta
│  Ônibus Pioneira├──────────────┐
└─────────────────┘              ▼
                        ┌──────────────────┐
                        │ Validador SEMOB  │
                        │ (cartão BRB Mob.)│
                        └────────┬─────────┘
                                 │ valida + tarifa
                                 ▼
                        ┌──────────────────┐
                        │ Sistema BRB Mob. │
                        │ (gera relatório) │
                        └────┬─────────────┘
                             │ relatório diário/cumulativo
                             ▼
              ┌──────────────────────────────────┐
              │ horarios.vpioneira.com.br        │ ← API externa Pioneira
              │ (espelho dos relatórios da BRB)  │
              └────┬─────────────────────────────┘
                   │ GET /api/recebiveis (X-API-Key)
                   ▼
              ┌──────────────────────────────────┐
              │ integration.horarios_relatorio_stage│ ← raw JSON
              └────┬─────────────────────────────┘
                   │ ETL classifica família
                   ▼
              ┌──────────────────────────────────┐
              │ finance.recebivel_gdf_celula     │ ← canônico (1 célula/dia/família/data_resgate)
              └────┬─────────────────────────────┘
                   │ JOIN por data
                   ▼                  ┌───────────────────────┐
              ┌─────────┐             │ finance.banco_movto   │ ← extrato Globus BCOMOVTO
              │  GLOSA  │ ←──────────┤ eh_repasse_brb = true │   (CODHISTOBCO=908)
              └─────────┘             └───────────────────────┘
```

## Modelo de dados

### `finance.recebivel_familia` (mestre)

Catálogo das categorias de passageiros. Seed inicial (16 famílias):

**Pagantes (6):** CIDADAO, VT, EMV, QRCODE, PAGANTE, DIALIVRE
**Gratuidades (10):** PLE (idoso ≥60), SENIOR (idoso ≥65), ESP (especial), ESPA (acompanhante), PNE (deficiente), PNEA, CRIANCA, FUNCIONARIO, GRATUITO, PORELAS

Campos relevantes: `codigo`, `nome`, `tipo` (pagante/gratuidade), `fonte_subsidio` (quem paga: GDF, federal, cortesia), `ordem`.

### `integration.horarios_relatorio_stage` (raw)

Snapshot dos relatórios da API horários. Idempotência via `hash_payload` (SHA-256 do JSON canônico) — se rodar o sync duas vezes no mesmo relatório sem mudança, não duplica.

Campos: `id_externo`, `data_transporte`, `payload` (JSONB), `hash_payload`, `criado_em`, `processado_em`, `excluido_em`, `excluido_motivo`.

### `finance.recebivel_gdf_relatorio`

Dimensão "1 relatório por dia de transporte" com totais agregados (não é a granularidade mais fina).

### `finance.recebivel_gdf_celula`

**Granularidade:** 1 linha por **(data_transporte × data_resgate × família)**.

Essa é a tabela mais importante. Cruzando ela consigo gerar:
- **Mapa diário** (matriz transporte × resgate) — agregando célula
- **Composição por família** (drill-down de 1 dia) — filtrando célula
- **Aging** (buckets por velocidade de resgate) — calculando `data_resgate - data_transporte`
- **Glosa** (esperado × recebido) — somando por `data_resgate`

> Importante: cada relatório BRB tem 1 célula por "Data do Movimento DD/MM/YYYY". A linha "Resgate de" do BRB é apenas soma redundante — **ignoramos** (já está nas células).

### `finance.banco_movto`

Extrato bancário consolidado (vem do BCOMOVTO Globus). Coluna calculada `eh_repasse_brb` aplica a heurística:

```typescript
function ehRepasseBrb(raw): boolean {
  return raw.COD_HISTO_BCO === 908
      && raw.COD_BANCO     === 70   // BRB
      && raw.COD_AGENCIA   === 51
      && String(raw.COD_CONTA_BCO).trim() === '108';
}
```

> ⚠️ Conta `70-51-108` é **dedicada** a repasses BRB. A heurística simples (4 igualdades) é suficiente — não precisa filtrar `AD Nr AD-` no histórico.

## Integração com `horarios.vpioneira.com.br`

API externa hospedada pela Pioneira. Espelha os relatórios da BRB Mobilidade.

- **Autenticação:** header `X-API-Key: tp_prefix.secret` (formato Stripe, ver [[padrao-api-keys]])
- **Lista:** `GET /api/recebiveis` → array de relatórios disponíveis
- **Detalhe:** `GET /api/recebiveis/:id` → JSON estruturado (transportes, resgates, famílias)

Cliente em `apps/FinancasBackend/src/plugins/horarios-client.ts`:
- Native `fetch` + `AbortController`
- Retry exponencial (3 tentativas, 2s base)
- Tolerância a falha: `isAvailable() = false` quando não configurado (decoração no Fastify)
- Telemetria via `oracle_query_logs` (query_name = `horarios:<path>`) — mesmo schema, fonte de verdade única pra todas as integrações externas

## ETL — Classificação por família

A API horários retorna `tipoPagamento` em texto livre (ex.: "Cidadão (cartão)", "VT comum 2026", "PLE - idoso"). O ETL aplica **regex em ordem** pra classificar:

```typescript
const REGRAS: Array<[RegExp, string]> = [
  [/cidad[ãa]o|cidadao/i,                'CIDADAO'],
  [/^vt\b|vale[\s-]?transp/i,            'VT'],
  [/emv|cart[aã]o.*bandeira/i,           'EMV'],
  [/qr.?code/i,                          'QRCODE'],
  [/dia[\s-]?livre/i,                    'DIALIVRE'],
  [/^pagante/i,                          'PAGANTE'],
  [/^ple\b|idoso.*60/i,                  'PLE'],
  [/senior|idoso.*65/i,                  'SENIOR'],
  // ...
];
```

A primeira regex que casa **vence**. O `tipoPagamento` original é mantido em `recebivel_gdf_celula.tipo_pagamento_original` pra auditoria.

## Glosa — heurística e limitações

### O que é

Cruzamento entre **esperado** (soma de `recebivel_gdf_celula.valor_cents` por `data_resgate`) e **recebido** (soma de `banco_movto.valor_cents` por `data_movto` onde `eh_repasse_brb=true`).

Quando difere, registra como glosa.

### Status por dia

| Status | Critério |
|---|---|
| `ok` | \|glosa%\| ≤ 2% |
| `divergencia_leve` | 2% < \|glosa%\| ≤ 10% |
| `divergencia_alta` | \|glosa%\| > 10% |
| `sem_recebimento` | esperado > 0 e recebido = 0 |
| `sem_esperado` | esperado = 0 e recebido > 0 |

### Limitação importante: delay BRB→banco

A BRB tem **1-2 dias úteis** entre o resgate e o crédito em conta. Em janelas curtas (< 30 dias), o cálculo dia-a-dia **não bate** porque:
- O banco recebe em 02/05 valores de resgate de 30/04 (anterior ao filtro)
- O banco ainda não recebeu em 20/05 os valores de resgate de 19/05 (que cairão em 21+/05)

**Por isso o backend e a UI detectam "janela curta"** e:
- Resumo muda pra mensagem neutra ("janela curta — use 30+ dias")
- Borda do card de Glosa fica **azul** (informativo), não vermelho (alerta)
- Tag visível "janela curta · delay provável"

Janelas ≥ 30 dias compensam o delay e a glosa fica confiável.

## UI — Estrutura em 4 abas

Arquivo: `apps/FinancasFrontend/src/app/(private)/recebiveis-gdf/page.tsx`

```
┌─────────────────────────────────────────────────────┐
│ Recebíveis GDF                       [Sincronizar]  │
│ "Acompanhe o que a Pioneira deve receber..."         │
├─────────────────────────────────────────────────────┤
│ 💡 Como funciona o pagamento da BRB:                │
│    [glossário fixo em linguagem leiga]              │
├─────────────────────────────────────────────────────┤
│ [Filtros: período · métrica · família]              │
├─────────────────────────────────────────────────────┤
│ ▌Resumo │ Glosa │ Velocidade │ Mapa detalhado       │
├─────────────────────────────────────────────────────┤
│ Conteúdo da aba selecionada                         │
└─────────────────────────────────────────────────────┘
```

**Aba Resumo** — 4 KPIs (Total resgatado, Total créditos, Tempo médio, Cobertura) + card de status semaforizado (ok/atenção/alerta).

**Aba Glosa** — `GlosaCard` (3 KPIs: esperado BRB, recebido banco, status dias) + tabela dia-a-dia colapsável.

**Aba Velocidade** — Aging em 4 buckets (0-2d / 3-5d / 6-10d / 10+d) com cor e "como interpretar".

**Aba Mapa detalhado** — Matriz `data_transporte × data_resgate`. Clique numa linha abre `ComposicaoFamiliaDialog` com drill-down por família.

### Termos técnicos com tooltip

Componente `TermoTecnico` (em `components/shared/TermoTecnico.tsx`) renderiza qualquer termo financeiro com um ícone `(i)` ao lado. Hover/foco/clique mostra explicação em linguagem cotidiana.

Termos cobertos: data de transporte, métrica, família, total resgatado, total créditos, tempo médio, cobertura, glosa, aging.

## Sync — comando e fluxo

UI: botão "Sincronizar BRB" no header da página.
API: `POST /api/recebiveis-gdf/sincronizar` (preHandler exige role admin/cfo/controller/cr_analista).

Fluxo:
1. **Lado horarios:** lista relatórios da API → grava em `horarios_relatorio_stage` (dedup por hash) → ETL classifica famílias e popula `recebivel_gdf_celula`
2. **Lado banco:** lê BCOMOVTO do Globus (mês corrente, empresa=4, filiais Pioneira) → grava em `globus_bcomovto_stage` → ETL popula `banco_movto` com `eh_repasse_brb`

Os 2 lados são **independentes**. Se o lado horarios falhar (API fora), o lado banco ainda roda. Erros vão pra `integration.sync_errors` (DLQ).

## Endpoints

| Método | Rota | Resposta |
|---|---|---|
| `GET` | `/api/recebiveis-gdf/familias` | Lista de famílias do mestre |
| `GET` | `/api/recebiveis-gdf/mapa-diario?dtIni&dtFim&familia` | Matriz transp × resgate |
| `GET` | `/api/recebiveis-gdf/composicao-familia?dataTransporte` | Drill-down de 1 dia |
| `GET` | `/api/recebiveis-gdf/aging?dtIni&dtFim&familia` | Buckets 0-2d / 3-5d / 6-10d / 10+d |
| `GET` | `/api/recebiveis-gdf/glosa?dtIni&dtFim` | Cruzamento esperado × recebido |
| `POST` | `/api/recebiveis-gdf/sincronizar` | Dispara sync completo (BRB + banco) |

Schemas TypeBox em `packages/shared/src/schemas/recebiveis-gdf.ts`.

## O que ainda falta (roadmap deste módulo)

1. **Drill-down banco**: na aba Glosa, ao clicar numa célula divergente, abrir modal com os lançamentos individuais do BCOMOVTO daquele dia + comparação com células esperadas.
2. **Ajuste manual de glosa**: permitir que o financeiro marque um dia como "glosa conhecida" (com motivo + valor) pra sair dos alertas.
3. **Cenários históricos**: linha do tempo de 12 meses mostrando evolução da glosa total (% e R$) — pra detectar tendência (BRB pagando pior?).

Estimativa para fechar os 3: ~2 semanas.

## Decisões registradas

- **Receita técnica nunca interpolada como real.** Coluna `valor_cents` em `recebivel_gdf_celula` é o valor que **a BRB diz que vai pagar**, não o que entrou no banco. O cruzamento com `banco_movto` é explícito (aba Glosa).
- **Heurística banco simples sobre filtragem complexa.** O filtro `CODHISTOBCO=908 + 70/51/108` foi validado contra ~21 lançamentos = R$ 11.94M, batendo com o esperado BRB. Não vale a pena complicar com `AD Nr AD-` no histórico.
- **1 célula = 1 (transp, resgate, família).** A linha "Resgate de" do BRB é redundante (soma das demais) e foi descartada no ETL.
- **Famílias via regex.** Aceita os textos livres da BRB e mantém o original em `tipo_pagamento_original` pra auditoria. Quando aparecer novo `tipoPagamento` não classificado, cai como `GRATUITO` e gera warning no log.
