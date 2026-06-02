import type { FastifyInstance } from 'fastify';
import { GlobusBcomovtoStage } from '@/entities/globus-bcomovto-stage.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { GLOBUS_QUERIES } from './globus.queries.js';
import { sha256Json } from '@/shared/utils/crypto.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

export interface RawBcoMovtoRow {
  COD_MOVTO_BCO: number;
  CODIGO_EMPRESA: number;
  CODIGO_FL: number;
  COD_BANCO: number;
  COD_AGENCIA: number;
  COD_CONTA_BCO: string;
  DATA_MOVTO: Date;
  DATA_EFETIVA: Date | null;
  DATA_CREDITO: Date | null;
  VALOR: number;
  COD_HISTO_BCO: number | null;
  DESC_HISTO_BCO: string | null;
  HIST_MOVTO_BCO: string | null;
  DOC_MOVTO_BCO: string | null;
  CONFIRMADO: string | null;
  CONCILIADO: string | null;
  STATUS_MOVTO: string | null;
  COD_TP_DESPESA: string | null;
  COD_TP_RECEITA: string | null;
  COD_CUSTO: number | null;
}

export interface SyncBcoMovtoParams {
  empresa: number;
  dtInicio: Date;
  dtFimExclusivo: Date;
  usuarioId?: string | null;
}

export interface SyncBcoMovtoResult {
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
 * Adapter Globus — BCOMOVTO (extrato bancario).
 * Le movimentos do mes da Pioneira e popula `integration.globus_bcomovto_stage`.
 * Idempotente via hash_payload (sha256Json).
 */
export function buildGlobusBcomovtoAdapter(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusBcomovtoStage);
  const jobRepo = fastify.db.getRepository(SyncJob);

  return {
    async sincronizar(params: SyncBcoMovtoParams): Promise<SyncBcoMovtoResult> {
      const inicio = Date.now();
      const dtIniIso = params.dtInicio.toISOString().slice(0, 10);
      const dtFimIso = params.dtFimExclusivo.toISOString().slice(0, 10);

      const log = fastify.log.child({
        sync: { sistema: 'globus', recurso: 'banco_movto' },
        params: { empresa: params.empresa, dt_ini: dtIniIso, dt_fim_excl: dtFimIso },
      });
      log.info(`[sync:globus:bcomovto] iniciando — ${dtIniIso} <= DTMOVTOBCO < ${dtFimIso}`);

      const job = jobRepo.create({
        sistema: 'globus',
        recurso: 'banco_movto',
        status: 'rodando',
        parametros: { empresa: params.empresa, dtIni: dtIniIso, dtFimExclusivo: dtFimIso },
        usuarioId: params.usuarioId ?? null,
      });
      await jobRepo.save(job);
      const jobLog = log.child({ jobId: job.id });

      try {
        if (!fastify.oracle?.isAvailable?.()) {
          throw new Error('Conexao com Oracle (Globus) indisponivel');
        }

        const tQ = Date.now();
        const result = await fastify.oracle.execute<RawBcoMovtoRow>(
          GLOBUS_QUERIES.bcoMovtoMes,
          {
            empresa: params.empresa,
            dt_ini: params.dtInicio,
            dt_fim_excl: params.dtFimExclusivo,
          },
          { queryName: 'bcoMovtoMes', syncJobId: job.id },
        );
        const queryMs = Date.now() - tQ;
        const linhas = result.rows ?? [];
        const lidos = linhas.length;
        jobLog.info({ lidos, queryMs }, `[sync:globus:bcomovto] query retornou ${lidos} linhas em ${queryMs}ms`);

        let gravados = 0;
        let inalterados = 0;
        let comErro = 0;

        for (const linha of linhas) {
          try {
            const hash = sha256Json(linha);
            const r = await stageRepo.query<Array<{ inalterado: boolean }>>(
              `INSERT INTO integration.globus_bcomovto_stage
                 (cod_movto_bco, codigo_empresa, codigo_fl, sync_job_id, raw_payload, hash_payload)
               VALUES ($1, $2, $3, $4, $5::jsonb, $6)
               ON CONFLICT (codigo_empresa, cod_movto_bco)
               DO UPDATE SET
                 sync_job_id = EXCLUDED.sync_job_id,
                 recebido_em = NOW(),
                 raw_payload = CASE WHEN integration.globus_bcomovto_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                    THEN EXCLUDED.raw_payload
                                    ELSE integration.globus_bcomovto_stage.raw_payload END,
                 hash_payload = EXCLUDED.hash_payload,
                 processado_em = CASE WHEN integration.globus_bcomovto_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                      THEN NULL
                                      ELSE integration.globus_bcomovto_stage.processado_em END
               RETURNING (xmax <> 0 AND integration.globus_bcomovto_stage.hash_payload = $6) AS inalterado`,
              [linha.COD_MOVTO_BCO, linha.CODIGO_EMPRESA, linha.CODIGO_FL, job.id, JSON.stringify(linha), hash],
            );
            if (r[0]?.inalterado) inalterados += 1;
            else gravados += 1;
          } catch (err) {
            comErro += 1;
            jobLog.warn({ err, codMovto: linha.COD_MOVTO_BCO }, '[sync:globus:bcomovto] falha ao gravar no stage');
            await registrarErroSync({
              fastify,
              sistema: 'globus',
              recurso: 'banco_movto',
              fase: 'stage_insert',
              syncJobId: job.id,
              chaveNatural: { cod_movto_bco: linha.COD_MOVTO_BCO, codigo_empresa: linha.CODIGO_EMPRESA },
              rawPayload: linha as unknown as Record<string, unknown>,
              erro: err,
            });
          }
        }

        const duracaoMs = Date.now() - inicio;
        const status: SyncBcoMovtoResult['status'] = comErro === 0 ? 'ok' : comErro < lidos ? 'parcial' : 'erro';

        job.status = status;
        job.terminadoEm = new Date();
        job.registrosLidos = lidos;
        job.registrosGravados = gravados;
        job.registrosComErro = comErro;
        await jobRepo.save(job);

        jobLog.info(
          { status, lidos, gravados, inalterados, comErro, duracaoMs },
          `[sync:globus:bcomovto] concluido (${gravados} novos/alterados, ${inalterados} inalterados, ${comErro} erros, ${duracaoMs}ms)`,
        );

        return {
          jobId: job.id,
          registrosLidos: lidos,
          registrosGravados: gravados,
          registrosInalterados: inalterados,
          registrosComErro: comErro,
          duracaoMs,
          status,
        };
      } catch (err) {
        const message = (err as Error).message;
        log.error({ err }, '[sync:globus:bcomovto] FALHA');
        job.status = 'erro';
        job.terminadoEm = new Date();
        job.erroMensagem = message;
        await jobRepo.save(job);
        return {
          jobId: job.id,
          registrosLidos: 0,
          registrosGravados: 0,
          registrosInalterados: 0,
          registrosComErro: 0,
          duracaoMs: Date.now() - inicio,
          status: 'erro',
          mensagem: message,
        };
      }
    },
  };
}

export type GlobusBcomovtoAdapter = ReturnType<typeof buildGlobusBcomovtoAdapter>;
