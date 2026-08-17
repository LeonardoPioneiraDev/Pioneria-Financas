import { Type, type Static } from '@sinclair/typebox';
import { NOTIFICACAO_TIPOS } from '../enums/notificacao.js';

const TipoSchema = Type.Union(NOTIFICACAO_TIPOS.map((t) => Type.Literal(t)));

export const NotificacaoSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  tipo: TipoSchema,
  titulo: Type.String(),
  mensagem: Type.String(),
  /** Chave (href) da funcionalidade a que se refere. */
  funcionalidade: Type.Union([Type.String(), Type.Null()]),
  /** Quem provocou o evento (o auditor que validou, o CFO que avalizou…). */
  atorNome: Type.Union([Type.String(), Type.Null()]),
  atorEmail: Type.Union([Type.String(), Type.Null()]),
  /** Para onde levar ao clicar. */
  link: Type.Union([Type.String(), Type.Null()]),
  lidaEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  criadoEm: Type.String({ format: 'date-time' }),
});
export type Notificacao = Static<typeof NotificacaoSchema>;

export const NotificacoesListResponseSchema = Type.Object({
  itens: Type.Array(NotificacaoSchema),
  naoLidas: Type.Integer(),
});
export type NotificacoesListResponse = Static<typeof NotificacoesListResponseSchema>;

export const NotificacoesListQuerySchema = Type.Object({
  /** Só as não lidas. Default: false (traz tudo, mais recentes primeiro). */
  apenasNaoLidas: Type.Optional(Type.Boolean()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 30 })),
});
export type NotificacoesListQuery = Static<typeof NotificacoesListQuerySchema>;

export const MarcarLidasBodySchema = Type.Object({
  /** IDs a marcar como lidas. Vazio/ausente = marca TODAS as do usuário. */
  ids: Type.Optional(Type.Array(Type.String({ format: 'uuid' }))),
});
export type MarcarLidasBody = Static<typeof MarcarLidasBodySchema>;

export const MarcarLidasResponseSchema = Type.Object({
  marcadas: Type.Integer(),
  naoLidas: Type.Integer(),
});
export type MarcarLidasResponse = Static<typeof MarcarLidasResponseSchema>;
