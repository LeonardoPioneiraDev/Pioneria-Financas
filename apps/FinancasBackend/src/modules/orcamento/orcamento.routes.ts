import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  OrcamentoBaselineResponseSchema,
  OrcamentoDerivadoResponseSchema,
  OrcamentoSyncResponseSchema,
  OrcamentoMetaResponseSchema,
  OrcamentoAdotarBodySchema,
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
        summary: 'Baseline histórico do orçamento (orçado legado do Globus 2018-2020)',
        description:
          'Lê o único orçado que existe no Globus (CPGORCPREVISOES, empresa 4, 2018-2020; ' +
          'parou em maio/2020). Prova de conceito + isca pro financeiro confirmar eixo e ' +
          'formato do orçamento atual (que não vive no Globus). Ver Leia/orcamento-mapeamento.md.',
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
        summary: 'Orçado DERIVADO do realizado (base técnica projetada — média mensal por setor)',
        description:
          'Projeta um orçado por centro de custo a partir do realizado do Contas a Pagar ' +
          '(média mensal dos últimos N meses, default 12). Estado PROJETADO — sugestão pro ' +
          'financeiro ajustar, nunca orçamento oficial. Mesma lógica de projeção do Fluxo de Caixa.',
        querystring: Type.Object({
          meses: Type.Optional(Type.Integer({ minimum: 1, maximum: 36 })),
        }),
        response: { 200: OrcamentoDerivadoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.derivado(req.query),
  );

  fastify.get(
    '/meta',
    {
      preHandler: [auth],
      schema: {
        tags: ['orcamento'],
        summary: 'Orçado de referência adotado pelo financeiro (meta) por setor',
        response: { 200: OrcamentoMetaResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.metaAtual(),
  );

  fastify.post(
    '/meta',
    {
      preHandler: [auth],
      schema: {
        tags: ['orcamento'],
        summary: 'Adota/ajusta o orçado de referência por setor (a partir da base técnica)',
        description: 'Upsert por centro de custo. O comparativo realizado x orçado passa a usar esta meta.',
        body: OrcamentoAdotarBodySchema,
        response: { 200: OrcamentoMetaResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.adotarMeta({ itens: req.body.itens, usuarioId: req.user.sub }),
  );

  fastify.get(
    '/export',
    {
      preHandler: [auth],
      schema: {
        tags: ['orcamento'],
        summary: 'Exporta o comparativo (orçado x realizado por setor) para Excel (.xlsx)',
        security: [{ bearerAuth: [] }],
      },
    },
    async (_req, reply) => {
      const { buffer, filename } = await service.exportarComparativoXlsx();
      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer);
    },
  );

  fastify.post(
    '/sincronizar',
    {
      // TEMPORÁRIO (fase de desenvolvimento/validação): liberado pra qualquer usuário logado.
      // Reverter para fastify.requireAdmin antes de produção.
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['orcamento'],
        summary: 'Sincroniza o baseline de orçamento do Globus (CPGORCPREVISOES)',
        description: 'Lê o orçado legado (2018-2020) e popula finance.orcamento_previsao. Requer Oracle (Globus).',
        response: { 200: OrcamentoSyncResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    },
    async (req) => service.sincronizar({ usuarioId: req.user.sub }),
  );
};
