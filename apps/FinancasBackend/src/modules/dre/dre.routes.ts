import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  DreResumoQuerySchema,
  DreResumoResponseSchema,
  DreSyncResponseSchema,
  DreDetalheQuerySchema,
  DreDetalheResponseSchema,
  DreSerieQuerySchema,
  DreSerieResponseSchema,
} from '@pioneira/shared';
import { buildDreService } from './dre.service.js';

export const dreModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildDreService(fastify);
  const auth = fastify.requireRole('admin', 'cfo', 'controller');

  fastify.get(
    '/resumo',
    {
      preHandler: [auth],
      schema: {
        tags: ['dre'],
        summary: 'DRE contábil de uma competência (linhas montadas pela hierarquia do razão)',
        description:
          'Demonstração de Resultado do Exercício, contábil, do razão do Globus ' +
          '(CTBSALDO, plano 1, contas de resultado classe 3/4, só folhas). Fiel ao ' +
          'razão — o repasse/subsídio do GDF não entra como receita operacional aqui.',
        querystring: DreResumoQuerySchema,
        response: { 200: DreResumoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.resumo(req.query),
  );

  fastify.get(
    '/detalhe',
    {
      preHandler: [auth],
      schema: {
        tags: ['dre'],
        summary: 'Detalhe de uma linha da DRE (contas do razão que a compõem)',
        querystring: DreDetalheQuerySchema,
        response: { 200: DreDetalheResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.detalheLinha(req.query),
  );

  fastify.get(
    '/serie',
    {
      preHandler: [auth],
      schema: {
        tags: ['dre'],
        summary: 'Série mensal dos resultados-chave da DRE (para gráfico de evolução)',
        querystring: DreSerieQuerySchema,
        response: { 200: DreSerieResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.serie(req.query),
  );

  fastify.get(
    '/export',
    {
      preHandler: [auth],
      schema: {
        tags: ['dre'],
        summary: 'Exporta a DRE da competência em XLSX',
        querystring: DreResumoQuerySchema,
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const { buffer, filename } = await service.exportarXlsx(req.query);
      reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(buffer);
    },
  );

  fastify.post(
    '/sincronizar',
    {
      // TEMPORÁRIO (fase de desenvolvimento/validação): liberado pra qualquer usuário logado.
      // Reverter para fastify.requireAdmin antes de produção.
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['dre'],
        summary: 'Sincroniza as contas de resultado do razão (CTBSALDO) para a DRE',
        response: { 200: DreSyncResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    },
    async (req) => service.sincronizar({ usuarioId: req.user.sub }),
  );
};
