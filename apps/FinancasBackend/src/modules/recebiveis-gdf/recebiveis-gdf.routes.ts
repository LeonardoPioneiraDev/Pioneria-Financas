import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  AgingResponseSchema,
  ComposicaoFamiliaQuerySchema,
  ComposicaoFamiliaResponseSchema,
  MapaDiarioQuerySchema,
  MapaDiarioResponseSchema,
  SyncHorariosResponseSchema,
} from '@pioneira/shared';
import { buildRecebiveisGdfService } from './recebiveis-gdf.service.js';

export const recebiveisGdfModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildRecebiveisGdfService(fastify);

  // Acesso: admin, cfo, controller (visao de receita), cr_analista (cobrança)
  const auth = fastify.requireRole('admin', 'cfo', 'controller', 'cr_analista');

  fastify.get(
    '/mapa-diario',
    {
      preHandler: [auth],
      schema: {
        tags: ['recebiveis-gdf'],
        summary: 'Mapa diario: matriz (data_transporte × data_resgate) do Movimento Resgatado BRB',
        querystring: MapaDiarioQuerySchema,
        response: { 200: MapaDiarioResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.mapaDiario(req.query),
  );

  fastify.get(
    '/composicao-familia',
    {
      preHandler: [auth],
      schema: {
        tags: ['recebiveis-gdf'],
        summary: 'Drill-down por familia (pagantes × gratuidades) de UM dia de transporte',
        querystring: ComposicaoFamiliaQuerySchema,
        response: { 200: ComposicaoFamiliaResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.composicaoFamilia(req.query.dataTransporte),
  );

  fastify.get(
    '/aging',
    {
      preHandler: [auth],
      schema: {
        tags: ['recebiveis-gdf'],
        summary: 'Aging por buckets fixos (0-2d, 3-5d, 6-10d, 10+d)',
        querystring: Type.Object({
          dtIni: Type.String({ format: 'date' }),
          dtFim: Type.String({ format: 'date' }),
          familia: Type.Optional(Type.String({ maxLength: 20 })),
        }),
        response: { 200: AgingResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.aging(req.query),
  );

  fastify.get(
    '/familias',
    {
      preHandler: [auth],
      schema: {
        tags: ['recebiveis-gdf'],
        summary: 'Lista mestre de familias (pagantes + gratuidades)',
        response: {
          200: Type.Array(
            Type.Object({
              codigo: Type.String(),
              nome: Type.String(),
              tipo: Type.Union([Type.Literal('pagante'), Type.Literal('gratuidade')]),
              fonteSubsidio: Type.Union([Type.String(), Type.Null()]),
              ordem: Type.Integer(),
            }),
          ),
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarFamilias(),
  );

  fastify.post(
    '/sincronizar',
    {
      preHandler: [fastify.requireRole('admin', 'controller')],
      schema: {
        tags: ['recebiveis-gdf'],
        summary: 'Dispara sync da API horarios + ETL dos relatorios pendentes',
        response: { 200: SyncHorariosResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.sincronizar(req.user.sub),
  );
};
