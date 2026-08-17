import { Type, type Static } from '@sinclair/typebox';

export const WORKFLOW_STATUS = ['em_andamento', 'concluido', 'cancelado', 'bloqueado'] as const;
export type WorkflowStatus = (typeof WORKFLOW_STATUS)[number];

export const WORKFLOW_ACAO = [
  'criou',
  'avancou',
  'voltou',
  'comentou',
  'anexou',
  'aprovou',
  'rejeitou',
  'cancelou',
  'retomou',
  'atribuiu',
] as const;
export type WorkflowAcao = (typeof WORKFLOW_ACAO)[number];

const StatusUnion = Type.Union(WORKFLOW_STATUS.map((s) => Type.Literal(s)));
const AcaoUnion = Type.Union(WORKFLOW_ACAO.map((a) => Type.Literal(a)));

export const EtapaTemplateSchema = Type.Object({
  ordem: Type.Integer({ minimum: 1 }),
  chave: Type.String({ minLength: 1, maxLength: 40 }),
  nome: Type.String({ minLength: 1, maxLength: 100 }),
  descricao: Type.Optional(Type.String({ maxLength: 500 })),
  papelResponsavel: Type.Optional(Type.String({ maxLength: 40 })),
  exigeAnexo: Type.Optional(Type.Boolean()),
  exigeComentario: Type.Optional(Type.Boolean()),
  icone: Type.Optional(Type.String({ maxLength: 40 })),
  cor: Type.Optional(Type.String({ maxLength: 30 })),
});
export type EtapaTemplate = Static<typeof EtapaTemplateSchema>;

export const WorkflowTemplateResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  nome: Type.String(),
  documentoTipo: Type.String(),
  descricao: Type.Union([Type.String(), Type.Null()]),
  ativo: Type.Boolean(),
  etapas: Type.Array(EtapaTemplateSchema),
  criadoEm: Type.String({ format: 'date-time' }),
  atualizadoEm: Type.String({ format: 'date-time' }),
});
export type WorkflowTemplateResponse = Static<typeof WorkflowTemplateResponseSchema>;

export const WorkflowTemplateCreateSchema = Type.Object({
  nome: Type.String({ minLength: 1, maxLength: 100 }),
  documentoTipo: Type.String({ minLength: 1, maxLength: 40 }),
  descricao: Type.Optional(Type.String({ maxLength: 500 })),
  ativo: Type.Optional(Type.Boolean()),
  etapas: Type.Array(EtapaTemplateSchema, { minItems: 1 }),
});
export type WorkflowTemplateCreate = Static<typeof WorkflowTemplateCreateSchema>;

export const WorkflowTemplateUpdateSchema = Type.Partial(WorkflowTemplateCreateSchema);
export type WorkflowTemplateUpdate = Static<typeof WorkflowTemplateUpdateSchema>;

export const WorkflowEventoResponseSchema = Type.Object({
  id: Type.String(),
  etapaChave: Type.String(),
  etapaIdx: Type.Integer(),
  acao: AcaoUnion,
  usuario: Type.Union([
    Type.Object({
      id: Type.String({ format: 'uuid' }),
      nome: Type.String(),
      email: Type.String(),
    }),
    Type.Null(),
  ]),
  comentario: Type.Union([Type.String(), Type.Null()]),
  anexoUrl: Type.Union([Type.String(), Type.Null()]),
  anexoNome: Type.Union([Type.String(), Type.Null()]),
  paraEtapa: Type.Union([Type.String(), Type.Null()]),
  paraUsuarioId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  meta: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
  criadoEm: Type.String({ format: 'date-time' }),
});
export type WorkflowEventoResponse = Static<typeof WorkflowEventoResponseSchema>;

export const WorkflowInstanceResponseSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  templateId: Type.String({ format: 'uuid' }),
  documentoTipo: Type.String(),
  documentoId: Type.String(),
  etapaAtual: Type.String(),
  etapaAtualIdx: Type.Integer(),
  status: StatusUnion,
  criadoPor: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  responsavelId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  criadoEm: Type.String({ format: 'date-time' }),
  concluidoEm: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  atualizadoEm: Type.String({ format: 'date-time' }),
});
export type WorkflowInstanceResponse = Static<typeof WorkflowInstanceResponseSchema>;

export const WorkflowTimelineResponseSchema = Type.Object({
  instance: WorkflowInstanceResponseSchema,
  template: WorkflowTemplateResponseSchema,
  eventos: Type.Array(WorkflowEventoResponseSchema),
});
export type WorkflowTimelineResponse = Static<typeof WorkflowTimelineResponseSchema>;

export const WorkflowCreateInstanceSchema = Type.Object({
  templateId: Type.String({ format: 'uuid' }),
  documentoTipo: Type.String({ minLength: 1, maxLength: 40 }),
  documentoId: Type.String({ minLength: 1, maxLength: 80 }),
  responsavelId: Type.Optional(Type.String({ format: 'uuid' })),
  comentario: Type.Optional(Type.String({ maxLength: 2000 })),
});
export type WorkflowCreateInstance = Static<typeof WorkflowCreateInstanceSchema>;

export const WorkflowAvancarSchema = Type.Object({
  comentario: Type.Optional(Type.String({ maxLength: 2000 })),
  anexoUrl: Type.Optional(Type.String({ maxLength: 500 })),
  anexoNome: Type.Optional(Type.String({ maxLength: 200 })),
  proximoResponsavelId: Type.Optional(Type.String({ format: 'uuid' })),
});
export type WorkflowAvancar = Static<typeof WorkflowAvancarSchema>;

export const WorkflowVoltarSchema = Type.Object({
  comentario: Type.String({ minLength: 1, maxLength: 2000 }),
  paraEtapa: Type.Optional(Type.String({ maxLength: 40 })),
});
export type WorkflowVoltar = Static<typeof WorkflowVoltarSchema>;

export const WorkflowComentarSchema = Type.Object({
  comentario: Type.String({ minLength: 1, maxLength: 2000 }),
  anexoUrl: Type.Optional(Type.String({ maxLength: 500 })),
  anexoNome: Type.Optional(Type.String({ maxLength: 200 })),
});
export type WorkflowComentar = Static<typeof WorkflowComentarSchema>;

export const WorkflowAtribuirSchema = Type.Object({
  responsavelId: Type.String({ format: 'uuid' }),
  comentario: Type.Optional(Type.String({ maxLength: 2000 })),
});
export type WorkflowAtribuir = Static<typeof WorkflowAtribuirSchema>;

export const WorkflowCancelarSchema = Type.Object({
  comentario: Type.String({ minLength: 1, maxLength: 2000 }),
});
export type WorkflowCancelar = Static<typeof WorkflowCancelarSchema>;

// ============================================================================
// INFERENCIA AUTOMATICA (sem WorkflowInstance manual)
// ============================================================================

/**
 * Estado de uma etapa na timeline inferida.
 *  - `passada`  : etapa ja foi concluida com base nos dados do documento
 *  - `atual`    : etapa em que o documento se encontra agora
 *  - `futura`   : etapa ainda nao alcancada
 *  - `pulada`   : etapa do template que o fluxo real do Globus saltou
 *                 (ex: nao temos "conferencia interna" mas o Globus ja liberou
 *                 pagamento — pulamos as 3 etapas intermediarias)
 */
export const WORKFLOW_INFERENCIA_ESTADOS = ['passada', 'atual', 'futura', 'pulada'] as const;
export type WorkflowInferenciaEstado = (typeof WORKFLOW_INFERENCIA_ESTADOS)[number];

const EstadoUnion = Type.Union(WORKFLOW_INFERENCIA_ESTADOS.map((s) => Type.Literal(s)));

export const EtapaInferidaSchema = Type.Object({
  ordem: Type.Integer(),
  chave: Type.String(),
  nome: Type.String(),
  descricao: Type.Union([Type.String(), Type.Null()]),
  papelResponsavel: Type.Union([Type.String(), Type.Null()]),
  icone: Type.Union([Type.String(), Type.Null()]),
  cor: Type.Union([Type.String(), Type.Null()]),
  estado: EstadoUnion,
  /**
   * Rastro real do Globus quando existe (login do usuario + timestamp).
   * `null` quando a etapa nao tem rastreio no Globus (etapa inferida sem
   * auditoria). UI deve sinalizar "(inferido sem rastro)" nesses casos.
   *
   * `usuariosSecundarios`: logins adicionais associados a mesma etapa
   * (ex: ASSINATURA_1 / ASSINATURA_2 do CPGDOCTO sao assinaturas fisicas
   * que aparecem junto da assinatura eletronica).
   */
  auditoria: Type.Union([
    Type.Object({
      usuario: Type.Union([Type.String(), Type.Null()]),
      data: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
      usuariosSecundarios: Type.Optional(Type.Array(Type.String())),
      /**
       * Nota explicativa quando NAO ha usuario rastreavel mas ainda assim ha
       * algo a dizer com honestidade (ex: a baixa de pagamento tem data no
       * Globus mas nenhum usuario executor — campo inexistente no CPGDOCTO).
       * Evita exibir um nome "responsavel generico" como se fosse quem agiu.
       */
      nota: Type.Optional(Type.String()),
      /**
       * Verbo que precede o login na UI. Existe porque "por FULANO" e ambiguo
       * em etapas onde o registro do Globus e o OPERADOR DO ERP, nao o autor do
       * ato no mundo real. Ex: na baixa, o USUARIO do
       * CPGDOCTO_HISTORICO_NEGOCIACOES e quem lancou a baixa no sistema — NAO
       * quem autorizou o pagamento no banco. Default da UI: "por".
       */
      acaoRotulo: Type.Optional(Type.String()),
      /**
       * Ressalva exibida junto do rastro, mesmo QUANDO ha usuario. Serve para
       * declarar explicitamente o que o Globus nao registra (estado "sem dado"),
       * evitando que o leitor complete a lacuna sozinho.
       */
      ressalva: Type.Optional(Type.String()),
    }),
    Type.Null(),
  ]),
});
export type EtapaInferida = Static<typeof EtapaInferidaSchema>;

export const WorkflowInferenciaResponseSchema = Type.Object({
  documentoTipo: Type.String(),
  documentoId: Type.String(),
  template: Type.Object({
    id: Type.String({ format: 'uuid' }),
    nome: Type.String(),
  }),
  status: StatusUnion,
  etapaAtual: Type.Union([
    Type.Object({
      chave: Type.String(),
      nome: Type.String(),
      ordem: Type.Integer(),
    }),
    Type.Null(),
  ]),
  proximaEtapa: Type.Union([
    Type.Object({
      chave: Type.String(),
      nome: Type.String(),
      ordem: Type.Integer(),
    }),
    Type.Null(),
  ]),
  etapas: Type.Array(EtapaInferidaSchema),
  /**
   * Sinais detectados no documento que justificam a etapa inferida.
   * Ex.: { quitado: true, data_pagamento: '2026-05-10', pagamento_liberado: true }
   * Util para auditoria: "por que o sistema disse que esta etapa?"
   */
  sinais: Type.Record(Type.String(), Type.Unknown()),
});
export type WorkflowInferenciaResponse = Static<typeof WorkflowInferenciaResponseSchema>;

export const WorkflowInferirQuerySchema = Type.Object({
  documentoTipo: Type.String({ minLength: 1, maxLength: 40 }),
  documentoId: Type.String({ minLength: 1, maxLength: 80 }),
});
export type WorkflowInferirQuery = Static<typeof WorkflowInferirQuerySchema>;
