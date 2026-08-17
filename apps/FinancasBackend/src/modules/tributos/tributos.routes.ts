import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  CalendarioTributarioQuerySchema,
  CalendarioTributarioResponseSchema,
  CoberturaTributariaResponseSchema,
  TributosFolhaQuerySchema,
  TributosFolhaResponseSchema,
  TributosFolhaSyncResponseSchema,
} from '@pioneira/shared/schemas/tributos';
import { buildTributosService } from './tributos.service.js';

export const tributosModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildTributosService(fastify);

  fastify.get(
    '/calendario',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller')],
      schema: {
        tags: ['tributos'],
        summary: 'Calendário tributário (obrigações de referência + guias do mês no banco)',
        description:
          'Obrigações = prazos federais padrão (REFERÊNCIA — confirmar com a contabilidade). ' +
          'Guias = títulos origem=guia com vencimento no mês (dado real do banco local).',
        querystring: CalendarioTributarioQuerySchema,
        response: { 200: CalendarioTributarioResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.calendario(req.query),
  );

  fastify.get(
    '/cobertura',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller')],
      schema: {
        tags: ['tributos'],
        summary: 'Estado das fontes tributárias (transparência: o que o Globus tem e o que falta)',
        description:
          'Mostra, por fonte, se o dado está preenchido no Globus, vazio, ou é feito fora dele. ' +
          'Números de retenção/guia são prova ao vivo do banco local.',
        response: { 200: CoberturaTributariaResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.cobertura(),
  );

  fastify.get(
    '/folha',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller')],
      schema: {
        tags: ['tributos'],
        summary: 'Tributos da folha (INSS, FGTS, IRRF) — o peso tributário que só o CP não mostra',
        description:
          'Agrega INSS/FGTS/IRRF da folha real (finance.ficha_evento) por competência. ' +
          'Valores retido/depositado são certos; o INSS patronal é estimativa marcada (base × alíquota).',
        querystring: TributosFolhaQuerySchema,
        response: { 200: TributosFolhaResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.tributosFolha(req.query),
  );

  fastify.post(
    '/folha/sincronizar',
    {
      // TEMPORÁRIO (fase de desenvolvimento/validação): liberado pra qualquer usuário logado.
      // Reverter para fastify.requireAdmin antes de produção.
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['tributos'],
        summary: 'Sincroniza a GPS da folha (FLP_GPS_INTEGRACPG) — INSS patronal real com/sem desoneração',
        description:
          'Lê o INSS patronal que o Globus calcula (com e sem desoneração) e popula ' +
          'finance.folha_gps. Troca a estimativa de 28,8% do painel pelo valor real. ' +
          'Requer Oracle (Globus) disponível.',
        response: { 200: TributosFolhaSyncResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    },
    async (req) => service.sincronizarFolhaGps({ usuarioId: req.user.sub }),
  );
};
