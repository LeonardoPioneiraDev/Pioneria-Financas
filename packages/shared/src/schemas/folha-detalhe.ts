import { Type, type Static } from '@sinclair/typebox';

// Re-exporta enums runtime para conveniência (definidos em enums/tipo-folha-flp.ts
// para o frontend poder importar sem arrastar @sinclair/typebox no bundle).
export { TIPO_FOLHA_FLP, TIPO_FOLHA_FLP_LABEL, type TipoFolhaFlp } from '../enums/tipo-folha-flp.js';

// ====================== POR SETOR ======================

export const SetorFolhaQuerySchema = Type.Object({
  competencia: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$', description: 'YYYY-MM da competência da folha' }),
  tipoFolha: Type.Optional(Type.Integer({ minimum: 1, maximum: 99 })),
});
export type SetorFolhaQuery = Static<typeof SetorFolhaQuerySchema>;

export const QuebraFuncaoSchema = Type.Object({
  descFuncao: Type.Union([Type.String(), Type.Null()]),
  qtdFuncionarios: Type.Integer(),
  liquidoCents: Type.Integer(),
});
export type QuebraFuncao = Static<typeof QuebraFuncaoSchema>;

/** Balde de reconciliação do setor da folha com a unidade financeira do CP. */
export const BucketSetorSchema = Type.Union([
  Type.Literal('operacional'),
  Type.Literal('nao_operacional'),
  Type.Literal('a_classificar'),
]);
export type BucketSetor = Static<typeof BucketSetorSchema>;

export const SetorItemSchema = Type.Object({
  /** Código do grupo reconciliado (= unidade CP quando operacional; CODAREA cru senão). */
  codArea: Type.Union([Type.String(), Type.Null()]),
  descArea: Type.Union([Type.String(), Type.Null()]),
  /** CODCUSTOFIN da unidade financeira do CP, quando há correspondência. */
  codUnidade: Type.Union([Type.String(), Type.Null()]),
  bucket: BucketSetorSchema,
  qtdFuncionarios: Type.Integer(),
  /** Funcionários com líquido > 0 (recebem de fato). */
  qtdComLiquido: Type.Integer(),
  /** Funcionários com líquido 0 (afastados / saldo devedor). Contam custo de encargo, não de salário. */
  qtdSemLiquido: Type.Integer(),
  proventosCents: Type.Integer(),
  descontosCents: Type.Integer(),
  liquidoCents: Type.Integer(),
  inssCents: Type.Integer(),
  fgtsCents: Type.Integer(),
  irrfCents: Type.Integer(),
  vtCents: Type.Integer(),
  vaCents: Type.Integer(),
  porFuncao: Type.Array(QuebraFuncaoSchema),
});
export type SetorItem = Static<typeof SetorItemSchema>;

export const SetorFolhaResponseSchema = Type.Object({
  competencia: Type.String(),
  tipoFolha: Type.Union([Type.Integer(), Type.Null()]),
  totais: Type.Object({
    qtdSetores: Type.Integer(),
    qtdFuncionarios: Type.Integer(),
    proventosCents: Type.Integer(),
    descontosCents: Type.Integer(),
    liquidoCents: Type.Integer(),
    inssCents: Type.Integer(),
    fgtsCents: Type.Integer(),
    irrfCents: Type.Integer(),
    vtCents: Type.Integer(),
    vaCents: Type.Integer(),
  }),
  setores: Type.Array(SetorItemSchema),
  syncInfo: Type.Object({
    ultimoSyncEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    totalFuncionarios: Type.Integer(),
    totalFichas: Type.Integer(),
    precisaSincronizar: Type.Boolean(),
  }),
});
export type SetorFolhaResponse = Static<typeof SetorFolhaResponseSchema>;

// ====================== FUNCIONÁRIOS ======================

export const FuncionariosQuerySchema = Type.Object({
  competencia: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }),
  tipoFolha: Type.Optional(Type.Integer({ minimum: 1, maximum: 99 })),
  codArea: Type.Optional(Type.String({ maxLength: 20 })),
  /** Filtra por função exata (DESCFUNCAO) — usado no drill-down da quebra por função. */
  descFuncao: Type.Optional(Type.String({ maxLength: 200 })),
  /** Status do funcionário: ativo, inativo ou todos (default). */
  status: Type.Optional(Type.Union([Type.Literal('ativo'), Type.Literal('inativo'), Type.Literal('todos')])),
  /** Recorte por líquido: com líquido, sem líquido (afastado/saldo devedor) ou todos (default). */
  liquido: Type.Optional(Type.Union([Type.Literal('com'), Type.Literal('sem'), Type.Literal('todos')])),
  busca: Type.Optional(Type.String({ maxLength: 100 })),
  pagina: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  porPagina: Type.Optional(Type.Integer({ minimum: 10, maximum: 200, default: 50 })),
});
export type FuncionariosQuery = Static<typeof FuncionariosQuerySchema>;

/**
 * Situação do funcionário NA FOLHA da competência — explica um líquido zero ou
 * baixo, que sem contexto parece erro. Derivada dos eventos da ficha:
 *  - afastado_acidente / afastado_doenca / afastado_maternidade: benefício pago
 *    pelo INSS; a empresa lança provento e desconta o mesmo valor (líquido 0).
 *  - licenca: em licença no mês.
 *  - saldo_devedor: o líquido foi consumido por adiantamentos/descontos/empréstimos
 *    e o Globus zera a folha, carregando a dívida (funcionário DEVE à empresa).
 *  - normal: recebeu normalmente.
 */
export const SITUACAO_FOLHA = [
  'normal', 'afastado_acidente', 'afastado_doenca', 'afastado_maternidade', 'licenca', 'saldo_devedor',
] as const;
export type SituacaoFolha = (typeof SITUACAO_FOLHA)[number];

export const SITUACAO_FOLHA_LABEL: Record<SituacaoFolha, string> = {
  normal: 'Normal',
  afastado_acidente: 'Afastado — acidente de trabalho',
  afastado_doenca: 'Afastado — auxílio-doença',
  afastado_maternidade: 'Afastada — salário-maternidade',
  licenca: 'Em licença',
  saldo_devedor: 'Saldo devedor — líquido comprometido',
};

export const FuncionarioItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  codFunc: Type.String(),
  nome: Type.String(),
  codArea: Type.Union([Type.String(), Type.Null()]),
  descArea: Type.Union([Type.String(), Type.Null()]),
  descFuncao: Type.Union([Type.String(), Type.Null()]),
  proventosCents: Type.Integer(),
  descontosCents: Type.Integer(),
  liquidoCents: Type.Integer(),
  /** FGTS que a empresa recolhe — o único custo mesmo de quem tem líquido zero. */
  fgtsCents: Type.Integer(),
  /** Por que o líquido é o que é — em especial quando zero. */
  situacaoFolha: Type.Union(SITUACAO_FOLHA.map((s) => Type.Literal(s))),
});
export type FuncionarioItem = Static<typeof FuncionarioItemSchema>;

export const FuncionariosResponseSchema = Type.Object({
  competencia: Type.String(),
  itens: Type.Array(FuncionarioItemSchema),
  total: Type.Integer(),
  pagina: Type.Integer(),
  porPagina: Type.Integer(),
  totalPaginas: Type.Integer(),
});
export type FuncionariosResponse = Static<typeof FuncionariosResponseSchema>;

// ====================== CONTRA-CHEQUE ======================

export const ContraChequeQuerySchema = Type.Object({
  competencia: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }),
  tipoFolha: Type.Optional(Type.Integer({ minimum: 1, maximum: 99 })),
});
export type ContraChequeQuery = Static<typeof ContraChequeQuerySchema>;

export const EventoContraChequeSchema = Type.Object({
  codEvento: Type.Integer(),
  descricao: Type.String(),
  tipo: Type.Union([Type.Literal('P'), Type.Literal('D'), Type.Literal('B')]),
  grupo: Type.Union([Type.String(), Type.Null()]),
  referencia: Type.Union([Type.Number(), Type.Null()]),
  valorCents: Type.Integer(),
});
export type EventoContraCheque = Static<typeof EventoContraChequeSchema>;

export const ContraChequeResponseSchema = Type.Object({
  funcionario: Type.Object({
    id: Type.String({ format: 'uuid' }),
    codFunc: Type.String(),
    nome: Type.String(),
    descFuncao: Type.Union([Type.String(), Type.Null()]),
    descArea: Type.Union([Type.String(), Type.Null()]),
    agencia: Type.Union([Type.String(), Type.Null()]),
    contaCorrente: Type.Union([Type.String(), Type.Null()]),
  }),
  competencia: Type.String(),
  tipoFolha: Type.Union([Type.Integer(), Type.Null()]),
  proventos: Type.Array(EventoContraChequeSchema),
  descontos: Type.Array(EventoContraChequeSchema),
  totais: Type.Object({
    proventosCents: Type.Integer(),
    descontosCents: Type.Integer(),
    liquidoCents: Type.Integer(),
    baseInssCents: Type.Integer(),
    baseFgtsCents: Type.Integer(),
    baseIrrfCents: Type.Integer(),
    fgtsCents: Type.Integer(),
  }),
});
export type ContraChequeResponse = Static<typeof ContraChequeResponseSchema>;

// ====================== SYNC ======================

export const SyncFlpBodySchema = Type.Object({
  competencia: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }),
  tipoFolha: Type.Optional(Type.Integer({ minimum: 1, maximum: 99 })),
});
export type SyncFlpBody = Static<typeof SyncFlpBodySchema>;

export const SyncFlpResponseSchema = Type.Object({
  jobId: Type.String({ format: 'uuid' }),
  status: Type.Union([Type.Literal('ok'), Type.Literal('parcial'), Type.Literal('erro')]),
  funcionariosLidos: Type.Integer(),
  funcionariosGravados: Type.Integer(),
  eventosLidos: Type.Integer(),
  eventosGravados: Type.Integer(),
  fichasLidas: Type.Integer(),
  fichasGravadas: Type.Integer(),
  duracaoMs: Type.Integer(),
  mensagem: Type.Optional(Type.String()),
});
export type SyncFlpResponse = Static<typeof SyncFlpResponseSchema>;

// ====================== DIAGNÓSTICO ======================

export const CompetenciaDisponivelSchema = Type.Object({
  competencia: Type.String({ format: 'date' }),
  tipoFolha: Type.Integer(),
  qtdLancamentos: Type.Integer(),
  qtdFuncionarios: Type.Integer(),
  somaCents: Type.String(),
});
export type CompetenciaDisponivel = Static<typeof CompetenciaDisponivelSchema>;

// ====================== COMPARATIVO (mês anterior) ======================

export const ComparativoQuerySchema = Type.Object({
  competencia: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$', description: 'YYYY-MM — mês corrente da comparação' }),
  tipoFolha: Type.Optional(Type.Integer({ minimum: 1, maximum: 99 })),
});
export type ComparativoQuery = Static<typeof ComparativoQuerySchema>;

const TotaisComparativoSchema = Type.Object({
  qtdFuncionarios: Type.Integer(),
  proventosCents: Type.Integer(),
  descontosCents: Type.Integer(),
  liquidoCents: Type.Integer(),
});

export const ComparativoSetorItemSchema = Type.Object({
  codArea: Type.Union([Type.String(), Type.Null()]),
  descArea: Type.Union([Type.String(), Type.Null()]),
  atualQtd: Type.Integer(),
  anteriorQtd: Type.Integer(),
  atualLiquidoCents: Type.Integer(),
  anteriorLiquidoCents: Type.Integer(),
  deltaLiquidoCents: Type.Integer(),
  /** Variação percentual do líquido; null quando o mês anterior é zero. */
  deltaLiquidoPct: Type.Union([Type.Number(), Type.Null()]),
});
export type ComparativoSetorItem = Static<typeof ComparativoSetorItemSchema>;

export const ComparativoResponseSchema = Type.Object({
  competencia: Type.String(),
  competenciaAnterior: Type.String(),
  tipoFolha: Type.Union([Type.Integer(), Type.Null()]),
  totaisAtual: TotaisComparativoSchema,
  totaisAnterior: TotaisComparativoSchema,
  setores: Type.Array(ComparativoSetorItemSchema),
});
export type ComparativoResponse = Static<typeof ComparativoResponseSchema>;

// ====================== FÉRIAS E 13º REALIZADO ======================

export const FeriasDecimoQuerySchema = Type.Object({
  ano: Type.String({ pattern: '^\\d{4}$', description: 'Ano (YYYY) do realizado' }),
});
export type FeriasDecimoQuery = Static<typeof FeriasDecimoQuerySchema>;

const RealizadoMesSchema = Type.Object({
  competencia: Type.String({ description: 'YYYY-MM' }),
  valorCents: Type.Integer(),
  qtdFuncionarios: Type.Integer(),
});
const RealizadoVerbaSchema = Type.Object({
  codEvento: Type.Integer(),
  descricao: Type.String(),
  valorCents: Type.Integer(),
});
const RealizadoSetorSchema = Type.Object({
  codArea: Type.Union([Type.String(), Type.Null()]),
  descArea: Type.Union([Type.String(), Type.Null()]),
  valorCents: Type.Integer(),
});
export const CategoriaRealizadoSchema = Type.Object({
  totalCents: Type.Integer(),
  porMes: Type.Array(RealizadoMesSchema),
  porVerba: Type.Array(RealizadoVerbaSchema),
  porSetor: Type.Array(RealizadoSetorSchema),
});
export type CategoriaRealizado = Static<typeof CategoriaRealizadoSchema>;

export const FeriasDecimoResponseSchema = Type.Object({
  ano: Type.String(),
  ferias: CategoriaRealizadoSchema,
  decimoTerceiro: CategoriaRealizadoSchema,
  observacao: Type.String(),
});
export type FeriasDecimoResponse = Static<typeof FeriasDecimoResponseSchema>;

// ====================== CUSTO TOTAL COM ENCARGOS ======================

export const CustoEncargosQuerySchema = Type.Object({
  competencia: Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' }),
  tipoFolha: Type.Optional(Type.Integer({ minimum: 1, maximum: 99 })),
});
export type CustoEncargosQuery = Static<typeof CustoEncargosQuerySchema>;

export const CustoEncargosSetorSchema = Type.Object({
  /** Código do grupo reconciliado (= unidade CP quando operacional; CODAREA cru senão). */
  codArea: Type.Union([Type.String(), Type.Null()]),
  descArea: Type.Union([Type.String(), Type.Null()]),
  /** CODCUSTOFIN da unidade financeira do CP, quando há correspondência. */
  codUnidade: Type.Union([Type.String(), Type.Null()]),
  bucket: BucketSetorSchema,
  qtdFuncionarios: Type.Integer(),
  brutoCents: Type.Integer(),
  fgtsCents: Type.Integer(),
  baseInssCents: Type.Integer(),
  /**
   * INSS patronal do setor. Quando a GPS do Globus está sincronizada, é o REAL
   * (com desoneração) rateado por base INSS; senão, estimativa (base × alíquota).
   * A fonte efetiva está em `patronalFonte` na resposta.
   */
  inssPatronalCents: Type.Integer(),
  /** Custo empresa = bruto + FGTS (real) + INSS patronal. */
  custoEmpresaCents: Type.Integer(),
});
export type CustoEncargosSetor = Static<typeof CustoEncargosSetorSchema>;

export const CustoEncargosResponseSchema = Type.Object({
  competencia: Type.String(),
  tipoFolha: Type.Union([Type.Integer(), Type.Null()]),
  /** 'real' = INSS patronal veio da GPS do Globus; 'estimativa' = base × alíquota. */
  patronalFonte: Type.Union([Type.Literal('real'), Type.Literal('estimativa')]),
  aliquotaPatronalEstimada: Type.Number(),
  gpsSincronizadoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  totais: Type.Object({
    qtdFuncionarios: Type.Integer(),
    brutoCents: Type.Integer(),
    fgtsCents: Type.Integer(),
    baseInssCents: Type.Integer(),
    inssPatronalCents: Type.Integer(),
    custoEmpresaCents: Type.Integer(),
  }),
  setores: Type.Array(CustoEncargosSetorSchema),
  observacao: Type.String(),
});
export type CustoEncargosResponse = Static<typeof CustoEncargosResponseSchema>;

// ====================== DIAGNÓSTICO ======================

export const DiagnosticoFlpResponseSchema = Type.Object({
  stage: Type.Object({
    funcionarios: Type.Integer(),
    eventos: Type.Integer(),
    fichas: Type.Integer(),
    fichasPendentes: Type.Integer(),
  }),
  canonical: Type.Object({
    funcionarios: Type.Integer(),
    eventos: Type.Integer(),
    fichas: Type.Integer(),
  }),
  competenciasDisponiveis: Type.Array(CompetenciaDisponivelSchema),
  ultimoJob: Type.Union([
    Type.Object({
      id: Type.String({ format: 'uuid' }),
      status: Type.String(),
      iniciadoEm: Type.String({ format: 'date-time' }),
      terminadoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
      registrosLidos: Type.Integer(),
      registrosGravados: Type.Integer(),
      registrosComErro: Type.Integer(),
      erroMensagem: Type.Union([Type.String(), Type.Null()]),
      parametros: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
    }),
    Type.Null(),
  ]),
});
export type DiagnosticoFlpResponse = Static<typeof DiagnosticoFlpResponseSchema>;
