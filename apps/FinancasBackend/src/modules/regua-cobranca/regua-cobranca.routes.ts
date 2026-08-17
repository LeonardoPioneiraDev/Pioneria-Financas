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
        summary: 'Lista templates de cobrança configurados',
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
        summary: 'Cria novo template de cobrança',
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
        summary: 'Histórico de envios (últimos 200)',
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
        summary: 'Dispara execução da régua AGORA (modo simulado)',
        description:
          'Pra cada CR aberto, calcula dias_vencidos e dispara templates ativos cujo ' +
          'gatilho bate. Idempotente: não reenvia mesmo template+CR no mesmo dia.',
        response: { 200: ReguaSimularResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
    },
    // MOCK DESATIVADO (a pedido): não disparar envios simulados. Reativar quando
    // houver provedor real de e-mail/WhatsApp configurado. Código original preservado:
    // async () => service.simularExecucao(),
    async () => {
      throw fastify.httpErrors.notImplemented(
        'Execução da régua não configurada: provedor de e-mail/WhatsApp real ausente (modo mock desativado).',
      );
    },
  );
};
