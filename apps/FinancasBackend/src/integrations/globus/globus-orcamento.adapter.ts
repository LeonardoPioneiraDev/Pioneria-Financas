import type { FastifyInstance } from 'fastify';
import { GlobusCpgorcStage } from '@/entities/globus-cpgorc-stage.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { GLOBUS_QUERIES } from './globus.queries.js';
import { sha256Json } from '@/shared/utils/crypto.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

/** Linha crua do CPGORCPREVISOES (previsao de orcamento). */
export interface RawOrcamentoRow {
  COD_INT_ORC: number;
  CODIGO_EMPRESA: number;
  CODIGO_FL: number | null;
  /** 'YYYY-MM-DD' (TO_CHAR da DATAPREVISAO — evita ambiguidade de timezone). */
  DATA_PREVISAO: string | null;
  TIPO_RECEITA: number | null;
  TIPO_DESPESA: number | null;
  CCUSTOFINANC: number | null;
  CENTRO_CUSTO_DESC: string | null;
  VALOR: number | null;
  JUSTIFICATIVA: string | null;
}

export interface SyncOrcamentoParams {
  empresa: number;
  usuarioId?: string | null;
}

export interface SyncOrcamentoResult {
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
 * Adapter Globus — CPGORCPREVISOES (baseline historico de orcamento).
 * Le o orcado legado (2018-2020) e popula `integration.globus_cpgorc_stage`.
 * Idempotente via hash_payload. Ver Leia/orcamento-mapeamento.md.
 */
export function buildGlobusOrcamentoAdapter(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusCpgorcStage);
  const jobRepo = fastify.db.getRepository(SyncJob);

  return {
    async sincronizar(params: SyncOrcamentoParams): Promise<SyncOrcamentoResult> {
      const inicio = Date.now();
      const log = fastify.log.child({
        sync: { sistema: 'globus', recurso: 'orcamento' },
        params: { empresa: params.empresa },
      });
      log.info('[sync:globus:orcamento] iniciando — CPGORCPREVISOES (baseline historico)');

      const job = jobRepo.create({
        sistema: 'globus',
        recurso: 'orcamento',
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
        const result = await fastify.oracle.execute<RawOrcamentoRow>(
          GLOBUS_QUERIES.orcamentoPrevisoes,
          { empresa: params.empresa },
          { queryName: 'orcamentoPrevisoes', syncJobId: job.id },
        );
        const queryMs = Date.now() - tQ;
        const linhas = result.rows ?? [];
        const lidos = linhas.length;
        jobLog.info({ lidos, queryMs }, `[sync:globus:orcamento] query retornou ${lidos} linhas em ${queryMs}ms`);

        let gravados = 0;
        let inalterados = 0;
        let comErro = 0;

        for (const linha of linhas) {
          try {
            const hash = sha256Json(linha);
            const r = await stageRepo.query<Array<{ inalterado: boolean }>>(
              `INSERT INTO integration.globus_cpgorc_stage
                 (codigo_empresa, cod_int_orc, sync_job_id, raw_payload, hash_payload)
               VALUES ($1, $2, $3, $4::jsonb, $5)
               ON CONFLICT (codigo_empresa, cod_int_orc)
               DO UPDATE SET
                 sync_job_id = EXCLUDED.sync_job_id,
                 recebido_em = NOW(),
                 raw_payload = CASE WHEN integration.globus_cpgorc_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                    THEN EXCLUDED.raw_payload
                                    ELSE integration.globus_cpgorc_stage.raw_payload END,
                 hash_payload = EXCLUDED.hash_payload,
                 processado_em = CASE WHEN integration.globus_cpgorc_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                      THEN NULL
                                      ELSE integration.globus_cpgorc_stage.processado_em END
               RETURNING (xmax <> 0 AND integration.globus_cpgorc_stage.hash_payload = $5) AS inalterado`,
              [linha.CODIGO_EMPRESA, linha.COD_INT_ORC, job.id, JSON.stringify(linha), hash],
            );
            if (r[0]?.inalterado) inalterados += 1;
            else gravados += 1;
          } catch (err) {
            comErro += 1;
            jobLog.warn(
              { err, codIntOrc: linha.COD_INT_ORC },
              '[sync:globus:orcamento] falha ao gravar no stage',
            );
            await registrarErroSync({
              fastify,
              sistema: 'globus',
              recurso: 'orcamento',
              fase: 'stage_insert',
              syncJobId: job.id,
              chaveNatural: {
                codigo_empresa: linha.CODIGO_EMPRESA,
                cod_int_orc: linha.COD_INT_ORC,
              },
              rawPayload: linha as unknown as Record<string, unknown>,
              erro: err,
            });
          }
        }

        const duracaoMs = Date.now() - inicio;
        const status: SyncOrcamentoResult['status'] = comErro === 0 ? 'ok' : comErro < lidos ? 'parcial' : 'erro';

        job.status = status;
        job.terminadoEm = new Date();
        job.registrosLidos = lidos;
        job.registrosGravados = gravados;
        job.registrosComErro = comErro;
        await jobRepo.save(job);

        jobLog.info(
          { status, lidos, gravados, inalterados, comErro, duracaoMs },
          `[sync:globus:orcamento] concluido (${gravados} novos/alterados, ${inalterados} inalterados, ${comErro} erros, ${duracaoMs}ms)`,
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
        log.error({ err }, '[sync:globus:orcamento] FALHA');
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

export type GlobusOrcamentoAdapter = ReturnType<typeof buildGlobusOrcamentoAdapter>;
