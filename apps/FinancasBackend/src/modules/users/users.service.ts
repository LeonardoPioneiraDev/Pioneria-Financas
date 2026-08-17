import type { FastifyInstance } from 'fastify';
import { ILike } from 'typeorm';
import type {
  UserCreatePayload, UserListQuery, UserResponse, UserUpdatePayload, UserRole,
  UserCreateResponse, RedefinirSenhaResponse,
} from '@pioneira/shared';
import { FUNCIONALIDADES, funcionalidadesLiberadas } from '@pioneira/shared';
import { User } from '@/entities/user.entity.js';
import { Notificacao } from '@/entities/notificacao.entity.js';
import { RefreshToken } from '@/entities/refresh-token.entity.js';
import { ValidacaoFuncionalidade } from '@/entities/validacao-funcionalidade.entity.js';
import { buildPasswordsService } from '@/modules/passwords/passwords.service.js';
import { buildAuthService } from '@/modules/auth/auth.service.js';
import { gerarTokenAleatorio } from '@/shared/utils/crypto.js';

/** Chaves válidas da trilha de conferência (o catálogo é a fonte da verdade). */
const CHAVES_VALIDAS = new Set(FUNCIONALIDADES.map((f) => f.chave));

/** Senha temporária aleatória (~12 chars base64url) — o admin repassa ao usuário. */
function gerarSenhaAleatoria(): string {
  return gerarTokenAleatorio(9);
}

function toResponse(user: User): UserResponse {
  return {
    id: user.id,
    email: user.email,
    nomeCompleto: user.nomeCompleto,
    role: user.role as UserRole,
    permissoes: (user.permissoes ?? []) as UserResponse['permissoes'],
    liberacaoProgressiva: user.liberacaoProgressiva ?? false,
    funcionalidadesAtribuidas: user.funcionalidadesAtribuidas ?? [],
    funcionalidadesValidadas: user.funcionalidadesValidadas ?? [],
    progressoFuncionalidades: user.progressoFuncionalidades ?? {},
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
  const authService = buildAuthService(fastify);

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
      if (!user) throw fastify.httpErrors.notFound('Usuário não encontrado');
      return toResponse(user);
    },

    async criar(payload: UserCreatePayload): Promise<UserCreateResponse> {
      const existente = await userRepo.findOne({ where: { email: payload.email } });
      if (existente) throw fastify.httpErrors.conflict('Já existe um usuário com este e-mail');

      // Sem envio de e-mail (não configurado): gera uma senha aleatória e a devolve
      // UMA vez para o admin repassar. Login imediato; troca fica a cargo do usuário.
      const senhaGerada = gerarSenhaAleatoria();
      const user = userRepo.create({
        email: payload.email,
        nomeCompleto: payload.nomeCompleto,
        role: payload.role,
        permissoes: payload.permissoes ?? [],
        ativo: true,
        mustChangePassword: false,
        senhaHash: await authService.hashSenha(senhaGerada),
      });
      await userRepo.save(user);
      fastify.log.info({ email: user.email, usuarioId: user.id }, '[users] usuário criado com senha gerada (sem e-mail)');
      return { ...toResponse(user), senhaGerada };
    },

    async atualizar(id: string, payload: UserUpdatePayload, atorId: string): Promise<UserResponse> {
      const user = await userRepo.findOne({ where: { id } });
      if (!user) throw fastify.httpErrors.notFound('Usuário não encontrado');

      const antes = {
        nomeCompleto: user.nomeCompleto, email: user.email, role: user.role, ativo: user.ativo,
        permissoes: [...(user.permissoes ?? [])],
        liberacaoProgressiva: user.liberacaoProgressiva, funcionalidadesAtribuidas: [...(user.funcionalidadesAtribuidas ?? [])],
      };
      if (payload.nomeCompleto !== undefined) user.nomeCompleto = payload.nomeCompleto;
      if (payload.email !== undefined && payload.email !== user.email) {
        const jaExiste = await userRepo.findOne({ where: { email: payload.email } });
        if (jaExiste && jaExiste.id !== user.id) throw fastify.httpErrors.conflict('Já existe um usuário com este e-mail');
        user.email = payload.email;
      }
      if (payload.role !== undefined) user.role = payload.role;
      if (payload.permissoes !== undefined) user.permissoes = payload.permissoes;
      if (payload.liberacaoProgressiva !== undefined) user.liberacaoProgressiva = payload.liberacaoProgressiva;
      if (payload.funcionalidadesAtribuidas !== undefined) {
        // Só chaves do catálogo entram na trilha (o Dashboard, por exemplo, é
        // sempre visível e não se valida — se passar, viraria um passo fantasma).
        const invalidas = payload.funcionalidadesAtribuidas.filter((c) => !CHAVES_VALIDAS.has(c));
        if (invalidas.length > 0) {
          throw fastify.httpErrors.badRequest(`Funcionalidade desconhecida: ${invalidas.join(', ')}`);
        }
        user.funcionalidadesAtribuidas = payload.funcionalidadesAtribuidas;
        // Coerência: descarta validações de funcionalidades que não estão mais atribuídas.
        const atrib = new Set(payload.funcionalidadesAtribuidas);
        user.funcionalidadesValidadas = (user.funcionalidadesValidadas ?? []).filter((c) => atrib.has(c));
        // O progresso (1º acesso) também sai — senão desmarcar e remarcar deixaria
        // o relógio já vencido e a funcionalidade validável na hora.
        user.progressoFuncionalidades = Object.fromEntries(
          Object.entries(user.progressoFuncionalidades ?? {}).filter(([chave]) => atrib.has(chave)),
        );
      }
      if (payload.ativo !== undefined) {
        user.ativo = payload.ativo;
        if (!payload.ativo) {
          await refreshRepo.update({ usuarioId: user.id, revogadoEm: undefined }, { revogadoEm: new Date() });
        }
      }
      await userRepo.save(user);

      await fastify.auditoria.registrarAlteracao({
        usuarioId: atorId,
        recurso: 'usuario',
        recursoId: user.id,
        descricao: `Usuário ${user.email}`,
        antes,
        depois: {
          nomeCompleto: user.nomeCompleto, email: user.email, role: user.role, ativo: user.ativo,
          permissoes: [...user.permissoes],
          liberacaoProgressiva: user.liberacaoProgressiva, funcionalidadesAtribuidas: [...user.funcionalidadesAtribuidas],
        },
      });

      return toResponse(user);
    },

    // A validação da trilha saiu daqui: agora é o ciclo completo de conferência
    // (auditor valida/aponta problema · CFO avaliza · admin responde a ressalva)
    // em `modules/validacoes/validacoes.service.ts` → POST /api/validacoes/conferir.

    /**
     * Registra o 1º acesso do usuário a uma funcionalidade (inicia o relógio do
     * tempo mínimo). Idempotente e no-op se não for progressivo / não liberada.
     */
    async registrarAcessoFuncionalidade(usuarioId: string, chave: string): Promise<void> {
      const user = await userRepo.findOne({ where: { id: usuarioId } });
      if (!user || !user.liberacaoProgressiva) return;
      // SÓ a funcionalidade liberada inicia o relógio — senão o usuário poderia
      // disparar o contador de todas de uma vez e validar tudo em sequência.
      const liberadas = funcionalidadesLiberadas(user.funcionalidadesAtribuidas ?? [], user.funcionalidadesValidadas ?? []);
      if (!liberadas.includes(chave)) return;
      const prog = user.progressoFuncionalidades ?? {};
      if (prog[chave]?.primeiroAcessoEm) return; // já tem 1º acesso
      user.progressoFuncionalidades = {
        ...prog,
        [chave]: { primeiroAcessoEm: new Date().toISOString(), validadoEm: prog[chave]?.validadoEm ?? null, justificativa: prog[chave]?.justificativa ?? null },
      };
      await userRepo.save(user);
    },

    /**
     * Admin: RESET COMPLETO da participação do usuário no ciclo de conferência.
     *
     * Apaga de verdade — não é só zerar o espelho:
     *   1. as conferências dele na trilha (`audit.validacao_funcionalidade`);
     *   2. os avais do CFO que ficarem ÓRFÃOS (funcionalidade que, sem as
     *      conferências apagadas, não tem mais nenhuma validação) — senão a tela
     *      mostraria "Avalizada pelo CFO" em algo que ninguém validou;
     *   3. as notificações em que ele é autor ou destinatário;
     *   4. o espelho (validadas + relógio do 1º acesso).
     *
     * O ATO de resetar fica registrado em `audit.acesso_dados` com o resumo do
     * que foi apagado — apagar a prova sem deixar rastro do apagamento seria pior
     * do que não apagar. Ver `Leia/padrao-validacao-conferencia.md`.
     */
    async resetarProgressoFuncionalidades(id: string, atorId: string): Promise<UserResponse> {
      const user = await userRepo.findOne({ where: { id } });
      if (!user) throw fastify.httpErrors.notFound('Usuário não encontrado');

      const antes = {
        funcionalidadesValidadas: [...(user.funcionalidadesValidadas ?? [])],
        progressoFuncionalidades: { ...(user.progressoFuncionalidades ?? {}) },
      };

      const resumo = await fastify.db.transaction(async (manager) => {
        const valRepo = manager.getRepository(ValidacaoFuncionalidade);
        const notifRepo = manager.getRepository(Notificacao);

        // 1. Conferências do usuário — guarda quais funcionalidades foram tocadas.
        const minhas = await valRepo.find({ where: { usuarioId: user.id, tipo: 'conferencia' } });
        const funcionalidadesAfetadas = [...new Set(minhas.map((r) => r.funcionalidade))];
        if (minhas.length > 0) {
          await valRepo.delete({ usuarioId: user.id, tipo: 'conferencia' });
        }

        // 2. Avais órfãos: funcionalidade que ficou sem NENHUMA validação vigente.
        const avaisRemovidos: string[] = [];
        for (const chave of funcionalidadesAfetadas) {
          const restantes = await valRepo.find({
            where: { funcionalidade: chave, tipo: 'conferencia' },
            order: { criadoEm: 'ASC' },
          });
          // Estado vigente = último registro de cada auditor que sobrou.
          const vigentes = new Map<string, string>();
          for (const r of restantes) vigentes.set(r.usuarioId, r.status);
          const aindaValidada = [...vigentes.values()].includes('validado');
          if (!aindaValidada) {
            const avais = await valRepo.find({ where: { funcionalidade: chave, tipo: 'aval' } });
            if (avais.length > 0) {
              await valRepo.delete({ funcionalidade: chave, tipo: 'aval' });
              avaisRemovidos.push(chave);
            }
          }
        }

        // 3. Notificações do usuário (as que ele gerou e as que recebeu) + as dos
        //    avais que acabaram de cair.
        const comoAtor = await notifRepo.delete({ atorId: user.id });
        const comoDestino = await notifRepo.delete({ usuarioId: user.id });
        let notifAvais = 0;
        if (avaisRemovidos.length > 0) {
          const r = await notifRepo
            .createQueryBuilder()
            .delete()
            .where('funcionalidade IN (:...chaves) AND tipo IN (:...tipos)', {
              chaves: avaisRemovidos,
              tipos: ['aval_registrado', 'aval_devolvido'],
            })
            .execute();
          notifAvais = r.affected ?? 0;
        }

        // 4. Espelho.
        await manager.getRepository(User).update({ id: user.id }, {
          funcionalidadesValidadas: [],
          progressoFuncionalidades: {},
        });

        return {
          conferenciasApagadas: minhas.length,
          funcionalidadesAfetadas,
          avaisOrfaosRemovidos: avaisRemovidos,
          notificacoesApagadas: (comoAtor.affected ?? 0) + (comoDestino.affected ?? 0) + notifAvais,
        };
      });

      await fastify.auditoria.registrarAlteracao({
        usuarioId: atorId,
        recurso: 'usuario',
        recursoId: user.id,
        descricao: `Reset de validações — ${user.email} · ${resumo.conferenciasApagadas} conferência(s) apagada(s)`,
        antes,
        depois: {
          funcionalidadesValidadas: [],
          progressoFuncionalidades: {},
          apagado: resumo,
        },
      });

      fastify.log.warn({ usuarioId: user.id, atorId, ...resumo }, '[users] RESET de conferências (dados apagados)');

      user.funcionalidadesValidadas = [];
      user.progressoFuncionalidades = {};
      return toResponse(user);
    },

    /**
     * Redefine a senha do usuário para uma nova senha aleatória (sem e-mail) e
     * revoga as sessões ativas. Devolve a senha gerada UMA vez para o admin repassar.
     */
    async redefinirSenha(id: string, atorId: string): Promise<RedefinirSenhaResponse> {
      const user = await userRepo.findOne({ where: { id } });
      if (!user) throw fastify.httpErrors.notFound('Usuário não encontrado');

      const senhaGerada = gerarSenhaAleatoria();
      user.senhaHash = await authService.hashSenha(senhaGerada);
      user.mustChangePassword = false;
      await userRepo.save(user);
      // Mata as sessões abertas — a senha antiga deixa de valer.
      await refreshRepo.update({ usuarioId: user.id, revogadoEm: undefined }, { revogadoEm: new Date() });

      await fastify.auditoria.registrarAlteracao({
        usuarioId: atorId,
        recurso: 'usuario',
        recursoId: user.id,
        descricao: `Senha redefinida — ${user.email}`,
        antes: { senha: '••••••' },
        depois: { senha: '(nova gerada)' },
      });

      fastify.log.info({ usuarioId: user.id, atorId }, '[users] senha redefinida (gerada)');
      return { senhaGerada };
    },

    async reenviarConvite(id: string, ip: string | null): Promise<void> {
      const user = await userRepo.findOne({ where: { id } });
      if (!user) throw fastify.httpErrors.notFound('Usuário não encontrado');
      if (!user.mustChangePassword) throw fastify.httpErrors.conflict('Este usuário já definiu sua senha');

      const link = await passwordsService.gerarLinkPrimeiroAcesso(user.id, ip);
      await fastify.email.enviarConvitePrimeiroAcesso({
        to: user.email,
        nomeCompleto: user.nomeCompleto,
        linkAtivacao: link,
      });
    },

    async remover(id: string): Promise<void> {
      const result = await userRepo.delete({ id });
      if (!result.affected) throw fastify.httpErrors.notFound('Usuário não encontrado');
    },
  };
}

export type UsersService = ReturnType<typeof buildUsersService>;
