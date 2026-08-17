import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { MetricsDashboardQuerySchema, MetricsDashboardResponseSchema } from '@pioneira/shared';
import { UserPageView } from '@/entities/user-page-view.entity.js';
import { obterIpDoCliente } from '@/shared/utils/client-ip.js';
import { buildMetricsService } from './metrics.service.js';

const PageViewPayloadSchema = Type.Object({
  sessionId: Type.String({ minLength: 8, maxLength: 80 }),
  path: Type.String({ minLength: 1, maxLength: 500 }),
  pageTitle: Type.Optional(Type.String({ maxLength: 200 })),
  referrer: Type.Optional(Type.String({ maxLength: 500 })),
  timeOnPageMs: Type.Optional(Type.Integer({ minimum: 0, maximum: 86_400_000 })),
});

export const metricsModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const repo = fastify.db.getRepository(UserPageView);
  const service = buildMetricsService(fastify);

  // Dashboard de métricas de sistema — admin only.
  fastify.get(
    '/dashboard',
    {
      preHandler: [fastify.requireRole('admin')],
      schema: {
        tags: ['metrics'],
        summary: 'Dashboard consolidado de métricas de sistema (admin)',
        description:
          'Agrega request_logs + user_activity_logs por TimeRange (janelas em ' +
          'America/Sao_Paulo): summary, requests/latência ao longo do tempo, ' +
          'distribuição de status, top usuários, endpoints mais lentos e picos diários.',
        querystring: MetricsDashboardQuerySchema,
        response: { 200: MetricsDashboardResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    async (req) => service.dashboard(req.query.timeRange ?? 'last_24h'),
  );

  fastify.post(
    '/page-view',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['metrics'],
        summary: 'Registra uma visualização de página (fire-and-forget)',
        body: PageViewPayloadSchema,
        response: { 202: Type.Object({ accepted: Type.Boolean() }) },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const ip = obterIpDoCliente(req);
      const userAgent = req.headers['user-agent']?.slice(0, 500) ?? null;
      const payload = req.body;
      const usuarioId = req.user.sub;

      setImmediate(() => {
        repo
          .insert({
            usuarioId,
            sessionId: payload.sessionId,
            path: payload.path,
            pageTitle: payload.pageTitle ?? null,
            referrer: payload.referrer ?? null,
            timeOnPageMs: payload.timeOnPageMs ?? null,
            ipAddress: ip,
            userAgent,
          })
          .catch((err) => fastify.log.warn({ err }, 'Falha ao gravar page_view'));
      });

      return reply.code(202).send({ accepted: true });
    },
  );
};
