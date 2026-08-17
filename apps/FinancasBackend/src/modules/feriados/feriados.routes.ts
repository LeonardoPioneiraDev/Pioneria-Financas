import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  FeriadosListResponseSchema,
  CriarFeriadoBodySchema,
  AtualizarFeriadoBodySchema,
  FeriadoMutacaoResponseSchema,
} from '@pioneira/shared';
import { buildFeriadosService } from './feriados.service.js';

export const feriadosModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildFeriadosService(fastify);
  const auth = fastify.requireRole('admin');

  fastify.get(
    '/',
    {
      preHandler: [auth],
      schema: {
        tags: ['feriados'],
        summary: 'Lista os feriados cadastrados',
        response: { 200: FeriadosListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listar(),
  );

  fastify.post(
    '/',
    {
      preHandler: [auth],
      schema: {
        tags: ['feriados'],
        summary: 'Cadastra um feriado',
        body: CriarFeriadoBodySchema,
        response: { 200: FeriadoMutacaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.criar(req.body, req.user.sub),
  );

  fastify.put(
    '/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['feriados'],
        summary: 'Atualiza um feriado',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: AtualizarFeriadoBodySchema,
        response: { 200: FeriadoMutacaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.atualizar(req.params.id, req.body),
  );

  fastify.delete(
    '/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['feriados'],
        summary: 'Remove um feriado',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: FeriadoMutacaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.remover(req.params.id),
  );
};
