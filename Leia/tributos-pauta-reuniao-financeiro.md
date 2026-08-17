# Tributos — Pauta da reunião com o financeiro (destrava a Fase 2)

> Objetivo: responder as 3 perguntas-chave (Q1-Q3) + 4 que surgiram na descoberta,
> pra definir escopo das 5 funcionalidades bloqueadas. Cada bloco diz **o que
> destrava**. Base: `Leia/tributos-auditoria-inicial.md` §9 e `globus-tributos-retencoes.md`.
> Duração estimada: 45-60 min. Participantes sugeridos: contador(a)/contabilidade,
> responsável fiscal, CFO.

---

## Contexto pra abrir a reunião (2 min)

Já está **no ar**: conferência de retenções na fonte (PIS/COFINS/CSLL/IRRF),
comparando o retido (Globus) com o esperado (Lucro Real), ciente do Simples
Nacional. O que falta da Fase 2 depende de decisões de vocês — daí esta reunião.

Dados que já levantamos (pra embasar as respostas):
- **INSS e ISS retidos = R$ 0 em 100% dos títulos** do Globus (validado).
- Só **2 fornecedores** marcados como Simples Nacional no cadastro.
- A Pioneira **não é** optante do Simples (porte acima do teto) → Lucro Real/Presumido.
- **34% dos pagamentos** não têm registro de liberação no Globus (ver
  `cp-workflow-liberacao-aprove-me.md`) — tema de controle, separado de tributos.
- **Conferência corrigida (06/07/2026):** a heurística só se aplica a **NF de
  serviço (NFS)** — as ~4.300 NF de mercadoria têm retenção zero *legítima* e
  antes eram marcadas como divergentes por engano. Universo real = **69 NFS**,
  das quais **17 divergências reais** — quase todas de **táxi aéreo/aviação**
  (retiveram só CSLL, ou IRRF a 1% em vez de 1,5%). Vale levar essa lista pra
  reunião: são casos concretos de retenção potencialmente a menor.

---

## Q1. Quem hoje apura PIS/COFINS (e os demais) na empresa?

Perguntar:
- É a contabilidade interna, um escritório externo, ou os dois?
- Em qual sistema a apuração é feita hoje? (planilha, sistema contábil, Globus CTB_ECF_*?)
- A Pioneira é **Lucro Real** ou **Lucro Presumido**? (muda alíquota e método)
  - *(Já confirmado no Globus em 29/05: `CTB_ECF_APUR_IRPJ_CSLL.FORMA_TRIB='R'` = Lucro Real para a empresa 4. Confirmar que segue valendo em 2026.)*
  - **Onde é feita a apuração mensal de PIS/COFINS?** No Globus ela **não existe** de forma utilizável (a ECF é anual e defasada) → provavelmente é externa/contador. Crucial saber qual sistema, pra decidir se lemos de lá ou só conferimos.

**Destrava:** funcionalidade #1 (Apuração mensal de PIS/COFINS). Se quem apura é
externo, o nosso papel vira **conferência/insumo**, não cálculo oficial.

---

## Q2. Usam algum sistema externo de gestão tributária?

Perguntar:
- Existe software fiscal (ex.: para SPED, EFD-Contribuições, ECF)? Qual?
- Esse sistema **já consome** dados do Globus, ou seria duplicação?
- Onde queremos que o SFN se encaixe: substituir, complementar ou só conferir?

**Destrava:** funcionalidade #6 (Cruzamento com SPED). Só faz sentido se há um
SPED/arquivo externo pra cruzar. Evita construir um parser que ninguém usa.

---

## Q3. Prioridade — tributos recorrentes (mensais) ou pontuais?

Perguntar:
- Quais tributos doem mais hoje (volume, risco de multa, retrabalho)?
- O que daria mais alívio: **calendário/alertas** de vencimento, **geração de
  guia** (DARF/GPS), ou **conferência/apuração**?
- Ordenar as 5 funcionalidades por prioridade real.

**Destrava:** a ordem de construção das funcionalidades #1, #4, #5.

---

## Perguntas que surgiram na descoberta (responder também)

### A. Por que INSS retido = 0 em tudo?
- A Pioneira contrata serviços com retenção de INSS (cessão de mão de obra,
  vigilância, limpeza, construção)? Se sim, a retenção é feita **fora** do Globus?
- **Destrava:** decidir se "INSS calculado" tem o que conferir ou se segue informativo.

### B. Política de ISS
- A Pioneira **retém ISS** de prestadores? Em quais casos (serviço de fora do DF)?
- Qual a alíquota por tipo de serviço no DF (2% a 5%)?
- **Destrava:** funcionalidade #2 (ISS por município). Já temos o município do
  fornecedor; falta a **tabela de alíquotas** e a **regra de quando retém**.

### C. Geração de guia — quem paga?
- A Pioneira **emite e paga** DARF/GPS, ou o contador faz?
- Se o SFN gerar, é pra pagamento direto ou só pra conferência?
- **Destrava:** funcionalidade #4 (DARF/GPS). Define se geramos arquivo pagável
  ou só um demonstrativo.

### E. INSS patronal da folha — ✅ RESPONDIDO PELOS DADOS (06/07/2026)

Não é mais pergunta aberta — o Globus confirmou. Levar como **achado** pra validar:

- **A Pioneira está em DESONERAÇÃO da folha (CPRB).** `FLP_GPS_INTEGRACPG`
  (empresa 4) traz o patronal calculado **com e sem** desoneração:
  `INSSEMPRESA_COMDESON` (real) x `INSSEMPRESA_SEMDESON`. `FLP_ALIQINSSPATRONAL`
  mostra a alíquota CPRB sobre faturamento caindo `2,0% → 1,6% (2025) → 1,2%
  (2026)` com `PERC_FOLHA` subindo `5% → 10%` = o **reencargamento gradual da Lei
  14.973/2024**.
- **A estimativa de 28,8% superestima ~2x.** Junho/2026: patronal real
  (COM_DESON) = **R$ 1.477.412,51** (12% da base) vs. **R$ 3.162.559,50**
  estimados. O SEM_DESON bate 20% exato; o COM_DESON, 12% exato.
- **Pendente de validação com vocês:** (a) confirmar que o regime CPRB segue
  vigente em 2026; (b) os ~8,8% de RAT + terceiros e a parcela CPRB sobre a
  receita entram em guias separadas — confirmar onde recolhem.
- **Fonte pronta pra ligar:** `FLP_GPS_INTEGRACPG` (retido null aqui, vem da
  ficha). Vira dado **certo** no painel assim que sincronizarmos.

### D. Calendário — fonte das datas
- Confirmar com a contabilidade os **vencimentos exatos** de cada obrigação
  (federais + ISS/DF), pra eu não cravar data errada.
- **Destrava:** deixar o calendário (referência) com datas oficiais.

---

## Matriz de decisão (preencher na reunião)

| # | Funcionalidade | Construir? | Papel do SFN (cálculo / conferência / só visual) | Prioridade |
|---|---|---|---|---|
| 1 | Apuração mensal PIS/COFINS | | | |
| 2 | ISS por município | | | |
| 4 | Geração DARF/GPS | | | |
| 5 | Calendário tributário | | | |
| 6 | Cruzamento SPED | | | |

(#3 Retenções na fonte já está no ar.)

---

## Resultado esperado da reunião

1. As 5 funcionalidades **ordenadas por prioridade**.
2. Para cada uma: **papel do SFN** (calcular x conferir x só exibir) e **fonte de dado**.
3. Respostas para A-D (INSS, ISS, guia, datas).
4. Com isso, eu fecho o **escopo e a estimativa** de cada uma e começo pela #1 da lista.
