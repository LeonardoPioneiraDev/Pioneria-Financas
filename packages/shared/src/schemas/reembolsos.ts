import { Type, type Static } from '@sinclair/typebox';
import { REEMBOLSO_STATUS, type ReembolsoStatus } from '../enums/reembolso-status.js';

export { REEMBOLSO_STATUS, type ReembolsoStatus };

const StatusUnion = Type.Union(REEMBOLSO_STATUS.map((s) => Type.Literal(s)));

/** Resumo do título de Contas a Pagar que originou o reembolso (o elo CP → recebível). */
export const ReembolsoContaPagarSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  numeroDocumento: Type.Union([Type.String(), Type.Null()]),
  tipoDocumento: Type.Union([Type.String(), Type.Null()]),
  fornecedorNome: Type.Union([Type.String(), Type.Null()]),
  dataPagamento: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  dataVencimento: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  valorAPagarCents: Type.Integer(),
  observacao: Type.Union([Type.String(), Type.Null()]),
});
export type ReembolsoContaPagar = Static<typeof ReembolsoContaPagarSchema>;

/** Crédito do extrato (banco_movto) amarrado ao reembolso quando o devedor pagou — a prova. */
export const ReembolsoCreditoSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  dataMovto: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  valorCents: Type.Integer(),
  descHistoBco: Type.Union([Type.String(), Type.Null()]),
  docMovtoBco: Type.Union([Type.String(), Type.Null()]),
  codBanco: Type.Union([Type.Integer(), Type.Null()]),
  codAgencia: Type.Union([Type.Integer(), Type.Null()]),
  codContaBco: Type.Union([Type.String(), Type.Null()]),
  contaNome: Type.Union([Type.String(), Type.Null()]),
  /**
   * Confiança do casamento automático (só nos CANDIDATOS de baixa). 'alta' = vários
   * sinais batem (valor + entrou depois do pagamento + cita o devedor/multa); 'baixa'
   * = só o valor coincide. Ausente no crédito já amarrado.
   */
  confianca: Type.Optional(Type.Union([Type.Literal('alta'), Type.Literal('media'), Type.Literal('baixa')])),
  /** Motivos legíveis que sustentam a confiança (ex.: "Entrou 4 dias após o pagamento"). */
  motivos: Type.Optional(Type.Array(Type.String())),
});
export type ReembolsoCredito = Static<typeof ReembolsoCreditoSchema>;

export const ReembolsoResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  status: StatusUnion,
  contaPagar: Type.Union([ReembolsoContaPagarSchema, Type.Null()]),
  /** Quem deve (funcionário / terceiro). */
  devedorNome: Type.Union([Type.String(), Type.Null()]),
  devedorDocumento: Type.Union([Type.String(), Type.Null()]),
  devedorMatricula: Type.Union([Type.String(), Type.Null()]),
  motivo: Type.Union([Type.String(), Type.Null()]),
  /** Valor a receber (default = valor a pagar do título, editável). */
  valorCents: Type.Integer(),
  /** Valor efetivamente recebido (quando baixado). */
  recebidoCents: Type.Union([Type.Integer(), Type.Null()]),
  dataPrevista: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  dataRecebimento: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  /** Crédito do extrato amarrado na baixa (rastreabilidade). */
  credito: Type.Union([ReembolsoCreditoSchema, Type.Null()]),
  observacao: Type.Union([Type.String(), Type.Null()]),
  criadoEm: Type.String({ format: 'date-time' }),
  atualizadoEm: Type.String({ format: 'date-time' }),
});
export type ReembolsoResponse = Static<typeof ReembolsoResponseSchema>;

export const ReembolsoListQuerySchema = Type.Object({
  /** Filtra por status (lista separada por vírgula). Vazio = todos menos descartado. */
  status: Type.Optional(Type.String({ maxLength: 60 })),
  busca: Type.Optional(Type.String({ maxLength: 100 })),
  pagina: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  porPagina: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
});
export type ReembolsoListQuery = Static<typeof ReembolsoListQuerySchema>;

export const ReembolsoTotaisSchema = Type.Object({
  /** A receber (pendente + cobrado): o que ainda não voltou. */
  aReceberCents: Type.Integer(),
  aReceberQtd: Type.Integer(),
  recebidoCents: Type.Integer(),
  recebidoQtd: Type.Integer(),
});
export type ReembolsoTotais = Static<typeof ReembolsoTotaisSchema>;

export const ReembolsoListResponseSchema = Type.Object({
  itens: Type.Array(ReembolsoResponseSchema),
  total: Type.Integer(),
  pagina: Type.Integer(),
  porPagina: Type.Integer(),
  totalPaginas: Type.Integer(),
  totais: ReembolsoTotaisSchema,
});
export type ReembolsoListResponse = Static<typeof ReembolsoListResponseSchema>;

/**
 * Candidatos a reembolso: títulos de Contas a Pagar que PARECEM ressarcíveis
 * (heurística por fornecedor / observação — multa, infração, avaria, ressarcimento)
 * e que ainda NÃO têm reembolso. O usuário confirma (vira reembolso) ou descarta.
 */
export const ReembolsoCandidatosQuerySchema = Type.Object({
  busca: Type.Optional(Type.String({ maxLength: 100 })),
  dtIni: Type.Optional(Type.String({ format: 'date' })),
  dtFim: Type.Optional(Type.String({ format: 'date' })),
  pagina: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  porPagina: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
});
export type ReembolsoCandidatosQuery = Static<typeof ReembolsoCandidatosQuerySchema>;

export const ReembolsoCandidatoSchema = Type.Object({
  contaPagar: ReembolsoContaPagarSchema,
  /** Por que o sistema sugeriu (termo que casou). */
  motivoSugerido: Type.Union([Type.String(), Type.Null()]),
});
export type ReembolsoCandidato = Static<typeof ReembolsoCandidatoSchema>;

export const ReembolsoCandidatosResponseSchema = Type.Object({
  itens: Type.Array(ReembolsoCandidatoSchema),
  total: Type.Integer(),
  pagina: Type.Integer(),
  porPagina: Type.Integer(),
  totalPaginas: Type.Integer(),
});
export type ReembolsoCandidatosResponse = Static<typeof ReembolsoCandidatosResponseSchema>;

export const CriarReembolsoBodySchema = Type.Object({
  contaPagarId: Type.String({ format: 'uuid' }),
  devedorNome: Type.String({ minLength: 1, maxLength: 120 }),
  devedorDocumento: Type.Optional(Type.String({ maxLength: 20 })),
  devedorMatricula: Type.Optional(Type.String({ maxLength: 30 })),
  motivo: Type.Optional(Type.String({ maxLength: 200 })),
  /** Default = valor a pagar do título. */
  valorCents: Type.Optional(Type.Integer({ minimum: 0 })),
  dataPrevista: Type.Optional(Type.String({ format: 'date' })),
  observacao: Type.Optional(Type.String({ maxLength: 500 })),
});
export type CriarReembolsoBody = Static<typeof CriarReembolsoBodySchema>;

export const DescartarCandidatoBodySchema = Type.Object({
  contaPagarId: Type.String({ format: 'uuid' }),
  observacao: Type.Optional(Type.String({ maxLength: 200 })),
});
export type DescartarCandidatoBody = Static<typeof DescartarCandidatoBodySchema>;

export const AtualizarReembolsoBodySchema = Type.Object({
  status: Type.Optional(StatusUnion),
  devedorNome: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  devedorDocumento: Type.Optional(Type.Union([Type.String({ maxLength: 20 }), Type.Null()])),
  devedorMatricula: Type.Optional(Type.Union([Type.String({ maxLength: 30 }), Type.Null()])),
  motivo: Type.Optional(Type.Union([Type.String({ maxLength: 200 }), Type.Null()])),
  valorCents: Type.Optional(Type.Integer({ minimum: 0 })),
  dataPrevista: Type.Optional(Type.Union([Type.String({ format: 'date' }), Type.Null()])),
  observacao: Type.Optional(Type.Union([Type.String({ maxLength: 500 }), Type.Null()])),
});
export type AtualizarReembolsoBody = Static<typeof AtualizarReembolsoBodySchema>;

export const ReceberReembolsoBodySchema = Type.Object({
  dataRecebimento: Type.String({ format: 'date' }),
  /** Valor recebido (default = valor do reembolso). */
  recebidoCents: Type.Optional(Type.Integer({ minimum: 0 })),
  /** Crédito do extrato (banco_movto.id) que comprova o recebimento — opcional. */
  bancoMovtoId: Type.Optional(Type.Union([Type.String({ format: 'uuid' }), Type.Null()])),
  observacao: Type.Optional(Type.String({ maxLength: 500 })),
});
export type ReceberReembolsoBody = Static<typeof ReceberReembolsoBodySchema>;

/** Créditos do extrato (banco_movto) candidatos a amarrar na baixa do reembolso. */
export const ReembolsoCreditosCandidatosResponseSchema = Type.Object({
  itens: Type.Array(ReembolsoCreditoSchema),
});
export type ReembolsoCreditosCandidatosResponse = Static<typeof ReembolsoCreditosCandidatosResponseSchema>;
