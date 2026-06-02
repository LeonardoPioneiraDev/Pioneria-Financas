import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

// Em monorepo, o .env mora na raiz. Quando o pnpm roda --filter o CWD vira o app.
const candidatos = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env'), resolve(process.cwd(), '../.env')];
for (const c of candidatos) {
  if (existsSync(c)) {
    loadDotenv({ path: c });
    break;
  }
}

export interface EnvironmentConfig {
  nodeEnv: 'development' | 'test' | 'production';
  tz: string;
  backend: {
    host: string;
    port: number;
    trustProxy: boolean;
  };
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    name: string;
    schema: string;
  };
  redis: {
    host: string;
    port: number;
  };
  jwt: {
    secret: string;
    accessExpiresIn: string;
    refreshExpiresIn: string;
  };
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    fromName: string;
    fromEmail: string;
  };
  app: {
    url: string;
    /** Lista de origens CORS adicionais (além de app.url e localhost:3000/3001). */
    corsOrigins: string[];
  };
  metrics: {
    excludedPaths: string[];
  };
  oracle: {
    enabled: boolean;
    host: string;
    port: number;
    serviceName: string;
    user: string;
    password: string;
    clientPath: string;
    poolMin: number;
    poolMax: number;
    poolIncrement: number;
    poolTimeoutMs: number;
    connectTimeoutMs: number;
    queryTimeoutMs: number;
    fetchArraySize: number;
    prefetchRows: number;
    maxRetries: number;
    retryDelayMs: number;
  };
  horarios: {
    /** Habilita o cliente HTTP. Em dev sem rede da Pioneira, manter false. */
    enabled: boolean;
    /** URL base. Default: https://horarios.vpioneira.com.br */
    baseUrl: string;
    /** API Key no formato tp_<prefix>.<secret>. NUNCA commitar. */
    apiKey: string;
    /** Timeout por request (ms). */
    timeoutMs: number;
    /** Numero maximo de tentativas com backoff exponencial. */
    maxRetries: number;
    /** Delay inicial entre tentativas (ms). */
    retryDelayMs: number;
  };
  globus: {
    /** Código da empresa no Globus. 4 = Viação Pioneira. Centralizado aqui pra
     *  facilitar futura multi-empresa (consórcio com Bacia 2 etc.). */
    empresaId: number;
    /**
     * Lista de filiais (CODIGOFL) da Pioneira que entram nas queries de fato.
     * Default = [1, 5, 6, 17, 19] (visão consolidada da empresa 4 — ver
     * memória `pioneira-empresa-filiais`).
     */
    filiais: number[];
    /**
     * @deprecated Use `filiais` para todas as novas queries. Mantido só pra
     * compatibilidade com módulos antigos que ainda esperam um único valor.
     * Aponta para a primeira filial de `filiais` (matriz administrativa).
     */
    filialId: number;
  };
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
}

function required(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Variavel de ambiente obrigatoria nao definida: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function asInt(value: string, key: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Variavel de ambiente ${key} deve ser inteiro, recebido: ${value}`);
  }
  return parsed;
}

function asBool(value: string): boolean {
  return value === 'true' || value === '1';
}

export function loadEnvironment(): EnvironmentConfig {
  const nodeEnv = optional('NODE_ENV', 'development') as EnvironmentConfig['nodeEnv'];

  return {
    nodeEnv,
    tz: optional('TZ', 'America/Sao_Paulo'),
    backend: {
      host: optional('BACKEND_HOST', '0.0.0.0'),
      port: asInt(optional('BACKEND_PORT', '3333'), 'BACKEND_PORT'),
      trustProxy: asBool(optional('TRUST_PROXY', 'false')),
    },
    database: {
      host: optional('DATABASE_HOST', 'localhost'),
      port: asInt(optional('DATABASE_PORT', '5435'), 'DATABASE_PORT'),
      user: required('DATABASE_USER'),
      password: required('DATABASE_PASSWORD'),
      name: required('DATABASE_NAME'),
      schema: optional('DATABASE_SCHEMA', 'public'),
    },
    redis: {
      host: optional('REDIS_HOST', 'localhost'),
      port: asInt(optional('REDIS_PORT', '6379'), 'REDIS_PORT'),
    },
    jwt: {
      secret: required('JWT_SECRET'),
      accessExpiresIn: optional('JWT_ACCESS_EXPIRES_IN', '15m'),
      refreshExpiresIn: optional('JWT_REFRESH_EXPIRES_IN', '7d'),
    },
    smtp: {
      host: optional('SMTP_HOST', 'localhost'),
      port: asInt(optional('SMTP_PORT', '1025'), 'SMTP_PORT'),
      secure: asBool(optional('SMTP_SECURE', 'false')),
      user: optional('SMTP_USER', ''),
      password: optional('SMTP_PASSWORD', ''),
      fromName: optional('SMTP_FROM_NAME', 'Pioneira Financas'),
      fromEmail: optional('SMTP_FROM_EMAIL', 'nao-responda@vpioneira.com.br'),
    },
    app: {
      url: optional('APP_URL', 'http://localhost:3000'),
      corsOrigins: optional('CORS_ORIGINS', '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    },
    metrics: {
      excludedPaths: optional('METRICS_EXCLUDED_PATHS', '/health,/docs').split(',').map((p) => p.trim()).filter(Boolean),
    },
    oracle: {
      enabled: asBool(optional('ORACLE_ENABLED', 'false')),
      host: optional('ORACLE_HOST', ''),
      port: asInt(optional('ORACLE_PORT', '1521'), 'ORACLE_PORT'),
      serviceName: optional('ORACLE_SERVICE_NAME', ''),
      user: optional('ORACLE_USER', ''),
      password: optional('ORACLE_PASSWORD', ''),
      clientPath: optional('ORACLE_CLIENT_PATH', ''),
      poolMin: asInt(optional('ORACLE_POOL_MIN', '5'), 'ORACLE_POOL_MIN'),
      poolMax: asInt(optional('ORACLE_POOL_MAX', '50'), 'ORACLE_POOL_MAX'),
      poolIncrement: asInt(optional('ORACLE_POOL_INCREMENT', '2'), 'ORACLE_POOL_INCREMENT'),
      poolTimeoutMs: asInt(optional('ORACLE_POOL_TIMEOUT', '18000000'), 'ORACLE_POOL_TIMEOUT'),
      connectTimeoutMs: asInt(optional('ORACLE_CONNECT_TIMEOUT', '1800000'), 'ORACLE_CONNECT_TIMEOUT'),
      queryTimeoutMs: asInt(optional('ORACLE_QUERY_TIMEOUT', '18000000'), 'ORACLE_QUERY_TIMEOUT'),
      fetchArraySize: asInt(optional('ORACLE_FETCH_ARRAY_SIZE', '2000'), 'ORACLE_FETCH_ARRAY_SIZE'),
      prefetchRows: asInt(optional('ORACLE_PREFETCH_ROWS', '200'), 'ORACLE_PREFETCH_ROWS'),
      maxRetries: asInt(optional('ORACLE_MAX_RETRIES', '3'), 'ORACLE_MAX_RETRIES'),
      retryDelayMs: asInt(optional('ORACLE_RETRY_DELAY', '5000'), 'ORACLE_RETRY_DELAY'),
    },
    horarios: {
      enabled: asBool(optional('HORARIOS_ENABLED', 'false')),
      baseUrl: optional('HORARIOS_API_URL', 'https://horarios.vpioneira.com.br'),
      apiKey: optional('HORARIOS_API_KEY', ''),
      timeoutMs: asInt(optional('HORARIOS_TIMEOUT_MS', '30000'), 'HORARIOS_TIMEOUT_MS'),
      maxRetries: asInt(optional('HORARIOS_MAX_RETRIES', '3'), 'HORARIOS_MAX_RETRIES'),
      retryDelayMs: asInt(optional('HORARIOS_RETRY_DELAY_MS', '2000'), 'HORARIOS_RETRY_DELAY_MS'),
    },
    globus: (() => {
      const filiais = optional('EMPRESA_GLOBUS_FILIAIS', '1,5,6,17,19')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s, idx) => {
          const n = Number.parseInt(s, 10);
          if (Number.isNaN(n) || n <= 0) {
            throw new Error(`EMPRESA_GLOBUS_FILIAIS posicao ${idx} invalida: "${s}" (esperado inteiro positivo)`);
          }
          return n;
        });
      if (filiais.length === 0) {
        throw new Error('EMPRESA_GLOBUS_FILIAIS nao pode ser vazio. Default seguro: 1,5,6,17,19');
      }
      return {
        empresaId: asInt(optional('EMPRESA_GLOBUS_ID', '4'), 'EMPRESA_GLOBUS_ID'),
        filiais,
        // Legado: aponta pra primeira (matriz administrativa). Novos módulos devem usar `filiais`.
        filialId: asInt(optional('EMPRESA_GLOBUS_FILIAL', String(filiais[0])), 'EMPRESA_GLOBUS_FILIAL'),
      };
    })(),
    logLevel: optional('LOG_LEVEL', 'info') as EnvironmentConfig['logLevel'],
  };
}
