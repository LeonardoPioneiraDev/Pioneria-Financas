# Contas a Pagar — Exportar Excel

Documentação da funcionalidade de exportação da tela **Contas a Pagar** (`/contas-pagar`).
Gera um `.xlsx` formatado com **exatamente a listagem filtrada na tela** (todas as páginas,
sem paginação).

## Visão geral

O botão **Exportar Excel** fica ao lado de *Aplicar filtros* e *Sincronizar do Globus*.
Ele baixa um arquivo `.xlsx` contendo todos os títulos que batem com os filtros ativos —
**não** só a página atual da tabela. Não altera nada no banco; é uma leitura.

- **Front:** `apps/FinancasFrontend/src/app/(private)/contas-pagar/page.tsx` → `exportarExcel()`
- **Rota:** `GET /api/contas-pagar/export`
- **Back:** `apps/FinancasBackend/src/modules/contas-pagar/contas-pagar.service.ts` → `exportarXlsx()`
- **Lib:** [`exceljs`](https://github.com/exceljs/exceljs)

## Quando o botão fica disponível

O botão fica **desabilitado** quando:

1. A tela ainda não foi ativada (`!ativo`) — ou seja, antes do primeiro *Aplicar* / *Sincronizar*.
2. Uma exportação já está em andamento (`exportando`) — vira "Exportando..." com ícone pulsando.
3. A listagem atual está vazia (`linhas.length === 0`).

## Fluxo

1. O usuário define os filtros e clica em **Aplicar** (ou **Sincronizar do Globus**).
2. Com a listagem carregada, clica em **Exportar Excel**.
3. O front monta os **mesmos parâmetros da listagem, menos `page`/`limit`**, e chama
   `GET /api/contas-pagar/export` com `responseType: 'blob'`.
4. O backend roda a query filtrada, monta a planilha em memória e devolve o buffer `.xlsx`.
5. O front cria um `Blob` URL e dispara o download. Nome do arquivo:
   `contas-pagar-<dtIni>_a_<dtFim>.xlsx`.
6. Em caso de erro, mostra toast "Falha ao exportar" com a mensagem do backend.

> O nome do arquivo no **front** usa o período de vencimento (`dtIni`/`dtFim`). O **backend**
> gera seu próprio `filename` no header `Content-Disposition` juntando todas as datas
> presentes (`dtIni_dtFim_dtPagIni_dtPagFim`), ou `todos` se nenhuma. O navegador respeita o
> `download` do front, então o nome final segue o padrão `..._a_...`.

## Filtros respeitados

A exportação usa **os mesmos filtros da listagem** (`ContaPagarListQuery`):

| Filtro | Param | Observação |
|---|---|---|
| Vencimento de / até | `dtIni`, `dtFim` | Ignorado quando o filtro de pagamento está ativo |
| Pagamento de / até | `dtPagIni`, `dtPagFim` | Quando preenchido, **substitui** o filtro de vencimento |
| Busca livre | `search` | Documento, fornecedor ou CNPJ |
| Status | `status` | CSV: `pendente,em_aprovacao,aprovado,pago,cancelado` |
| Origem | `origem` | CSV: `folha,nf,guia,manual,desconhecido` |
| Setor | `setores` | CSV de `CODCUSTOFIN` (centro de custo financeiro) |
| Valor mín./máx. | `valorMinCents`, `valorMaxCents` | Convertidos de R$ para centavos no front |
| Somente vencidos | `somenteVencidos` | |
| Substituído | `substituido` | `validos` (pagos de verdade) ou `substituidos`; `todos` não envia |

A exportação **não** envia `page`/`limit` — exporta o resultado inteiro do filtro.

## Conteúdo da planilha

Uma aba **"Contas a Pagar"** com cabeçalho congelado (`frozen ySplit: 1`) e estas colunas:

| Coluna | Origem |
|---|---|
| Fornecedor | `fornecedor.razaoSocial` → fallback `favorecidoNome` → `-` |
| CNPJ/CPF | `fornecedor.cnpjCpf` → fallback `favorecidoInscricao` |
| Tipo | `tipoDocumento` (rótulo via `TIPO_DOCUMENTO_LABEL`) |
| Documento | `numeroDocumento` |
| Serie | `serieDocumento` |
| Parcela | `numeroParcela` |
| Setor | `setorNome` |
| Origem | `origemDocumento` (rótulo via `ORIGEM_DOCUMENTO_CP_LABELS`) |
| Vencimento | `dataVencimento` (formato `dd/mm/yyyy`) |
| Pagamento | `dataPagamento` (formato `dd/mm/yyyy`) |
| Valor bruto | `valorBrutoCents` → R$ |
| Retencoes | soma INSS+IRRF+PIS+COFINS+CSLL+ISS → R$ |
| Valor a pagar | `valorLiquidoCents − retenções` → R$ |
| Status | `pendente`/`em_aprovacao`/`aprovado`/`pago`/`cancelado` em PT |
| Substituido | `SIM` / `Nao` |
| Substituido por (doc) | número **real** do documento sucessor (não o cód. interno) |
| Modalidade | `modalidadePagamento` (rótulo via `MODALIDADE_PAGAMENTO_LABEL`) |
| Banco pagador | `bancoPagadorNome` |
| Bordero | `pagamentoDoc` |

### Formatação

- **Cabeçalho:** negrito, fonte branca, fundo verde Pioneira (`#1F4E3D`), centralizado, altura 20.
- **Moeda:** colunas `Valor bruto`, `Retencoes`, `Valor a pagar` com `R$ #,##0.00`.
- **Datas:** colunas `Vencimento`, `Pagamento` com `dd/mm/yyyy`.
- **Substituídos:** linhas com `Substituido = SIM` ganham fundo âmbar claro (`#FFF3CD`) e texto
  tachado em âmbar escuro (`#8A6D00`) — sinalizam que **não contam nos totais** (ver SFN-48).
- **Autofiltro** habilitado em todas as colunas (linha 1).

## Detalhes importantes

- **Coluna "Substituido por (doc)":** o usuário não conhece o código interno do Globus
  (`substituidoPorCod`), então o backend resolve esse código para o **número de documento real**
  do título sucessor antes de escrever a célula (lookup em `cpRepo` por `origemIdExterno`).
- **Limite de segurança:** máximo de **50.000 linhas** por exportação
  (`const LIMITE = 50000`). Acima disso a query é truncada — sem aviso na UI hoje.
- **Ordenação:** por `data_vencimento DESC`, desempate por `id ASC` (mesma ordem da listagem).
- **Valores em centavos:** o banco guarda tudo em `BIGINT` centavos; a conversão para R$
  (`/100`) acontece só na escrita da célula, com `numFmt` de moeda.
- **Permissão:** mesma da listagem — roles `admin`, `cfo`, `controller`, `cp_analista`.

## Relacionados

- Filtros da tela: `apps/FinancasFrontend/src/app/(private)/contas-pagar/_components/FiltrosCp.tsx`
- Substituição/duplicidade (selo "Substituído", fora dos totais): SFN-48
- Filtro por data de pagamento vs. sincronização por vencimento: SFN-47,
  `Leia/globus-pagamentos-realizados.md`
