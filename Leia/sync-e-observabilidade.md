# Sync e Observabilidade

> Como o sistema sincroniza dados de fontes externas (Globus Oracle, API horários, etc.) e como diagnosticar quando algo dá errado.

## As 3 tabelas do plumbing

Todo sync e integração externa passa por 3 tabelas no schema `integration`:

| Tabela | Função |
|---|---|
| `integration.sync_jobs` | Histórico de execuções (1 linha por sync — quem disparou, quando, status, totais) |
| `integration.oracle_query_logs` | Telemetria por query (1 linha por consulta SQL ou HTTP externa, com tempo e tamanho) |
| `integration.sync_errors` | DLQ: erros idempotentes pra investigação posterior |

Essas 3 são **compartilhadas** entre todas as integrações — Globus, horários BRB, eSocial (futuro), etc. **Não criar tabela de log por módulo.**

## `sync_jobs` — 1 linha por execução

Campos principais: `id`, `sistema` (globus, horarios, ...), `recurso` (contas_pagar, contas_receber, recebiveis_gdf, ...), `iniciado_em`, `terminado_em`, `status` (ok / parcial / erro), `disparado_por_usuario_id`, `totais` (JSONB com contadores específicos do recurso), `mensagem`.

Exemplo de query:
```sql
-- últimos 10 syncs de recebíveis GDF
SELECT iniciado_em, status, totais, mensagem
FROM   integration.sync_jobs
WHERE  sistema='horarios' AND recurso='recebiveis_gdf'
ORDER BY iniciado_em DESC
LIMIT 10;
```

## `oracle_query_logs` — telemetria por consulta

Apesar do nome (`oracle_*`), serve pra **qualquer** consulta externa: Globus Oracle E também API horários (registros com `query_name = 'horarios:/api/recebiveis'`).

Campos: `id`, `query_name`, `sync_job_id`, `iniciado_em`, `duracao_ms`, `linhas` (qtd retornada), `status` (ok / erro), `erro_mensagem`, `bind_vars` (JSONB com parâmetros mascarados).

Usado por:
- `apps/FinancasBackend/src/plugins/oracle.ts` → grava em todo `execute()` via `gravarLog()`
- `apps/FinancasBackend/src/plugins/horarios-client.ts` → grava em toda chamada HTTP

Como debugar uma consulta lenta:
```sql
SELECT query_name, duracao_ms, linhas, iniciado_em
FROM   integration.oracle_query_logs
WHERE  iniciado_em > NOW() - INTERVAL '1 day'
  AND  duracao_ms > 5000
ORDER BY duracao_ms DESC;
```

## `sync_errors` — DLQ idempotente

Quando uma sync falha em **um item específico** (ex.: 1 relatório BRB com payload corrompido entre 50 que sincronizaram OK), o item vai pra `sync_errors` ao invés de quebrar a sync inteira.

Implementação em `apps/FinancasBackend/src/shared/integration/dlq.ts`:

### `registrarErroSync(args)` — idempotente por chave

```typescript
await registrarErroSync({
  sistema: 'horarios',
  recurso: 'recebiveis_gdf',
  chaveExterna: 'relatorio-12345',  // ID único no sistema fonte
  erro: error,
  contexto: { dataTransporte: '2026-05-04', urlChamada: '...' },
});
```

Se o mesmo `(sistema, recurso, chaveExterna)` já tem registro pendente:
- **Não cria duplicata**
- Incrementa `tentativas`
- Atualiza `ultima_tentativa_em` e `erro_mensagem`

Stack truncada a 200 linhas máx pra não estourar espaço.

### `resolverErrosSyncAutomatico(args)` — auto-resolução

Quando uma sync completa sucesso, marca como `resolvido` qualquer erro pendente da mesma `(sistema, recurso, chaveExterna)`. Não precisa intervenção manual.

```typescript
// no fim de uma sync bem-sucedida
await resolverErrosSyncAutomatico({
  sistema: 'horarios',
  recurso: 'recebiveis_gdf',
  chavesProcessadas: ['relatorio-12345', 'relatorio-12346', ...],
});
```

## Como investigar uma sync que deu errado

### Passo 1: olhar o último job

```sql
SELECT *
FROM   integration.sync_jobs
WHERE  sistema='globus' AND recurso='contas_pagar'
ORDER BY iniciado_em DESC LIMIT 1;
```

- `status='ok'` → sync inteira deu certo, problema é outro (provavelmente UI ou cache)
- `status='parcial'` → algumas linhas deram erro, ver `sync_errors`
- `status='erro'` → sync inteira quebrou, ver `mensagem` + `oracle_query_logs`

### Passo 2: ver as queries do job

```sql
SELECT query_name, duracao_ms, linhas, status, erro_mensagem
FROM   integration.oracle_query_logs
WHERE  sync_job_id = 'uuid-do-job'
ORDER BY iniciado_em;
```

### Passo 3: ver erros DLQ

```sql
SELECT chave_externa, erro_mensagem, contexto, tentativas, ultima_tentativa_em
FROM   integration.sync_errors
WHERE  sistema='horarios' AND recurso='recebiveis_gdf'
  AND  resolvido_em IS NULL
ORDER BY ultima_tentativa_em DESC;
```

### Padrões de erro comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| `Cliente horarios indisponivel` | `HORARIOS_ENABLED=false` ou `HORARIOS_API_KEY` vazia no `.env` | Conferir vars de ambiente |
| `ORA-00942: table or view does not exist` | Tabela Globus sem GRANT pro `glbconsult` | Pedir GRANT ao DBA |
| `ECONNREFUSED 10.0.1.191:1521` | Banco Globus fora ou VPN desconectada | Conferir conexão |
| `ECONNRESET` no horários | Endpoint instável | Retry automático cobre; investigar se persistir |
| `sync_jobs.status='ok'` mas UI vazia | Cache do React Query | F5 ou invalidar `['recurso']` no front |

## Telemetria — métricas chave

### Saúde da sync por recurso

```sql
SELECT recurso,
       MAX(iniciado_em)                              AS ultima_execucao,
       COUNT(*) FILTER (WHERE status='ok')           AS qtd_ok_30d,
       COUNT(*) FILTER (WHERE status='parcial')      AS qtd_parcial_30d,
       COUNT(*) FILTER (WHERE status='erro')         AS qtd_erro_30d,
       AVG(EXTRACT(EPOCH FROM (terminado_em - iniciado_em))*1000)::int AS media_ms
FROM   integration.sync_jobs
WHERE  iniciado_em > NOW() - INTERVAL '30 days'
GROUP BY recurso
ORDER BY recurso;
```

### Queries mais lentas (top 20 últimos 7 dias)

```sql
SELECT query_name, COUNT(*) AS execucoes, AVG(duracao_ms)::int AS media,
       MAX(duracao_ms) AS pior, SUM(linhas) AS total_linhas
FROM   integration.oracle_query_logs
WHERE  iniciado_em > NOW() - INTERVAL '7 days' AND status='ok'
GROUP BY query_name
ORDER BY media DESC
LIMIT 20;
```

### Backlog do DLQ (erros pendentes)

```sql
SELECT sistema, recurso, COUNT(*) AS pendentes
FROM   integration.sync_errors
WHERE  resolvido_em IS NULL
GROUP BY sistema, recurso
ORDER BY pendentes DESC;
```

## Padrões obrigatórios pra novas integrações

Toda nova integração com sistema externo (Globus, horários, eSocial, banco, ...) deve:

1. **Passar pelo plugin de cliente** (`oracle.ts`, `horarios-client.ts`) — não chamar API/SQL direto do service.
2. **Registrar `sync_jobs`** no início e fim. Status final reflete realidade.
3. **Gravar em `oracle_query_logs`** cada execução (já automático nos plugins).
4. **Usar `registrarErroSync`** para falhas de **item específico**, não pra crash global.
5. **Usar `resolverErrosSyncAutomatico`** no fim de sync OK pra limpar DLQ.
6. **Idempotência via hash** (`sha256Json` do utilitário) ou chave externa única, nunca por sequência incremental.
7. **Exclusão lógica:** se um item some da fonte, marcar `excluido_em` em vez de DELETE.
