import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  ConfiguracaoSchema,
  ConfiguracaoBrandingSchema,
  AtualizarConfiguracaoBodySchema,
  AtualizarLogoBodySchema,
} from '@pioneira/shared';
import { buildParametrosService } from './parametros.service.js';

export const parametrosModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const service = buildParametrosService(fastify);
  const auth = fastify.requireRole('admin');

  // PÚBLICO (sem auth): branding exibido no login e no header, inclusive deslogado.
  fastify.get(
    '/branding',
    {
      schema: {
        tags: ['parametros'],
        summary: 'Branding público (logo + nome) — usado no login e no header',
        response: { 200: ConfiguracaoBrandingSchema },
      },
    },
    async () => service.branding(),
  );

  fastify.get(
    '/',
    {
      preHandler: [auth],
      schema: {
        tags: ['parametros'],
        summary: 'Configuração completa da empresa (admin)',
        response: { 200: ConfiguracaoSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async () => service.obter(),
  );

  fastify.put(
    '/',
    {
      preHandler: [auth],
      schema: {
        tags: ['parametros'],
        summary: 'Atualiza os dados da empresa (razão social, CNPJ, endereço, telefone)',
        body: AtualizarConfiguracaoBodySchema,
        response: { 200: ConfiguracaoSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.atualizar(req.body, req.user.sub),
  );

  fastify.put(
    '/logo',
    {
      preHandler: [auth],
      schema: {
        tags: ['parametros'],
        summary: 'Define (data-URI) ou remove (null) o logo da empresa',
        body: AtualizarLogoBodySchema,
        response: { 200: ConfiguracaoSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => service.atualizarLogo(req.body.logoDataUri, req.user.sub),
  );
};
