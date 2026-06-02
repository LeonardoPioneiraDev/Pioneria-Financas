# Roteiro de Demo — Sprint 04 Validação

> Use este documento durante a reunião com o financeiro. Tempo total estimado: **30-45 min**.

## Antes da reunião (checklist)

- [ ] Backend `pnpm dev` rodando
- [ ] Sync de CR + CP feito recentemente (clicar "Sincronizar" antes da reunião)
- [ ] Sync de Recebíveis GDF feito (clicar "Sincronizar BRB")
- [ ] Tela em zoom 100% (não 125% — pode esconder elementos)
- [ ] Aba do navegador maximizada
- [ ] **Template de feedback aberto em outra aba/tela** (ver `sprint-04-template-feedback.md`)
- [ ] Quem chamar: idealmente **CFO + controller + 1 analista** (perspectivas diferentes)
- [ ] Se possível: gravar a reunião (Teams/Meet record) pra revisar depois

## Abertura — 3 min

**Diga (não leia):**

> "Pessoal, nas últimas semanas eu construí 2 módulos novos do sistema financeiro: Recebíveis GDF e Fluxo de Caixa. Antes de continuar construindo mais coisa, quero mostrar pra vocês e perguntar 4 coisas em cada módulo:
>
> 1. **Isso faz sentido?** (o que você está vendo bate com sua realidade)
> 2. **Tem algum número errado ou estranho?**
> 3. **O que falta pra ser útil no seu dia-a-dia?**
> 4. **O que vocês já fazem hoje que pode parar de fazer com isso?**
>
> Vou abrir cada módulo, mostrar rápido, e abrir pra discussão. Não tem certo ou errado — quero saber o que vocês acham. Vou anotar tudo."

**Importante:** não defenda o sistema. Se reclamarem, **anote sem rebater**. Reclamação ≠ ataque pessoal.

---

## Demo 1 — Recebíveis GDF (~15 min)

**Abrir:** `/recebiveis-gdf`

### Aba Resumo (3 min)

Mostrar:
1. **Glossário inicial** ("Como funciona o pagamento da BRB")
2. **4 KPIs:** total resgatado · créditos · tempo médio · cobertura
3. **Status geral** semaforizado
4. Passar o mouse sobre 1-2 ícones (i) pra mostrar tooltips

**Pergunte:**
- "O total resgatado de R$ X.XX M bate com o que vocês veem no relatório BRB?"
- "Tempo médio de Y dias faz sentido? Era esse que vocês imaginavam?"

### Aba Glosa (5 min)

Mostrar:
1. **Card de Glosa** (Receita Técnica × Repasse Recebido)
2. Os 3 KPIs (esperado / recebido / status dias)
3. Heurística no rodapé: "CODHISTOBCO=908 + Banco 70 (BRB), Ag. 51, Conta 108"

**Pergunte:**
- "Vocês já sabiam que existe diferença entre o que a BRB diz que vai pagar e o que cai? Como conferem hoje?"
- "Essa heurística (conta 70-51-108) ainda é a única usada pra repasses BRB? Mudou alguma coisa recentemente?"
- "Que % de glosa é aceitável pra vocês? 1%? 2%? 5%?"

### Aba Velocidade (3 min)

Mostrar:
1. **Aging em 4 buckets** (0-2d, 3-5d, 6-10d, 10+d)
2. As cores (verde/amarelo/laranja/vermelho)

**Pergunte:**
- "Os números batem com a percepção de vocês? A BRB tem demorado mais ou menos do que esses números mostram?"

### Aba Mapa detalhado (3 min)

Mostrar:
1. **Matriz transp × resgate** (clique numa célula pra abrir composição por família)
2. Drill-down por família

**Pergunte:**
- "Esse drill-down (cidadão, idoso, etc.) é útil pra vocês? Ou olham só o consolidado?"
- "Tem alguma família/categoria que falta?"

### Fechamento Recebíveis GDF (1 min)

**Pergunte:**
- "De 0 a 10, quanto isso te ajudaria a economizar tempo no seu trabalho?"
- "Se eu tirasse esse módulo do ar amanhã, faria diferença pra você?"

**→ Anote as respostas no template, sem interromper.**

---

## Demo 2 — Fluxo de Caixa (~15 min)

**Abrir:** `/fluxo-caixa`

### Aviso prévio (1 min)

Antes de mostrar, diga:
> "Esse módulo não mostra saldo bancário (porque o Globus não mantém saldo atualizado). Mostra só **quanto vai entrar (CR vencendo)** × **quanto vai sair (CP vencendo)**. Funciona como uma previsão de variação, não como saldo absoluto."

### Aba Resumo (3 min)

Mostrar:
1. **Glossário inicial**
2. **4 KPIs:** A receber 30d · A pagar 30d · Diferença prevista · Dias com gap
3. **Status semaforizado** (vermelho 🚨)
4. **Bloco de inadimplência** (66% aplicado)

**Pergunte (CRÍTICO):**
- "O **A receber 30d** está R$ 0. Isso bate com a realidade? Vocês não emitem CR com antecedência? Como o GDF entra como receita pra vocês?"
- "A inadimplência de **66%** parece alta demais. Como vocês veem isso hoje? Tem 24 títulos analisados com 8 inadimplentes — esses 8 foram reais ou já foram pagos por outro canal (extrato BRB, conciliação manual)?"
- "**A pagar R$ 25.5M nos próximos 30 dias** — bate com a previsão de pagamentos de vocês?"

### Aba Projeção (5 min)

Mostrar:
1. **Gráfico** de variação acumulada
2. **Tabela dia-a-dia** com linhas vermelhas (gap)
3. Mudar horizonte: 7d → 60d → 90d (observar a curva)

**Pergunte:**
- "O horizonte mais útil pra vocês é 7d, 30d, 60d ou 90d?"
- "Vocês conseguem usar essa tela pra antecipar quando o caixa vai estourar?"
- "Falta alguma informação que vocês olham hoje em outra planilha?"

### Aba Cenários (1 min)

Mostrar:
1. **Placeholder** (em construção)

**Pergunte:**
- "Faz sentido ter 3 cenários (otimista/realista/pessimista)? Ou prefere ajustar o % de inadimplência manualmente?"

### Fechamento Fluxo de Caixa (1 min)

**Pergunte:**
- "Em qual planilha vocês fazem isso hoje?"
- "Posso ver essa planilha? (pra entender o que falta no sistema)"
- "De 0 a 10, quanto isso te ajudaria?"

---

## Demo 3 — Contas a Pagar (~10 min) — features novas Sprint 04

**Abrir:** `/contas-pagar`

Mostrar os **3 atalhos no topo** (Aprovações CFO · Remessa CNAB · Divergências de Retenção). Cada um é um MVP em validação — abrir 1 e mostrar.

### Aba "Aprovações CFO" (~3 min)

Mostrar:
1. Lista de pendentes (provavelmente vai mostrar centenas, ~1.131 títulos no banco)
2. Cards de urgência (vermelho vencido, laranja ≤3d, âmbar ≤7d)
3. Clicar em **Aprovar** → modal com senha + assinatura digital interna (SHA256)

**Descoberta CRÍTICA pra contar pra eles:**
> "Investiguei o Globus de vocês buscando quem aprova cada título. **Conclusão: o Globus NÃO grava nome de aprovador em LUGAR NENHUM**. 0% em CPGDOCTO.USUARIO_LIB_PAGTO, 0% em CPGDOCTO.USUARIO_ASS_ELETRON, 0% em BGM_NOTAFISCAL.USU_APROVADOR. Vocês têm dado a entender que aprovam, mas não fica registrado no sistema."

**Perguntar:**
- "Como vocês aprovam pagamentos hoje? É só email/conversa? Tem alguma planilha?"
- "Faria sentido usar este sistema interno de aprovação? Cada decisão fica com hash auditável + IP + timestamp."
- "Tem alçada por valor? Ex: analista até X, CFO acima de Y. Isso precisa configurar?"

### Aba "Remessa Bancária (CNAB)" (~2 min)

Mostrar:
1. Seletor de banco (8 opções FEBRABAN)
2. Lista de elegíveis (CPs status=aprovado + pagamento liberado)
3. Botão "Gerar CNAB" → download arquivo .REM

**Pergunta CHAVE:**
- "Quais bancos vocês usam pra pagamento em massa? (BB, Santander, Bradesco, Itaú, Safra...)"
- "Como geram CNAB hoje? Sistema próprio? Manual? Outro sistema?"
- "Vocês têm um arquivo CNAB de **retorno** que eu possa olhar pra implementar o parser?"
- ⚠ **Importante:** o CPGDOCTO já tem `NROREMESSAPE` e `DTREMESSAPE` — sugere que o Globus já gera CNAB. **Confirmar: vocês querem que a gente substitua a geração ou só importe os retornos pra conciliar?**

### Aba "Divergências de Retenção" (~3 min)

Mostrar:
1. Heurística Lucro Real aplicada (PIS 0.65%, COFINS 3%, CSLL 1%, IRRF 1.5% acima de R$ 1.500)
2. Lista de NFs com divergência (provavelmente muitas — Pioneira tem 709 NFs sem retenção)
3. Drill: clica num título e mostra tabela esperado×retido por imposto

**Pergunta CHAVE:**
- "Vocês ESTÃO retendo PIS/COFINS/CSLL na fonte ou não?"
- "Constatei: 100% das NFS (serviço) têm retenção. 0% das NFs comuns têm. **Isso é regime Presumido sem retenção** ou **bug na configuração do Globus**?"
- "Quem hoje confere essas retenções? Tem alguém olhando 1 a 1 ou ninguém olha?"
- "Se eu cobrir só os 80% mais comuns automaticamente, vale a pena ou precisa 100%?"

---

## Demo 4 — Contas a Receber (~5 min) — perguntas pra capturar prioridade

**Abrir:** `/contas-receber`

Mostrar:
1. Lista de CRs sincronizados (sync funcionando)
2. Filtros (período, busca, status)
3. Status de cobrança eletrônica nos títulos

**Avisar:** 3 features ainda em desenvolvimento (SFN-21, SFN-39, SFN-40 no Plane):
- Régua de cobrança automática (email/WhatsApp por dias vencidos)
- Geração de boleto/PIX via API banco
- Integração SERASA (negativação automática)

**Perguntas CHAVE pra cada uma** (capturar prioridade):

### Régua de cobrança (SFN-21)
- "Como vocês cobram inadimplente hoje? Manual? Tem planilha?"
- "Email, WhatsApp ou ambos?"
- "Quantos dias pra 1ª, 2ª, 3ª cobrança? Tom muda?"
- "Tem provedor WhatsApp Business contratado (Twilio, Zenvia, Take Blip)?"

### Boleto/PIX (SFN-39)
- "Quais bancos vocês usam pra emitir boleto/PIX hoje?"
- "Já tem contrato de API/Open Banking ativo? Qual?"
- "Volume médio de boletos/mês?"
- "Tem credencial API acessível?"
- "Aceitam 1 banco no MVP ou precisam multi-banco desde o início?"

### SERASA (SFN-40)
- "Vocês negativam clientes hoje?"
- "Quantas negativações/mês?"
- "Tem contrato SERASA / Boa Vista ativo?"
- "Critério atual pra negativar? (ex: 60 dias + 3 cobranças)"
- "Aceitam negativação automática ou só com aprovação CFO 1 a 1?"

---

## Discussão aberta (5-10 min)

**Perguntas finais:**

1. "Olhando os 4 módulos juntos (Recebíveis GDF, Fluxo de Caixa, Contas a Pagar com aprovação/CNAB/retenção, Contas a Receber com régua/boleto/SERASA), qual o **maior problema** que vocês têm hoje que o sistema **não resolve**?"
2. "Se eu tivesse 1 semana pra implementar **1 coisa** que vocês pediriam, qual seria?"
3. "Tem alguma planilha / relatório que vocês fazem manualmente e queriam parar de fazer?"
4. "Tem alguma integração externa que vocês confiam mais que o Globus? (Open Finance, conta bancária direta, parceiro contábil...)"

**→ Anote tudo. Estas respostas vão direcionar as próximas sprints.**

---

## Após a reunião

1. **Imediatamente:** preencha o `sprint-04-template-feedback.md` enquanto está fresco
2. **Em D+1:** revise as anotações e me devolve o template preenchido
3. **Aí eu:** priorizo top 3 ajustes e implemento

## Coisas a NÃO fazer durante a reunião

- ❌ **Não defenda o sistema** quando reclamarem ("mas isso é por causa de X" → corte, anote)
- ❌ **Não prometa nada** ("vou fazer isso amanhã!" — promete só depois de pensar)
- ❌ **Não mostre módulos que ainda não estão prontos** (Conciliação, Tributos, etc.) — só desfoca a discussão
- ❌ **Não fale em "tecnologia"** (não importa que stack ou banco — fala em problema/solução)
- ❌ **Não desculpe-se** ("desculpa, ainda falta X") — eles já sabem que é incompleto, foco no que tem

## Coisas a fazer

- ✅ Anotar **com palavras delas, não suas** ("eles disseram 'a inadimplência tá errada'" — não "eles confirmaram artefato Globus")
- ✅ Perguntar "**por quê?**" pelo menos 2 vezes em cada feedback negativo
- ✅ Quando alguém pedir feature, perguntar "**que problema isso resolve?**" antes de aceitar
- ✅ Se discordarem entre si (ex: CFO vs analista), anotar AMBAS as opiniões com nome
