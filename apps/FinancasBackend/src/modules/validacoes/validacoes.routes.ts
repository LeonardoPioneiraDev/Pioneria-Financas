import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  AvalBodySchema,
  ConferirBodySchema,
  ConferirResponseSchema,
  MinhasValidacoesResponseSchema,
  RegistroValidacaoSchema,
  RelatorioValidacoesQuerySchema,
  RelatorioValidacoesResponseSchema,
  ResponderRessalvaBodySchema,
  ValidacoesResumoResponseSchema,
} from '@pioneira/shared/schemas/validacoes';
import { buildValidacoesService } from './validacoes.service.js';

export const validacoesModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildValidacoesService(fastify);

  fastify.post(
    '/conferir',
    {
      preHandler: [fastify.authRequired],
      // Default do Fastify é 1 MB — insuficiente com os anexos (até 5 x 3 MB em base64).
      bodyLimit: 25 * 1024 * 1024,
      schema: {
        tags: ['validacoes'],
        summary: 'Auditor registra a conferência da funcionalidade atual (validar ou apontar problema)',
        body: ConferirBodySchema,
        response: { 200: ConferirResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.conferir(req.user.sub, req.body),
  );

  fastify.get(
    '/minhas',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['validacoes'],
        summary: 'Histórico de conferências do próprio usuário',
        response: { 200: MinhasValidacoesResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.minhas(req.user.sub),
  );

  fastify.get(
    '/',
    {
      preHandler: [fastify.requireRole('admin', 'cfo')],
      schema: {
        tags: ['validacoes'],
        summary: 'Consolidado das conferências por funcionalidade (CFO vê o já validado; admin vê tudo)',
        response: { 200: ValidacoesResumoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.resumo(req.user.role),
  );

  fastify.get(
    '/relatorio',
    {
      preHandler: [fastify.requireRole('admin', 'cfo')],
      schema: {
        tags: ['validacoes'],
        summary: 'Relatório da trilha: quem validou/apontou/avalizou, quando e o que escreveu',
        querystring: RelatorioValidacoesQuerySchema,
        response: { 200: RelatorioValidacoesResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.relatorio(req.query),
  );

  fastify.get(
    '/relatorio/export',
    {
      preHandler: [fastify.requireRole('admin', 'cfo')],
      schema: {
        tags: ['validacoes'],
        summary: 'Exporta o relatório de validações em Excel (.xlsx), com aba de resumo',
        querystring: RelatorioValidacoesQuerySchema,
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const { buffer, filename } = await service.exportarRelatorioXlsx(req.query);
      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer);
    },
  );

  fastify.post(
    '/aval',
    {
      preHandler: [fastify.requireRole('admin', 'cfo')],
      schema: {
        tags: ['validacoes'],
        summary: 'CFO dá o aval de ciência (ou devolve com ressalva) numa funcionalidade validada',
        body: AvalBodySchema,
        response: { 200: RegistroValidacaoSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.avalizar(req.user.sub, req.body),
  );

  fastify.post(
    '/:id/responder',
    {
      preHandler: [fastify.requireRole('admin')],
      schema: {
        tags: ['validacoes'],
        summary: 'Admin responde a uma ressalva (o que foi corrigido)',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: ResponderRessalvaBodySchema,
        response: { 200: RegistroValidacaoSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.responderRessalva(req.params.id, req.user.sub, req.body.resposta),
  );
};
