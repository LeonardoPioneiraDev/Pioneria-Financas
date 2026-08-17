# Perguntas — Reconciliação Receita TD Max × Repasse do GDF

**Para:** equipe do sistema de bilhetagem / Receita TD Max (horarios.vpioneira.com.br) e/ou financeiro do GDF/BRB.
**De:** Sistema Financeiro — Viação Pioneira.
**Objetivo:** usar a receita da API TD Max (`/integrations/receita/passageiro-receita`) para projetar, no fluxo de caixa, o que a empresa **tem a receber do GDF**. Antes de usar, precisamos reconciliar o valor **gerado** (relatado pela API) com o valor **efetivamente repassado** (que cai no banco).

---

## Contexto

- A API TD Max retorna, por dia, **passageiros e receita à tarifa técnica** (Estações BRT × Área 2 × Total).
- Entendemos que: passageiro anda → o sistema registra → o GDF gera os valores e **paga sem glosa**, com defasagem de **até ~3 dias (D+3)**.
- Se isso fosse exato, o **total gerado** em um período longo deveria **bater** com o **total repassado** no banco (a diferença seria só ~3 dias de "cauda").

## O que observamos (dados reais, últimos 60 dias)

| Métrica | 60 dias | ~por mês |
|---|--:|--:|
| **Receita GERADA** (TD Max, tarifa técnica) | **R$ 133,72 milhões** | ~R$ 66,9 M |
| **Repasse RECEBIDO no banco** (histórico "RECEBIMENTO ARR/CRC/BCO", cód. 908) | **R$ 85,93 milhões** | ~R$ 43 M |
| **Diferença** (gerado − recebido) | **R$ 47,78 milhões** | ~R$ 24 M |
| **Razão** (gerado ÷ recebido) | **1,56** | |

Ou seja: **em 60 dias a empresa gerou R$ 133,7 M de tarifa técnica, mas recebeu R$ 85,9 M** de repasse. Um gap de **R$ 47,78 M** — muito maior do que um atraso de 3 dias explicaria (~R$ 6,7 M).

Já verificamos que os outros grandes créditos do extrato **não são receita** (transferência entre contas próprias, resgate de aplicação financeira, empréstimo), então o gap **não** é receita "escondida" em outro lançamento.

## Perguntas

1. **Por que o gerado (60d) é 1,56× o recebido (60d)?** As hipóteses são:
   - (a) o GDF está **parcelando / pagando com atraso** (quitando meses anteriores), acumulando um saldo a receber; ou
   - (b) a **"tarifa técnica" do relatório é um valor bruto/nominal** maior do que o valor que o GDF **efetivamente paga** por passageiro (existe um redutor/fator entre o gerado e o pago).
   Qual é o caso — ou é uma combinação?

2. **Qual é o prazo REAL de pagamento** entre o dia da viagem e o dia em que o dinheiro cai no banco? (a defasagem média em dias, e se é fixa ou variável.)

3. **O repasse do GDF chega todo por um único tipo de lançamento** ("RECEBIMENTO ARR/CRC/BCO", cód. 908), ou **parte vem por outro** (por exemplo "PAGAMENTO ELETRÔNICO", cód. 909, que somou R$ 22,4 M em 60 dias)? Precisamos saber **exatamente quais créditos do extrato são repasse do GDF**.

4. **Existe uma referência que ligue o gerado ao pago?** Ex.: um número de documento/guia (AD-xxxx / CRC) que permita casar "a receita gerada no dia X" com "o repasse que a pagou no dia Y". Isso deixaria a reconciliação automática.

5. **Se houver um fator de conversão** (gerado → pago), qual é e ele é **estável** ao longo dos meses? (para projetarmos o caixa sem superestimar.)

---

**Como vamos usar a resposta:** com o fator/lag corretos, a receita TD Max vira a base para projetar o **repasse futuro do GDF** no fluxo de caixa (substituindo a estimativa por média histórica, que hoje superprojeta), e o **"a receber do GDF já gerado"** = o que foi gerado e ainda não foi pago. Sem contar duas vezes o que já está no caixa.
