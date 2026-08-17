import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  DetalheOrigemQuerySchema,
  DetalheOrigemResponseSchema,
  RecebiveisContasResponseSchema,
  RecebiveisListQuerySchema,
  RecebiveisListResponseSchema,
  RecebivelDetalheResponseSchema,
  SumarioRecebiveisQuerySchema,
  SumarioRecebiveisResponseSchema,
  SyncExtratoBodySchema,
  SyncExtratoResponseSchema,
} from '@pioneira/shared';
import { buildRecebiveisService } from './recebiveis.service.js';

export const recebiveisModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildRecebiveisService(fastify);
  const auth = fastify.requireRole('admin', 'cfo', 'controller');

  fastify.get(
    '/sumario',
    {
      preHandler: [auth],
      schema: {
        tags: ['recebiveis'],
        summary: 'Total recebido no extrato (créditos) e breakdown por origem (gdf/clientes/outras)',
        querystring: SumarioRecebiveisQuerySchema,
        response: { 200: SumarioRecebiveisResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.sumario(req.query),
  );

  fastify.get(
    '/',
    {
      preHandler: [auth],
      schema: {
        tags: ['recebiveis'],
        summary: 'Lista créditos do extrato classificados por origem (paginado)',
        querystring: RecebiveisListQuerySchema,
        response: { 200: RecebiveisListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listar(req.query),
  );

  fastify.get(
    '/detalhe-origem',
    {
      preHandler: [auth],
      schema: {
        tags: ['recebiveis'],
        summary: 'Detalhe de uma origem: tipos de lançamento (histórico bancário), do maior valor pro menor',
        querystring: DetalheOrigemQuerySchema,
        response: { 200: DetalheOrigemResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.detalheOrigem(req.query),
  );

  fastify.get(
    '/contas',
    {
      preHandler: [auth],
      schema: {
        tags: ['recebiveis'],
        summary: 'Contas bancárias para o filtro de recebíveis',
        response: { 200: RecebiveisContasResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.contas(),
  );

  fastify.get(
    '/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['recebiveis'],
        summary: 'Detalhe completo de um lançamento do extrato (modal da linha)',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: RecebivelDetalheResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.detalhe(req.params.id),
  );

  fastify.post(
    '/sincronizar-extrato',
    {
      // TEMPORÁRIO (fase de desenvolvimento/validação): liberado pra qualquer usuário logado.
      // Reverter para fastify.requireAdmin antes de produção.
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['recebiveis'],
        summary: 'Atualiza o extrato bancário (BCOMOVTO do Globus + ETL). Sem janela = mês corrente.',
        body: SyncExtratoBodySchema,
        response: { 200: SyncExtratoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
    },
    async (req) => service.sincronizarExtrato(req.body, req.user.sub),
  );
};
