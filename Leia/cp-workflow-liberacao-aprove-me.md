# Contas a Pagar — Workflow inferido e o "sem registro de liberação" (APROVE-ME)

> **Status:** investigação concluída (29/05/2026). Responde à dúvida: "um título
> apareceu pago sem a etapa de liberação — isso é furo do meu banco?".
> **Resposta curta: não.** O dado é fiel ao Globus; a liberação simplesmente não
> está registrada nas colunas/eventos do Globus para ~1/3 dos pagos. Veja por quê.

---

## 1. TL;DR

- O **fluxo do documento** mostrado no detalhe do CP é **inferido** do estado do
  título no Globus — não é um workflow editável nem um dado "nosso". Etapas com
  **nome de usuário** (ex.: inclusão por RODNEYJR, baixa por LUZIA) têm **rastro
  real no Globus**; as demais são deduzidas.
- Quando uma etapa aparece como **"sem registro no Globus"** (antes rotulada
  "pulada pelo globus"), significa **"o Globus não tem nenhum dado dela"** — e
  **não** "a etapa foi driblada". A aprovação pode ter ocorrido no **APROVE-ME**
  (sistema externo) e **não ter sido espelhada** de volta ao Globus.
- Isso é **sistêmico, não bug**: **~34% dos títulos pagos** (≈4.100 de 12.194,
  empresa 4, desde jan/2026) não têm **nenhum** registro de liberação no Globus.
- O log de aprovação *por documento* do APROVE-ME **não está nas tabelas do
  Globus** que conseguimos ler (as `BGM_APROVEME_*` são só configuração). Logo,
  nem o nosso sistema nem relatórios do próprio Globus conseguem provar a
  aprovação desses títulos.

---

## 2. Como o workflow do CP é inferido

Código: `apps/FinancasBackend/src/modules/workflow/workflow-inferencia.service.ts`
(`inferirContaPagar`). São **4 marcos**, derivados do `CPGDOCTO` + da trilha de
eventos `CPGDOCTO_HISTORICO_NEGOCIACOES`:

| Etapa | Evidência considerada "ocorreu" |
|---|---|
| 1. Inclusão | sempre (o registro existir já prova a inclusão); usuário/data via `USUARIO_INCLUSAO` ou evento tipo 1 |
| 2. Liberação de pagamento | `PAGAMENTOLIBERADO='S'` **ou** `DATALIBERACAOPGTO` **ou** `USUARIO_LIB_PAGTO_APROVE_ME`/`USUARIO_LIBEROU_PAGTO` **ou** evento tipo 9 |
| 3. Assinatura eletrônica | `USUARIO_ASS_ELETRON_APROVE_ME` / `ASSINATURA_1` / `ASSINATURA_2` |
| 4. Pagamento (baixa) | `QUITADODOCTOCPG='S'` **ou** `PAGAMENTOCPG` preenchida; quem deu a baixa vem do evento de status→'B' |

Regra de ouro (anti-achismo): **uma etapa só conta como concluída se o Globus tem
dado dela.** Sem dado, ela aparece como "sem registro" — nunca como um marco
inventado. Por isso um título pode mostrar Inclusão ✔ → Liberação (sem registro)
→ Assinatura (sem registro) → Pagamento ✔.

---

## 3. Evidência — título 993932 (FERRAGENS LIDER)

`CPGDOCTO`:

```
PAGAMENTOLIBERADO            = 'N'        ← Globus diz: NÃO liberado
DATALIBERACAOPGTO            = null
USUARIO_LIBEROU_PAGTO        = null
USUARIO_LIB_PAGTO_APROVE_ME  = null
USUARIO_ASS_ELETRON_APROVE_ME= null
USUARIO_INCLUSAO             = RODNEYJR (04/05/2026 09:32)
STATUSDOCTOCPG               = 'B'        ← baixado
PAGAMENTOCPG                 = 29/05/2026
```

`CPGDOCTO_HISTORICO_NEGOCIACOES` (trilha real de eventos):

| Seq | Tipo | Evento | Usuário | Data |
|---|---|---|---|---|
| 1 | 1 | Origem (inclusão) | RODNEYJR | 04/05 09:32 |
| 2 | 5 | Associação | LUZIA | 28/05 13:00 |
| 3 | 4 | Alteração de status → **B (baixa)** | LUZIA | 28/05 14:56 |

**Não há evento tipo 9 (liberação de pagamento).** O título foi de inclusão →
baixa, sem qualquer registro de liberação. O nosso sistema mostrou exatamente
isso.

---

## 4. Escala do fenômeno

Títulos pagos (`STATUSDOCTOCPG='B'`), empresa 4, vencimento ≥ 01/01/2026:

| Métrica | Qtd | % |
|---|---:|---:|
| **Pagos (total)** | 12.194 | 100% |
| Com `PAGAMENTOLIBERADO='S'` | 8.087 | 66% |
| Com `DATALIBERACAOPGTO` | 8.087 | 66% |
| Com usuário liberador | 8.090 | 66% |
| Com evento tipo 9 na trilha | 7.834 | 64% |
| **Sem nenhum registro de liberação** | **≈4.100** | **≈34%** |

→ 1 em cada 3 pagamentos não tem liberação registrada no Globus. **Sistêmico.**

---

## 5. Onde mora a aprovação do APROVE-ME (o gap)

O APROVE-ME é um **sistema externo** de aprovação. Quando funciona, ele *espelha*
o resultado no `CPGDOCTO` (`USUARIO_LIB_PAGTO_APROVE_ME`, `DATALIBERACAOPGTO`,
evento tipo 9). Para ~34% dos títulos esse espelhamento **não aconteceu**.

As tabelas do Globus com "APROVE" no nome são **só configuração**, não histórico
por documento:

| Tabela | Linhas | O que é |
|---|---:|---|
| `BGM_APROVEME_ROTINAS` | 16 | rotinas configuradas |
| `BGM_APROVEME_VERSIONINFO` | 7 | versão |
| `BGM_APROVEME_CONTROLEUSUARIOS` | 6 | usuários |
| `BGM_APROVEME_MOTIVOS` | 1 | motivos |

Ou seja: **o "quem aprovou o título X" do APROVE-ME não está acessível via
Globus.** Vive dentro da aplicação APROVE-ME. (Ver `memory/cp-aprove-me-liberador-gap`.)

---

## 6. Duas leituras possíveis (só o APROVE-ME decide)

1. **Lacuna de integração** (mais provável, dado os 34%): a aprovação ocorreu no
   APROVE-ME mas **não foi espelhada** no Globus. O controle existe; o rastro se
   perde na integração.
2. **Furo de controle real**: a baixa foi feita **direto no Globus, sem passar
   pelo APROVE-ME**. Aí é problema de processo a investigar.

Pode ainda haver uma **classe de títulos que legitimamente não passa pelo
APROVE-ME** (ex.: certos tipos de pagamento, folha, impostos recorrentes). A
distinção exige olhar o APROVE-ME para uma amostra (ex.: o 993932).

---

## 7. Ajuste de UI feito (29/05)

`apps/FinancasFrontend/src/components/shared/WorkflowInferido.tsx`:

- Selo **"pulada pelo globus"** → **"sem registro no Globus"**.
- Nota da etapa → *"sem registro desta etapa no Globus — pode ter ocorrido no
  APROVE-ME e não ter sido espelhado"*.

Motivo: "pulada" dava a impressão (falsa) de que a etapa foi driblada. A nova
redação é honesta: **não temos o registro**, sem acusar.

---

## 8. Recomendações

- **Relatório de controle interno "Pagos sem liberação registrada"** — lista +
  total + filtro por período e por usuário que deu a baixa. Transforma os 34% num
  instrumento de auditoria (vs. um susto pontual). *(Proposto, não construído.)*
- **Confirmar no APROVE-ME** uma amostra (começar pelo 993932): a aprovação está
  lá? Se sim → lacuna de integração (escalar pra Praxio/TI). Se não → furo de
  processo.
- **Não** tentar "preencher" a liberação por heurística — seria inventar marco
  sem evidência, exatamente o que o módulo evita por princípio.

---

## 9. Como reproduzir as queries

```sql
-- Título específico
SELECT PAGAMENTOLIBERADO, DATALIBERACAOPGTO, USUARIO_LIBEROU_PAGTO,
       USUARIO_LIB_PAGTO_APROVE_ME, USUARIO_ASS_ELETRON_APROVE_ME,
       USUARIO_INCLUSAO, QUITADODOCTOCPG, PAGAMENTOCPG, STATUSDOCTOCPG
FROM   GLOBUS.CPGDOCTO WHERE CODDOCTOCPG = 993932;

SELECT SEQUENCIA_EVENTO, COD_TP_EVENTO, USUARIO, DATA_EVENTO, STATUSDOCTOCPG
FROM   GLOBUS.CPGDOCTO_HISTORICO_NEGOCIACOES
WHERE  CODDOCTOCPG = 993932 ORDER BY SEQUENCIA_EVENTO;

-- Escala: pagos sem liberação registrada (empresa 4, 2026)
SELECT COUNT(*) PAGOS,
  SUM(CASE WHEN PAGAMENTOLIBERADO='S' THEN 1 ELSE 0 END) LIB_FLAG_S,
  SUM(CASE WHEN EXISTS (SELECT 1 FROM GLOBUS.CPGDOCTO_HISTORICO_NEGOCIACOES H
                        WHERE H.CODDOCTOCPG=D.CODDOCTOCPG AND H.COD_TP_EVENTO=9)
           THEN 1 ELSE 0 END) COM_EVENTO_LIB9
FROM GLOBUS.CPGDOCTO D
WHERE D.CODIGOEMPRESA=4 AND D.STATUSDOCTOCPG='B' AND D.VENCIMENTOCPG >= DATE '2026-01-01';
```

---

## 10. Referências

- Código inferência: `apps/FinancasBackend/src/modules/workflow/workflow-inferencia.service.ts`
- Componente UI: `apps/FinancasFrontend/src/components/shared/WorkflowInferido.tsx`
- Query do CP (COALESCE liberador): `apps/FinancasBackend/src/integrations/globus/globus.queries.ts` (`contasAPagar`)
- Memória: `cp-aprove-me-liberador-gap`
- SQL exploração: `sql-exploracao/2026-05-26-cp-trilha-auditoria-globus.sql`
