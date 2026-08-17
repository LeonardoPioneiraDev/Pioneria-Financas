import { Type, type Static } from '@sinclair/typebox';

// ============================================================================
// FERIADOS — calendario. `recorrente` = repete todo ano (mesmo mes/dia). Usado
// pela projecao do Fluxo de Caixa (marca o dia, sem alterar valores).
// ============================================================================

export const TIPO_FERIADO = ['nacional', 'estadual', 'municipal', 'facultativo', 'empresa'] as const;
export type TipoFeriado = (typeof TIPO_FERIADO)[number];

const TipoFeriadoSchema = Type.Union(TIPO_FERIADO.map((t) => Type.Literal(t)));

export const FeriadoItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  data: Type.String({ format: 'date' }),
  nome: Type.String(),
  tipo: TipoFeriadoSchema,
  recorrente: Type.Boolean(),
});
export type FeriadoItem = Static<typeof FeriadoItemSchema>;

export const FeriadosListResponseSchema = Type.Object({
  itens: Type.Array(FeriadoItemSchema),
});
export type FeriadosListResponse = Static<typeof FeriadosListResponseSchema>;

export const FeriadosListQuerySchema = Type.Object({
  /** Ano para expandir os recorrentes (default = ano corrente). */
  ano: Type.Optional(Type.Integer({ minimum: 2000, maximum: 2100 })),
});
export type FeriadosListQuery = Static<typeof FeriadosListQuerySchema>;

export const CriarFeriadoBodySchema = Type.Object({
  data: Type.String({ format: 'date' }),
  nome: Type.String({ minLength: 1, maxLength: 120 }),
  tipo: Type.Optional(TipoFeriadoSchema),
  recorrente: Type.Optional(Type.Boolean()),
});
export type CriarFeriadoBody = Static<typeof CriarFeriadoBodySchema>;

export const AtualizarFeriadoBodySchema = Type.Object({
  data: Type.Optional(Type.String({ format: 'date' })),
  nome: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
  tipo: Type.Optional(TipoFeriadoSchema),
  recorrente: Type.Optional(Type.Boolean()),
});
export type AtualizarFeriadoBody = Static<typeof AtualizarFeriadoBodySchema>;

export const FeriadoMutacaoResponseSchema = Type.Object({
  ok: Type.Boolean(),
  item: Type.Optional(FeriadoItemSchema),
});
export type FeriadoMutacaoResponse = Static<typeof FeriadoMutacaoResponseSchema>;
