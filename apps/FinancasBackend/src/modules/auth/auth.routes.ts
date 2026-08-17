import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  AuthenticatedUserSchema,
  LoginPayloadSchema,
  LoginResponseSchema,
  RefreshTokenPayloadSchema,
} from '@pioneira/shared';
import { buildAuthService } from './auth.service.js';
import { obterIpDoCliente } from '@/shared/utils/client-ip.js';

export const authModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildAuthService(fastify);

  fastify.post(
    '/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Login com email e senha',
        body: LoginPayloadSchema,
        response: { 200: LoginResponseSchema },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      return service.login(req.body, obterIpDoCliente(req), req.headers['user-agent'] ?? null);
    },
  );

  fastify.post(
    '/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: 'Renova access token a partir do refresh token',
        body: RefreshTokenPayloadSchema,
        response: { 200: LoginResponseSchema },
      },
    },
    async (req) => {
      return service.refresh(req.body.refreshToken, obterIpDoCliente(req), req.headers['user-agent'] ?? null);
    },
  );

  fastify.post(
    '/logout',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['auth'],
        summary: 'Encerra sessão revogando o refresh token',
        body: Type.Optional(RefreshTokenPayloadSchema),
        response: { 204: Type.Null() },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      await service.logout(
        req.body?.refreshToken ?? null,
        req.user.sub,
        obterIpDoCliente(req),
        req.headers['user-agent'] ?? null,
      );
      return reply.code(204).send();
    },
  );

  fastify.get(
    '/me',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['auth'],
        summary: 'Usuário autenticado atual',
        response: { 200: AuthenticatedUserSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.me(req.user.sub),
  );
};
