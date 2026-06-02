import { Type, type Static } from '@sinclair/typebox';

export const APROVACAO_DECISAO = ['aprovado', 'rejeitado'] as const;
export type AprovacaoDecisao = (typeof APROVACAO_DECISAO)[number];

const DecisaoUnion = Type.Union(APROVACAO_DECISAO.map((d) => Type.Literal(d)));

/**
 * Item retornado na lista de pendentes (CP que aguarda aprovacao CFO).
 * Inclui dados resumidos do CP pra UI mostrar sem JOIN adicional no frontend.
 */
export const AprovacaoCpPendenteSchema = Type.Object({
  contaPagarId: Type.String({ format: 'uuid' }),
  numeroDocumento: Type.Union([Type.String(), Type.Null()]),
  serieDocumento: Type.Union([Type.String(), Type.Null()]),
  numeroParcela: Type.Union([Type.Integer(), Type.Null()]),
  tipoDocumento: Type.Union([Type.String(), Type.Null()]),
  dataEmissao: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  dataVencimento: Type.String({ format: 'date' }),
  valorAPagarCents: Type.Integer(),
  status: Type.String(),
  origemDocumento: Type.String(),
  fornecedor: Type.Union([
    Type.Object({
      id: Type.String({ format: 'uuid' }),
      razaoSocial: Type.String(),
      nomeFantasia: Type.Union([Type.String(), Type.Null()]),
    }),
    Type.Null(),
  ]),
  diasParaVencer: Type.Integer(),
});
export type AprovacaoCpPendente = Static<typeof AprovacaoCpPendenteSchema>;

export const AprovacoesCpPendentesResponseSchema = Type.Object({
  itens: Type.Array(AprovacaoCpPendenteSchema),
  total: Type.Integer(),
});
export type AprovacoesCpPendentesResponse = Static<typeof AprovacoesCpPendentesResponseSchema>;

/**
 * Request: aprovar ou rejeitar um CP.
 * - senha: re-confirma identidade (mesmo padrao de operacoes sensiveis)
 * - justificativa: obrigatoria em rejeicao; opcional em aprovacao
 */
export const AprovacaoCpDecisaoBodySchema = Type.Object({
  contaPagarId: Type.String({ format: 'uuid' }),
  decisao: DecisaoUnion,
  senha: Type.String({ minLength: 4, maxLength: 200 }),
  justificativa: Type.Optional(Type.String({ maxLength: 2000 })),
});
export type AprovacaoCpDecisaoBody = Static<typeof AprovacaoCpDecisaoBodySchema>;

export const AprovacaoCpRegistroSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  contaPagarId: Type.String({ format: 'uuid' }),
  aprovador: Type.Object({
    id: Type.String({ format: 'uuid' }),
    nome: Type.String(),
    email: Type.String(),
  }),
  decisao: DecisaoUnion,
  justificativa: Type.Union([Type.String(), Type.Null()]),
  assinaturaHash: Type.String(),
  ip: Type.Union([Type.String(), Type.Null()]),
  criadoEm: Type.String({ format: 'date-time' }),
});
export type AprovacaoCpRegistro = Static<typeof AprovacaoCpRegistroSchema>;

export const AprovacaoCpDecisaoResponseSchema = Type.Object({
  ok: Type.Boolean(),
  aprovacao: AprovacaoCpRegistroSchema,
  contaPagarStatusNovo: Type.String(),
});
export type AprovacaoCpDecisaoResponse = Static<typeof AprovacaoCpDecisaoResponseSchema>;

export const AprovacoesCpDoTituloResponseSchema = Type.Object({
  itens: Type.Array(AprovacaoCpRegistroSchema),
});
export type AprovacoesCpDoTituloResponse = Static<typeof AprovacoesCpDoTituloResponseSchema>;
