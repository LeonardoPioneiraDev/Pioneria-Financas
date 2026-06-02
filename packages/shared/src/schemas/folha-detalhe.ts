import { Type, type Static } from '@sinclair/typebox';

// Re-exporta enums runtime para conveniência (definidos em enums/tipo-folha-flp.ts
// para o frontend poder importar sem arrastar @sinclair/typebox no bundle).
export { TIPO_FOLHA_FLP, TIPO_FOLHA_FLP_LABEL, type TipoFolhaFlp } from '../enums/tipo-folha-flp.js';

// ====================== POR SETOR ======================

export const SetorFolhaQuerySchema = Type.Object({
  competencia: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$', description: 'YYYY-MM da competência da folha' }),
  tipoFolha: Type.Optional(Type.Integer({ minimum: 1, maximum: 99 })),
});
export type SetorFolhaQuery = Static<typeof SetorFolhaQuerySchema>;

export const QuebraFuncaoSchema = Type.Object({
  descFuncao: Type.Union([Type.String(), Type.Null()]),
  qtdFuncionarios: Type.Integer(),
  liquidoCents: Type.Integer(),
});
export type QuebraFuncao = Static<typeof QuebraFuncaoSchema>;

export const SetorItemSchema = Type.Object({
  codArea: Type.Union([Type.String(), Type.Null()]),
  descArea: Type.Union([Type.String(), Type.Null()]),
  qtdFuncionarios: Type.Integer(),
  proventosCents: Type.Integer(),
  descontosCents: Type.Integer(),
  liquidoCents: Type.Integer(),
  inssCents: Type.Integer(),
  fgtsCents: Type.Integer(),
  irrfCents: Type.Integer(),
  vtCents: Type.Integer(),
  vaCents: Type.Integer(),
  porFuncao: Type.Array(QuebraFuncaoSchema),
});
export type SetorItem = Static<typeof SetorItemSchema>;

export const SetorFolhaResponseSchema = Type.Object({
  competencia: Type.String(),
  tipoFolha: Type.Union([Type.Integer(), Type.Null()]),
  totais: Type.Object({
    qtdSetores: Type.Integer(),
    qtdFuncionarios: Type.Integer(),
    proventosCents: Type.Integer(),
    descontosCents: Type.Integer(),
    liquidoCents: Type.Integer(),
    inssCents: Type.Integer(),
    fgtsCents: Type.Integer(),
    irrfCents: Type.Integer(),
    vtCents: Type.Integer(),
    vaCents: Type.Integer(),
  }),
  setores: Type.Array(SetorItemSchema),
  syncInfo: Type.Object({
    ultimoSyncEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    totalFuncionarios: Type.Integer(),
    totalFichas: Type.Integer(),
    precisaSincronizar: Type.Boolean(),
  }),
});
export type SetorFolhaResponse = Static<typeof SetorFolhaResponseSchema>;

// ====================== FUNCIONÁRIOS ======================

export const FuncionariosQuerySchema = Type.Object({
  competencia: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }),
  tipoFolha: Type.Optional(Type.Integer({ minimum: 1, maximum: 99 })),
  codArea: Type.Optional(Type.String({ maxLength: 20 })),
  busca: Type.Optional(Type.String({ maxLength: 100 })),
  pagina: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  porPagina: Type.Optional(Type.Integer({ minimum: 10, maximum: 200, default: 50 })),
});
export type FuncionariosQuery = Static<typeof FuncionariosQuerySchema>;

export const FuncionarioItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  codFunc: Type.String(),
  nome: Type.String(),
  codArea: Type.Union([Type.String(), Type.Null()]),
  descArea: Type.Union([Type.String(), Type.Null()]),
  descFuncao: Type.Union([Type.String(), Type.Null()]),
  proventosCents: Type.Integer(),
  descontosCents: Type.Integer(),
  liquidoCents: Type.Integer(),
});
export type FuncionarioItem = Static<typeof FuncionarioItemSchema>;

export const FuncionariosResponseSchema = Type.Object({
  competencia: Type.String(),
  itens: Type.Array(FuncionarioItemSchema),
  total: Type.Integer(),
  pagina: Type.Integer(),
  porPagina: Type.Integer(),
  totalPaginas: Type.Integer(),
});
export type FuncionariosResponse = Static<typeof FuncionariosResponseSchema>;

// ====================== CONTRA-CHEQUE ======================

export const ContraChequeQuerySchema = Type.Object({
  competencia: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }),
  tipoFolha: Type.Optional(Type.Integer({ minimum: 1, maximum: 99 })),
});
export type ContraChequeQuery = Static<typeof ContraChequeQuerySchema>;

export const EventoContraChequeSchema = Type.Object({
  codEvento: Type.Integer(),
  descricao: Type.String(),
  tipo: Type.Union([Type.Literal('P'), Type.Literal('D'), Type.Literal('B')]),
  grupo: Type.Union([Type.String(), Type.Null()]),
  referencia: Type.Union([Type.Number(), Type.Null()]),
  valorCents: Type.Integer(),
});
export type EventoContraCheque = Static<typeof EventoContraChequeSchema>;

export const ContraChequeResponseSchema = Type.Object({
  funcionario: Type.Object({
    id: Type.String({ format: 'uuid' }),
    codFunc: Type.String(),
    nome: Type.String(),
    descFuncao: Type.Union([Type.String(), Type.Null()]),
    descArea: Type.Union([Type.String(), Type.Null()]),
    agencia: Type.Union([Type.String(), Type.Null()]),
    contaCorrente: Type.Union([Type.String(), Type.Null()]),
  }),
  competencia: Type.String(),
  tipoFolha: Type.Union([Type.Integer(), Type.Null()]),
  proventos: Type.Array(EventoContraChequeSchema),
  descontos: Type.Array(EventoContraChequeSchema),
  totais: Type.Object({
    proventosCents: Type.Integer(),
    descontosCents: Type.Integer(),
    liquidoCents: Type.Integer(),
    baseInssCents: Type.Integer(),
    baseFgtsCents: Type.Integer(),
    baseIrrfCents: Type.Integer(),
    fgtsCents: Type.Integer(),
  }),
});
export type ContraChequeResponse = Static<typeof ContraChequeResponseSchema>;

// ====================== SYNC ======================

export const SyncFlpBodySchema = Type.Object({
  competencia: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }),
  tipoFolha: Type.Optional(Type.Integer({ minimum: 1, maximum: 99 })),
});
export type SyncFlpBody = Static<typeof SyncFlpBodySchema>;

export const SyncFlpResponseSchema = Type.Object({
  jobId: Type.String({ format: 'uuid' }),
  status: Type.Union([Type.Literal('ok'), Type.Literal('parcial'), Type.Literal('erro')]),
  funcionariosLidos: Type.Integer(),
  funcionariosGravados: Type.Integer(),
  eventosLidos: Type.Integer(),
  eventosGravados: Type.Integer(),
  fichasLidas: Type.Integer(),
  fichasGravadas: Type.Integer(),
  duracaoMs: Type.Integer(),
  mensagem: Type.Optional(Type.String()),
});
export type SyncFlpResponse = Static<typeof SyncFlpResponseSchema>;

// ====================== DIAGNÓSTICO ======================

export const CompetenciaDisponivelSchema = Type.Object({
  competencia: Type.String({ format: 'date' }),
  tipoFolha: Type.Integer(),
  qtdLancamentos: Type.Integer(),
  qtdFuncionarios: Type.Integer(),
  somaCents: Type.String(),
});
export type CompetenciaDisponivel = Static<typeof CompetenciaDisponivelSchema>;

export const DiagnosticoFlpResponseSchema = Type.Object({
  stage: Type.Object({
    funcionarios: Type.Integer(),
    eventos: Type.Integer(),
    fichas: Type.Integer(),
    fichasPendentes: Type.Integer(),
  }),
  canonical: Type.Object({
    funcionarios: Type.Integer(),
    eventos: Type.Integer(),
    fichas: Type.Integer(),
  }),
  competenciasDisponiveis: Type.Array(CompetenciaDisponivelSchema),
  ultimoJob: Type.Union([
    Type.Object({
      id: Type.String({ format: 'uuid' }),
      status: Type.String(),
      iniciadoEm: Type.String({ format: 'date-time' }),
      terminadoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
      registrosLidos: Type.Integer(),
      registrosGravados: Type.Integer(),
      registrosComErro: Type.Integer(),
      erroMensagem: Type.Union([Type.String(), Type.Null()]),
      parametros: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
    }),
    Type.Null(),
  ]),
});
export type DiagnosticoFlpResponse = Static<typeof DiagnosticoFlpResponseSchema>;
