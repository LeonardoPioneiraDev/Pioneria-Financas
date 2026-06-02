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
