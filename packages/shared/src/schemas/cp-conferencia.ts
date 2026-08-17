import { Type, type Static } from '@sinclair/typebox';

/**
 * CONFERÊNCIA do Contas a Pagar contra o Globus.
 *
 * Compara, para um período, o que o NOSSO banco soma com o que o ERP soma —
 * calculado independentemente dos dois lados. É a defesa contra a classe de erro
 * em que cada linha está certa e só o TOTAL está errado (duplicidade que o
 * Globus não sinaliza).
 */
export const CpConferenciaQuerySchema = Type.Object({
  dtIni: Type.String({ format: 'date' }),
  /** Fim EXCLUSIVO, igual ao resto do módulo. */
  dtFim: Type.String({ format: 'date' }),
});
export type CpConferenciaQuery = Static<typeof CpConferenciaQuerySchema>;

/** Uma faixa comparada (por status do ERP). */
export const CpConferenciaLinhaSchema = Type.Object({
  /** N=em aberto · B=baixado(pago) · C=cancelado. */
  statusGlobus: Type.String(),
  rotulo: Type.String(),
  globusQuantidade: Type.Integer(),
  globusCents: Type.Integer(),
  sistemaQuantidade: Type.Integer(),
  sistemaCents: Type.Integer(),
  difQuantidade: Type.Integer(),
  difCents: Type.Integer(),
  ok: Type.Boolean(),
});
export type CpConferenciaLinha = Static<typeof CpConferenciaLinhaSchema>;

export const CpConferenciaResponseSchema = Type.Object({
  periodo: Type.Object({ de: Type.String(), ate: Type.String() }),
  /** Comparação por status do ERP (inclui substituídos e cancelados). */
  porStatus: Type.Array(CpConferenciaLinhaSchema),
  /**
   * O número que a tela mostra: total que ENTRA nas somas dos dois lados
   * (fora substituídos e cancelados).
   */
  totalSomavel: CpConferenciaLinhaSchema,
  /** Tudo bateu? */
  conferido: Type.Boolean(),
  /** Frase pronta para a UI. */
  resumo: Type.String(),
  /** Quando o Oracle não está acessível, devolve o motivo em vez de mentir. */
  indisponivel: Type.Union([Type.String(), Type.Null()]),
});
export type CpConferenciaResponse = Static<typeof CpConferenciaResponseSchema>;
