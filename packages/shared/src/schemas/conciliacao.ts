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
  /** Lançamentos com título (CP) já vinculado pelo Globus via cod_movto_bco. */
  movtosComTitulo: Type.Integer(),
  /** Identificados de verdade: conciliado no Globus OU com título de CP ligado. */
  movtosIdentificados: Type.Integer(),
  /** Fatia dos identificados que veio do título (CP ligado), não do flag conciliado. */
  movtosIdentificadosPorTitulo: Type.Integer(),
  conciliacoesSugeridas: Type.Integer(),
  conciliacoesConfirmadas: Type.Integer(),
  conciliacoesRejeitadas: Type.Integer(),
  valorTotalConciliadoCents: Type.Integer(),
  valorSemParCents: Type.Integer(),
});
export type ConciliacaoDashboard = Static<typeof ConciliacaoDashboardSchema>;

// ====================== VISÃO GLOBUS (só leitura) ======================
// Mostra a conciliação que JÁ VEM do Globus — sem matching nosso. O vínculo
// banco↔título usa banco_movto.cod_movto_bco = contas_pagar.cod_movto_bco
// (vínculo nativo CPGDOCTO.CODMOVTOBCO). Onde o Globus não amarrou, titulos=[].

export const TituloVinculadoSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  tipo: Type.Union([Type.Literal('cp'), Type.Literal('cr')]),
  numeroDocumento: Type.Union([Type.String(), Type.Null()]),
  fornecedorRazaoSocial: Type.Union([Type.String(), Type.Null()]),
  valorCents: Type.Integer(),
});
export type TituloVinculado = Static<typeof TituloVinculadoSchema>;

export const MovimentoConciliadoSchema = Type.Composite([
  MovtoBancoResumoSchema,
  Type.Object({
    /** Flag do Globus (CONCILIADOMOVTOBCO): o banco considera identificado. */
    conciliadoGlobus: Type.Boolean(),
    /**
     * Identificado MANUALMENTE no nosso sistema (conciliação confirmada por
     * operador), não pelo Globus. Quando true, os `titulos` incluem o que foi
     * ligado na mão — a UI diferencia "identificado no Globus" de "ligado por você".
     */
    vinculoManual: Type.Boolean(),
    contaNome: Type.Union([Type.String(), Type.Null()]),
    /**
     * Título(s) ligados a este lançamento: pelo Globus (cod_movto_bco) e/ou pela
     * identificação manual confirmada. Vazio = sem detalhe.
     */
    titulos: Type.Array(TituloVinculadoSchema),
  }),
]);
export type MovimentoConciliado = Static<typeof MovimentoConciliadoSchema>;

export const MovimentosQuerySchema = Type.Object({
  status: Type.Optional(Type.Union([
    Type.Literal('identificados'),
    Type.Literal('nao_identificados'),
  ])),
  contaId: Type.Optional(Type.String({ format: 'uuid' })),
  busca: Type.Optional(Type.String({ maxLength: 100 })),
  /** Filtra por data do lançamento no banco (data_movto). Inclusivo. */
  dtIni: Type.Optional(Type.String({ format: 'date' })),
  dtFim: Type.Optional(Type.String({ format: 'date' })),
  pagina: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  porPagina: Type.Optional(Type.Integer({ minimum: 10, maximum: 100, default: 20 })),
});
export type MovimentosQuery = Static<typeof MovimentosQuerySchema>;

export const MovimentosResponseSchema = Type.Object({
  itens: Type.Array(MovimentoConciliadoSchema),
  total: Type.Integer(),
  pagina: Type.Integer(),
  porPagina: Type.Integer(),
  totalPaginas: Type.Integer(),
});
export type MovimentosResponse = Static<typeof MovimentosResponseSchema>;

// ============================================================================
// EXTRATO MENSAL — entrou × saiu por mês, com transferências (movimentação
// interna entre contas próprias) à parte, para não distorcer o operacional.
// ============================================================================

export const ExtratoMensalQuerySchema = Type.Object({
  /** Filtra por conta bancária (id). Ausente = todas as contas somadas. */
  contaId: Type.Optional(Type.String({ format: 'uuid' })),
  /** Ano (YYYY). Ausente = últimos 12 meses. */
  ano: Type.Optional(Type.Integer({ minimum: 2000, maximum: 2100 })),
});
export type ExtratoMensalQuery = Static<typeof ExtratoMensalQuerySchema>;

/** Um mês do extrato, com saldo rolando (saldo final = inicial + entradas − saídas). */
export const ExtratoMesSchema = Type.Object({
  mes: Type.String(),            // 'YYYY-MM'
  rotulo: Type.String(),         // 'jul/2026'
  movimentos: Type.Integer(),
  entradasCents: Type.Integer(),
  saidasCents: Type.Integer(),
  /** Entradas − saídas do mês. */
  resultadoCents: Type.Integer(),
  /** Saldo no início do mês (= saldo final do mês anterior). */
  saldoInicialCents: Type.Integer(),
  /** Saldo no fim do mês. */
  saldoFinalCents: Type.Integer(),
});
export type ExtratoMes = Static<typeof ExtratoMesSchema>;

const ExtratoTotaisSchema = Type.Object({
  entradasCents: Type.Integer(),
  saidasCents: Type.Integer(),
  resultadoCents: Type.Integer(),
  movimentos: Type.Integer(),
});

/** Extrato de UMA conta bancária: seus meses + totais + saldo atual. */
export const ExtratoContaSchema = Type.Object({
  contaId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  nome: Type.String(),
  codBanco: Type.Integer(),
  codAgencia: Type.Integer(),
  codContaBco: Type.String(),
  meses: Type.Array(ExtratoMesSchema),
  totais: ExtratoTotaisSchema,
  /** Saldo no fim do último mês do período. */
  saldoAtualCents: Type.Integer(),
  /**
   * true = saldo RELATIVO (parte de zero no 1º movimento) porque a conta não tem
   * saldo conferido (âncora). Nesse caso o saldo mostra a VARIAÇÃO, não o valor
   * real em banco — fiel a "não inventa saldo".
   */
  saldoRelativo: Type.Boolean(),
});
export type ExtratoConta = Static<typeof ExtratoContaSchema>;

export const ExtratoMensalResponseSchema = Type.Object({
  /** Consolidado (todas as contas somadas). */
  meses: Type.Array(ExtratoMesSchema),
  totais: ExtratoTotaisSchema,
  /** Quebra POR CONTA — cada conta com o próprio extrato, ordenada por movimento. */
  porConta: Type.Array(ExtratoContaSchema),
  /** Movimentos que a regra não conseguiu classificar (fiel a "não inventa"). */
  aClassificar: Type.Integer(),
});
export type ExtratoMensalResponse = Static<typeof ExtratoMensalResponseSchema>;
