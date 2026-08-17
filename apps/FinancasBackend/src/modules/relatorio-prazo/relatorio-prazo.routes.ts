import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { RelatorioPrazoResponseSchema } from '@pioneira/shared';
import { buildRelatorioPrazoService } from './relatorio-prazo.service.js';

export const relatorioPrazoModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildRelatorioPrazoService(fastify);
  const auth = fastify.requireRole('admin', 'cfo', 'auditor', 'controller');

  fastify.get(
    '/',
    {
      preHandler: [auth],
      schema: {
        tags: ['relatorio-prazo'],
        summary: 'Linha do tempo do projeto — da ideia até a produção',
        description:
          'Dados medidos, não estimados: datas das fases, registros de conferência do banco e ' +
          'a base da projeção de quanto falta. O catálogo de módulos é cruzado no frontend.',
        response: { 200: RelatorioPrazoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.obter(),
  );
};
