import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { UserRole, Permissao } from '@pioneira/shared';
import { funcionalidadesLiberadas } from '@pioneira/shared';
import { User } from '@/entities/user.entity.js';

/**
 * Mapa prefixo-de-API → funcionalidades (hrefs) que CONSOMEM aquela API. Usado
 * pra conceder acesso quando a atribuição do admin sobrepõe o papel.
 *
 * É N:N de propósito: uma tela puxa API de mais de um módulo (Contas a Pagar
 * carrega retenções, Fluxo de Caixa soma CP + CR, Folha usa CP). Se o mapa fosse
 * 1:1, a tela liberada abriria com blocos em 403. Basta UMA das funcionalidades
 * da lista estar liberada para o acesso ser concedido.
 *
 * Ordem importa: prefixos mais específicos primeiro.
 */
const API_PARA_FUNCIONALIDADE: ReadonlyArray<[string, ReadonlyArray<string>]> = [
  ['/api/contas-pagar', ['/contas-pagar', '/fluxo-caixa', '/folha', '/painel-cfo']],
  ['/api/recebiveis-gdf', ['/recebiveis-gdf', '/painel-cfo']],
  ['/api/recebiveis', ['/contas-receber']],
  ['/api/contas-receber', ['/contas-receber', '/fluxo-caixa']],
  ['/api/reembolsos', ['/contas-receber']],
  ['/api/conciliacao', ['/conciliacao']],
  ['/api/folha-detalhe', ['/folha-detalhe']],
  ['/api/folha', ['/folha', '/folha-detalhe', '/painel-cfo']],
  ['/api/tributos', ['/tributos']],
  ['/api/retencoes', ['/tributos', '/contas-pagar']],
  ['/api/depreciacao', ['/depreciacao']],
  ['/api/fluxo-caixa', ['/fluxo-caixa']],
  ['/api/orcamento', ['/orcamento']],
  ['/api/dre', ['/dre']],
  ['/api/painel-cfo', ['/painel-cfo']],
];

function mapearApiParaFuncionalidade(url: string): ReadonlyArray<string> {
  const path = url.split('?')[0] ?? '';
  for (const [prefixo, chaves] of API_PARA_FUNCIONALIDADE) {
    if (path === prefixo || path.startsWith(`${prefixo}/`)) return chaves;
  }
  return [];
}

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
    /**
     * SÓ administrador — sem o fallback da liberação progressiva.
     * Use em ações de infraestrutura (sincronizar com o Globus, etc.): um auditor
     * com a tela liberada passaria por `requireRole('admin')`, porque lá a
     * atribuição sobrepõe o papel. Aqui não sobrepõe nada.
     */
    requireAdmin: preHandlerHookHandler;
    /** Exige uma permissao de funcionalidade (admin sempre passa). Lookup fresco no banco. */
    requirePermissao: (permissao: Permissao) => preHandlerHookHandler;
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
        if (roles.includes(req.user.role)) return; // acesso pelo papel

        // Grant da liberação progressiva: se esta API pertence a uma funcionalidade
        // LIBERADA do usuário (o admin atribuiu), concede — a atribuição sobrepõe o papel.
        const chaves = mapearApiParaFuncionalidade(req.url);
        if (chaves.length > 0) {
          const u = await fastify.db.getRepository(User).findOne({
            where: { id: req.user.sub },
            select: { id: true, liberacaoProgressiva: true, funcionalidadesAtribuidas: true, funcionalidadesValidadas: true },
          });
          if (u?.liberacaoProgressiva) {
            const liberadas = new Set(funcionalidadesLiberadas(u.funcionalidadesAtribuidas ?? [], u.funcionalidadesValidadas ?? []));
            if (chaves.some((c) => liberadas.has(c))) return;
          }
        }
        return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Permissao insuficiente' });
      };
    });

    fastify.decorate('requireAdmin', async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
      try {
        await req.jwtVerify();
      } catch {
        return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Token invalido ou expirado' });
      }
      if (req.user.role !== 'admin') {
        return reply.code(403).send({
          statusCode: 403, error: 'Forbidden',
          message: 'Apenas o administrador pode executar esta ação.',
        });
      }
    });

    fastify.decorate('requirePermissao', function requirePermissao(permissao: Permissao) {
      return async function (req: FastifyRequest, reply: FastifyReply) {
        try {
          await req.jwtVerify();
        } catch {
          return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Token invalido ou expirado' });
        }
        // Admin tem todas as permissoes implicitamente.
        if (req.user.role === 'admin') return;
        // Lookup FRESCO no banco: revogar a permissao vale na hora, sem esperar o token expirar.
        const u = await fastify.db.getRepository(User).findOne({
          where: { id: req.user.sub },
          select: { id: true, permissoes: true },
        });
        if (!u || !u.permissoes?.includes(permissao)) {
          return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Sem permissão para este recurso' });
        }
      };
    });
  },
  { name: 'auth', dependencies: ['config', 'db'] },
);
