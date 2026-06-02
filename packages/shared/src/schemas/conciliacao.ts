import { Type, type Static } from '@sinclair/typebox';

const StatusUnion = Type.Union([
  Type.Literal('sugerido'),
  Type.Literal('confirmado'),
  Type.Literal('rejeitado'),
]);

const TipoUnion = Type.Union([Type.Literal('auto'), Type.Literal('manual')]);

export const MovtoBancoResumoSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  dataMovto: Type.String({ format: 'date' }),
  valorCents: Type.Integer(),
  debitoCredito: Type.Union([Type.String(), Type.Null()]),
  descHistoBco: Type.Union([Type.String(), Type.Null()]),
  docMovtoBco: Type.Union([Type.String(), Type.Null()]),
  histMovtoBco: Type.Union([Type.String(), Type.Null()]),
  codBanco: Type.Integer(),
  codAgencia: Type.Integer(),
  codContaBco: Type.String(),
});
export type MovtoBancoResumo = Static<typeof MovtoBancoResumoSchema>;

export const TituloResumoSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  tipo: Type.Union([Type.Literal('cp'), Type.Literal('cr')]),
  numeroDocumento: Type.Union([Type.String(), Type.Null()]),
  contraparteRazaoSocial: Type.Union([Type.String(), Type.Null()]),
  dataReferencia: Type.String({ format: 'date' }),
  valorCents: Type.Integer(),
});
export type TituloResumo = Static<typeof TituloResumoSchema>;

export const ConciliacaoResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  bancoMovto: MovtoBancoResumoSchema,
  titulo: Type.Union([TituloResumoSchema, Type.Null()]),
  tipo: TipoUnion,
  scoreConfianca: Type.Integer(),
  diferencaDias: Type.Integer(),
  status: StatusUnion,
  observacao: Type.Union([Type.String(), Type.Null()]),
  sugeridoEm: Type.String({ format: 'date-time' }),
  confirmadoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
});
export type ConciliacaoResponse = Static<typeof ConciliacaoResponseSchema>;

export const ConciliacoesListResponseSchema = Type.Object({
  itens: Type.Array(ConciliacaoResponseSchema),
});
export type ConciliacoesListResponse = Static<typeof ConciliacoesListResponseSchema>;

export const SemParResponseSchema = Type.Object({
  movimentos: Type.Array(MovtoBancoResumoSchema),
  titulos: Type.Array(TituloResumoSchema),
});
export type SemParResponse = Static<typeof SemParResponseSchema>;

/**
 * Candidato a conciliacao manual: um titulo (CP/CR) com a diferenca em relacao
 * ao movto-alvo, pra o operador julgar a olho (valor que nao bate = juros/tarifa/glosa).
 */
export const TituloCandidatoSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  tipo: Type.Union([Type.Literal('cp'), Type.Literal('cr')]),
  numeroDocumento: Type.Union([Type.String(), Type.Null()]),
  contraparteRazaoSocial: Type.Union([Type.String(), Type.Null()]),
  dataReferencia: Type.String({ format: 'date' }),
  valorCents: Type.Integer(),
  // titulo - movto (centavos); 0 = bate exato, >0 titulo maior, <0 menor.
  diferencaValorCents: Type.Integer(),
  diferencaDias: Type.Integer(),
});
export type TituloCandidato = Static<typeof TituloCandidatoSchema>;

export const ConciliacaoCandidatosResponseSchema = Type.Object({
  movto: MovtoBancoResumoSchema,
  candidatos: Type.Array(TituloCandidatoSchema),
});
export type ConciliacaoCandidatosResponse = Static<typeof ConciliacaoCandidatosResponseSchema>;

export const ConciliarManualBodySchema = Type.Object({
  bancoMovtoId: Type.String({ format: 'uuid' }),
  tipo: Type.Union([Type.Literal('cp'), Type.Literal('cr')]),
  tituloId: Type.String({ format: 'uuid' }),
  observacao: Type.Optional(Type.String({ maxLength: 500 })),
});
export type ConciliarManualBody = Static<typeof ConciliarManualBodySchema>;

export const SugerirResponseSchema = Type.Object({
  movtosAnalisados: Type.Integer(),
  matchesGerados: Type.Integer(),
  matchesPulados: Type.Integer(),
  duracaoMs: Type.Integer(),
});
export type SugerirResponse = Static<typeof SugerirResponseSchema>;

export const SugerirAgregacaoResponseSchema = Type.Object({
  movtosAnalisados: Type.Integer(),
  borderosResolvidos: Type.Integer(),
  titulosNoSubset: Type.Integer(),
  movtosSemSubset: Type.Integer(),
  duracaoMs: Type.Integer(),
});
export type SugerirAgregacaoResponse = Static<typeof SugerirAgregacaoResponseSchema>;

export const ContaBancariaResumoSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  codBanco: Type.Integer(),
  codAgencia: Type.Integer(),
  codContaBco: Type.String(),
  digito: Type.Union([Type.String(), Type.Null()]),
  nome: Type.String(),
  ehPrincipal: Type.Boolean(),
  contaCaixa: Type.Boolean(),
  // saldo ancora preenchido pelo tesoureiro; null = sem dado (nao zerar em silencio)
  saldoAcmCents: Type.Union([Type.Integer(), Type.Null()]),
  dataSaldoAcm: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  chavePix: Type.Union([Type.String(), Type.Null()]),
  tipoChavePix: Type.Union([Type.Integer(), Type.Null()]),
  // agregados de movimentos da conta
  movtosTotais: Type.Integer(),
  movtosConciliados: Type.Integer(),
  movtosSemPar: Type.Integer(),
  valorSemParCents: Type.Integer(),
});
export type ContaBancariaResumo = Static<typeof ContaBancariaResumoSchema>;

export const ContasBancariasResponseSchema = Type.Object({
  itens: Type.Array(ContaBancariaResumoSchema),
});
export type ContasBancariasResponse = Static<typeof ContasBancariasResponseSchema>;

export const ConciliacaoDashboardSchema = Type.Object({
  movtosTotais: Type.Integer(),
  movtosConciliados: Type.Integer(),
  movtosSemPar: Type.Integer(),
  conciliacoesSugeridas: Type.Integer(),
  conciliacoesConfirmadas: Type.Integer(),
  conciliacoesRejeitadas: Type.Integer(),
  valorTotalConciliadoCents: Type.Integer(),
  valorSemParCents: Type.Integer(),
});
export type ConciliacaoDashboard = Static<typeof ConciliacaoDashboardSchema>;
