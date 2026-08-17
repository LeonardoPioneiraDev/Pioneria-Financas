import fp from 'fastify-plugin';
import { SyncAgendamento } from '@/entities/sync-agendamento.entity.js';
import { SYNC_REGISTRY } from '@/modules/sync-agendamento/sync-registry.js';
import { proximaExecucao } from '@/modules/sync-agendamento/schedule-util.js';

/**
 * Agendador in-process do sincronismo automatico. A cada 60s le
 * integration.sync_agendamento e dispara os recursos habilitados que estao
 * vencidos (proximo_run_em <= agora), via SYNC_REGISTRY. Fire-and-forget por
 * recurso, com guarda de sobreposicao (nao roda o mesmo recurso 2x em paralelo).
 *
 * O gate de cada sync e o campo `habilitado` (default false) — nada roda ate ser
 * configurado na tela de Sincronismo. Nao depende de Redis.
 */
export const syncSchedulerPlugin = fp(
  async (fastify) => {
    if (process.env.NODE_ENV === 'test') return;

    const rodando = new Set<string>();
    let timer: ReturnType<typeof setInterval> | null = null;

    async function tick(): Promise<void> {
      const repo = fastify.db.getRepository(SyncAgendamento);
      const agendados = await repo.find({ where: { habilitado: true } });
      const agora = new Date();

      for (const ag of agendados) {
        // Primeira vez habilitado sem proximo agendado: so agenda.
        if (!ag.proximoRunEm) {
          ag.proximoRunEm = proximaExecucao(ag, agora);
          await repo.save(ag);
          continue;
        }
        if (ag.proximoRunEm.getTime() > agora.getTime()) continue;
        if (rodando.has(ag.recurso)) continue;
        const def = SYNC_REGISTRY.get(ag.recurso);
        if (!def) continue;

        rodando.add(ag.recurso);
        void (async () => {
          const log = fastify.log.child({ scheduler: ag.recurso });
          try {
            log.info(`[sync-scheduler] disparando ${ag.recurso}`);
            const r = await def.executar(fastify);
            ag.ultimoStatus = r.status;
            ag.ultimaMensagem = r.mensagem?.slice(0, 300) ?? null;
          } catch (err) {
            ag.ultimoStatus = 'erro';
            ag.ultimaMensagem = ((err as Error).message ?? 'erro').slice(0, 300);
            log.warn({ err }, '[sync-scheduler] falha no sync agendado');
          } finally {
            ag.ultimoRunEm = new Date();
            ag.proximoRunEm = proximaExecucao(ag, ag.ultimoRunEm);
            await repo.save(ag).catch((e) => log.warn({ err: e }, '[sync-scheduler] falha ao salvar agendamento'));
            rodando.delete(ag.recurso);
          }
        })();
      }
    }

    fastify.addHook('onReady', async () => {
      timer = setInterval(() => {
        void tick().catch((err) => fastify.log.warn({ err }, '[sync-scheduler] falha no tick'));
      }, 60_000);
      fastify.log.info('[sync-scheduler] agendador in-process ativo (tick 60s)');
    });

    fastify.addHook('onClose', async () => {
      if (timer) clearInterval(timer);
    });
  },
  { name: 'sync-scheduler', dependencies: ['db', 'config'] },
);
