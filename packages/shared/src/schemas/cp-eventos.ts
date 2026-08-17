import { Type, type Static } from '@sinclair/typebox';

/**
 * Trilha REAL do documento no Globus (CPGDOCTO_HISTORICO_NEGOCIACOES).
 * Uma linha por ato, com usuário e hora — inclusive os que a visão resumida
 * escondia: cancelamento de pagamento, repagamento, cancelamento do documento.
 */
export const CpEventoSchema = Type.Object({
  sequencia: Type.Integer(),
  codTipoEvento: Type.Union([Type.Integer(), Type.Null()]),
  /** Descrição do dicionário de eventos do Globus. */
  tipoDescricao: Type.Union([Type.String(), Type.Null()]),
  /** Texto do ato: "Pagamento de documento.", "Cancelamento de pagamento." … */
  detalhe: Type.Union([Type.String(), Type.Null()]),
  /** Status do documento DEPOIS deste ato: N=aberto · B=baixado · C=cancelado. */
  statusResultante: Type.Union([Type.String(), Type.Null()]),
  usuario: Type.Union([Type.String(), Type.Null()]),
  ocorridoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  /** Classificação para a UI pintar o evento. */
  natureza: Type.Union([
    Type.Literal('criacao'),
    Type.Literal('liberacao'),
    Type.Literal('pagamento'),
    Type.Literal('cancelamento_pagamento'),
    Type.Literal('cancelamento_documento'),
    Type.Literal('outro'),
  ]),
});
export type CpEvento = Static<typeof CpEventoSchema>;

export const CpEventosResponseSchema = Type.Object({
  eventos: Type.Array(CpEventoSchema),
  /** Status atual derivado por nós. */
  statusSistema: Type.String(),
  /** STATUSDOCTOCPG cru do Globus (N/B/C). Null = ainda não sincronizado. */
  statusGlobus: Type.Union([Type.String(), Type.Null()]),
  /** QUITADODOCTOCPG cru — informativo; NÃO é sinal de compensação bancária. */
  quitadoGlobus: Type.Boolean(),
  /**
   * O nosso status contradiz o do Globus? Quando true, a tela avisa em vez de
   * mostrar um número que o financeiro não reconhece.
   */
  divergente: Type.Boolean(),
  /** Houve "Cancelamento de pagamento" em algum momento da trilha. */
  teveCancelamentoPagamento: Type.Boolean(),
  /** Quantas vezes o documento foi pago (baixado) — >1 significa refeito. */
  vezesPago: Type.Integer(),
  /** Resumo em uma frase para o cabeçalho da seção. */
  resumo: Type.String(),
});
export type CpEventosResponse = Static<typeof CpEventosResponseSchema>;
