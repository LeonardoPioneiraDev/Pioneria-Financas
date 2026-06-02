import { Type, type Static } from '@sinclair/typebox';

/**
 * Bancos suportados na geracao CNAB MVP (lista refinada apos confirmar com financeiro
 * quais a Pioneira usa). Codigos FEBRABAN oficiais.
 */
export const BANCOS_CNAB = [
  { codigo: '001', nome: 'Banco do Brasil' },
  { codigo: '033', nome: 'Santander' },
  { codigo: '104', nome: 'Caixa Economica Federal' },
  { codigo: '237', nome: 'Bradesco' },
  { codigo: '341', nome: 'Itau' },
  { codigo: '422', nome: 'Safra' },
  { codigo: '748', nome: 'Sicredi' },
  { codigo: '756', nome: 'Sicoob' },
] as const;

export const CnabStatusUnion = Type.Union([
  Type.Literal('gerado'),
  Type.Literal('enviado'),
  Type.Literal('processado'),
]);

export const CpElegivelCnabSchema = Type.Object({
  contaPagarId: Type.String({ format: 'uuid' }),
  numeroDocumento: Type.Union([Type.String(), Type.Null()]),
  numeroParcela: Type.Union([Type.Integer(), Type.Null()]),
  dataVencimento: Type.String({ format: 'date' }),
  valorAPagarCents: Type.Integer(),
  status: Type.String(),
  fornecedor: Type.Union([
    Type.Object({
      id: Type.String({ format: 'uuid' }),
      razaoSocial: Type.String(),
      cnpjCpf: Type.Union([Type.String(), Type.Null()]),
    }),
    Type.Null(),
  ]),
  diasParaVencer: Type.Integer(),
});
export type CpElegivelCnab = Static<typeof CpElegivelCnabSchema>;

export const ElegiveisCnabResponseSchema = Type.Object({
  itens: Type.Array(CpElegivelCnabSchema),
  total: Type.Integer(),
  totalValorCents: Type.Integer(),
});
export type ElegiveisCnabResponse = Static<typeof ElegiveisCnabResponseSchema>;

export const GerarCnabBodySchema = Type.Object({
  bancoCodigo: Type.String({ minLength: 3, maxLength: 3 }),
  titulosIds: Type.Array(Type.String({ format: 'uuid' }), { minItems: 1, maxItems: 500 }),
  observacao: Type.Optional(Type.String({ maxLength: 500 })),
});
export type GerarCnabBody = Static<typeof GerarCnabBodySchema>;

export const RemessaCnabResumoSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  bancoCodigo: Type.String(),
  bancoNome: Type.String(),
  sequencial: Type.Integer(),
  layout: Type.String(),
  arquivoNome: Type.String(),
  qtdTitulos: Type.Integer(),
  valorTotalCents: Type.Integer(),
  status: CnabStatusUnion,
  observacao: Type.Union([Type.String(), Type.Null()]),
  geradoEm: Type.String({ format: 'date-time' }),
});
export type RemessaCnabResumo = Static<typeof RemessaCnabResumoSchema>;

export const GerarCnabResponseSchema = Type.Object({
  ok: Type.Boolean(),
  remessa: RemessaCnabResumoSchema,
  /** Conteudo do arquivo em texto (240 chars por linha). Frontend gera download. */
  arquivoConteudo: Type.String(),
});
export type GerarCnabResponse = Static<typeof GerarCnabResponseSchema>;

export const RemessasCnabListResponseSchema = Type.Object({
  itens: Type.Array(RemessaCnabResumoSchema),
});
export type RemessasCnabListResponse = Static<typeof RemessasCnabListResponseSchema>;
