import { Type, type Static } from '@sinclair/typebox';

export const REGUA_CANAL = ['email', 'whatsapp', 'sms'] as const;
export type ReguaCanal = (typeof REGUA_CANAL)[number];

export const REGUA_TOM = ['cordial', 'formal', 'severo'] as const;
export type ReguaTom = (typeof REGUA_TOM)[number];

const CanalUnion = Type.Union(REGUA_CANAL.map((c) => Type.Literal(c)));
const TomUnion = Type.Union(REGUA_TOM.map((t) => Type.Literal(t)));

export const ReguaTemplateSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  nome: Type.String(),
  canal: CanalUnion,
  gatilhoDiasVencimento: Type.Integer(),
  assunto: Type.Union([Type.String(), Type.Null()]),
  corpoTemplate: Type.String(),
  ativo: Type.Boolean(),
  tom: TomUnion,
  criadoEm: Type.String({ format: 'date-time' }),
  atualizadoEm: Type.String({ format: 'date-time' }),
});
export type ReguaTemplate = Static<typeof ReguaTemplateSchema>;

export const ReguaTemplateCreateSchema = Type.Object({
  nome: Type.String({ minLength: 1, maxLength: 100 }),
  canal: CanalUnion,
  gatilhoDiasVencimento: Type.Integer({ minimum: -90, maximum: 365 }),
  assunto: Type.Optional(Type.String({ maxLength: 200 })),
  corpoTemplate: Type.String({ minLength: 10, maxLength: 5000 }),
  ativo: Type.Optional(Type.Boolean()),
  tom: Type.Optional(TomUnion),
});
export type ReguaTemplateCreate = Static<typeof ReguaTemplateCreateSchema>;

export const ReguaTemplateUpdateSchema = Type.Partial(ReguaTemplateCreateSchema);
export type ReguaTemplateUpdate = Static<typeof ReguaTemplateUpdateSchema>;

export const ReguaTemplatesListResponseSchema = Type.Object({
  itens: Type.Array(ReguaTemplateSchema),
});
export type ReguaTemplatesListResponse = Static<typeof ReguaTemplatesListResponseSchema>;

export const ReguaEnvioSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  contaReceberId: Type.String({ format: 'uuid' }),
  numeroDocumentoCr: Type.Union([Type.String(), Type.Null()]),
  fornecedorClienteRazaoSocial: Type.Union([Type.String(), Type.Null()]),
  templateId: Type.String({ format: 'uuid' }),
  templateNome: Type.String(),
  canal: CanalUnion,
  destinatario: Type.String(),
  assunto: Type.Union([Type.String(), Type.Null()]),
  corpoRendered: Type.String(),
  modo: Type.Union([Type.Literal('simulado'), Type.Literal('real')]),
  status: Type.Union([
    Type.Literal('enviado'),
    Type.Literal('falha'),
    Type.Literal('aberto'),
    Type.Literal('clicado'),
  ]),
  mensagemErro: Type.Union([Type.String(), Type.Null()]),
  enviadoEm: Type.String({ format: 'date-time' }),
  diasVencidosNoEnvio: Type.Integer(),
});
export type ReguaEnvio = Static<typeof ReguaEnvioSchema>;

export const ReguaEnviosListResponseSchema = Type.Object({
  itens: Type.Array(ReguaEnvioSchema),
  total: Type.Integer(),
});
export type ReguaEnviosListResponse = Static<typeof ReguaEnviosListResponseSchema>;

export const ReguaSimularResponseSchema = Type.Object({
  diaReferencia: Type.String({ format: 'date' }),
  modo: Type.Union([Type.Literal('simulado'), Type.Literal('real')]),
  crsAnalisados: Type.Integer(),
  templatesAtivos: Type.Integer(),
  enviosGerados: Type.Integer(),
  enviosPulados: Type.Integer(),
  duracaoMs: Type.Integer(),
});
export type ReguaSimularResponse = Static<typeof ReguaSimularResponseSchema>;
