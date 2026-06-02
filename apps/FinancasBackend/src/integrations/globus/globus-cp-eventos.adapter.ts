import type { FastifyInstance } from 'fastify';
import { GlobusCpEventosStage } from '@/entities/globus-cp-eventos-stage.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { GLOBUS_QUERIES } from './globus.queries.js';
import { sha256Json } from '@/shared/utils/crypto.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

export interface SyncCpEventosParams {
  empresa: number;
  dtInicio: Date;
  dtFimExclusivo: Date;
  usuarioId?: string | null;
}

export interface RawCpEventoRow {
  COD_DOCTO_CPG: number | string;
  CODIGO_EMPRESA: number;
  SEQUENCIA_EVENTO: number;
  COD_TP_EVENTO: number | null;
  TIPO_EVENTO_DESC: string | null;
  MAIS_INFORMACOES: string | null;
  STATUS_DOCTO: string | null;
  USUARIO: string | null;
  DATA_EVENTO: Date | null;
}

export interface SyncCpEventosResult {
  jobId: string;
  registrosLidos: number;
  registrosGravados: number;
  registrosInalterados: number;
  registrosComErro: number;
  duracaoMs: number;
  status: 'ok' | 'parcial' | 'erro';
  mensagem?: string;
}

/**
 * Adapter Globus — eventos de Contas a Pagar (CPGDOCTO_HISTORICO_NEGOCIACOES).
 * Le do Oracle e popula `integration.globus_cp_eventos_stage` de forma
 * idempotente (upsert por codigo_empresa+cod_docto_cpg+sequencia_evento).
 * Eventos sao append-only no Globus: sem logica de exclusao.
 */
export function buildGlobusCpEventosAdapter(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusCpEventosStage);
  const jobRepo = fastify.db.getRepository(SyncJob);

  return {
    async sincronizar(params: SyncCpEventosParams): Promise<SyncCpEventosResult> {
      const inicio = Date.now();
      const log = fastify.log.child({
        sync: { sistema: 'globus', recurso: 'cp_eventos' },
        params: {
          empresa: params.empresa,
          dt_ini: params.dtInicio.toISOString().slice(0, 10),
          dt_fim_excl: params.dtFimExclusivo.toISOString().slice(0, 10),
        },
      });
      log.info('[sync:globus:cp-eventos] iniciando sincronizacao');

      const job = jobRepo.create({
        sistema: 'globus',
        recurso: 'cp_eventos',
        status: 'rodando',
        parametros: {
          empresa: params.empresa,
          dtInicio: params.dtInicio.toISOString(),
          dtFimExclusivo: params.dtFimExclusivo.toISOString(),
        },
        usuarioId: params.usuarioId ?? null,
      });
      await jobRepo.save(job);
      const jobLog = log.child({ jobId: job.id });

      try {
        if (!fastify.oracle?.isAvailable?.()) {
          throw new Error('Conexao com Oracle (Globus) indisponivel');
        }

        const result = await fastify.oracle.execute<RawCpEventoRow>(
          GLOBUS_QUERIES.cpEventos,
          { empresa: params.empresa, dt_ini: params.dtInicio, dt_fim_excl: params.dtFimExclusivo },
          { queryName: 'cpEventos', syncJobId: job.id },
        );

        const linhas = result.rows ?? [];
        const lidos = linhas.length;
        jobLog.info({ lidos }, `[sync:globus:cp-eventos] query retornou ${lidos} eventos`);

        let gravados = 0;
        let inalterados = 0;
        let comErro = 0;

        for (const linha of linhas) {
          try {
            const hash = sha256Json(linha);
            const resultado = await stageRepo.query<Array<{ inalterado: boolean }>>(
              `INSERT INTO integration.globus_cp_eventos_stage
                 (cod_docto_cpg, codigo_empresa, sequencia_evento, sync_job_id, raw_payload, hash_payload)
               VALUES ($1, $2, $3, $4, $5::jsonb, $6)
               ON CONFLICT (codigo_empresa, cod_docto_cpg, sequencia_evento)
               DO UPDATE SET
                 sync_job_id  = EXCLUDED.sync_job_id,
                 recebido_em  = NOW(),
                 raw_payload  = CASE WHEN integration.globus_cp_eventos_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                     THEN EXCLUDED.raw_payload
                                     ELSE integration.globus_cp_eventos_stage.raw_payload END,
                 hash_payload = EXCLUDED.hash_payload,
                 processado_em = CASE WHEN integration.globus_cp_eventos_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                      THEN NULL
                                      ELSE integration.globus_cp_eventos_stage.processado_em END
               RETURNING (xmax <> 0 AND integration.globus_cp_eventos_stage.hash_payload = $6) AS inalterado`,
              [
                String(linha.COD_DOCTO_CPG),
                linha.CODIGO_EMPRESA,
                linha.SEQUENCIA_EVENTO,
                job.id,
                JSON.stringify(linha),
                hash,
              ],
            );
            if (resultado[0]?.inalterado) inalterados += 1;
            else gravados += 1;
          } catch (err) {
            comErro += 1;
            jobLog.warn({ err, codDoctoCpg: linha.COD_DOCTO_CPG, seq: linha.SEQUENCIA_EVENTO }, '[sync:globus:cp-eventos] falha ao gravar evento no stage');
            await registrarErroSync({
              fastify,
              sistema: 'globus',
              recurso: 'cp_eventos',
              fase: 'stage_insert',
              syncJobId: job.id,
              chaveNatural: {
                cod_docto_cpg: String(linha.COD_DOCTO_CPG),
                codigo_empresa: linha.CODIGO_EMPRESA,
                sequencia_evento: linha.SEQUENCIA_EVENTO,
              },
              rawPayload: linha as unknown as Record<string, unknown>,
              erro: err,
            });
          }
        }

        const duracaoMs = Date.now() - inicio;
        const status: SyncCpEventosResult['status'] = comErro === 0 ? 'ok' : comErro < lidos ? 'parcial' : 'erro';
        job.status = status;
        job.terminadoEm = new Date();
        job.registrosLidos = lidos;
        job.registrosGravados = gravados;
        job.registrosComErro = comErro;
        await jobRepo.save(job);

        jobLog.info(
          { status, lidos, gravados, inalterados, comErro, duracaoMs },
          `[sync:globus:cp-eventos] concluido status=${status} (${gravados}/${lidos} gravados, ${inalterados} inalterados, ${comErro} erros, ${duracaoMs}ms)`,
        );

        return { jobId: job.id, registrosLidos: lidos, registrosGravados: gravados, registrosInalterados: inalterados, registrosComErro: comErro, duracaoMs, status };
      } catch (err) {
        const message = (err as Error).message;
        jobLog.error({ err }, '[sync:globus:cp-eventos] FALHA - sincronizacao abortada');
        job.status = 'erro';
        job.terminadoEm = new Date();
        job.erroMensagem = message;
        await jobRepo.save(job);
        return { jobId: job.id, registrosLidos: 0, registrosGravados: 0, registrosInalterados: 0, registrosComErro: 0, duracaoMs: Date.now() - inicio, status: 'erro', mensagem: message };
      }
    },
  };
}

export type GlobusCpEventosAdapter = ReturnType<typeof buildGlobusCpEventosAdapter>;
