import { Type, type Static } from '@sinclair/typebox';
import { USER_ROLES } from '../enums/user-role.js';
import { PERMISSOES } from '../enums/permissao.js';

const UserRoleSchema = Type.Union(USER_ROLES.map((r) => Type.Literal(r)));
const PermissoesSchema = Type.Array(Type.Union(PERMISSOES.map((p) => Type.Literal(p))));

/** Progresso de uma funcionalidade na liberação progressiva (timestamps). */
export const ProgressoFuncionalidadeSchema = Type.Object({
  /** Quando o usuário abriu a funcionalidade pela 1ª vez (inicia o relógio das horas). */
  primeiroAcessoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  /** Quando validou (null = ainda não). Serve para "quem validou e quando". */
  validadoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  /** Texto livre do usuário na validação: o que dá pra melhorar / observações. */
  justificativa: Type.Union([Type.String(), Type.Null()]),
});
export type ProgressoFuncionalidade = Static<typeof ProgressoFuncionalidadeSchema>;

/** Mapa chave(href) → progresso. */
export const ProgressoFuncionalidadesSchema = Type.Record(Type.String(), ProgressoFuncionalidadeSchema);
export type ProgressoFuncionalidades = Static<typeof ProgressoFuncionalidadesSchema>;

export const UserCreatePayloadSchema = Type.Object({
  email: Type.String({ format: 'email', maxLength: 255 }),
  nomeCompleto: Type.String({ minLength: 3, maxLength: 200 }),
  role: UserRoleSchema,
  /** Permissoes de funcionalidade concedidas (default: nenhuma). */
  permissoes: Type.Optional(PermissoesSchema),
});
export type UserCreatePayload = Static<typeof UserCreatePayloadSchema>;

export const UserUpdatePayloadSchema = Type.Object({
  nomeCompleto: Type.Optional(Type.String({ minLength: 3, maxLength: 200 })),
  email: Type.Optional(Type.String({ format: 'email', maxLength: 255 })),
  role: Type.Optional(UserRoleSchema),
  ativo: Type.Optional(Type.Boolean()),
  permissoes: Type.Optional(PermissoesSchema),
  /** Liga a liberação progressiva (o menu passa a mostrar só as liberadas). */
  liberacaoProgressiva: Type.Optional(Type.Boolean()),
  /** Funcionalidades (hrefs) que o admin atribui ao usuário validar/ver. */
  funcionalidadesAtribuidas: Type.Optional(Type.Array(Type.String())),
});
export type UserUpdatePayload = Static<typeof UserUpdatePayloadSchema>;

export const UserResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  email: Type.String({ format: 'email' }),
  nomeCompleto: Type.String(),
  role: UserRoleSchema,
  permissoes: PermissoesSchema,
  /** Liberação progressiva ligada? */
  liberacaoProgressiva: Type.Boolean(),
  /** Funcionalidades atribuídas pelo admin (hrefs). */
  funcionalidadesAtribuidas: Type.Array(Type.String()),
  /** Funcionalidades já validadas pelo usuário (hrefs). */
  funcionalidadesValidadas: Type.Array(Type.String()),
  /** Progresso com timestamps (1º acesso / validação) por funcionalidade. */
  progressoFuncionalidades: ProgressoFuncionalidadesSchema,
  ativo: Type.Boolean(),
  ultimoLoginEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  criadoEm: Type.String({ format: 'date-time' }),
  atualizadoEm: Type.String({ format: 'date-time' }),
});
export type UserResponse = Static<typeof UserResponseSchema>;

export const ValidarFuncionalidadeBodySchema = Type.Object({
  /** Href da funcionalidade que o usuário está validando (deve ser a "próxima"). */
  chave: Type.String({ maxLength: 80 }),
  /** Feedback livre do usuário: o que dá pra melhorar / observações. Opcional. */
  justificativa: Type.Optional(Type.String({ maxLength: 1000 })),
});
export type ValidarFuncionalidadeBody = Static<typeof ValidarFuncionalidadeBodySchema>;

export const ValidarFuncionalidadeResponseSchema = Type.Object({
  funcionalidadesValidadas: Type.Array(Type.String()),
  funcionalidadesLiberadas: Type.Array(Type.String()),
});
export type ValidarFuncionalidadeResponse = Static<typeof ValidarFuncionalidadeResponseSchema>;

/** Registra que o usuário abriu uma funcionalidade (inicia o relógio das horas). */
export const RegistrarAcessoFuncionalidadeBodySchema = Type.Object({
  chave: Type.String({ maxLength: 80 }),
});
export type RegistrarAcessoFuncionalidadeBody = Static<typeof RegistrarAcessoFuncionalidadeBodySchema>;

/**
 * Resposta da CRIAÇÃO: como não há envio de e-mail (não configurado), o sistema
 * gera uma senha aleatória e a devolve UMA vez para o admin repassar.
 */
export const UserCreateResponseSchema = Type.Composite([
  UserResponseSchema,
  Type.Object({ senhaGerada: Type.String() }),
]);
export type UserCreateResponse = Static<typeof UserCreateResponseSchema>;

/** Resposta ao redefinir a senha de um usuário (nova senha gerada, exibida uma vez). */
export const RedefinirSenhaResponseSchema = Type.Object({
  senhaGerada: Type.String(),
});
export type RedefinirSenhaResponse = Static<typeof RedefinirSenhaResponseSchema>;

export const UserListQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  search: Type.Optional(Type.String({ maxLength: 200 })),
  role: Type.Optional(UserRoleSchema),
  ativo: Type.Optional(Type.Boolean()),
});
export type UserListQuery = Static<typeof UserListQuerySchema>;
