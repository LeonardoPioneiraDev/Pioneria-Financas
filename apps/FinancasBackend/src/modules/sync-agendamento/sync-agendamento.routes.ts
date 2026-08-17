import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import {
  SyncAgendamentoListaResponseSchema,
  SyncAgendamentoUpdateSchema,
  SyncAgendamentoItemSchema,
  SyncExecutarResponseSchema,
} from '@pioneira/shared';
import { buildSyncAgendamentoService } from './sync-agendamento.service.js';

export const syncAgendamentoModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildSyncAgendamentoService(fastify);
  // Guard ESTRITO: `requireRole('admin')` concede pela liberação progressiva
  // quando a URL casa com uma funcionalidade liberada. Sincronismo é infra.
  const auth = fastify.requireAdmin;

  fastify.get(
    '/',
    {
      preHandler: [auth],
      schema: {
        tags: ['sync-agendamento'],
        summary: 'Lista os recursos agendáveis e a config de sincronismo automático',
        response: { 200: SyncAgendamentoListaResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => ({ itens: await service.listar() }),
  );

  fastify.put(
    '/:recurso',
    {
      preHandler: [auth],
      schema: {
        tags: ['sync-agendamento'],
        summary: 'Configura o sincronismo automático de um recurso',
        params: Type.Object({ recurso: Type.String() }),
        body: SyncAgendamentoUpdateSchema,
        response: { 200: SyncAgendamentoItemSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.atualizar(req.params.recurso, req.body),
  );

  fastify.post(
    '/:recurso/executar',
    {
      preHandler: [auth],
      schema: {
        tags: ['sync-agendamento'],
        summary: 'Dispara o sync de um recurso agora (manual)',
        params: Type.Object({ recurso: Type.String() }),
        response: { 200: SyncExecutarResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
    },
    async (req) => service.executarAgora(req.params.recurso),
  );
};
