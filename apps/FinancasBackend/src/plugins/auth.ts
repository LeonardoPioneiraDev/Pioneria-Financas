import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { UserRole } from '@pioneira/shared';

interface JwtUserPayload {
  sub: string;
  email: string;
  role: UserRole;
  nomeCompleto: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtUserPayload;
    user: JwtUserPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authRequired: preHandlerHookHandler;
    requireRole: (...roles: UserRole[]) => preHandlerHookHandler;
  }
}

export const authPlugin = fp(
  async (fastify) => {
    await fastify.register(fastifyJwt, {
      secret: fastify.config.jwt.secret,
      sign: { expiresIn: fastify.config.jwt.accessExpiresIn },
    });

    fastify.decorate('authRequired', async function authRequired(req: FastifyRequest, reply: FastifyReply) {
      try {
        await req.jwtVerify();
      } catch {
        return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Token invalido ou expirado' });
      }
    });

    fastify.decorate('requireRole', function requireRole(...roles: UserRole[]) {
      return async function (req: FastifyRequest, reply: FastifyReply) {
        try {
          await req.jwtVerify();
        } catch {
          return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Token invalido ou expirado' });
        }
        if (!roles.includes(req.user.role)) {
          return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Permissao insuficiente' });
        }
      };
    });
  },
  { name: 'auth', dependencies: ['config'] },
);
