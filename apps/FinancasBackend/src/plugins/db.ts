import 'reflect-metadata';
import fp from 'fastify-plugin';
import { DataSource } from 'typeorm';
import { ENTITIES } from '../entities/index.js';
import { MIGRATIONS } from '../migrations/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: DataSource;
  }
}

export const dbPlugin = fp(
  async (fastify) => {
    const { config } = fastify;
    const ds = new DataSource({
      type: 'postgres',
      host: config.database.host,
      port: config.database.port,
      username: config.database.user,
      password: config.database.password,
      database: config.database.name,
      schema: config.database.schema,
      // Registro EXPLÍCITO em vez de glob — funciona em qualquer cwd
      // (dev usa tsx watch, produção roda do dist com cwd=/app).
      entities: ENTITIES,
      migrations: MIGRATIONS,
      synchronize: false,
      logging: config.nodeEnv === 'development' ? ['error', 'warn'] : ['error'],
      extra: { application_name: 'pioneira-financas-backend' },
    });

    await ds.initialize();
    fastify.log.info('Conexao com PostgreSQL inicializada');
    fastify.decorate('db', ds);

    fastify.addHook('onClose', async () => {
      if (ds.isInitialized) {
        await ds.destroy();
        fastify.log.info('Conexao com PostgreSQL encerrada');
      }
    });
  },
  { name: 'db', dependencies: ['config'] },
);
