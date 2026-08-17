import { Type, type Static } from '@sinclair/typebox';

// ============================================================================
// DEPRECIACAO CONTABIL (Fase 3 — leitor por classe)
// Fonte: CTBSALDO do Globus (razao). A Pioneira nao usa a rotina de ativo fixo
// do Globus; a depreciacao e calculada em planilha e lancada por classe.
// ============================================================================

export const DespesaClasseSchema = Type.Object({
  classe: Type.String(),
  label: Type.String(),
  valorCents: Type.Integer(),
});
export type DespesaClasse = Static<typeof DespesaClasseSchema>;

export const BaseClasseSchema = Type.Object({
  classe: Type.String(),
  label: Type.String(),
  brutoCents: Type.Integer(),
  acumuladaCents: Type.Integer(),
  liquidoCents: Type.Integer(),
});
export type BaseClasse = Static<typeof BaseClasseSchema>;

export const ResumoDepreciacaoResponseSchema = Type.Object({
  /** Competencia de referencia (AAAA-MM-01). Null se nao ha dado. */
  competencia: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  /** Rotulo amigavel MM/AAAA. */
  competenciaLabel: Type.Union([Type.String(), Type.Null()]),
  /** Despesa de depreciacao do mes (soma das classes). */
  despesaMesCents: Type.Integer(),
  despesaPorClasse: Type.Array(DespesaClasseSchema),
  /** Base patrimonial acumulada ate a competencia. */
  base: Type.Object({
    brutoCents: Type.Integer(),
    direitoUsoCents: Type.Integer(),
    acumuladaCents: Type.Integer(),
    liquidoCents: Type.Integer(),
  }),
  basePorClasse: Type.Array(BaseClasseSchema),
  /** Competencias disponiveis (AAAA-MM-01), mais recente primeiro. */
  mesesDisponiveis: Type.Array(Type.String({ format: 'date' })),
  atualizadoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  /** Aviso quando nao ha dado sincronizado. */
  mensagem: Type.Optional(Type.String()),
});
export type ResumoDepreciacaoResponse = Static<typeof ResumoDepreciacaoResponseSchema>;

export const ResumoDepreciacaoQuerySchema = Type.Object({
  /** Competencia AAAA-MM (ou AAAA-MM-01). Se omitido, usa a mais recente. */
  competencia: Type.Optional(Type.String()),
});
export type ResumoDepreciacaoQuery = Static<typeof ResumoDepreciacaoQuerySchema>;

export const SerieDepreciacaoQuerySchema = Type.Object({
  meses: Type.Optional(Type.Integer({ minimum: 1, maximum: 120 })),
});
export type SerieDepreciacaoQuery = Static<typeof SerieDepreciacaoQuerySchema>;

export const SerieDepreciacaoPontoSchema = Type.Object({
  competencia: Type.String({ format: 'date' }),
  competenciaLabel: Type.String(),
  valorCents: Type.Integer(),
});
export type SerieDepreciacaoPonto = Static<typeof SerieDepreciacaoPontoSchema>;

export const SerieDepreciacaoResponseSchema = Type.Object({
  serie: Type.Array(SerieDepreciacaoPontoSchema),
  totalCents: Type.Integer(),
});
export type SerieDepreciacaoResponse = Static<typeof SerieDepreciacaoResponseSchema>;

// ----------------------------------------------------------------------------
// DETALHE POR CLASSE (drill-down de proveniencia) — mostra as contas contabeis
// do razao que compoem o numero, com o valor bruto (debito/credito) de cada uma.
// ----------------------------------------------------------------------------

export const DepreciacaoContaSchema = Type.Object({
  /** Classificador contabil (ex.: '3.1.02.07.1501'). */
  classificador: Type.String(),
  /** Nome da conta no plano do Globus. */
  nomeConta: Type.Union([Type.String(), Type.Null()]),
  /** Codigo interno da conta (CTBCONTA.CODCONTACTB). */
  codContaCtb: Type.Integer(),
  /** Grupo: despesa | imobilizado_bruto | direito_uso | deprec_acumulada. */
  grupo: Type.String(),
  /** Debito somado no periodo (centavos). */
  debitoCents: Type.Integer(),
  /** Credito somado no periodo (centavos). */
  creditoCents: Type.Integer(),
  /** Valor com sinal do grupo (despesa/base = deb-cred; acumulada = cred-deb). */
  valorCents: Type.Integer(),
});
export type DepreciacaoConta = Static<typeof DepreciacaoContaSchema>;

export const DetalheClasseQuerySchema = Type.Object({
  classe: Type.String(),
  /** Competencia AAAA-MM (ou AAAA-MM-01). Se omitido, usa a mais recente. */
  competencia: Type.Optional(Type.String()),
});
export type DetalheClasseQuery = Static<typeof DetalheClasseQuerySchema>;

export const DetalheClasseResponseSchema = Type.Object({
  classe: Type.String(),
  label: Type.String(),
  competencia: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  competenciaLabel: Type.Union([Type.String(), Type.Null()]),
  /** Contas 3.1.02.07.* que compoem a despesa do mes desta classe. */
  despesaContas: Type.Array(DepreciacaoContaSchema),
  despesaTotalCents: Type.Integer(),
  /** Contas de imobilizado/acumulada que compoem a base (saldo acumulado). */
  baseContas: Type.Array(DepreciacaoContaSchema),
  brutoCents: Type.Integer(),
  direitoUsoCents: Type.Integer(),
  acumuladaCents: Type.Integer(),
  liquidoCents: Type.Integer(),
});
export type DetalheClasseResponse = Static<typeof DetalheClasseResponseSchema>;

// ----------------------------------------------------------------------------
// FROTA FISICA (contexto) — contagem de veiculos ativos por garagem e tipo.
// Fonte: FRT_CADVEICULOS do Globus (cadastro vivo), NAO o razao. Serve pra
// responder "quantos veiculos" na tela de Depreciacao, sem misturar com o valor.
// ----------------------------------------------------------------------------

export const FrotaTipoSchema = Type.Object({
  tipoFrota: Type.String(),
  ehOnibus: Type.Boolean(),
  qtd: Type.Integer(),
});
export type FrotaTipo = Static<typeof FrotaTipoSchema>;

export const FrotaGaragemSchema = Type.Object({
  garagemCodigo: Type.Integer(),
  garagemNome: Type.String(),
  qtd: Type.Integer(),
  tipos: Type.Array(FrotaTipoSchema),
});
export type FrotaGaragem = Static<typeof FrotaGaragemSchema>;

export const FrotaComposicaoResponseSchema = Type.Object({
  totalVeiculos: Type.Integer(),
  totalOnibus: Type.Integer(),
  totalAuxiliares: Type.Integer(),
  /** Consolidado por tipo (todas as garagens). */
  porTipo: Type.Array(FrotaTipoSchema),
  /** Detalhe por garagem, com os tipos dentro. */
  porGaragem: Type.Array(FrotaGaragemSchema),
  atualizadoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
});
export type FrotaComposicaoResponse = Static<typeof FrotaComposicaoResponseSchema>;

export const SyncDepreciacaoResponseSchema = Type.Object({
  jobId: Type.String(),
  registrosLidos: Type.Integer(),
  registrosGravados: Type.Integer(),
  etlGravados: Type.Integer(),
  etlIgnorados: Type.Integer(),
  duracaoMs: Type.Integer(),
  status: Type.Union([Type.Literal('ok'), Type.Literal('parcial'), Type.Literal('erro')]),
  mensagem: Type.Optional(Type.String()),
});
export type SyncDepreciacaoResponse = Static<typeof SyncDepreciacaoResponseSchema>;
