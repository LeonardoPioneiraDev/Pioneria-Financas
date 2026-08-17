import type { FastifyInstance } from 'fastify';
import { In, IsNull, Not } from 'typeorm';
import type {
  MarcarLidasResponse, Notificacao as NotificacaoDTO, NotificacaoTipo,
  NotificacoesListQuery, NotificacoesListResponse,
} from '@pioneira/shared';
import { FUNCIONALIDADE_LABEL } from '@pioneira/shared';
import { Notificacao } from '@/entities/notificacao.entity.js';
import { User } from '@/entities/user.entity.js';

/** Um evento a notificar — os destinatários são resolvidos pelo serviço. */
export interface EventoNotificavel {
  tipo: NotificacaoTipo;
  /** Quem provocou (será excluído dos destinatários — ninguém notifica a si mesmo). */
  atorId: string;
  funcionalidade: string;
  /** Destinatários extras além dos papéis padrão (ex.: o auditor da ressalva). */
  destinatariosExtras?: string[];
  /** Complemento da mensagem (a observação escrita, quando houver). */
  detalhe?: string | null;
}

function nomeFuncionalidade(chave: string): string {
  return FUNCIONALIDADE_LABEL[chave] ?? chave;
}

export function buildNotificacoesService(fastify: FastifyInstance) {
  const repo = fastify.db.getRepository(Notificacao);
  const userRepo = fastify.db.getRepository(User);

  function toDTO(n: Notificacao): NotificacaoDTO {
    return {
      id: n.id,
      tipo: n.tipo,
      titulo: n.titulo,
      mensagem: n.mensagem,
      funcionalidade: n.funcionalidade,
      atorNome: n.atorNome,
      atorEmail: n.atorEmail,
      link: n.link,
      lidaEm: n.lidaEm ? n.lidaEm.toISOString() : null,
      criadoEm: n.criadoEm.toISOString(),
    };
  }

  /**
   * Quem precisa saber de cada evento. O admin acompanha tudo; o CFO só o que
   * chega até ele (validação/aval); o auditor recebe o retorno do que apontou.
   */
  async function destinatarios(evento: EventoNotificavel): Promise<string[]> {
    const papeis: Array<'admin' | 'cfo'> = evento.tipo === 'validacao_registrada'
      ? ['admin', 'cfo']            // validou → o CFO tem o que avalizar
      : evento.tipo === 'ressalva_registrada'
        ? ['admin']                 // problema apontado → quem corrige é o admin
        : ['admin'];                // resposta/aval → o admin acompanha
    const porPapel = await userRepo.find({
      where: { role: In(papeis), ativo: true },
      select: { id: true },
    });
    const ids = new Set<string>([...porPapel.map((u) => u.id), ...(evento.destinatariosExtras ?? [])]);
    ids.delete(evento.atorId); // ninguém é notificado do próprio ato
    return [...ids];
  }

  function montarTexto(evento: EventoNotificavel, atorNome: string): { titulo: string; mensagem: string } {
    const func = nomeFuncionalidade(evento.funcionalidade);
    const detalhe = evento.detalhe?.trim() ? ` — “${evento.detalhe.trim()}”` : '';
    switch (evento.tipo) {
      case 'validacao_registrada':
        return { titulo: `${func} validada`, mensagem: `${atorNome} conferiu ${func} e validou os dados.${detalhe}` };
      case 'ressalva_registrada':
        return { titulo: `${func} com ressalva`, mensagem: `${atorNome} não validou ${func} e apontou um problema${detalhe}` };
      case 'ressalva_respondida':
        return { titulo: `Ressalva respondida — ${func}`, mensagem: `${atorNome} respondeu à sua ressalva em ${func}${detalhe}` };
      case 'aval_registrado':
        return { titulo: `${func} avalizada pelo CFO`, mensagem: `${atorNome} deu o aval de ciência em ${func}.${detalhe}` };
      case 'aval_devolvido':
        return { titulo: `${func} devolvida pelo CFO`, mensagem: `${atorNome} devolveu ${func} com ressalva${detalhe}` };
    }
  }

  return {
    /**
     * Registra o evento para todos os interessados. Best-effort: uma falha aqui
     * NÃO pode derrubar a validação que o usuário acabou de fazer.
     */
    async registrarEvento(evento: EventoNotificavel): Promise<void> {
      try {
        const ator = await userRepo.findOne({
          where: { id: evento.atorId },
          select: { id: true, nomeCompleto: true, email: true },
        });
        const atorNome = ator?.nomeCompleto ?? 'Um usuário';
        const alvos = await destinatarios(evento);
        if (alvos.length === 0) return;

        const { titulo, mensagem } = montarTexto(evento, atorNome);
        await repo.insert(alvos.map((usuarioId) => ({
          usuarioId,
          tipo: evento.tipo,
          titulo,
          mensagem,
          funcionalidade: evento.funcionalidade,
          atorId: evento.atorId,
          atorNome,
          atorEmail: ator?.email ?? null,
          link: '/validacoes',
        })));
      } catch (err) {
        fastify.log.warn({ err, evento: evento.tipo }, '[notificacoes] falha ao registrar evento');
      }
    },

    async listar(usuarioId: string, query: NotificacoesListQuery): Promise<NotificacoesListResponse> {
      const itens = await repo.find({
        where: query.apenasNaoLidas ? { usuarioId, lidaEm: IsNull() } : { usuarioId },
        order: { criadoEm: 'DESC' },
        take: query.limit ?? 30,
      });
      const naoLidas = await repo.count({ where: { usuarioId, lidaEm: IsNull() } });
      return { itens: itens.map(toDTO), naoLidas };
    },

    /** Marca como lidas: os IDs informados, ou TODAS quando a lista vem vazia. */
    async marcarLidas(usuarioId: string, ids?: string[]): Promise<MarcarLidasResponse> {
      const alvo = ids && ids.length > 0
        ? { usuarioId, id: In(ids), lidaEm: IsNull() }
        : { usuarioId, lidaEm: IsNull() };
      const r = await repo.update(alvo, { lidaEm: new Date() });
      const naoLidas = await repo.count({ where: { usuarioId, lidaEm: IsNull() } });
      return { marcadas: r.affected ?? 0, naoLidas };
    },

    /** Limpa notificações lidas com mais de N dias (higiene da tabela). */
    async limparAntigas(dias = 90): Promise<number> {
      const corte = new Date(Date.now() - dias * 86_400_000);
      const r = await repo
        .createQueryBuilder()
        .delete()
        .where('lida_em IS NOT NULL AND lida_em < :corte', { corte })
        .execute();
      return r.affected ?? 0;
    },

    /** Só para diagnóstico/testes: quantas não lidas o usuário tem. */
    async contarNaoLidas(usuarioId: string): Promise<number> {
      return repo.count({ where: { usuarioId, lidaEm: IsNull() } });
    },

    /** Quantas notificações JÁ lidas o usuário tem (usado no teste de fumaça). */
    async contarLidas(usuarioId: string): Promise<number> {
      return repo.count({ where: { usuarioId, lidaEm: Not(IsNull()) } });
    },
  };
}

export type NotificacoesService = ReturnType<typeof buildNotificacoesService>;
