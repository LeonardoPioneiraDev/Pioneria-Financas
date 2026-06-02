import { Type, type Static } from '@sinclair/typebox';

const STRONG_PASSWORD = '^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d).{8,200}$';

export const ForgotPasswordPayloadSchema = Type.Object({
  email: Type.String({ format: 'email', maxLength: 255 }),
});
export type ForgotPasswordPayload = Static<typeof ForgotPasswordPayloadSchema>;

export const ResetPasswordPayloadSchema = Type.Object({
  token: Type.String({ minLength: 32, maxLength: 200 }),
  novaSenha: Type.String({ pattern: STRONG_PASSWORD }),
});
export type ResetPasswordPayload = Static<typeof ResetPasswordPayloadSchema>;

export const FirstAccessPayloadSchema = Type.Object({
  token: Type.String({ minLength: 32, maxLength: 200 }),
  novaSenha: Type.String({ pattern: STRONG_PASSWORD }),
});
export type FirstAccessPayload = Static<typeof FirstAccessPayloadSchema>;

export const ValidateTokenQuerySchema = Type.Object({
  token: Type.String({ minLength: 32, maxLength: 200 }),
});
export type ValidateTokenQuery = Static<typeof ValidateTokenQuerySchema>;

export const ValidateTokenResponseSchema = Type.Object({
  valido: Type.Boolean(),
  email: Type.Optional(Type.String({ format: 'email' })),
  expiraEm: Type.Optional(Type.String({ format: 'date-time' })),
});
export type ValidateTokenResponse = Static<typeof ValidateTokenResponseSchema>;
