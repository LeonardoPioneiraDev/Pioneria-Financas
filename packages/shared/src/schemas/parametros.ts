import { Type, type Static } from '@sinclair/typebox';

// ============================================================================
// PARAMETROS — configuracao da empresa (Fase 6). Empresa UNICA (Viacao
// Pioneira): 1 registro. Identidade exibida + logo (data-URI). Sem multi-tenant.
// ============================================================================

/** Configuracao completa (admin). */
export const ConfiguracaoSchema = Type.Object({
  razaoSocial: Type.String(),
  nomeFantasia: Type.Union([Type.String(), Type.Null()]),
  cnpj: Type.Union([Type.String(), Type.Null()]),
  endereco: Type.Union([Type.String(), Type.Null()]),
  telefone: Type.Union([Type.String(), Type.Null()]),
  /** Logo em data-URI. Null = usa o padrao (/logo.png). */
  logoDataUri: Type.Union([Type.String(), Type.Null()]),
  /** Tempo mínimo (minutos) entre 1º acesso e validação na liberação progressiva. */
  minutosValidacaoFuncionalidade: Type.Integer(),
  atualizadoEm: Type.String({ format: 'date-time' }),
});
export type Configuracao = Static<typeof ConfiguracaoSchema>;

/** Subconjunto PUBLICO (sem auth) — o que o front precisa em login/header + config global leve. */
export const ConfiguracaoBrandingSchema = Type.Object({
  razaoSocial: Type.String(),
  nomeFantasia: Type.Union([Type.String(), Type.Null()]),
  logoDataUri: Type.Union([Type.String(), Type.Null()]),
  /** Config global (não sensível) usada pela tela de liberação progressiva. */
  minutosValidacaoFuncionalidade: Type.Integer(),
});
export type ConfiguracaoBranding = Static<typeof ConfiguracaoBrandingSchema>;

export const AtualizarConfiguracaoBodySchema = Type.Object({
  razaoSocial: Type.Optional(Type.String({ minLength: 2, maxLength: 200 })),
  nomeFantasia: Type.Optional(Type.Union([Type.String({ maxLength: 120 }), Type.Null()])),
  cnpj: Type.Optional(Type.Union([Type.String({ maxLength: 20 }), Type.Null()])),
  endereco: Type.Optional(Type.Union([Type.String({ maxLength: 300 }), Type.Null()])),
  telefone: Type.Optional(Type.Union([Type.String({ maxLength: 40 }), Type.Null()])),
  /** Tempo mínimo de validação (minutos): 1 a 10080 (7 dias). */
  minutosValidacaoFuncionalidade: Type.Optional(Type.Integer({ minimum: 1, maximum: 10080 })),
});
export type AtualizarConfiguracaoBody = Static<typeof AtualizarConfiguracaoBodySchema>;

/** Body do upload do logo. `null` remove o logo (volta ao padrao). */
export const AtualizarLogoBodySchema = Type.Object({
  logoDataUri: Type.Union([Type.String({ maxLength: 1_400_000 }), Type.Null()]),
});
export type AtualizarLogoBody = Static<typeof AtualizarLogoBodySchema>;
