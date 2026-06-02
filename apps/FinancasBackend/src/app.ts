import 'reflect-metadata';
import Fastify, { type FastifyInstance } from 'fastify';
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySensible from '@fastify/sensible';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { configPlugin } from '@/plugins/config.js';
import { dbPlugin } from '@/plugins/db.js';
import { authPlugin } from '@/plugins/auth.js';
import { emailPlugin } from '@/plugins/email.js';
import { oraclePlugin } from '@/plugins/oracle.js';
import { horariosClientPlugin } from '@/plugins/horarios-client.js';
import { requestMetricsPlugin } from '@/plugins/request-metrics.js';
import { healthModule } from '@/modules/health/health.routes.js';
import { statusModule } from '@/modules/status/status.routes.js';
import { authModule } from '@/modules/auth/auth.routes.js';
import { passwordsModule } from '@/modules/passwords/passwords.routes.js';
import { usersModule } from '@/modules/users/users.routes.js';
import { metricsModule } from '@/modules/metrics/metrics.routes.js';
import { globusModule } from '@/modules/globus/globus.routes.js';
import { contasPagarModule } from '@/modules/contas-pagar/contas-pagar.routes.js';
import { contasReceberModule } from '@/modules/contas-receber/contas-receber.routes.js';
import { folhaModule } from '@/modules/folha/folha.routes.js';
import { folhaDetalheModule } from '@/modules/folha-detalhe/folha-detalhe.routes.js';
import { auditModule } from '@/modules/audit/audit.routes.js';
import { workflowModule } from '@/modules/workflow/workflow.routes.js';
import { adminIntegracoesModule } from '@/modules/admin-integracoes/admin-integracoes.routes.js';
import { recebiveisGdfModule } from '@/modules/recebiveis-gdf/recebiveis-gdf.routes.js';
import { fluxoCaixaModule } from '@/modules/fluxo-caixa/fluxo-caixa.routes.js';
import { retencoesModule } from '@/modules/retencoes/retencoes.routes.js';
import { reguaCobrancaModule } from '@/modules/regua-cobranca/regua-cobranca.routes.js';
import { boletosPixModule } from '@/modules/boletos-pix/boletos-pix.routes.js';
import { serasaModule } from '@/modules/serasa/serasa.routes.js';
import { conciliacaoModule } from '@/modules/conciliacao/conciliacao.routes.js';
import { tributosModule } from '@/modules/tributos/tributos.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } }
          : undefined,
    },
    trustProxy: process.env.TRUST_PROXY === 'true',
    genReqId: () => crypto.randomUUID(),
  }).withTypeProvider<TypeBoxTypeProvider>();

  await app.register(configPlugin);
  await app.register(fastifySensible);
  await app.register(fastifyHelmet, { contentSecurityPolicy: false });
  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      // Sem Origin (curl, healthcheck, mesmo-origin) → libera.
      if (!origin) return cb(null, true);

      // 1) Lista fixa: APP_URL + localhosts de dev (3002) e Docker app (3000/3001).
      const fixos = [
        app.config.app.url,
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
      ];
      // 2) Lista adicional configurável (CORS_ORIGINS = "url1,url2,...").
      const extras = app.config.app.corsOrigins;
      if ([...fixos, ...extras].includes(origin)) return cb(null, true);

      // 3) Rede privada (RFC1918): libera qualquer IP 10.x / 172.16-31.x / 192.168.x —
      // permite acesso de outras máquinas da rede interna da empresa sem precisar
      // configurar CORS_ORIGINS pra cada IP.
      try {
        const url = new URL(origin);
        const ip = url.hostname;
        const ehRedePrivada =
          /^10\./.test(ip) ||
          /^192\.168\./.test(ip) ||
          /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip);
        if (ehRedePrivada) return cb(null, true);
      } catch {
        // origin não é URL válida — bloqueia
      }

      app.log.warn({ origin }, '[cors] origem bloqueada');
      return cb(new Error('CORS bloqueado'), false);
    },
    credentials: true,
  });
  await app.register(fastifyRateLimit, {
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  });

  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Pioneira Financas API',
        version: '0.0.1',
        description: 'API do sistema financeiro v2 da Viacao Pioneira. Ver pagina visual em /.',
      },
      components: {
        securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      },
    },
  });
  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true, persistAuthorization: true },
  });

  await app.register(dbPlugin);
  await app.register(authPlugin);
  await app.register(emailPlugin);
  await app.register(oraclePlugin);
  await app.register(horariosClientPlugin);
  await app.register(requestMetricsPlugin);

  await app.register(statusModule);
  await app.register(healthModule, { prefix: '/health' });
  await app.register(authModule, { prefix: '/api/auth' });
  await app.register(passwordsModule, { prefix: '/api/passwords' });
  await app.register(usersModule, { prefix: '/api/users' });
  await app.register(metricsModule, { prefix: '/api/metrics' });
  await app.register(globusModule, { prefix: '/api/globus' });
  await app.register(contasPagarModule, { prefix: '/api/contas-pagar' });
  await app.register(contasReceberModule, { prefix: '/api/contas-receber' });
  await app.register(folhaModule, { prefix: '/api/folha' });
  await app.register(folhaDetalheModule, { prefix: '/api/folha-detalhe' });
  await app.register(auditModule, { prefix: '/api/audit' });
  await app.register(workflowModule, { prefix: '/api/workflow' });
  await app.register(adminIntegracoesModule, { prefix: '/api/admin/integracoes' });
  await app.register(recebiveisGdfModule, { prefix: '/api/recebiveis-gdf' });
  await app.register(fluxoCaixaModule, { prefix: '/api/fluxo-caixa' });
  await app.register(retencoesModule, { prefix: '/api/retencoes' });
  await app.register(reguaCobrancaModule, { prefix: '/api/regua-cobranca' });
  await app.register(boletosPixModule, { prefix: '/api/boletos-pix' });
  await app.register(serasaModule, { prefix: '/api/serasa' });
  await app.register(conciliacaoModule, { prefix: '/api/conciliacao' });
  await app.register(tributosModule, { prefix: '/api/tributos' });

  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err, reqId: req.id }, 'Erro nao tratado');
    const statusCode = err.statusCode ?? 500;
    const message = statusCode >= 500 ? 'Erro interno do servidor' : err.message;
    reply.code(statusCode).send({ statusCode, error: err.name, message });
  });

  return app;
}
