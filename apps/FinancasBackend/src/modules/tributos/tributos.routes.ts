import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  CalendarioTributarioQuerySchema,
  CalendarioTributarioResponseSchema,
  CoberturaTributariaResponseSchema,
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
};
