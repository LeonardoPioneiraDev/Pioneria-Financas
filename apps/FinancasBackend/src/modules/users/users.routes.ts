import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  UserCreatePayloadSchema,
  UserListQuerySchema,
  UserResponseSchema,
  UserUpdatePayloadSchema,
} from '@pioneira/shared';
import { buildUsersService } from './users.service.js';
import { obterIpDoCliente } from '@/shared/utils/client-ip.js';

export const usersModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildUsersService(fastify);

  const PaginatedUsersSchema = Type.Object({
    data: Type.Array(UserResponseSchema),
    pagination: Type.Object({
      page: Type.Integer(),
      limit: Type.Integer(),
      total: Type.Integer(),
      totalPages: Type.Integer(),
    }),
  });

  fastify.get(
    '/',
    {
      preHandler: [fastify.requireRole('admin', 'cfo')],
      schema: {
        tags: ['users'],
        summary: 'Lista usuarios (admin/cfo)',
        querystring: UserListQuerySchema,
        response: { 200: PaginatedUsersSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listar(req.query),
  );

  fastify.get(
    '/:id',
    {
      preHandler: [fastify.requireRole('admin', 'cfo')],
      schema: {
        tags: ['users'],
        summary: 'Detalhes de um usuario',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: UserResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.obter(req.params.id),
  );

  fastify.post(
    '/',
    {
      preHandler: [fastify.requireRole('admin')],
      schema: {
        tags: ['users'],
        summary: 'Cria usuario (envia convite por email)',
        body: UserCreatePayloadSchema,
        response: { 201: UserResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const user = await service.criar(req.body, obterIpDoCliente(req));
      return reply.code(201).send(user);
    },
  );

  fastify.patch(
    '/:id',
    {
      preHandler: [fastify.requireRole('admin')],
      schema: {
        tags: ['users'],
        summary: 'Atualiza usuario',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: UserUpdatePayloadSchema,
        response: { 200: UserResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.atualizar(req.params.id, req.body),
  );

  fastify.post(
    '/:id/resend-invite',
    {
      preHandler: [fastify.requireRole('admin')],
      schema: {
        tags: ['users'],
        summary: 'Reenvia convite de primeiro acesso',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 204: Type.Null() },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      await service.reenviarConvite(req.params.id, obterIpDoCliente(req));
      return reply.code(204).send();
    },
  );

  fastify.delete(
    '/:id',
    {
      preHandler: [fastify.requireRole('admin')],
      schema: {
        tags: ['users'],
        summary: 'Remove usuario',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 204: Type.Null() },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      await service.remover(req.params.id);
      return reply.code(204).send();
    },
  );
};
