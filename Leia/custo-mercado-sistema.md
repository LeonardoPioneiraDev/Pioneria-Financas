# Quanto custaria este sistema no mercado

> Análise de ordem de grandeza — **14/08/2026**.
> Base de escopo medida em 13/08/2026 pelo gerador `relatorio:prazo`.
> Companheiro de [`relatorio-prazo-desenvolvimento.html`](relatorio-prazo-desenvolvimento.html)
> e da tela `/relatorio-prazo`: aquele responde *quanto tempo levou*, este responde
> *quanto custaria comprar*.

**Isto não é uma cotação.** É um custeio de ordem de grandeza feito a partir do
escopo real do sistema, com as premissas de valor-hora declaradas em cada método.

---

## 1. O que está sendo precificado

Escopo medido, não estimado — contagem direta no código e no banco:

| Item | Quantidade |
|---|---:|
| Módulos funcionais para o usuário | 17 |
| Telas | 31 |
| Módulos de API no servidor | 35 |
| Tabelas de banco de dados | 68 |
| Migrações versionadas | 67 |
| Integrações com sistemas externos | 2 |
| Linhas de código | ~70.800 |
| Linhas de documentação técnica | ~12.300 |

As duas integrações não são equivalentes entre si:

- **Globus (Oracle, legado, read-only)** — sem documentação utilizável. Boa parte do
  esforço foi descoberta: entender que `CPGDOCTO.CODSETOR` está vazio em 100% dos
  títulos, que o setor real vem de `CPGITDOC.CODCUSTOFIN`, que `QUITADO` fica "N"
  em ~38% dos pagamentos e não indica compensação bancária, que `VLR_ORIGINAL` traz
  o total do documento na 1ª parcela.
- **API `horarios.vpioneira.com.br`** — integração REST convencional.

Além disso, a fundação que raramente entra na conversa e sempre entra na fatura:
autenticação JWT com refresh, RBAC com permissões granulares por usuário, trilha de
auditoria com diff campo a campo, notificações, métricas de uso, motor de workflow,
agendador de sincronismo e exportações XLSX.

---

## 2. Método A — Fábrica de software, escopo fechado

Precificação por entregável, faixa típica do mercado brasileiro.

| Componente | Faixa |
|---|---:|
| 31 telas × R$ 8k–20k | R$ 250k – 620k |
| 2 integrações (Oracle legado tem descoberta cara) | R$ 80k – 150k |
| Fundação: auth, RBAC, auditoria, infraestrutura | R$ 100k – 150k |
| Descoberta / prova de conceito | R$ 60k – 120k |
| **Total** | **R$ 490k – 1,04 mi** |

---

## 3. Método B — Equipe alocada (time & materials)

Equipe convencional para este escopo:

| Papel | Dedicação |
|---|---:|
| Tech lead / arquiteto | 50% |
| Desenvolvedores full-stack | 2 × 100% |
| Analista de negócio / PO | 50% |
| QA | 50% |
| Designer UX (fase inicial) | 30% |
| **Equivalente** | **~4,3 pessoas** |

Prazo de mercado para este escopo: **9 meses**.

```
4,3 FTE × 9 meses × R$ 28,8k/mês (a R$ 180/hora × 160h)  =  R$ 1,11 milhão
```

Faixa conforme o porte do fornecedor:

| Cenário | Valor-hora | Total |
|---|---:|---:|
| Fornecedor pequeno / freelancers | R$ 120–150 | R$ 620k – 780k |
| Fábrica de médio porte | R$ 180–250 | R$ 1,11 mi – 1,55 mi |
| Consultoria grande | R$ 300–500 | R$ 1,85 mi – 3,1 mi |

---

## 4. Método C — Equipe interna CLT

| Papel | Salário | Custo empresa (~1,8×) |
|---|---:|---:|
| Tech lead sênior | R$ 20.000 | R$ 36.000 |
| 2 desenvolvedores plenos | R$ 12.000 cada | R$ 43.200 |
| Analista / PO | R$ 10.000 | R$ 18.000 |
| QA (meio período) | R$ 8.000 | R$ 7.200 |
| **Custo mensal** | | **R$ 104.400** |

```
R$ 104.400 × 9 meses + ferramentas/infra  ≈  R$ 967 mil
```

---

## 5. Convergência

Dois métodos independentes (B e C) caem na mesma faixa:

> ## R$ 900 mil – R$ 1,1 milhão
> É essa a ordem de grandeza para terceirizar este sistema.

O método A, por entregável, fica abaixo porque a precificação por tela subestima
sistematicamente a descoberta em ERP legado — que aqui foi metade do trabalho.

---

## 6. O que foi efetivamente gasto

Uma pessoa, 4,5 meses (27/03/2026 – 13/08/2026).

| Faixa salarial | Custo empresa/mês | 4,5 meses |
|---|---:|---:|
| R$ 12.000 | R$ 21.600 | R$ 97.200 |
| R$ 18.000 | R$ 32.400 | R$ 145.800 |
| R$ 25.000 | R$ 45.000 | R$ 202.500 |

Somando ferramentas de IA e infraestrutura local: **entre R$ 100 mil e R$ 210 mil.**

**Diferença: de 5 a 10 vezes.**

---

## 7. O que uma proposta de mercado não mostraria na capa

### 7.1 O sistema não estaria entregue

Só **1 dos 17 módulos** passou pela conferência do usuário final. Num contrato de
mercado, homologação é a fase final e vale tipicamente **15% a 25% do valor** —
estaria toda pela frente. Ver `/relatorio-prazo` para o placar atualizado.

### 7.2 Aditivos

Projetos deste porte crescem **20% a 40%** em escopo durante a execução. Cada
"só falta um campinho" vira ordem de serviço. Sobre R$ 1 milhão, são
**R$ 200 mil a R$ 400 mil** adicionais.

### 7.3 Sustentação

Manutenção anual costuma ser **15% a 20%** do valor do projeto:
**R$ 135 mil a R$ 220 mil por ano**, todo ano, só para continuar funcionando.

### 7.4 Custo total de propriedade em 3 anos

```
Projeto             R$ 1,00 mi
Aditivos (30%)      R$ 0,30 mi
Sustentação 3 anos  R$ 0,53 mi
------------------------------
Total               R$ 1,83 mi
```

---

## 8. A parte que não existe para comprar

Nada disto é produto de prateleira — é a concessão de ônibus do Distrito Federal:

- Repasse do GDF pela **tarifa técnica** (Bacia 2, R$ 7,9895/pagante equivalente)
- **Matriz de resgate** da BRB Mobilidade (data de transporte × data de resgate)
- Conferência de **retenções** contra o Globus
- Ponte **AD→CRC** ligando crédito bancário a documento de receita
- Custo por **CODCUSTOFIN** (o setor que o ERP não entrega pronto)
- **INSS patronal real** via `FLP_GPS_INTEGRACPG`, no lugar da estimativa de 28,8%

Um fornecedor entregaria em nove meses **a parte genérica** e começaria a descobrir a
parte específica depois, cobrando aditivo por cada descoberta. As semanas gastas
entendendo o comportamento real do Globus seriam faturadas — e provavelmente
descobertas mais tarde e mais caro, porque quem estava dentro da empresa levou
meses para chegar lá.

---

## 9. Ressalvas honestas

**As faixas de valor-hora e salário são referências de mercado assumidas**, não
números de pesquisa publicada. Se a Pioneira tiver uma proposta real de fornecedor,
ela vale mais que esta estimativa e o cálculo deve ser refeito sobre ela.

**Os 4,5 meses não são comparáveis com produtividade humana pura.** Boa parte da
velocidade veio de assistência de IA. A leitura correta não é "uma pessoa é 8× mais
rápida que uma equipe", e sim:

> Uma pessoa com essas ferramentas, **que já conhecia o negócio por dentro**, custou
> uma fração do que custaria terceirizar — e chegou a respostas que um fornecedor
> externo levaria muito mais tempo para sequer formular.

**A comparação não é entre "bom" e "ruim".** Um fornecedor traz equipe redundante,
contrato, SLA e continuidade se alguém sair. O arranjo atual concentra em uma pessoa
todo o conhecimento do sistema — é mais barato e mais rápido, e também mais frágil.
Esse risco é real e deve ser dito junto com o número.

---

## 10. Resumo para levar à reunião

| | Terceirizado | Realizado |
|---|---:|---:|
| Projeto | R$ 900k – 1,1 mi | R$ 100k – 210k |
| Prazo até aqui | 9 meses | 4,5 meses |
| Aditivos esperados | R$ 200k – 400k | — |
| Sustentação anual | R$ 135k – 220k | — |
| **3 anos** | **~R$ 1,8 mi** | — |

E a ressalva que sustenta a credibilidade do resto: **o sistema ainda não está
pronto.** Está em validação, com 1 de 17 módulos conferido. O número de mercado
acima é para o escopo construído — não para um sistema homologado.
