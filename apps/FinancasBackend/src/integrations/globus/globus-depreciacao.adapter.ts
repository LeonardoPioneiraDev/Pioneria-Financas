import type { FastifyInstance } from 'fastify';
import { GlobusCtbsaldoStage } from '@/entities/globus-ctbsaldo-stage.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { GLOBUS_QUERIES } from './globus.queries.js';
import { sha256Json } from '@/shared/utils/crypto.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

/** Linha crua do CTBSALDO (familias de imobilizado/depreciacao). */
export interface RawCtbSaldoRow {
  CODIGO_EMPRESA: number;
  /** AAAAMM */
  PERIODO: string;
  NRO_PLANO: number;
  COD_CONTA_CTB: number;
  CLASSIFICADOR: string;
  NOME_CONTA: string | null;
  VL_DEBITO: number | null;
  VL_CREDITO: number | null;
}

export interface SyncDepreciacaoParams {
  empresa: number;
  usuarioId?: string | null;
}

export interface SyncDepreciacaoResult {
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
 * Adapter Globus — CTBSALDO (depreciacao contabil por classe).
 * Le o saldo mensal das familias de imobilizado/depreciacao e popula
 * `integration.globus_ctbsaldo_stage`. Idempotente via hash_payload.
 */
export function buildGlobusDepreciacaoAdapter(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusCtbsaldoStage);
  const jobRepo = fastify.db.getRepository(SyncJob);

  return {
    async sincronizar(params: SyncDepreciacaoParams): Promise<SyncDepreciacaoResult> {
      const inicio = Date.now();
      const log = fastify.log.child({
        sync: { sistema: 'globus', recurso: 'depreciacao' },
        params: { empresa: params.empresa },
      });
      log.info('[sync:globus:depreciacao] iniciando — CTBSALDO familias imobilizado/depreciacao');

      const job = jobRepo.create({
        sistema: 'globus',
        recurso: 'depreciacao',
        status: 'rodando',
        parametros: { empresa: params.empresa },
        usuarioId: params.usuarioId ?? null,
      });
      await jobRepo.save(job);
      const jobLog = log.child({ jobId: job.id });

      try {
        if (!fastify.oracle?.isAvailable?.()) {
          throw new Error('Conexao com Oracle (Globus) indisponivel');
        }

        const tQ = Date.now();
        const result = await fastify.oracle.execute<RawCtbSaldoRow>(
          GLOBUS_QUERIES.depreciacaoContabil,
          { empresa: params.empresa },
          { queryName: 'depreciacaoContabil', syncJobId: job.id },
        );
        const queryMs = Date.now() - tQ;
        const linhas = result.rows ?? [];
        const lidos = linhas.length;
        jobLog.info({ lidos, queryMs }, `[sync:globus:depreciacao] query retornou ${lidos} linhas em ${queryMs}ms`);

        let gravados = 0;
        let inalterados = 0;
        let comErro = 0;

        for (const linha of linhas) {
          try {
            const hash = sha256Json(linha);
            const r = await stageRepo.query<Array<{ inalterado: boolean }>>(
              `INSERT INTO integration.globus_ctbsaldo_stage
                 (codigo_empresa, periodo, nro_plano, cod_conta_ctb, sync_job_id, raw_payload, hash_payload)
               VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
               ON CONFLICT (codigo_empresa, periodo, nro_plano, cod_conta_ctb)
               DO UPDATE SET
                 sync_job_id = EXCLUDED.sync_job_id,
                 recebido_em = NOW(),
                 raw_payload = CASE WHEN integration.globus_ctbsaldo_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                    THEN EXCLUDED.raw_payload
                                    ELSE integration.globus_ctbsaldo_stage.raw_payload END,
                 hash_payload = EXCLUDED.hash_payload,
                 processado_em = CASE WHEN integration.globus_ctbsaldo_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                      THEN NULL
                                      ELSE integration.globus_ctbsaldo_stage.processado_em END
               RETURNING (xmax <> 0 AND integration.globus_ctbsaldo_stage.hash_payload = $7) AS inalterado`,
              [
                linha.CODIGO_EMPRESA,
                linha.PERIODO,
                linha.NRO_PLANO,
                linha.COD_CONTA_CTB,
                job.id,
                JSON.stringify(linha),
                hash,
              ],
            );
            if (r[0]?.inalterado) inalterados += 1;
            else gravados += 1;
          } catch (err) {
            comErro += 1;
            jobLog.warn(
              { err, periodo: linha.PERIODO, conta: linha.COD_CONTA_CTB },
              '[sync:globus:depreciacao] falha ao gravar no stage',
            );
            await registrarErroSync({
              fastify,
              sistema: 'globus',
              recurso: 'depreciacao',
              fase: 'stage_insert',
              syncJobId: job.id,
              chaveNatural: {
                codigo_empresa: linha.CODIGO_EMPRESA,
                periodo: linha.PERIODO,
                cod_conta_ctb: linha.COD_CONTA_CTB,
              },
              rawPayload: linha as unknown as Record<string, unknown>,
              erro: err,
            });
          }
        }

        const duracaoMs = Date.now() - inicio;
        const status: SyncDepreciacaoResult['status'] = comErro === 0 ? 'ok' : comErro < lidos ? 'parcial' : 'erro';

        job.status = status;
        job.terminadoEm = new Date();
        job.registrosLidos = lidos;
        job.registrosGravados = gravados;
        job.registrosComErro = comErro;
        await jobRepo.save(job);

        jobLog.info(
          { status, lidos, gravados, inalterados, comErro, duracaoMs },
          `[sync:globus:depreciacao] concluido (${gravados} novos/alterados, ${inalterados} inalterados, ${comErro} erros, ${duracaoMs}ms)`,
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
        log.error({ err }, '[sync:globus:depreciacao] FALHA');
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

export type GlobusDepreciacaoAdapter = ReturnType<typeof buildGlobusDepreciacaoAdapter>;
