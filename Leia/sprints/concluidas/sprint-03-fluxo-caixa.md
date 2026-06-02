# Sprint 03 — Fluxo de Caixa (CR × CP)

> **Concluída:** 2026-05-22 · **Duração:** ~2 dias · **Replanejamento mid-sprint:** sim

## Objetivo

Entregar `/fluxo-caixa` mostrando o que vai entrar (CR) × o que vai sair (CP) nos próximos 30/60/90 dias, com inadimplência histórica e alerta de gap.

## O que foi entregue ✅

### Backend
- Query `bcoContaCadastro` em `globus.queries.ts` (preservada pro futuro)
- Migration `1700000017000-banco-conta` (preservada pro futuro)
- Entidades `BancoConta`, `GlobusBcocontaStage`
- Adapter `globus-bcoconta.adapter.ts` + ETL `banco-conta.etl.ts`
- Service `fluxo-caixa.service.ts` com:
  - `saldoDiario()` (desativado da UI, código pronto)
  - `projecao()` com inadimplência histórica calculada do CR
  - `sincronizar()` BCOCONTA + BCOMOVTO (desativado da UI)
- 6 endpoints REST (3 ativos, 3 reservados)
- Schemas TypeBox completos

### Frontend
- Página `/fluxo-caixa` em **3 abas**: Resumo / Projeção / Cenários
- 4 KPIs (A receber Nd, A pagar Nd, Diferença, Dias com gap)
- Status semaforizado (ok / atenção / alerta)
- Bloco da inadimplência aplicada (transparência total)
- Gráfico CSS-only de variação acumulada
- Tabela detalhada dia-a-dia
- Glossário inicial + tooltips em TODOS termos técnicos

### Docs
- `Leia/fluxo-caixa.md` — domínio, dados, fórmulas, limitações
- `Leia/sprints/sprint-atual.md` — replanejada mid-sprint
- `Leia/sprints/backlog.md` — saldo bancário movido pra futuro

## Replanejamento mid-sprint (mudança importante)

A sprint começou prevendo **saldo bancário consolidado** (anclora manual do tesoureiro + BCOMOVTO). Foi descartado em 22/05 após o user pedir explicitamente:

> "eu quero que o fluxo de caixa funcione com as receitas para receber e o que ainda falta pagar, não saldo na conta do banco pois isso não dá para entegrar"

Decisão: descartar UI do saldo, manter código no repo pra futuro, focar em CR × CP.

**O quão custosa foi a mudança:** baixíssima. O service `projecao()` já calculava sem saldo (saldo era só ponto de partida — vira zero quando não tem âncora). UI virou 3 abas (não 4), removendo `ContaCard`. ~1h de refactor.

## Bugs encontrados e corrigidos em movimento

1. **Migration não registrada em `index.ts`** — esqueci de adicionar BancoConta1700000017000 na lista (TypeORM usa registry explícito). Recorrência: criar checklist "ao criar migration".
2. **FK `identity.users` (errado) → `identity.usuarios` (correto)** — assumi nome em inglês. Aprendizado: conferir nome real do schema antes.
3. **Filtro de status CP `aberto/parcial/vencido` (chute) → `pendente/aprovado/em_aprovacao` (real)** — chutei status comuns sem conferir o enum.
4. **`acrescimo_cents` não existe em CP** — assumi simetria com CR (que tem). CP tem `juros_cents`, `multa_cents`, `valor_liquido_cents`. Trocado pra `valor_liquido_cents` direto.
5. **FK `tipos_receita` vazia** — ETL crc.etl.ts inseria `cod_tp_receita` sem que o código existisse na tabela referenciada. Fix: upsert automático com descrição placeholder.

Total: **5 bugs em runtime** vs **typecheck verde**. Reforça que typecheck **não substitui** rodar o sistema com dados reais.

## Decisões registradas

- **Saldo bancário descartado** (motivo: Globus não mantém, sem API banco, sem disposição de digitar manualmente)
- **Sync ampliado pra ±5 meses** no botão FC (mês corrente é insuficiente pra projeção 90d)
- **Inadimplência calculada automaticamente** do próprio CR, 6 meses
- **Códigos novos de tipo_receita** entram com "(sync pendente)" e sync futuro pode atualizar

## Métricas

- 11 tasks fechadas (#63-67, #75-79, #80-83)
- 3 docs gerados / atualizados
- 1 retro completa
- Sync real: 5658 CP do Globus em 9.7s · 3533 ETL em 25s
- 0 quebras de typecheck no final
- 5 bugs runtime descobertos e corrigidos no mesmo dia

## Observações pra próxima sprint

1. **Inadimplência 66% precisa validação com financeiro** — número alto demais, possível artefato do Globus marcar `aberto` em títulos que foram baixados em outros sistemas.
2. **CR sem vencimento futuro** — Pioneira parece não emitir CR com antecedência. Receita real vem do GDF (BRB). Significa que a aba Fluxo de Caixa, na prática, é **só a parte de SAÍDAS** confiável.
3. **Cenários ainda planejado** — só priorizar se financeiro pedir após usar 1-2 semanas.
4. **UI das Integrações** continua como próxima prioridade alta — backend pronto, sem visualização.

## Retro — o que aprendi

1. **PM mode funciona.** Replanejar mid-sprint (saldo banco out) foi tranquilo porque a sprint tinha objetivo escrito + DoD explícito. Substituir "saldo consolidado" por "CR × CP" tomou 5 perguntas e 1h de código.
2. **Bugs vêm em cascata quando se faz código sem rodar.** Os 5 bugs surgiram após eu declarar "tudo pronto" com base só em typecheck. Aprendizado: na próxima migration, **rodar antes de declarar done**.
3. **A pasta `Leia/sprints/` ajudou.** O `sprint-atual.md` virou um contrato — quando o user pediu mudança, eu pude apontar "isso desloca X, ok?" sem ambiguidade.
4. **Tooltips em termos técnicos pegaram bem.** Padrão reutilizado em CR, GDF e agora Fluxo de Caixa. Vale virar componente sistêmico.

## Status final

- Sprint 03: **fechada com sucesso**
- Módulo Fluxo de Caixa: **em produção, 5/6 funcionalidades**
- Backlog atualizado com 2 itens novos: "Investigar inadimplência 66%" e "Validar números com financeiro"
