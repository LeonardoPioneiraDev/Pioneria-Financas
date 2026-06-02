import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  ContaPagarListQuerySchema,
  ContaPagarListResponseSchema,
  SumarioContasPagarRequestSchema,
  SumarioContasPagarResponseSchema,
  SyncContasPagarRequestSchema,
  SyncResponseSchema,
  SyncInfoSchema,
  SetorCpListResponseSchema,
} from '@pioneira/shared/schemas/contas-pagar';
import { buildContasPagarService } from './contas-pagar.service.js';

export const contasPagarModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildContasPagarService(fastify);

  fastify.get(
    '/',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Lista contas a pagar do banco local (Postgres)',
        description: 'Le sempre do PostgreSQL local. Para popular, use POST /sync.',
        querystring: ContaPagarListQuerySchema,
        response: { 200: ContaPagarListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listar(req.query),
  );

  fastify.get(
    '/sumario',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Sumario consolidado (totais, por status, vencidos, top fornecedores)',
        querystring: SumarioContasPagarRequestSchema,
        response: { 200: SumarioContasPagarResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.sumario(req.query),
  );

  fastify.get(
    '/setores',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Lista setores distintos presentes em contas_pagar (pra popular filtro)',
        response: { 200: SetorCpListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarSetores(),
  );

  fastify.get(
    '/sync-status',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Status da ultima sincronizacao com o Globus',
        response: { 200: SyncInfoSchema },
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
        tags: ['contas-pagar'],
        summary: 'Sincroniza contas a pagar do Globus (Oracle) para o Postgres local',
        description:
          'Roda em duas etapas: adapter (Oracle -> stage) + ETL (stage -> finance.contas_pagar).' +
          ' Se dtIni/dtFim ausentes, sincroniza o mes corrente. Idempotente.',
        body: Type.Optional(SyncContasPagarRequestSchema),
        response: { 200: SyncResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    },
    async (req) => {
      const body = req.body ?? {};
      return service.sincronizar(body, req.user.sub);
    },
  );
};
