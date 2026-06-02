# Apresentação — Fluxo de Pagamento (Contas a Pagar)

> Material pronto para virar slides. Cada `##` é um slide; os bullets são o
> conteúdo; "🎤 Nota" é o que falar. Público: financeiro / diretoria.
> Base factual: `Leia/cp-workflow-liberacao-aprove-me.md` (dados de 29/05/2026).

---

## Slide 1 — Capa

**Como uma Conta a Pagar caminha até virar pagamento**
Do cadastro à baixa: onde cada etapa acontece e como o sistema enxerga isso.

🎤 Nota: a ideia é todo mundo sair sabendo (a) quais são as etapas, (b) onde
elas são registradas, e (c) por que às vezes uma etapa aparece "sem registro".

---

## Slide 2 — As 4 etapas da vida de um título

1. **Inclusão** — o título entra no sistema (de uma nota fiscal ou lançamento manual).
2. **Liberação de pagamento** — alguém **autoriza** pagar (aprovação).
3. **Assinatura eletrônica** — autorização final que libera a baixa.
4. **Pagamento (baixa)** — o dinheiro sai no banco e o título é quitado.

🎤 Nota: é sempre essa ordem. Cada etapa tem um "dono" (quem fez) e um "quando".

---

## Slide 3 — Onde cada etapa REALMENTE acontece

| Etapa | Onde acontece | Quem registra |
|---|---|---|
| Inclusão | **Globus** (cadastro do título) | usuário do Globus |
| Liberação | **APROVE-ME** (app de aprovação) | aprovador |
| Assinatura | **APROVE-ME** | assinante |
| Pagamento | **Banco** (remessa/CNAB) → volta pro Globus | quem dá a baixa |

🎤 Nota: ponto-chave → **o Globus é o "cartório" central**. As ações acontecem
em sistemas vizinhos (APROVE-ME aprova, banco paga), mas o resultado **deveria
voltar** e ficar registrado no Globus.

---

## Slide 4 — O Globus é um REGISTRADOR, não o executor

```
   [NF / Lançamento]        [APROVE-ME]            [Banco / CNAB]
          │                      │                       │
          ▼                      ▼                       ▼
      INCLUSÃO  ──►  LIBERAÇÃO ──► ASSINATURA  ──►   PAGAMENTO
          │                      │                       │
          └──────────────►  G L O B U S  ◄──────────────┘
                      (registra o resultado de cada etapa)
```

🎤 Nota: quando a integração funciona, cada etapa "carimba" o Globus de volta.
O nosso sistema (SFN) lê **esse carimbo**.

---

## Slide 5 — Como o nosso sistema reconstrói o fluxo

- O SFN **não** controla a aprovação — ele **lê o estado** do título no Globus e
  **deduz** em que etapa está.
- Regra de ouro: **uma etapa só é marcada como concluída se existe dado dela no
  Globus.** Sem dado, **não inventamos** — mostramos "sem registro".
- Por isso o fluxo é sempre coerente com a fonte e se atualiza sozinho a cada sync.

🎤 Nota: isso é proposital. Preferimos dizer "não sei" a "chutar" um aprovador.

---

## Slide 6 — Os 3 estados que aparecem na tela

- ✅ **Concluída** — tem registro no Globus (e quase sempre o nome de quem fez).
- 🟡 **Etapa atual** — onde o título está agora.
- ⚪ **Sem registro no Globus** — o Globus não tem dado dessa etapa.
  - **Importante:** isso **não** quer dizer que a etapa foi pulada. Pode ter
    acontecido no APROVE-ME e **não ter sido espelhada** de volta.

🎤 Nota: antes esse estado se chamava "pulada pelo Globus" — trocamos porque
dava a impressão errada de que alguém driblou a aprovação.

---

## Slide 7 — Exemplo real (título 993932 — FERRAGENS LIDER)

O que o Globus tem:
- Inclusão: **RODNEYJR**, 04/05 ✅
- Liberação: **sem registro** (campo "liberado" = Não, sem data, sem usuário) ⚪
- Assinatura: **sem registro** ⚪
- Pagamento: **LUZIA**, 28/05 (baixa registrada) ✅

🎤 Nota: o título foi de "incluído" direto para "pago", sem registro de
liberação. O sistema só **mostrou** isso — o dado é do Globus, não nosso.

---

## Slide 8 — Isso é comum? Sim — ~1 em cada 3

Pagamentos da empresa em 2026 (12.194 títulos pagos):

| | Quantidade | % |
|---|---:|---:|
| Com liberação registrada | 8.087 | 66% |
| **Sem registro de liberação** | **≈4.100** | **≈34%** |

🎤 Nota: não é um caso isolado. 34% é sistêmico — aponta para algo estrutural,
não para erros pontuais.

---

## Slide 9 — Duas explicações possíveis

1. **Lacuna de integração** (mais provável): a aprovação **aconteceu** no
   APROVE-ME, mas **não foi espelhada** para o Globus. O controle existe; o
   rastro se perdeu no meio do caminho.
2. **Furo de processo**: a baixa foi feita **direto no Globus**, sem passar pelo
   APROVE-ME. Aí seria um problema de controle interno a corrigir.

🎤 Nota: os dados sozinhos não distinguem as duas. Só olhando o APROVE-ME para
uma amostra (ex.: o 993932) dá pra saber qual é.

---

## Slide 10 — Por que não conseguimos provar pelo sistema

- O **histórico de aprovação por documento** do APROVE-ME **não está** nas
  tabelas do Globus que conseguimos ler.
- As tabelas "APROVE" no Globus são só **configuração** (rotinas, usuários,
  motivos) — não o "quem aprovou o título X".
- Conclusão: para esses 34%, **nem o nosso sistema nem relatórios do Globus**
  conseguem mostrar quem liberou — a informação está dentro do APROVE-ME.

🎤 Nota: por isso a recomendação envolve o APROVE-ME / Praxio, não só o nosso lado.

---

## Slide 11 — O que dá pra fazer com isso

- **Relatório "Pagos sem liberação registrada"** — vira um instrumento de
  auditoria: lista, total e filtro por período e por quem deu a baixa.
- **Conferir uma amostra no APROVE-ME** — confirma se é lacuna de integração
  (escalar para Praxio/TI) ou furo de processo (ajustar controle).
- **Não preencher por chute** — manter o princípio de só mostrar o que tem
  evidência.

🎤 Nota: o achado, que parecia um susto, vira uma ferramenta de controle interno.

---

## Slide 12 — Mensagem final

- O sistema é **fiel à fonte**: mostra o que o Globus tem, nunca inventa etapa.
- "Sem registro" = **falta o dado**, não "etapa pulada".
- Existe um ponto real a investigar: **34% dos pagamentos sem liberação
  registrada** — provável lacuna de integração com o APROVE-ME.
- Próximo passo: relatório de auditoria + checagem no APROVE-ME.

🎤 Nota: transparência é a feature. O sistema expõe a verdade — inclusive quando
a verdade é "esse dado não chegou até aqui".

---

## Apêndice — glossário rápido (para quem montar o slide)

- **CPGDOCTO** — tabela do Globus com os títulos a pagar (1 linha por parcela).
- **APROVE-ME** — app de aprovação eletrônica de pagamentos (externo ao Globus).
- **Baixa** — registro de que o título foi pago (status "B" + data de pagamento).
- **Espelhar** — quando um app vizinho grava o resultado de volta no Globus.
- **Inferência** — o sistema deduzir a etapa atual a partir dos campos do título.
