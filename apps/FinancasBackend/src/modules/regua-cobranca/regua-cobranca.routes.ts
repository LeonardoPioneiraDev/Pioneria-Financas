import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  ReguaEnviosListResponseSchema,
  ReguaSimularResponseSchema,
  ReguaTemplateCreateSchema,
  ReguaTemplateSchema,
  ReguaTemplateUpdateSchema,
  ReguaTemplatesListResponseSchema,
} from '@pioneira/shared';
import { buildReguaCobrancaService } from './regua-cobranca.service.js';

export const reguaCobrancaModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildReguaCobrancaService(fastify);
  const authL = fastify.requireRole('admin', 'cfo', 'controller');
  const authW = fastify.requireRole('admin', 'cfo', 'controller');

  fastify.get(
    '/templates',
    {
      preHandler: [authL],
      schema: {
        tags: ['regua-cobranca'],
        summary: 'Lista templates de cobranca configurados',
        response: { 200: ReguaTemplatesListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarTemplates(),
  );

  fastify.post(
    '/templates',
    {
      preHandler: [authW],
      schema: {
        tags: ['regua-cobranca'],
        summary: 'Cria novo template de cobranca',
        body: ReguaTemplateCreateSchema,
        response: { 200: ReguaTemplateSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.criarTemplate(req.body),
  );

  fastify.patch(
    '/templates/:id',
    {
      preHandler: [authW],
      schema: {
        tags: ['regua-cobranca'],
        summary: 'Atualiza template (incluindo desativar via ativo=false)',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: ReguaTemplateUpdateSchema,
        response: { 200: ReguaTemplateSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.atualizarTemplate(req.params.id, req.body),
  );

  fastify.get(
    '/envios',
    {
      preHandler: [authL],
      schema: {
        tags: ['regua-cobranca'],
        summary: 'Historico de envios (ultimos 200)',
        response: { 200: ReguaEnviosListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarEnvios(),
  );

  fastify.post(
    '/simular',
    {
      preHandler: [authW],
      schema: {
        tags: ['regua-cobranca'],
        summary: 'Dispara execucao da regua AGORA (modo simulado)',
        description:
          'Pra cada CR aberto, calcula dias_vencidos e dispara templates ativos cujo ' +
          'gatilho bate. Idempotente: nao reenvia mesmo template+CR no mesmo dia.',
        response: { 200: ReguaSimularResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
    },
    async () => service.simularExecucao(),
  );
};
