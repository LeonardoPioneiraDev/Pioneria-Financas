import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  FolhaCompetenciasQuerySchema,
  FolhaCompetenciasResponseSchema,
  FolhaEncargosQuerySchema,
  FolhaEncargosResponseSchema,
  FolhaEventoDetalheQuerySchema,
  FolhaEventoDetalheResponseSchema,
} from '@pioneira/shared/schemas/folha';
import { buildFolhaService } from './folha.service.js';

export const folhaModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildFolhaService(fastify);

  fastify.get(
    '/competencias',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'rh')],
      schema: {
        tags: ['folha'],
        summary: 'Folha consolidada por competência (agregada do CPG)',
        description:
          'Agrega os títulos com origem_documento=folha por competencia_flp. ' +
          'Para detalhamento por funcionário/rubrica (F2 do roadmap), aguardar integração com FLP_FUNCIONARIOS.',
        querystring: FolhaCompetenciasQuerySchema,
        response: { 200: FolhaCompetenciasResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listarCompetencias(req.query),
  );

  fastify.get(
    '/encargos',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'rh')],
      schema: {
        tags: ['folha'],
        summary: 'Encargos e benefícios da folha real (FLP) por competência',
        description:
          'Agrega finance.ficha_evento por evento e monta as categorias (INSS/FGTS/IRRF, ' +
          'benefícios, descontos/repasses). Fonte: folha do RH (FLP), já sincronizada pelo ' +
          'módulo folha-detalhe. Cada número é rastreável até o evento (verba) de origem.',
        querystring: FolhaEncargosQuerySchema,
        response: { 200: FolhaEncargosResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listarEncargos(req.query),
  );

  fastify.get(
    '/encargos/evento',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'rh')],
      schema: {
        tags: ['folha'],
        summary: 'Detalhe de uma verba: funcionários que a compõem (LGPD)',
        description:
          'Lista os funcionários que compõem um evento (verba) da folha na competência/tipo, ' +
          'com valor individual. DADO SENSÍVEL — acesso registrado na trilha de auditoria.',
        querystring: FolhaEventoDetalheQuerySchema,
        response: { 200: FolhaEventoDetalheResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.detalharEvento(req.query),
  );
};
