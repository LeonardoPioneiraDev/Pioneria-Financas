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
  ComparativoQuerySchema,
  ComparativoResponseSchema,
  FeriasDecimoQuerySchema,
  FeriasDecimoResponseSchema,
  CustoEncargosQuerySchema,
  CustoEncargosResponseSchema,
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
    '/export',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'rh')],
      schema: {
        tags: ['folha-detalhe'],
        summary: 'Exporta funcionários (mesmos filtros) em Excel + registra na auditoria (LGPD)',
        querystring: FuncionariosQuerySchema,
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const { buffer, filename } = await service.exportarFuncionarios(
        req.query,
        req.user.sub,
        req.ip ?? null,
        req.headers['user-agent'] ?? null,
      );
      reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        .header('Content-Disposition', `attachment; filename="${filename}"`);
      return reply.send(buffer);
    },
  );

  fastify.get(
    '/contra-cheque/:codFunc',
    {
      // Dado pessoal (LGPD): exige a permissão 'ver_contracheque' (admin sempre passa),
      // separada do papel — quem vê o agregado da folha NÃO abre o holerite individual.
      preHandler: [fastify.requirePermissao('ver_contracheque')],
      schema: {
        tags: ['folha-detalhe'],
        summary: 'Contra-cheque (holerite) individual do funcionário — requer permissão ver_contracheque',
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
    '/comparativo',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'rh')],
      schema: {
        tags: ['folha-detalhe'],
        summary: 'Comparativo da competência vs mês anterior, por setor',
        querystring: ComparativoQuerySchema,
        response: { 200: ComparativoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.comparativo(req.query),
  );

  fastify.get(
    '/ferias-decimo',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'rh')],
      schema: {
        tags: ['folha-detalhe'],
        summary: 'Férias e 13º realizado (pago) no ano — por mês, verba e setor',
        querystring: FeriasDecimoQuerySchema,
        response: { 200: FeriasDecimoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.feriasDecimo(req.query),
  );

  fastify.get(
    '/custo-encargos',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'rh')],
      schema: {
        tags: ['folha-detalhe'],
        summary: 'Custo total por setor com encargos (bruto + FGTS + INSS patronal estimado)',
        querystring: CustoEncargosQuerySchema,
        response: { 200: CustoEncargosResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.custoComEncargos(req.query),
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
      // TEMPORÁRIO (fase de desenvolvimento/validação): liberado pra qualquer usuário logado.
      // Reverter para fastify.requireAdmin antes de produção.
      preHandler: [fastify.authRequired],
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
