import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import { RequestLog } from '@/entities/request-log.entity.js';
import { obterIpDoCliente } from '@/shared/utils/client-ip.js';

declare module 'fastify' {
  interface FastifyRequest {
    metricsStartTime?: number;
  }
}

export const requestMetricsPlugin = fp(
  async (fastify) => {
    const { metrics } = fastify.config;
    const excluded = new Set(metrics.excludedPaths);
    const repo = fastify.db.getRepository(RequestLog);

    function shouldSkip(path: string): boolean {
      if (excluded.has(path)) return true;
      for (const ex of excluded) {
        if (path.startsWith(`${ex}/`) || path.startsWith(`${ex}?`)) return true;
      }
      return false;
    }

    fastify.addHook('onRequest', async (req) => {
      req.metricsStartTime = Date.now();
    });

    fastify.addHook('onResponse', async (req, reply) => {
      if (shouldSkip(req.url.split('?')[0] ?? '/')) return;

      const startedAt = req.metricsStartTime ?? Date.now();
      const latencyMs = Math.max(0, Date.now() - startedAt);
      const usuarioId = extractUsuarioId(req);
      const userAgent = req.headers['user-agent']?.slice(0, 500) ?? null;
      const ip = obterIpDoCliente(req);

      setImmediate(() => {
        repo
          .insert({
            requestId: req.id,
            method: req.method,
            path: req.url.split('?')[0]?.slice(0, 500) ?? '',
            statusCode: reply.statusCode,
            latencyMs,
            usuarioId,
            ipAddress: ip,
            userAgent,
          })
          .catch((err) => fastify.log.warn({ err }, 'Falha ao gravar request_log'));
      });
    });
  },
  { name: 'request-metrics', dependencies: ['db', 'config'] },
);

function extractUsuarioId(req: FastifyRequest): string | null {
  try {
    const user = (req as FastifyRequest & { user?: { sub?: string } }).user;
    return user?.sub ?? null;
  } catch {
    return null;
  }
}
