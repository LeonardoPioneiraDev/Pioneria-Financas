import { Type, type Static } from '@sinclair/typebox';
import {
  CONTA_PAGAR_STATUS,
  type ContaPagarStatus,
  ORIGEM_DOCUMENTO_CP,
  type OrigemDocumentoCp,
} from '../enums/conta-pagar-status.js';

export { CONTA_PAGAR_STATUS, type ContaPagarStatus, ORIGEM_DOCUMENTO_CP, type OrigemDocumentoCp };

const StatusUnion = Type.Union(CONTA_PAGAR_STATUS.map((s) => Type.Literal(s)));
const OrigemUnion = Type.Union(ORIGEM_DOCUMENTO_CP.map((o) => Type.Literal(o)));

export const ContaPagarResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  fornecedor: Type.Union([
    Type.Object({
      id: Type.String({ format: 'uuid' }),
      razaoSocial: Type.String(),
      nomeFantasia: Type.Union([Type.String(), Type.Null()]),
      cnpjCpf: Type.Union([Type.String(), Type.Null()]),
    }),
    Type.Null(),
  ]),
  numeroDocumento: Type.Union([Type.String(), Type.Null()]),
  serieDocumento: Type.Union([Type.String(), Type.Null()]),
  numeroParcela: Type.Union([Type.Integer(), Type.Null()]),
  tipoDocumento: Type.Union([Type.String(), Type.Null()]),
  competencia: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  dataEmissao: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  dataEntrada: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  dataVencimento: Type.String({ format: 'date' }),
  dataPagamento: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  valorBrutoCents: Type.Integer(),
  descontoCents: Type.Integer(),
  jurosCents: Type.Integer(),
  multaCents: Type.Integer(),
  valorLiquidoCents: Type.Integer(),
  retencoes: Type.Object({
    inssCents: Type.Integer(),
    irrfCents: Type.Integer(),
    pisCents: Type.Integer(),
    cofinsCents: Type.Integer(),
    csllCents: Type.Integer(),
    issCents: Type.Integer(),
    totalCents: Type.Integer(),
  }),
  valorAPagarCents: Type.Integer(),
  status: StatusUnion,
  quitado: Type.Boolean(),
  pagamentoLiberado: Type.Boolean(),
  modalidadePagamento: Type.Union([Type.String(), Type.Null()]),
  tipoPagto: Type.Union([Type.String(), Type.Null()]),
  /**
   * Substituicao (CPGDOCTO.CODDOCTOCPGSUBST): `substituido`=true quando o titulo foi
   * substituido/relancado no Globus e `substituidoPorCod` aponta pro CODDOCTOCPG do
   * sucessor. O antigo aparece na lista com selo "Substituido" mas FICA DE FORA das
   * somas (evita dobrar valor de titulo ja pago). Ver SFN-48.
   */
  substituido: Type.Boolean(),
  /**
   * Quantas vezes o Globus registrou "Pagamento de documento". >1 = pagamento
   * cancelado e REFEITO. Nao ha dupla contagem: o titulo e uma linha so e entra
   * uma vez nos totais — o contador serve para o financeiro reconhecer na lista
   * o que ve no historico do ERP.
   */
  vezesPagoGlobus: Type.Integer(),
  /** Houve "Cancelamento de pagamento" na trilha do Globus. */
  teveCancelamentoPagamento: Type.Boolean(),
  /** Vencimento antes da última prorrogação no Globus (null = nunca mudou). */
  vencimentoAnterior: Type.Union([Type.String(), Type.Null()]),
  /** Quando a data de vencimento foi alterada. */
  vencimentoAlteradoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  /** A data de vencimento já foi prorrogada no Globus. */
  teveProrrogacao: Type.Boolean(),
  /** CODDOCTOCPG interno do sucessor (chave do Globus, nao o nº que o usuario conhece). */
  substituidoPorCod: Type.Union([Type.String(), Type.Null()]),
  /** Numero REAL do documento sucessor (NRODOCTOCPG), resolvido na base local pra
   *  exibir pro usuario. Null se o sucessor nao estiver sincronizado. Ver SFN-48. */
  substituidoPorDoc: Type.Union([Type.String(), Type.Null()]),
  /**
   * Pagamento DEVOLVIDO (follow-up SFN-48): o banco ACEITOU o pagamento eletronico
   * (STATUSPE='PG', data preenchida) mas NAO liquidou — o dinheiro voltou ("DOC
   * DEVOLVIDO" no extrato) e o titulo foi refeito por outro borderô. Detectado por
   * QUITADO real do Globus = N + credito de devolucao casando conta/valor/data.
   * Aparece com selo "Devolvido / refeito" e FICA DE FORA do "Foi pago" (so a
   * tentativa que liquidou conta), evitando contar o mesmo valor duas vezes.
   */
  pagamentoDevolvido: Type.Boolean(),
  /**
   * Favorecido "real" do titulo (CPGDOCTO.FAVORECIDODOCTOCPG, texto livre) +
   * inscricao do favorecido. Pode diferir do fornecedor cadastrado (ex.: fornecedor
   * generico) ou vir vazio. So populado apos sync com Oracle ligado.
   */
  favorecido: Type.Object({
    nome: Type.Union([Type.String(), Type.Null()]),
    inscricao: Type.Union([Type.String(), Type.Null()]),
    tipoInscricao: Type.Union([Type.String(), Type.Null()]),
  }),
  /**
   * Banco que PAGOU (conta da empresa de onde saiu o dinheiro) + borderô/nº do
   * documento bancario (BCOMOVTO.DOCMOVTOBCO, ex.: "BO-010260"). So populado apos
   * sync com Oracle ligado.
   */
  pagamento: Type.Object({
    bancoCodigo: Type.Union([Type.Integer(), Type.Null()]),
    bancoNome: Type.Union([Type.String(), Type.Null()]),
    agencia: Type.Union([Type.String(), Type.Null()]),
    conta: Type.Union([Type.String(), Type.Null()]),
    documento: Type.Union([Type.String(), Type.Null()]),
    /** ID do movimento bancario (BCOMOVTO.CODMOVTOBCO). Titulos com o mesmo valor
     *  foram pagos no MESMO debito (ex.: parcelas de um adiantamento). */
    movimentoId: Type.Union([Type.String(), Type.Null()]),
    /** Remessa enviada ao banco (pagamento eletronico): numero + data. Titulos com a
     *  MESMA conta+data+numero foram enviados no MESMO arquivo. Null em borderô/cheque. */
    numeroRemessa: Type.Union([Type.String(), Type.Null()]),
    dataRemessa: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    /** Confirmacao do pagamento eletronico (CPGDOCTO): autenticacao = comprovante
     *  (AUTELETRONICA); statusPe = STATUSPE ('PG'=pago). So no pagamento eletronico
     *  (~30%). O retorno bancario "oficial" (NRDOCTORETBCOPE) vem vazio na Pioneira. */
    autenticacaoEletronica: Type.Union([Type.String(), Type.Null()]),
    statusPe: Type.Union([Type.String(), Type.Null()]),
  }),
  observacao: Type.Union([Type.String(), Type.Null()]),
  /**
   * Setor de origem = centro de custo financeiro do item (GLOBUS.CPGITDOC.CODCUSTOFIN),
   * unidade DOMINANTE por valor quando o titulo tem rateio. `codSetor` = codigo
   * (ex "20003"), `setorNome` = descricao (CPGCUSTOS, ex "UNIDADE GAMA").
   */
  codSetor: Type.Union([Type.String(), Type.Null()]),
  setorNome: Type.Union([Type.String(), Type.Null()]),
  /** true = titulo tem itens em mais de uma unidade; `setorNome` e a dominante. */
  setorRateado: Type.Boolean(),
  /**
   * Quebra do rateio por unidade (CODCUSTOFIN), quando o titulo tem itens em mais de um
   * centro de custo. `codSetor`/`setorNome` sao a unidade DOMINANTE (maior valor); aqui
   * vem TODAS, do maior valor pro menor. Null quando ha uma so unidade (sem rateio).
   */
  rateioSetores: Type.Union([
    Type.Array(
      Type.Object({
        codigo: Type.String(),
        nome: Type.Union([Type.String(), Type.Null()]),
        valorCents: Type.Integer(),
      }),
    ),
    Type.Null(),
  ]),
  /**
   * Quebra do título por CONTA CONTÁBIL (natureza da despesa) — eixo DIFERENTE do
   * setor. Quando o valor é a soma de itens com classificações contábeis distintas
   * (ex.: Consertos e Reformas + Consumo da Oficina + Eletricidade), vem aqui agrupado
   * por conta, do maior valor pro menor. `classificador` = código contábil pontilhado
   * (ex "3.1.01.09.0603"), `nome` = NOMECONTA. Null quando há 1 conta só ou o título
   * ainda não foi re-sincronizado.
   */
  rateioContas: Type.Union([
    Type.Array(
      Type.Object({
        classificador: Type.String(),
        nome: Type.Union([Type.String(), Type.Null()]),
        valorCents: Type.Integer(),
      }),
    ),
    Type.Null(),
  ]),
  origemDocumento: OrigemUnion,
  dataIntegrouFlp: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  competenciaFlp: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  origemSistema: Type.String(),
  origemIdExterno: Type.String(),
  ultimoSyncEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  /**
   * Trilha de auditoria do Globus (CPGDOCTO).
   *
   * Os campos `usuario*` sao logins/codigos do Globus, NAO nome completo.
   * Mapeamento pra nome real depende de sincronizar a tabela de usuarios
   * do Globus (proximo work item).
   */
  auditoria: Type.Object({
    usuarioInclusao: Type.Union([Type.String(), Type.Null()]),
    dataInclusao: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    usuarioLiberacaoPagto: Type.Union([Type.String(), Type.Null()]),
    dataLiberacaoPagto: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    usuarioAssinatura: Type.Union([Type.String(), Type.Null()]),
  }),
});
export type ContaPagarResponse = Static<typeof ContaPagarResponseSchema>;

export const ContaPagarListQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
  dtIni: Type.Optional(Type.String({ format: 'date' })),
  dtFim: Type.Optional(Type.String({ format: 'date' })),
  /** Filtro por data de PAGAMENTO (alem do vencimento). Semi-aberto [ini, fim). */
  dtPagIni: Type.Optional(Type.String({ format: 'date' })),
  dtPagFim: Type.Optional(Type.String({ format: 'date' })),
  /** Busca livre: numero documento, fornecedor, CNPJ. */
  search: Type.Optional(Type.String({ maxLength: 100 })),
  /** Status (lista separada por virgula). */
  status: Type.Optional(Type.String({ maxLength: 100 })),
  valorMinCents: Type.Optional(Type.Integer({ minimum: 0 })),
  valorMaxCents: Type.Optional(Type.Integer({ minimum: 0 })),
  /** Apenas vencidos (vencimento < hoje e nao pago). */
  somenteVencidos: Type.Optional(Type.Boolean()),
  /** Origem (lista separada por virgula): folha,nf,guia,manual,desconhecido. */
  origem: Type.Optional(Type.String({ maxLength: 100 })),
  /** Setores: lista de codigos CODCUSTOFIN separada por virgula (ex "10003,20003"). Vazio = todos. */
  setores: Type.Optional(Type.String({ maxLength: 300 })),
  /** Numero da remessa enviada ao banco (CPGDOCTO.NROREMESSAPE). Busca por "contem"
   *  (ILIKE) — aceita o numero parcial, sem precisar dos zeros a esquerda. */
  remessa: Type.Optional(Type.String({ maxLength: 20 })),
  /**
   * Filtro por substituicao (SFN-48):
   *  - 'todos' (default): mostra tudo (substituidos aparecem com selo, fora dos totais).
   *  - 'validos': so os NAO substituidos (os pagamentos "de verdade").
   *  - 'substituidos': so os substituidos (auditoria das duplicatas).
   */
  substituido: Type.Optional(Type.Union([Type.Literal('todos'), Type.Literal('validos'), Type.Literal('substituidos')])),
  /**
   * Filtro por FAIXA DE PRAZO (vencimento − emissao, em dias) — usado pelo drill-down
   * do painel de analise de prazo. `semData` = titulos sem emissao (nao da pra calcular).
   */
  prazoFaixa: Type.Optional(
    Type.Union([
      Type.Literal('ate30'),
      Type.Literal('de31a60'),
      Type.Literal('de61a90'),
      Type.Literal('mais90'),
      Type.Literal('semData'),
    ]),
  ),
  /** Drill-down do ALERTA: prazo > 30 dias, ja venceu e nao foi pago. */
  prazoLongoVencido: Type.Optional(Type.Boolean()),
  /** Ordenacao: campo:direcao (ex: dataVencimento:asc). */
  ordenarPor: Type.Optional(Type.String({ maxLength: 40 })),
});
export type ContaPagarListQuery = Static<typeof ContaPagarListQuerySchema>;

export const SyncInfoSchema = Type.Object({
  ultimoSyncEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  ultimoSyncStatus: Type.Union([Type.String(), Type.Null()]),
  ultimoSyncMensagem: Type.Union([Type.String(), Type.Null()]),
  totalLocal: Type.Integer(),
  precisaSincronizar: Type.Boolean(),
});
export type SyncInfo = Static<typeof SyncInfoSchema>;

/**
 * Totais do conjunto REALMENTE filtrado (todos os filtros da lista, incluindo data
 * de pagamento), agregados sobre TODAS as paginas — nao so a pagina atual. Util pra
 * responder "quanto foi pago no periodo filtrado". `pagoCents`/`pagoQuantidade`
 * contam titulos pagos (status='pago' OU quitado OU tem data_pagamento).
 */
export const ContaPagarTotaisFiltradosSchema = Type.Object({
  quantidade: Type.Integer(),
  /**
   * Quantos dos `quantidade` titulos sao SUBSTITUIDOS com o SUCESSOR ja confirmado
   * na nossa base (aparecem na lista com selo, mas ficam de FORA das somas de
   * valor — o sucessor e quem soma). Permite a UI avisar "X substituidos fora
   * dos totais". Ver SFN-48.
   */
  substituidosQuantidade: Type.Integer(),
  /**
   * Substituidos cujo SUCESSOR ainda NAO foi sincronizado (CODDOCTOCPGSUBST
   * aponta pra um titulo que nao esta na nossa base). Por seguranca CONTINUAM
   * somando (o antigo) ate o sucessor chegar — senao a obrigacao some dos dois
   * lados. Caso 30/07/2026: R$ 640.998,50 sumindo em silencio. Ver `Reconciliar
   * abertos`, que busca esses sucessores ativamente.
   */
  substituidosPendentesQuantidade: Type.Integer(),
  /**
   * Titulos cujo pagamento foi CANCELADO e REFEITO no Globus. Entram
   * normalmente nos totais (uma vez cada) — o contador so avisa que o
   * historico do ERP tem cancelamento, para o numero nao parecer errado.
   */
  refeitosQuantidade: Type.Integer(),
  /** Cancelados no Globus — ficam na lista com selo, mas FORA das somas de valor. */
  canceladosQuantidade: Type.Integer(),
  canceladosCents: Type.Integer(),
  /**
   * Quantos dos `quantidade` titulos sao PAGAMENTOS DEVOLVIDOS (banco aceitou mas nao
   * liquidou, devolveu e refez). Aparecem na lista com selo "Devolvido", mas ficam de
   * FORA do "Foi pago" (so a tentativa que liquidou conta). Follow-up SFN-48.
   */
  devolvidosQuantidade: Type.Integer(),
  valorLiquidoCents: Type.Integer(),
  valorAPagarCents: Type.Integer(),
  /**
   * "Total pago" = PAGAMENTOS EFETUADOS no periodo (quando ha filtro por data de
   * pagamento). E a SOMA de duas fontes, contando cada pagamento UMA vez:
   *   pagoCents = pagoTitulosCents (TODOS os titulos do CP pagos, inclusive boletos)
   *             + pagoDiretoBancoCents (debitos diretos no banco classificados
   *               por tipo de despesa, que nao passam pela carteira do CP).
   * Boletos entram em `pagoTitulos` (sao caixa real) e nao se repetem em
   * `pagoDiretoBanco` (o movimento bancario do boleto nao e classificado por
   * despesa). Sem filtro por pagamento, `pagoDiretoBanco*` = 0 e vale o legado
   * (so titulos do CP). Ver SFN-47.
   */
  pagoCents: Type.Integer(),
  pagoQuantidade: Type.Integer(),
  /** Perna A — todos os titulos do CP pagos no periodo (inclusive boletos). */
  pagoTitulosCents: Type.Integer(),
  pagoTitulosQuantidade: Type.Integer(),
  /** Perna B — pagamentos efetuados DIRETO no banco (BCOMOVTO com tipo de despesa),
   *  que nunca entraram na carteira do CP. EXCLUI movimentos financeiros (aplicacao
   *  financeira, emprestimo/transferencia entre contas do grupo), que nao sao
   *  pagamento de obrigacao. So preenchido com filtro por pagamento. */
  pagoDiretoBancoCents: Type.Integer(),
  pagoDiretoBancoQuantidade: Type.Integer(),
  /**
   * "Total movimento" — TUDO que SAIU da conta bancaria no periodo (caixa bruto):
   * pagamentos de titulos que tiveram debito bancario + TODOS os debitos diretos
   * de despesa, INCLUSIVE aplicacoes financeiras/investimentos e transferencias
   * entre contas do grupo. Difere de `pagoCents` (so pagamento de OBRIGACAO) por
   * incluir os movimentos financeiros. Nao inclui titulos quitados SEM movimento
   * (ex.: NF abatida por adiantamento — nao saiu do caixa). Conta movimentos
   * bancarios (nao titulos). So preenchido com filtro por pagamento. */
  movimentoDiaCents: Type.Integer(),
  movimentoDiaQuantidade: Type.Integer(),
  /**
   * Quebra do "saiu da conta" que NAO e pagamento de obrigacao — pra a tela mostrar
   * a diferenca inline (sem abrir o detalhe): `movimentoFinanceiroCents` = aplicacao/
   * investimento/transferencia entre contas; `movimentoDevolucaoCents` = devolucoes
   * (estorno que voltou, valor negativo). 0 quando nao ha filtro por pagamento.
   */
  movimentoFinanceiroCents: Type.Integer(),
  movimentoDevolucaoCents: Type.Integer(),
  /**
   * Quebra do PAGO EM TITULOS (Perna A) em CAIXA REAL (tem movimento bancario /
   * cod_movto_bco) vs SEM MOVIMENTO (quitado sem debito — ex.: NF abatida por
   * adiantamento). Evita inflar contando pagamento que nao saiu do caixa. Soma
   * das duas = pagoTitulosCents.
   */
  pagoComMovimentoCents: Type.Integer(),
  pagoComMovimentoQuantidade: Type.Integer(),
  pagoSemMovimentoCents: Type.Integer(),
  pagoSemMovimentoQuantidade: Type.Integer(),
});
export type ContaPagarTotaisFiltrados = Static<typeof ContaPagarTotaisFiltradosSchema>;

export const ContaPagarListResponseSchema = Type.Object({
  data: Type.Array(ContaPagarResponseSchema),
  pagination: Type.Object({
    page: Type.Integer(),
    limit: Type.Integer(),
    total: Type.Integer(),
    totalPages: Type.Integer(),
  }),
  /** Totais do resultado filtrado (todas as paginas). Ver schema acima. */
  totais: ContaPagarTotaisFiltradosSchema,
  syncInfo: SyncInfoSchema,
});
export type ContaPagarListResponse = Static<typeof ContaPagarListResponseSchema>;

export const SumarioContasPagarRequestSchema = Type.Object({
  dtIni: Type.Optional(Type.String({ format: 'date' })),
  dtFim: Type.Optional(Type.String({ format: 'date' })),
  /**
   * Filtros de escopo (os MESMOS da listagem). Permitem que os cards do sumario
   * reflitam o filtro aplicado — ex.: ao filtrar por DATA DE PAGAMENTO, os cards
   * passam a mostrar so o que foi pago no periodo, em vez do periodo-base de
   * vencimento. Quando ausentes, vale o comportamento legado (so dtIni/dtFim).
   */
  dtPagIni: Type.Optional(Type.String({ format: 'date' })),
  dtPagFim: Type.Optional(Type.String({ format: 'date' })),
  search: Type.Optional(Type.String({ maxLength: 100 })),
  status: Type.Optional(Type.String({ maxLength: 100 })),
  valorMinCents: Type.Optional(Type.Integer({ minimum: 0 })),
  valorMaxCents: Type.Optional(Type.Integer({ minimum: 0 })),
  somenteVencidos: Type.Optional(Type.Boolean()),
  origem: Type.Optional(Type.String({ maxLength: 100 })),
  setores: Type.Optional(Type.String({ maxLength: 300 })),
});
export type SumarioContasPagarRequest = Static<typeof SumarioContasPagarRequestSchema>;

export const SumarioContasPagarResponseSchema = Type.Object({
  periodo: Type.Object({
    dtIni: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
    dtFim: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  }),
  total: Type.Object({
    quantidade: Type.Integer(),
    valorBrutoCents: Type.Integer(),
    valorLiquidoCents: Type.Integer(),
    valorAPagarCents: Type.Integer(),
  }),
  porStatus: Type.Array(
    Type.Object({
      status: StatusUnion,
      quantidade: Type.Integer(),
      valorBrutoCents: Type.Integer(),
      valorLiquidoCents: Type.Integer(),
    }),
  ),
  /**
   * Cards de aging — MUTUAMENTE EXCLUSIVOS. Soma = total.quantidade.
   * Lógica: status='pago' OU quitado=true ↦ pago.
   *         Caso contrário, faixas por data_vencimento vs hoje.
   */
  vencidos: Type.Object({
    quantidade: Type.Integer(),
    valorAPagarCents: Type.Integer(),
  }),
  proximos7Dias: Type.Object({
    quantidade: Type.Integer(),
    valorAPagarCents: Type.Integer(),
  }),
  vencerMaisDe7: Type.Object({
    quantidade: Type.Integer(),
    valorAPagarCents: Type.Integer(),
  }),
  pago: Type.Object({
    quantidade: Type.Integer(),
    valorAPagarCents: Type.Integer(),
  }),
  /**
   * Cancelados em aberto (status='cancelado' e nao pagos). Ficam de fora dos
   * 4 cards de aging mas contam no total — por isso entram aqui pra fechar a
   * conta: pago + vencidos + proximos7 + vencerMaisDe7 + cancelados = total.
   */
  cancelados: Type.Object({
    quantidade: Type.Integer(),
    valorAPagarCents: Type.Integer(),
  }),
  topFornecedores: Type.Array(
    Type.Object({
      fornecedorId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
      razaoSocial: Type.String(),
      quantidade: Type.Integer(),
      valorAPagarCents: Type.Integer(),
    }),
  ),
});
export type SumarioContasPagarResponse = Static<typeof SumarioContasPagarResponseSchema>;

/**
 * Analise de PRAZO dos titulos (SFN — controle de boletos com vencimento longo).
 * Responde: (1) quantos titulos entram por mes; (2) quantos tem prazo > 30 dias
 * entre emissao e vencimento; (3) quantos desses ja venceram e nao foram pagos.
 * Reusa os MESMOS filtros do sumario/listagem (mesmo escopo na tela).
 */
export const AnalisePrazoRequestSchema = Type.Composite([
  SumarioContasPagarRequestSchema,
  Type.Object({
    /**
     * Janela da serie "incluidos por mes": ultimos N meses por DATA DE INCLUSAO
     * (desacoplado do periodo de vencimento). Default 3. Ex.: 3, 6 ou 12.
     */
    mesesInclusao: Type.Optional(Type.Integer({ minimum: 1, maximum: 24, default: 3 })),
  }),
]);
export type AnalisePrazoRequest = Static<typeof AnalisePrazoRequestSchema>;

/** Faixa da distribuicao de prazo: quantidade + valor liquido do balde. */
const PrazoFaixaSchema = Type.Object({
  quantidade: Type.Integer(),
  valorLiquidoCents: Type.Integer(),
});

export const AnalisePrazoResponseSchema = Type.Object({
  periodo: Type.Object({
    dtIni: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
    dtFim: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  }),
  /**
   * Titulos INCLUIDOS por mes — quando o funcionario lancou o titulo no Globus
   * (data_inclusao, fuso America/Sao_Paulo; fallback data_emissao quando a trilha
   * de inclusao nao veio). `mes` = 'YYYY-MM'. Ordenado do mais antigo ao mais recente.
   */
  inclusoesPorMes: Type.Array(
    Type.Object({
      mes: Type.String(),
      quantidade: Type.Integer(),
      valorLiquidoCents: Type.Integer(),
    }),
  ),
  /**
   * Distribuicao por PRAZO = data_vencimento − data_emissao (em dias). Baldes
   * mutuamente exclusivos. `semData` = titulos sem data de emissao (nao da pra
   * calcular o prazo) — principio "quando nao tem dado, o sistema diz que nao tem".
   */
  distribuicaoPrazo: Type.Object({
    ate30: PrazoFaixaSchema,
    de31a60: PrazoFaixaSchema,
    de61a90: PrazoFaixaSchema,
    mais90: PrazoFaixaSchema,
    semData: PrazoFaixaSchema,
  }),
  /** Consolidado dos titulos com prazo > 30 dias (soma das faixas 31-60, 61-90, >90). */
  prazoLongo: Type.Object({
    quantidade: Type.Integer(),
    valorLiquidoCents: Type.Integer(),
  }),
  /**
   * ALERTA — titulos com prazo > 30 dias que JA VENCERAM e NAO foram pagos.
   * E o caso critico: comprou com prazo longo, o prazo passou e o boleto ficou
   * em aberto. `valorAPagarCents` = valor liquido − retencoes.
   */
  prazoLongoVencidoNaoPago: Type.Object({
    quantidade: Type.Integer(),
    valorAPagarCents: Type.Integer(),
  }),
});
export type AnalisePrazoResponse = Static<typeof AnalisePrazoResponseSchema>;

/**
 * Setor de origem presente nos CPs — usado pra popular o filtro. `codigo` e o
 * UUID do setor (finance.setor.id); so retorna setores que tem ao menos 1 CP.
 */
export const SetorCpSchema = Type.Object({
  codigo: Type.String(),
  nome: Type.Union([Type.String(), Type.Null()]),
  totalCps: Type.Integer(),
});
export type SetorCp = Static<typeof SetorCpSchema>;
export const SetorCpListResponseSchema = Type.Array(SetorCpSchema);

export const SyncContasPagarRequestSchema = Type.Object({
  dtIni: Type.Optional(Type.String({ format: 'date' })),
  dtFim: Type.Optional(Type.String({ format: 'date' })),
  empresa: Type.Optional(Type.Integer({ minimum: 1 })),
  /**
   * Eixo de data da janela de sincronizacao.
   *  - 'vencimento' (default): puxa do Globus por VENCIMENTOCPG ("o que vence no periodo").
   *  - 'pagamento': puxa por PAGAMENTOCPG ("o que foi PAGO no periodo"), para auditoria
   *    de caixa — traz titulos pagos no intervalo independente de quando venceram.
   * `dtIni`/`dtFim` continuam sendo o range (semi-aberto, dtFim EXCLUSIVO) aplicado
   * sobre a coluna escolhida.
   */
  modo: Type.Optional(Type.Union([Type.Literal('vencimento'), Type.Literal('pagamento')])),
});
export type SyncContasPagarRequest = Static<typeof SyncContasPagarRequestSchema>;

/**
 * Grupo de pagamento = todos os titulos quitados pelo MESMO movimento bancario
 * (borderô / cod_movto_bco). Usado pra deixar claro que parcelas de um adiantamento
 * sao UM pagamento so, fatiado. `totalCents` = soma do valor a pagar dos titulos do
 * grupo (= valor do debito).
 */
export const PagamentoGrupoTituloSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  numeroDocumento: Type.Union([Type.String(), Type.Null()]),
  numeroParcela: Type.Union([Type.Integer(), Type.Null()]),
  tipoDocumento: Type.Union([Type.String(), Type.Null()]),
  fornecedor: Type.Union([Type.String(), Type.Null()]),
  valorAPagarCents: Type.Integer(),
  /** true = titulo substituido (o antigo, ex.: NF relancada como boleto). Entra na
   *  lista pra transparencia, mas NAO conta no total/quantidade do grupo. Ver SFN-48. */
  substituido: Type.Boolean(),
});
export type PagamentoGrupoTitulo = Static<typeof PagamentoGrupoTituloSchema>;

export const PagamentoGrupoResponseSchema = Type.Object({
  movimentoId: Type.Union([Type.String(), Type.Null()]),
  documento: Type.Union([Type.String(), Type.Null()]),
  bancoNome: Type.Union([Type.String(), Type.Null()]),
  quantidade: Type.Integer(),
  totalCents: Type.Integer(),
  titulos: Type.Array(PagamentoGrupoTituloSchema),
});
export type PagamentoGrupoResponse = Static<typeof PagamentoGrupoResponseSchema>;

/**
 * Remessa enviada ao banco (pagamento eletronico) — todos os titulos enviados no MESMO
 * arquivo (mesma conta + data + numero da remessa). Deixa claro que o financeiro mandou
 * varios documentos de uma vez. `totalCents` = soma do valor a pagar dos titulos (exclui
 * substituidos). So o pagamento eletronico tem remessa; borderô/cheque caem no borderô.
 */
export const RemessaGrupoResponseSchema = Type.Object({
  numeroRemessa: Type.Union([Type.String(), Type.Null()]),
  dataRemessa: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  bancoNome: Type.Union([Type.String(), Type.Null()]),
  quantidade: Type.Integer(),
  totalCents: Type.Integer(),
  titulos: Type.Array(PagamentoGrupoTituloSchema),
});
export type RemessaGrupoResponse = Static<typeof RemessaGrupoResponseSchema>;

/**
 * Cadeia de substituição de um documento (SFN-48). Um título tramita por vários
 * ESTADOS no Globus (ex.: NF → Recibo → Boleto), ligados por CODDOCTOCPGSUBST.
 * Só o ESTADO FINAL (sem sucessor) vale e conta no total; os anteriores foram
 * substituídos. A cadeia vem ordenada do mais antigo (lançamento) ao final (pago).
 */
export const SubstituicaoCadeiaItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  numeroDocumento: Type.Union([Type.String(), Type.Null()]),
  serieDocumento: Type.Union([Type.String(), Type.Null()]),
  numeroParcela: Type.Union([Type.Integer(), Type.Null()]),
  tipoDocumento: Type.Union([Type.String(), Type.Null()]),
  valorAPagarCents: Type.Integer(),
  dataInclusao: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  dataPagamento: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  quitado: Type.Boolean(),
  /**
   * Status REAL deste estado (mesma fonte que `ContaPagarResponse.status` —
   * STATUSDOCTOCPG do Globus). `final=true` NÃO significa pago: o estado final
   * pode estar pendente (ex.: boleto gerado mas ainda não compensado). Nunca
   * assumir "final = pago" — usar este campo.
   */
  status: Type.String(),
  /**
   * Pagamento eletrônico enviado ao banco DESTE estado — CPGDOCTO.NROREMESSAPE
   * /DTREMESSAPE/STATUSPE. Existe pra deixar claro que já saiu daqui ("boleto
   * gerado") mesmo quando `status` ainda é pendente (banco não confirmou).
   * Null quando não é pagamento eletrônico (borderô/cheque/manual).
   */
  numeroRemessa: Type.Union([Type.String(), Type.Null()]),
  dataRemessa: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  /** STATUSPE do Globus — 'PG' = confirmado pelo banco; outros = em trânsito. */
  statusPe: Type.Union([Type.String(), Type.Null()]),
  /** Estado intermediário (foi substituído por outro). */
  substituido: Type.Boolean(),
  /** Estado FINAL da cadeia — o que vale e conta no total. */
  final: Type.Boolean(),
  /** É o título atualmente aberto no detalhe. */
  atual: Type.Boolean(),
  /**
   * Quebra por conta contábil DESTE estado (mesma forma de ContaPagarResponse.rateioContas).
   * Usado pra HERDAR a itemização quando o estado válido (ex.: Boleto relançado com 1 conta)
   * não tem a quebra, mas um estado anterior (ex.: a NF de origem) tem. Null = sem quebra.
   */
  rateioContas: Type.Union([
    Type.Array(
      Type.Object({
        classificador: Type.String(),
        nome: Type.Union([Type.String(), Type.Null()]),
        valorCents: Type.Integer(),
      }),
    ),
    Type.Null(),
  ]),
});
export type SubstituicaoCadeiaItem = Static<typeof SubstituicaoCadeiaItemSchema>;

export const SubstituicaoCadeiaResponseSchema = Type.Object({
  /** Quantos estados a obrigação teve (1 = sem substituição). */
  total: Type.Integer(),
  /** Valor do estado final (o que de fato conta no total). */
  valorFinalCents: Type.Integer(),
  /** Cadeia ordenada do mais antigo (lançamento) ao final (pago). */
  cadeia: Type.Array(SubstituicaoCadeiaItemSchema),
});
export type SubstituicaoCadeiaResponse = Static<typeof SubstituicaoCadeiaResponseSchema>;

/**
 * Comprovante da DEVOLUÇÃO de um pagamento (follow-up SFN-48). Liga o selo "Devolvido"
 * à PROVA real no extrato bancário (finance.banco_movto), em vez de só afirmar que houve
 * devolução. Mostra três peças:
 *   - `debito`  = a saída que o banco aceitou mas devolveu (dados do próprio título);
 *   - `credito` = o lançamento de DOC/CHEQUE DEVOLVIDO que casou conta+valor+data — a
 *                 prova de que o dinheiro VOLTOU. Null quando não localizado no extrato;
 *   - `refeito` = o título que de fato liquidou a obrigação (quitado de verdade), quando
 *                 identificável. Null se não houver candidato seguro.
 * `encontrado` = true só quando há crédito de devolução casado — princípio "quando não
 * tem dado, o sistema diz que não tem".
 */
export const DevolucaoComprovanteResponseSchema = Type.Object({
  encontrado: Type.Boolean(),
  debito: Type.Object({
    dataPagamento: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
    valorCents: Type.Integer(),
    bancoCodigo: Type.Union([Type.Integer(), Type.Null()]),
    bancoNome: Type.Union([Type.String(), Type.Null()]),
    agencia: Type.Union([Type.String(), Type.Null()]),
    conta: Type.Union([Type.String(), Type.Null()]),
    /** Borderô / nº do pagamento eletrônico (BCOMOVTO.DOCMOVTOBCO / PE-xxxx). */
    documento: Type.Union([Type.String(), Type.Null()]),
    /** ID do movimento bancário do débito (BCOMOVTO.CODMOVTOBCO), quando houver. */
    movimentoId: Type.Union([Type.String(), Type.Null()]),
  }),
  credito: Type.Union([
    Type.Object({
      /** ID do movimento bancário do crédito de devolução (BCOMOVTO.CODMOVTOBCO). */
      codMovtoBco: Type.String(),
      dataMovto: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
      /** Data em que o estorno foi EFETIVADO na conta (BCOMOVTO.DATA_EFETIVA). */
      dataEfetiva: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
      /** Data de crédito do valor de volta (BCOMOVTO.DATA_CREDITO). */
      dataCredito: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
      valorCents: Type.Integer(),
      bancoCodigo: Type.Union([Type.Integer(), Type.Null()]),
      bancoNome: Type.Union([Type.String(), Type.Null()]),
      agencia: Type.Union([Type.String(), Type.Null()]),
      conta: Type.Union([Type.String(), Type.Null()]),
      /** Código do histórico bancário (BCOHISTO): 10 = DOC DEVOLVIDO, 541 = CHEQUE DEVOLVIDO. */
      codHistoBco: Type.Union([Type.Integer(), Type.Null()]),
      /** Descrição do histórico (ex.: "DOC DEVOLVIDO"). */
      descHistoBco: Type.Union([Type.String(), Type.Null()]),
      /** Nº do documento no extrato (BCOMOVTO.DOCMOVTOBCO). */
      documento: Type.Union([Type.String(), Type.Null()]),
      /** Histórico livre do lançamento (BCOMOVTO.HISTMOVTOBCO). */
      historico: Type.Union([Type.String(), Type.Null()]),
    }),
    Type.Null(),
  ]),
  refeito: Type.Union([
    Type.Object({
      id: Type.String({ format: 'uuid' }),
      numeroDocumento: Type.Union([Type.String(), Type.Null()]),
      numeroParcela: Type.Union([Type.Integer(), Type.Null()]),
      tipoDocumento: Type.Union([Type.String(), Type.Null()]),
      dataPagamento: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
      /** Borderô / documento do pagamento que liquidou. */
      documento: Type.Union([Type.String(), Type.Null()]),
      valorAPagarCents: Type.Integer(),
    }),
    Type.Null(),
  ]),
});
export type DevolucaoComprovanteResponse = Static<typeof DevolucaoComprovanteResponseSchema>;

export const SyncResponseSchema = Type.Object({
  jobId: Type.String({ format: 'uuid' }),
  status: Type.Union([Type.Literal('ok'), Type.Literal('parcial'), Type.Literal('erro')]),
  registrosLidos: Type.Integer(),
  registrosGravados: Type.Integer(),
  registrosComErro: Type.Integer(),
  duracaoMs: Type.Integer(),
  mensagem: Type.Optional(Type.String()),
});
export type SyncResponse = Static<typeof SyncResponseSchema>;

/**
 * Detalhe dos movimentos bancarios (saidas) que compoem o "Total movimento" /
 * "Direto no banco" de um periodo de PAGAMENTO. Cada item e um lancamento do
 * extrato (BCOMOVTO). `categoria`:
 *   - 'pagamento_cp' = movimento que liquidou titulo(s) do Contas a Pagar
 *   - 'despesa'      = debito direto de despesa (conta no "Total pago" - Perna B)
 *   - 'financeiro'   = aplicacao/investimento/transferencia (so no "Total movimento")
 *   - 'devolucao'    = credito de DOC/CHEQUE DEVOLVIDO que reverte um pagamento
 *                      aceito mas nao liquidado (entra negativo, neta o Total movimento)
 */
export const MovimentoBancoQuerySchema = Type.Object({
  dtPagIni: Type.Optional(Type.String({ format: 'date' })),
  dtPagFim: Type.Optional(Type.String({ format: 'date' })),
});
export type MovimentoBancoQuery = Static<typeof MovimentoBancoQuerySchema>;

export const MovimentoBancoCategoriaSchema = Type.Union([
  Type.Literal('pagamento_cp'),
  Type.Literal('despesa'),
  Type.Literal('financeiro'),
  Type.Literal('devolucao'),
]);
export type MovimentoBancoCategoria = Static<typeof MovimentoBancoCategoriaSchema>;

export const MovimentoBancoItemSchema = Type.Object({
  codMovtoBco: Type.String(),
  dataMovto: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  codTpDespesa: Type.Union([Type.String(), Type.Null()]),
  descricao: Type.Union([Type.String(), Type.Null()]),
  documento: Type.Union([Type.String(), Type.Null()]),
  valorCents: Type.Integer(),
  categoria: MovimentoBancoCategoriaSchema,
});
export type MovimentoBancoItem = Static<typeof MovimentoBancoItemSchema>;

export const MovimentoBancoResponseSchema = Type.Object({
  itens: Type.Array(MovimentoBancoItemSchema),
  totais: Type.Object({
    quantidade: Type.Integer(),
    /** Soma de tudo (= Total movimento). */
    movimentoCents: Type.Integer(),
    /** Movimentos que liquidaram titulos do CP. */
    pagamentoCpCents: Type.Integer(),
    /** Despesa direta que entra no "Total pago" (Perna B). */
    despesaCents: Type.Integer(),
    /** Aplicacao/investimento/transferencia: so no "Total movimento". */
    financeiroCents: Type.Integer(),
    /** Devolucoes (DOC/CHEQUE DEVOLVIDO): valor NEGATIVO que neta o Total movimento. */
    devolucaoCents: Type.Integer(),
  }),
});
export type MovimentoBancoResponse = Static<typeof MovimentoBancoResponseSchema>;
