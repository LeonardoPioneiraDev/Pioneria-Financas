import type { FastifyInstance } from 'fastify';
import type {
  ReceitaTdmaxSyncQuery,
  ReceitaTdmaxSyncResponse,
  ReconciliacaoTdmaxQuery,
  ReconciliacaoTdmaxResponse,
  ReconciliacaoTdmaxDia,
} from '@pioneira/shared';
import { ReceitaTdmax } from '@/entities/receita-tdmax.entity.js';
import { BancoMovto } from '@/entities/banco-movto.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';

/** Formato cru do endpoint /integrations/receita/passageiro-receita. */
interface TdmaxData {
  intervalo?: { inicio: string; fim: string };
  dias?: Array<{
    data: string;
    tipo_dia?: string | null;
    estacoes?: { passageiros?: number; receita?: number };
    area2?: { passageiros?: number; receita?: number };
    total?: { passageiros?: number; receita?: number };
  }>;
}

const reaisToCents = (v: number | null | undefined): bigint => BigInt(Math.round((v ?? 0) * 100));
function isoDe(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function buildReceitaTdmaxService(fastify: FastifyInstance) {
  const repo = fastify.db.getRepository(ReceitaTdmax);
  const movtoRepo = fastify.db.getRepository(BancoMovto);
  const jobRepo = fastify.db.getRepository(SyncJob);
  const empresa = fastify.config.globus.empresaId;

  return {
    /** Sincroniza a receita TD Max (por dia) da API horarios para o canônico. */
    async sincronizar(q: ReceitaTdmaxSyncQuery, usuarioId?: string | null): Promise<ReceitaTdmaxSyncResponse> {
      const t0 = Date.now();
      const hoje = new Date();
      const dataFim = q.dataFim ?? isoDe(hoje);
      const dataInicio = q.dataInicio ?? isoDe(new Date(hoje.getTime() - 90 * 86400000));

      const job = jobRepo.create({
        sistema: 'horarios',
        recurso: 'receita-tdmax',
        status: 'rodando',
        parametros: { dataInicio, dataFim },
        usuarioId: usuarioId ?? null,
      });
      await jobRepo.save(job);

      try {
        if (!fastify.horarios.isAvailable()) {
          throw new Error('Cliente horarios indisponível (HORARIOS_ENABLED=false ou sem chave).');
        }
        const chave = fastify.config.horarios.receitaApiKey;
        if (!chave) throw new Error('RECEITA_TDMAX_API_KEY não configurada.');

        const resp = await fastify.horarios.get<TdmaxData>(
          '/api/integrations/receita/passageiro-receita',
          { data_inicio: dataInicio, data_fim: dataFim },
          { apiKey: chave, queryName: 'receita:passageiro-receita', syncJobId: job.id },
        );
        const dias = resp.data?.dias ?? [];
        const agora = new Date();
        let gravados = 0;
        for (const d of dias) {
          if (!d?.data) continue;
          await repo
            .createQueryBuilder()
            .insert()
            .values({
              empresaId: empresa,
              data: d.data,
              tipoDia: d.tipo_dia ?? null,
              paxEstacoes: Math.round(d.estacoes?.passageiros ?? 0),
              receitaEstacoesCents: reaisToCents(d.estacoes?.receita).toString(),
              paxArea2: Math.round(d.area2?.passageiros ?? 0),
              receitaArea2Cents: reaisToCents(d.area2?.receita).toString(),
              paxTotal: Math.round(d.total?.passageiros ?? 0),
              receitaTotalCents: reaisToCents(d.total?.receita).toString(),
              ultimoSyncEm: agora,
            })
            .orUpdate(
              ['tipo_dia', 'pax_estacoes', 'receita_estacoes_cents', 'pax_area2', 'receita_area2_cents', 'pax_total', 'receita_total_cents', 'ultimo_sync_em', 'atualizado_em'],
              ['empresa_id', 'data'],
            )
            .execute();
          gravados += 1;
        }

        job.status = 'ok';
        job.terminadoEm = new Date();
        job.registrosLidos = dias.length;
        job.registrosGravados = gravados;
        await jobRepo.save(job);

        return {
          jobId: job.id,
          diasLidos: dias.length,
          diasGravados: gravados,
          periodo: { dataInicio, dataFim },
          duracaoMs: Date.now() - t0,
          status: 'ok',
        };
      } catch (err) {
        const message = (err as Error).message;
        fastify.log.error({ err }, '[sync:receita-tdmax] FALHA');
        job.status = 'erro';
        job.terminadoEm = new Date();
        job.erroMensagem = message;
        await jobRepo.save(job);
        return {
          jobId: job.id,
          diasLidos: 0,
          diasGravados: 0,
          periodo: { dataInicio, dataFim },
          duracaoMs: Date.now() - t0,
          status: 'erro',
          mensagem: message,
        };
      }
    },

    /**
     * Reconciliação: receita GERADA (TD Max) x repasse GDF que CAIU no banco,
     * dia a dia. Sem glosa, o gerado = o que o GDF paga (~D+3). O acumulado
     * (gerado - repassado) mostra o que ainda falta receber (o lag).
     */
    async reconciliacao(q: ReconciliacaoTdmaxQuery): Promise<ReconciliacaoTdmaxResponse> {
      const geradoRows = await repo.query<Array<{ data: string; total: string }>>(
        `SELECT data::text AS data, receita_total_cents::text AS total
           FROM finance.receita_tdmax
          WHERE empresa_id = $1 AND data >= $2::date AND data <= $3::date`,
        [empresa, q.dataInicio, q.dataFim],
      );
      const repasseRows = await movtoRepo.query<Array<{ data: string; total: string }>>(
        `SELECT data_movto::text AS data, COALESCE(SUM(valor_cents), 0)::text AS total
           FROM finance.banco_movto
          WHERE eh_repasse_brb = true AND data_movto >= $1::date AND data_movto <= $2::date AND excluido_em IS NULL
          GROUP BY data_movto`,
        [q.dataInicio, q.dataFim],
      );
      const geradoPorDia = new Map(geradoRows.map((r) => [r.data, Number(r.total)]));
      const repassePorDia = new Map(repasseRows.map((r) => [r.data, Math.abs(Number(r.total))]));

      const ini = new Date(`${q.dataInicio}T00:00:00Z`);
      const fim = new Date(`${q.dataFim}T00:00:00Z`);
      const dias = Math.max(1, Math.ceil((fim.getTime() - ini.getTime()) / 86400000) + 1);

      const serie: ReconciliacaoTdmaxDia[] = [];
      let accGerado = 0;
      let accRepasse = 0;
      let totalGerado = 0;
      let totalRepasse = 0;
      for (let i = 0; i < dias; i++) {
        const iso = new Date(ini.getTime() + i * 86400000).toISOString().slice(0, 10);
        const g = geradoPorDia.get(iso) ?? 0;
        const r = repassePorDia.get(iso) ?? 0;
        accGerado += g;
        accRepasse += r;
        totalGerado += g;
        totalRepasse += r;
        serie.push({ data: iso, geradoCents: g, repasseBancoCents: r, aReceberAcumuladoCents: accGerado - accRepasse });
      }

      const atualizadoRow = await repo.query<Array<{ ultimo: string | null }>>(
        `SELECT MAX(ultimo_sync_em)::text AS ultimo FROM finance.receita_tdmax WHERE empresa_id = $1`,
        [empresa],
      );

      // Fator de realização = quanto do valor NOMINAL o GDF paga de fato (~0,64).
      const fatorRealizacao = totalGerado > 0 ? totalRepasse / totalGerado : 0;
      return {
        periodo: { dataInicio: q.dataInicio, dataFim: q.dataFim },
        serie,
        totalGeradoCents: totalGerado,
        totalRepasseCents: totalRepasse,
        diferencaCents: totalGerado - totalRepasse,
        fatorRealizacao: Math.round(fatorRealizacao * 10000) / 10000,
        repasseEfetivoEstimadoCents: Math.round(totalGerado * fatorRealizacao),
        lagMedioDias: null,
        temDadoGerado: totalGerado > 0,
        temDadoRepasse: totalRepasse > 0,
        atualizadoEm: atualizadoRow[0]?.ultimo ?? null,
      };
    },
  };
}

export type ReceitaTdmaxService = ReturnType<typeof buildReceitaTdmaxService>;
