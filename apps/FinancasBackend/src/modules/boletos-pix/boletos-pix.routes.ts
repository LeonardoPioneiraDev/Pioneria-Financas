import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  BoletoEmitidoSchema,
  BoletosListResponseSchema,
  ElegiveisBoletosResponseSchema,
  EmitirBoletoBodySchema,
  EmitirPixBodySchema,
} from '@pioneira/shared';
import { buildBoletosPixService } from './boletos-pix.service.js';

export const boletosPixModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildBoletosPixService(fastify);
  const authL = fastify.requireRole('admin', 'cfo', 'controller');
  const authW = fastify.requireRole('admin', 'cfo', 'controller');

  fastify.get(
    '/elegiveis',
    {
      preHandler: [authL],
      schema: {
        tags: ['boletos-pix'],
        summary: 'CRs elegiveis pra emitir boleto/PIX (status aberto/renegociado)',
        response: { 200: ElegiveisBoletosResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarElegiveis(),
  );

  fastify.get(
    '/ultimos',
    {
      preHandler: [authL],
      schema: {
        tags: ['boletos-pix'],
        summary: 'Ultimos 50 boletos/PIX emitidos',
        response: { 200: BoletosListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarUltimos(),
  );

  fastify.get(
    '/cr/:id',
    {
      preHandler: [authL],
      schema: {
        tags: ['boletos-pix'],
        summary: 'Lista boletos/PIX emitidos pra um CR especifico',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: BoletosListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listarDoCr(req.params.id),
  );

  fastify.post(
    '/emitir-boleto',
    {
      preHandler: [authW],
      schema: {
        tags: ['boletos-pix'],
        summary: 'Emite boleto MOCK (sem integracao banco real)',
        body: EmitirBoletoBodySchema,
        response: { 200: BoletoEmitidoSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req) => service.emitirBoleto({ body: req.body, usuarioId: req.user.sub }),
  );

  fastify.post(
    '/emitir-pix',
    {
      preHandler: [authW],
      schema: {
        tags: ['boletos-pix'],
        summary: 'Emite PIX MOCK (sem integracao banco real)',
        body: EmitirPixBodySchema,
        response: { 200: BoletoEmitidoSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req) => service.emitirPix({ body: req.body, usuarioId: req.user.sub }),
  );
};
