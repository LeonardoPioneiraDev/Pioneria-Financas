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

// ============================================================================
// CONSULTA DE LOGS (trilha de auditoria) — le o que ja e gravado.
// ============================================================================

/** Um campo alterado (diff): valor antes (`de`) e depois (`para`). */
export const AuditAlteracaoCampoSchema = Type.Object({
  campo: Type.String(),
  de: Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]),
  para: Type.Union([Type.String(), Type.Number(), Type.Boolean(), Type.Null()]),
});
export type AuditAlteracaoCampo = Static<typeof AuditAlteracaoCampoSchema>;

export const AuditAcessoItemSchema = Type.Object({
  id: Type.String(),
  usuarioId: Type.Union([Type.String(), Type.Null()]),
  usuarioNome: Type.Union([Type.String(), Type.Null()]),
  usuarioEmail: Type.Union([Type.String(), Type.Null()]),
  acao: Type.String(),
  recurso: Type.String(),
  recursoId: Type.Union([Type.String(), Type.Null()]),
  descricao: Type.Union([Type.String(), Type.Null()]),
  ipAddress: Type.Union([Type.String(), Type.Null()]),
  /** Dispositivo/navegador legivel (ex.: "Chrome · Windows"). Null se sem UA. */
  dispositivo: Type.Union([Type.String(), Type.Null()]),
  /** Categoria do dispositivo p/ icone: celular | tablet | desktop | bot | desconhecido. */
  dispositivoTipo: Type.Union([Type.String(), Type.Null()]),
  criadoEm: Type.String({ format: 'date-time' }),
  /** Diff campo-a-campo (so nas alteracoes). Null/vazio quando nao ha. */
  alteracoes: Type.Union([Type.Array(AuditAlteracaoCampoSchema), Type.Null()]),
});
export type AuditAcessoItem = Static<typeof AuditAcessoItemSchema>;

export const AuditAcessosQuerySchema = Type.Object({
  usuarioId: Type.Optional(Type.String()),
  acao: Type.Optional(Type.String()),
  recurso: Type.Optional(Type.String()),
  /** true = so acoes de ALTERACAO (editou/aprovou/rejeitou/sincronizou). */
  somenteAlteracoes: Type.Optional(Type.Boolean()),
  dtIni: Type.Optional(Type.String({ format: 'date' })),
  dtFim: Type.Optional(Type.String({ format: 'date' })),
  busca: Type.Optional(Type.String()),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
});
export type AuditAcessosQuery = Static<typeof AuditAcessosQuerySchema>;

export const AuditAcessosResponseSchema = Type.Object({
  itens: Type.Array(AuditAcessoItemSchema),
  total: Type.Integer(),
  page: Type.Integer(),
  pageSize: Type.Integer(),
});
export type AuditAcessosResponse = Static<typeof AuditAcessosResponseSchema>;

export const AuditAtividadeItemSchema = Type.Object({
  id: Type.String(),
  usuarioId: Type.Union([Type.String(), Type.Null()]),
  usuarioNome: Type.Union([Type.String(), Type.Null()]),
  usuarioEmail: Type.Union([Type.String(), Type.Null()]),
  activityType: Type.String(),
  ipAddress: Type.Union([Type.String(), Type.Null()]),
  /** Dispositivo/navegador legivel (ex.: "Safari · iPhone"). Null se sem UA. */
  dispositivo: Type.Union([Type.String(), Type.Null()]),
  dispositivoTipo: Type.Union([Type.String(), Type.Null()]),
  criadoEm: Type.String({ format: 'date-time' }),
});
export type AuditAtividadeItem = Static<typeof AuditAtividadeItemSchema>;

export const AuditAtividadeQuerySchema = Type.Object({
  usuarioId: Type.Optional(Type.String()),
  activityType: Type.Optional(Type.String()),
  dtIni: Type.Optional(Type.String({ format: 'date' })),
  dtFim: Type.Optional(Type.String({ format: 'date' })),
  page: Type.Optional(Type.Integer({ minimum: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
});
export type AuditAtividadeQuery = Static<typeof AuditAtividadeQuerySchema>;

export const AuditAtividadeResponseSchema = Type.Object({
  itens: Type.Array(AuditAtividadeItemSchema),
  total: Type.Integer(),
  page: Type.Integer(),
  pageSize: Type.Integer(),
});
export type AuditAtividadeResponse = Static<typeof AuditAtividadeResponseSchema>;

export const AuditResumoQuerySchema = Type.Object({
  dias: Type.Optional(Type.Integer({ minimum: 1, maximum: 365 })),
});
export type AuditResumoQuery = Static<typeof AuditResumoQuerySchema>;

/** KPIs + opcoes de filtro (recursos/usuarios distintos) numa chamada so. */
export const AuditResumoResponseSchema = Type.Object({
  periodoDias: Type.Integer(),
  totalAcessos: Type.Integer(),
  totalAlteracoes: Type.Integer(),
  totalAtividade: Type.Integer(),
  usuariosAtivos: Type.Integer(),
  porAcao: Type.Array(Type.Object({ acao: Type.String(), qtd: Type.Integer() })),
  recursos: Type.Array(Type.String()),
  usuarios: Type.Array(Type.Object({ id: Type.String(), nome: Type.String() })),
});
export type AuditResumoResponse = Static<typeof AuditResumoResponseSchema>;
