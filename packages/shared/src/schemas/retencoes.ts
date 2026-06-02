import { Type, type Static } from '@sinclair/typebox';

/**
 * Aliquotas padrao Lucro Real — Brasil 2026.
 *
 * IMPORTANTE: simplificacao MVP. Casos especiais (Simples, MEI, exterior,
 * servico-fora-do-municipio) PRECISAM tratamento dedicado. Esta heuristica
 * cobre o caso classico de NF de servico PJ tributada em Lucro Real.
 */
export const ALIQUOTAS_PADRAO = {
  pisPerc: 0.65,
  cofinsPerc: 3.0,
  csllPerc: 1.0,
  irrfPerc: 1.5,        // 1.5% transporte/servicos em geral (varia: consultoria=4.8, locacao=1.5)
  inssPerc: 11.0,       // INSS 11% sobre valor base — so quando aplicavel (locacao maquina, mao obra)
  issMinPerc: 2.0,      // varia por municipio (Brasilia: 2-5%)
  issMaxPerc: 5.0,
  /** Abaixo deste valor IRRF nao eh retido (Art. 67 Lei 9.430/96). */
  valorMinimoIrrfCents: 1500_00,  // R$ 1.500,00 simplificacao (legal eh R$ 10/imposto)
} as const;

export const RetencaoTipoUnion = Type.Union([
  Type.Literal('pis'),
  Type.Literal('cofins'),
  Type.Literal('csll'),
  Type.Literal('irrf'),
  Type.Literal('inss'),
  Type.Literal('iss'),
]);
export type RetencaoTipo = Static<typeof RetencaoTipoUnion>;

export const RetencaoComparacaoSchema = Type.Object({
  tipo: RetencaoTipoUnion,
  aliquotaPerc: Type.Number(),
  esperadoCents: Type.Integer(),
  retidoCents: Type.Integer(),
  divergenciaCents: Type.Integer(),         // retido - esperado (negativo = pago menos que devia)
  divergente: Type.Boolean(),               // true se |divergencia| > toleranciaCents
  aplicavel: Type.Boolean(),                // se a aliquota deveria ter sido aplicada nesse caso
  observacao: Type.Union([Type.String(), Type.Null()]),
});
export type RetencaoComparacao = Static<typeof RetencaoComparacaoSchema>;

export const ConferenciaRetencaoSchema = Type.Object({
  contaPagarId: Type.String({ format: 'uuid' }),
  numeroDocumento: Type.Union([Type.String(), Type.Null()]),
  fornecedorRazaoSocial: Type.Union([Type.String(), Type.Null()]),
  cnpjCpf: Type.Union([Type.String(), Type.Null()]),
  /** Regime do fornecedor: true=Simples Nacional (sem retencao na fonte), false=normal, null=desconhecido. */
  fornecedorSimplesNacional: Type.Union([Type.Boolean(), Type.Null()]),
  /** Tipo de inscricao do fornecedor (CNPJ/CPF/CEI). */
  fornecedorTipoInscricao: Type.Union([Type.String(), Type.Null()]),
  fornecedorUf: Type.Union([Type.String(), Type.Null()]),
  fornecedorMunicipio: Type.Union([Type.String(), Type.Null()]),
  valorBrutoCents: Type.Integer(),
  totalRetidoCents: Type.Integer(),
  totalEsperadoCents: Type.Integer(),
  divergenciaTotalCents: Type.Integer(),
  temDivergencia: Type.Boolean(),
  retencoes: Type.Array(RetencaoComparacaoSchema),
  /** Aviso quando o calculo da heuristica nao se aplica (ex: Simples, exterior). */
  alertas: Type.Array(Type.String()),
});
export type ConferenciaRetencao = Static<typeof ConferenciaRetencaoSchema>;

export const ConferenciaDivergenciasResponseSchema = Type.Object({
  itens: Type.Array(ConferenciaRetencaoSchema),
  total: Type.Integer(),
  totalDivergenciaCents: Type.Integer(),
});
export type ConferenciaDivergenciasResponse = Static<typeof ConferenciaDivergenciasResponseSchema>;

export const ConferenciaDoTituloResponseSchema = ConferenciaRetencaoSchema;
export type ConferenciaDoTituloResponse = ConferenciaRetencao;

export const AliquotasUsadasResponseSchema = Type.Object({
  perc: Type.Object({
    pis: Type.Number(),
    cofins: Type.Number(),
    csll: Type.Number(),
    irrf: Type.Number(),
    inss: Type.Number(),
    issMin: Type.Number(),
    issMax: Type.Number(),
  }),
  valorMinimoIrrfCents: Type.Integer(),
  observacao: Type.String(),
});
export type AliquotasUsadasResponse = Static<typeof AliquotasUsadasResponseSchema>;
