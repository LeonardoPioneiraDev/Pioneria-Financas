import type { FastifyInstance } from 'fastify';
import { HorariosRelatorioStage } from '@/entities/horarios-relatorio-stage.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { sha256Json } from '@/shared/utils/crypto.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

/**
 * Resposta de GET /api/integrations/conferencia-resgate (lista).
 * Cada item e o metadado de UM relatorio .xlsx processado pela BRB Mobilidade.
 */
export interface HorariosRelatorioListItem {
  id: string;
  filename: string;
  fileType: string;
  dateRange: string;
  productCount: number;
  rowCount: number;
  dateColumnsCount: number;
  processedAt: string;
  userName: string;
}

export interface SyncHorariosResult {
  jobId: string;
  relatoriosLidos: number;
  relatoriosGravados: number;
  relatoriosInalterados: number;
  relatoriosComErro: number;
  duracaoMs: number;
  status: 'ok' | 'parcial' | 'erro';
  mensagem?: string;
}

/**
 * Adapter — fase 1: sincroniza apenas a LISTA de relatorios (metadados) no
 * stage local. A fase 2 (buscar detalhe + montar fato granular) fica no ETL
 * em `recebiveis-gdf.etl.ts`, processando os relatorios pendentes do stage.
 *
 * Idempotente via hash_payload: se a lista voltar com o mesmo conteudo, nao
 * regrava.
 */
export function buildHorariosRecebiveisAdapter(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(HorariosRelatorioStage);
  const jobRepo = fastify.db.getRepository(SyncJob);

  return {
    async sincronizarLista(opts: { usuarioId?: string | null } = {}): Promise<SyncHorariosResult> {
      const inicio = Date.now();
      const log = fastify.log.child({ sync: { sistema: 'horarios', recurso: 'recebivel_gdf_lista' } });
      log.info('[sync:horarios:recebiveis] iniciando — buscando lista de relatorios');

      const job = jobRepo.create({
        sistema: 'horarios',
        recurso: 'recebivel_gdf_lista',
        status: 'rodando',
        parametros: { endpoint: '/api/integrations/conferencia-resgate' },
        usuarioId: opts.usuarioId ?? null,
      });
      await jobRepo.save(job);
      const jobLog = log.child({ jobId: job.id });

      try {
        if (!fastify.horarios.isAvailable()) {
          throw new Error('Cliente horarios indisponivel (HORARIOS_ENABLED ou HORARIOS_API_KEY)');
        }

        const res = await fastify.horarios.get<HorariosRelatorioListItem[]>(
          '/api/integrations/conferencia-resgate',
          undefined,
          { queryName: 'horarios:conferencia-resgate:lista', syncJobId: job.id },
        );

        const items = Array.isArray(res.data) ? res.data : [];
        const lidos = items.length;
        jobLog.info({ lidos }, `[sync:horarios:recebiveis] ${lidos} relatorios na resposta`);

        let gravados = 0;
        let inalterados = 0;
        let comErro = 0;

        for (const item of items) {
          try {
            const hash = sha256Json(item);
            const resultado = await stageRepo.query<Array<{ inalterado: boolean }>>(
              `INSERT INTO integration.horarios_relatorio_stage
                 (origem_id_externo, sync_job_id, raw_payload, hash_payload)
               VALUES ($1, $2, $3::jsonb, $4)
               ON CONFLICT (origem_id_externo)
               DO UPDATE SET
                 sync_job_id = EXCLUDED.sync_job_id,
                 recebido_em = NOW(),
                 raw_payload = CASE WHEN integration.horarios_relatorio_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                    THEN EXCLUDED.raw_payload
                                    ELSE integration.horarios_relatorio_stage.raw_payload END,
                 hash_payload = EXCLUDED.hash_payload,
                 processado_em = CASE WHEN integration.horarios_relatorio_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                      THEN NULL
                                      ELSE integration.horarios_relatorio_stage.processado_em END
               RETURNING (xmax <> 0 AND integration.horarios_relatorio_stage.hash_payload = $4) AS inalterado`,
              [item.id, job.id, JSON.stringify(item), hash],
            );
            if (resultado[0]?.inalterado) inalterados += 1;
            else gravados += 1;
          } catch (err) {
            comErro += 1;
            jobLog.warn({ err, relatorioId: item.id }, '[sync:horarios:recebiveis] falha ao gravar relatorio no stage');
            await registrarErroSync({
              fastify,
              sistema: 'horarios',
              recurso: 'recebivel_gdf_lista',
              fase: 'stage_insert',
              syncJobId: job.id,
              chaveNatural: { relatorio_id: item.id },
              rawPayload: item as unknown as Record<string, unknown>,
              erro: err,
            });
          }
        }

        const duracaoMs = Date.now() - inicio;
        const status: SyncHorariosResult['status'] = comErro === 0 ? 'ok' : comErro < lidos ? 'parcial' : 'erro';

        job.status = status;
        job.terminadoEm = new Date();
        job.registrosLidos = lidos;
        job.registrosGravados = gravados;
        job.registrosComErro = comErro;
        await jobRepo.save(job);

        jobLog.info(
          { status, lidos, gravados, inalterados, comErro, duracaoMs },
          `[sync:horarios:recebiveis] concluido (${gravados} novos/alterados, ${inalterados} inalterados, ${comErro} erros)`,
        );

        return {
          jobId: job.id,
          relatoriosLidos: lidos,
          relatoriosGravados: gravados,
          relatoriosInalterados: inalterados,
          relatoriosComErro: comErro,
          duracaoMs,
          status,
        };
      } catch (err) {
        const message = (err as Error).message;
        log.error({ err }, '[sync:horarios:recebiveis] FALHA');
        job.status = 'erro';
        job.terminadoEm = new Date();
        job.erroMensagem = message;
        await jobRepo.save(job);

        return {
          jobId: job.id,
          relatoriosLidos: 0,
          relatoriosGravados: 0,
          relatoriosInalterados: 0,
          relatoriosComErro: 0,
          duracaoMs: Date.now() - inicio,
          status: 'erro',
          mensagem: message,
        };
      }
    },
  };
}

export type HorariosRecebiveisAdapter = ReturnType<typeof buildHorariosRecebiveisAdapter>;
