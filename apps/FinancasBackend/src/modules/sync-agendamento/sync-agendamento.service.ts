import type { FastifyInstance } from 'fastify';
import type { SyncAgendamentoItem, SyncAgendamentoUpdate, SyncExecutarResponse } from '@pioneira/shared';
import { SyncAgendamento } from '@/entities/sync-agendamento.entity.js';
import { SYNC_RECURSOS, SYNC_REGISTRY } from './sync-registry.js';
import { proximaExecucao } from './schedule-util.js';

function paraItem(recurso: string, label: string, a: SyncAgendamento | undefined): SyncAgendamentoItem {
  return {
    recurso,
    label,
    habilitado: a?.habilitado ?? false,
    frequencia: a?.frequencia ?? 'diario',
    intervaloMin: a?.intervaloMin ?? null,
    horaDia: a?.horaDia ?? 6,
    minutoDia: a?.minutoDia ?? 0,
    ultimoRunEm: a?.ultimoRunEm?.toISOString() ?? null,
    ultimoStatus: a?.ultimoStatus ?? null,
    ultimaMensagem: a?.ultimaMensagem ?? null,
    proximoRunEm: a?.proximoRunEm?.toISOString() ?? null,
  };
}

export function buildSyncAgendamentoService(fastify: FastifyInstance) {
  const repo = fastify.db.getRepository(SyncAgendamento);

  return {
    /** Lista todos os recursos agendáveis com a config atual (ou defaults). */
    async listar(): Promise<SyncAgendamentoItem[]> {
      const rows = await repo.find();
      const porRecurso = new Map(rows.map((r) => [r.recurso, r]));
      return SYNC_RECURSOS.map(({ recurso, label }) => paraItem(recurso, label, porRecurso.get(recurso)));
    },

    /** Salva a config de um recurso e recalcula o próximo run. */
    async atualizar(recurso: string, body: SyncAgendamentoUpdate): Promise<SyncAgendamentoItem> {
      const def = SYNC_RECURSOS.find((r) => r.recurso === recurso);
      if (!def) throw fastify.httpErrors.notFound('Recurso de sincronismo desconhecido');

      let a = await repo.findOne({ where: { recurso } });
      if (!a) a = repo.create({ recurso });

      a.habilitado = body.habilitado;
      a.frequencia = body.frequencia;
      a.intervaloMin = body.frequencia === 'intervalo' ? body.intervaloMin ?? 60 : null;
      a.horaDia = body.frequencia === 'diario' ? body.horaDia ?? 6 : null;
      a.minutoDia = body.minutoDia ?? 0;
      a.proximoRunEm = body.habilitado ? proximaExecucao(a, new Date()) : null;

      const salvo = await repo.save(a);
      return paraItem(recurso, def.label, salvo);
    },

    /** Dispara um sync agora (manual), independente do agendamento. */
    async executarAgora(recurso: string): Promise<SyncExecutarResponse> {
      const def = SYNC_REGISTRY.get(recurso);
      if (!def) throw fastify.httpErrors.notFound('Recurso de sincronismo desconhecido');

      const agora = new Date();
      let resultado: SyncExecutarResponse;
      try {
        const r = await def.executar(fastify);
        resultado = { recurso, status: r.status, mensagem: r.mensagem };
      } catch (err) {
        resultado = { recurso, status: 'erro', mensagem: ((err as Error).message ?? 'erro').slice(0, 300) };
      }

      // Registra o resultado na config (se existir linha).
      const a = await repo.findOne({ where: { recurso } });
      if (a) {
        a.ultimoRunEm = agora;
        a.ultimoStatus = resultado.status;
        a.ultimaMensagem = resultado.mensagem?.slice(0, 300) ?? null;
        if (a.habilitado) a.proximoRunEm = proximaExecucao(a, agora);
        await repo.save(a);
      }
      return resultado;
    },
  };
}

export type SyncAgendamentoService = ReturnType<typeof buildSyncAgendamentoService>;
