import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  FolhaCompetenciasQuerySchema,
  FolhaCompetenciasResponseSchema,
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
        summary: 'Folha consolidada por competencia (agregada do CPG)',
        description:
          'Agrega os titulos com origem_documento=folha por competencia_flp. ' +
          'Para detalhamento por funcionario/rubrica (F2 do roadmap), aguardar integracao com FLP_FUNCIONARIOS.',
        querystring: FolhaCompetenciasQuerySchema,
        response: { 200: FolhaCompetenciasResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listarCompetencias(req.query),
  );
};
