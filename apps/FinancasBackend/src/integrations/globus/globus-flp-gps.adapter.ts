import type { FastifyInstance } from 'fastify';
import { GlobusFlpGpsStage } from '@/entities/globus-flp-gps-stage.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { GLOBUS_QUERIES } from './globus.queries.js';
import { sha256Json } from '@/shared/utils/crypto.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

/** Linha crua do FLP_GPS_INTEGRACPG (GPS/INSS da folha). */
export interface RawFlpGpsRow {
  CODIGO_EMPRESA: number;
  CODIGO_FL: number;
  /** AAAAMM (TO_CHAR da competencia). */
  PERIODO: string;
  TIPO_FOLHA: number;
  COD_IDENT: number | null;
  TIPO_IDENT: string | null;
  VALOR: number | null;
  RETIDO: number | null;
  BASE_CONTRIB: number | null;
  INSS_EMPRESA_COMDESON: number | null;
  INSS_EMPRESA_SEMDESON: number | null;
  COD_DOCTO_CPG: number | null;
}

export interface SyncFolhaGpsParams {
  empresa: number;
  usuarioId?: string | null;
}

export interface SyncFolhaGpsResult {
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
 * Adapter Globus — FLP_GPS_INTEGRACPG (GPS/INSS da folha).
 * Le o INSS patronal calculado pelo Globus (com/sem desoneracao) e popula
 * `integration.globus_flp_gps_stage`. Idempotente via hash_payload.
 */
export function buildGlobusFlpGpsAdapter(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusFlpGpsStage);
  const jobRepo = fastify.db.getRepository(SyncJob);

  return {
    async sincronizar(params: SyncFolhaGpsParams): Promise<SyncFolhaGpsResult> {
      const inicio = Date.now();
      const log = fastify.log.child({
        sync: { sistema: 'globus', recurso: 'folha_gps' },
        params: { empresa: params.empresa },
      });
      log.info('[sync:globus:folha_gps] iniciando — FLP_GPS_INTEGRACPG (INSS patronal da folha)');

      const job = jobRepo.create({
        sistema: 'globus',
        recurso: 'folha_gps',
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
        const result = await fastify.oracle.execute<RawFlpGpsRow>(
          GLOBUS_QUERIES.folhaGpsIntegracpg,
          { empresa: params.empresa },
          { queryName: 'folhaGpsIntegracpg', syncJobId: job.id },
        );
        const queryMs = Date.now() - tQ;
        const linhas = result.rows ?? [];
        const lidos = linhas.length;
        jobLog.info({ lidos, queryMs }, `[sync:globus:folha_gps] query retornou ${lidos} linhas em ${queryMs}ms`);

        let gravados = 0;
        let inalterados = 0;
        let comErro = 0;

        for (const linha of linhas) {
          try {
            const hash = sha256Json(linha);
            const codIdent = linha.COD_IDENT ?? 0;
            const tipoIdent = (linha.TIPO_IDENT ?? '').trim();
            const r = await stageRepo.query<Array<{ inalterado: boolean }>>(
              `INSERT INTO integration.globus_flp_gps_stage
                 (codigo_empresa, codigo_fl, periodo, tipo_folha, cod_ident, tipo_ident,
                  sync_job_id, raw_payload, hash_payload)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
               ON CONFLICT (codigo_empresa, codigo_fl, periodo, tipo_folha, cod_ident, tipo_ident)
               DO UPDATE SET
                 sync_job_id = EXCLUDED.sync_job_id,
                 recebido_em = NOW(),
                 raw_payload = CASE WHEN integration.globus_flp_gps_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                    THEN EXCLUDED.raw_payload
                                    ELSE integration.globus_flp_gps_stage.raw_payload END,
                 hash_payload = EXCLUDED.hash_payload,
                 processado_em = CASE WHEN integration.globus_flp_gps_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                      THEN NULL
                                      ELSE integration.globus_flp_gps_stage.processado_em END
               RETURNING (xmax <> 0 AND integration.globus_flp_gps_stage.hash_payload = $9) AS inalterado`,
              [
                linha.CODIGO_EMPRESA,
                linha.CODIGO_FL,
                linha.PERIODO,
                linha.TIPO_FOLHA,
                codIdent,
                tipoIdent,
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
              { err, periodo: linha.PERIODO, filial: linha.CODIGO_FL },
              '[sync:globus:folha_gps] falha ao gravar no stage',
            );
            await registrarErroSync({
              fastify,
              sistema: 'globus',
              recurso: 'folha_gps',
              fase: 'stage_insert',
              syncJobId: job.id,
              chaveNatural: {
                codigo_empresa: linha.CODIGO_EMPRESA,
                periodo: linha.PERIODO,
                filial: linha.CODIGO_FL,
              },
              rawPayload: linha as unknown as Record<string, unknown>,
              erro: err,
            });
          }
        }

        const duracaoMs = Date.now() - inicio;
        const status: SyncFolhaGpsResult['status'] = comErro === 0 ? 'ok' : comErro < lidos ? 'parcial' : 'erro';

        job.status = status;
        job.terminadoEm = new Date();
        job.registrosLidos = lidos;
        job.registrosGravados = gravados;
        job.registrosComErro = comErro;
        await jobRepo.save(job);

        jobLog.info(
          { status, lidos, gravados, inalterados, comErro, duracaoMs },
          `[sync:globus:folha_gps] concluido (${gravados} novos/alterados, ${inalterados} inalterados, ${comErro} erros, ${duracaoMs}ms)`,
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
        log.error({ err }, '[sync:globus:folha_gps] FALHA');
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

export type GlobusFlpGpsAdapter = ReturnType<typeof buildGlobusFlpGpsAdapter>;
