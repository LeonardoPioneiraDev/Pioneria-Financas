import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  ResumoDepreciacaoQuerySchema,
  ResumoDepreciacaoResponseSchema,
  SerieDepreciacaoQuerySchema,
  SerieDepreciacaoResponseSchema,
  SyncDepreciacaoResponseSchema,
  DetalheClasseQuerySchema,
  DetalheClasseResponseSchema,
  FrotaComposicaoResponseSchema,
} from '@pioneira/shared';
import { buildDepreciacaoService } from './depreciacao.service.js';

export const depreciacaoModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildDepreciacaoService(fastify);

  const auth = fastify.requireRole('admin', 'cfo', 'controller');
  const authWrite = fastify.requireRole('admin', 'cfo', 'controller');

  fastify.get(
    '/resumo',
    {
      preHandler: [auth],
      schema: {
        tags: ['depreciacao'],
        summary: 'Resumo da competência: despesa por classe + base patrimonial acumulada',
        description:
          'Lê a depreciação CONTABILIZADA no Globus (CTBSALDO), por classe de ativo. ' +
          'A Pioneira não usa a rotina de ativo fixo do Globus — a depreciação é ' +
          'calculada em planilha e lançada por classe. Ver Leia/depreciacao-mapeamento.md.',
        querystring: ResumoDepreciacaoQuerySchema,
        response: { 200: ResumoDepreciacaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.resumo(req.query),
  );

  fastify.get(
    '/serie',
    {
      preHandler: [auth],
      schema: {
        tags: ['depreciacao'],
        summary: 'Série mensal da despesa de depreciação (para gráfico)',
        querystring: SerieDepreciacaoQuerySchema,
        response: { 200: SerieDepreciacaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.serie(req.query),
  );

  fastify.get(
    '/detalhe',
    {
      preHandler: [auth],
      schema: {
        tags: ['depreciacao'],
        summary: 'Detalhe de proveniência de uma classe (contas contábeis que compõem o número)',
        description:
          'Retorna as contas do razão (CTBSALDO) que compõem a despesa do mês e a base ' +
          'acumulada de uma classe de ativo, com débito/crédito de cada conta. Serve o ' +
          'drill-down "de onde vem o número" na tela.',
        querystring: DetalheClasseQuerySchema,
        response: { 200: DetalheClasseResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.detalheClasse(req.query),
  );

  fastify.get(
    '/frota',
    {
      preHandler: [auth],
      schema: {
        tags: ['depreciacao'],
        summary: 'Frota física (contexto): contagem de veículos ativos por garagem e tipo',
        description:
          'Snapshot do FRT_CADVEICULOS do Globus (cadastro vivo). Contexto de "quantos ' +
          'veículos" pra tela de Depreciação — separado do valor contábil (CTBSALDO).',
        response: { 200: FrotaComposicaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.frota(),
  );

  fastify.post(
    '/sincronizar',
    {
      // TEMPORÁRIO (fase de desenvolvimento/validação): liberado pra qualquer usuário logado.
      // Reverter para fastify.requireAdmin antes de produção.
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['depreciacao'],
        summary: 'Sincroniza CTBSALDO do Globus (saldo contábil de imobilizado/depreciação)',
        response: { 200: SyncDepreciacaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    },
    async (req) => service.sincronizar({ usuarioId: req.user.sub }),
  );
};
