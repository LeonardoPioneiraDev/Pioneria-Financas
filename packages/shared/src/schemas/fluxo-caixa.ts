import { Type, type Static } from '@sinclair/typebox';

// ============================================================================
// CONTAS BANCARIAS
// ============================================================================

export const ContaBancariaSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  codBanco: Type.Integer(),
  codAgencia: Type.Integer(),
  codContaBco: Type.String(),
  digito: Type.Union([Type.String(), Type.Null()]),
  nomeContaBco: Type.String(),
  /** Nome editavel pelo usuario (fallback = nomeContaBco). */
  nomeAmigavel: Type.Union([Type.String(), Type.Null()]),
  ehPrincipal: Type.Boolean(),
  contaCaixa: Type.Boolean(),
  /** Saldo conhecido em centavos. Preenchido pelo tesoureiro. Null = nao configurado. */
  saldoAcmCents: Type.Union([Type.Integer(), Type.Null()]),
  /** Data em que o saldo foi conferido. Null = nunca conferido. */
  dataSaldoAcm: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  saldoAcmAtualizadoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  /** Saldo Globus — referencia, NAO usar pra calculo. */
  saldoGlobusCents: Type.Union([Type.Integer(), Type.Null()]),
  dataSaldoGlobus: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  /** True quando saldoAcmCents e dataSaldoAcm estao preenchidos. */
  ancoraPronta: Type.Boolean(),
});
export type ContaBancaria = Static<typeof ContaBancariaSchema>;

export const ListarContasResponseSchema = Type.Object({
  contas: Type.Array(ContaBancariaSchema),
  totalPrincipais: Type.Integer(),
  totalSecundarias: Type.Integer(),
  totalSemAncora: Type.Integer(),
});
export type ListarContasResponse = Static<typeof ListarContasResponseSchema>;

// ============================================================================
// ANCORA DE SALDO (tesoureiro digita)
// ============================================================================

export const SetAncoraSaldoBodySchema = Type.Object({
  /** Saldo em centavos. Aceita negativo (conta no vermelho). */
  saldoCents: Type.Integer(),
  /** Data de referencia do saldo (geralmente hoje). */
  dataSaldo: Type.String({ format: 'date' }),
});
export type SetAncoraSaldoBody = Static<typeof SetAncoraSaldoBodySchema>;

// ============================================================================
// SALDO DIARIO (calculado on-the-fly)
// ============================================================================

export const SaldoDiarioQuerySchema = Type.Object({
  dtIni: Type.String({ format: 'date' }),
  dtFim: Type.String({ format: 'date' }),
  /** Se omitido, retorna serie consolidada (soma de todas principais). */
  contaId: Type.Optional(Type.String({ format: 'uuid' })),
  /** Se true, inclui secundarias no consolidado. Default: false. */
  incluirSecundarias: Type.Optional(Type.Boolean()),
});
export type SaldoDiarioQuery = Static<typeof SaldoDiarioQuerySchema>;

export const SaldoDiaSchema = Type.Object({
  data: Type.String({ format: 'date' }),
  saldoCents: Type.Integer(),
  /** Soma de creditos do dia (entradas). */
  creditosCents: Type.Integer(),
  /** Soma de debitos do dia (saidas). */
  debitosCents: Type.Integer(),
});
export type SaldoDia = Static<typeof SaldoDiaSchema>;

export const SaldoDiarioResponseSchema = Type.Object({
  periodo: Type.Object({ dtIni: Type.String(), dtFim: Type.String() }),
  contaId: Type.Union([Type.String(), Type.Null()]),
  /** Indica se o calculo usou ancora valida ou nao. */
  ancoraValida: Type.Boolean(),
  /** Lista de contas usadas no calculo (1 quando contaId presente). */
  contasIncluidas: Type.Array(Type.Object({
    id: Type.String(),
    nome: Type.String(),
    saldoAcmCents: Type.Union([Type.Integer(), Type.Null()]),
    dataSaldoAcm: Type.Union([Type.String(), Type.Null()]),
  })),
  /** Series de saldo dia-a-dia. Vazia se nenhuma conta tem ancora. */
  serie: Type.Array(SaldoDiaSchema),
  /** Saldo no primeiro dia da serie. */
  saldoInicialCents: Type.Integer(),
  /** Saldo no ultimo dia da serie. */
  saldoFinalCents: Type.Integer(),
  /** Mensagem amigavel sobre estado dos dados. */
  mensagem: Type.Optional(Type.String()),
});
export type SaldoDiarioResponse = Static<typeof SaldoDiarioResponseSchema>;

// ============================================================================
// SYNC
// ============================================================================

// ============================================================================
// PROJECAO 30/60/90d
// ============================================================================

export const ProjecaoQuerySchema = Type.Object({
  /** Data de referencia (default = hoje). A projecao comeca do dia seguinte. */
  dataReferencia: Type.Optional(Type.String({ format: 'date' })),
  /** Horizonte em dias (default 30). Aceita 7, 30, 60, 90. */
  horizonteDias: Type.Optional(Type.Integer({ minimum: 1, maximum: 365 })),
  /** Se true, inclui contas secundarias no consolidado. Default: false. */
  incluirSecundarias: Type.Optional(Type.Boolean()),
  /** Override do % de inadimplencia. Se omitido, calcula do historico. */
  inadimplenciaPerc: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
});
export type ProjecaoQuery = Static<typeof ProjecaoQuerySchema>;

export const ProjecaoDiaSchema = Type.Object({
  data: Type.String({ format: 'date' }),
  /** Entradas previstas TOTAL = CR previsto + GDF previsto (sem ajustes). */
  entradasPrevistasCents: Type.Integer(),
  /** Entradas TOTAL ajustadas = CR*(1-inadimp) + GDF*(1-glosa). */
  entradasAjustadasCents: Type.Integer(),
  /** Componente CR bruto do dia (titulos vencendo). */
  entradaCrBrutoCents: Type.Integer(),
  /** Componente CR ajustado por inadimplencia. */
  entradaCrAjustadoCents: Type.Integer(),
  /** Componente GDF ajustado por glosa (mesma media pra todo dia). */
  entradaGdfAjustadoCents: Type.Integer(),
  saidasPrevistasCents: Type.Integer(),
  /** Saldo do dia (entradas ajustadas - saidas). */
  saldoDoDiaCents: Type.Integer(),
  /** Saldo acumulado (running total) — usar pra detectar gap. */
  saldoAcumuladoCents: Type.Integer(),
  /** True quando saldo_acumulado < 0 (atencao operacional). */
  temGap: Type.Boolean(),
  qtdTitulosCr: Type.Integer(),
  qtdTitulosCp: Type.Integer(),
});
export type ProjecaoDia = Static<typeof ProjecaoDiaSchema>;

export const ProjecaoResponseSchema = Type.Object({
  periodo: Type.Object({
    dataReferencia: Type.String(),
    dtIni: Type.String(),
    dtFim: Type.String(),
  }),
  horizonteDias: Type.Integer(),
  saldoInicialCents: Type.Integer(),
  /** True quando pelo menos 1 conta principal tem ancora preenchida. */
  saldoConfiavel: Type.Boolean(),
  contasIncluidas: Type.Array(Type.Object({
    id: Type.String(),
    nome: Type.String(),
    saldoAtualCents: Type.Integer(),
  })),
  /** Diagnostico da inadimplencia usada (aplicada APENAS ao CR — receita tradicional). */
  inadimplencia: Type.Object({
    percentualAplicado: Type.Number(),
    fonte: Type.Union([Type.Literal('historico'), Type.Literal('override')]),
    janelaMeses: Type.Integer(),
    crConsiderado: Type.Integer(),
    crAtrasadoOuCancelado: Type.Integer(),
    valorTotalCents: Type.Integer(),
    valorInadimplenteCents: Type.Integer(),
  }),
  /**
   * Receita GDF prevista (repasse BRB) — calculada pela media diaria historica
   * dos resgates, ajustada pela glosa historica (diferenca esperado vs
   * recebido no banco). Essa e a fonte PRINCIPAL de receita da Pioneira.
   */
  receitaGdf: Type.Object({
    janelaDias: Type.Integer(),
    diasAnalisados: Type.Integer(),
    totalHistoricoCents: Type.Integer(),
    mediaDiariaCents: Type.Integer(),
    /** % de glosa histórica (esperado-recebido)/esperado nos ultimos N dias. */
    glosaPercHistorica: Type.Number(),
    /** Receita diaria ajustada pela glosa (= mediaDiaria * (1 - glosa%)). */
    receitaPrevistaDiariaCents: Type.Integer(),
    /** Total previsto no horizonte (= diaria * horizonteDias). */
    receitaPrevistaHorizonteCents: Type.Integer(),
    /** True se nao tem dado historico suficiente (< 7 dias). */
    historicoInsuficiente: Type.Boolean(),
  }),
  serie: Type.Array(ProjecaoDiaSchema),
  resumo: Type.Object({
    totalEntradasPrevistasCents: Type.Integer(),
    totalEntradasAjustadasCents: Type.Integer(),
    totalSaidasPrevistasCents: Type.Integer(),
    saldoFinalProjetadoCents: Type.Integer(),
    diasComGap: Type.Integer(),
    primeiraDataComGap: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
    gapMaximoCents: Type.Integer(),
  }),
  mensagem: Type.Optional(Type.String()),
});
export type ProjecaoResponse = Static<typeof ProjecaoResponseSchema>;

export const SyncFluxoCaixaResponseSchema = Type.Object({
  jobIdConta: Type.String({ format: 'uuid' }),
  jobIdMovto: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  contasLidas: Type.Integer(),
  contasGravadas: Type.Integer(),
  contasPrincipaisMarcadas: Type.Integer(),
  movimentosLidos: Type.Integer(),
  movimentosGravados: Type.Integer(),
  duracaoMs: Type.Integer(),
  status: Type.Union([Type.Literal('ok'), Type.Literal('parcial'), Type.Literal('erro')]),
  mensagem: Type.Optional(Type.String()),
});
export type SyncFluxoCaixaResponse = Static<typeof SyncFluxoCaixaResponseSchema>;
