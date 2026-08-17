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

// ============================================================================
// ENCARGOS E BENEFÍCIOS DA FOLHA (fonte: FLP — finance.ficha_evento)
// ----------------------------------------------------------------------------
// Diferente da agregacao por competencia acima (que vem do Contas a Pagar e so
// enxerga o repasse de pensao), este bloco vem da FOLHA REAL do RH (FLP), ja
// sincronizada pelo modulo folha-detalhe. Mostra o custo da folha quebrado em
// encargos (INSS/FGTS/IRRF), beneficios (ticket/cesta/seguro) e descontos/
// repasses (adiantamento/consignado/sindicato/pensao) — cada numero rastreavel
// ate o evento (verba) de origem.
// ============================================================================

/** Natureza de uma categoria de folha, para agrupar visualmente. */
export const NATUREZA_CATEGORIA_FOLHA = ['provento', 'encargo', 'beneficio', 'desconto'] as const;
export type NaturezaCategoriaFolha = (typeof NATUREZA_CATEGORIA_FOLHA)[number];
const NaturezaUnion = Type.Union(NATUREZA_CATEGORIA_FOLHA.map((n) => Type.Literal(n)));

/** Um evento (verba) que compoe uma categoria — rastreio do numero ate a fonte. */
export const EventoRastreioSchema = Type.Object({
  codEvento: Type.Integer(),
  descricao: Type.String(),
  valorCents: Type.Integer(),
});
export type EventoRastreio = Static<typeof EventoRastreioSchema>;

/** Categoria da folha (ex.: INSS retido) com total + eventos que a compoem. */
export const CategoriaFolhaSchema = Type.Object({
  chave: Type.String(),
  label: Type.String(),
  natureza: NaturezaUnion,
  valorCents: Type.Integer(),
  /** Funcionarios com pelo menos um evento da categoria (aproximacao: max entre eventos). */
  qtdFuncionarios: Type.Integer(),
  eventos: Type.Array(EventoRastreioSchema),
});
export type CategoriaFolha = Static<typeof CategoriaFolhaSchema>;

export const FolhaEncargosQuerySchema = Type.Object({
  /** Competencia YYYY-MM (obrigatoria). */
  competencia: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }),
  /** Tipo de folha FLP (1=mensal, 2=adiantamento, 3=13o, 4=ferias, 5=rescisao). Default 1. */
  tipoFolha: Type.Optional(Type.Integer({ minimum: 1, maximum: 9 })),
});
export type FolhaEncargosQuery = Static<typeof FolhaEncargosQuerySchema>;

export const FolhaEncargosResponseSchema = Type.Object({
  /** false = nao ha folha FLP sincronizada para a competencia/tipo. */
  disponivel: Type.Boolean(),
  competencia: Type.String(),
  competenciaLabel: Type.String(),
  tipoFolha: Type.Integer(),
  tipoFolhaLabel: Type.String(),
  qtdFuncionarios: Type.Integer(),
  /** Totalizadores autoritativos da folha (eventos 318 / 319). */
  proventosCents: Type.Integer(),
  descontosCents: Type.Integer(),
  liquidoCents: Type.Integer(),
  /** Categorias detalhadas (encargos, beneficios, descontos/repasses). */
  categorias: Type.Array(CategoriaFolhaSchema),
  /** Total de pensao alimenticia (destaque — vira repasse no Contas a Pagar). */
  pensaoCents: Type.Integer(),
  /** Avisos honestos sobre o que NAO esta na folha (ex.: INSS patronal na guia). */
  observacoes: Type.Array(Type.String()),
  /** Competencias/tipos com dado FLP local, para o seletor quando vazio. */
  competenciasDisponiveis: Type.Array(
    Type.Object({ competencia: Type.String(), tipoFolha: Type.Integer(), qtdFuncionarios: Type.Integer() }),
  ),
  ultimoSyncEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
});
export type FolhaEncargosResponse = Static<typeof FolhaEncargosResponseSchema>;

// ---- Drill-down: funcionarios que compoem uma verba (evento) ----
// DADO SENSIVEL (LGPD): valores individualizados por funcionario. O acesso e
// auditado no front (registrarAcesso) como na tela Folha por Setor.

export const FolhaEventoDetalheQuerySchema = Type.Object({
  competencia: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }),
  /** CODEVENTO da verba a detalhar (ex.: 171 = INSS SALARIO). */
  codEvento: Type.Integer(),
  tipoFolha: Type.Optional(Type.Integer({ minimum: 1, maximum: 9 })),
});
export type FolhaEventoDetalheQuery = Static<typeof FolhaEventoDetalheQuerySchema>;

export const FuncionarioEventoSchema = Type.Object({
  codFunc: Type.String(),
  nome: Type.String(),
  descFuncao: Type.Union([Type.String(), Type.Null()]),
  descArea: Type.Union([Type.String(), Type.Null()]),
  /** Referencia do lancamento (horas, dias, %) — pode ser nula. */
  referencia: Type.Union([Type.String(), Type.Null()]),
  valorCents: Type.Integer(),
});
export type FuncionarioEvento = Static<typeof FuncionarioEventoSchema>;

export const FolhaEventoDetalheResponseSchema = Type.Object({
  codEvento: Type.Integer(),
  descricao: Type.String(),
  competencia: Type.String(),
  competenciaLabel: Type.String(),
  tipoFolha: Type.Integer(),
  tipoFolhaLabel: Type.String(),
  totalCents: Type.Integer(),
  qtdFuncionarios: Type.Integer(),
  /** Funcionarios ordenados por valor (maior primeiro). */
  funcionarios: Type.Array(FuncionarioEventoSchema),
});
export type FolhaEventoDetalheResponse = Static<typeof FolhaEventoDetalheResponseSchema>;

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
