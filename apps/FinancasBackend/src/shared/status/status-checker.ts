import type { FastifyInstance } from 'fastify';

export interface DependenciaStatus {
  nome: string;
  ok: boolean;
  mensagem?: string;
  detalhe?: string;
}

export interface StatusReport {
  status: 'ok' | 'degraded' | 'down';
  versao: string;
  uptimeSegundos: number;
  ambiente: string;
  timestamp: string;
  dependencias: DependenciaStatus[];
}

async function checarDb(fastify: FastifyInstance): Promise<DependenciaStatus> {
  if (!fastify.db.isInitialized) {
    return { nome: 'PostgreSQL', ok: false, mensagem: 'DataSource nao inicializado' };
  }
  try {
    await fastify.db.query('SELECT 1');
    return { nome: 'PostgreSQL', ok: true, detalhe: `${fastify.config.database.host}:${fastify.config.database.port}/${fastify.config.database.name}` };
  } catch (err) {
    return { nome: 'PostgreSQL', ok: false, mensagem: (err as Error).message };
  }
}

async function checarSmtp(fastify: FastifyInstance): Promise<DependenciaStatus> {
  if (!fastify.email?.verificar) {
    return { nome: 'SMTP', ok: false, mensagem: 'Plugin de email nao carregado' };
  }
  try {
    await fastify.email.verificar();
    return { nome: 'SMTP', ok: true, detalhe: `${fastify.config.smtp.host}:${fastify.config.smtp.port}` };
  } catch (err) {
    return { nome: 'SMTP', ok: false, mensagem: (err as Error).message };
  }
}

function checarOracle(fastify: FastifyInstance): DependenciaStatus {
  if (!fastify.config.oracle.enabled) {
    return { nome: 'Oracle (Globus)', ok: true, mensagem: 'Desabilitado por configuracao' };
  }
  const disponivel = fastify.oracle?.isAvailable?.() ?? false;
  return {
    nome: 'Oracle (Globus)',
    ok: disponivel,
    detalhe: disponivel ? `${fastify.config.oracle.host}:${fastify.config.oracle.port}/${fastify.config.oracle.serviceName}` : undefined,
    mensagem: disponivel ? undefined : 'Pool nao iniciado - veja logs',
  };
}

export async function coletarStatus(fastify: FastifyInstance): Promise<StatusReport> {
  const [db, smtp] = await Promise.all([checarDb(fastify), checarSmtp(fastify)]);
  const oracle = checarOracle(fastify);
  const dependencias = [db, smtp, oracle];

  // Considera SMTP nao-fatal e Oracle desabilitado tambem nao-fatal.
  const criticas = [db];
  const todasOk = criticas.every((d) => d.ok);
  const todasParciais = dependencias.every((d) => d.ok || d.mensagem?.includes('Desabilitado'));
  const status: StatusReport['status'] = todasOk ? (todasParciais ? 'ok' : 'degraded') : 'down';

  return {
    status,
    versao: process.env.npm_package_version ?? '0.0.1',
    uptimeSegundos: Math.floor(process.uptime()),
    ambiente: fastify.config.nodeEnv,
    timestamp: new Date().toISOString(),
    dependencias,
  };
}
