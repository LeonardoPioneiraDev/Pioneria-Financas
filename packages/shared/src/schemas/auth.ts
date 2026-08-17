import { Type, type Static } from '@sinclair/typebox';
import { USER_ROLES } from '../enums/user-role.js';

export const LoginPayloadSchema = Type.Object({
  email: Type.String({ format: 'email', maxLength: 255 }),
  password: Type.String({ minLength: 1, maxLength: 200 }),
});
export type LoginPayload = Static<typeof LoginPayloadSchema>;

export const AuthenticatedUserSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  email: Type.String({ format: 'email' }),
  nomeCompleto: Type.String(),
  role: Type.Union(USER_ROLES.map((r) => Type.Literal(r))),
  /** Permissoes de funcionalidade do usuario (para o front esconder o que ele nao pode). */
  permissoes: Type.Array(Type.String()),
  /** Liberacao progressiva: o menu mostra so as `funcionalidadesLiberadas`. */
  liberacaoProgressiva: Type.Boolean(),
  funcionalidadesAtribuidas: Type.Array(Type.String()),
  funcionalidadesValidadas: Type.Array(Type.String()),
  /** Derivado: validadas + a proxima a validar (o que o menu pode mostrar). */
  funcionalidadesLiberadas: Type.Array(Type.String()),
  /**
   * SÓ para o CFO: as funcionalidades que a equipe de auditoria JÁ VALIDOU. É
   * exatamente o que ele enxerga no menu — o que ainda está em conferência não
   * aparece, porque só há o que avalizar depois que o auditor validou.
   * `null` para os demais papéis (menu normal pelo papel).
   */
  funcionalidadesValidadasAuditoria: Type.Union([Type.Array(Type.String()), Type.Null()]),
  /** Progresso (1º acesso / validação) por funcionalidade — p/ o gate de horas na UI. */
  progressoFuncionalidades: Type.Record(Type.String(), Type.Object({
    primeiroAcessoEm: Type.Union([Type.String(), Type.Null()]),
    validadoEm: Type.Union([Type.String(), Type.Null()]),
    justificativa: Type.Union([Type.String(), Type.Null()]),
  })),
  ativo: Type.Boolean(),
  ultimoLoginEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
});
export type AuthenticatedUser = Static<typeof AuthenticatedUserSchema>;

export const LoginResponseSchema = Type.Object({
  accessToken: Type.String(),
  refreshToken: Type.String(),
  expiresIn: Type.Integer(),
  user: AuthenticatedUserSchema,
});
export type LoginResponse = Static<typeof LoginResponseSchema>;

export const RefreshTokenPayloadSchema = Type.Object({
  refreshToken: Type.String({ minLength: 1 }),
});
export type RefreshTokenPayload = Static<typeof RefreshTokenPayloadSchema>;
