import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  PerguntasListResponseSchema,
  ResponderPerguntaBodySchema,
  CriarPerguntaBodySchema,
  ArquivarPerguntaBodySchema,
  PerguntaMutacaoResponseSchema,
} from '@pioneira/shared/schemas/perguntas';
import { buildPerguntasService } from './perguntas.service.js';

export const perguntasModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildPerguntasService(fastify);

  fastify.get(
    '/',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'rh')],
      schema: {
        tags: ['perguntas'],
        summary: 'Lista respostas + perguntas avulsas (o frontend mescla com o roadmap)',
        response: { 200: PerguntasListResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.listar(),
  );

  fastify.put(
    '/responder',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller', 'rh')],
      schema: {
        tags: ['perguntas'],
        summary: 'Registra/atualiza a resposta (upsert por chave)',
        body: ResponderPerguntaBodySchema,
        response: { 200: PerguntaMutacaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.responder(req.body, req.user.sub),
  );

  fastify.post(
    '/',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller')],
      schema: {
        tags: ['perguntas'],
        summary: 'Cria uma pergunta avulsa (fora do roadmap)',
        body: CriarPerguntaBodySchema,
        response: { 200: PerguntaMutacaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.criar(req.body, req.user.sub),
  );

  fastify.patch(
    '/arquivar',
    {
      preHandler: [fastify.requireRole('admin', 'cfo', 'controller')],
      schema: {
        tags: ['perguntas'],
        summary: 'Arquiva uma pergunta (por chave)',
        body: ArquivarPerguntaBodySchema,
        response: { 200: PerguntaMutacaoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.arquivar(req.body.chave),
  );
};
