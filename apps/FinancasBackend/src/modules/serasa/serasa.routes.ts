import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  CandidatosResponseSchema,
  ConsultarSerasaBodySchema,
  ConsultasListResponseSchema,
  NegativacoesListResponseSchema,
  NegativarBodySchema,
  SerasaConsultaResponseSchema,
  SerasaNegativacaoSchema,
} from '@pioneira/shared';
import { buildSerasaService } from './serasa.service.js';

export const serasaModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildSerasaService(fastify);
  const authL = fastify.requireRole('admin', 'cfo', 'controller');
  const authW = fastify.requireRole('admin', 'cfo', 'controller');

  fastify.post(
    '/consultar',
    {
      preHandler: [authW],
      schema: {
        tags: ['serasa'],
        summary: 'Consulta score + restrições de um cliente (MOCK)',
        body: ConsultarSerasaBodySchema,
        response: { 200: SerasaConsultaResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    },
    // MOCK DESATIVADO (a pedido): não gerar score/restrição fake. Reativar quando
    // houver contrato + credenciais SERASA reais. Código original preservado:
    // async (req) => service.consultar({ body: req.body, usuarioId: req.user.sub }),
    async () => {
      throw fastify.httpErrors.notImplemented(
        'Consulta SERASA não configurada: integração real ausente (modo mock desativado).',
      );
    },
  );

  fastify.get(
    '/consultas',
    {
      preHandler: [authL],
      schema: {
        tags: ['serasa'],
        summary: 'Histórico de consultas (últimas 50)',
        response: { 200: ConsultasListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarConsultas(),
  );

  fastify.get(
    '/candidatos',
    {
      preHandler: [authL],
      schema: {
        tags: ['serasa'],
        summary: 'CRs candidatos a negativação (vencidos há mais de 30 dias, sem negativação ativa)',
        response: { 200: CandidatosResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarCandidatos(),
  );

  fastify.post(
    '/negativar',
    {
      preHandler: [authW],
      schema: {
        tags: ['serasa'],
        summary: 'Negativa CR no SERASA (MOCK)',
        body: NegativarBodySchema,
        response: { 200: SerasaNegativacaoSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    // MOCK DESATIVADO (a pedido): não registrar negativação fake. Reativar quando
    // houver contrato + credenciais SERASA reais. Código original preservado:
    // async (req) => service.negativar({ body: req.body, usuarioId: req.user.sub }),
    async () => {
      throw fastify.httpErrors.notImplemented(
        'Negativação SERASA não configurada: integração real ausente (modo mock desativado).',
      );
    },
  );

  fastify.post(
    '/baixar/:id',
    {
      preHandler: [authW],
      schema: {
        tags: ['serasa'],
        summary: 'Baixa negativação (título foi quitado)',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: SerasaNegativacaoSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.baixar(req.params.id),
  );

  fastify.get(
    '/negativacoes',
    {
      preHandler: [authL],
      schema: {
        tags: ['serasa'],
        summary: 'Negativações ativas e históricas',
        response: { 200: NegativacoesListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarNegativacoes(),
  );
};
