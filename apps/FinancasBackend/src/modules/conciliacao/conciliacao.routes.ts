import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  ConciliacaoCandidatosResponseSchema,
  ConciliacaoDashboardSchema,
  ConciliacaoResponseSchema,
  ConciliacoesListResponseSchema,
  ConciliarManualBodySchema,
  ContasBancariasResponseSchema,
  ExtratoMensalQuerySchema,
  ExtratoMensalResponseSchema,
  MovimentosQuerySchema,
  MovimentosResponseSchema,
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
        summary: 'Dashboard com totais (movtos, conciliações, valores)',
        response: { 200: ConciliacaoDashboardSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.dashboard(),
  );

  fastify.get(
    '/extrato-mensal',
    {
      preHandler: [authL],
      schema: {
        tags: ['conciliacao'],
        summary: 'Extrato: entrou x saiu por mês (transferências entre contas próprias à parte)',
        querystring: ExtratoMensalQuerySchema,
        response: { 200: ExtratoMensalResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.extratoMensal(req.query),
  );

  fastify.post(
    '/reconciliar-banco',
    {
      // TEMPORÁRIO (fase de desenvolvimento/validação): liberado pra qualquer usuário logado.
      // Reverter para fastify.requireAdmin antes de produção.
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['conciliacao'],
        summary: 'Reconcilia o extrato: baixa movimentos cancelados no Globus e puxa os títulos que faltam',
        description:
          'Automático, sem pareamento manual. (A) marca excluído o que o Globus cancelou depois de sincronizado; ' +
          '(B) puxa por CODMOVTOBCO os títulos de CP que a janela de sync não trouxe. Carga do Globus — só admin.',
        response: {
          200: Type.Object({
            status: Type.String(),
            movimentosVerificados: Type.Integer(),
            cancelados: Type.Integer(),
            titulosPuxados: Type.Integer(),
            duracaoMs: Type.Integer(),
          }),
        },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    },
    async (req) => service.reconciliarBanco(req.user.sub),
  );

  fastify.post(
    '/sugerir',
    {
      preHandler: [authW],
      schema: {
        tags: ['conciliacao'],
        summary: 'Roda auto-match e cria sugestões (data +/-3d + valor exato)',
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
        summary: 'Auto-match por agregação (borderô): N títulos somando = 1 movto banco',
        description:
          'Para cada movto banco sem par, busca subconjunto de CPs/CRs cuja SOMA bate. ' +
          'Cria 1 conciliação sugerida por item do subset (todas referenciando o mesmo movto). ' +
          'Min 2 items por subset, max 5. Tolerância +/- 1 centavo.',
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
        summary: 'Lista sugestões pendentes (status=sugerido)',
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
        summary: 'Lista conciliações confirmadas (últimas 100)',
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
        summary: 'Contas bancárias com saldo e agregados de movimentos (total/conciliados/sem par)',
        response: { 200: ContasBancariasResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarContas(),
  );

  fastify.get(
    '/movimentos',
    {
      preHandler: [authL],
      schema: {
        tags: ['conciliacao'],
        summary: 'Visão Globus (só leitura): lançamentos do banco + título(s) que o Globus vinculou',
        description:
          'Mostra a conciliação que VEM do Globus (flag conciliado + vínculo cod_movto_bco -> CP). ' +
          'Sem matching nosso. status=identificados|nao_identificados, filtros conta/busca, paginado.',
        querystring: MovimentosQuerySchema,
        response: { 200: MovimentosResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listarMovimentos(req.query),
  );

  fastify.get(
    '/sem-par',
    {
      preHandler: [authL],
      schema: {
        tags: ['conciliacao'],
        summary: 'Movimentos banco sem par (não conciliados e sem sugestão ativa)',
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
        summary: 'Candidatos (CP/CR) pra conciliação manual de um movto banco',
        description:
          'Sem busca: títulos com valor ±10% e data ±30d do movto. ' +
          'Com q (>=2 chars): casa por nº do documento ou razão social, ignorando valor/data. ' +
          'Devolve CP e CR (o sentido D/C não vem do Globus). Ordenado por proximidade de valor.',
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
        summary: 'Concilia manualmente um movto banco a um título (CP/CR)',
        description:
          'Cria conciliação tipo=manual já confirmada (score 100) e marca o movto como conciliado. ' +
          'Bloqueia se o movto já tem conciliação ativa.',
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
        summary: 'Confirma sugestão (marca movto como conciliado)',
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
        summary: 'Rejeita sugestão (falso-positivo)',
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
