import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  TermoStatusResponseSchema,
  AceitarTermoBodySchema,
  AceitarTermoResponseSchema,
  RegistrarAcessoBodySchema,
  RegistrarAcessoResponseSchema,
  VERSAO_TERMO_ATUAL,
} from '@pioneira/shared/schemas/audit';
import { TermoAceite } from '@/entities/termo-aceite.entity.js';
import { AcessoDados } from '@/entities/acesso-dados.entity.js';
import { obterIpDoCliente } from '@/shared/utils/client-ip.js';

export const auditModule: FastifyPluginAsyncTypebox = async (fastify) => {
  const termoRepo = fastify.db.getRepository(TermoAceite);
  const acessoRepo = fastify.db.getRepository(AcessoDados);

  /** Retorna se o usuario atual ja aceitou a versao corrente do termo. */
  fastify.get(
    '/termo/status',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['audit'],
        summary: 'Status do termo de comprometimento do usuario logado',
        response: { 200: TermoStatusResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req) => {
      const usuarioId = req.user.sub;
      const aceite = await termoRepo.findOne({
        where: { usuarioId, versaoTermo: VERSAO_TERMO_ATUAL },
      });
      return {
        versaoAtual: VERSAO_TERMO_ATUAL,
        aceito: !!aceite,
        aceitoEm: aceite ? aceite.aceitoEm.toISOString() : null,
        nomeDigitado: aceite?.nomeDigitado ?? null,
      };
    },
  );

  /** Registra aceite do termo - idempotente (ON CONFLICT na versao). */
  fastify.post(
    '/termo/aceitar',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['audit'],
        summary: 'Aceita a versao atual do termo de comprometimento',
        body: AceitarTermoBodySchema,
        response: { 200: AceitarTermoResponseSchema, 201: AceitarTermoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
    },
    async (req, reply) => {
      const usuarioId = req.user.sub;
      const ip = obterIpDoCliente(req);
      const userAgent = req.headers['user-agent']?.slice(0, 500) ?? null;

      let aceite = await termoRepo.findOne({
        where: { usuarioId, versaoTermo: VERSAO_TERMO_ATUAL },
      });
      if (aceite) {
        // Ja aceitou - retorna 200 idempotente.
        return reply.code(200).send({
          ok: true,
          versaoAceita: aceite.versaoTermo,
          aceitoEm: aceite.aceitoEm.toISOString(),
        });
      }

      aceite = termoRepo.create({
        usuarioId,
        versaoTermo: VERSAO_TERMO_ATUAL,
        nomeDigitado: req.body.nomeDigitado.trim(),
        ipAddress: ip,
        userAgent,
      });
      await termoRepo.save(aceite);

      fastify.log.info(
        { usuarioId, versao: VERSAO_TERMO_ATUAL, ip },
        '[audit] termo de comprometimento aceito',
      );

      // Tambem deixa rastro no acesso_dados.
      void acessoRepo
        .insert({
          usuarioId,
          acao: 'visualizou',
          recurso: 'termo-comprometimento',
          descricao: `Aceitou termo de comprometimento versao ${VERSAO_TERMO_ATUAL}`,
          filtros: { versao: VERSAO_TERMO_ATUAL, nome: req.body.nomeDigitado.trim() },
          ipAddress: ip,
          userAgent,
        })
        .catch((err) => fastify.log.warn({ err }, '[audit] falha ao gravar trilha do aceite'));

      return reply.code(201).send({
        ok: true,
        versaoAceita: aceite.versaoTermo,
        aceitoEm: aceite.aceitoEm.toISOString(),
      });
    },
  );

  /** Registra um acesso a dados sensiveis (visualizou, imprimiu, exportou, ...). Fire-and-forget. */
  fastify.post(
    '/acessou',
    {
      preHandler: [fastify.authRequired],
      schema: {
        tags: ['audit'],
        summary: 'Registra acesso a dados sensiveis (audit trail)',
        body: RegistrarAcessoBodySchema,
        response: { 202: RegistrarAcessoResponseSchema },
        security: [{ bearerAuth: [] }],
      },
      config: { rateLimit: { max: 300, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const usuarioId = req.user.sub;
      const ip = obterIpDoCliente(req);
      const userAgent = req.headers['user-agent']?.slice(0, 500) ?? null;
      const body = req.body;

      setImmediate(() => {
        const registro = acessoRepo.create({
          usuarioId,
          acao: body.acao,
          recurso: body.recurso,
          recursoId: body.recursoId ?? null,
          descricao: body.descricao ?? null,
          filtros: body.filtros ?? null,
          ipAddress: ip,
          userAgent,
        });
        acessoRepo
          .save(registro)
          .then(() => {
            fastify.log.info(
              {
                audit: {
                  usuarioId,
                  acao: body.acao,
                  recurso: body.recurso,
                  recursoId: body.recursoId,
                  ip,
                },
              },
              `[audit] ${body.acao} em ${body.recurso}${body.recursoId ? ` #${body.recursoId}` : ''}`,
            );
          })
          .catch((err) => fastify.log.warn({ err }, '[audit] falha ao gravar acesso_dados'));
      });

      return reply.code(202).send({ ok: true });
    },
  );
};
