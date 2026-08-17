import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  AliquotasUsadasResponseSchema,
  ConferenciaDivergenciasResponseSchema,
  ConferenciaDoTituloResponseSchema,
} from '@pioneira/shared';
import { buildRetencoesService } from './retencoes.service.js';

export const retencoesModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildRetencoesService(fastify);
  const auth = fastify.requireRole('admin', 'cfo', 'controller');

  fastify.get(
    '/aliquotas',
    {
      preHandler: [auth],
      schema: {
        tags: ['retencoes'],
        summary: 'Alíquotas padrão usadas pelo sistema',
        response: { 200: AliquotasUsadasResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.aliquotasUsadas(),
  );

  fastify.get(
    '/divergencias',
    {
      preHandler: [auth],
      schema: {
        tags: ['retencoes'],
        summary: 'Lista títulos com divergência entre retido (Globus) e esperado (heurística)',
        description:
          'Busca NFs (NF/NFE/NFV/NFS) com valor positivo, calcula retenção esperada pela ' +
          'heurística Lucro Real e retorna apenas títulos com divergência em algum dos impostos.',
        response: { 200: ConferenciaDivergenciasResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarDivergencias(),
  );

  fastify.get(
    '/titulo/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['retencoes'],
        summary: 'Conferência tributária detalhada de um CP específico',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: ConferenciaDoTituloResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.conferirTitulo(req.params.id),
  );
};
