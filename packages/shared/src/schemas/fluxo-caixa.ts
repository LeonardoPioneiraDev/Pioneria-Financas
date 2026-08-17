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
  /**
   * Override da media diaria do repasse GDF (centavos). Se omitido, usa a media
   * dos ultimos 60 dias do extrato. Usado pelos CENARIOS (melhor/pior mes).
   */
  gdfMediaDiariaOverrideCents: Type.Optional(Type.Integer({ minimum: 0 })),
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
  /** Saídas TOTAL do dia = CP vencendo + folha do dia. */
  saidasPrevistasCents: Type.Integer(),
  /** Componente CP (títulos a pagar vencendo). */
  saidaCpCents: Type.Integer(),
  /** Componente folha (líquido dos salários, projetado por dia). */
  saidaFolhaCents: Type.Integer(),
  /** Saldo do dia (entradas ajustadas - saidas). */
  saldoDoDiaCents: Type.Integer(),
  /** Saldo acumulado (running total) — usar pra detectar gap. */
  saldoAcumuladoCents: Type.Integer(),
  /** True quando saldo_acumulado < 0 (atencao operacional). */
  temGap: Type.Boolean(),
  qtdTitulosCr: Type.Integer(),
  qtdTitulosCp: Type.Integer(),
  /** Nome do feriado nesse dia (null = dia comum). So SINALIZA — nao muda valores. */
  feriadoNome: Type.Union([Type.String(), Type.Null()]),
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
   * Receita GDF prevista (repasse BRB) — média diária dos repasses REAIS que
   * caíram no extrato (banco_movto, tarifa técnica), projetada pra cada dia do
   * horizonte. É a fonte PRINCIPAL de receita da Pioneira. NÃO usa a matriz de
   * bilhetagem (que é só o que o passageiro pagou, ~6x menor).
   */
  receitaGdf: Type.Object({
    /** 'tdmax' = geração TD Max × fator; 'extrato' = média dos repasses do banco; 'matriz' = legado. */
    fonte: Type.Union([Type.Literal('tdmax'), Type.Literal('extrato'), Type.Literal('matriz')]),
    janelaDias: Type.Integer(),
    /** Dias, na janela, em que houve repasse no extrato. */
    diasComRepasse: Type.Integer(),
    totalHistoricoCents: Type.Integer(),
    mediaDiariaCents: Type.Integer(),
    receitaPrevistaDiariaCents: Type.Integer(),
    /** Total previsto no horizonte (= diaria * horizonteDias). */
    receitaPrevistaHorizonteCents: Type.Integer(),
    /** True se nao ha repasse no extrato na janela. */
    historicoInsuficiente: Type.Boolean(),
    /**
     * Fator de realizacao (repasse efetivo ÷ receita nominal TD Max, ~0,64). 0 se
     * fonte != 'tdmax'. A receita da API e NOMINAL (tarifa cheia); o GDF paga menos.
     */
    fatorRealizacao: Type.Number(),
    /** Receita NOMINAL diaria da TD Max (tarifa cheia, antes do fator). 0 se sem TD Max. */
    receitaNominalDiariaCents: Type.Integer(),
    /** A receber do GDF ja gerado (cauda do lag: gerado recente x fator - repasse recente). */
    aReceberGeradoCents: Type.Integer(),
  }),
  /** Folha (salários líquidos) projetada como saída — a maior saída da empresa,
   *  antes ausente (só a pensão estava no CP). Encargos/guias continuam no CP. */
  folha: Type.Object({
    disponivel: Type.Boolean(),
    competenciaBase: Type.Union([Type.String(), Type.Null()]),
    liquidoMensalCents: Type.Integer(),
    mediaDiariaCents: Type.Integer(),
    horizonteCents: Type.Integer(),
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

// ============================================================================
// CENARIOS (otimista / realista / pessimista)
// ----------------------------------------------------------------------------
// Mesmo motor da projecao, rodado 3x variando os DOIS parametros que de fato
// oscilam no caixa da Pioneira: a inadimplencia do CR e o repasse GDF (irregular).
// Premissas DERIVADAS da variacao mensal REAL (min/media/max dos ultimos meses),
// nao de fatores inventados. CR/CP/folha vencendo sao os mesmos nos 3 (sao titulos
// agendados) — o que muda e quanto do previsto realmente entra.
// ============================================================================

export const CenariosQuerySchema = Type.Object({
  dataReferencia: Type.Optional(Type.String({ format: 'date' })),
  horizonteDias: Type.Optional(Type.Integer({ minimum: 1, maximum: 365 })),
  incluirSecundarias: Type.Optional(Type.Boolean()),
});
export type CenariosQuery = Static<typeof CenariosQuerySchema>;

export const CenarioFluxoSchema = Type.Object({
  chave: Type.Union([Type.Literal('otimista'), Type.Literal('realista'), Type.Literal('pessimista')]),
  nome: Type.String(),
  /** % de inadimplencia aplicado neste cenario. */
  inadimplenciaPerc: Type.Number(),
  /** Media diaria do repasse GDF aplicada neste cenario (centavos). */
  gdfMediaDiariaCents: Type.Integer(),
  totalEntradasAjustadasCents: Type.Integer(),
  totalSaidasCents: Type.Integer(),
  /** Sobra prevista = entradas ajustadas - saidas. Negativo = falta. */
  sobraCents: Type.Integer(),
  /** Cobertura = entradas / saidas * 100. >= 100 cobre. */
  coberturaPerc: Type.Number(),
  saldoFinalProjetadoCents: Type.Integer(),
  diasComGap: Type.Integer(),
  gapMaximoCents: Type.Integer(),
});
export type CenarioFluxo = Static<typeof CenarioFluxoSchema>;

export const CenariosResponseSchema = Type.Object({
  periodo: Type.Object({
    dataReferencia: Type.String(),
    dtIni: Type.String(),
    dtFim: Type.String(),
  }),
  horizonteDias: Type.Integer(),
  saldoInicialCents: Type.Integer(),
  saldoConfiavel: Type.Boolean(),
  /** Ordem: otimista, realista, pessimista. */
  cenarios: Type.Array(CenarioFluxoSchema),
  /** Como cada premissa foi derivada (transparencia — nao inventamos). */
  premissas: Type.Object({
    inadimplencia: Type.Object({
      fonte: Type.String(),
      janelaMeses: Type.Integer(),
      otimistaPerc: Type.Number(),
      realistaPerc: Type.Number(),
      pessimistaPerc: Type.Number(),
    }),
    gdf: Type.Object({
      fonte: Type.String(),
      janelaMeses: Type.Integer(),
      otimistaDiariaCents: Type.Integer(),
      realistaDiariaCents: Type.Integer(),
      pessimistaDiariaCents: Type.Integer(),
    }),
  }),
  observacoes: Type.Array(Type.String()),
  mensagem: Type.Optional(Type.String()),
});
export type CenariosResponse = Static<typeof CenariosResponseSchema>;

// ============================================================================
// REALIZADO — "o que JA entrou" (creditos reais do extrato)
// ----------------------------------------------------------------------------
// Ponte entre o realizado (Recebiveis) e a previsao (projecao). Mostra o que de
// fato caiu no banco nos ultimos N dias, separando o repasse GDF (eh_repasse_brb,
// mesma fonte da projecao) do resto. O detalhe completo por origem/cliente vive
// no modulo Recebiveis — aqui e so o topo pra amarrar "ja entrou x vai entrar".
// ============================================================================

export const RealizadoEntradasQuerySchema = Type.Object({
  dias: Type.Optional(Type.Integer({ minimum: 1, maximum: 365 })),
});
export type RealizadoEntradasQuery = Static<typeof RealizadoEntradasQuerySchema>;

export const RealizadoEntradasResponseSchema = Type.Object({
  dias: Type.Integer(),
  dtIni: Type.String({ format: 'date' }),
  dtFim: Type.String({ format: 'date' }),
  /** Todos os creditos do extrato no periodo (dinheiro que entrou de fato). */
  totalCreditosCents: Type.Integer(),
  /** Parte que e repasse GDF (BRB) — a receita principal, inequivoca. */
  gdfCents: Type.Integer(),
  /** Resto dos creditos (nem tudo e receita — titularidade/resgate/reembolso; ver Recebiveis). */
  outrosCents: Type.Integer(),
  /** Data do ultimo credito no periodo (null se nenhum). */
  atualizadoEm: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
});
export type RealizadoEntradasResponse = Static<typeof RealizadoEntradasResponseSchema>;

// ----------------------------------------------------------------------------
// FLUXO REALIZADO — entrou x saiu de FATO no extrato (banco_movto), por periodo.
// Diferente da projecao (estimativa pra frente): aqui e o que ja aconteceu.
// ----------------------------------------------------------------------------

export const FluxoRealizadoQuerySchema = Type.Object({
  dataInicio: Type.String({ format: 'date' }),
  dataFim: Type.String({ format: 'date' }),
});
export type FluxoRealizadoQuery = Static<typeof FluxoRealizadoQuerySchema>;

export const FluxoRealizadoDiaSchema = Type.Object({
  data: Type.String({ format: 'date' }),
  entrouCents: Type.Integer(),
  saiuCents: Type.Integer(),
});
export type FluxoRealizadoDia = Static<typeof FluxoRealizadoDiaSchema>;

export const FluxoRealizadoResponseSchema = Type.Object({
  periodo: Type.Object({ dataInicio: Type.String({ format: 'date' }), dataFim: Type.String({ format: 'date' }) }),
  serie: Type.Array(FluxoRealizadoDiaSchema),
  totalEntrouCents: Type.Integer(),
  totalSaiuCents: Type.Integer(),
  /** entrou - saiu (variacao liquida de caixa no periodo). */
  variacaoCents: Type.Integer(),
  /** Dias em que a saida superou a entrada. */
  diasComSaidaMaior: Type.Integer(),
  mensagem: Type.Optional(Type.String()),
});
export type FluxoRealizadoResponse = Static<typeof FluxoRealizadoResponseSchema>;

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
