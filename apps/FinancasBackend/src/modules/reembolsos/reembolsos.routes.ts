import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  AtualizarReembolsoBodySchema,
  CriarReembolsoBodySchema,
  DescartarCandidatoBodySchema,
  ReceberReembolsoBodySchema,
  ReembolsoCandidatosQuerySchema,
  ReembolsoCandidatosResponseSchema,
  ReembolsoCreditosCandidatosResponseSchema,
  ReembolsoListQuerySchema,
  ReembolsoListResponseSchema,
  ReembolsoResponseSchema,
} from '@pioneira/shared';
import { buildReembolsosService } from './reembolsos.service.js';

export const reembolsosModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildReembolsosService(fastify);
  const auth = fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista');
  const idParam = Type.Object({ id: Type.String({ format: 'uuid' }) });

  fastify.get(
    '/',
    {
      preHandler: [auth],
      schema: {
        tags: ['reembolsos'],
        summary: 'Lista reembolsos (valores a receber de terceiros) + totais a receber/recebido',
        querystring: ReembolsoListQuerySchema,
        response: { 200: ReembolsoListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listar(req.query),
  );

  fastify.get(
    '/candidatos',
    {
      preHandler: [auth],
      schema: {
        tags: ['reembolsos'],
        summary: 'Títulos do Contas a Pagar que parecem ressarcíveis (heurística) e ainda não viraram reembolso',
        querystring: ReembolsoCandidatosQuerySchema,
        response: { 200: ReembolsoCandidatosResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.candidatos(req.query),
  );

  fastify.post(
    '/',
    {
      preHandler: [auth],
      schema: {
        tags: ['reembolsos'],
        summary: 'Cria um reembolso a partir de um título do Contas a Pagar (confirma candidato)',
        body: CriarReembolsoBodySchema,
        response: { 201: ReembolsoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const r = await service.criar(req.body, req.user.sub);
      return reply.code(201).send(r);
    },
  );

  fastify.post(
    '/descartar',
    {
      preHandler: [auth],
      schema: {
        tags: ['reembolsos'],
        summary: 'Descarta um candidato (marca que NÃO é reembolso — some dos candidatos)',
        body: DescartarCandidatoBodySchema,
        response: { 200: ReembolsoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.descartarCandidato(req.body, req.user.sub),
  );

  fastify.get(
    '/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['reembolsos'],
        summary: 'Detalhe de um reembolso',
        params: idParam,
        response: { 200: ReembolsoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.detalhe(req.params.id),
  );

  fastify.patch(
    '/:id',
    {
      preHandler: [auth],
      schema: {
        tags: ['reembolsos'],
        summary: 'Atualiza um reembolso (status, devedor, valor, motivo, previsão)',
        params: idParam,
        body: AtualizarReembolsoBodySchema,
        response: { 200: ReembolsoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.atualizar(req.params.id, req.body),
  );

  fastify.post(
    '/:id/receber',
    {
      preHandler: [auth],
      schema: {
        tags: ['reembolsos'],
        summary: 'Baixa: marca recebido (data + valor) e, opcionalmente, amarra ao crédito do extrato',
        params: idParam,
        body: ReceberReembolsoBodySchema,
        response: { 200: ReembolsoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.receber(req.params.id, req.body, req.user.sub),
  );

  fastify.get(
    '/:id/creditos-candidatos',
    {
      preHandler: [auth],
      schema: {
        tags: ['reembolsos'],
        summary: 'Créditos do extrato (banco_movto) candidatos a amarrar na baixa (mesmo valor, não usados)',
        params: idParam,
        response: { 200: ReembolsoCreditosCandidatosResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.creditosCandidatos(req.params.id),
  );

  fastify.delete(
    '/:id',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller')],
      schema: {
        tags: ['reembolsos'],
        summary: 'Remove (soft delete) um reembolso',
        params: idParam,
        response: { 200: Type.Object({ ok: Type.Literal(true) }) },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.excluir(req.params.id),
  );
};
