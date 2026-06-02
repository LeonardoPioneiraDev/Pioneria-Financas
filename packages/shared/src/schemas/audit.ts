import { Type, type Static } from '@sinclair/typebox';

/** Versao corrente do termo de comprometimento. Trocar para forcar re-aceite. */
export const VERSAO_TERMO_ATUAL = '2026.05.1';

export const TermoStatusResponseSchema = Type.Object({
  versaoAtual: Type.String(),
  aceito: Type.Boolean(),
  aceitoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  nomeDigitado: Type.Union([Type.String(), Type.Null()]),
});
export type TermoStatusResponse = Static<typeof TermoStatusResponseSchema>;

export const AceitarTermoBodySchema = Type.Object({
  nomeDigitado: Type.String({ minLength: 3, maxLength: 200 }),
});
export type AceitarTermoBody = Static<typeof AceitarTermoBodySchema>;

export const AceitarTermoResponseSchema = Type.Object({
  ok: Type.Boolean(),
  versaoAceita: Type.String(),
  aceitoEm: Type.String({ format: 'date-time' }),
});
export type AceitarTermoResponse = Static<typeof AceitarTermoResponseSchema>;

export const ACAO_AUDITORIA = [
  'visualizou',
  'imprimiu',
  'exportou',
  'filtrou',
  'editou',
  'aprovou',
  'rejeitou',
  'sincronizou',
] as const;
export type AcaoAuditoria = (typeof ACAO_AUDITORIA)[number];

export const RegistrarAcessoBodySchema = Type.Object({
  acao: Type.Union(ACAO_AUDITORIA.map((a) => Type.Literal(a))),
  recurso: Type.String({ minLength: 1, maxLength: 80 }),
  recursoId: Type.Optional(Type.String({ maxLength: 100 })),
  descricao: Type.Optional(Type.String({ maxLength: 500 })),
  filtros: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
export type RegistrarAcessoBody = Static<typeof RegistrarAcessoBodySchema>;

export const RegistrarAcessoResponseSchema = Type.Object({
  ok: Type.Boolean(),
});
export type RegistrarAcessoResponse = Static<typeof RegistrarAcessoResponseSchema>;
