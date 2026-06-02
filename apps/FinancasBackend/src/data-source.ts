import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadEnvironment } from '@/config/environment.js';
import { ENTITIES } from './entities/index.js';
import { MIGRATIONS } from './migrations/index.js';

const env = loadEnvironment();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.database.host,
  port: env.database.port,
  username: env.database.user,
  password: env.database.password,
  database: env.database.name,
  schema: env.database.schema,
  // Imports diretos (funcionam em qualquer cwd — dev/Docker/prod).
  entities: ENTITIES,
  migrations: MIGRATIONS,
  synchronize: false,
  logging: env.nodeEnv === 'development' ? ['error', 'warn'] : ['error'],
  extra: {
    application_name: 'pioneira-financas-backend',
  },
});
