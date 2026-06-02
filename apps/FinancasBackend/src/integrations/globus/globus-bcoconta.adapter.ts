import type { FastifyInstance } from 'fastify';
import { GlobusBcocontaStage } from '@/entities/globus-bcoconta-stage.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { GLOBUS_QUERIES } from './globus.queries.js';
import { sha256Json } from '@/shared/utils/crypto.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

export interface RawBcoContaRow {
  COD_BANCO: number;
  COD_AGENCIA: number;
  COD_CONTA_BCO: string;
  DIGITO: string | null;
  NOME_CONTA_BCO: string;
  CODIGO_EMPRESA: number;
  CODIGO_FL: number;
  SALDO_INICIAL: number | null;
  SALDO_ACM_ATE_DATA: number | null;
  DATA_SALDO_ACM: Date | null;
  LIMITE_CREDITO: number | null;
  DT_LIMITE_MOVTO: Date | null;
  CONTA_CAIXA: string | null;
  COMPOE_POSICAO_FINANCEIRA: string | null;
  CONTA_ATIVA: string | null;
  INATIVA: string | null;
  COD_CONTA_CTB: number | null;
  COD_CUSTO: number | null;
  CHAVE_PIX: string | null;
  TIPO_CHAVE_PIX: number | null;
}

export interface SyncBcoContaParams {
  empresa: number;
  usuarioId?: string | null;
}

export interface SyncBcoContaResult {
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
 * Adapter Globus — BCOCONTA (cadastro de contas bancarias).
 *
 * Le contas REAIS da Pioneira (filtros pra descartar contas contabeis e
 * inativas — ver `globus.queries.ts > bcoContaCadastro`) e popula
 * `integration.globus_bcoconta_stage`. Idempotente via hash_payload.
 *
 * NOTA: nao recebe periodo (dtIni/dtFim) porque BCOCONTA e cadastro, nao
 * movimentacao. Sync e completa a cada execucao.
 */
export function buildGlobusBcocontaAdapter(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusBcocontaStage);
  const jobRepo = fastify.db.getRepository(SyncJob);

  return {
    async sincronizar(params: SyncBcoContaParams): Promise<SyncBcoContaResult> {
      const inicio = Date.now();
      const log = fastify.log.child({
        sync: { sistema: 'globus', recurso: 'banco_conta' },
        params: { empresa: params.empresa },
      });
      log.info('[sync:globus:bcoconta] iniciando');

      const job = jobRepo.create({
        sistema: 'globus',
        recurso: 'banco_conta',
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
        const result = await fastify.oracle.execute<RawBcoContaRow>(
          GLOBUS_QUERIES.bcoContaCadastro,
          { empresa: params.empresa },
          { queryName: 'bcoContaCadastro', syncJobId: job.id },
        );
        const queryMs = Date.now() - tQ;
        const linhas = result.rows ?? [];
        const lidos = linhas.length;
        jobLog.info({ lidos, queryMs }, `[sync:globus:bcoconta] query retornou ${lidos} contas em ${queryMs}ms`);

        let gravados = 0;
        let inalterados = 0;
        let comErro = 0;

        for (const linha of linhas) {
          try {
            const hash = sha256Json(linha);
            const r = await stageRepo.query<Array<{ inalterado: boolean }>>(
              `INSERT INTO integration.globus_bcoconta_stage
                 (cod_banco, cod_agencia, cod_conta_bco, codigo_empresa, codigo_fl,
                  sync_job_id, raw_payload, hash_payload)
               VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
               ON CONFLICT (cod_banco, cod_agencia, cod_conta_bco)
               DO UPDATE SET
                 sync_job_id = EXCLUDED.sync_job_id,
                 codigo_empresa = EXCLUDED.codigo_empresa,
                 codigo_fl = EXCLUDED.codigo_fl,
                 recebido_em = NOW(),
                 raw_payload = CASE WHEN integration.globus_bcoconta_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                    THEN EXCLUDED.raw_payload
                                    ELSE integration.globus_bcoconta_stage.raw_payload END,
                 hash_payload = EXCLUDED.hash_payload,
                 processado_em = CASE WHEN integration.globus_bcoconta_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                      THEN NULL
                                      ELSE integration.globus_bcoconta_stage.processado_em END
               RETURNING (xmax <> 0 AND integration.globus_bcoconta_stage.hash_payload = $8) AS inalterado`,
              [
                linha.COD_BANCO,
                linha.COD_AGENCIA,
                linha.COD_CONTA_BCO,
                linha.CODIGO_EMPRESA,
                linha.CODIGO_FL,
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
              { err, conta: `${linha.COD_BANCO}-${linha.COD_AGENCIA}-${linha.COD_CONTA_BCO}` },
              '[sync:globus:bcoconta] falha ao gravar no stage',
            );
            await registrarErroSync({
              fastify,
              sistema: 'globus',
              recurso: 'banco_conta',
              fase: 'stage_insert',
              syncJobId: job.id,
              chaveNatural: {
                cod_banco: linha.COD_BANCO,
                cod_agencia: linha.COD_AGENCIA,
                cod_conta_bco: linha.COD_CONTA_BCO,
              },
              rawPayload: linha as unknown as Record<string, unknown>,
              erro: err,
            });
          }
        }

        const duracaoMs = Date.now() - inicio;
        const status: SyncBcoContaResult['status'] = comErro === 0 ? 'ok' : comErro < lidos ? 'parcial' : 'erro';

        job.status = status;
        job.terminadoEm = new Date();
        job.registrosLidos = lidos;
        job.registrosGravados = gravados;
        job.registrosComErro = comErro;
        await jobRepo.save(job);

        jobLog.info(
          { status, lidos, gravados, inalterados, comErro, duracaoMs },
          `[sync:globus:bcoconta] concluido (${gravados} novos/alterados, ${inalterados} inalterados, ${comErro} erros, ${duracaoMs}ms)`,
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
        log.error({ err }, '[sync:globus:bcoconta] FALHA');
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

export type GlobusBcocontaAdapter = ReturnType<typeof buildGlobusBcocontaAdapter>;
