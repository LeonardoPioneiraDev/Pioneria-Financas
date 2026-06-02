import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  ContaBancariaSchema,
  ListarContasResponseSchema,
  ProjecaoQuerySchema,
  ProjecaoResponseSchema,
  SaldoDiarioQuerySchema,
  SaldoDiarioResponseSchema,
  SetAncoraSaldoBodySchema,
  SyncFluxoCaixaResponseSchema,
} from '@pioneira/shared';
import { buildFluxoCaixaService } from './fluxo-caixa.service.js';

export const fluxoCaixaModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildFluxoCaixaService(fastify);

  // Acesso: admin, cfo, controller, tesoureiro
  const auth = fastify.requireRole('admin', 'cfo', 'controller');
  const authWrite = fastify.requireRole('admin', 'cfo', 'controller');

  fastify.get(
    '/contas',
    {
      preHandler: [auth],
      schema: {
        tags: ['fluxo-caixa'],
        summary: 'Lista contas bancarias sincronizadas + status da ancora de saldo',
        response: { 200: ListarContasResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarContas(),
  );

  fastify.patch(
    '/contas/:id/ancora-saldo',
    {
      preHandler: [authWrite],
      schema: {
        tags: ['fluxo-caixa'],
        summary: 'Define o saldo conhecido da conta (preenchimento manual do tesoureiro)',
        description:
          'Como a coluna SALDO_ACM_ATE_DATA do Globus esta abandonada, o tesoureiro ' +
          'precisa digitar o saldo real consultado no banco. A partir dessa data, o ' +
          'sistema soma BCOMOVTO pra calcular saldo dia-a-dia.',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: SetAncoraSaldoBodySchema,
        response: { 200: ContaBancariaSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.setAncoraSaldo(req.params.id, req.body, req.user.sub),
  );

  fastify.patch(
    '/contas/:id/principal',
    {
      preHandler: [authWrite],
      schema: {
        tags: ['fluxo-caixa'],
        summary: 'Marca/desmarca conta como principal (afeta destaque na UI)',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        body: Type.Object({ ehPrincipal: Type.Boolean() }),
        response: { 200: ContaBancariaSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.setEhPrincipal(req.params.id, req.body.ehPrincipal),
  );

  fastify.get(
    '/saldo-diario',
    {
      preHandler: [auth],
      schema: {
        tags: ['fluxo-caixa'],
        summary: 'Saldo dia-a-dia calculado on-the-fly (ancora + somatorio BCOMOVTO)',
        description:
          'Se contaId omitido, retorna serie consolidada das contas principais. ' +
          'Se incluirSecundarias=true, soma todas. Contas sem ancora sao ignoradas.',
        querystring: SaldoDiarioQuerySchema,
        response: { 200: SaldoDiarioResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.saldoDiario(req.query),
  );

  fastify.get(
    '/projecao',
    {
      preHandler: [auth],
      schema: {
        tags: ['fluxo-caixa'],
        summary: 'Projecao 30/60/90d combinando saldo atual + CR + CP + inadimplencia historica',
        description:
          'Calcula entradas (CR vencendo, ajustadas por inadimplencia historica dos ' +
          'ultimos 6 meses) menos saidas (CP vencendo) por dia, somando ao saldo atual. ' +
          'Detecta dias com gap (saldo acumulado < 0) e retorna serie pra grafico.',
        querystring: ProjecaoQuerySchema,
        response: { 200: ProjecaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.projecao(req.query),
  );

  fastify.post(
    '/sincronizar',
    {
      preHandler: [authWrite],
      schema: {
        tags: ['fluxo-caixa'],
        summary: 'Sync completo: cadastro BCOCONTA + movimentacao BCOMOVTO do mes',
        response: { 200: SyncFluxoCaixaResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    },
    async (req) => service.sincronizar({ usuarioId: req.user.sub }),
  );
};
