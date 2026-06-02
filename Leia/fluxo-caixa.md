# Fluxo de Caixa — Módulo

> Status: **em produção** (entregue 2026-05-22). Escopo focado em **CR × CP**, sem saldo bancário.

## O que faz

Mostra, pra um horizonte de 7/30/60/90 dias:

- **Quanto vai entrar** (clientes pagando) — soma de CR vencendo, **ajustada pela inadimplência histórica** dos últimos 6 meses
- **Quanto vai sair** (fornecedores, folha, tributos) — soma de CP vencendo
- **Diferença prevista** dia-a-dia
- **Dias com gap** — quando a saída acumulada supera a entrada acumulada

## O que NÃO faz (decisão consciente)

- ❌ **Não mostra saldo bancário absoluto.** Decidido em 2026-05-22.
- ❌ Não conecta com API de banco (Open Finance / Belvo).
- ❌ Não exige cadastro manual de saldo.

### Por quê

A coluna `BCOCONTA.SALDO_ACM_ATE_DATA` do Globus está abandonada (zerada com sentinela `30/12/1899` em quase todas as contas). Sem isso, as opções seriam:

1. **Tesoureiro digitar saldo diariamente** — frágil e dependente de pessoa
2. **Calcular do zero somando todo BCOMOVTO histórico** — precisa de heurística D/C confiável (que não tínhamos)
3. **Conectar com API banco** — não está disponível agora

A decisão foi **focar no que JÁ funciona** (CR e CP sincronizados, validados, usados em produção) e entregar valor sem depender de coisa que não controlamos.

> O código de saldo bancário **não foi deletado**: está preservado em `finance.banco_conta`, `globus-bcoconta.adapter.ts`, `banco-conta.etl.ts` e no `saldoDiario()` do service. Quando aparecer API de banco / Open Finance, a feature religa.

## Fórmula

```
Entradas previstas(dia D) = Σ CR.valor_liquido com data_vencimento = D
                            × (1 - inadimplencia_historica)

Saídas previstas(dia D)   = Σ CP.valor com data_vencimento = D

Delta(D)                  = Entradas(D) - Saídas(D)

Delta acumulado(D)        = Delta acumulado(D-1) + Delta(D)
                            (parte de 0 — sem saldo banco)

Gap(D)                    = Delta acumulado(D) < 0
```

## Inadimplência histórica

Calculada automaticamente:

```sql
% inadimp = Σ valor CR (cancelado OU atrasado > 30d nos últimos 6 meses)
          / Σ valor CR total no mesmo período
```

Override possível via `?inadimplenciaPerc=X` no endpoint (pra cenários "what if").

## UI — 3 abas

Arquivo: `apps/FinancasFrontend/src/app/(private)/fluxo-caixa/page.tsx`

| Aba | Conteúdo |
|---|---|
| **Resumo** | 4 KPIs (A receber Nd, A pagar Nd, Diferença, Dias com gap) + status semaforizado + bloco da inadimplência |
| **Projeção** | Gráfico CSS-only de variação acumulada + tabela dia-a-dia (vermelho = gap) |
| **Cenários** | Placeholder pra sprint 04 (otim/real/pess) |

### Filtros
- Horizonte: 7d / 30d / 60d / 90d
- Sem filtro de família/conta — todas CR e CP da empresa

### Termos com tooltip (componente `TermoTecnico`)
"A receber Nd", "A pagar Nd", "Diferença prevista", "Dias com gap", "Inadimplência aplicada", "O que é a projeção", "Horizonte".

## Endpoints

| Método | Rota | Função |
|---|---|---|
| `GET` | `/api/fluxo-caixa/projecao?horizonteDias=N&inadimplenciaPerc=?` | Projeção com inadimplência (auto ou override) |
| `POST` | `/api/contas-receber/sync` + `/api/contas-pagar/sync` | Sincronização (botão chama ambos em paralelo) |

> **Não usar** `/api/fluxo-caixa/saldo-diario`, `/api/fluxo-caixa/contas`, `/api/fluxo-caixa/contas/:id/ancora-saldo` — endpoints existem mas estão fora do escopo atual. Ver `Leia/sprints/backlog.md`.

## Status semaforizado

| Condição | Status | Mensagem |
|---|---|---|
| `diasComGap > 0` | 🚨 alerta | "Em N dias o caixa fica negativo. Primeiro gap em DD/MM" |
| `diferenca > 0` | ✅ ok | "Cobertura positiva. Vai sobrar R$ X em N dias" |
| `diferenca < 0` | ⚠️ atenção | "Cobertura negativa. Vai faltar R$ X" |
| `diferenca ≈ 0` | ⚖️ neutro | "Equilibrado. Sem folga, mas sem gap" |

## Limitações conhecidas

1. **Sync de CR/CP é só do mês corrente.** Projeção 90d vai mostrar pouca coisa depois do mês 1 — porque os títulos com vencimento futuro distante ainda não foram sincronizados. Sprint futura: sync estendido.
2. **Inadimplência única.** 1 % aplicado a TODOS os clientes. Em fase 2, segmentar (por cliente, tipo de título, faixa de valor).
3. **Sem saldo absoluto.** Por design — ver "O que NÃO faz" acima.
4. **Não considera entradas/saídas extra-CR/CP.** Aporte de sócio, empréstimo, dividendo a pagar fora de CP — nada disso é capturado.

## Decisões registradas

- **Saldo bancário descartado** (2026-05-22) — preferimos entregar o que funciona em vez de exigir input manual ou depender de API externa indisponível.
- **3 abas, não 4** — "Por conta" saiu junto com saldo. Cenários fica pra sprint 04 (placeholder agora).
- **Sync único do botão** — chama CR + CP em paralelo, não BCOCONTA + BCOMOVTO.
- **Código de saldo não deletado** — fica no repo pra quando aparecer Open Finance.

## Próximos passos (backlog)

1. **Cenários otim/real/pess** — sprint 04 candidata
2. **Sync de CR/CP estendido** (≥ 90 dias) pra projeção 90d valer
3. **Análise vs orçamento** — depende do módulo Orçamento (Fase 4)
4. **Entradas/saídas extra-CR/CP manuais** — cadastrar previsão livre
5. **Integração saldo bancário** — quando aparecer Open Finance / API banco (código já preparado)
