import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { coletarStatus } from '@/shared/status/status-checker.js';

const DependenciaSchema = Type.Object({
  nome: Type.String(),
  ok: Type.Boolean(),
  mensagem: Type.Optional(Type.String()),
  detalhe: Type.Optional(Type.String()),
});

const StatusSchema = Type.Object({
  status: Type.Union([Type.Literal('ok'), Type.Literal('degraded'), Type.Literal('down')]),
  versao: Type.String(),
  uptimeSegundos: Type.Integer(),
  ambiente: Type.String(),
  timestamp: Type.String({ format: 'date-time' }),
  dependencias: Type.Array(DependenciaSchema),
});

export const healthModule: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/',
    {
      schema: {
        tags: ['health'],
        summary: 'Health check completo (JSON)',
        response: { 200: StatusSchema, 503: StatusSchema },
      },
    },
    async (_req, reply) => {
      const report = await coletarStatus(fastify);
      const code = report.status === 'down' ? 503 : 200;
      return reply.code(code).send(report);
    },
  );
};
