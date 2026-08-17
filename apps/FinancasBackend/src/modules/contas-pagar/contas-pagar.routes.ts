import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  AnalisePrazoRequestSchema,
  AnalisePrazoResponseSchema,
  ContaPagarListQuerySchema,
  ContaPagarListResponseSchema,
  DevolucaoComprovanteResponseSchema,
  MovimentoBancoQuerySchema,
  MovimentoBancoResponseSchema,
  PagamentoGrupoResponseSchema,
  RemessaGrupoResponseSchema,
  SubstituicaoCadeiaResponseSchema,
  SumarioContasPagarRequestSchema,
  SumarioContasPagarResponseSchema,
  SyncContasPagarRequestSchema,
  SyncResponseSchema,
  SyncInfoSchema,
  SetorCpListResponseSchema,
} from '@pioneira/shared/schemas/contas-pagar';
import { CpEventosResponseSchema } from '@pioneira/shared/schemas/cp-eventos';
import { CpConferenciaQuerySchema, CpConferenciaResponseSchema } from '@pioneira/shared/schemas/cp-conferencia';
import { buildContasPagarService } from './contas-pagar.service.js';

export const contasPagarModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildContasPagarService(fastify);

  fastify.get(
    '/',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Lista contas a pagar do banco local (Postgres)',
        description: 'Lê sempre do PostgreSQL local. Para popular, use POST /sync.',
        querystring: ContaPagarListQuerySchema,
        response: { 200: ContaPagarListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.listar(req.query),
  );

  fastify.get(
    '/export',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Exporta a listagem filtrada para Excel (.xlsx) formatado',
        description: 'Mesmos filtros da listagem (sem paginação). Cabeçalho colorido, autofiltro, moeda e substituídos destacados.',
        querystring: ContaPagarListQuerySchema,
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const { buffer, filename } = await service.exportarXlsx(req.query);
      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(buffer);
    },
  );

  fastify.get(
    '/sumario',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Sumário consolidado (totais, por status, vencidos, top fornecedores)',
        querystring: SumarioContasPagarRequestSchema,
        response: { 200: SumarioContasPagarResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.sumario(req.query),
  );

  fastify.get(
    '/analise-prazo',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Análise de prazo dos títulos (incluídos por mês, prazo > 30 dias, vencidos não pagos)',
        description:
          'Prazo = vencimento − emissão. Retorna a série de títulos incluídos por mês, a ' +
          'distribuição por faixa de prazo, e o alerta de títulos com prazo > 30 dias que ' +
          'já venceram sem pagamento. Mesmos filtros da listagem/sumário.',
        querystring: AnalisePrazoRequestSchema,
        response: { 200: AnalisePrazoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.analisePrazo(req.query),
  );

  fastify.get(
    '/movimento-banco',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Detalhe dos movimentos bancários (saídas) do período de pagamento',
        description:
          'Lista cada lançamento do extrato (BCOMOVTO) que compõe o "Total movimento" / ' +
          '"Direto no banco", classificado em pagamento_cp / despesa / financeiro.',
        querystring: MovimentoBancoQuerySchema,
        response: { 200: MovimentoBancoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.movimentoBanco(req.query),
  );

  fastify.get(
    '/setores',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Lista setores distintos presentes em contas_pagar (pra popular filtro)',
        response: { 200: SetorCpListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listarSetores(),
  );

  fastify.get(
    '/:id/pagamento-grupo',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Títulos quitados pelo mesmo movimento bancário (borderô) do título informado',
        description: 'Deixa claro que parcelas de um adiantamento são um pagamento só, fatiado.',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: PagamentoGrupoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.pagamentoGrupo((req.params as { id: string }).id),
  );

  fastify.get(
    '/:id/remessa-grupo',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Títulos enviados ao banco na MESMA remessa (lote de pagamento eletrônico) do título',
        description: 'Remessa = conta + data + número (CPGDOCTO.NROREMESSAPE). Só pagamento eletrônico tem; borderô/cheque caem no /pagamento-grupo.',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: RemessaGrupoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.remessaGrupo((req.params as { id: string }).id),
  );

  fastify.post(
    '/reconciliar',
    {
      // TEMPORÁRIO (fase de desenvolvimento/validação): liberado pra qualquer usuário logado,
      // não só admin. Reverter para fastify.requireAdmin antes de produção — ver Leia/padrao-validacao-conferencia.md §10.3.
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Reconcilia os títulos EM ABERTO contra o Globus, por chave (pega prorrogação/cancelamento fora da janela)',
        description:
          'Fecha o ponto cego do sync por janela de vencimento: um título prorrogado sai da janela e a cópia local congela. ' +
          'Reconsulta todos os pendentes/aprovados por CODDOCTOCPG, e também os SUCESSORES de títulos substituídos ainda não ' +
          'sincronizados (senão a obrigação some: nem o antigo, excluído da soma, nem o novo, nunca trazido). É carga do Globus.',
        response: {
          200: Type.Object({
            jobId: Type.String(),
            status: Type.String(),
            verificados: Type.Integer(),
            atualizados: Type.Integer(),
            sumiram: Type.Integer(),
            sucessoresBuscados: Type.Integer(),
            duracaoMs: Type.Integer(),
          }),
        },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 3, timeWindow: '5 minutes' } },
    },
    async (req) => service.reconciliarAbertos(req.user.sub),
  );

  fastify.get(
    '/conferencia',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista', 'auditor')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Confere os totais do período contra o Globus (fonte independente)',
        description:
          'Soma os dois lados separadamente e compara. Divergência indica padrão de duplicidade ' +
          'ainda não tratado — a classe de erro em que cada linha está certa e só o total está errado.',
        querystring: CpConferenciaQuerySchema,
        response: { 200: CpConferenciaResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.conferencia(req.query),
  );

  fastify.get(
    '/:id/eventos',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista', 'auditor')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Trilha real do documento no Globus (todos os eventos, com usuário e hora)',
        description: 'Mostra inclusive cancelamento de pagamento e repagamento — atos que a visão resumida escondia. Sinaliza divergência entre o nosso status e o STATUSDOCTOCPG do ERP.',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: CpEventosResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.eventos(req.params.id),
  );

  fastify.get(
    '/:id/devolucao',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Comprovante da devolução bancária do título (par débito/crédito + título refeito)',
        description:
          'Liga o selo "Devolvido" à PROVA no extrato (BCOMOVTO): o crédito de DOC/CHEQUE ' +
          'DEVOLVIDO que casou conta+valor+data do pagamento. `encontrado=false` quando não há crédito casado.',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: DevolucaoComprovanteResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.devolucaoComprovante((req.params as { id: string }).id),
  );

  fastify.get(
    '/:id/substituicao-cadeia',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Cadeia de substituição do documento (estados pelos quais passou até o final)',
        description: 'Segue CODDOCTOCPGSUBST nos dois sentidos. Só o estado final (sem sucessor) conta no total.',
        params: Type.Object({ id: Type.String({ format: 'uuid' }) }),
        response: { 200: SubstituicaoCadeiaResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.substituicaoCadeia((req.params as { id: string }).id),
  );

  fastify.get(
    '/sync-status',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'cp_analista')],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Status da última sincronização com o Globus',
        response: { 200: SyncInfoSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.statusSync(),
  );

  fastify.post(
    '/sync',
    {
      // TEMPORÁRIO (fase de desenvolvimento/validação): liberado pra qualquer usuário logado,
      // não só admin. Reverter para fastify.requireAdmin antes de produção — ver Leia/padrao-validacao-conferencia.md §10.3.
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['contas-pagar'],
        summary: 'Sincroniza contas a pagar do Globus (Oracle) para o Postgres local',
        description:
          'Roda em duas etapas: adapter (Oracle -> stage) + ETL (stage -> finance.contas_pagar).' +
          ' Se dtIni/dtFim ausentes, sincroniza o mês corrente. Idempotente.',
        body: Type.Optional(SyncContasPagarRequestSchema),
        response: { 200: SyncResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    },
    async (req) => {
      const body = req.body ?? {};
      return service.sincronizar(body, req.user.sub);
    },
  );
};
