import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  ConciliacaoCandidatosResponseSchema,
  ConciliacaoDashboardSchema,
  ConciliacaoResponseSchema,
  ConciliacoesListResponseSchema,
  ConciliarManualBodySchema,
  ContasBancariasResponseSchema,
  SemParResponseSchema,
  SugerirAgregacaoResponseSchema,
  SugerirResponseSchema,
} from '@pioneira/shared';
import { buildConciliacaoService } from './conciliacao.service.js';

export const conciliacaoModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildConciliacaoService(fastify);
  const authL = fastify.requireRole('admin', 'cfo', 'controller');
  const authW = fastify.requireRole('admin', 'cfo', 'controller');

  fastify.get(
    '/dashboard',
    {
      preHandler: [authL],
      schema: {
        tags: ['conciliacao'],
        summary: 'Dashboard com totais (movtos, conciliacoes, valores)',
        response: { 200: ConciliacaoDashboardSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.dashboard(),
  );

  fastify.post(
    '/sugerir',
    {
      preHandler: [authW],
      schema: {
        tags: ['conciliacao'],
        summary: 'Roda auto-match e cria sugestoes (data +/-3d + valor exato)',
        response: { 200: SugerirResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
    },
    async () => service.sugerir(),
  );

  fastify.post(
    '/sugerir-agregacao',
    {
      preHandler: [authW],
      schema: {
        tags: ['conciliacao'],
        summary: 'Auto-match por agregacao (borderô): N titulos somando = 1 movto banco',
        description:
          'Para cada movto banco sem par, busca subconjunto de CPs/CRs cuja SOMA bate. ' +
          'Cria 1 conciliacao sugerida por item do subset (todas referenciando o mesmo movto). ' +
          'Min 2 items por subset, max 5. Tolerancia +/- 1 centavo.',
        response: { 200: SugerirAgregacaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    },
    async () => service.sugerirAgregacao(),
  );

  fastify.get(
    '/sugestoes',
    {
      preHandler: [authL],
      schema: {
        tags: ['conciliacao'],
        summary: 'Lista sugestoes pendentes (status=sugerido)',
        response: { 200: ConciliacoesListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarSugestoes(),
  );

  fastify.get(
    '/confirmadas',
    {
      preHandler: [authL],
      schema: {
        tags: ['conciliacao'],
        summary: 'Lista conciliacoes confirmadas (ultimas 100)',
        response: { 200: ConciliacoesListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarConfirmadas(),
  );

  fastify.get(
    '/contas',
    {
      preHandler: [authL],
      schema: {
        tags: ['conciliacao'],
        summary: 'Contas bancarias com saldo e agregados de movimentos (total/conciliados/sem par)',
        response: { 200: ContasBancariasResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarContas(),
  );

  fastify.get(
    '/sem-par',
    {
      preHandler: [authL],
      schema: {
        tags: ['conciliacao'],
        summary: 'Movimentos banco sem par (nao conciliados e sem sugestao ativa)',
        response: { 200: SemParResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.semPar(),
  );

  fastify.get(
    '/candidatos/:movtoId',
    {
      preHandler: [authL],
      schema: {
        tags: ['conciliacao'],
        summary: 'Candidatos (CP/CR) pra conciliacao manual de um movto banco',
        description:
          'Sem busca: titulos com valor ±10% e data ±30d do movto. ' +
          'Com q (>=2 chars): casa por nº do documento ou razao social, ignorando valor/data. ' +
          'Devolve CP e CR (o sentido D/C nao vem do Globus). Ordenado por proximidade de valor.',
        params: Type.Object({ movtoId: Type.String({ format: 'uuid' }) }),
        querystring: Type.Object({ q: Type.Optional(Type.String({ maxLength: 100 })) }),
        response: { 200: ConciliacaoCandidatosResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.buscarCandidatos({ movtoId: req.params.movtoId, q: req.query.q }),
  );

  fastify.post(
    '/manual',
    {
      preHandler: [authW],
      schema: {
        tags: ['conciliacao'],
        summary: 'Concilia manualmente um movto banco a um titulo (CP/CR)',
        description:
          'Cria conciliacao tipo=manual ja confirmada (score 100) e marca o movto como conciliado. ' +
          'Bloqueia se o movto ja tem conciliacao ativa.',
        body: ConciliarManualBodySchema,
        response: { 200: ConciliacaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) =>
      service.conciliarManual({
        bancoMovtoId: req.body.bancoMovtoId,
        tipo: req.body.tipo,
        tituloId: req.body.tituloId,
        observacao: req.body.observacao,
        usuarioId: req.user.sub,
      }),
  );

  fastify.post(
    '/confirmar/:id',
    {
      preHandler: [authW],
      schema: {
        tags: ['conciliacao'],
        summary: 'Confirma sugestao (marca movto como conciliado)',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: ConciliacaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.confirmar({ id: req.params.id, usuarioId: req.user.sub }),
  );

  fastify.post(
    '/rejeitar/:id',
    {
      preHandler: [authW],
      schema: {
        tags: ['conciliacao'],
        summary: 'Rejeita sugestao (falso-positivo)',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: Type.Object({ motivo: Type.Optional(Type.String({ maxLength: 500 })) }),
        response: { 200: ConciliacaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) =>
      service.rejeitar({ id: req.params.id, usuarioId: req.user.sub, motivo: req.body.motivo }),
  );
};
