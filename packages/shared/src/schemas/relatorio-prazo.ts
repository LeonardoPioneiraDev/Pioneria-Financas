import { Type, type Static } from '@sinclair/typebox';

/**
 * Linha do tempo do projeto — da ideia ate a producao.
 *
 * A API devolve SO o que vem do banco (registros de conferencia, contagens) e o
 * que depende da data de hoje. O catalogo de modulos vive no frontend
 * (`module-status.ts`) e e cruzado la, para nao duplicar a fonte de verdade.
 */

export const ConferenciaLinhaTempoSchema = Type.Object({
  funcionalidade: Type.String(),
  tipo: Type.String(),
  status: Type.String(),
  observacoes: Type.Union([Type.String(), Type.Null()]),
  /** 'YYYY-MM-DD' no fuso de Sao Paulo. */
  criadoEm: Type.String(),
});
export type ConferenciaLinhaTempo = Static<typeof ConferenciaLinhaTempoSchema>;

export const RelatorioPrazoResponseSchema = Type.Object({
  /** 'YYYY-MM-DD' em Sao Paulo — a data que da sentido a todos os "dias". */
  hoje: Type.String(),

  marcos: Type.Object({
    inicioFase0: Type.String(),
    inicioFase1: Type.String(),
    cpDeclaradoPronto: Type.String(),
  }),

  dias: Type.Object({
    /** Da primeira ideia ate hoje. */
    total: Type.Integer(),
    /** Descoberta e prova de conceito. */
    fase0: Type.Integer(),
    /** Construcao do sistema definitivo. */
    fase1: Type.Integer(),
    /** Desde a primeira conferencia registrada. 0 se ainda nao comecou. */
    validacao: Type.Integer(),
  }),

  /** Data da primeira conferencia registrada. `null` antes da primeira. */
  inicioValidacao: Type.Union([Type.String(), Type.Null()]),

  /** Trilha completa, sem resumir — e a evidencia do documento. */
  validacoes: Type.Array(ConferenciaLinhaTempoSchema),

  contagens: Type.Object({
    tabelas: Type.Integer(),
    titulosCp: Type.Integer(),
  }),

  /**
   * Base da projecao de quanto falta. `baseadoEmCiclos: 0` significa que nenhum
   * ciclo fechou e `diasPorCiclo` e um chute conservador — a UI precisa dizer isso.
   */
  cicloValidacao: Type.Object({
    diasPorCiclo: Type.Integer(),
    baseadoEmCiclos: Type.Integer(),
  }),

  /** Caso-referencia da distancia entre "declarado pronto" e "validado". */
  referencia: Type.Object({
    funcionalidade: Type.String(),
    diasProntoAteValidado: Type.Union([Type.Integer(), Type.Null()]),
    diasEsperandoConferencia: Type.Union([Type.Integer(), Type.Null()]),
    rodadas: Type.Integer(),
  }),
});
export type RelatorioPrazoResponse = Static<typeof RelatorioPrazoResponseSchema>;
