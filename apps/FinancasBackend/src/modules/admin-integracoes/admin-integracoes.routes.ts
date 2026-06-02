import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { buildAdminIntegracoesService } from './admin-integracoes.service.js';

/**
 * Endpoints admin de inspecao e operacao da integracao Globus.
 *
 * Todos exigem role admin ou controller. Servem a UI `(private)/admin/integracoes`
 * do frontend.
 */
export const adminIntegracoesModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildAdminIntegracoesService(fastify);

  const auth = fastify.requireRole('admin', 'controller');

  // ============ DASHBOARD ============
  fastify.get(
    '/dashboard',
    {
      preHandler: [auth],
      schema: {
        tags: ['admin-integracoes'],
        summary: 'Dashboard de integracao: ultimos jobs + DLQ + telemetria Oracle',
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.dashboard(),
  );

  // ============ DLQ (sync_errors) ============
  const ErrosQuery = Type.Object({
    sistema: Type.Optional(Type.String({ maxLength: 40 })),
    recurso: Type.Optional(Type.String({ maxLength: 60 })),
    resolvidos: Type.Optional(Type.Boolean({ description: 'Default false: traz so pendentes' })),
    pagina: Type.Integer({ minimum: 1, default: 1 }),
    porPagina: Type.Integer({ minimum: 1, maximum: 200, default: 50 }),
  });

  fastify.get(
    '/erros',
    {
      preHandler: [auth],
      schema: {
        tags: ['admin-integracoes'],
        summary: 'Lista paginada da DLQ (sync_errors)',
        querystring: ErrosQuery,
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listarErros(req.query),
  );

  fastify.get(
    '/erros/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['admin-integracoes'],
        summary: 'Detalhe de um erro (com raw_payload e stack)',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.obterErro(req.params.id),
  );

  // ============ DRILL-DOWN ============
  const DrillDownQuery = Type.Object({
    recurso: Type.Union([Type.Literal('contas_pagar'), Type.Literal('contas_receber')]),
    origemIdExterno: Type.String({ minLength: 1, maxLength: 80 }),
  });

  fastify.get(
    '/drilldown',
    {
      preHandler: [auth],
      schema: {
        tags: ['admin-integracoes'],
        summary: 'Drill-down: stage (raw) + canonical (finance) + sync_jobs + erros DLQ relacionados',
        description:
          'Para contas_pagar: origemIdExterno = CODDOCTOCPG. ' +
          'Para contas_receber: origemIdExterno = "EMPRESA|CODDOCTOCRC".',
        querystring: DrillDownQuery,
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.drillDown(req.query),
  );

  fastify.post(
    '/erros/:id/resolver',
    {
      preHandler: [auth],
      schema: {
        tags: ['admin-integracoes'],
        summary: 'Marca um erro como resolvido manualmente. Idempotente.',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: {
          200: Type.Object({
            id: Type.String(),
            jaResolvido: Type.Boolean({ description: 'true se ja estava resolvido antes' }),
          }),
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.resolverManual(req.params.id, req.user.sub),
  );
};
