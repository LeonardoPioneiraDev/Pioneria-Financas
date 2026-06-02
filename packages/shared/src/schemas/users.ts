import { Type, type Static } from '@sinclair/typebox';
import { USER_ROLES } from '../enums/user-role.js';

const UserRoleSchema = Type.Union(USER_ROLES.map((r) => Type.Literal(r)));

export const UserCreatePayloadSchema = Type.Object({
  email: Type.String({ format: 'email', maxLength: 255 }),
  nomeCompleto: Type.String({ minLength: 3, maxLength: 200 }),
  role: UserRoleSchema,
});
export type UserCreatePayload = Static<typeof UserCreatePayloadSchema>;

export const UserUpdatePayloadSchema = Type.Object({
  nomeCompleto: Type.Optional(Type.String({ minLength: 3, maxLength: 200 })),
  role: Type.Optional(UserRoleSchema),
  ativo: Type.Optional(Type.Boolean()),
});
export type UserUpdatePayload = Static<typeof UserUpdatePayloadSchema>;

export const UserResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  email: Type.String({ format: 'email' }),
  nomeCompleto: Type.String(),
  role: UserRoleSchema,
  ativo: Type.Boolean(),
  ultimoLoginEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  criadoEm: Type.String({ format: 'date-time' }),
  atualizadoEm: Type.String({ format: 'date-time' }),
});
export type UserResponse = Static<typeof UserResponseSchema>;

export const UserListQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  search: Type.Optional(Type.String({ maxLength: 200 })),
  role: Type.Optional(UserRoleSchema),
  ativo: Type.Optional(Type.Boolean()),
});
export type UserListQuery = Static<typeof UserListQuerySchema>;
