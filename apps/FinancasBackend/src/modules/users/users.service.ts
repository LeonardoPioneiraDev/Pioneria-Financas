import type { FastifyInstance } from 'fastify';
import { ILike } from 'typeorm';
import type { UserCreatePayload, UserListQuery, UserResponse, UserUpdatePayload, UserRole } from '@pioneira/shared';
import { User } from '@/entities/user.entity.js';
import { RefreshToken } from '@/entities/refresh-token.entity.js';
import { buildPasswordsService } from '@/modules/passwords/passwords.service.js';

function toResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    nomeCompleto: user.nomeCompleto,
    role: user.role as UserRole,
    ativo: user.ativo,
    ultimoLoginEm: user.ultimoLoginEm ? user.ultimoLoginEm.toISOString() : null,
    criadoEm: user.criadoEm.toISOString(),
    atualizadoEm: user.atualizadoEm.toISOString(),
  };
}

export function buildUsersService(fastify: FastifyInstance) {
  const userRepo = fastify.db.getRepository(User);
  const refreshRepo = fastify.db.getRepository(RefreshToken);
  const passwordsService = buildPasswordsService(fastify);

  return {
    async listar(query: UserListQuery): Promise<{ data: UserResponse[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const where: Record<string, unknown> = {};
      if (query.role) where.role = query.role;
      if (typeof query.ativo === 'boolean') where.ativo = query.ativo;
      if (query.search) {
        where.nomeCompleto = ILike(`%${query.search}%`);
      }

      const [rows, total] = await userRepo.findAndCount({
        where,
        order: { criadoEm: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

      return {
        data: rows.map(toResponse),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    },

    async obter(id: string): Promise<UserResponse> {
      const user = await userRepo.findOne({ where: { id } });
      if (!user) throw fastify.httpErrors.notFound('Usuario nao encontrado');
      return toResponse(user);
    },

    async criar(payload: UserCreatePayload, ip: string | null): Promise<UserResponse> {
      const existente = await userRepo.findOne({ where: { email: payload.email } });
      if (existente) throw fastify.httpErrors.conflict('Ja existe um usuario com este email');

      const user = userRepo.create({
        email: payload.email,
        nomeCompleto: payload.nomeCompleto,
        role: payload.role,
        ativo: true,
        mustChangePassword: true,
        senhaHash: null,
      });
      await userRepo.save(user);

      const link = await passwordsService.gerarLinkPrimeiroAcesso(user.id, ip);
      try {
        await fastify.email.enviarConvitePrimeiroAcesso({
          to: user.email,
          nomeCompleto: user.nomeCompleto,
          linkAtivacao: link,
        });
      } catch (err) {
        fastify.log.error({ err, email: user.email }, 'Falha ao enviar convite - usuario criado mas email falhou');
      }

      return toResponse(user);
    },

    async atualizar(id: string, payload: UserUpdatePayload): Promise<UserResponse> {
      const user = await userRepo.findOne({ where: { id } });
      if (!user) throw fastify.httpErrors.notFound('Usuario nao encontrado');

      if (payload.nomeCompleto !== undefined) user.nomeCompleto = payload.nomeCompleto;
      if (payload.role !== undefined) user.role = payload.role;
      if (payload.ativo !== undefined) {
        user.ativo = payload.ativo;
        if (!payload.ativo) {
          await refreshRepo.update({ usuarioId: user.id, revogadoEm: undefined }, { revogadoEm: new Date() });
        }
      }
      await userRepo.save(user);
      return toResponse(user);
    },

    async reenviarConvite(id: string, ip: string | null): Promise<void> {
      const user = await userRepo.findOne({ where: { id } });
      if (!user) throw fastify.httpErrors.notFound('Usuario nao encontrado');
      if (!user.mustChangePassword) throw fastify.httpErrors.conflict('Este usuario ja definiu sua senha');

      const link = await passwordsService.gerarLinkPrimeiroAcesso(user.id, ip);
      await fastify.email.enviarConvitePrimeiroAcesso({
        to: user.email,
        nomeCompleto: user.nomeCompleto,
        linkAtivacao: link,
      });
    },

    async remover(id: string): Promise<void> {
      const result = await userRepo.delete({ id });
      if (!result.affected) throw fastify.httpErrors.notFound('Usuario nao encontrado');
    },
  };
}

export type UsersService = ReturnType<typeof buildUsersService>;
