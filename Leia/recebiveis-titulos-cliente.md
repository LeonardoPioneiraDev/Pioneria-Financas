# Recebíveis — Aba "Títulos a receber (clientes)"

**Autor:** Leonardo + implementação assistida · **Empresa:** Viação Pioneira · **Data:** 13 de julho de 2026 · **Status:** implementado e no ar (Docker)

> Pedido do financeiro: "os títulos de recebíveis sempre têm um cliente, o sistema ainda não está mostrando." Este doc registra por que o cliente não aparecia e como foi resolvido.

---

## 1. O problema (duas óticas de recebível)

A tela `/contas-receber` foi reposicionada como **"Recebíveis"** = dinheiro que **entrou no extrato** (`finance.banco_movto`), classificado por origem (GDF / Clientes / Outras). O **extrato bancário não tem cliente** — o banco só manda texto de histórico. O cliente só aparecia no **detalhe de um lançamento**, e apenas quando o crédito foi **conciliado 1:1** com um título (minoria das linhas).

Já os **títulos a receber** do Globus (`CRCDOCTO` → `finance.contas_receber`) **têm o cliente completo** (razão social + CNPJ via `finance.clientes`). Essa visão (`CobrancaView`) existia pronta, mas estava **fora da rota** desde a virada para "Recebíveis" (ver [preservar-codigo-desativado] no histórico).

**Ou seja:** "todo recebível tem cliente" descreve os **títulos CRCDOCTO**, não o extrato.

---

## 2. A solução (aditiva, sem desfazer "Recebíveis = extrato")

A página de Recebíveis ganhou uma **3ª aba**: **"Títulos a receber (clientes)"**, ao lado de "Entradas no extrato" (padrão) e "A receber (reembolsos)".

- Renderiza a `CobrancaView` já existente (`_components/CobrancaView.tsx`) — lista cada título com **cliente** (razão social + CNPJ), aging, status de cobrança e **Top 5 clientes devedores**.
- Nova prop **`embutido`** na `CobrancaView`: quando embutida como aba, suprime o próprio banner de status / `<h1>` / CompliancePill (a página-mãe já mostra), mantendo o botão "Sincronizar do Globus" e todo o conteúdo.
- Backend `/api/contas-receber` (CRCDOCTO) já estava **intacto** e registrado em `app.ts` — só a UI estava escondida.

> A aba só popula depois de **Sincronizar do Globus** dentro dela (lê `CRCDOCTO`, tabela diferente do extrato).

---

## 3. Arquivos

| Arquivo | Mudança |
|---|---|
| `apps/FinancasFrontend/.../contas-receber/page.tsx` | 3ª aba `titulos` + import/render de `CobrancaView embutido` |
| `apps/FinancasFrontend/.../contas-receber/_components/CobrancaView.tsx` | prop `embutido` (suprime banner/título próprios) |

Sem backend novo, sem migration. Deploy via `pnpm docker:app:rebuild`.

---

## 4. Limite estrutural (honesto)

Para créditos de origem **GDF**, **Outras** e **Transferências** no extrato **não há cliente** por natureza (o banco não manda). Só a fatia **"Clientes"** (crédito conciliado a um título confirmado) recupera cliente na aba de extrato. A aba **"Títulos a receber"** é onde o cliente é sempre presente, porque lê o título de origem (CRCDOCTO), não o extrato.
