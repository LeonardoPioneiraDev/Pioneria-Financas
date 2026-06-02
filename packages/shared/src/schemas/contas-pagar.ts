import { Type, type Static } from '@sinclair/typebox';
import {
  CONTA_PAGAR_STATUS,
  type ContaPagarStatus,
  ORIGEM_DOCUMENTO_CP,
  type OrigemDocumentoCp,
} from '../enums/conta-pagar-status.js';

export { CONTA_PAGAR_STATUS, type ContaPagarStatus, ORIGEM_DOCUMENTO_CP, type OrigemDocumentoCp };

const StatusUnion = Type.Union(CONTA_PAGAR_STATUS.map((s) => Type.Literal(s)));
const OrigemUnion = Type.Union(ORIGEM_DOCUMENTO_CP.map((o) => Type.Literal(o)));

export const ContaPagarResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  fornecedor: Type.Union([
    Type.Object({
      id: Type.String({ format: 'uuid' }),
      razaoSocial: Type.String(),
      nomeFantasia: Type.Union([Type.String(), Type.Null()]),
      cnpjCpf: Type.Union([Type.String(), Type.Null()]),
    }),
    Type.Null(),
  ]),
  numeroDocumento: Type.Union([Type.String(), Type.Null()]),
  serieDocumento: Type.Union([Type.String(), Type.Null()]),
  numeroParcela: Type.Union([Type.Integer(), Type.Null()]),
  tipoDocumento: Type.Union([Type.String(), Type.Null()]),
  competencia: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  dataEmissao: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  dataEntrada: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  dataVencimento: Type.String({ format: 'date' }),
  dataPagamento: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  valorBrutoCents: Type.Integer(),
  descontoCents: Type.Integer(),
  jurosCents: Type.Integer(),
  multaCents: Type.Integer(),
  valorLiquidoCents: Type.Integer(),
  retencoes: Type.Object({
    inssCents: Type.Integer(),
    irrfCents: Type.Integer(),
    pisCents: Type.Integer(),
    cofinsCents: Type.Integer(),
    csllCents: Type.Integer(),
    issCents: Type.Integer(),
    totalCents: Type.Integer(),
  }),
  valorAPagarCents: Type.Integer(),
  status: StatusUnion,
  quitado: Type.Boolean(),
  pagamentoLiberado: Type.Boolean(),
  modalidadePagamento: Type.Union([Type.String(), Type.Null()]),
  tipoPagto: Type.Union([Type.String(), Type.Null()]),
  /**
   * Favorecido "real" do titulo (CPGDOCTO.FAVORECIDODOCTOCPG, texto livre) +
   * inscricao do favorecido. Pode diferir do fornecedor cadastrado (ex.: fornecedor
   * generico) ou vir vazio. So populado apos sync com Oracle ligado.
   */
  favorecido: Type.Object({
    nome: Type.Union([Type.String(), Type.Null()]),
    inscricao: Type.Union([Type.String(), Type.Null()]),
    tipoInscricao: Type.Union([Type.String(), Type.Null()]),
  }),
  /**
   * Banco que PAGOU (conta da empresa de onde saiu o dinheiro) + borderô/nº do
   * documento bancario (BCOMOVTO.DOCMOVTOBCO, ex.: "BO-010260"). So populado apos
   * sync com Oracle ligado.
   */
  pagamento: Type.Object({
    bancoCodigo: Type.Union([Type.Integer(), Type.Null()]),
    bancoNome: Type.Union([Type.String(), Type.Null()]),
    agencia: Type.Union([Type.String(), Type.Null()]),
    conta: Type.Union([Type.String(), Type.Null()]),
    documento: Type.Union([Type.String(), Type.Null()]),
  }),
  observacao: Type.Union([Type.String(), Type.Null()]),
  /**
   * Setor de origem = centro de custo financeiro do item (GLOBUS.CPGITDOC.CODCUSTOFIN),
   * unidade DOMINANTE por valor quando o titulo tem rateio. `codSetor` = codigo
   * (ex "20003"), `setorNome` = descricao (CPGCUSTOS, ex "UNIDADE GAMA").
   */
  codSetor: Type.Union([Type.String(), Type.Null()]),
  setorNome: Type.Union([Type.String(), Type.Null()]),
  /** true = titulo tem itens em mais de uma unidade; `setorNome` e a dominante. */
  setorRateado: Type.Boolean(),
  origemDocumento: OrigemUnion,
  dataIntegrouFlp: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  competenciaFlp: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  origemSistema: Type.String(),
  origemIdExterno: Type.String(),
  ultimoSyncEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  /**
   * Trilha de auditoria do Globus (CPGDOCTO).
   *
   * Os campos `usuario*` sao logins/codigos do Globus, NAO nome completo.
   * Mapeamento pra nome real depende de sincronizar a tabela de usuarios
   * do Globus (proximo work item).
   */
  auditoria: Type.Object({
    usuarioInclusao: Type.Union([Type.String(), Type.Null()]),
    dataInclusao: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    usuarioLiberacaoPagto: Type.Union([Type.String(), Type.Null()]),
    dataLiberacaoPagto: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    usuarioAssinatura: Type.Union([Type.String(), Type.Null()]),
  }),
});
export type ContaPagarResponse = Static<typeof ContaPagarResponseSchema>;

export const ContaPagarListQuerySchema = Type.Object({
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 50 })),
  dtIni: Type.Optional(Type.String({ format: 'date' })),
  dtFim: Type.Optional(Type.String({ format: 'date' })),
  /** Filtro por data de PAGAMENTO (alem do vencimento). Semi-aberto [ini, fim). */
  dtPagIni: Type.Optional(Type.String({ format: 'date' })),
  dtPagFim: Type.Optional(Type.String({ format: 'date' })),
  /** Busca livre: numero documento, fornecedor, CNPJ. */
  search: Type.Optional(Type.String({ maxLength: 100 })),
  /** Status (lista separada por virgula). */
  status: Type.Optional(Type.String({ maxLength: 100 })),
  valorMinCents: Type.Optional(Type.Integer({ minimum: 0 })),
  valorMaxCents: Type.Optional(Type.Integer({ minimum: 0 })),
  /** Apenas vencidos (vencimento < hoje e nao pago). */
  somenteVencidos: Type.Optional(Type.Boolean()),
  /** Origem (lista separada por virgula): folha,nf,guia,manual,desconhecido. */
  origem: Type.Optional(Type.String({ maxLength: 100 })),
  /** Setores: lista de codigos CODCUSTOFIN separada por virgula (ex "10003,20003"). Vazio = todos. */
  setores: Type.Optional(Type.String({ maxLength: 300 })),
  /** Ordenacao: campo:direcao (ex: dataVencimento:asc). */
  ordenarPor: Type.Optional(Type.String({ maxLength: 40 })),
});
export type ContaPagarListQuery = Static<typeof ContaPagarListQuerySchema>;

export const SyncInfoSchema = Type.Object({
  ultimoSyncEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  ultimoSyncStatus: Type.Union([Type.String(), Type.Null()]),
  ultimoSyncMensagem: Type.Union([Type.String(), Type.Null()]),
  totalLocal: Type.Integer(),
  precisaSincronizar: Type.Boolean(),
});
export type SyncInfo = Static<typeof SyncInfoSchema>;

/**
 * Totais do conjunto REALMENTE filtrado (todos os filtros da lista, incluindo data
 * de pagamento), agregados sobre TODAS as paginas — nao so a pagina atual. Util pra
 * responder "quanto foi pago no periodo filtrado". `pagoCents`/`pagoQuantidade`
 * contam titulos pagos (status='pago' OU quitado OU tem data_pagamento).
 */
export const ContaPagarTotaisFiltradosSchema = Type.Object({
  quantidade: Type.Integer(),
  valorLiquidoCents: Type.Integer(),
  valorAPagarCents: Type.Integer(),
  pagoCents: Type.Integer(),
  pagoQuantidade: Type.Integer(),
});
export type ContaPagarTotaisFiltrados = Static<typeof ContaPagarTotaisFiltradosSchema>;

export const ContaPagarListResponseSchema = Type.Object({
  data: Type.Array(ContaPagarResponseSchema),
  pagination: Type.Object({
    page: Type.Integer(),
    limit: Type.Integer(),
    total: Type.Integer(),
    totalPages: Type.Integer(),
  }),
  /** Totais do resultado filtrado (todas as paginas). Ver schema acima. */
  totais: ContaPagarTotaisFiltradosSchema,
  syncInfo: SyncInfoSchema,
});
export type ContaPagarListResponse = Static<typeof ContaPagarListResponseSchema>;

export const SumarioContasPagarRequestSchema = Type.Object({
  dtIni: Type.Optional(Type.String({ format: 'date' })),
  dtFim: Type.Optional(Type.String({ format: 'date' })),
});
export type SumarioContasPagarRequest = Static<typeof SumarioContasPagarRequestSchema>;

export const SumarioContasPagarResponseSchema = Type.Object({
  periodo: Type.Object({
    dtIni: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
    dtFim: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  }),
  total: Type.Object({
    quantidade: Type.Integer(),
    valorBrutoCents: Type.Integer(),
    valorLiquidoCents: Type.Integer(),
    valorAPagarCents: Type.Integer(),
  }),
  porStatus: Type.Array(
    Type.Object({
      status: StatusUnion,
      quantidade: Type.Integer(),
      valorBrutoCents: Type.Integer(),
      valorLiquidoCents: Type.Integer(),
    }),
  ),
  /**
   * Cards de aging — MUTUAMENTE EXCLUSIVOS. Soma = total.quantidade.
   * Lógica: status='pago' OU quitado=true ↦ pago.
   *         Caso contrário, faixas por data_vencimento vs hoje.
   */
  vencidos: Type.Object({
    quantidade: Type.Integer(),
    valorAPagarCents: Type.Integer(),
  }),
  proximos7Dias: Type.Object({
    quantidade: Type.Integer(),
    valorAPagarCents: Type.Integer(),
  }),
  vencerMaisDe7: Type.Object({
    quantidade: Type.Integer(),
    valorAPagarCents: Type.Integer(),
  }),
  pago: Type.Object({
    quantidade: Type.Integer(),
    valorAPagarCents: Type.Integer(),
  }),
  /**
   * Cancelados em aberto (status='cancelado' e nao pagos). Ficam de fora dos
   * 4 cards de aging mas contam no total — por isso entram aqui pra fechar a
   * conta: pago + vencidos + proximos7 + vencerMaisDe7 + cancelados = total.
   */
  cancelados: Type.Object({
    quantidade: Type.Integer(),
    valorAPagarCents: Type.Integer(),
  }),
  topFornecedores: Type.Array(
    Type.Object({
      fornecedorId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
      razaoSocial: Type.String(),
      quantidade: Type.Integer(),
      valorAPagarCents: Type.Integer(),
    }),
  ),
});
export type SumarioContasPagarResponse = Static<typeof SumarioContasPagarResponseSchema>;

/**
 * Setor de origem presente nos CPs — usado pra popular o filtro. `codigo` e o
 * UUID do setor (finance.setor.id); so retorna setores que tem ao menos 1 CP.
 */
export const SetorCpSchema = Type.Object({
  codigo: Type.String(),
  nome: Type.Union([Type.String(), Type.Null()]),
  totalCps: Type.Integer(),
});
export type SetorCp = Static<typeof SetorCpSchema>;
export const SetorCpListResponseSchema = Type.Array(SetorCpSchema);

export const SyncContasPagarRequestSchema = Type.Object({
  dtIni: Type.Optional(Type.String({ format: 'date' })),
  dtFim: Type.Optional(Type.String({ format: 'date' })),
  empresa: Type.Optional(Type.Integer({ minimum: 1 })),
});
export type SyncContasPagarRequest = Static<typeof SyncContasPagarRequestSchema>;

export const SyncResponseSchema = Type.Object({
  jobId: Type.String({ format: 'uuid' }),
  status: Type.Union([Type.Literal('ok'), Type.Literal('parcial'), Type.Literal('erro')]),
  registrosLidos: Type.Integer(),
  registrosGravados: Type.Integer(),
  registrosComErro: Type.Integer(),
  duracaoMs: Type.Integer(),
  mensagem: Type.Optional(Type.String()),
});
export type SyncResponse = Static<typeof SyncResponseSchema>;
