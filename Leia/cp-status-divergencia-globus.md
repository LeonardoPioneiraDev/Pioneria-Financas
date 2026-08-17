# CP — status divergente do Globus: investigação e correção

> Investigação de **23/07/2026**, disparada por relato do financeiro: *"contas aparecem como canceladas ou devolvidas no ERP, mas o sistema mostra como pago"*.
>
> Caso trazido: Recibo **3577871791**, R$ 840,00 (`CODDOCTOCPG` 1000593), borderô BO-011009.

## Resumo

| | |
|---|---|
| **Causa raiz** | O status era derivado de `QUITADO`/`data_pagamento`, ignorando o `STATUSDOCTOCPG` — a máquina de estados do próprio ERP |
| **Divergências reais** | 9 títulos · R$ 943.724,24 |
| **Percepção sem divergência** | 721 títulos com pagamento cancelado e refeito, que a tela escondia |
| **Correção** | `mapStatus` passa a seguir o `STATUSDOCTOCPG`; nova coluna `status_docto_globus`; trilha real de eventos exposta na tela |

---

## 1. O que estava errado no código

```ts
// ANTES — apps/FinancasBackend/src/etl/contas-pagar.etl.ts
function mapStatus(statusDocto, quitado, dataPagamentoIso) {
  const q = quitado?.toUpperCase() === 'S';
  if (q || dataPagamentoIso) return 'pago';    // ← decide antes de olhar o ERP
  if (statusDocto === 'C') return 'cancelado'; // ← inalcançável se houver pagamento
  ...
}
```

O `STATUSDOCTOCPG` só era consultado **depois** de `QUITADO` e da data. Como o Globus deixa esses dois campos sujos em algumas transições, o status divergia.

---

## 2. Hipóteses testadas

Quatro hipóteses foram levantadas; **duas foram descartadas por evidência**. Registro as descartadas de propósito — elas parecem plausíveis e voltarão a ser levantadas.

### ❌ H1 — `QUITADO='N'` indica devolução bancária

**Descartada.** A distribuição mensal (Q6) mostra `QUITADO='N'` entre **32% e 41% em todos os 19 meses** analisados:

```
2025-01  40,7%   2025-07  38,0%   2026-01  37,4%   2026-07  37,8%
2025-02  40,6%   2025-08  37,6%   2026-02  37,5%
...estável em toda a série...
```

Taxa de devolução de 40% ao mês seria catástrofe visível. O campo varia por modalidade (65% em branco quando não há modalidade; 21–28% em TDC/CC/TT): **é campo que a operação não preenche de forma consistente**.

> **Não usar `QUITADODOCTOCPG` como sinal de compensação bancária.** Ele é exibido na tela como informação, com essa ressalva escrita.

### ❌ H2 — Movimento bancário cancelado (`BCOMOVTO.STATUSMOVTOBCO='C'`)

**Descartada.** A consulta de títulos pagos cujo movimento bancário está cancelado voltou **vazia**.

A hipótese era boa: nosso sync do extrato filtra `STATUSMOVTOBCO <> 'C'`, então um movimento cancelado sumiria do nosso banco enquanto o título continuaria pago. Simplesmente não ocorre nos dados.

### ✅ H3 — `QUITADO='S'` residual após cancelamento de pagamento

**Confirmada — 3 títulos.** Quando o operador faz "Cancelamento de pagamento", o Globus devolve o título para `STATUSDOCTOCPG='N'` e limpa a data, mas **deixa `QUITADODOCTOCPG='S'`**. O `mapStatus` confiava no `QUITADO` e mostrava PAGO.

| Cód | Favorecido | Nós | Globus | Valor |
|---|---|---|---|---|
| 995760 | PETROARLA | pago | N | R$ 8.000,00 |
| 981000 | (reclamação trabalhista) | pago | N | R$ 5.165,60 |
| 997039 | MY SOLUÇÕES GRÁFICAS | pago | N | R$ 2.560,00 |

### ✅ H4 — Título baixado sem data de pagamento

**Confirmada — 6 títulos, o inverso.** `STATUSDOCTOCPG='B'` (baixado/pago) sem `PAGAMENTOCPG`: o `mapStatus` caía no default e marcava **pendente** algo que o ERP tem como pago.

Todos da **RAIZEM S.A**, R$ 927.998,64 no total (3× R$ 179.612,64 + 3× R$ 129.720,24).

---

## 3. A causa da *percepção* — cancela-e-refaz

O título reclamado **não** estava divergente. A trilha do Globus mostra:

| Seq | Hora | Ato | Status |
|---|---|---|---|
| 1 | 21/07 10:29 | Documento criado (HAROLDO) | N |
| 2 | 22/07 15:49 | Liberou pagamento (LUZIA) | N |
| 3 | 22/07 **15:55:15** | Pagamento de documento (LUZIA) | B |
| 4 | 22/07 **16:15:16** | **Cancelamento de pagamento** (LUZIA) | N |
| 5 | 22/07 **16:16:17** | Pagamento de documento (LUZIA) | B |

Pagou, cancelou 20 minutos depois, refez 1 minuto adiante. **Estado final: pago.** Os 6 títulos do borderô têm o mesmo padrão, no mesmo segundo.

Nossa tela mostrava um fluxo *inferido* em 4 etapas com só o pagamento final. Quem abria o histórico no ERP via "Cancelamento de pagamento" e concluía que estava cancelado.

**Escala:** 1.531 títulos têm evento de cancelamento. Desfecho:

| Estado final | Qtde | Leitura |
|---|---|---|
| C — cancelamento de documento | 772 | cancelados de verdade |
| B — pagamento de documento | 721 | **cancela-e-refaz** (o caso acima) |
| B — adiantamento associado | 18 | |
| N — cancelamento de pagamento | 18 | pagamento desfeito, título em aberto |

---

## 4. O que foi corrigido

### 4.1 `mapStatus` segue o ERP

```ts
// DEPOIS — STATUSDOCTOCPG é a fonte
if (s === 'C') return 'cancelado';
if (s === 'B') return 'pago';       // baixado = pago, com ou sem QUITADO
if (s === 'F') return 'aprovado';
if (s === 'A' || s === 'N') return 'pendente';
```

`QUITADO` e `data_pagamento` viram informação corroborante, não decisão.

### 4.2 Coluna `status_docto_globus` (migration 61000)

Guarda o `STATUSDOCTOCPG` cru. Sem ela, a divergência só era detectável indo ao Oracle. Migration faz backfill do stage e realinha os `status` existentes.

### 4.3 Sinal de "pago, cancelado e pago de novo" — na LISTA

**Não há dupla contagem.** Medido: 512 títulos com pagamento refeito → **512 linhas** em `contas_pagar`, um movimento bancário cada. O borderô BO-011009 soma R$ 2.660 em 6 títulos e tem **um** débito de R$ 2.660 no extrato. O `Foi pago` agrega por título, não por evento.

Ainda assim o caso precisa ficar **visível toda vez que ocorrer** — quem confere no ERP vê o cancelamento e desconfia do número. Denormalizado em duas colunas (migration 62000, recontadas pelo ETL de eventos):

- `vezes_pago_globus` — quantos "Pagamento de documento" o Globus registrou
- `teve_cancelamento_pagamento`

Onde aparece:

| Lugar | O quê |
|---|---|
| Linha da lista | Selo âmbar `↻ Pago 2× · cancelado e refeito`, com explicação de que conta **uma vez** |
| Linha da lista | Selo claro `↩ Pagamento cancelado` quando houve cancelamento sem repagamento |
| Bloco de totais | `↻ N com pagamento cancelado e refeito — contam uma vez nos totais` |
| Detalhe | Trilha completa (abaixo) |

> Diferente de **substituído** e **devolvido**, que saem dos totais, o **refeito CONTA** — é o mesmo título pago uma vez. O aviso existe para o número não parecer errado, não para excluí-lo.

**Distribuição atual:** 359 títulos pagos 2×, 87 pagos 3×, 10 pagos 4×, 3 pagos 5×, **1 pago 7×** (documento 3040245951, R$ 405,25).

### 4.4 Cancelado somava nos totais (achado de 23/07, tarde)

Relato: *"o 1814 foi cancelado e o 1841 foi pago"*, com a planilha do borderô do dia (pivot por Despesa) totalizando **R$ 691.903,81**.

Os dois documentos são a **mesma obrigação reemitida**:

| Doc | Cód | Fornecedor | Emissão | Vencimento | Valor | Status |
|---|---|---|---|---|---|---|
| 1814 | 1000226 | EP NOVO GAMA | 15/07 | 23/07 | R$ 840,00 | **cancelado** (C) |
| 1841 | 1000292 | EP NOVO GAMA | 15/07 | 23/07 | R$ 840,00 | **pago** (B) |

Mesma observação nos dois: *"MATERIAIS UTILIZADOS NA OBRA DO GAMA"*.

**O Globus NÃO liga os dois** — `CODDOCTOCPGSUBST` vazio, `substituido = false` em ambos. É um terceiro padrão, além de "substituído" e "cancela-e-refaz o pagamento": **cancelar e reemitir sob outro número**.

Como a exclusão das somas era só `cp.substituido = false`, o cancelado somava junto:

```
nosso "Valor das contas"   R$ 692.743,81
planilha do financeiro     R$ 691.903,81
diferença                  R$     840,00   ← exatamente o título cancelado
```

**Correção:** cancelados saem de todas as somas de valor (continuam na lista com selo, e no contador `canceladosQuantidade` + `canceladosCents` do bloco de totais).

Depois: `Valor das contas` de 23/07 = **R$ 691.903,81**, diferença zero contra a planilha.

> A prova veio da planilha do usuário. Sem o número externo para conferir, a inflação passava — cada linha estava certa individualmente.

### 4.5 Trilha real na tela

Endpoint `GET /api/contas-pagar/:id/eventos` + componente `TrilhaGlobus`:

- **todos** os atos de `CPGDOCTO_HISTORICO_NEGOCIACOES`, com usuário e hora
- confronto explícito: *status neste sistema × status no Globus*, com selo "conferem"
- alerta vermelho quando divergem
- alerta âmbar quando houve cancelamento ou repagamento (*"pagamento refeito 2× no Globus"*)
- o `QUITADO` aparece com a ressalva de que não indica compensação

O fluxo inferido continua abaixo, renomeado para **"visão resumida"**, apontando para a trilha real.

> **Cuidado na classificação dos eventos:** `Adiantamento associado.` e `Alterou : valor de adiantamento` também terminam em status `B`. Classificar por status inflava o contador de pagamentos (3× onde houve 1). A classificação é pelo **texto** do ato.

---

## 5. Resultado

Antes / depois, no banco:

```
ANTES                          DEPOIS
pago       11491               pago       11494  (B)
pendente    1020               pendente    1017  (N)
cancelado    414               cancelado    414  (C)
```

**Zero divergências** entre `status` e `status_docto_globus`.

---

## 6. Consultas

`sql-exploracao/2026-07-23-cp-pago-vs-cancelado-devolvido.sql` — 10 consultas comentadas para rodar no Globus (somente leitura). Guardadas porque a investigação vai se repetir: mapa status×quitado×pagamento, cancelados com pagamento, baixa não compensada por idade, proporção mensal de `QUITADO='N'`, confronto com o extrato.

> Nomes de coluna que geram erro com frequência: `BCOMOVTO.VLMOVTOBCO` (não `VLR...`) e `BCOMOVTO.DTMOVTOBCO` (não `DATA...`).

---

## 6.5 Como evitar que a classe de erro volte

O conserto pontual não impede o próximo. Três camadas foram criadas.

### Camada 1 — regra única de soma

A regra de "quem entra nos totais" estava **copiada em 6 lugares** (listagem, sumário, análise de prazo, reembolsos). Cada incidente corrigia um e os outros seguiam inflando — foi assim que o cancelado passou depois de o substituído já ter sido tratado.

Agora existe `src/shared/contas-pagar/regras-soma.ts`, com o predicado **e o porquê de cada exclusão**. Todos os pontos importam de lá.

> Ao descobrir um novo padrão de duplicidade, altere **só ali** — e acrescente o caso no teste.

### Camada 2 — conferência automática contra o Globus

`GET /api/contas-pagar/conferencia?dtIni&dtFim` soma os dois lados de forma **independente** (nós no Postgres, o ERP no Oracle, agregando no banco) e compara por status. Aparece no topo da tela de Contas a Pagar: verde quando confere, vermelho com o valor da diferença quando não.

É a defesa contra a classe inteira: qualquer padrão futuro que ainda não conhecemos aparece como divergência, **sem depender de alguém trazer uma planilha**.

Dois cuidados aprendidos ao construí-la:

| Erro | Correção |
|---|---|
| Somar `VLR_ORIGINAL` no Globus | Usar `SUM(CPGITDOC.VALORITEMDOC)` — a **mesma** regra do ETL. `VLR_ORIGINAL` traz acréscimo embutido e, na 1ª parcela, o total do documento inteiro: dava falso alarme de R$ 3,5 milhões |
| Filtrar `excluido_em IS NULL` do nosso lado | Não filtrar — cancelados ficam soft-deleted aqui mas existem no ERP; os dois lados precisam do mesmo universo |

### Camada 3 — teste de regressão

`regras-soma.test.ts` trava as exclusões (8 testes). Se alguém remover a exclusão de cancelado num refactor, o teste quebra com o motivo escrito. Cada item nasceu de um erro real em produção.

---

## 6.6 O que a conferência já encontrou

Ativada, ela imediatamente apontou uma divergência que ninguém tinha notado:

```
23/07/2026   nosso R$ 691.903,81 (31 tít.)   Globus R$ 691.630,30 (30 tít.)
             diferença R$ 273,51 · 1 título a mais do nosso lado
```

O título é o **1000810** (doc 9988905556, R$ 273,51, vencimento 23/07). Sincronizar não resolve — o sync leu 44 registros e gravou 0.

**CONFIRMADO — e é falha estrutural do sincronismo.** A trilha do 1000810 mostra: a LUZIA prorrogou o vencimento de 23/07 para **30/07** em 23/07 às 12:36. Como o sync busca pela **janela de vencimento**, o título saiu da janela de 23/07 e a nossa cópia **ficou congelada** na data antiga — inflando o período errado.

### O conserto: reconciliação por chave

O sync por janela nunca vê o que saiu dela. A defesa é reconsultar por CHAVE o que já temos aberto:

- `adapter.reconciliarPorCodigos(codigos)` — reconsulta títulos por `CODDOCTOCPG IN (…)` em lotes de 500, em vez de por data. A chave não some; a janela sim.
- `service.reconciliarAbertos()` — pega todos os títulos **pendente/aprovado** locais, reconsulta por chave, reprocessa o que mudou, e marca cancelado o que **sumiu** do Globus (título aberto que não volta na reconsulta foi apagado no ERP).
- `POST /api/contas-pagar/reconciliar` (admin) + botão **"Reconciliar abertos"** na tela.
- Registrado no **agendador** (`contas-pagar-reconciliacao`) — roda sozinho, não precisa de período.

Testado: o 1000810 passou de venc 23/07 → 30/07, e a conferência de 23/07 fechou em **R$ 0,00**.

### A prorrogação fica VISÍVEL

Atualizar a data em silêncio confunde tanto quanto não atualizar. O ETL agora, ao detectar que o vencimento mudou, guarda a data anterior (`vencimento_anterior` + `teve_prorrogacao`, migration 63000) — lendo o valor atual antes de sobrescrever. A tela mostra:

- **Lista:** selo violeta `↪ vencia 23/07 · prorrogado` ao lado do vencimento novo
- **Detalhe:** linha do Vencimento ganha `↪ prorrogado — vencia 23/07`, com a data da alteração no tooltip

Backfill da flag pelos eventos (679 títulos com "Prorrogação do vencimento" na trilha); o de/para retroativo não existe, mas passa a ser capturado a cada nova prorrogação.

> **Contador honesto:** `atualizados` vem do ETL (títulos que mudaram em `finance`), não do adapter — o upsert do stage distingue novo/existente, não mudou/igual (todo UPDATE conta como "inalterado" porque o `RETURNING` lê o hash pós-update). Bug herdado; contornado reportando o número do ETL.

Consultas em `sql-exploracao/2026-07-23-titulo-1000810-divergente.sql`.

---

## 7. Em aberto

- **Os 18 títulos** cujo último ato foi "Cancelamento de pagamento" com status final N: hoje ficam corretamente como pendente. Vale confirmar com o financeiro se são retomadas de pagamento ou desistências.
- **`QUITADO`** continua sem significado operacional definido. Se a empresa quiser usá-lo como controle de compensação, precisa mudar o processo — hoje 38% ficam em branco.
- **Movimentos bancários cancelados** não entram no nosso extrato (`STATUSMOVTOBCO <> 'C'`). Não causa problema hoje (H2 descartada), mas é ponto cego se o comportamento mudar.
