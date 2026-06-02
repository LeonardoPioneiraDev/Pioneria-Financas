import { Type, type Static } from '@sinclair/typebox';
import { TIPO_FOLHA, type TipoFolha } from '../enums/tipo-folha.js';

export { TIPO_FOLHA, type TipoFolha };

const TipoFolhaUnion = Type.Union(TIPO_FOLHA.map((t) => Type.Literal(t)));

export const QuebraTipoFolhaSchema = Type.Object({
  tipo: TipoFolhaUnion,
  qtdTitulos: Type.Integer(),
  valorBrutoCents: Type.Integer(),
  valorLiquidoCents: Type.Integer(),
  valorPagoCents: Type.Integer(),
});
export type QuebraTipoFolha = Static<typeof QuebraTipoFolhaSchema>;

export const FolhaCompetenciasQuerySchema = Type.Object({
  /** Ano (YYYY) - se ausente, retorna todas as competencias disponiveis. */
  ano: Type.Optional(Type.Integer({ minimum: 2000, maximum: 2100 })),
  /** Mes especifico no formato YYYY-MM (filtra so esse). */
  competencia: Type.Optional(Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' })),
  /**
   * Define qual coluna usar para o filtro de mes:
   *   - 'vencimento' (padrao): filtra por data_vencimento (= mes de pagamento na tesouraria)
   *   - 'competencia': filtra por competencia_flp (= mes de trabalho/referencia da folha)
   *
   * Folha de Abril normalmente tem competencia_flp=2026-04 mas vencimento em 2026-05.
   */
  filtrarPor: Type.Optional(
    Type.Union([Type.Literal('vencimento'), Type.Literal('competencia')]),
  ),
});
export type FolhaCompetenciasQuery = Static<typeof FolhaCompetenciasQuerySchema>;

export const CompetenciaFolhaItemSchema = Type.Object({
  /** Competencia (YYYY-MM-01). String vazia '' = "sem competência identificada". */
  competencia: Type.String(),
  /** Ano e mes em portugues, ex: "Maio/2026" ou "Sem competência". */
  competenciaLabel: Type.String(),
  qtdTitulos: Type.Integer(),
  qtdFornecedores: Type.Integer(),
  valorBrutoCents: Type.Integer(),
  retencoes: Type.Object({
    inssCents: Type.Integer(),
    irrfCents: Type.Integer(),
    pisCents: Type.Integer(),
    cofinsCents: Type.Integer(),
    csllCents: Type.Integer(),
    issCents: Type.Integer(),
    totalCents: Type.Integer(),
  }),
  valorLiquidoCents: Type.Integer(),
  valorAPagarCents: Type.Integer(),
  /** Quanto ja foi pago (titulos com data_pagamento ou quitado). */
  valorPagoCents: Type.Integer(),
  /** Quanto ainda esta em aberto. */
  valorEmAbertoCents: Type.Integer(),
  primeiroVencimento: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  ultimoVencimento: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  /** Quebra detalhada por tipo (salario, INSS, FGTS, 13o, ferias, ...). */
  porTipo: Type.Array(QuebraTipoFolhaSchema),
});
export type CompetenciaFolhaItem = Static<typeof CompetenciaFolhaItemSchema>;

export const FolhaCompetenciasResponseSchema = Type.Object({
  competencias: Type.Array(CompetenciaFolhaItemSchema),
  totais: Type.Object({
    qtdCompetencias: Type.Integer(),
    qtdTitulos: Type.Integer(),
    valorBrutoCents: Type.Integer(),
    valorLiquidoCents: Type.Integer(),
    valorAPagarCents: Type.Integer(),
    valorPagoCents: Type.Integer(),
    valorEmAbertoCents: Type.Integer(),
    /** Buckets de aging — MUTUAMENTE EXCLUSIVOS. Soma = qtdTitulos / valorLiquidoCents. */
    vencidos: Type.Object({ qtd: Type.Integer(), valorCents: Type.Integer() }),
    venceEm7d: Type.Object({ qtd: Type.Integer(), valorCents: Type.Integer() }),
    venceMaisDe7: Type.Object({ qtd: Type.Integer(), valorCents: Type.Integer() }),
    pago: Type.Object({ qtd: Type.Integer(), valorCents: Type.Integer() }),
    /** Total de retenções somadas no período. Útil para card próprio. */
    retencoesCents: Type.Integer(),
  }),
  /** Quebra por tipo AGREGADA do período inteiro (não só de uma competência). */
  porTipoGeral: Type.Array(QuebraTipoFolhaSchema),
  syncInfo: Type.Object({
    ultimoSyncEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    totalLocal: Type.Integer(),
    precisaSincronizar: Type.Boolean(),
  }),
});
export type FolhaCompetenciasResponse = Static<typeof FolhaCompetenciasResponseSchema>;
