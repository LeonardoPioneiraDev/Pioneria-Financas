# Sprint 01 — Recebíveis GDF v1

> **Concluída:** 2026-05-20 · **Duração:** ~2 semanas

## Objetivo

Entregar o módulo Recebíveis GDF do zero — integração BRB Mobilidade + cruzamento com extrato bancário (glosa) + UI navegável.

## O que foi entregue ✅

### Backend
- Cliente `horarios.vpioneira.com.br` (nativo fetch + retry + telemetria) em `plugins/horarios-client.ts`
- Sync Globus BCOMOVTO (`globus-bcomovto.adapter.ts`) com hash idempotente
- ETL classificação famílias por regex (16 famílias: 6 pagantes + 10 gratuidades)
- ETL banco_movto com heurística `eh_repasse_brb` (CODHISTOBCO=908 + conta 70-51-108)
- 6 endpoints REST: mapa-diario, composicao-familia, aging, glosa, familias, sincronizar
- Schemas TypeBox em `packages/shared/src/schemas/recebiveis-gdf.ts`

### Banco
- Migration `1700000015000-recebiveis-gdf.ts` (módulo completo, 16 famílias seed)
- Migration `1700000016000-banco-movto.ts` (BCOMOVTO stage + finance.banco_movto)
- Migration `1700000013000-observabilidade-sync.ts` (sync_errors + oracle_query_logs)

### UI
- Página `/recebiveis-gdf` em 4 abas (Resumo / Glosa / Velocidade / Mapa)
- Glossário inicial em linguagem leiga
- Tooltips em TODOS os termos técnicos (componente `TermoTecnico`)
- Status semaforizado (janela curta detecta delay BRB→banco)
- Drill-down por família (`ComposicaoFamiliaDialog`)
- Componente `Tabs` reaproveitável (sem dependência nova)

## O que ficou pra depois 📋

→ Backlog (`backlog.md`):
- Drill-down banco na aba Glosa (modal com lançamentos individuais)
- Ajuste manual de glosa conhecida (sair dos alertas)
- Cenários históricos 12 meses (tendência de glosa)

## Retro — o que aprendi

1. **A heurística BRB foi mais simples do que esperava.** Conta `70-51-108` é dedicada — não precisou de filtros complexos no `HISTMOVTOBCO`.
2. **Janela curta confunde tudo.** Foi necessário detectar `< 30 dias` e mostrar mensagem neutra ao invés de "glosa de -596%" alarmante.
3. **Glossário + tooltips fazem diferença real.** O user pediu "explicação pra leigos" e quando virei tudo em aba + (i) + linguagem cotidiana, ficou navegável pra equipe financeira sem treinamento.
4. **API horários estava com vars de env faltando** — descobri durante o sync. Falta uma tela de "Status das integrações" pra detectar isso antes de tentar usar (entra no backlog).
5. **Schema centralizado em `module-status.ts` evitou drift** entre sidebar, banner e placeholder. A UI mostra a verdade automaticamente.

## Decisões registradas

- Receita técnica nunca apresentada como receita real (princípio v1 mantido)
- 1 célula = 1 (data_transporte × data_resgate × família). Linha "Resgate de" descartada.
- Famílias classificadas por regex priorizada; texto original preservado em `tipo_pagamento_original`.
- Heurística simples > filtro complexo: validou em 100% dos lançamentos do mês 05/2026.

## Métricas

- ~5 sprints/tasks abertas e fechadas durante a execução
- 0 commits descartados / 0 reverts
- Cobertura de teste: zero (não houve tempo — débito técnico registrado)
