import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  OrcamentoBaselineResponseSchema,
  OrcamentoDerivadoResponseSchema,
  OrcamentoSyncResponseSchema,
} from '@pioneira/shared';
import { buildOrcamentoService } from './orcamento.service.js';

export const orcamentoModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildOrcamentoService(fastify);

  const auth = fastify.requireRole('admin', 'cfo', 'controller');

  fastify.get(
    '/baseline',
    {
      preHandler: [auth],
      schema: {
        tags: ['orcamento'],
        summary: 'Baseline historico do orcamento (orcado legado do Globus 2018-2020)',
        description:
          'Le o unico orcado que existe no Globus (CPGORCPREVISOES, empresa 4, 2018-2020; ' +
          'parou em maio/2020). Prova de conceito + isca pro financeiro confirmar eixo e ' +
          'formato do orcamento atual (que nao vive no Globus). Ver Leia/orcamento-mapeamento.md.',
        response: { 200: OrcamentoBaselineResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.baseline(),
  );

  fastify.get(
    '/derivado',
    {
      preHandler: [auth],
      schema: {
        tags: ['orcamento'],
        summary: 'Orcado DERIVADO do realizado (base tecnica projetada — media mensal por setor)',
        description:
          'Projeta um orcado por centro de custo a partir do realizado do Contas a Pagar ' +
          '(media mensal dos ultimos N meses, default 12). Estado PROJETADO — sugestao pro ' +
          'financeiro ajustar, nunca orcamento oficial. Mesma logica de projecao do Fluxo de Caixa.',
        querystring: Type.Object({
          meses: Type.Optional(Type.Integer({ minimum: 1, maximum: 36 })),
        }),
        response: { 200: OrcamentoDerivadoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.derivado(req.query),
  );

  fastify.post(
    '/sincronizar',
    {
      preHandler: [auth],
      schema: {
        tags: ['orcamento'],
        summary: 'Sincroniza o baseline de orcamento do Globus (CPGORCPREVISOES)',
        description: 'Le o orcado legado (2018-2020) e popula finance.orcamento_previsao. Requer Oracle (Globus).',
        response: { 200: OrcamentoSyncResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    },
    async (req) => service.sincronizar({ usuarioId: req.user.sub }),
  );
};
