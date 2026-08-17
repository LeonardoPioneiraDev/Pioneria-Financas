import { Type, type Static } from '@sinclair/typebox';

/**
 * Recebíveis — dinheiro que ENTROU no caixa, lido do extrato bancário
 * (`finance.banco_movto`, créditos), classificado por ORIGEM.
 *
 * Diferente de "Contas a Receber" (títulos a cobrar). Aqui é o que de fato caiu
 * no banco. Classificação em tempo de consulta (heurística, sem coluna nova):
 *   - `gdf`            → repasse BRB Mobilidade (flag `eh_repasse_brb`, validada);
 *   - `clientes`       → crédito conciliado a um título de Contas a Receber;
 *   - `transferencias` → movimentação da PRÓPRIA empresa (transferência entre
 *                        contas de mesma titularidade, resgate de aplicação,
 *                        estorno) — NÃO é receita nova, fica FORA do total;
 *   - `outras`         → o restante de entradas reais ainda não identificadas,
 *                        agrupado pela descrição do histórico bancário.
 *
 * Princípio "não inventa": créditos sem sentido D/C definido no Globus
 * (`debito_credito` nulo) NÃO entram no total — são sinalizados à parte.
 */

export const RecebivelOrigemUnion = Type.Union([
  Type.Literal('gdf'),
  Type.Literal('clientes'),
  Type.Literal('outras'),
  Type.Literal('transferencias'),
]);
export type RecebivelOrigem = Static<typeof RecebivelOrigemUnion>;

// ====================== SUMÁRIO ======================

export const SumarioRecebiveisQuerySchema = Type.Object({
  dtIni: Type.String({ format: 'date' }),
  dtFim: Type.String({ format: 'date' }),
  contaId: Type.Optional(Type.String({ format: 'uuid' })),
});
export type SumarioRecebiveisQuery = Static<typeof SumarioRecebiveisQuerySchema>;

export const RecebivelPorOrigemSchema = Type.Object({
  origem: RecebivelOrigemUnion,
  qtd: Type.Integer(),
  valorCents: Type.Integer(),
});
export type RecebivelPorOrigem = Static<typeof RecebivelPorOrigemSchema>;

/** Linha de detalhe: um tipo de lançamento (histórico bancário) dentro de uma origem. */
export const RecebivelFonteSchema = Type.Object({
  /** Descrição do histórico bancário (ex.: "TED RECEBIDO", "RESGATE DE APLICACAO"). */
  descricao: Type.Union([Type.String(), Type.Null()]),
  qtd: Type.Integer(),
  valorCents: Type.Integer(),
});
export type RecebivelFonte = Static<typeof RecebivelFonteSchema>;

export const SumarioRecebiveisResponseSchema = Type.Object({
  /** Total que entrou no caixa no período = receita real (gdf + clientes + outras). */
  totalRecebidoCents: Type.Integer(),
  qtd: Type.Integer(),
  porOrigem: Type.Array(RecebivelPorOrigemSchema),
  /** Créditos sem sentido D/C definido no Globus — não entram no total (transparência). */
  semSentidoQtd: Type.Integer(),
  semSentidoCents: Type.Integer(),
  /**
   * Frescor do extrato (para a conta filtrada), independente do período consultado.
   * Existe pra tela NUNCA mostrar um total parcial como se fosse o total: se o
   * período pedido vai além de `extratoAteData`, o número está incompleto.
   */
  /** Data do lançamento mais recente já sincronizado — "temos extrato até". Null se vazio. */
  extratoAteData: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  /** Quando o extrato foi sincronizado do Globus pela última vez. Null se vazio. */
  ultimoSyncEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
});
export type SumarioRecebiveisResponse = Static<typeof SumarioRecebiveisResponseSchema>;

// ====================== DETALHE DE UMA ORIGEM (modal) ======================

export const DetalheOrigemQuerySchema = Type.Object({
  dtIni: Type.String({ format: 'date' }),
  dtFim: Type.String({ format: 'date' }),
  origem: RecebivelOrigemUnion,
  contaId: Type.Optional(Type.String({ format: 'uuid' })),
});
export type DetalheOrigemQuery = Static<typeof DetalheOrigemQuerySchema>;

export const DetalheOrigemResponseSchema = Type.Object({
  origem: RecebivelOrigemUnion,
  totalCents: Type.Integer(),
  qtd: Type.Integer(),
  /** Tipos de lançamento (histórico bancário), do maior valor pro menor. */
  fontes: Type.Array(RecebivelFonteSchema),
});
export type DetalheOrigemResponse = Static<typeof DetalheOrigemResponseSchema>;

// ====================== LISTAGEM ======================

export const RecebiveisListQuerySchema = Type.Object({
  dtIni: Type.String({ format: 'date' }),
  dtFim: Type.String({ format: 'date' }),
  origem: Type.Optional(RecebivelOrigemUnion),
  contaId: Type.Optional(Type.String({ format: 'uuid' })),
  busca: Type.Optional(Type.String({ maxLength: 100 })),
  pagina: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  porPagina: Type.Optional(Type.Integer({ minimum: 10, maximum: 200, default: 50 })),
});
export type RecebiveisListQuery = Static<typeof RecebiveisListQuerySchema>;

export const RecebivelItemSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  dataMovto: Type.String({ format: 'date' }),
  valorCents: Type.Integer(),
  origem: RecebivelOrigemUnion,
  descHistoBco: Type.Union([Type.String(), Type.Null()]),
  histMovtoBco: Type.Union([Type.String(), Type.Null()]),
  docMovtoBco: Type.Union([Type.String(), Type.Null()]),
  codBanco: Type.Integer(),
  codAgencia: Type.Integer(),
  codContaBco: Type.String(),
  /** Nome amigável/cadastro da conta; null quando a conta não está no cadastro. */
  contaNome: Type.Union([Type.String(), Type.Null()]),
  /** Crédito já conciliado (casado com um título/cobrança) no Globus. */
  conciliado: Type.Boolean(),
});
export type RecebivelItem = Static<typeof RecebivelItemSchema>;

export const RecebiveisListResponseSchema = Type.Object({
  itens: Type.Array(RecebivelItemSchema),
  total: Type.Integer(),
  pagina: Type.Integer(),
  porPagina: Type.Integer(),
  totalPaginas: Type.Integer(),
});
export type RecebiveisListResponse = Static<typeof RecebiveisListResponseSchema>;

// ====================== DETALHE DE UM LANÇAMENTO (modal da linha) ======================

/** Linha da composição do repasse por tipo de receita (só GDF): tarifa × complemento de gratuidade. */
export const RecebivelComposicaoItemSchema = Type.Object({
  codTpReceita: Type.Union([Type.String(), Type.Null()]),
  /** Rótulo legível do tipo (ex.: "Complemento gratuidade — Estudante (PLE)"). */
  descricao: Type.Union([Type.String(), Type.Null()]),
  valorCents: Type.Integer(),
});
export type RecebivelComposicaoItem = Static<typeof RecebivelComposicaoItemSchema>;

/**
 * Um dia de TRANSPORTE que este repasse remunera. Vem do cruzamento da matriz
 * BRB (`recebivel_gdf_celula`) pela data de resgate (= data de crédito do
 * repasse no banco). Responde "a que dias de rodagem este dinheiro se refere".
 */
export const RecebivelDistribuicaoDiaSchema = Type.Object({
  /** Dia em que os passageiros rodaram (YYYY-MM-DD) — ou 'anteriores' pro rabo. */
  dataTransporte: Type.String(),
  /** Defasagem resgate − transporte, em dias. Null quando 'anteriores'. */
  diasDefasagem: Type.Union([Type.Integer(), Type.Null()]),
  /** Créditos (passagens) daquele dia resgatados neste repasse. */
  creditos: Type.Integer(),
  /** Valor da matriz BRB (bilhetagem) daquele dia — referência de PESO, não bate ao centavo com o repasse técnico. */
  valorCents: Type.Integer(),
  /** Participação do dia no total resgatado nesta data (%). */
  percDoResgate: Type.Number(),
});
export type RecebivelDistribuicaoDia = Static<typeof RecebivelDistribuicaoDiaSchema>;

export const RecebivelDetalheResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  dataMovto: Type.String({ format: 'date' }),
  dataEfetiva: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  dataCredito: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  valorCents: Type.Integer(),
  origem: RecebivelOrigemUnion,
  descHistoBco: Type.Union([Type.String(), Type.Null()]),
  /** Histórico completo (não truncado) do extrato. */
  histMovtoBco: Type.Union([Type.String(), Type.Null()]),
  docMovtoBco: Type.Union([Type.String(), Type.Null()]),
  codHistoBco: Type.Union([Type.Integer(), Type.Null()]),
  debitoCredito: Type.Union([Type.String(), Type.Null()]),
  codBanco: Type.Integer(),
  codAgencia: Type.Integer(),
  codContaBco: Type.String(),
  contaNome: Type.Union([Type.String(), Type.Null()]),
  conciliado: Type.Boolean(),
  /** Lançamento confirmado pelo banco (não pendente/provisório) — `BCOMOVTO.CONFIRMADO`. */
  confirmado: Type.Boolean(),
  /** Status do movimento no Globus (`BCOMOVTO.STATUS_MOVTO`), quando houver. */
  statusMovto: Type.Union([Type.String(), Type.Null()]),
  codTpReceita: Type.Union([Type.String(), Type.Null()]),
  /** COD_MOVTO_BCO do Globus (rastreabilidade até a fonte). */
  origemIdExterno: Type.String(),
  /** Quando o lançamento foi sincronizado do Globus pela última vez. */
  ultimoSyncEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  /** Quando a origem é "clientes": cliente cujo título casou na conciliação. */
  cliente: Type.Union([
    Type.Object({
      razaoSocial: Type.String(),
      numeroInscricao: Type.Union([Type.String(), Type.Null()]),
    }),
    Type.Null(),
  ]),
  tituloNumeroDocumento: Type.Union([Type.String(), Type.Null()]),
  /**
   * Número do título AD deste repasse (ex.: "AD-0004581"), extraído do histórico do
   * extrato. Presente em repasses do GDF/BRB mesmo quando a `composicao` está vazia —
   * serve pra explicar DE ONDE viria a quebra e o que falta pra vê-la (sincronizar o
   * Contas a Receber). Null quando não é repasse ou não há AD no histórico.
   */
  repasseAd: Type.Union([Type.String(), Type.Null()]),
  /**
   * Quebra do repasse por tipo de receita (só GDF): tarifa do usuário ×
   * complemento de gratuidade. Vem do título AD casado no Contas a Receber
   * (snapshot local). Vazio quando não é repasse ou o título não está local
   * (aí `repasseAd` explica o que falta sincronizar).
   */
  composicao: Type.Array(RecebivelComposicaoItemSchema),
  /**
   * Data de RESGATE usada pra cruzar com a matriz BRB (= data de crédito do
   * repasse, senão a data do movimento). Null quando não é repasse GDF.
   */
  resgateEm: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  /**
   * A que dias de TRANSPORTE este repasse se refere: a apuração diária do GDF
   * (AD) remunera o que foi resgatado num dia, que por sua vez é rodagem de
   * dias anteriores (tipicamente T+1). Cruza `recebivel_gdf_celula` pela data de
   * resgate. Vazio quando não é repasse ou a matriz não cobre esse dia (não inventa).
   */
  distribuicaoTransporte: Type.Array(RecebivelDistribuicaoDiaSchema),
});
export type RecebivelDetalheResponse = Static<typeof RecebivelDetalheResponseSchema>;

// ====================== CONTAS (filtro) ======================

export const RecebiveisContaSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  codBanco: Type.Integer(),
  codAgencia: Type.Integer(),
  codContaBco: Type.String(),
  nome: Type.String(),
  ehPrincipal: Type.Boolean(),
});
export type RecebiveisConta = Static<typeof RecebiveisContaSchema>;

export const RecebiveisContasResponseSchema = Type.Object({
  itens: Type.Array(RecebiveisContaSchema),
});
export type RecebiveisContasResponse = Static<typeof RecebiveisContasResponseSchema>;

// ====================== SYNC EXTRATO ======================

export const SyncExtratoBodySchema = Type.Object({
  dtIni: Type.Optional(Type.String({ format: 'date' })),
  dtFim: Type.Optional(Type.String({ format: 'date' })),
});
export type SyncExtratoBody = Static<typeof SyncExtratoBodySchema>;

export const SyncExtratoResponseSchema = Type.Object({
  status: Type.Union([Type.Literal('ok'), Type.Literal('parcial'), Type.Literal('erro')]),
  registrosLidos: Type.Integer(),
  gravados: Type.Integer(),
  repassesBrb: Type.Integer(),
  duracaoMs: Type.Integer(),
  mensagem: Type.Optional(Type.String()),
});
export type SyncExtratoResponse = Static<typeof SyncExtratoResponseSchema>;
