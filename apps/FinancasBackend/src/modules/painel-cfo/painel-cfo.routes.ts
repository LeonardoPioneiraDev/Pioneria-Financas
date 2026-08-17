import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { PainelCfoQuerySchema, PainelCfoResponseSchema } from '@pioneira/shared';
import { buildPainelCfoService } from './painel-cfo.service.js';

export const painelCfoModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildPainelCfoService(fastify);

  // Acesso executivo: admin, cfo, auditor (read-only) + controller (financeiro).
  const auth = fastify.requireRole('admin', 'cfo', 'controller', 'auditor');

  fastify.get(
    '/resumo',
    {
      preHandler: [auth],
      schema: {
        tags: ['painel-cfo'],
        summary: 'Painel executivo consolidado — KPIs, alertas e comparativo MoM/YoY',
        description:
          'Consolida Fluxo de Caixa, DRE, Contas a Pagar, Orçamento e Recebíveis GDF. ' +
          'Cada KPI carrega o estado explícito (real/calculado/projetado/sem_dado) e a fonte. ' +
          'Não recalcula regra de negócio — só agrega o que os módulos já produzem.',
        querystring: PainelCfoQuerySchema,
        response: { 200: PainelCfoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.resumo(req.query),
  );

  fastify.get(
    '/export',
    {
      preHandler: [auth],
      schema: {
        tags: ['painel-cfo'],
        summary: 'Exporta o briefing executivo (KPIs + alertas + comparativo) em XLSX',
        querystring: PainelCfoQuerySchema,
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const { buffer, filename } = await service.exportarBriefingXlsx(req.query);
      reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(buffer);
    },
  );
};
