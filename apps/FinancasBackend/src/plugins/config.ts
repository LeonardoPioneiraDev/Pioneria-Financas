import fp from 'fastify-plugin';
import { loadEnvironment, type EnvironmentConfig } from '@/config/environment.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: EnvironmentConfig;
  }
}

export const configPlugin = fp(
  async (fastify) => {
    const config = loadEnvironment();
    fastify.decorate('config', config);
    fastify.log.info({ env: config.nodeEnv, port: config.backend.port }, 'Configuracao carregada');
  },
  { name: 'config' },
);
