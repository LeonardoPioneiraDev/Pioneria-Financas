# Sprints — Pioneira-Financas

> Esta pasta era a **gestão de projeto** do sistema. Em **2026-05-22 a gestão migrou para o Plane** (projeto `SFN` no workspace `viacao-pioneira`). Esta pasta agora guarda apenas o histórico versionado.

## Onde fica cada coisa agora

| O que | Onde |
|---|---|
| **Sprint atual + backlog** | Plane SFN (cycles + work items) |
| **Retrospectivas de sprints fechadas** | `concluidas/sprint-NN-titulo.md` (markdown, versionado) |
| **Snapshot da gestão pré-migração** | `snapshots/2026-05-22-pre-plane.md` (referência histórica) |
| **Roteiros, templates, materiais de demo** | `sprint-NN-*.md` (markdown, versionado — material que vive melhor em arquivo do que em ticket) |
| **Método deste arquivo** | aqui (`README.md`) |

## Como funciona agora

- **Sprint = cycle no Plane**, 7 dias terminando sempre numa sexta.
- **Tasks = work items no Plane**, com módulo + labels (prioridade + tipo).
- **Reunião de acompanhamento toda sexta** entre Claude PM + user — fechamento de cycle + planning do próximo.
- **Retrospectiva ao fechar cycle:** Claude escreve `concluidas/sprint-NN-titulo.md` com "o que entreguei / o que ficou / o que aprendi" e marca o cycle como completo no Plane.

## Estrutura do Plane (SFN)

**Módulos:** Fluxo de Caixa · Recebíveis GDF · Integrações & Sync · Contas (CR/CP) · Validação & Reuniões · Infraestrutura

**Labels prioridade:** `prioridade:crítica` 🔴 · `:alta` 🟠 · `:média` 🟡 · `:baixa` 🟢

**Labels tipo:** `tipo:feature` · `:bug` · `:tech-debt` · `:reuniao` · `:retrospectiva` · `recorrente-semanal`

## Ritual em cada conversa

| Momento | O que eu faço |
|---|---|
| **Abertura** | Consulto o cycle ativo no Plane + work items in_progress → "Onde estamos" (1 parágrafo) |
| **Durante** | Executo o que combinamos. Se você pedir algo novo que não cabe no cycle, mostro o trade-off antes de aceitar |
| **Fechamento** | "Próximo passo" (1 sentença) com o que vem depois |
| **Fim do cycle (sexta)** | Retrospectiva curta → `concluidas/sprint-NN-titulo.md` + cycle marcado completo no Plane |

## Princípios

1. **Não esconder trade-offs.** Se você pede algo novo que desloca a sprint, eu mostro: "isso adia X em N dias, ok?"
2. **Sprints semanais.** 7 dias sexta-a-sexta. Se um objetivo demora mais, abrange múltiplos cycles.
3. **Definition of done explícita.** Cada cycle tem critério mensurável (não vago como "melhorar UX").
4. **Backlog priorizado por label.** Reordenação no Plane direto.
5. **Nada em Plane sem confirmação.** Eu nunca crio/edito/fecho work item sem você confirmar na mesma mensagem.

## Por que migramos pro Plane

- Multi-dispositivo (web + mobile + IDE)
- Buscas e filtros que markdown não dá
- Estado nativo de cycle/módulo/label sem reinventar formato
- Permite compartilhar com financeiro/diretoria sem precisar do git
- Histórico versionado em markdown **ainda existe** — `concluidas/` continua sendo a memória oficial

## Por que NÃO usamos Jira/Linear

- Plane é open-source, self-hostable, plano gratuito generoso
- A empresa já tem outros projetos lá (CCO, Telemetria, Escalas, etc.)
- MCP nativo permite Claude operar sem fricção

## Histórico

Decisão tomada em 2026-05-22 (sessão de conversa com Claude PM). Migração executada na mesma sessão: 6 módulos, 10 labels, 2 cycles, 32 work items criados. Snapshot do estado pré-migração em `snapshots/2026-05-22-pre-plane.md`.
