import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  ReceitaTdmaxSyncQuerySchema,
  ReceitaTdmaxSyncResponseSchema,
  ReconciliacaoTdmaxQuerySchema,
  ReconciliacaoTdmaxResponseSchema,
} from '@pioneira/shared';
import { buildReceitaTdmaxService } from './receita-tdmax.service.js';

export const receitaTdmaxModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildReceitaTdmaxService(fastify);
  const auth = fastify.requireRole('admin', 'cfo', 'controller');

  fastify.post(
    '/sincronizar',
    {
      // TEMPORÁRIO (fase de desenvolvimento/validação): liberado pra qualquer usuário logado.
      // Reverter para fastify.requireAdmin antes de produção.
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['receita-tdmax'],
        summary: 'Sincroniza a receita/bilhetagem TD Max (API horarios) por período',
        body: ReceitaTdmaxSyncQuerySchema,
        response: { 200: ReceitaTdmaxSyncResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 6, timeWindow: '5 minutes' } },
    },
    async (req) => service.sincronizar(req.body, req.user.sub),
  );

  fastify.get(
    '/reconciliacao',
    {
      preHandler: [auth],
      schema: {
        tags: ['receita-tdmax'],
        summary: 'Reconciliação: receita gerada (TD Max) x repasse GDF no banco, dia a dia',
        querystring: ReconciliacaoTdmaxQuerySchema,
        response: { 200: ReconciliacaoTdmaxResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.reconciliacao(req.query),
  );
};
