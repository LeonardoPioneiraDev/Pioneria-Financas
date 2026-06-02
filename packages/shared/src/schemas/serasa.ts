import { Type, type Static } from '@sinclair/typebox';

const StatusUnion = Type.Union([
  Type.Literal('enviado'),
  Type.Literal('efetivado'),
  Type.Literal('baixado'),
  Type.Literal('recusado'),
]);

export const SerasaConsultaResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  clienteId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  clienteRazaoSocial: Type.Union([Type.String(), Type.Null()]),
  cnpjCpf: Type.Union([Type.String(), Type.Null()]),
  score: Type.Union([Type.Integer(), Type.Null()]),
  classificacao: Type.Union([
    Type.Literal('baixo_risco'),
    Type.Literal('medio_risco'),
    Type.Literal('alto_risco'),
    Type.Literal('sem_dados'),
  ]),
  temRestricao: Type.Union([Type.Boolean(), Type.Null()]),
  qtdRestricoes: Type.Integer(),
  valorRestricoesCents: Type.Integer(),
  observacao: Type.Union([Type.String(), Type.Null()]),
  modo: Type.Union([Type.Literal('mock'), Type.Literal('real')]),
  consultadoEm: Type.String({ format: 'date-time' }),
});
export type SerasaConsultaResponse = Static<typeof SerasaConsultaResponseSchema>;

export const ConsultarSerasaBodySchema = Type.Object({
  clienteId: Type.String({ format: 'uuid' }),
});
export type ConsultarSerasaBody = Static<typeof ConsultarSerasaBodySchema>;

export const SerasaNegativacaoSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  contaReceberId: Type.String({ format: 'uuid' }),
  numeroDocumentoCr: Type.Union([Type.String(), Type.Null()]),
  clienteId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  clienteRazaoSocial: Type.Union([Type.String(), Type.Null()]),
  protocoloSerasa: Type.Union([Type.String(), Type.Null()]),
  motivo: Type.String(),
  valorCents: Type.Integer(),
  status: StatusUnion,
  modo: Type.Union([Type.Literal('mock'), Type.Literal('real')]),
  enviadoEm: Type.String({ format: 'date-time' }),
  efetivadoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  baixadoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  observacao: Type.Union([Type.String(), Type.Null()]),
});
export type SerasaNegativacaoResponse = Static<typeof SerasaNegativacaoSchema>;

export const NegativarBodySchema = Type.Object({
  contaReceberId: Type.String({ format: 'uuid' }),
  motivo: Type.String({ minLength: 5, maxLength: 500 }),
});
export type NegativarBody = Static<typeof NegativarBodySchema>;

export const NegativacoesListResponseSchema = Type.Object({
  itens: Type.Array(SerasaNegativacaoSchema),
  total: Type.Integer(),
});
export type NegativacoesListResponse = Static<typeof NegativacoesListResponseSchema>;

export const ConsultasListResponseSchema = Type.Object({
  itens: Type.Array(SerasaConsultaResponseSchema),
});
export type ConsultasListResponse = Static<typeof ConsultasListResponseSchema>;

export const CandidatoNegativacaoSchema = Type.Object({
  contaReceberId: Type.String({ format: 'uuid' }),
  numeroDocumento: Type.Union([Type.String(), Type.Null()]),
  dataVencimento: Type.String({ format: 'date' }),
  valorCents: Type.Integer(),
  diasVencidos: Type.Integer(),
  cliente: Type.Union([
    Type.Object({
      id: Type.String({ format: 'uuid' }),
      razaoSocial: Type.String(),
      cnpjCpf: Type.Union([Type.String(), Type.Null()]),
    }),
    Type.Null(),
  ]),
});
export type CandidatoNegativacao = Static<typeof CandidatoNegativacaoSchema>;

export const CandidatosResponseSchema = Type.Object({
  itens: Type.Array(CandidatoNegativacaoSchema),
});
export type CandidatosResponse = Static<typeof CandidatosResponseSchema>;
