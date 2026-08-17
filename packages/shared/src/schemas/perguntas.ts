import { Type, type Static } from '@sinclair/typebox';

/**
 * Perguntas ao financeiro/contabilidade. As PERGUNTAS vêm do roadmap
 * (module-status, no frontend); o banco guarda só as RESPOSTAS, amarradas pela
 * `chave` estável da pergunta. Perguntas avulsas (criadas na mão) também vivem
 * aqui, com chave própria.
 */

export const PerguntaItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  chave: Type.Union([Type.String(), Type.Null()]),
  modulo: Type.Union([Type.String(), Type.Null()]),
  moduloNome: Type.Union([Type.String(), Type.Null()]),
  categoria: Type.Union([Type.String(), Type.Null()]),
  pergunta: Type.String(),
  contexto: Type.Union([Type.String(), Type.Null()]),
  resposta: Type.Union([Type.String(), Type.Null()]),
  status: Type.String(),
  prioridade: Type.Integer(),
  respondidoPorNome: Type.Union([Type.String(), Type.Null()]),
  respondidoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  criadoEm: Type.String({ format: 'date-time' }),
});
export type PerguntaItem = Static<typeof PerguntaItemSchema>;

/** Lista todas as linhas do banco (respostas + perguntas avulsas). */
export const PerguntasListResponseSchema = Type.Object({
  itens: Type.Array(PerguntaItemSchema),
});
export type PerguntasListResponse = Static<typeof PerguntasListResponseSchema>;

/** Responder/atualizar por chave (upsert). A pergunta/módulo vêm do roadmap. */
export const ResponderPerguntaBodySchema = Type.Object({
  chave: Type.String({ minLength: 1, maxLength: 80 }),
  pergunta: Type.String({ minLength: 1, maxLength: 2000 }),
  modulo: Type.Optional(Type.Union([Type.String({ maxLength: 60 }), Type.Null()])),
  moduloNome: Type.Optional(Type.Union([Type.String({ maxLength: 80 }), Type.Null()])),
  contexto: Type.Optional(Type.Union([Type.String({ maxLength: 2000 }), Type.Null()])),
  resposta: Type.String({ minLength: 1, maxLength: 5000 }),
});
export type ResponderPerguntaBody = Static<typeof ResponderPerguntaBodySchema>;

/** Cria uma pergunta avulsa (fora do roadmap). */
export const CriarPerguntaBodySchema = Type.Object({
  pergunta: Type.String({ minLength: 3, maxLength: 2000 }),
  contexto: Type.Optional(Type.String({ maxLength: 2000 })),
  moduloNome: Type.Optional(Type.String({ maxLength: 80 })),
});
export type CriarPerguntaBody = Static<typeof CriarPerguntaBodySchema>;

export const ArquivarPerguntaBodySchema = Type.Object({
  chave: Type.String({ minLength: 1, maxLength: 80 }),
});
export type ArquivarPerguntaBody = Static<typeof ArquivarPerguntaBodySchema>;

export const PerguntaMutacaoResponseSchema = Type.Object({
  ok: Type.Boolean(),
  item: PerguntaItemSchema,
});
export type PerguntaMutacaoResponse = Static<typeof PerguntaMutacaoResponseSchema>;
