import { Type, type Static } from '@sinclair/typebox';

// ============================================================================
// MAPA DIARIO — matriz (data_transporte × data_resgate)
// ============================================================================

export const MapaDiarioQuerySchema = Type.Object({
  /** Filtro por data_transporte >= dtIni. */
  dtIni: Type.String({ format: 'date' }),
  /** Filtro por data_transporte <= dtFim. */
  dtFim: Type.String({ format: 'date' }),
  /** Se true, retorna creditos no lugar de valor. Default valor. */
  metrica: Type.Optional(Type.Union([Type.Literal('valor'), Type.Literal('creditos')])),
  /** Filtra por familia (CIDADAO, VT, ...). */
  familia: Type.Optional(Type.String({ maxLength: 20 })),
});
export type MapaDiarioQuery = Static<typeof MapaDiarioQuerySchema>;

export const MapaDiarioLinhaSchema = Type.Object({
  dataTransporte: Type.String({ format: 'date' }),
  totalCents: Type.Integer(),
  totalCreditos: Type.Integer(),
  /** Tempo medio em dias entre transporte e resgate (ponderado por valor). */
  tempoMedioDias: Type.Number(),
  status: Type.Union([Type.Literal('recolhido'), Type.Literal('pendente'), Type.Literal('anteriores')]),
  /** Dicionario data_resgate (YYYY-MM-DD) → valor_cents/creditos. */
  resgates: Type.Record(Type.String(), Type.Object({
    valorCents: Type.Integer(),
    creditos: Type.Integer(),
  })),
});
export type MapaDiarioLinha = Static<typeof MapaDiarioLinhaSchema>;

export const MapaDiarioResponseSchema = Type.Object({
  periodo: Type.Object({ dtIni: Type.String(), dtFim: Type.String() }),
  metrica: Type.Union([Type.Literal('valor'), Type.Literal('creditos')]),
  totais: Type.Object({
    valorCents: Type.Integer(),
    creditos: Type.Integer(),
    tempoMedioDias: Type.Number(),
    datasTransp: Type.Integer(),
    datasResgate: Type.Integer(),
  }),
  /** Datas de resgate que aparecem em alguma celula (sorted ASC). */
  colunasResgate: Type.Array(Type.String({ format: 'date' })),
  /** Linhas de transporte ordenadas DESC. Inclui linha "anteriores" (dataTransporte = dtIni - 1) se houver. */
  linhas: Type.Array(MapaDiarioLinhaSchema),
});
export type MapaDiarioResponse = Static<typeof MapaDiarioResponseSchema>;

// ============================================================================
// COMPOSICAO POR FAMILIA (drill-down de 1 dia transportado)
// ============================================================================

export const ComposicaoFamiliaQuerySchema = Type.Object({
  dataTransporte: Type.String({ format: 'date' }),
});
export type ComposicaoFamiliaQuery = Static<typeof ComposicaoFamiliaQuerySchema>;

export const FamiliaItemSchema = Type.Object({
  codigo: Type.String(),
  nome: Type.String(),
  tipo: Type.Union([Type.Literal('pagante'), Type.Literal('gratuidade')]),
  fonteSubsidio: Type.Union([Type.String(), Type.Null()]),
  creditos: Type.Integer(),
  valorCents: Type.Integer(),
  percReceita: Type.Number(),
  percCreditos: Type.Number(),
});
export type FamiliaItem = Static<typeof FamiliaItemSchema>;

export const ComposicaoFamiliaResponseSchema = Type.Object({
  dataTransporte: Type.String({ format: 'date' }),
  totais: Type.Object({
    valorCents: Type.Integer(),
    creditos: Type.Integer(),
    creditosPagantes: Type.Integer(),
    creditosGratuidades: Type.Integer(),
    percGratuidades: Type.Number(),
    tempoMedioDias: Type.Number(),
  }),
  resgatesPorData: Type.Array(Type.Object({
    dataResgate: Type.String({ format: 'date' }),
    diasApos: Type.Integer(),
    creditos: Type.Integer(),
    valorCents: Type.Integer(),
    percDoTotal: Type.Number(),
  })),
  familias: Type.Array(FamiliaItemSchema),
});
export type ComposicaoFamiliaResponse = Static<typeof ComposicaoFamiliaResponseSchema>;

// ============================================================================
// AGING (buckets de tempo entre transporte e resgate)
// ============================================================================

export const AgingResponseSchema = Type.Object({
  periodo: Type.Object({ dtIni: Type.String(), dtFim: Type.String() }),
  buckets: Type.Array(Type.Object({
    chave: Type.String(),           // "0-2d", "3-5d", "6-10d", "10+d"
    rotulo: Type.String(),
    creditos: Type.Integer(),
    valorCents: Type.Integer(),
    perc: Type.Number(),
  })),
});
export type AgingResponse = Static<typeof AgingResponseSchema>;

// ============================================================================
// SYNC
// ============================================================================

export const SyncHorariosResponseSchema = Type.Object({
  jobId: Type.String({ format: 'uuid' }),
  status: Type.Union([Type.Literal('ok'), Type.Literal('parcial'), Type.Literal('erro')]),
  relatoriosLidos: Type.Integer(),
  relatoriosGravados: Type.Integer(),
  relatoriosInalterados: Type.Integer(),
  relatoriosComErro: Type.Integer(),
  duracaoMs: Type.Integer(),
  etlProcessados: Type.Optional(Type.Integer()),
  etlGravadasCelulas: Type.Optional(Type.Integer()),
  etlComErro: Type.Optional(Type.Integer()),
  /** Resultados do sync bancário (BCOMOVTO) — opcional, só presente quando `sincronizar` também roda o lado banco. */
  bancoMovtoLidos: Type.Optional(Type.Integer()),
  bancoMovtoGravados: Type.Optional(Type.Integer()),
  bancoMovtoRepassesBrb: Type.Optional(Type.Integer()),
  mensagem: Type.Optional(Type.String()),
});
export type SyncHorariosResponse = Static<typeof SyncHorariosResponseSchema>;
