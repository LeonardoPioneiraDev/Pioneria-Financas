import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  MarcarLidasBodySchema,
  MarcarLidasResponseSchema,
  NotificacoesListQuerySchema,
  NotificacoesListResponseSchema,
} from '@pioneira/shared/schemas/notificacoes';
import { buildNotificacoesService } from './notificacoes.service.js';

export const notificacoesModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildNotificacoesService(fastify);

  fastify.get(
    '/',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['notificacoes'],
        summary: 'Notificações do usuário logado (mais recentes primeiro) + contador de não lidas',
        querystring: NotificacoesListQuerySchema,
        response: { 200: NotificacoesListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listar(req.user.sub, req.query),
  );

  fastify.post(
    '/ler',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['notificacoes'],
        summary: 'Marca notificações como lidas (IDs informados, ou todas se a lista vier vazia)',
        body: MarcarLidasBodySchema,
        response: { 200: MarcarLidasResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.marcarLidas(req.user.sub, req.body.ids),
  );
};
