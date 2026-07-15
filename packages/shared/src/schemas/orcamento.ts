import { Type, type Static } from '@sinclair/typebox';

// ============================================================================
// ORCAMENTO — BASELINE HISTORICO (Fase 4)
// ----------------------------------------------------------------------------
// O orcamento ATUAL da Pioneira NAO vive no Globus (o subsistema CPG_CAD_ORCAMENTO_*
// esta vazio; parou de ser lancado em maio/2020). O unico orcado que existe la e o
// legado 2018-2020 em CPGORCPREVISOES. Este modulo le esse baseline como prova de
// conceito e ISCA: mostra a cara do orcamento antigo pra o financeiro confirmar o
// eixo (centro de custo? conta? garagem?) e o formato do orcamento de hoje.
// Ver Leia/orcamento-mapeamento.md.
// ============================================================================

export const OrcamentoBaselineAnoSchema = Type.Object({
  ano: Type.Integer(),
  qtdLinhas: Type.Integer(),
  receitaCents: Type.Integer(),
  despesaCents: Type.Integer(),
  /** receita + despesa (as duas somas positivas — o Globus separa por coluna). */
  totalCents: Type.Integer(),
});
export type OrcamentoBaselineAno = Static<typeof OrcamentoBaselineAnoSchema>;

export const OrcamentoBaselineCentroSchema = Type.Object({
  codCustoFin: Type.Union([Type.Integer(), Type.Null()]),
  descricao: Type.Union([Type.String(), Type.Null()]),
  valorCents: Type.Integer(),
});
export type OrcamentoBaselineCentro = Static<typeof OrcamentoBaselineCentroSchema>;

export const OrcamentoBaselineResponseSchema = Type.Object({
  /** false = nenhum baseline sincronizado ainda. */
  disponivel: Type.Boolean(),
  empresaId: Type.Integer(),
  /** Orcado por ano (mais recente primeiro). */
  anos: Type.Array(OrcamentoBaselineAnoSchema),
  totalReceitaCents: Type.Integer(),
  totalDespesaCents: Type.Integer(),
  totalCents: Type.Integer(),
  qtdLinhas: Type.Integer(),
  qtdCentrosCusto: Type.Integer(),
  /** Ano usado no recorte por centro de custo (o mais recente com dado). */
  anoDetalhe: Type.Union([Type.Integer(), Type.Null()]),
  /** Menor/maior DATAPREVISAO (AAAA-MM-DD) no baseline. */
  dataMin: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  dataMax: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  /** Orcado por centro de custo do ano de detalhe (maior valor primeiro). */
  porCentroCusto: Type.Array(OrcamentoBaselineCentroSchema),
  ultimoSyncEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  /** Avisos honestos: e legado, granularidade baixa, isca pro financeiro. */
  observacoes: Type.Array(Type.String()),
});
export type OrcamentoBaselineResponse = Static<typeof OrcamentoBaselineResponseSchema>;

// ----------------------------------------------------------------------------
// ORCADO DERIVADO DO REALIZADO (base tecnica — PROJETADO, nao oficial)
// ----------------------------------------------------------------------------
// Enquanto o orcado ATUAL nao vem do financeiro, o sistema PROPOE uma base
// tecnica derivada do proprio realizado: media mensal do gasto por centro de
// custo nos ultimos N meses (mesma logica do Fluxo de Caixa, que projeta do
// historico). E sempre estado `projetado` — uma SUGESTAO que o financeiro aceita
// ou ajusta, NUNCA "o orcamento oficial". Realizado = finance.contas_pagar por
// CODCUSTOFIN (rateio_setores). E despesa/custo — receita orcada fica de fora.
// ============================================================================

export const OrcamentoDerivadoSetorSchema = Type.Object({
  codSetor: Type.Union([Type.String(), Type.Null()]),
  nome: Type.Union([Type.String(), Type.Null()]),
  /**
   * Natureza do setor (afeta como ler o numero):
   *  - 'receita'  garagem operacional que gera receita (Santa Maria, Gama, Itapoa, Sao Sebastiao)
   *  - 'apoio'    unidade so de custo (Abastecimento, Uniao, Setor O)
   *  - 'central'  ADMINISTRACAO N. BANDEIRANTE — concentra o pagamento das dividas dos
   *               outros setores, entao o valor NAO e custo proprio dela (aparece inflado)
   *  - 'indefinido' nao classificado
   */
  categoria: Type.Union([
    Type.Literal('receita'),
    Type.Literal('apoio'),
    Type.Literal('central'),
    Type.Literal('indefinido'),
  ]),
  /** Realizado total do setor na janela (soma dos meses). */
  realizadoCents: Type.Integer(),
  /** Quantos meses distintos tiveram gasto (transparencia da media). */
  mesesComGasto: Type.Integer(),
  /** Orcado mensal sugerido = realizado / baseMeses. Estado: projetado. */
  mensalSugeridoCents: Type.Integer(),
});
export type OrcamentoDerivadoSetor = Static<typeof OrcamentoDerivadoSetorSchema>;

export const OrcamentoDerivadoResponseSchema = Type.Object({
  disponivel: Type.Boolean(),
  /** Janela usada no calculo (meses). */
  baseMeses: Type.Integer(),
  /** Primeiro/ultimo mes da janela (AAAA-MM-01). */
  mesInicio: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  mesFim: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  totalRealizadoCents: Type.Integer(),
  orcadoMensalSugeridoCents: Type.Integer(),
  orcadoAnualSugeridoCents: Type.Integer(),
  porSetor: Type.Array(OrcamentoDerivadoSetorSchema),
  observacoes: Type.Array(Type.String()),
});
export type OrcamentoDerivadoResponse = Static<typeof OrcamentoDerivadoResponseSchema>;

export const OrcamentoSyncResponseSchema = Type.Object({
  jobId: Type.String(),
  registrosLidos: Type.Integer(),
  registrosGravados: Type.Integer(),
  etlGravados: Type.Integer(),
  duracaoMs: Type.Integer(),
  status: Type.Union([Type.Literal('ok'), Type.Literal('parcial'), Type.Literal('erro')]),
  mensagem: Type.Optional(Type.String()),
});
export type OrcamentoSyncResponse = Static<typeof OrcamentoSyncResponseSchema>;
