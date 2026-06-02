import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  SetorFolhaQuerySchema,
  SetorFolhaResponseSchema,
  FuncionariosQuerySchema,
  FuncionariosResponseSchema,
  ContraChequeQuerySchema,
  ContraChequeResponseSchema,
  SyncFlpBodySchema,
  SyncFlpResponseSchema,
  DiagnosticoFlpResponseSchema,
} from '@pioneira/shared/schemas/folha-detalhe';
import { buildFolhaDetalheService } from './folha-detalhe.service.js';

export const folhaDetalheModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildFolhaDetalheService(fastify);

  fastify.get(
    '/setores',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'rh')],
      schema: {
        tags: ['folha-detalhe'],
        summary: 'Folha consolidada por setor (CODAREA/DESCAREA)',
        querystring: SetorFolhaQuerySchema,
        response: { 200: SetorFolhaResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listarPorSetor(req.query),
  );

  fastify.get(
    '/funcionarios',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'rh')],
      schema: {
        tags: ['folha-detalhe'],
        summary: 'Funcionários da competência com sumário (paginado)',
        querystring: FuncionariosQuerySchema,
        response: { 200: FuncionariosResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listarFuncionarios(req.query),
  );

  fastify.get(
    '/contra-cheque/:codFunc',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'rh')],
      schema: {
        tags: ['folha-detalhe'],
        summary: 'Contra-cheque (holerite) individual do funcionário',
        params: Type.Object({ codFunc: Type.String({ minLength: 1, maxLength: 40 }) }),
        querystring: ContraChequeQuerySchema,
        response: { 200: ContraChequeResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.contraCheque(req.params.codFunc, req.query),
  );

  fastify.get(
    '/eventos',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'rh')],
      schema: {
        tags: ['folha-detalhe'],
        summary: 'Catálogo de eventos (verbas) da folha',
        response: {
          200: Type.Array(Type.Object({
            codEvento: Type.Integer(),
            descricao: Type.String(),
            tipo: Type.Union([Type.Literal('P'), Type.Literal('D'), Type.Literal('B')]),
            grupo: Type.Union([Type.String(), Type.Null()]),
          })),
        },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarEventos(),
  );

  fastify.get(
    '/diagnostico',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'rh')],
      schema: {
        tags: ['folha-detalhe'],
        summary: 'Estado da integração FLP — stage, canonical, competências disponíveis, último job',
        response: { 200: DiagnosticoFlpResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.diagnostico(),
  );

  fastify.post(
    '/sync',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'rh')],
      schema: {
        tags: ['folha-detalhe'],
        summary: 'Sincroniza FLP do Globus (funcionários + eventos + ficha) e roda ETL',
        body: SyncFlpBodySchema,
        response: { 200: SyncFlpResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    },
    async (req) => service.sincronizar(req.body, req.user.sub),
  );
};
