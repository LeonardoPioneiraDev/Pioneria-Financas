import { Type, type Static } from '@sinclair/typebox';
import { VALIDACAO_STATUS, VALIDACAO_TIPOS, OBSERVACOES_MAX, OBSERVACOES_MIN, ANEXO_MAX_ARQUIVOS } from '../enums/validacao.js';
import { USER_ROLES } from '../enums/user-role.js';

const TipoSchema = Type.Union(VALIDACAO_TIPOS.map((t) => Type.Literal(t)));
const StatusSchema = Type.Union(VALIDACAO_STATUS.map((s) => Type.Literal(s)));
const RoleSchema = Type.Union(USER_ROLES.map((r) => Type.Literal(r)));

/** Uma linha da trilha de conferência (append-only). */
export const RegistroValidacaoSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  funcionalidade: Type.String(),
  tipo: TipoSchema,
  status: StatusSchema,
  /** Obrigatório quando `status = reprovado`: o que o usuário achou errado. */
  observacoes: Type.Union([Type.String(), Type.Null()]),
  /** Prints anexados à ressalva (data-URI base64 cada). Opcional, só em reprovações. */
  anexosDataUri: Type.Array(Type.String()),
  usuarioId: Type.String({ format: 'uuid' }),
  usuarioNome: Type.String(),
  usuarioEmail: Type.String(),
  usuarioRole: RoleSchema,
  /** Resposta do admin à ressalva (o que foi corrigido). */
  respostaAdmin: Type.Union([Type.String(), Type.Null()]),
  respondidoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  respondidoPorNome: Type.Union([Type.String(), Type.Null()]),
  criadoEm: Type.String({ format: 'date-time' }),
});
export type RegistroValidacao = Static<typeof RegistroValidacaoSchema>;

/** Situação consolidada de UMA funcionalidade. */
export const FuncionalidadeValidacaoSchema = Type.Object({
  chave: Type.String(),
  nome: Type.String(),
  grupo: Type.String(),
  /** Situação ATUAL de cada auditor que já se manifestou (último registro dele). */
  conferencias: Type.Array(RegistroValidacaoSchema),
  /** Quantos auditores estão hoje com "validado" nesta funcionalidade. */
  totalValidada: Type.Integer(),
  /** Quantas ressalvas de auditor seguem sem resposta do admin. */
  ressalvasAbertas: Type.Integer(),
  /** Último aval do CFO (null = ainda não avalizada). */
  aval: Type.Union([RegistroValidacaoSchema, Type.Null()]),
  /** Algum auditor registrou ressalva DEPOIS do aval do CFO? */
  avalComRessalvaPosterior: Type.Boolean(),
  /** O CFO pode avalizar? (precisa de ao menos uma conferência validada) */
  podeAvalizar: Type.Boolean(),
  /** Algum auditor está conferindo esta tela agora (ainda sem validação). */
  emConferencia: Type.Boolean(),
});
export type FuncionalidadeValidacao = Static<typeof FuncionalidadeValidacaoSchema>;

export const ValidacoesResumoResponseSchema = Type.Object({
  funcionalidades: Type.Array(FuncionalidadeValidacaoSchema),
  /** Auditores em trilha de conferência (para o cabeçalho da tela). */
  auditores: Type.Array(Type.Object({
    id: Type.String({ format: 'uuid' }),
    nome: Type.String(),
    email: Type.String(),
    atribuidas: Type.Integer(),
    validadas: Type.Integer(),
    ressalvas: Type.Integer(),
    /** Funcionalidade em que está parado agora (a próxima a validar). Null = concluiu. */
    atualChave: Type.Union([Type.String(), Type.Null()]),
    atualNome: Type.Union([Type.String(), Type.Null()]),
    /** Quando abriu a tela atual pela 1ª vez (null = ainda não abriu). */
    atualDesde: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    /** Dias parado na tela atual sem validar (null = ainda não abriu / concluiu). */
    diasNaAtual: Type.Union([Type.Integer(), Type.Null()]),
  })),
  totais: Type.Object({
    funcionalidades: Type.Integer(),
    validadas: Type.Integer(),
    avalizadas: Type.Integer(),
    ressalvasAbertas: Type.Integer(),
  }),
});
export type ValidacoesResumoResponse = Static<typeof ValidacoesResumoResponseSchema>;

/** Conferência do auditor: valida ou aponta problema. */
export const ConferirBodySchema = Type.Object({
  chave: Type.String({ maxLength: 80 }),
  status: StatusSchema,
  /** Obrigatório (>= OBSERVACOES_MIN) quando status = reprovado. */
  observacoes: Type.Optional(Type.String({ maxLength: OBSERVACOES_MAX })),
  /** Prints opcionais (data-URI base64 cada), só quando status = reprovado. */
  anexosDataUri: Type.Optional(Type.Array(Type.String({ maxLength: 4_500_000 }), { maxItems: ANEXO_MAX_ARQUIVOS })),
});
export type ConferirBody = Static<typeof ConferirBodySchema>;

export const ConferirResponseSchema = Type.Object({
  status: StatusSchema,
  /** Trilha atualizada do usuário (o menu usa isto). */
  funcionalidadesValidadas: Type.Array(Type.String()),
  funcionalidadesLiberadas: Type.Array(Type.String()),
  /** Próxima funcionalidade a conferir (null = trilha concluída). */
  proxima: Type.Union([Type.String(), Type.Null()]),
});
export type ConferirResponse = Static<typeof ConferirResponseSchema>;

/** Aval do CFO sobre uma funcionalidade já validada por auditor. */
export const AvalBodySchema = Type.Object({
  chave: Type.String({ maxLength: 80 }),
  status: StatusSchema,
  observacoes: Type.Optional(Type.String({ maxLength: OBSERVACOES_MAX })),
});
export type AvalBody = Static<typeof AvalBodySchema>;

/** Resposta do admin a uma ressalva (o que foi corrigido). */
export const ResponderRessalvaBodySchema = Type.Object({
  resposta: Type.String({ minLength: OBSERVACOES_MIN, maxLength: OBSERVACOES_MAX }),
});
export type ResponderRessalvaBody = Static<typeof ResponderRessalvaBodySchema>;

// ============================================================================
// RELATÓRIO — trilha completa para conferência/impressão. Uma linha por evento
// (quem, e-mail, quando, funcionalidade, o que fez, o que escreveu).
// ============================================================================

export const RelatorioValidacoesQuerySchema = Type.Object({
  /** Filtra por funcionalidade (href). Ausente = todas. */
  funcionalidade: Type.Optional(Type.String({ maxLength: 80 })),
  /** Filtra por quem registrou. */
  usuarioId: Type.Optional(Type.String({ format: 'uuid' })),
  tipo: Type.Optional(TipoSchema),
  status: Type.Optional(StatusSchema),
  /** Recorte por data (ISO, inclusivo). */
  de: Type.Optional(Type.String()),
  ate: Type.Optional(Type.String()),
});
export type RelatorioValidacoesQuery = Static<typeof RelatorioValidacoesQuerySchema>;

export const RelatorioValidacoesResponseSchema = Type.Object({
  itens: Type.Array(RegistroValidacaoSchema),
  totais: Type.Object({
    eventos: Type.Integer(),
    validacoes: Type.Integer(),
    ressalvas: Type.Integer(),
    avais: Type.Integer(),
  }),
  /** Opções para os filtros da tela (só quem realmente aparece na trilha). */
  usuarios: Type.Array(Type.Object({
    id: Type.String({ format: 'uuid' }),
    nome: Type.String(),
    email: Type.String(),
  })),
});
export type RelatorioValidacoesResponse = Static<typeof RelatorioValidacoesResponseSchema>;

/** Histórico do próprio usuário (tela "Minhas funcionalidades"). */
export const MinhasValidacoesResponseSchema = Type.Object({
  historico: Type.Array(RegistroValidacaoSchema),
});
export type MinhasValidacoesResponse = Static<typeof MinhasValidacoesResponseSchema>;
