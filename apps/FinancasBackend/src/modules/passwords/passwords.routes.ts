import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  FirstAccessPayloadSchema,
  ForgotPasswordPayloadSchema,
  ResetPasswordPayloadSchema,
  ValidateTokenQuerySchema,
  ValidateTokenResponseSchema,
} from '@pioneira/shared';
import { buildPasswordsService } from './passwords.service.js';
import { obterIpDoCliente } from '@/shared/utils/client-ip.js';

export const passwordsModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildPasswordsService(fastify);

  fastify.post(
    '/forgot',
    {
      schema: {
        tags: ['passwords'],
        summary: 'Solicita email de recuperação de senha',
        body: ForgotPasswordPayloadSchema,
        response: { 202: Type.Object({ message: Type.String() }) },
      },
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (req, reply) => {
      await service.solicitarRecuperacao(req.body.email, obterIpDoCliente(req), req.headers['user-agent'] ?? null);
      return reply.code(202).send({ message: 'Se o email existir, você receberá um link de recuperação' });
    },
  );

  fastify.get(
    '/validate',
    {
      schema: {
        tags: ['passwords'],
        summary: 'Valida um token de reset ou primeiro acesso',
        querystring: ValidateTokenQuerySchema,
        response: { 200: ValidateTokenResponseSchema },
      },
    },
    async (req) => service.validarToken(req.query.token),
  );

  fastify.post(
    '/reset',
    {
      schema: {
        tags: ['passwords'],
        summary: 'Redefine senha usando token de recuperação',
        body: ResetPasswordPayloadSchema,
        response: { 204: Type.Null() },
      },
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (req, reply) => {
      await service.redefinirSenha(req.body.token, req.body.novaSenha, obterIpDoCliente(req), req.headers['user-agent'] ?? null);
      return reply.code(204).send();
    },
  );

  fastify.post(
    '/first-access',
    {
      schema: {
        tags: ['passwords'],
        summary: 'Define senha de primeiro acesso',
        body: FirstAccessPayloadSchema,
        response: { 204: Type.Null() },
      },
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (req, reply) => {
      await service.definirSenhaPrimeiroAcesso(req.body.token, req.body.novaSenha, obterIpDoCliente(req), req.headers['user-agent'] ?? null);
      return reply.code(204).send();
    },
  );
};
