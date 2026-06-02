import bcrypt from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import type { LoginPayload, AuthenticatedUser, LoginResponse, UserRole } from '@pioneira/shared';
import { User } from '@/entities/user.entity.js';
import { RefreshToken } from '@/entities/refresh-token.entity.js';
import { UserActivityLog } from '@/entities/user-activity-log.entity.js';
import { gerarTokenAleatorio, hashSha256 } from '@/shared/utils/crypto.js';

const BCRYPT_ROUNDS = 12;
const REFRESH_TTL_DAYS = 7;

export function buildAuthService(fastify: FastifyInstance) {
  const userRepo = fastify.db.getRepository(User);
  const refreshRepo = fastify.db.getRepository(RefreshToken);
  const activityRepo = fastify.db.getRepository(UserActivityLog);

  type ActivityMeta = Record<string, string | number | boolean | null>;

  async function registrarAtividade(
    usuarioId: string | null,
    tipo: 'login' | 'login_falha' | 'logout',
    ip: string | null,
    userAgent: string | null,
    metadata?: ActivityMeta,
  ): Promise<void> {
    setImmediate(() => {
      activityRepo
        .insert({ usuarioId, activityType: tipo, ipAddress: ip, userAgent, metadata: metadata ?? null })
        .catch((err) => fastify.log.warn({ err }, 'Falha ao registrar atividade'));
    });
  }

  function toAuthenticatedUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      nomeCompleto: user.nomeCompleto,
      role: user.role as UserRole,
      ativo: user.ativo,
      ultimoLoginEm: user.ultimoLoginEm ? user.ultimoLoginEm.toISOString() : null,
    };
  }

  function parseDuration(expr: string): number {
    const match = expr.match(/^(\d+)([smhd])$/);
    if (!match) return 15 * 60;
    const [, amountStr, unit] = match;
    const amount = Number.parseInt(amountStr!, 10);
    const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    return amount * (multipliers[unit!] ?? 60);
  }

  async function gerarRefreshToken(usuarioId: string, ip: string | null, userAgent: string | null): Promise<string> {
    const raw = gerarTokenAleatorio(48);
    const tokenHash = hashSha256(raw);
    const expiraEm = new Date(Date.now() + REFRESH_TTL_DAYS * 86_400_000);
    await refreshRepo.insert({ usuarioId, tokenHash, expiraEm, ipOrigem: ip, userAgent });
    return raw;
  }

  return {
    async hashSenha(senha: string): Promise<string> {
      return bcrypt.hash(senha, BCRYPT_ROUNDS);
    },

    async verificarSenha(senha: string, hash: string): Promise<boolean> {
      return bcrypt.compare(senha, hash);
    },

    async login(payload: LoginPayload, ip: string | null, userAgent: string | null): Promise<LoginResponse> {
      const user = await userRepo.findOne({ where: { email: payload.email } });

      if (!user || !user.senhaHash || !user.ativo) {
        await registrarAtividade(user?.id ?? null, 'login_falha', ip, userAgent, { motivo: !user ? 'nao_encontrado' : !user.ativo ? 'inativo' : 'sem_senha' });
        throw fastify.httpErrors.unauthorized('E-mail ou senha invalidos');
      }

      const senhaOk = await bcrypt.compare(payload.password, user.senhaHash);
      if (!senhaOk) {
        await registrarAtividade(user.id, 'login_falha', ip, userAgent, { motivo: 'senha_invalida' });
        throw fastify.httpErrors.unauthorized('E-mail ou senha invalidos');
      }

      if (user.mustChangePassword) {
        throw fastify.httpErrors.forbidden('Voce precisa definir sua senha pelo link enviado por email antes de fazer login');
      }

      user.ultimoLoginEm = new Date();
      await userRepo.save(user);

      const accessToken = await fastify.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role as UserRole,
        nomeCompleto: user.nomeCompleto,
      });
      const refreshToken = await gerarRefreshToken(user.id, ip, userAgent);

      await registrarAtividade(user.id, 'login', ip, userAgent);

      return {
        accessToken,
        refreshToken,
        expiresIn: parseDuration(fastify.config.jwt.accessExpiresIn),
        user: toAuthenticatedUser(user),
      };
    },

    async refresh(refreshToken: string, ip: string | null, userAgent: string | null): Promise<LoginResponse> {
      const tokenHash = hashSha256(refreshToken);
      const stored = await refreshRepo.findOne({ where: { tokenHash } });

      if (!stored || stored.revogadoEm || stored.expiraEm < new Date()) {
        throw fastify.httpErrors.unauthorized('Refresh token invalido ou expirado');
      }

      const user = await userRepo.findOne({ where: { id: stored.usuarioId } });
      if (!user || !user.ativo) {
        throw fastify.httpErrors.unauthorized('Usuario inativo');
      }

      stored.revogadoEm = new Date();
      await refreshRepo.save(stored);

      const accessToken = await fastify.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role as UserRole,
        nomeCompleto: user.nomeCompleto,
      });
      const novoRefresh = await gerarRefreshToken(user.id, ip, userAgent);

      return {
        accessToken,
        refreshToken: novoRefresh,
        expiresIn: parseDuration(fastify.config.jwt.accessExpiresIn),
        user: toAuthenticatedUser(user),
      };
    },

    async logout(refreshToken: string | null, usuarioId: string | null, ip: string | null, userAgent: string | null): Promise<void> {
      if (refreshToken) {
        const tokenHash = hashSha256(refreshToken);
        await refreshRepo.update({ tokenHash, revogadoEm: undefined }, { revogadoEm: new Date() });
      }
      if (usuarioId) {
        await registrarAtividade(usuarioId, 'logout', ip, userAgent);
      }
    },

    async me(usuarioId: string): Promise<AuthenticatedUser> {
      const user = await userRepo.findOne({ where: { id: usuarioId } });
      if (!user) throw fastify.httpErrors.notFound('Usuario nao encontrado');
      return toAuthenticatedUser(user);
    },
  };
}

export type AuthService = ReturnType<typeof buildAuthService>;
