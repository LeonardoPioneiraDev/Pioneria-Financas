import type { FastifyRequest } from 'fastify';

/**
 * Captura IP do cliente seguindo a ordem de prioridade:
 * CF-Connecting-IP > X-Real-IP > X-Forwarded-For > req.ip
 */
export function obterIpDoCliente(req: FastifyRequest): string | null {
  const headers = req.headers;
  const cfIp = headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp) return normalizar(cfIp);

  const realIp = headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp) return normalizar(realIp);

  const fwd = headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) {
    const primeiro = fwd.split(',')[0]?.trim();
    if (primeiro) return normalizar(primeiro);
  }

  return req.ip ? normalizar(req.ip) : null;
}

function normalizar(ip: string): string {
  if (ip.startsWith('::ffff:')) return ip.slice('::ffff:'.length);
  return ip;
}
