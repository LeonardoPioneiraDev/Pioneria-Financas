import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import { buildGlobusService } from '@/integrations/globus/globus.service.js';

const ComprasPagamentosQuerySchema = Type.Object({
  empresa: Type.Integer({ minimum: 1, default: 4 }),
  /** Mes no formato YYYY-MM. Se ausente, usa o mes corrente. */
  mes: Type.Optional(Type.String({ pattern: '^\\d{4}-(0[1-9]|1[0-2])$' })),
});

const ComprasPagamentosResponseSchema = Type.Object({
  mes: Type.String(),
  codEmpresa: Type.Integer(),
  nomeEmpresa: Type.Union([Type.String(), Type.Null()]),
  vlrCompras: Type.Number(),
  vlrPag: Type.Number(),
  vlrVencfin: Type.Number(),
  perc: Type.Union([Type.Number(), Type.Null()]),
  entradaDefin: Type.Number(),
  periodo: Type.Object({
    inicio: Type.String({ format: 'date' }),
    fimExclusivo: Type.String({ format: 'date' }),
  }),
});

function calcularPeriodo(mes?: string): { dtInicio: Date; dtFimExclusivo: Date } {
  if (mes) {
    const [anoStr, mesStr] = mes.split('-');
    const ano = Number.parseInt(anoStr!, 10);
    const m = Number.parseInt(mesStr!, 10);
    const dtInicio = new Date(Date.UTC(ano, m - 1, 1));
    const dtFimExclusivo = new Date(Date.UTC(ano, m, 1));
    return { dtInicio, dtFimExclusivo };
  }
  const hoje = new Date();
  const dtInicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
  const dtFimExclusivo = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 1));
  return { dtInicio, dtFimExclusivo };
}

export const globusModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildGlobusService(fastify);

  fastify.get(
    '/compras-pagamentos-mensal',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller')],
      schema: {
        tags: ['globus'],
        summary: 'Relatorio mensal de Compras x Pagamentos x Carteira CPG (GLOBUS Oracle)',
        description:
          'Consome diretamente o schema Oracle do GLOBUS. Exige ORACLE_ENABLED=true e conexao funcional.' +
          ' Filtros: STATUSNF=F, STATUSITENSNF<>C, STATUSDOCTOCPG<>C, CODTPDOC=NF, CODIGOMATINT<>95079.',
        querystring: ComprasPagamentosQuerySchema,
        response: { 200: ComprasPagamentosResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const { empresa, mes } = req.query;
      const { dtInicio, dtFimExclusivo } = calcularPeriodo(mes);

      const resultado = await service.comprasPagamentosMensal({
        empresa,
        dtInicio,
        dtFimExclusivo,
      });

      if (!resultado) {
        throw fastify.httpErrors.notFound('Sem dados para o periodo');
      }

      return reply.send({
        ...resultado,
        periodo: {
          inicio: dtInicio.toISOString().slice(0, 10),
          fimExclusivo: dtFimExclusivo.toISOString().slice(0, 10),
        },
      });
    },
  );
};
