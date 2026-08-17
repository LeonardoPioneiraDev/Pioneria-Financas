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
  CenariosQuerySchema,
  CenariosResponseSchema,
  RealizadoEntradasQuerySchema,
  RealizadoEntradasResponseSchema,
  FluxoRealizadoQuerySchema,
  FluxoRealizadoResponseSchema,
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
        summary: 'Lista contas bancárias sincronizadas + status da âncora de saldo',
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
          'Como a coluna SALDO_ACM_ATE_DATA do Globus está abandonada, o tesoureiro ' +
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
        summary: 'Saldo dia-a-dia calculado on-the-fly (âncora + somatório BCOMOVTO)',
        description:
          'Se contaId omitido, retorna série consolidada das contas principais. ' +
          'Se incluirSecundarias=true, soma todas. Contas sem âncora são ignoradas.',
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
        summary: 'Projeção 30/60/90d combinando saldo atual + CR + CP + inadimplência histórica',
        description:
          'Calcula entradas (CR vencendo, ajustadas por inadimplência histórica dos ' +
          'últimos 6 meses) menos saídas (CP vencendo) por dia, somando ao saldo atual. ' +
          'Detecta dias com gap (saldo acumulado < 0) e retorna série pra gráfico.',
        querystring: ProjecaoQuerySchema,
        response: { 200: ProjecaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.projecao(req.query),
  );

  fastify.get(
    '/cenarios',
    {
      preHandler: [auth],
      schema: {
        tags: ['fluxo-caixa'],
        summary: 'Cenários otimista/realista/pessimista (mesmo motor da projeção, premissas derivadas da variação mensal real)',
        description:
          'Roda a projeção 3x variando inadimplência (menor/maior mês) e repasse GDF ' +
          '(melhor/pior mês do extrato) dos últimos 6 meses. CR/CP/folha são os mesmos nos 3.',
        querystring: CenariosQuerySchema,
        response: { 200: CenariosResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.cenarios(req.query),
  );

  fastify.get(
    '/realizado',
    {
      preHandler: [auth],
      schema: {
        tags: ['fluxo-caixa'],
        summary: 'O que JÁ entrou — créditos reais do extrato nos últimos N dias (GDF + outros)',
        description:
          'Ponte com o realizado (Recebíveis): total de créditos que caíram no banco no ' +
          'período, separando o repasse GDF (eh_repasse_brb) do resto. Detalhe por origem no Recebíveis.',
        querystring: RealizadoEntradasQuerySchema,
        response: { 200: RealizadoEntradasResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.realizadoEntradas(req.query),
  );

  fastify.get(
    '/fluxo-realizado',
    {
      preHandler: [auth],
      schema: {
        tags: ['fluxo-caixa'],
        summary: 'Fluxo REALIZADO por período — entrou x saiu de fato no extrato',
        description:
          'O que efetivamente entrou (créditos) e saiu (débitos) do extrato bancário ' +
          '(banco_movto) no período. Não é projeção — é o realizado, pra períodos passados.',
        querystring: FluxoRealizadoQuerySchema,
        response: { 200: FluxoRealizadoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.fluxoRealizado(req.query),
  );

  fastify.post(
    '/sincronizar',
    {
      // TEMPORÁRIO (fase de desenvolvimento/validação): liberado pra qualquer usuário logado.
      // Reverter para fastify.requireAdmin antes de produção.
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['fluxo-caixa'],
        summary: 'Sync completo: cadastro BCOCONTA + movimentação BCOMOVTO do mês',
        response: { 200: SyncFluxoCaixaResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    },
    async (req) => service.sincronizar({ usuarioId: req.user.sub }),
  );
};
