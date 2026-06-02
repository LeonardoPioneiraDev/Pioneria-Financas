import type { FastifyInstance } from 'fastify';
import { LessThan } from 'typeorm';
import { User } from '@/entities/user.entity.js';
import { PasswordResetToken, type PasswordResetTokenTipo } from '@/entities/password-reset-token.entity.js';
import { RefreshToken } from '@/entities/refresh-token.entity.js';
import { UserActivityLog } from '@/entities/user-activity-log.entity.js';
import { buildAuthService } from '@/modules/auth/auth.service.js';
import { gerarTokenAleatorio, hashSha256 } from '@/shared/utils/crypto.js';

const RESET_TTL_MS = 60 * 60 * 1000;
const FIRST_ACCESS_TTL_MS = 48 * 60 * 60 * 1000;

export function buildPasswordsService(fastify: FastifyInstance) {
  const userRepo = fastify.db.getRepository(User);
  const tokenRepo = fastify.db.getRepository(PasswordResetToken);
  const refreshRepo = fastify.db.getRepository(RefreshToken);
  const activityRepo = fastify.db.getRepository(UserActivityLog);
  const authService = buildAuthService(fastify);

  async function emitirToken(usuarioId: string, tipo: PasswordResetTokenTipo, ip: string | null): Promise<string> {
    const ttl = tipo === 'first_access' ? FIRST_ACCESS_TTL_MS : RESET_TTL_MS;
    const raw = gerarTokenAleatorio(48);
    const tokenHash = hashSha256(raw);
    const expiraEm = new Date(Date.now() + ttl);

    await tokenRepo
      .createQueryBuilder()
      .update()
      .set({ usadoEm: () => 'COALESCE(usado_em, NOW())' })
      .where('usuario_id = :uid AND tipo = :tipo AND usado_em IS NULL', { uid: usuarioId, tipo })
      .execute();

    await tokenRepo.insert({ usuarioId, tokenHash, tipo, expiraEm, ipOrigem: ip });
    return raw;
  }

  async function consumirToken(rawToken: string, tipo: PasswordResetTokenTipo): Promise<{ usuario: User; token: PasswordResetToken }> {
    const tokenHash = hashSha256(rawToken);
    const token = await tokenRepo.findOne({ where: { tokenHash, tipo } });
    if (!token) throw fastify.httpErrors.notFound('Token invalido');
    if (token.usadoEm) throw fastify.httpErrors.gone('Token ja utilizado');
    if (token.expiraEm < new Date()) throw fastify.httpErrors.gone('Token expirado');

    const usuario = await userRepo.findOne({ where: { id: token.usuarioId } });
    if (!usuario || !usuario.ativo) throw fastify.httpErrors.notFound('Usuario nao encontrado ou inativo');

    return { usuario, token };
  }

  return {
    /**
     * Cria um token de primeiro-acesso e retorna o link completo. Chamado por
     * users.service quando admin cria um usuario.
     */
    async gerarLinkPrimeiroAcesso(usuarioId: string, ip: string | null): Promise<string> {
      const raw = await emitirToken(usuarioId, 'first_access', ip);
      return `${fastify.config.app.url}/first-access/${raw}`;
    },

    async solicitarRecuperacao(email: string, ip: string | null, userAgent: string | null): Promise<void> {
      const usuario = await userRepo.findOne({ where: { email } });
      if (!usuario || !usuario.ativo) {
        fastify.log.info({ email }, 'Solicitacao de recuperacao para email inexistente/inativo - resposta silenciosa');
        return;
      }

      const raw = await emitirToken(usuario.id, 'reset', ip);
      const link = `${fastify.config.app.url}/reset-password/${raw}`;

      try {
        await fastify.email.enviarRecuperacaoSenha({
          to: usuario.email,
          nomeCompleto: usuario.nomeCompleto,
          linkRecuperacao: link,
        });
      } catch (err) {
        fastify.log.error({ err, email }, 'Falha ao enviar email de recuperacao');
        throw fastify.httpErrors.internalServerError('Nao foi possivel enviar o email no momento');
      }

      setImmediate(() => {
        activityRepo
          .insert({ usuarioId: usuario.id, activityType: 'password_reset', ipAddress: ip, userAgent, metadata: { etapa: 'solicitado' } })
          .catch((err) => fastify.log.warn({ err }, 'Falha ao registrar atividade password_reset'));
      });
    },

    async validarToken(rawToken: string): Promise<{ valido: boolean; email?: string; expiraEm?: string }> {
      const tokenHash = hashSha256(rawToken);
      const token = await tokenRepo.findOne({ where: { tokenHash } });
      if (!token || token.usadoEm || token.expiraEm < new Date()) return { valido: false };
      const usuario = await userRepo.findOne({ where: { id: token.usuarioId } });
      if (!usuario || !usuario.ativo) return { valido: false };
      return { valido: true, email: usuario.email, expiraEm: token.expiraEm.toISOString() };
    },

    async redefinirSenha(rawToken: string, novaSenha: string, ip: string | null, userAgent: string | null): Promise<void> {
      const { usuario, token } = await consumirToken(rawToken, 'reset');
      usuario.senhaHash = await authService.hashSenha(novaSenha);
      usuario.mustChangePassword = false;
      await userRepo.save(usuario);

      token.usadoEm = new Date();
      await tokenRepo.save(token);

      await refreshRepo.update({ usuarioId: usuario.id, revogadoEm: undefined }, { revogadoEm: new Date() });

      setImmediate(() => {
        activityRepo
          .insert({ usuarioId: usuario.id, activityType: 'password_change', ipAddress: ip, userAgent, metadata: { via: 'reset' } })
          .catch((err) => fastify.log.warn({ err }, 'Falha ao registrar atividade password_change'));
      });
    },

    async definirSenhaPrimeiroAcesso(rawToken: string, novaSenha: string, ip: string | null, userAgent: string | null): Promise<void> {
      const { usuario, token } = await consumirToken(rawToken, 'first_access');
      usuario.senhaHash = await authService.hashSenha(novaSenha);
      usuario.mustChangePassword = false;
      await userRepo.save(usuario);

      token.usadoEm = new Date();
      await tokenRepo.save(token);

      setImmediate(() => {
        activityRepo
          .insert({ usuarioId: usuario.id, activityType: 'first_access', ipAddress: ip, userAgent })
          .catch((err) => fastify.log.warn({ err }, 'Falha ao registrar atividade first_access'));
      });
    },

    /**
     * Limpa tokens expirados antigos. Pode ser chamado por um cron BullMQ.
     */
    async limparTokensExpirados(): Promise<number> {
      const limite = new Date(Date.now() - 7 * 86_400_000);
      const result = await tokenRepo.delete({ expiraEm: LessThan(limite) });
      return result.affected ?? 0;
    },
  };
}

export type PasswordsService = ReturnType<typeof buildPasswordsService>;
