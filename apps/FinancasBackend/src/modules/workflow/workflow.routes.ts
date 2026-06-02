import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  WorkflowAtribuirSchema,
  WorkflowAvancarSchema,
  WorkflowCancelarSchema,
  WorkflowComentarSchema,
  WorkflowCreateInstanceSchema,
  WorkflowEventoResponseSchema,
  WorkflowInferenciaResponseSchema,
  WorkflowInferirQuerySchema,
  WorkflowInstanceResponseSchema,
  WorkflowTemplateCreateSchema,
  WorkflowTemplateResponseSchema,
  WorkflowTemplateUpdateSchema,
  WorkflowTimelineResponseSchema,
  WorkflowVoltarSchema,
} from '@pioneira/shared';
import { buildWorkflowService } from './workflow.service.js';
import { buildWorkflowInferenciaService } from './workflow-inferencia.service.js';

export const workflowModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildWorkflowService(fastify);
  const inferencia = buildWorkflowInferenciaService(fastify);

  // -------------------------------- INFERENCIA --------------------------------
  // Workflow derivado do estado do documento (sem WorkflowInstance manual).
  // Endpoint preferido para UI ver "onde o documento esta" sem precisar avancar
  // etapa clicando em botao.
  fastify.get(
    '/inferir',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['workflow'],
        summary: 'Inferir etapa atual do workflow a partir do estado do documento',
        description:
          'Sistema deduz em que etapa o documento esta usando os campos vindos do Globus ' +
          '(quitado, dataPagamento, pagamentoLiberado, status etc.). Retorna timeline completa ' +
          'com cada etapa marcada como passada | atual | pulada | futura. Suporta: conta_pagar, conta_receber.',
        querystring: WorkflowInferirQuerySchema,
        response: { 200: WorkflowInferenciaResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => inferencia.inferir(req.query),
  );

  // -------------------------------- TEMPLATES --------------------------------
  fastify.get(
    '/templates',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['workflow'],
        summary: 'Lista templates de workflow',
        querystring: Type.Object({
          documentoTipo: Type.Optional(Type.String()),
          ativo: Type.Optional(Type.Boolean()),
        }),
        response: { 200: Type.Array(WorkflowTemplateResponseSchema) },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listarTemplates(req.query),
  );

  fastify.get(
    '/templates/:id',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['workflow'],
        summary: 'Detalhes de um template',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: WorkflowTemplateResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.obterTemplate(req.params.id),
  );

  fastify.post(
    '/templates',
    {
      preHandler: [fastify.requireRole('admin', 'cfo')],
      schema: {
        tags: ['workflow'],
        summary: 'Cria template',
        body: WorkflowTemplateCreateSchema,
        response: { 201: WorkflowTemplateResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const t = await service.criarTemplate(req.body);
      return reply.code(201).send(t);
    },
  );

  fastify.patch(
    '/templates/:id',
    {
      preHandler: [fastify.requireRole('admin', 'cfo')],
      schema: {
        tags: ['workflow'],
        summary: 'Atualiza template',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: WorkflowTemplateUpdateSchema,
        response: { 200: WorkflowTemplateResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.atualizarTemplate(req.params.id, req.body),
  );

  // -------------------------------- INSTANCES --------------------------------
  fastify.post(
    '/instances',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['workflow'],
        summary: 'Cria workflow para um documento',
        body: WorkflowCreateInstanceSchema,
        response: { 201: WorkflowInstanceResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const instance = await service.criarInstance(req.body, {
        usuarioId: req.user.sub,
        role: req.user.role,
      });
      return reply.code(201).send(instance);
    },
  );

  fastify.get(
    '/instances/:id/timeline',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['workflow'],
        summary: 'Timeline (instance + template + eventos)',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: WorkflowTimelineResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.obterTimeline(req.params.id),
  );

  fastify.get(
    '/by-documento/:tipo/:id',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['workflow'],
        summary: 'Busca workflow pelo documento (404 se nao existir)',
        params: Type.Object({
          tipo: Type.String(),
          id: Type.String(),
        }),
        response: {
          200: WorkflowTimelineResponseSchema,
          404: Type.Object({ statusCode: Type.Integer(), error: Type.String(), message: Type.String() }),
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const timeline = await service.obterPorDocumento(req.params.tipo, req.params.id);
      if (!timeline) return reply.notFound('Workflow nao encontrado para este documento');
      return timeline;
    },
  );

  fastify.post(
    '/instances/:id/avancar',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['workflow'],
        summary: 'Avanca para a proxima etapa',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: WorkflowAvancarSchema,
        response: { 200: WorkflowInstanceResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) =>
      service.avancarEtapa(req.params.id, req.body, { usuarioId: req.user.sub, role: req.user.role }),
  );

  fastify.post(
    '/instances/:id/voltar',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['workflow'],
        summary: 'Volta uma etapa (ou para etapa especifica anterior)',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: WorkflowVoltarSchema,
        response: { 200: WorkflowInstanceResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) =>
      service.voltarEtapa(req.params.id, req.body, { usuarioId: req.user.sub, role: req.user.role }),
  );

  fastify.post(
    '/instances/:id/comentar',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['workflow'],
        summary: 'Adiciona comentario/anexo na etapa atual',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: WorkflowComentarSchema,
        response: { 201: WorkflowEventoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const evento = await service.comentar(req.params.id, req.body, {
        usuarioId: req.user.sub,
        role: req.user.role,
      });
      return reply.code(201).send(evento);
    },
  );

  fastify.post(
    '/instances/:id/atribuir',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['workflow'],
        summary: 'Atribui o workflow a outro usuario',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: WorkflowAtribuirSchema,
        response: { 200: WorkflowInstanceResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) =>
      service.atribuir(req.params.id, req.body, { usuarioId: req.user.sub, role: req.user.role }),
  );

  fastify.post(
    '/instances/:id/cancelar',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller')],
      schema: {
        tags: ['workflow'],
        summary: 'Cancela o workflow',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: WorkflowCancelarSchema,
        response: { 200: WorkflowInstanceResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) =>
      service.cancelar(req.params.id, req.body, { usuarioId: req.user.sub, role: req.user.role }),
  );

  fastify.post(
    '/instances/:id/retomar',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller')],
      schema: {
        tags: ['workflow'],
        summary: 'Retoma workflow cancelado/bloqueado',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: WorkflowInstanceResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) =>
      service.retomar(req.params.id, { usuarioId: req.user.sub, role: req.user.role }),
  );
};
