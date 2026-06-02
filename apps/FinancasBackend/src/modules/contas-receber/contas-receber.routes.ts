import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  ContaReceberListQuerySchema,
  ContaReceberListResponseSchema,
  SumarioContasReceberQuerySchema,
  SumarioContasReceberResponseSchema,
  SyncContasReceberBodySchema,
  SyncContasReceberResponseSchema,
  SyncInfoCrSchema,
} from '@pioneira/shared/schemas/contas-receber';
import { buildContasReceberService } from './contas-receber.service.js';

export const contasReceberModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildContasReceberService(fastify);

  fastify.get(
    '/',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cr_analista')],
      schema: {
        tags: ['contas-receber'],
        summary: 'Lista contas a receber do banco local',
        querystring: ContaReceberListQuerySchema,
        response: { 200: ContaReceberListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listar(req.query),
  );

  fastify.get(
    '/sumario',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cr_analista')],
      schema: {
        tags: ['contas-receber'],
        summary: 'Sumário consolidado: totais, por status, aging, top clientes',
        querystring: SumarioContasReceberQuerySchema,
        response: { 200: SumarioContasReceberResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.sumario(req.query),
  );

  fastify.get(
    '/sync-status',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cr_analista')],
      schema: {
        tags: ['contas-receber'],
        summary: 'Status da última sincronização com o Globus',
        response: { 200: SyncInfoCrSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.statusSync(),
  );

  fastify.post(
    '/sync',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller')],
      schema: {
        tags: ['contas-receber'],
        summary: 'Sincroniza contas a receber do Globus (Oracle) → Postgres local',
        body: SyncContasReceberBodySchema,
        response: { 200: SyncContasReceberResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    },
    async (req) => service.sincronizar(req.body, req.user.sub),
  );
};
