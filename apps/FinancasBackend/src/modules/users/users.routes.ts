import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  UserCreatePayloadSchema,
  UserCreateResponseSchema,
  UserListQuerySchema,
  UserResponseSchema,
  UserUpdatePayloadSchema,
  RedefinirSenhaResponseSchema,
  RegistrarAcessoFuncionalidadeBodySchema,
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
        summary: 'Lista usuários (admin/cfo)',
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
        summary: 'Detalhes de um usuário',
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
        summary: 'Cria usuário (gera senha aleatória, sem envio de e-mail)',
        body: UserCreatePayloadSchema,
        response: { 201: UserCreateResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const user = await service.criar(req.body);
      return reply.code(201).send(user);
    },
  );

  // LEGADO — `POST /me/validar-funcionalidade` foi substituído por
  // `POST /api/validacoes/conferir`, que registra validação E ressalva (com
  // observações) na trilha audit.validacao_funcionalidade. Ver modules/validacoes/.

  fastify.post(
    '/me/registrar-acesso',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['users'],
        summary: 'Registra o 1º acesso do usuário a uma funcionalidade (relógio das horas)',
        body: RegistrarAcessoFuncionalidadeBodySchema,
        response: { 204: Type.Null() },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      await service.registrarAcessoFuncionalidade(req.user.sub, req.body.chave);
      return reply.code(204).send();
    },
  );

  fastify.post(
    '/:id/resetar-funcionalidades',
    {
      preHandler: [fastify.requireRole('admin')],
      schema: {
        tags: ['users'],
        summary: 'APAGA as validações do usuário: conferências, avais órfãos, notificações e progresso (admin)',
        description: 'Destrutivo e sem desfazer. O ato do reset fica registrado em audit.acesso_dados com o resumo do que foi apagado.',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: UserResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.resetarProgressoFuncionalidades(req.params.id, req.user.sub),
  );

  fastify.post(
    '/:id/redefinir-senha',
    {
      preHandler: [fastify.requireRole('admin')],
      schema: {
        tags: ['users'],
        summary: 'Redefine a senha do usuário (gera nova senha aleatória, sem e-mail)',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: RedefinirSenhaResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.redefinirSenha(req.params.id, req.user.sub),
  );

  fastify.patch(
    '/:id',
    {
      preHandler: [fastify.requireRole('admin')],
      schema: {
        tags: ['users'],
        summary: 'Atualiza usuário',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: UserUpdatePayloadSchema,
        response: { 200: UserResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.atualizar(req.params.id, req.body, req.user.sub),
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
        summary: 'Remove usuário',
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
