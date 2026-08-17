# Padrão de Validação e Conferência

> **Padrão corporativo da Viação Pioneira** para colocar um sistema em produção com os números conferidos por quem entende do negócio — e com prova documental de quem conferiu, quando, e o que disse.
>
> Implementado pela primeira vez no Sistema Financeiro v2 (jul/2026). Este documento descreve o padrão de forma **portável**: as seções 1–11 valem para qualquer sistema e qualquer stack; as seções 12–19 trazem a implementação de referência, o runbook e o plano de adoção.

---

## Índice

### Parte I — O padrão (independente de tecnologia)

| # | Seção | Para quem |
|---|---|---|
| 1 | [O problema que o padrão resolve](#1-o-problema-que-o-padrão-resolve) | Todos |
| 2 | [Vocabulário](#2-vocabulário) | Todos |
| 3 | [Papéis e responsabilidades](#3-papéis-e-responsabilidades) | Gestor · Analista |
| 4 | [Ciclo de vida](#4-ciclo-de-vida-de-uma-funcionalidade) | Todos |
| 5 | [Fluxos passo a passo](#5-fluxos-passo-a-passo) | Dev · Analista |
| 6 | [Regras invariantes](#6-regras-invariantes) | **Quem for implementar** |

### Parte II — Especificação técnica

| # | Seção | Para quem |
|---|---|---|
| 7 | [Modelo de dados](#7-modelo-de-dados) | Dev · DBA |
| 8 | [Catálogo e funções puras](#8-catálogo-e-funções-puras) | Dev |
| 9 | [Contrato de API](#9-contrato-de-api) | Dev |
| 10 | [Controle de acesso](#10-controle-de-acesso-em-três-camadas) | Dev · Segurança |
| 11 | [Notificações](#11-notificações) | Dev |
| 12 | [Relatório e prova documental](#12-relatório-e-prova-documental) | Auditoria · Compliance |
| 13 | [Telas e microtexto](#13-telas-e-microtexto) | Dev · Design |
| 14 | [Parâmetros](#14-parâmetros) | Admin |

### Parte III — Operação e adoção

| # | Seção | Para quem |
|---|---|---|
| 15 | [Runbook operacional](#15-runbook-operacional) | **Admin do processo** |
| 16 | [Métricas de saúde](#16-métricas-de-saúde-do-processo) | Gestor |
| 17 | [Modelo de ameaças](#17-modelo-de-ameaças) | Segurança · Auditoria |
| 18 | [Como portar para outro sistema](#18-como-portar-para-outro-sistema) | **Quem for implementar** |
| 19 | [Adoção em sistema já em produção](#19-adoção-em-sistema-já-em-produção) | Gestor · Dev |

### Parte IV — Referência

| # | Seção | Para quem |
|---|---|---|
| 20 | [Decisões e porquês](#20-decisões-e-porquês) | Arquiteto |
| 21 | [Anti-padrões](#21-anti-padrões) | **Quem for implementar** |
| 22 | [Armadilhas conhecidas](#22-armadilhas-conhecidas) | **Quem for implementar** |
| 23 | [Testes de aceitação](#23-testes-de-aceitação) | QA · Dev |
| 24 | [Perguntas frequentes](#24-perguntas-frequentes) | Todos |
| 25 | [Mapa de arquivos](#25-mapa-de-arquivos-implementação-de-referência) | Dev |
| 26 | [Consultas úteis](#26-consultas-úteis) | Dev · Auditoria |

---

# Parte I — O padrão

## 1. O problema que o padrão resolve

### 1.1 O sintoma

Sistema novo entra no ar. Os números vêm de integração com o legado, de regra de negócio reescrita, de query nova. Ninguém do negócio conferiu nada — o time técnico testou o *software*, não o *dado*.

Três consequências previsíveis:

| Consequência | Como aparece na prática |
|---|---|
| **Ninguém confia** | O usuário abre o relatório, o total não bate com a planilha dele, ele volta para a planilha — e nunca mais sai |
| **Erro descoberto tarde** | O problema aparece quando alguém já decidiu com o número errado, não quando corrigir era barato |
| **Sem prova** | Numa auditoria, "o sistema foi validado" é palavra contra palavra; não há registro de quem olhou o quê |

### 1.2 Por que as soluções óbvias falham

| Tentativa | Por que falha |
|---|---|
| "Manda todo mundo testar o sistema" | Sem trilha nem prazo, ninguém sabe por onde começar e o esforço se dilui. Duas semanas depois, ninguém abriu |
| "Faz um checklist em planilha" | Não trava nada. O checklist é preenchido no fim, de memória, e não prova acesso à tela |
| "O time técnico valida" | Quem escreveu a query é a pior pessoa para conferir se o número está certo — enxerga o que esperava ver |
| "Faz um piloto com um usuário" | Um usuário não cobre o sistema, e o resultado não é rastreável por funcionalidade |

### 1.3 As três garantias do padrão

| Garantia | Mecanismo |
|---|---|
| Ninguém confere tudo de uma vez | **Trilha sequencial**: uma funcionalidade por vez; a seguinte só abre quando a atual for validada |
| Conferir de verdade custa tempo | **Relógio mínimo** entre o primeiro acesso à tela e a permissão de validar |
| Todo evento vira prova | **Registro append-only** com autor, e-mail, timestamp, funcionalidade e o texto escrito |

### 1.4 O princípio por trás

> Princípio herdado do sistema v1: *"quando não tem dado, o sistema diz que não tem"*.
>
> Aqui vira: **quando não foi conferido, o sistema diz que não foi.**

Uma funcionalidade sem validação nunca é apresentada como validada. Não existe estado "provavelmente ok" nem default otimista. Esse é o compromisso que dá valor à assinatura no fim.

### 1.5 O que o padrão NÃO é

- **Não é teste de software.** Bug de sistema é problema do time técnico e tem outro fluxo. Aqui se confere **dado**.
- **Não é aprovação de release.** O padrão não bloqueia deploy; ele mede confiança no número.
- **Não é controle de permissão.** Ele *usa* o controle de acesso para sequenciar, mas quem define quem pode ver o quê é o modelo de papéis (ver [§10](#10-controle-de-acesso-em-três-camadas)).
- **Não é treinamento.** Como efeito colateral, ensina o usuário — mas o objetivo é a conferência, e confundir os dois leva a validar por presença, não por conferência.

---

## 2. Vocabulário

Termos com significado preciso neste documento. Usar sempre os mesmos na UI, no código e nas conversas.

| Termo | Significado |
|---|---|
| **Funcionalidade** | Unidade conferível — na prática, uma tela com seus números. Identificada por uma **chave** estável |
| **Chave** | Identificador da funcionalidade. Na implementação de referência é a rota (`/contas-pagar`) |
| **Catálogo** | Lista **ordenada** de todas as funcionalidades conferíveis. A ordem do catálogo **é** a ordem de validação |
| **Trilha** | Subconjunto do catálogo atribuído a um auditor, percorrido em ordem |
| **Atribuída** | Funcionalidade que o admin colocou na trilha de alguém |
| **Liberada** | Validadas + a próxima a validar. É o que o usuário pode acessar |
| **Conferência** | Ato do auditor: validar ou reprovar |
| **Validação** | Conferência com resultado positivo. Libera a próxima da trilha |
| **Ressalva** | Conferência com resultado negativo, com texto obrigatório. Não avança a trilha |
| **Aval** | Ato do CFO declarando ciência sobre uma funcionalidade já validada |
| **Devolução** | Aval negativo. Registra, mas não retrocede acesso |
| **Resposta** | Texto do admin explicando o que foi corrigido numa ressalva |
| **Relógio** | Tempo decorrido desde o primeiro acesso à tela |
| **Espelho** | Cópia do estado no registro do usuário, para o menu e a autorização responderem rápido |
| **Registro** | Uma linha da trilha append-only. Nunca é alterado (exceto pela resposta do admin) |

---

## 3. Papéis e responsabilidades

Três papéis com responsabilidades que **não se sobrepõem**. Sobreposição destrói o valor da separação.

### 3.1 Matriz de responsabilidades

| Ação | Auditor | CFO | Admin |
|---|:---:|:---:|:---:|
| Conferir os números de uma tela | **R** | — | — |
| Validar uma funcionalidade | **R** | — | — |
| Registrar ressalva com o problema | **R** | C | — |
| Dar aval de ciência | — | **R** | C |
| Devolver com ressalva | — | **R** | — |
| Atribuir funcionalidades à trilha | — | — | **R** |
| Definir o tempo mínimo | — | C | **R** |
| Corrigir o problema apontado | — | — | **R** |
| Responder à ressalva | — | — | **R** |
| Resetar progresso de um auditor | — | — | **R** |
| Ver o relatório completo | — | **A** | **A** |
| Ver o próprio histórico | **A** | **A** | **A** |

**R** = responsável · **A** = acesso · **C** = consultado

### 3.2 Auditor — confere os números

Pessoa **do negócio**, não da TI. No Financeiro da Pioneira: dois analistas. Recebe uma trilha e percorre uma funcionalidade por vez.

Em cada tela, depois de cumprir o tempo mínimo, decide:

- **Validar** — os dados batem com o que ele conhece. Registra e **libera a próxima**.
- **Não validar** — encontrou problema. Descreve o que está errado (**texto obrigatório**). Registra a ressalva, e a trilha **não avança**.

**O que o auditor NÃO faz:**
- Não corrige nada (aponta; quem corrige é o admin/time técnico)
- Não vê o histórico dos colegas nem o relatório consolidado
- Não escolhe a ordem — a trilha é sequencial

**Uma ressalva não trava permanentemente.** Corrigido o problema, o mesmo auditor valida ali mesmo e segue. Não precisa de destrave.

**Quantos auditores?** Dois é o número de referência: um só vira ponto único de falha (férias, saída, viés pessoal); mais de três dilui responsabilidade e gera ressalva duplicada sobre o mesmo ponto. Trilhas podem se sobrepor de propósito — duas pessoas conferindo a mesma tela crítica é redundância desejada.

### 3.3 CFO — dá o aval de ciência

Não confere dado bruto. Vê **apenas o que os auditores já validaram** e declara ciência — ou devolve com ressalva.

Regras específicas:

- O menu dele espelha o que a auditoria **validou**. Tela em análise **não aparece** para ele.
- O aval só existe depois que **pelo menos um** auditor validou aquela funcionalidade.
- Devolver **não retrocede** a trilha de ninguém: quem já ganhou acesso não perde.
- Se um auditor registrar ressalva **depois** do aval, a tela sinaliza *"ressalva posterior ao aval"*.

**Por que existe esse segundo nível?** O aval é o que transforma conferência técnica em **decisão institucional**. É a assinatura que a diretoria leva para o conselho ou para a auditoria externa. Sem ele, existe conferência; não existe aceite.

### 3.4 Administrador — orquestra e corrige

- Atribui funcionalidades a cada auditor; liga/desliga a trilha
- Define o tempo mínimo (global)
- Lê as ressalvas e **responde** o que foi corrigido
- Enxerga o catálogo inteiro, inclusive o que ninguém abriu
- Pode resetar o progresso de um auditor

> **Regra de ouro: o administrador não valida no lugar de ninguém.**
>
> Se ele pudesse, o padrão inteiro vira teatro — sob pressão de prazo, alguém valida tudo numa tarde e a prova documental passa a atestar uma mentira. A separação entre *quem corrige* e *quem confere* é o que dá valor ao registro.

---

## 4. Ciclo de vida de uma funcionalidade

```
                    ┌──────────────────┐
                    │  NÃO ATRIBUÍDA   │  admin ainda não colocou na trilha de ninguém
                    └────────┬─────────┘
                             │ admin atribui ao auditor
                             ▼
                    ┌──────────────────┐
                    │    BLOQUEADA     │  está na trilha, mas as anteriores não foram validadas
                    └────────┬─────────┘
                             │ a anterior foi validada
                             ▼
                    ┌──────────────────┐
      ┌────────────►│  EM CONFERÊNCIA  │  liberada; relógio começa no 1º acesso à tela
      │             └────────┬─────────┘
      │                      │
      │        ┌─────────────┴─────────────┐
      │        │                           │
      │  "não validar"                "validar"
      │  (texto obrigatório,       (exige tempo mínimo
      │   sem exigir tempo)          cumprido)
      │        │                           │
      │        ▼                           ▼
      │  ┌──────────────┐          ┌──────────────┐
      │  │ COM RESSALVA │          │   VALIDADA   │──── libera a PRÓXIMA da trilha
      │  └──────┬───────┘          └──────┬───────┘
      │         │                         │
      │  admin responde                   │ CFO analisa
      │  o que corrigiu                   │
      └─────────┘                ┌────────┴────────┐
       (auditor revalida)        │                 │
                            "dar aval"    "devolver com ressalva"
                                 │                 │
                                 ▼                 ▼
                          ┌─────────────┐  ┌────────────────┐
                          │  AVALIZADA  │  │ DEVOLVIDA PELO │
                          │             │  │      CFO       │
                          └─────────────┘  └────────────────┘
```

### 4.1 Estados observáveis

**Derivados dos registros, nunca armazenados como coluna de status.**

| Estado | Condição |
|---|---|
| Não conferida | Nenhum registro de conferência |
| Em conferência | Está na trilha de algum auditor, sem validação ainda |
| Com ressalva | Último registro de conferência do auditor é `reprovado` |
| Validada | Ao menos um auditor com último registro `validado` |
| Avalizada | Último registro de aval é `validado` |
| Devolvida pelo CFO | Último registro de aval é `reprovado` |

> **Por que derivar em vez de guardar?** Coluna de status agregado desincroniza — sempre. Basta uma gravação fora do caminho feliz e o status mente. Derivar do append-only custa uma query e nunca mente.

### 4.2 O estado é por (auditor, funcionalidade)

Com dois auditores na mesma tela, os estados são independentes: um pode ter validado e o outro registrado ressalva. O consolidado mostra os dois, e a funcionalidade conta como **validada** (ao menos um validou) **com ressalva aberta** (ao menos um reprovou sem resposta). Não há contradição: são fatos diferentes sobre a mesma tela, e ambos importam.

---

## 5. Fluxos passo a passo

### 5.1 Auditor valida uma funcionalidade

```
Auditor            Frontend              Backend                Banco
   │                   │                    │                     │
   │ abre a tela       │                    │                     │
   ├──────────────────►│                    │                     │
   │                   │ registrar-acesso   │                     │
   │                   ├───────────────────►│                     │
   │                   │                    │ é a liberada? (R3)  │
   │                   │                    ├────────────────────►│
   │                   │                    │ grava primeiroAcesso│
   │                   │                    │  (só na 1ª vez)     │
   │                   │◄───────────────────┤ 204                 │
   │                   │                    │                     │
   │ … confere os números por N minutos …                         │
   │                   │                    │                     │
   │ clica "Validar"   │                    │                     │
   ├──────────────────►│ POST /conferir     │                     │
   │                   ├───────────────────►│                     │
   │                   │                    │ 1. em trilha?       │
   │                   │                    │ 2. chave no catálogo│
   │                   │                    │ 3. é a próxima?     │
   │                   │                    │ 4. tem 1º acesso?   │
   │                   │                    │ 5. tempo cumprido?  │
   │                   │                    │                     │
   │                   │                    │ ┌── TRANSAÇÃO ────┐ │
   │                   │                    │ │ INSERT registro │ │
   │                   │                    │ │ UPDATE espelho  │ │
   │                   │                    │ └─────────────────┘ │
   │                   │                    ├────────────────────►│
   │                   │                    │                     │
   │                   │                    │ notifica admin+CFO  │
   │                   │                    │ (best-effort)       │
   │                   │◄───────────────────┤ 200 + próxima       │
   │◄──────────────────┤ toast + menu novo  │                     │
```

### 5.2 Auditor aponta problema

```
Auditor → "Não validar" → textarea obrigatória (≥10 chars)
        → POST /conferir { status: 'reprovado', observacoes }
        → valida 1-4 (NÃO checa tempo — R6)
        → INSERT registro (sem tocar no espelho — trilha não avança)
        → notifica APENAS o admin
        → tela do auditor mostra a ressalva + "Aguardando correção"
        → menu do admin ganha contador âmbar
```

### 5.3 Admin corrige e responde

```
Admin  → vê contador no menu → abre Validações → lê a ressalva
       → corrige o problema no sistema (fora deste fluxo)
       → "Responder" → texto do que foi corrigido
       → POST /validacoes/:id/responder
       → UPDATE resposta_admin, respondido_por, respondido_em
       → notifica O AUDITOR que apontou
       → auditor vê a resposta no card e revalida quando quiser
```

### 5.4 CFO avaliza

```
CFO    → recebe notificação "X validada"
       → abre Validações → vê só o validado
       → lê quem validou, quando, e as observações
       → "Dar aval" → observações opcionais
       → POST /validacoes/aval
       → checa: existe conferência validada? (R7)
       → INSERT registro tipo='aval'
       → notifica admin + os auditores que validaram
```

---

## 6. Regras invariantes

**Estas são as regras que fazem o padrão funcionar. Implementar todas — ou o padrão não vale nada.**

Cada regra tem: enunciado · motivo · o que acontece se faltar · como testar.

---

### R1 — Ordem fixa da trilha

**Enunciado:** a ordem de validação é a do catálogo, não a da atribuição nem a de descoberta. O auditor só pode registrar conferência na **próxima** funcionalidade não validada.

**Motivo:** ordem previsível permite sequenciar do simples ao complexo (Contas a Pagar antes de DRE), e ninguém "escolhe" validar só o fácil.

**Se faltar:** o auditor valida as 3 telas simples, empaca na complexa, e o relatório mostra "3 de 12" sem revelar que as 9 restantes são justamente as difíceis.

**Teste:** validar fora de ordem → 400.

---

### R2 — Relógio antes da validação

**Enunciado:** validar exige **N minutos desde o primeiro acesso** àquela tela. N é configurável globalmente.

**Motivo:** validação em dois cliques não é conferência. O tempo é a barreira mínima contra o "aceitar tudo".

**Se faltar:** a trilha inteira é validada em 5 minutos e o relatório atesta uma conferência que não houve — pior que não ter processo, porque agora existe prova falsa.

**Teste:** validar antes do tempo → 400 **com os minutos restantes na mensagem**.

---

### R3 — O relógio só começa na funcionalidade liberada

**Enunciado:** registrar o primeiro acesso só vale para a funcionalidade **atualmente liberada**. Chamada para qualquer outra é ignorada silenciosamente.

**Motivo:** sem isso o usuário dispara o relógio de todas de uma vez e, N minutos depois, valida a trilha inteira em sequência sem abrir tela nenhuma.

**Se faltar:** R2 vira decorativa. **Esta é a falha mais fácil de deixar passar** — o endpoint parece inofensivo.

**Teste:** chamar `registrar-acesso` para funcionalidade bloqueada → nada gravado.

---

### R4 — Reprovar exige texto

**Enunciado:** `status = reprovado` sem observações é rejeitado pela API **e** por constraint no banco. Mínimo de 10 caracteres.

**Motivo:** "não validei" sem motivo não é acionável. O texto é o produto do trabalho do auditor.

**Se faltar:** ressalvas vazias que ninguém sabe corrigir, e o auditor culpado por "não ter explicado".

**Teste:** reprovar sem texto, e com texto de 5 chars → 400 nos dois casos.

---

### R5 — Reprovar não avança, não trava

**Enunciado:** a ressalva registra e para. A funcionalidade continua liberada para o mesmo auditor revalidar quando quiser.

**Motivo:** travar exigiria destrave manual do admin — burocracia que ninguém mantém.

**Se faltar:** ou a trilha avança com problema aberto (mascara o erro), ou trava até intervenção (o processo morre na primeira ausência do admin).

**Teste:** reprovar → a próxima da trilha continua bloqueada, e a atual continua liberada.

---

### R6 — Reprovar não exige o tempo mínimo

**Enunciado:** a ressalva pode ser registrada a qualquer momento após o primeiro acesso.

**Motivo:** se o auditor viu o erro nos primeiros 30 segundos, ele reporta na hora. Achar erro rápido é mérito.

**Se faltar:** o auditor encontra o erro, não pode reportar, esquece — ou abre chamado por fora, e o registro se perde.

**Teste:** reprovar imediatamente após o primeiro acesso → 200.

---

### R7 — Aval só depois de validação

**Enunciado:** não é possível avalizar funcionalidade sem nenhuma conferência validada.

**Motivo:** o aval é de ciência sobre o trabalho da auditoria. Sem trabalho, não há do que ter ciência.

**Se faltar:** o CFO avaliza tudo no primeiro dia e o processo termina antes de começar.

**Teste:** avalizar funcionalidade sem validação → 400.

---

### R8 — Nada retrocede (exceto o reset explícito)

**Enunciado:** devolver com ressalva (CFO) ou responder ressalva (admin) nunca remove acesso já conquistado nem apaga validação.

**Única exceção:** o **reset de um auditor**, ação deliberada do admin, que apaga a participação dele no ciclo — ver [§20.11](#2011-reset-apaga-a-trilha-do-auditor).

**Motivo:** o histórico é append-only; retroceder acesso pune quem trabalhou e cria estado ambíguo.

**Se faltar:** o auditor perde o acesso a telas que já validou e não consegue mais consultar o próprio trabalho.

**Teste:** CFO devolve → a trilha do auditor permanece intacta.

---

### R9 — Ninguém se auto-notifica

**Enunciado:** o autor de um evento nunca recebe notificação dele.

**Motivo:** sino que apita com o próprio ato é sino que ninguém olha.

**Teste:** CFO avaliza → CFO não tem notificação de aval.

---

### R10 — Só chaves do catálogo

**Enunciado:** atribuir funcionalidade fora do catálogo é rejeitado.

**Motivo:** chave inválida vira **passo fantasma** — conta no total da trilha e nunca pode ser validada.

**Se faltar:** o usuário trava permanentemente numa etapa que não existe, sem mensagem que explique.

**Teste:** atribuir chave inexistente → 400.

---

### R11 — Desatribuir limpa validação **e** relógio

**Enunciado:** remover uma funcionalidade da trilha descarta a validação dela e o registro de primeiro acesso.

**Motivo:** se só a validação for limpa, desmarcar e remarcar deixa o relógio já vencido — validação instantânea.

**Se faltar:** rota silenciosa para burlar R2, sem nenhum sinal no registro.

**Teste:** desatribuir e reatribuir → relógio zerado.

---

### R12 — Trilha e espelho na mesma transação

**Enunciado:** o registro histórico e o campo de estado do usuário são gravados atomicamente.

**Motivo:** divergência produz usuário com acesso sem registro (não rastreável) ou registro sem acesso (usuário travado).

**Se faltar:** falha parcial deixa o sistema num estado que ninguém sabe reconciliar.

**Teste:** forçar erro após o INSERT → nada persistiu.

---

# Parte II — Especificação técnica

## 7. Modelo de dados

### 7.1 Tabela de trilha

**Append-only.** Cada clique é uma linha nova; nada é atualizado, exceto a resposta do administrador.

```sql
CREATE TABLE audit.validacao_funcionalidade (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         int NOT NULL DEFAULT 1,
  usuario_id         uuid NOT NULL REFERENCES identity.usuarios(id) ON DELETE CASCADE,
  funcionalidade     varchar(80) NOT NULL,
  tipo               varchar(20) NOT NULL,
  status             varchar(20) NOT NULL,
  observacoes        text,
  primeiro_acesso_em timestamptz,
  resposta_admin     text,
  respondido_por     uuid REFERENCES identity.usuarios(id) ON DELETE SET NULL,
  respondido_em      timestamptz,
  criado_em          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT validacao_tipo_ck   CHECK (tipo   IN ('conferencia', 'aval')),
  CONSTRAINT validacao_status_ck CHECK (status IN ('validado', 'reprovado')),
  -- R4 garantida no banco, não só na aplicação:
  CONSTRAINT validacao_obs_ck    CHECK (status <> 'reprovado' OR observacoes IS NOT NULL)
);

CREATE INDEX validacao_func_idx
  ON audit.validacao_funcionalidade (funcionalidade, tipo, criado_em);
CREATE INDEX validacao_usuario_idx
  ON audit.validacao_funcionalidade (usuario_id, funcionalidade);
```

**Decisões de coluna:**

| Coluna | Por que existe |
|---|---|
| `empresa_id` | Multi-tenant ready (hoje sempre 1). Adicionar depois exige backfill |
| `primeiro_acesso_em` | **Snapshot** do relógio no momento do registro. Prova quanto tempo a pessoa teve a tela aberta — dado de auditoria que o espelho perde ao ser limpo |
| `resposta_admin` + `respondido_por` + `respondido_em` | Único campo que sofre UPDATE. Poderia ser outra linha, mas a resposta é sobre *aquela* ressalva |
| `ON DELETE CASCADE` no autor | Apagar usuário leva o histórico dele. **Se a política de retenção exigir preservar, trocar por `SET NULL` e denormalizar nome/e-mail** (ver [§20.9](#209-cascade-no-autor-do-registro)) |

**Estado atual = último registro por `(usuario_id, funcionalidade, tipo)`.** Nunca guardar coluna de status agregado.

### 7.2 Espelho de estado

O menu e a autorização de API precisam responder a cada request. Percorrer o append-only para isso seria caro. Por isso o usuário carrega o espelho:

```sql
ALTER TABLE identity.usuarios
  ADD COLUMN liberacao_progressiva      boolean NOT NULL DEFAULT false,
  ADD COLUMN funcionalidades_atribuidas text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN funcionalidades_validadas  text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN progresso_funcionalidades  jsonb   NOT NULL DEFAULT '{}'::jsonb;
```

Formato do `progresso_funcionalidades`:

```jsonc
{
  "/contas-pagar": {
    "primeiroAcessoEm": "2026-07-22T14:51:00.000Z",  // inicia o relógio
    "validadoEm":       "2026-07-22T16:53:00.000Z",  // null enquanto não validou
    "justificativa":    "Conferido, bate com o Globus."
  }
}
```

> ⚠️ **A trilha é a fonte da verdade; o espelho é cache.** Gravar os dois na mesma transação (R12). Se divergirem, a trilha ganha — ver a query de reconciliação em [§26.5](#265-reconciliar-espelho-com-a-trilha).

### 7.3 Tabela de notificações

**Uma linha por destinatário.** O mesmo evento vira N linhas — assim "lida" é por pessoa, sem tabela de junção.

```sql
CREATE TABLE identity.notificacao (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     int NOT NULL DEFAULT 1,
  usuario_id     uuid NOT NULL REFERENCES identity.usuarios(id) ON DELETE CASCADE,
  tipo           varchar(40) NOT NULL,
  titulo         varchar(200) NOT NULL,
  mensagem       text NOT NULL,
  funcionalidade varchar(80),
  ator_id        uuid REFERENCES identity.usuarios(id) ON DELETE SET NULL,
  ator_nome      varchar(200),   -- denormalizado de propósito
  ator_email     varchar(255),   -- idem
  link           varchar(200),
  lida_em        timestamptz,
  criado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notificacao_destinatario_idx
  ON identity.notificacao (usuario_id, lida_em, criado_em DESC);
```

**Por que denormalizar nome e e-mail do ator:** o histórico não pode mudar retroativamente se alguém editar o cadastro. Se "Iran" virar "Iran Silva" amanhã, a notificação de ontem deve continuar dizendo o que dizia.

**Por que o texto é montado na gravação, não na leitura:** a mensagem cita nomes e valores do momento. Montar na leitura obrigaria a rebuscar tudo e mudaria o texto quando os dados mudassem.

---

## 8. Catálogo e funções puras

### 8.1 O catálogo

Lista **ordenada**, em código compartilhado entre backend e frontend:

```ts
export interface FuncionalidadeInfo {
  chave: string;   // = href da rota (ex.: '/contas-pagar')
  nome: string;    // rótulo exibido
  grupo: string;   // agrupamento visual
}

// A ORDEM AQUI é a ordem de validação: de cima para baixo.
export const FUNCIONALIDADES: ReadonlyArray<FuncionalidadeInfo> = [
  { chave: '/contas-pagar',   nome: 'Contas a Pagar',        grupo: 'Operacional' },
  { chave: '/contas-receber', nome: 'Recebíveis',            grupo: 'Operacional' },
  { chave: '/recebiveis-gdf', nome: 'Recebíveis GDF',        grupo: 'Operacional' },
  { chave: '/conciliacao',    nome: 'Conciliação Bancária',  grupo: 'Operacional' },
  { chave: '/folha',          nome: 'Encargos & Benefícios', grupo: 'Folha & Tributos' },
  { chave: '/folha-detalhe',  nome: 'Custo por Setor',       grupo: 'Folha & Tributos' },
  { chave: '/tributos',       nome: 'Tributos',              grupo: 'Folha & Tributos' },
  { chave: '/depreciacao',    nome: 'Depreciação',           grupo: 'Folha & Tributos' },
  { chave: '/fluxo-caixa',    nome: 'Fluxo de Caixa',        grupo: 'Planejamento' },
  { chave: '/orcamento',      nome: 'Orçamento',             grupo: 'Planejamento' },
  { chave: '/dre',            nome: 'DRE',                   grupo: 'Planejamento' },
  { chave: '/painel-cfo',     nome: 'Painel CFO',            grupo: 'Executivo' },
];
```

**Como escolher a ordem** — critérios, na ordem de peso:

1. **Do concreto ao derivado.** Contas a Pagar (títulos que a pessoa reconhece um a um) antes de DRE (agregação de tudo). Erro na base aparece antes de contaminar o derivado.
2. **Do familiar ao novo.** Telas que espelham processo existente antes de telas que trazem visão nova.
3. **Dependência de dado.** Se a tela B soma números da tela A, A vem antes — não faz sentido validar o total antes das parcelas.
4. **Executivo por último.** Painéis de diretoria consolidam tudo; validá-los antes é validar no escuro.

**O painel inicial (dashboard) fica FORA do catálogo** — é sempre visível e não se valida. Colocá-lo dentro cria passo fantasma (R10).

### 8.2 As duas funções puras

São o coração do padrão. **Puras, compartilhadas entre back e front, sem I/O.**

```ts
/** Ordem canônica das chaves. */
export const ORDEM_FUNCIONALIDADES: ReadonlyArray<string> = FUNCIONALIDADES.map((f) => f.chave);

/**
 * Funcionalidades LIBERADAS: todas as já validadas + a PRÓXIMA a validar
 * (a primeira atribuída ainda não validada, na ordem canônica).
 * As posteriores ficam bloqueadas.
 */
export function funcionalidadesLiberadas(atribuidas: string[], validadas: string[]): string[] {
  const atrib = new Set(atribuidas);
  const valid = new Set(validadas);
  const liberadas: string[] = [];
  for (const chave of ORDEM_FUNCIONALIDADES) {
    if (!atrib.has(chave)) continue;
    liberadas.push(chave);
    if (!valid.has(chave)) break;   // esta é a "atual"; as próximas ficam travadas
  }
  return liberadas;
}

/** A próxima a validar (primeira atribuída não validada). Null = trilha concluída. */
export function proximaAValidar(atribuidas: string[], validadas: string[]): string | null {
  const atrib = new Set(atribuidas);
  const valid = new Set(validadas);
  for (const chave of ORDEM_FUNCIONALIDADES) {
    if (atrib.has(chave) && !valid.has(chave)) return chave;
  }
  return null;
}
```

**Comportamento em casos-limite** (vale testar todos):

| Entrada | `funcionalidadesLiberadas` | `proximaAValidar` |
|---|---|---|
| Nada atribuído | `[]` | `null` |
| Atribuídas, nenhuma validada | `[primeira]` | primeira |
| Todas validadas | todas | `null` |
| Validada fora de ordem (dado sujo) | para na primeira não validada | primeira não validada |
| Chave validada que não está mais atribuída | ignorada | ignorada |

> **Manter puras e compartilhadas.** Duplicar a lógica em dois lugares garante divergência entre o que o menu mostra e o que a API autoriza — e essa divergência é sempre descoberta em produção, por um usuário confuso.

---

## 9. Contrato de API

Prefixos e verbos são convenção; o que importa é o conjunto de operações e quem pode chamar cada uma.

### 9.1 Índice de rotas

| Método | Rota | Quem | O que faz |
|---|---|---|---|
| `POST` | `/validacoes/conferir` | autenticado | Valida ou reprova a funcionalidade **atual** da trilha |
| `GET` | `/validacoes/minhas` | autenticado | Histórico do próprio usuário |
| `GET` | `/validacoes` | admin · CFO | Consolidado por funcionalidade (escopo difere por papel) |
| `POST` | `/validacoes/aval` | admin · CFO | Aval de ciência ou devolução com ressalva |
| `POST` | `/validacoes/:id/responder` | **admin** | Responde a uma ressalva |
| `GET` | `/validacoes/relatorio` | admin · CFO | Trilha completa com filtros |
| `GET` | `/validacoes/relatorio/export` | admin · CFO | Mesmo relatório em XLSX |
| `POST` | `/users/me/registrar-acesso` | autenticado | Inicia o relógio (idempotente, respeita R3) |
| `GET` | `/notificacoes` | autenticado | Lista + contador de não lidas |
| `POST` | `/notificacoes/ler` | autenticado | Marca lidas (IDs, ou todas se vazio) |

### 9.2 `POST /validacoes/conferir`

**Requisição — validação:**
```jsonc
{ "chave": "/contas-pagar", "status": "validado",
  "observacoes": "Conferido com o Globus, bate no total e por fornecedor." }  // opcional
```

**Requisição — ressalva:**
```jsonc
{ "chave": "/contas-pagar", "status": "reprovado",
  "observacoes": "O total de janeiro está R$ 12 mil acima do que temos no Globus." }  // obrigatório
```

**Resposta 200:**
```jsonc
{ "status": "validado",
  "funcionalidadesValidadas": ["/contas-pagar"],
  "funcionalidadesLiberadas": ["/contas-pagar", "/contas-receber"],
  "proxima": "/contas-receber" }   // null = trilha concluída
```

**Validações, nesta ordem** — a mensagem precisa dizer qual falhou:

| # | Condição | HTTP | Mensagem de referência |
|---|---|---|---|
| 1 | Usuário em trilha? | 400 | `Você não está em trilha de conferência.` |
| 2 | Chave no catálogo? | 400 | `Funcionalidade desconhecida.` |
| 3 | É a próxima da sequência? | 400 | `Só é possível conferir a funcionalidade atual da sua sequência.` |
| 4 | Tem primeiro acesso? | 400 | `Abra a funcionalidade pelo menos uma vez antes de registrar a conferência.` |
| 5 | Se `reprovado`: texto ≥ 10 | 400 | `Descreva o que precisa ser corrigido (mínimo 10 caracteres).` |
| 6 | Se `validado`: tempo cumprido? | 400 | `Ainda não pode validar — disponível em ~47 min (mínimo 120 min após o 1º acesso).` |

> **Se `reprovado`, o fluxo termina no passo 5** — R6 diz que ressalva não espera o relógio.
>
> **Mensagem de erro que não diz quanto falta gera chamado de suporte.** Sempre devolver o número.

### 9.3 `POST /validacoes/aval`

```jsonc
// requisição
{ "chave": "/contas-pagar", "status": "validado", "observacoes": "Ciente." }

// erro quando ninguém validou (R7)
400 { "message": "Esta funcionalidade ainda não foi validada por nenhum auditor." }
```

### 9.4 `GET /validacoes` — consolidado

**Escopo por papel:**

```
admin → catálogo inteiro (12), incluindo o que ninguém abriu
CFO   → apenas validadas por algum auditor OU já avalizadas
```

**Resposta:**
```jsonc
{
  "funcionalidades": [{
    "chave": "/contas-pagar", "nome": "Contas a Pagar", "grupo": "Operacional",
    "conferencias": [                    // último registro de CADA auditor
      { "usuarioNome": "Iran", "usuarioEmail": "iran@...", "status": "validado",
        "observacoes": "Testado e aprovado.", "criadoEm": "2026-07-22T13:50:00Z",
        "respostaAdmin": null, "respondidoPorNome": null, "respondidoEm": null }
    ],
    "totalValidada": 1,                  // quantos auditores estão com "validado"
    "ressalvasAbertas": 0,               // reprovações sem resposta do admin
    "aval": { "usuarioNome": "Marcio", "status": "validado", "criadoEm": "..." },
    "avalComRessalvaPosterior": false,   // alguém reprovou DEPOIS do aval?
    "podeAvalizar": true,                // R7
    "emConferencia": false               // na trilha de alguém, ainda sem validação
  }],
  "auditores": [
    { "nome": "Iran", "email": "...", "atribuidas": 3, "validadas": 1, "ressalvas": 0 }
  ],
  "totais": { "funcionalidades": 12, "validadas": 1, "avalizadas": 1, "ressalvasAbertas": 0 }
}
```

### 9.5 `GET /validacoes/relatorio`

**Filtros** (todos opcionais, combináveis): `funcionalidade` · `usuarioId` · `tipo` · `status` · `de` · `ate`.

> `ate` é **inclusivo**: `2026-07-22` cobre até `23:59:59.999` daquele dia. Filtro de data que exclui o último dia é fonte garantida de "sumiu um registro".

**Resposta:** `itens[]` (uma linha por evento) · `totais` (eventos, validações, ressalvas, avais) · `usuarios[]` (só quem aparece na trilha, para popular o filtro).

### 9.6 `POST /users/me/registrar-acesso`

```jsonc
{ "chave": "/contas-pagar" }   // → 204 sempre
```

**Idempotente e silencioso de propósito.** Retorna 204 mesmo quando ignora (não está em trilha, chave não liberada, já tem primeiro acesso). O front chama a cada navegação; erro aqui não pode atrapalhar a tela.

### 9.7 Códigos de erro

| HTTP | Quando |
|---|---|
| 400 | Regra de negócio violada (as 6 validações, R7, R10) |
| 401 | Sem token ou token expirado |
| 403 | Papel/atribuição não permite (auditor no relatório, não-admin respondendo ressalva) |
| 404 | Registro ou usuário inexistente |

---

## 10. Controle de acesso em três camadas

Um sistema com trilha tem **três** superfícies de acesso. Implementar as três, sempre com a mesma regra.

```
┌──────────────────────────────────────────────────────────────┐
│ 1. MENU         esconde o que o usuário não pode ver         │
│                 → conveniência. NÃO é segurança.             │
├──────────────────────────────────────────────────────────────┤
│ 2. GUARDA DE    redireciona quem digita a URL na mão         │
│    ROTA         → mesma fonte do menu, senão divergem        │
├──────────────────────────────────────────────────────────────┤
│ 3. AUTORIZAÇÃO  única barreira real. Toda API verificada     │
│    DE API       no servidor, a cada request, lendo do banco  │
└──────────────────────────────────────────────────────────────┘
```

> **Menu e guarda de rota devem consumir a MESMA função.** Duas listas mantidas à mão: uma fica para trás, e alguém entra por URL onde não devia.

### 10.1 Lookup fresco, não o token

A autorização lê **do banco**, não do JWT. Revogar acesso precisa valer na hora, sem esperar o token expirar. O custo é uma query indexada por request — aceitável e não negociável.

### 10.2 O mapa de API para funcionalidade é N:N

Erro clássico: assumir que cada tela usa só a API do módulo dela. Falso — telas cruzam dados:

| Tela | Também chama | Se o mapa fosse 1:1 |
|---|---|---|
| Contas a Pagar | `/api/retencoes` | bloco de retenções em 403 |
| Recebíveis | `/api/reembolsos` | aba de reembolsos em 403 |
| Fluxo de Caixa | `/api/contas-pagar`, `/api/contas-receber` | gráfico vazio |
| Encargos & Benefícios | `/api/contas-pagar` | card de pensão vazio |

```ts
/**
 * Basta UMA das funcionalidades da lista estar liberada para conceder.
 * Ordem importa: prefixos mais específicos primeiro.
 */
const API_PARA_FUNCIONALIDADE: ReadonlyArray<[string, ReadonlyArray<string>]> = [
  ['/api/contas-pagar',   ['/contas-pagar', '/fluxo-caixa', '/folha', '/painel-cfo']],
  ['/api/recebiveis-gdf', ['/recebiveis-gdf', '/painel-cfo']],
  ['/api/recebiveis',     ['/contas-receber']],
  ['/api/contas-receber', ['/contas-receber', '/fluxo-caixa']],
  ['/api/reembolsos',     ['/contas-receber']],
  ['/api/retencoes',      ['/tributos', '/contas-pagar']],
  // …
];
```

**Como levantar o mapa no seu sistema** — não adivinhe, extraia:

```bash
# para cada tela, liste os prefixos de API que ela chama
for d in app/(private)/*/; do
  echo "== $d"; grep -rhoE "'/api/[a-z0-9-]+" "$d" | sort -u
done
```

> **Sem isso, o auditor abre a tela liberada, vê blocos quebrados e reprova por bug da liberação — não por erro do dado.** O padrão passa a medir a coisa errada, e você perde a confiança do auditor logo na primeira tela.

### 10.3 Cuidado: o grant da trilha vaza para ações de infraestrutura

O guard que concede acesso pela funcionalidade liberada (§10.2) roda **depois** de checar o papel — ou seja, ele **sobrepõe** o papel. Isso é o desejado para as APIs de leitura da tela, e é uma armadilha para tudo que não seja leitura.

Exemplo real: `POST /api/contas-pagar/sync` protegida por `requireRole('admin')`. Um auditor com `/contas-pagar` liberado **passava** — porque a URL casa com uma funcionalidade da trilha dele, e o grant concedia antes de negar.

**Regra:** ação de infraestrutura (sincronizar com sistema externo, reprocessar, limpar cache) exige um guard **estrito**, sem o fallback:

```ts
/** SÓ administrador — sem o grant da liberação progressiva. */
fastify.decorate('requireAdmin', async function (req, reply) {
  try { await req.jwtVerify(); } catch { return reply.code(401).send(/* … */); }
  if (req.user.role !== 'admin') {
    return reply.code(403).send({ message: 'Apenas o administrador pode executar esta ação.' });
  }
});
```

**Por que sincronizar é do admin:** puxar dado de sistema externo pesa no legado, pode rodar por minutos e **sobrescreve a base que os auditores estão conferindo**. Quem confere não dispara carga — pede a quem administra. Na UI, o botão some para os demais; a informação de *quando* foi a última carga fica visível para todos (transparência sobre a idade do dado).

> Ao escrever o teste desse guard, mande **corpo válido**: no Fastify a validação do schema roda **antes** do `preHandler`, então `{}` numa rota com campo obrigatório devolve 400 sem nunca chegar na autorização — e o teste não prova nada.

### 10.4 Restrição por papel

```ts
type RestricaoMenu = { modo: 'trilha' | 'espelho'; chaves: readonly string[] };

/** Fonte ÚNICA usada pelo menu E pelo guarda de rota. */
function restricaoDoUsuario(user): RestricaoMenu | null {
  // Auditor: só o que a trilha dele liberou
  if (user.liberacaoProgressiva)
    return { modo: 'trilha', chaves: user.funcionalidadesLiberadas };

  // CFO: espelho do que a auditoria VALIDOU
  if (user.role === 'cfo' && user.funcionalidadesValidadasAuditoria)
    return { modo: 'espelho', chaves: user.funcionalidadesValidadasAuditoria };

  return null;  // demais papéis: menu normal
}
```

**Rotas sempre visíveis**, fora da restrição:
- painel inicial (não se valida)
- "Minhas funcionalidades" (auditor — é onde ele trabalha)
- "Validações" (CFO/admin — é o trabalho deles)

O espelho do CFO é calculado no login/refresh como a **união das validadas** de todos os auditores ativos em trilha.

---

## 11. Notificações

Todo evento notifica quem tem **ação a tomar**. Não notificar quem não tem o que fazer — sino que apita à toa é sino que ninguém olha.

### 11.1 Matriz de destinatários

| Evento | Admin | CFO | Auditor | Por quê |
|---|:---:|:---:|:---:|---|
| Auditor **valida** | ✓ | ✓ | — | o CFO ganhou algo para avalizar |
| Auditor **reprova** | ✓ | — | — | quem corrige é o admin; o CFO não acompanha trabalho em andamento |
| Admin **responde** ressalva | — | — | ✓ (quem apontou) | ele precisa saber para revalidar |
| CFO **avaliza** | ✓ | — | ✓ (quem validou) | fecha o ciclo para quem trabalhou |
| CFO **devolve** | ✓ | — | ✓ (quem validou) | idem |

Sempre subtraindo o autor (R9).

### 11.2 Textos de referência

`{ator}` = nome de quem agiu · `{func}` = nome da funcionalidade · `{detalhe}` = o texto escrito, entre aspas, quando houver.

| Tipo | Título | Mensagem |
|---|---|---|
| `validacao_registrada` | `{func} validada` | `{ator} conferiu {func} e validou os dados. — "{detalhe}"` |
| `ressalva_registrada` | `{func} com ressalva` | `{ator} não validou {func} e apontou um problema — "{detalhe}"` |
| `ressalva_respondida` | `Ressalva respondida — {func}` | `{ator} respondeu à sua ressalva em {func} — "{detalhe}"` |
| `aval_registrado` | `{func} avalizada pelo CFO` | `{ator} deu o aval de ciência em {func}. — "{detalhe}"` |
| `aval_devolvido` | `{func} devolvida pelo CFO` | `{ator} devolveu {func} com ressalva — "{detalhe}"` |

### 11.3 Regras de implementação

1. **Best-effort.** Falha ao notificar **nunca** derruba a mutação de negócio:
   ```ts
   try { /* montar e inserir */ } catch (err) {
     fastify.log.warn({ err, evento: evento.tipo }, '[notificacoes] falha ao registrar evento');
   }
   ```
2. **Uma linha por destinatário**, inserida em lote.
3. **Denormalizar** nome e e-mail do ator.
4. **Front:** refetch a cada 60s + ao focar a janela. Clicar marca como lida e navega.
5. **Higiene:** limpar lidas com mais de 90 dias.

### 11.4 Contador no menu

Além do sino, o item de menu "Validações" carrega o número de **ressalvas abertas**. Motivo em [§22.8](#228-ninguém-avisado-da-ressalva): na primeira rodada real, uma ressalva ficou dias no banco sem que o admin soubesse.

Sino = eventos (some ao ler). Contador = pendências (some ao resolver). São coisas diferentes; ter os dois não é redundância.

---

## 12. Relatório e prova documental

O relatório é o **produto de compliance** do padrão — o que se anexa em ata ou entrega a auditoria externa.

**Uma linha por evento**, com:

| Coluna | Origem |
|---|---|
| Data/hora | `criado_em`, fuso local |
| Usuário | nome completo |
| E-mail | identificação inequívoca |
| Papel | rótulo do papel no momento da consulta |
| Funcionalidade | nome do catálogo |
| Etapa | Conferência (auditor) \| Aval do CFO |
| Resultado | Validado \| Com ressalva |
| Observações | o texto do auditor/CFO |
| Resposta do admin | o que foi corrigido |
| Respondido por / em | quem respondeu e quando |

**Export XLSX, duas abas:**
- `Validações` — a trilha completa, autofiltro, cabeçalho congelado
- `Resumo` — totais + carimbo de geração (data/hora)

**Acesso:** admin e CFO. **Auditor não acessa** — ele vê o próprio histórico, não o dos colegas.

> **Por que XLSX e não PDF:** o destinatário quase sempre quer filtrar, somar e recortar. PDF só serve para a versão assinada final — se for necessário, gerar a partir do XLSX no fim do ciclo, não como formato primário.

---

## 13. Telas e microtexto

Três telas. **O texto importa tanto quanto o código** — quem usa não leu esta documentação.

### 13.1 "Minhas funcionalidades" (auditor)

```
┌────────────────────────────────────────────────────────────┐
│ 📋 Minhas funcionalidades                                  │
│ Confira cada tela e registre se os dados estão corretos.   │
├────────────────────────────────────────────────────────────┤
│ COMO FUNCIONA                                              │
│  ① Abra a funcionalidade pelo menu e confira os números.   │
│  ② Use por pelo menos 2h antes de validar.                 │
│  ③ Tudo certo → "Validar". Achou erro → "Não validar" e    │
│    descreva o problema.                                    │
│  ④ Validando, a próxima é liberada no seu menu.            │
├────────────────────────────────────────────────────────────┤
│ Seu progresso              1 de 3 validadas · 33%          │
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░           │
├────────────────────────────────────────────────────────────┤
│ ✓  1. Contas a Pagar                                       │
│    ✓ Validada em 22/07 13:50                               │
├────────────────────────────────────────────────────────────┤
│ ▶  2. Recebíveis                            [AGORA]        │
│    Passo 2: conferindo · faltam ~47 min para poder validar │
│    (1º acesso 22/07 11:51)                                 │
│    ███████████░░░░░░░░░░░░░  Tempo mínimo: 2h              │
│                        [↗] [Não validar] [🕐 ~47 min]      │
├────────────────────────────────────────────────────────────┤
│ 🔒 3. Recebíveis GDF                                       │
│    Bloqueada — valide as anteriores primeiro               │
└────────────────────────────────────────────────────────────┘
```

**Detalhes que não são enfeite:**

- A contagem regressiva **anda sozinha** (re-render a cada 30s). Sem isso o usuário recarrega a página para ver se já pode — e acha que travou.
- "Não validar" fica **sempre ativo** (R6). Só "Validar" espera o relógio.
- O botão de validar mostra `~47 min` no lugar do rótulo — o usuário sabe quanto falta sem passar o mouse.
- Ressalvas próprias aparecem no card, com a resposta do admin ou `Aguardando correção do administrador`.

**Estados textuais** — sempre explícitos, nunca ambíguos:

| Situação | Texto |
|---|---|
| Validada | `✓ Validada em 22/07 13:50` |
| Bloqueada | `Bloqueada — valide as anteriores primeiro` |
| Liberada, sem acesso | `Passo 1: abra a funcionalidade para começar a contar o tempo` |
| Relógio correndo | `Passo 2: conferindo · faltam ~47 min para poder validar (1º acesso 22/07 11:51)` |
| Pronta | `Passo 3: valide, ou registre o que está errado` |

### 13.2 Diálogo de conferência

**Ao validar:**
> Ao validar, você declara que **conferiu os dados** desta tela e estão corretos. A **próxima** da sua sequência será liberada no menu.

**Ao não validar:**
> Descreva o problema encontrado. A funcionalidade **não** será validada e o administrador vê a sua observação. Quando for corrigida, você pode validar aqui mesmo.

Placeholder que ensina o nível de detalhe esperado:
> *Ex.: o total de janeiro está R$ 12 mil acima do que temos no Globus; a coluna de vencimento repete a data de emissão…*

> **Placeholder genérico produz ressalva genérica.** "Descreva o problema" devolve "está errado". O exemplo concreto devolve o número e a coluna.

### 13.3 "Validações" (CFO e admin)

Duas abas: **Situação atual** (contadores, painel de auditores, card por funcionalidade) e **Relatório** (filtros, totais, tabela, export).

Detalhes que evitam confusão:

- Botões de aval **não renderizam** quando não há validação — botão desabilitado sugere ação que não existe.
- Selo `Em conferência` ≠ `Não conferida` (só na visão do admin).
- Alerta de **ressalva posterior ao aval**.
- Cabeçalho muda por papel: o admin lê *"Conferência dos auditores, ressalvas apontadas e o aval do CFO"*; o CFO lê *"As funcionalidades já validadas pela auditoria. Dê seu aval de ciência em cada uma."*

### 13.4 Administração de usuários

- Atribuição por checkbox, com selo de validada/ressalva e o texto da ressalva ao lado
- Banner quando o usuário tem ressalva aberta: *"A trilha dele está parada até você corrigir e ele revalidar"* + link
- **Um único botão Salvar** — ver [§22.4](#224-dois-botões-de-salvar-no-mesmo-formulário)

---

## 14. Parâmetros

| Parâmetro | Escopo | Padrão | Limites |
|---|---|---|---|
| Tempo mínimo de validação (minutos) | **Global** | 120 | 1 a 10.080 (7 dias) |

**Como calibrar:**

| Situação | Sugestão |
|---|---|
| Tela simples, dado familiar | 60–120 min |
| Tela com cruzamento de fontes | 120–240 min |
| Fase de testes do próprio processo | 3–5 min (e **avise** que é teste) |
| Auditor externo, sem contexto | 240+ min |

> Tempo mínimo não é castigo — é o **piso** de atenção. Se todo mundo valida exatamente no minuto N, o número está baixo demais: ninguém está conferindo, estão esperando.

**Cache curto (≤60s) no front.** Com cache longo, o admin muda o valor e o auditor continua vendo o antigo — ver [§22.5](#225-cache-longo-em-configuração-que-muda-comportamento).

---

# Parte III — Operação e adoção

## 15. Runbook operacional

### 15.1 Preparar o ciclo (admin, uma vez)

1. **Escolher os auditores.** Duas pessoas do negócio, com autonomia de agenda. Não podem ser da TI.
2. **Definir o tempo mínimo** conforme [§14](#14-parâmetros).
3. **Montar as trilhas.** Podem ser iguais (redundância) ou complementares (cobertura). Comece pequeno: 3–4 funcionalidades por pessoa.
4. **Ligar a trilha** de cada auditor.
5. **Conversar com eles.** Cinco minutos explicando: *"não é teste de sistema, é conferência de número; se não bater, aperte Não validar e escreva o que está diferente — isso é o mais útil que você pode fazer"*.

> **O passo 5 é o que decide o sucesso.** Sem ele, o auditor acha que está sendo avaliado e valida tudo para não parecer que não entendeu.

### 15.2 Dia a dia (admin)

| Sinal | Ação |
|---|---|
| Contador âmbar no menu | Abrir Validações, ler a ressalva |
| Ressalva procede | Corrigir → responder com **o que** foi corrigido → avisar o auditor |
| Ressalva não procede (dado está certo) | Responder explicando **por que** o número é aquele. Isso é conhecimento, não discussão |
| Auditor parado há dias | Verificar se travou numa tela quebrada (ver 15.4) antes de cobrar |
| Trilha concluída | Atribuir o próximo lote |
| Ciclo de teste/treino a descartar | **Apagar validações** do auditor ([§20.11](#2011-reset-apaga-a-trilha-do-auditor)) — destrutivo, sem desfazer. **Exporte o relatório antes** se houver algo a preservar |

### 15.3 Dia a dia (CFO)

| Sinal | Ação |
|---|---|
| Notificação "X validada" | Abrir Validações, ler quem validou e as observações |
| Concorda | Dar aval, com observação se houver ressalva de forma |
| Discorda | Devolver com ressalva descrevendo o ponto |
| Alerta de ressalva posterior ao aval | Reavaliar — o dado mudou depois da sua ciência |

### 15.4 Diagnóstico

| Sintoma | Causa provável | Verificação |
|---|---|---|
| "Não aparece o botão de validar" | Relógio não começou (não abriu a tela) ou ainda correndo | `progresso_funcionalidades` do usuário |
| "Validei mas não liberou a próxima" | Não há próxima (trilha concluída) ou a seguinte não está atribuída | `funcionalidades_atribuidas` |
| "A tela abre com blocos vazios" | Mapa API→funcionalidade incompleto ([§10.2](#102-o-mapa-de-api-para-funcionalidade-é-nn)) | Console do browser: 403 em qual rota |
| "O CFO não vê nada" | Nenhum auditor validou ainda — correto por desenho | consolidado do admin |
| "Mudei o tempo e não aplicou" | Cache do front | recarregar; se persistir, ver [§22.5](#225-cache-longo-em-configuração-que-muda-comportamento) |
| "Usuário travado numa etapa" | Chave fora do catálogo (passo fantasma) | `funcionalidades_atribuidas` vs. catálogo — [§26.4](#264-chaves-fora-do-catálogo) |
| "Validou rápido demais" | R3 não implementada | [§26.3](#263-validações-suspeitas-tempo-real-de-análise) |

### 15.5 Fechamento do ciclo

1. Conferir que toda funcionalidade tem ao menos uma validação
2. Conferir que não há ressalva aberta sem resposta
3. Conferir que o CFO avalizou o que precisa de aval
4. **Exportar o relatório** e arquivar com a data
5. Registrar em ata: período, participantes, totais, pendências assumidas

> O relatório exportado **é** o produto. Se o ciclo terminou e ninguém exportou nada, o processo aconteceu mas não ficou provado.

---

## 16. Métricas de saúde do processo

Não bastam os totais. Estas quatro dizem se o processo está **funcionando** ou só **acontecendo**:

| Métrica | Como calcular | Leitura |
|---|---|---|
| **Tempo real de análise** | mediana de `criado_em − primeiro_acesso_em` nas validações | Se ≈ o mínimo configurado, o piso está baixo demais — estão esperando, não conferindo |
| **Taxa de ressalva** | ressalvas ÷ conferências | **0% é sinal ruim**, não bom: ninguém acha nada em sistema novo. Esperado: 15–40% na 1ª rodada |
| **Tempo de resposta à ressalva** | mediana de `respondido_em − criado_em` | Acima de 5 dias úteis, o auditor desiste de apontar |
| **Cobertura** | funcionalidades com ≥1 validação ÷ catálogo | O denominador é o catálogo inteiro, não o atribuído |

Queries em [§26](#26-consultas-úteis).

> **Taxa de ressalva zero merece investigação.** Ou o sistema está impecável (improvável na primeira rodada), ou o auditor não está conferindo, ou a UI está dificultando reportar. As três hipóteses valem uma conversa.

---

## 17. Modelo de ameaças

O padrão produz **prova documental**. Prova que pode ser burlada não é prova. O que ele precisa resistir:

| Ameaça | Vetor | Defesa |
|---|---|---|
| **Validação em massa** | Disparar o relógio de tudo e validar em sequência | R3 — só a liberada inicia o relógio |
| **Reset do relógio** | Desatribuir e reatribuir para zerar a espera | R11 — limpa validação **e** relógio |
| **Validação por terceiro** | Admin validar no lugar do auditor | Nenhum endpoint aceita validar em nome de outro; `usuario_id` vem sempre do token |
| **Adulteração do histórico** | UPDATE/DELETE em registro antigo | Append-only por desenho; só `resposta_admin` sofre UPDATE. Reforçar com permissão de banco se o risco justificar |
| **Apagamento de prova via reset** | Admin resetar auditor para sumir com ressalvas incômodas | O reset é destrutivo **por decisão** ([§20.11](#2011-reset-apaga-a-trilha-do-auditor)), mas o **ato** fica em `audit.acesso_dados` com o resumo do que caiu. Controle final é organizacional: quem pode resetar |
| **Ressalva vazia** | Reprovar sem dizer nada, para "cumprir tabela" | R4 na API **e** em constraint |
| **Acesso por URL direta** | Digitar a rota de funcionalidade bloqueada | Camada 3 ([§10](#10-controle-de-acesso-em-três-camadas)) — o guarda de rota sozinho não basta |
| **Carga de dados por quem confere** | Auditor disparar sync e sobrescrever a base durante a conferência | Guard estrito `requireAdmin` nas rotas de sincronismo ([§10.3](#103-cuidado-o-grant-da-trilha-vaza-para-ações-de-infraestrutura)) — `requireRole('admin')` NÃO basta |
| **Token velho com acesso revogado** | Continuar usando JWT emitido antes da revogação | Lookup fresco no banco a cada request |
| **Aval sem conferência** | CFO avalizar tudo no primeiro dia | R7 |

**Não coberto** (assumido como fora de escopo):
- Auditor que confere de verdade e valida errado — nenhum sistema resolve; é por isso que existe o segundo nível (aval).
- Conluio entre auditor e admin — mitigado só por separação organizacional.
- Acesso direto ao banco por quem tem credencial de escrita — problema de infraestrutura, não do padrão.

---

## 18. Como portar para outro sistema

### 18.1 Checklist de implementação

**Fase 1 — Fundação**
- [ ] Definir o **catálogo** ordenado (chave, nome, grupo) em código compartilhado — critérios em [§8.1](#81-o-catálogo)
- [ ] Implementar `funcionalidadesLiberadas` e `proximaAValidar` puras, com os casos-limite testados
- [ ] Criar a tabela append-only com as **3 constraints**
- [ ] Adicionar o espelho no usuário (4 campos)

**Fase 2 — Ciclo do auditor**
- [ ] `registrar-acesso` idempotente, **respeitando R3**
- [ ] `conferir` com as 6 validações na ordem, mensagens com números
- [ ] Gravação transacional trilha + espelho (R12)
- [ ] Tela da trilha com estado explícito e contagem regressiva viva

**Fase 3 — Ciclo do CFO e do admin**
- [ ] Consolidado com escopo por papel
- [ ] `aval` com a trava de R7
- [ ] `responder` ressalva
- [ ] Tela de validações com as duas abas

**Fase 4 — Acesso**
- [ ] Levantar o mapa API → funcionalidade **N:N** (extraia, não adivinhe — comando em [§10.2](#102-o-mapa-de-api-para-funcionalidade-é-nn))
- [ ] Menu e guarda de rota consumindo a **mesma** função
- [ ] Autorização no servidor, lookup fresco

**Fase 5 — Visibilidade**
- [ ] Notificações com a matriz de [§11.1](#111-matriz-de-destinatários)
- [ ] Contador de ressalvas abertas no menu
- [ ] Relatório com filtros + export

**Fase 6 — Antes de liberar**
- [ ] Rodar os [testes de aceitação](#23-testes-de-aceitação)
- [ ] **Percorrer cada tela da trilha logado como auditor de verdade** — não como admin
- [ ] Validar o processo com um usuário real antes de abrir para os dois

> **Não pule a Fase 4.** É a que dá mais trabalho e a que, se malfeita, faz os auditores reprovarem telas boas.
>
> **Não pule o segundo item da Fase 6.** Admin não sofre restrição — testar como admin não testa nada.

### 18.2 Adaptação a outras stacks

O padrão não depende de Node, Fastify ou React. O que precisa existir em qualquer stack:

| Elemento | Requisito | Equivalentes |
|---|---|---|
| Catálogo compartilhado | Mesma lista e mesma ordem em back e front | módulo comum, código gerado, ou endpoint que serve o catálogo |
| Funções puras | Mesma lógica nos dois lados | duplicar **com teste que compara as duas** |
| Transação | INSERT + UPDATE atômicos | qualquer ORM/driver com transação |
| Autorização por request | Lookup fresco no banco | middleware/filter/interceptor |
| Notificação assíncrona | Não derrubar a mutação | try/catch, ou fila se o volume justificar |

**Se back e front não puderem compartilhar código** (linguagens diferentes): sirva o catálogo por endpoint e mantenha as funções puras **só no backend**, com o front recebendo `funcionalidadesLiberadas` já calculada. Nunca reimplemente a regra de ordenação nos dois lados sem teste cruzado.

### 18.3 Variações legítimas

Adaptações que **não** quebram o padrão:

| Variação | Quando faz sentido |
|---|---|
| Um só nível (sem aval) | Time pequeno, sem exigência de aceite formal |
| Três níveis (auditor → gerente → diretor) | Governança mais pesada; a mecânica do aval se repete |
| Tempo mínimo por funcionalidade | Telas com complexidade muito desigual |
| Trilha por área em vez de sequência única | Sistema muito grande, com áreas independentes |
| Validação com prazo (SLA por etapa) | Quando o ciclo precisa terminar em data fixa |

O que **não** pode mudar sem descaracterizar: as 12 regras invariantes.

---

## 19. Adoção em sistema já em produção

Introduzir o padrão num sistema que já está no ar exige cuidado extra — os usuários já têm acesso, e tirar acesso gera atrito.

### 19.1 O erro a evitar

**Não ligue a trilha para quem já usa o sistema no dia a dia.** Restringir o menu de quem trabalha ali é sabotar a operação para cumprir processo.

### 19.2 Sequência recomendada

1. **Implemente tudo, mantendo a trilha desligada.** Ninguém percebe.
2. **Crie usuários dedicados de conferência** para os auditores — separados das contas de trabalho, se eles também operam o sistema.
3. **Rode um ciclo-piloto** com uma pessoa e 2–3 funcionalidades, tempo mínimo baixo (3–5 min), só para exercitar o fluxo. Descarte os registros depois, ou marque como piloto.
4. **Corrija o que o piloto revelar** — tipicamente o mapa N:N e microtexto confuso.
5. **Suba o tempo mínimo** para o valor real.
6. **Abra para os dois auditores**, com as trilhas definitivas.

### 19.3 Backfill de histórico

Se já houver algum registro informal de validação (planilha, e-mail, coluna antiga), vale migrar para a trilha:

```sql
INSERT INTO audit.validacao_funcionalidade
  (usuario_id, funcionalidade, tipo, status, observacoes, primeiro_acesso_em, criado_em)
SELECT u.id, p.key, 'conferencia', 'validado',
       NULLIF(p.value->>'justificativa', ''),
       (p.value->>'primeiroAcessoEm')::timestamptz,
       COALESCE((p.value->>'validadoEm')::timestamptz, now())
FROM   identity.usuarios u
CROSS JOIN LATERAL jsonb_each(u.progresso_funcionalidades) AS p(key, value)
WHERE  p.value->>'validadoEm' IS NOT NULL
  AND  NOT EXISTS (SELECT 1 FROM audit.validacao_funcionalidade v
                   WHERE v.usuario_id = u.id AND v.funcionalidade = p.key
                     AND v.tipo = 'conferencia');
```

> Backfill **sempre** com `NOT EXISTS` — migration que roda duas vezes não pode duplicar prova documental.

---

# Parte IV — Referência

## 20. Decisões e porquês

Formato ADR resumido: decisão · alternativa considerada · motivo.

### 20.1 Append-only em vez de coluna de status
**Alternativa:** uma linha por (usuário, funcionalidade), atualizada a cada ação.
**Motivo:** a prova exige o histórico — quantas vezes reprovou, o que foi dito em cada rodada, quanto tempo entre ressalva e correção. Update destrutivo perde tudo isso.

### 20.2 Espelho de estado no usuário
**Alternativa:** derivar tudo da trilha a cada request.
**Motivo:** menu e autorização rodam em toda requisição. Duplicação controlada (mesma transação, trilha como fonte da verdade) em troca de latência.

### 20.3 Catálogo em código, não em tabela
**Alternativa:** tabela administrável pela UI.
**Motivo:** a chave é a rota — mudar exige deploy de qualquer jeito. Tabela daria ilusão de configurável e permitiria chave órfã (R10).

### 20.4 Tempo mínimo global
**Alternativa:** por funcionalidade.
**Motivo:** começar simples. A estrutura aceita a evolução; a operação, no início, não precisa.

### 20.5 Ressalva não trava a trilha
**Alternativa:** travar até o admin responder.
**Motivo:** exigiria destrave manual — burocracia que ninguém mantém. O auditor volta quando quiser.

### 20.6 Aval por funcionalidade, não por auditor
**Alternativa:** o CFO avaliza a validação de cada auditor separadamente.
**Motivo:** o aval é sobre o dado, não sobre a pessoa. Com dois auditores, dobraria o trabalho sem ganho.

### 20.7 CFO não vê trabalho em andamento
**Alternativa:** mostrar também o que está em conferência.
**Motivo:** decisão do negócio — o CFO avaliza o conferido; acompanhar andamento é papel do admin. *(Foi implementado dos dois jeitos; o cliente escolheu este.)*

### 20.8 Notificação com ator denormalizado
**Alternativa:** join com a tabela de usuários.
**Motivo:** o histórico não pode mudar retroativamente se alguém editar o cadastro.

### 20.9 Cascade no autor do registro
**Alternativa:** `SET NULL` + nome/e-mail denormalizados na trilha.
**Motivo:** simplicidade, e o cadastro de usuário aqui não é removido na prática (desativa-se).
**Atenção:** se a política de retenção exigir preservar a prova mesmo após exclusão do usuário, **troque para `SET NULL` e denormalize** — como já é feito nas notificações. Decisão a revisitar antes de usar em contexto com exigência legal de retenção.

### 20.10 Dashboard fora do catálogo
**Alternativa:** incluir e validar como as demais.
**Motivo:** é a porta de entrada; restringi-la deixa o usuário sem lugar para cair. Além disso, agrega dados de telas ainda não validadas — validá-lo primeiro seria validar no escuro.

---

### 20.11 Reset apaga a trilha do auditor
**Alternativa A (implementada primeiro):** o reset zerava só o espelho, preservando a trilha append-only.
**Problema:** produzia estado incoerente — a trilha do auditor recomeçava do zero, mas a tela de Validações continuava exibindo as validações antigas e os avais em cima delas. O admin lia "resetado" e via os dados intactos.
**Alternativa B (descartada):** marcar os registros como anulados (soft delete), sumindo da situação atual mas ficando no relatório.
**Decisão:** o reset **apaga de verdade** — conferências do usuário, avais que ficarem órfãos, notificações do ciclo e o espelho, tudo numa transação.
**Motivo:** o reset existe para descartar um ciclo que não vale (teste, treino, auditor trocado). Guardar prova de uma conferência que a empresa decidiu invalidar polui o relatório justamente onde ele precisa ser limpo. Soft delete resolveria, ao custo de filtro em toda consulta e do risco de alguém esquecer o filtro — pior compromisso.
**Contrapartida aceita:** o histórico daquele auditor se perde. Por isso:
- o **ato do reset** é registrado em `audit.acesso_dados` com o resumo do que foi apagado (quantas conferências, quais funcionalidades, quais avais caíram) — apagar sem deixar rastro do apagamento seria pior que não apagar;
- a UI confirma com a lista explícita do que será removido e avisa que não há como desfazer;
- **exportar o relatório antes** de resetar, se o ciclo tiver valor documental ([§15.5](#155-fechamento-do-ciclo)).

**Avais órfãos:** se a funcionalidade ficar sem nenhuma validação vigente, o aval do CFO sobre ela também é removido — "Avalizada pelo CFO" sobre algo que ninguém validou é estado impossível, e R7 proíbe criá-lo.

**O reset NÃO desatribui.** A trilha continua montada; o auditor recomeça do primeiro passo.

---

## 21. Anti-padrões

O que **não** fazer, e por quê.

### 21.1 Deixar o admin validar
Sob pressão de prazo, alguém valida tudo numa tarde. A prova documental passa a atestar uma conferência que não houve — pior do que não ter processo.

### 21.2 Botão "pular esta etapa"
Existe para o caso excepcional e vira o caminho normal em duas semanas. Se uma funcionalidade não deve ser conferida, tire-a da trilha — não crie escape.

### 21.3 Status agregado em coluna
Desincroniza sempre. Derive dos registros.

### 21.4 Notificar todo mundo de tudo
Sino que apita a cada evento é sino silenciado no terceiro dia. A matriz de destinatários é curta de propósito.

### 21.5 Tempo mínimo alto demais no começo
Piso de 8h na primeira rodada mata o processo: o auditor abre, espera, esquece, e volta na semana seguinte. Comece em 1–2h e ajuste com a métrica de tempo real ([§16](#16-métricas-de-saúde-do-processo)).

### 21.6 Trilha longa demais
12 funcionalidades de uma vez desanima. Atribua 3–4, e o próximo lote quando concluir.

### 21.7 Reaproveitar a trilha como controle de permissão definitivo
A trilha é temporária — termina quando o ciclo termina. Permissão permanente é papel/perfil. Misturar os dois deixa o usuário preso à mecânica de conferência para sempre.

### 21.8 Validar em ambiente de homologação
Dado de homologação não é o dado que o auditor conhece. Ele não tem como dizer se bate. Conferência é em produção, com dado real — por isso a trilha restringe acesso em vez de criar ambiente paralelo.

---

## 22. Armadilhas conhecidas

Erros **reais** cometidos na primeira implementação. Formato: sintoma · causa · correção.

### 22.1 O relógio disparado para tudo de uma vez
**Sintoma:** auditor valida a trilha inteira em sequência, minutos depois de entrar pela primeira vez.
**Causa:** `registrar-acesso` aceitando qualquer funcionalidade **atribuída** em vez de **liberada**.
**Correção:** R3. **A falha mais fácil de deixar passar** — o endpoint parece inofensivo.

### 22.2 Desatribuir sem limpar o relógio
**Sintoma:** funcionalidade remarcada fica validável na hora.
**Causa:** limpar só `funcionalidades_validadas`, deixando `primeiroAcessoEm` vivo.
**Correção:** R11.

### 22.3 Mapa API 1:1
**Sintoma:** auditor reprova tela boa porque um bloco veio vazio.
**Causa:** assumir uma API por tela.
**Correção:** [§10.2](#102-o-mapa-de-api-para-funcionalidade-é-nn). Extraia o mapa do código, não da memória.

### 22.4 Dois botões de salvar no mesmo formulário
**Sintoma:** o admin ajusta o tempo mínimo, salva, e o valor não muda no banco.
**Causa:** um "Salvar tempo" no meio e um "Salvar" no rodapé; o do rodapé ignorava o campo.
**Correção:** um formulário, um botão. Se um campo tem escopo diferente (global vs. do usuário), **diga isso no texto** — não crie um segundo botão. Sinalize alteração pendente (`alterado de 120 — clique em Salvar`).

### 22.5 Cache longo em configuração que muda comportamento
**Sintoma:** admin muda o tempo para 3 min; o auditor continua vendo "faltam 2h".
**Causa:** endpoint de configuração com cache de 10 minutos no front.
**Correção:** cache ≤60s + refetch ao focar a janela, para configuração que a UI exibe como regra.

### 22.6 Chave fora do catálogo na trilha
**Sintoma:** usuário travado numa etapa que não existe; "1 de 4" que nunca vira "2 de 4".
**Causa:** atribuir uma rota fora do catálogo (no caso real: o painel inicial).
**Correção:** R10 + migration de limpeza do que já existe ([§26.4](#264-chaves-fora-do-catálogo)).

### 22.7 Botão desabilitado onde a ação não existe
**Sintoma:** CFO clica em "Dar aval" cinza e não entende por que nada acontece.
**Causa:** renderizar desabilitado em vez de esconder.
**Correção:** não renderizar. Se precisar explicar a ausência, use texto (`A auditoria está analisando esta tela`).

### 22.8 Ninguém avisado da ressalva
**Sintoma:** ressalva corretamente gravada no banco; o administrador não descobriu.
**Causa:** nenhum aviso — a informação existia só em uma tela que ele não abriu.
**Correção:** notificação + contador no menu. **A primeira rodada real terminou assim.** Sem aviso, a ressalva morre no banco e o auditor conclui que reportar não adianta.

### 22.9 Validar com o próprio usuário admin
**Sintoma:** "testei tudo e funciona", e na primeira sessão real a tela abre quebrada.
**Causa:** admin não sofre restrição; testar como admin não exercita a trilha.
**Correção:** teste sempre com usuário auditor real, e percorra a trilha inteira.

---

## 23. Testes de aceitação

Rodar com usuários temporários, criados e apagados pelo próprio teste. **Nunca testar com os usuários reais** — vira registro falso na prova documental.

### 23.1 Cenários

**Trilha e relógio**
1. Registrar acesso a funcionalidade **não liberada** → nada gravado *(R3)*
2. Validar antes do tempo → 400 **com os minutos restantes** *(R2)*
3. Validar depois do tempo → 200 **e a próxima liberada** *(R1)*
4. Validar fora de ordem → 400 *(R1)*

**Ressalva**
5. Reprovar sem texto, e com 5 caracteres → 400 nos dois *(R4)*
6. Reprovar com texto válido → 200, **trilha não avança** *(R5)*
7. Reprovar **sem** ter cumprido o tempo → 200 *(R6)*
8. Admin responde → o auditor enxerga a resposta no próprio histórico

**Aval**
9. CFO avaliza sem validação prévia → 400 *(R7)*
10. CFO avaliza depois da validação → 200
11. CFO devolve → trilha do auditor intacta *(R8)*
12. CFO vê apenas o escopo do papel; admin vê o catálogo inteiro

**Acesso**
13. Auditor com a tela liberada **não** toma 403 nas APIs cruzadas dela
14. Auditor toma 403 em API de funcionalidade não liberada
15. URL digitada na mão para rota fora do escopo → redireciona

**Notificações**
16. Cada evento chega **exatamente** aos destinatários da matriz
17. O autor não recebe notificação do próprio ato *(R9)*
18. Marcar uma reduz o contador em 1; marcar todas zera

**Relatório**
19. Cada linha traz nome, e-mail, data/hora e funcionalidade preenchidos
20. Cada filtro devolve só o que casa
21. Export responde 200, com content-type de planilha e arquivo válido (assinatura `PK`)
22. Auditor recebe 403 no relatório

**Integridade**
23. Atribuir chave fora do catálogo → 400 *(R10)*
24. Desatribuir e reatribuir → relógio e validação zerados *(R11)*
25. Apagar usuário → registros e notificações somem junto (cascade)

### 23.2 Esqueleto do teste

```ts
// Cria usuários temporários, exercita o ciclo pela camada HTTP, apaga tudo.
const auditor = await criarUsuarioTemporario({
  role: 'auditor', liberacaoProgressiva: true,
  funcionalidadesAtribuidas: ['/contas-pagar', '/contas-receber'],
});

// R3 — relógio só na liberada
await post('/api/users/me/registrar-acesso', auditor, { chave: '/contas-receber' }); // bloqueada
await post('/api/users/me/registrar-acesso', auditor, { chave: '/contas-pagar' });   // liberada
const u = await recarregar(auditor);
checar('1º acesso só na liberada',
  !!u.progressoFuncionalidades['/contas-pagar'] && !u.progressoFuncionalidades['/contas-receber']);

// R2 — validar cedo é barrado
checar('validação precoce recusada',
  (await post('/api/validacoes/conferir', auditor, { chave: '/contas-pagar', status: 'validado' })).statusCode === 400);

// Envelhecer o relógio em vez de esperar de verdade
await atualizarProgresso(auditor, '/contas-pagar', { primeiroAcessoEm: haDias(30) });

// R1 — validar libera a próxima
const r = await post('/api/validacoes/conferir', auditor, { chave: '/contas-pagar', status: 'validado' });
checar('próxima liberada', r.json().funcionalidadesLiberadas.includes('/contas-receber'));

await apagar(auditor);   // cascade limpa registros e notificações
```

> **Envelhecer o relógio no banco** é a única forma prática de testar R2/R6 — não coloque `sleep` de 2 horas na suíte, e não reduza o parâmetro global para testar (isso muda o comportamento em produção).

---

## 24. Perguntas frequentes

**Por que o admin não pode validar?**
Porque ele é quem corrige. Quem corrige e confere o próprio conserto não está conferindo. Ver [§21.1](#211-deixar-o-admin-validar).

**E se o auditor sair da empresa no meio do ciclo?**
Os registros dele permanecem (é prova). Atribua as funcionalidades restantes a outro auditor; a trilha do novo começa do zero nelas — e isso é correto: ele não conferiu. **Não use o reset nesse caso**: ele apagaria a conferência legítima já feita.

**Qual a diferença entre "apagar validações" e desatribuir uma funcionalidade?**
Desatribuir tira a funcionalidade da trilha e limpa a validação **dela** (R11). O reset apaga a participação **inteira** do auditor no ciclo — conferências, avais órfãos e notificações — mantendo as atribuições. Use desatribuir para ajustar escopo; reset só para descartar um ciclo que não vale.

**Dois auditores validaram a mesma tela com opiniões diferentes. E agora?**
A funcionalidade conta como validada (alguém validou) **e** com ressalva aberta (alguém reprovou). Os dois fatos aparecem. O admin trata a ressalva; o CFO decide se avaliza antes ou depois.

**O CFO pode avalizar antes de o segundo auditor terminar?**
Pode. Se o segundo reprovar depois, a tela sinaliza "ressalva posterior ao aval" e ele reavalia.

**Posso usar o padrão só para treinamento?**
Pode, mas ajuste o discurso — se o objetivo é ensinar, "validar" vira "concluí o treinamento" e o valor probatório se perde. Não misture os dois numa mesma rodada.

**Quanto tempo dura um ciclo?**
Na referência: 12 funcionalidades, 2 auditores, tempo mínimo de 2h, trilhas de 3–4 por lote. Estimativa realista de 3 a 6 semanas, dominada pelo tempo de correção das ressalvas — não pelo tempo de conferência.

**O que fazer com funcionalidade que ninguém sabe conferir?**
Não atribua. Registre explicitamente que ela ficou fora do ciclo e por quê. Melhor uma lacuna declarada do que uma validação vazia.

**Vale a pena para um sistema pequeno?**
As regras R1–R4 e o registro append-only valem sempre. Aval do CFO, notificações e relatório podem esperar. Comece pelo núcleo.

---

## 25. Mapa de arquivos (implementação de referência)

Stack: Node 20 · Fastify · TypeBox · TypeORM · PostgreSQL · Next.js 15 · TanStack Query.

### Compartilhado (`packages/shared/src/`)
| Arquivo | Conteúdo |
|---|---|
| `enums/funcionalidades.ts` | catálogo ordenado + `funcionalidadesLiberadas` + `proximaAValidar` |
| `enums/validacao.ts` | tipos, status, rótulos, `OBSERVACOES_MIN` |
| `enums/notificacao.ts` | tipos de evento, rótulos, tom |
| `schemas/validacoes.ts` | contratos do ciclo e do relatório |
| `schemas/notificacoes.ts` | contratos das notificações |
| `schemas/auth.ts` | payload de sessão, incl. espelho do CFO |

### Backend (`apps/FinancasBackend/src/`)
| Arquivo | Conteúdo |
|---|---|
| `entities/validacao-funcionalidade.entity.ts` | trilha append-only |
| `entities/notificacao.entity.ts` | notificações |
| `modules/validacoes/validacoes.service.ts` | ciclo, consolidado, relatório, export |
| `modules/validacoes/validacoes.routes.ts` | rotas e autorização |
| `modules/notificacoes/notificacoes.service.ts` | matriz de destinatários e textos |
| `modules/notificacoes/notificacoes.routes.ts` | listar e marcar lidas |
| `modules/users/users.service.ts` | atribuição, relógio (R3/R10/R11), reset |
| `modules/auth/auth.service.ts` | espelho do CFO no payload de sessão |
| `plugins/auth.ts` | mapa API → funcionalidade **N:N** |
| `migrations/…58000` | tabela da trilha + backfill |
| `migrations/…59000` | limpeza de chaves fora do catálogo |
| `migrations/…60000` | tabela de notificações |

### Frontend (`apps/FinancasFrontend/src/`)
| Arquivo | Conteúdo |
|---|---|
| `app/(private)/minhas-funcionalidades/page.tsx` | trilha do auditor |
| `app/(private)/validacoes/page.tsx` | situação atual (CFO/admin) |
| `app/(private)/validacoes/_components/RelatorioValidacoes.tsx` | relatório + export |
| `app/(private)/admin/usuarios/page.tsx` | atribuição e parâmetro |
| `components/layout/navigation.ts` | `restricaoDoUsuario` — **fonte única** do menu e do guarda |
| `components/layout/Notificacoes.tsx` | sininho |
| `components/layout/Sidebar.tsx` · `AppHeader.tsx` | contador de ressalvas |
| `app/(private)/layout.tsx` | guarda de rota |
| `hooks/useRessalvasAbertas.ts` | contador no menu |

---

## 26. Consultas úteis

### 26.1 Situação consolidada por funcionalidade

```sql
WITH ultimo AS (
  SELECT DISTINCT ON (usuario_id, funcionalidade, tipo)
         usuario_id, funcionalidade, tipo, status, observacoes, resposta_admin, criado_em
  FROM   audit.validacao_funcionalidade
  ORDER BY usuario_id, funcionalidade, tipo, criado_em DESC
)
SELECT funcionalidade,
       COUNT(*) FILTER (WHERE tipo='conferencia' AND status='validado')  AS validacoes,
       COUNT(*) FILTER (WHERE tipo='conferencia' AND status='reprovado') AS ressalvas,
       COUNT(*) FILTER (WHERE tipo='conferencia' AND status='reprovado'
                          AND resposta_admin IS NULL)                    AS ressalvas_abertas,
       BOOL_OR(tipo='aval' AND status='validado')                        AS avalizada
FROM   ultimo
GROUP BY funcionalidade
ORDER BY funcionalidade;
```

### 26.2 Ressalvas abertas (o que o admin precisa resolver)

```sql
SELECT u.nome_completo, u.email, v.funcionalidade, v.observacoes,
       v.criado_em, now() - v.criado_em AS aberta_ha
FROM   audit.validacao_funcionalidade v
JOIN   identity.usuarios u ON u.id = v.usuario_id
WHERE  v.tipo = 'conferencia' AND v.status = 'reprovado' AND v.resposta_admin IS NULL
ORDER BY v.criado_em;
```

### 26.3 Validações suspeitas (tempo real de análise)

```sql
SELECT u.nome_completo, v.funcionalidade,
       v.primeiro_acesso_em, v.criado_em,
       EXTRACT(EPOCH FROM (v.criado_em - v.primeiro_acesso_em))/60 AS minutos_analise
FROM   audit.validacao_funcionalidade v
JOIN   identity.usuarios u ON u.id = v.usuario_id
WHERE  v.tipo = 'conferencia' AND v.status = 'validado'
ORDER BY minutos_analise;   -- as menores primeiro: validou no limite do permitido?
```

### 26.4 Chaves fora do catálogo

```sql
-- Trocar a lista pelo catálogo vigente
SELECT u.nome_completo, c AS chave_invalida
FROM   identity.usuarios u,
       unnest(u.funcionalidades_atribuidas) AS c
WHERE  c NOT IN ('/contas-pagar','/contas-receber','/recebiveis-gdf','/conciliacao',
                 '/folha','/folha-detalhe','/tributos','/depreciacao',
                 '/fluxo-caixa','/orcamento','/dre','/painel-cfo');
```

### 26.5 Reconciliar espelho com a trilha

Detecta divergência entre `funcionalidades_validadas` (espelho) e a trilha (verdade):

```sql
WITH trilha AS (
  SELECT DISTINCT ON (usuario_id, funcionalidade)
         usuario_id, funcionalidade, status
  FROM   audit.validacao_funcionalidade
  WHERE  tipo = 'conferencia'
  ORDER BY usuario_id, funcionalidade, criado_em DESC
)
SELECT u.nome_completo,
       ARRAY(SELECT t.funcionalidade::text FROM trilha t
             WHERE t.usuario_id = u.id AND t.status = 'validado' ORDER BY 1) AS pela_trilha,
       ARRAY(SELECT x FROM unnest(u.funcionalidades_validadas) AS x ORDER BY 1) AS pelo_espelho
FROM   identity.usuarios u
WHERE  u.liberacao_progressiva
  -- `funcionalidade` é varchar e o espelho é text[]: o ::text evita
  -- "operator does not exist: character varying[] = text[]"
  AND  ARRAY(SELECT t.funcionalidade::text FROM trilha t
             WHERE t.usuario_id = u.id AND t.status = 'validado' ORDER BY 1)
       IS DISTINCT FROM
       ARRAY(SELECT x FROM unnest(u.funcionalidades_validadas) AS x ORDER BY 1);
```

Resultado vazio = espelho íntegro. Linha retornada = investigar (R12 violada em algum caminho).

### 26.6 Métricas de saúde

```sql
-- Tempo real de análise (mediana) e taxa de ressalva
SELECT
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (criado_em - primeiro_acesso_em))/60
  ) FILTER (WHERE tipo='conferencia' AND status='validado')      AS mediana_min_analise,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status='reprovado')
        / NULLIF(COUNT(*) FILTER (WHERE tipo='conferencia'), 0), 1) AS taxa_ressalva_pct,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (respondido_em - criado_em))/3600
  ) FILTER (WHERE respondido_em IS NOT NULL)                     AS mediana_h_resposta
FROM audit.validacao_funcionalidade;
```

---

## Histórico

| Data | O quê |
|---|---|
| 2026-07-22 | Primeira implementação completa no Sistema Financeiro v2 · notificações e relatório · documento inicial |
| 2026-07-22 | Expansão: fluxos passo a passo, runbook, métricas de saúde, modelo de ameaças, anti-padrões, FAQ, consultas úteis |

---

**Manutenção deste documento:** ao alterar uma regra invariante ([§6](#6-regras-invariantes)) ou a matriz de destinatários ([§11.1](#111-matriz-de-destinatários)), atualizar aqui **junto com** o código, no mesmo commit. Documento que descreve o padrão errado é pior que documento nenhum.
