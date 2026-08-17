import { Type, type Static } from '@sinclair/typebox';
import { CONTA_RECEBER_STATUS, FAIXAS_AGING } from '../enums/conta-receber-status.js';

export { CONTA_RECEBER_STATUS, CONTA_RECEBER_STATUS_LABEL, FAIXAS_AGING, FAIXAS_AGING_LABEL } from '../enums/conta-receber-status.js';
export type { ContaReceberStatus, FaixaAging } from '../enums/conta-receber-status.js';

const StatusUnion = Type.Union(CONTA_RECEBER_STATUS.map((s) => Type.Literal(s)));
const FaixaUnion = Type.Union(FAIXAS_AGING.map((s) => Type.Literal(s)));

// ====================== LISTAGEM ======================

export const ContaReceberListQuerySchema = Type.Object({
  dtIni: Type.Optional(Type.String({ format: 'date' })),
  dtFim: Type.Optional(Type.String({ format: 'date' })),
  /**
   * Filtro por DATA DE RECEBIMENTO (RECEBIMENTOCRC). Quando preenchido, traz o
   * que foi RECEBIDO no periodo independente do vencimento (espelho do filtro de
   * pagamento do Contas a Pagar). Titulos nao recebidos tem data_recebimento
   * nula e ficam de fora. Intervalo inclusivo [dtRecIni, dtRecFim], como o de
   * vencimento. Quando ativo, o filtro de vencimento (dtIni/dtFim) e ignorado.
   */
  dtRecIni: Type.Optional(Type.String({ format: 'date' })),
  dtRecFim: Type.Optional(Type.String({ format: 'date' })),
  status: Type.Optional(Type.String({ maxLength: 200 })),
  faixa: Type.Optional(FaixaUnion),
  clienteId: Type.Optional(Type.String({ format: 'uuid' })),
  busca: Type.Optional(Type.String({ maxLength: 100 })),
  pagina: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  porPagina: Type.Optional(Type.Integer({ minimum: 10, maximum: 200, default: 50 })),
  ordenacao: Type.Optional(Type.Union([
    Type.Literal('vencimento_asc'),
    Type.Literal('vencimento_desc'),
    Type.Literal('valor_asc'),
    Type.Literal('valor_desc'),
  ])),
});
export type ContaReceberListQuery = Static<typeof ContaReceberListQuerySchema>;

export const ContaReceberItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  cliente: Type.Union([
    Type.Object({
      id: Type.String({ format: 'uuid' }),
      razaoSocial: Type.String(),
      nomeFantasia: Type.Union([Type.String(), Type.Null()]),
      numeroInscricao: Type.Union([Type.String(), Type.Null()]),
    }),
    Type.Null(),
  ]),
  numeroDocumento: Type.Union([Type.String(), Type.Null()]),
  serieDocumento: Type.Union([Type.String(), Type.Null()]),
  numeroParcela: Type.Union([Type.Integer(), Type.Null()]),
  tipoDocumento: Type.Union([Type.String(), Type.Null()]),
  dataEmissao: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  dataVencimento: Type.String({ format: 'date' }),
  dataVencimentoOriginal: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  dataRecebimento: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  valorBrutoCents: Type.Integer(),
  descontoCents: Type.Integer(),
  acrescimoCents: Type.Integer(),
  retencoes: Type.Object({
    inssCents: Type.Integer(),
    irrfCents: Type.Integer(),
    pisCents: Type.Integer(),
    cofinsCents: Type.Integer(),
    csllCents: Type.Integer(),
    issCents: Type.Integer(),
    totalCents: Type.Integer(),
  }),
  valorLiquidoCents: Type.Integer(),
  status: StatusUnion,
  quitado: Type.Boolean(),
  renegociado: Type.Boolean(),
  protestado: Type.Boolean(),
  faturaImpressa: Type.Boolean(),
  nossoNumero: Type.Union([Type.String(), Type.Null()]),
  observacao: Type.Union([Type.String(), Type.Null()]),
});
export type ContaReceberItem = Static<typeof ContaReceberItemSchema>;

export const ContaReceberListResponseSchema = Type.Object({
  itens: Type.Array(ContaReceberItemSchema),
  total: Type.Integer(),
  pagina: Type.Integer(),
  porPagina: Type.Integer(),
  totalPaginas: Type.Integer(),
});
export type ContaReceberListResponse = Static<typeof ContaReceberListResponseSchema>;

// ====================== SUMÁRIO ======================

export const SumarioContasReceberQuerySchema = Type.Object({
  dtIni: Type.Optional(Type.String({ format: 'date' })),
  dtFim: Type.Optional(Type.String({ format: 'date' })),
});
export type SumarioContasReceberQuery = Static<typeof SumarioContasReceberQuerySchema>;

export const PorStatusSchema = Type.Object({
  status: StatusUnion,
  qtd: Type.Integer(),
  valorCents: Type.Integer(),
});

export const FaixaAgingItemSchema = Type.Object({
  faixa: FaixaUnion,
  qtd: Type.Integer(),
  valorCents: Type.Integer(),
});

export const TopClienteSchema = Type.Object({
  clienteId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  razaoSocial: Type.String(),
  qtd: Type.Integer(),
  valorCents: Type.Integer(),
});

export const SumarioContasReceberResponseSchema = Type.Object({
  totais: Type.Object({
    qtd: Type.Integer(),
    qtdAberto: Type.Integer(),
    qtdRecebido: Type.Integer(),
    qtdCancelado: Type.Integer(),
    valorBrutoCents: Type.Integer(),
    valorAbertoCents: Type.Integer(),
    valorRecebidoCents: Type.Integer(),
    valorAtrasadoCents: Type.Integer(),
  }),
  porStatus: Type.Array(PorStatusSchema),
  aging: Type.Array(FaixaAgingItemSchema),
  topClientes: Type.Array(TopClienteSchema),
});
export type SumarioContasReceberResponse = Static<typeof SumarioContasReceberResponseSchema>;

// ====================== SYNC ======================

export const SyncContasReceberBodySchema = Type.Object({
  dtIni: Type.Optional(Type.String({ format: 'date' })),
  dtFim: Type.Optional(Type.String({ format: 'date' })),
});
export type SyncContasReceberBody = Static<typeof SyncContasReceberBodySchema>;

export const SyncContasReceberResponseSchema = Type.Object({
  jobId: Type.String({ format: 'uuid' }),
  status: Type.Union([Type.Literal('ok'), Type.Literal('parcial'), Type.Literal('erro')]),
  clientesLidos: Type.Integer(),
  clientesGravados: Type.Integer(),
  titulosLidos: Type.Integer(),
  titulosGravados: Type.Integer(),
  itensLidos: Type.Integer(),
  itensGravados: Type.Integer(),
  duracaoMs: Type.Integer(),
  mensagem: Type.Optional(Type.String()),
});
export type SyncContasReceberResponse = Static<typeof SyncContasReceberResponseSchema>;

export const SyncInfoCrSchema = Type.Object({
  ultimoSyncEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  totalLocal: Type.Integer(),
  totalClientes: Type.Integer(),
  precisaSincronizar: Type.Boolean(),
});
export type SyncInfoCr = Static<typeof SyncInfoCrSchema>;
