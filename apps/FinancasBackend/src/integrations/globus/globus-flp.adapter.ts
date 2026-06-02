import type { FastifyInstance } from 'fastify';
import { GlobusFlpEncerramentoStage } from '@/entities/globus-flp-encerramento-stage.entity.js';
import { GlobusFlpFuncStage } from '@/entities/globus-flp-func-stage.entity.js';
import { GlobusFlpEventoStage } from '@/entities/globus-flp-evento-stage.entity.js';
import { GlobusFlpFichaStage } from '@/entities/globus-flp-ficha-stage.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { GLOBUS_QUERIES } from './globus.queries.js';
import { sha256Json } from '@/shared/utils/crypto.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

export interface SyncFlpParams {
  empresa: number;
  /**
   * Lista de filiais (CODIGOFL) a incluir. Default vem de env
   * EMPRESA_GLOBUS_FILIAIS = [1,5,6,17,19]. O filtro `CODIGOFL IN (...)` é
   * aplicado via placeholder __FILIAIS__ resolvido no plugin Oracle —
   * binds nao recebem mais `:filial`.
   *
   * Opcional: se nao informado, o adapter usa `fastify.config.globus.filiais`.
   */
  filiais?: number[];
  /**
   * Mês de referência da folha (YYYY-MM). O adapter busca COMPETFICHA no range
   * [último dia do mês anterior, primeiro dia do mês seguinte) — cobrindo as duas
   * convenções Praxio: folha gravada como último dia do mês trabalhado OU pago.
   */
  competenciaYyyyMm: string;
  /** TIPOFOLHA: null = todas, 1 = mensal, 2 = adiantamento, 3 = 13º, 4 = férias, 5 = rescisão. */
  tipoFolha?: number | null;
  usuarioId?: string | null;
}

interface RawFuncRow {
  COD_INT_FUNC: number | string;
  COD_FUNC: number | string;
  NOME: string | null;
  COD_AREA: number | string | null;
  DESC_AREA: string | null;
  COD_DEPTO: number | string | null;
  DESC_FUNCAO: string | null;
  COD_AGENCIA: string | null;
  CONTA_CORRENTE: string | null;
  CODIGO_EMPRESA: number;
  CODIGO_FL: number;
}

interface RawEventoRow {
  COD_EVENTO: number;
  DESCRICAO: string | null;
  TIPO: string | null;
}

interface RawFichaRow {
  COD_INT_FUNC: number | string;
  COD_FUNC: number | string;
  COD_AREA: number | string | null;
  DESC_AREA: string | null;
  COD_EVENTO: number;
  DESC_EVENTO: string | null;
  TIPO_EVENTO: string | null;
  COMPETENCIA: Date | string;
  TIPO_FOLHA: number;
  REFERENCIA: number | null;
  VALOR: number | null;
}

export interface SyncFlpResult {
  jobId: string;
  funcionariosLidos: number;
  funcionariosGravados: number;
  eventosLidos: number;
  eventosGravados: number;
  fichasLidas: number;
  fichasGravadas: number;
  duracaoMs: number;
  status: 'ok' | 'parcial' | 'erro';
  mensagem?: string;
}

function dataIso(v: Date | string): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : new Date(s).toISOString().slice(0, 10);
}

const BATCH_SIZE = 500;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Adapter Globus — Folha (FLP).
 * Lê VW_FUNCIONARIOS, FLP_EVENTOS, FLP_FICHAEVENTOS do Oracle e popula stage
 * tables em PostgreSQL com upsert idempotente.
 */
interface RawEncerramentoRow {
  CODIGO_EMPRESA: number;
  CODIGO_FL: number;
  TIPO_FOLHA: number;
  COMPETENCIA: Date | string;
}

export function buildGlobusFlpAdapter(fastify: FastifyInstance) {
  const funcStageRepo = fastify.db.getRepository(GlobusFlpFuncStage);
  const eventoStageRepo = fastify.db.getRepository(GlobusFlpEventoStage);
  const fichaStageRepo = fastify.db.getRepository(GlobusFlpFichaStage);
  const encerramentoStageRepo = fastify.db.getRepository(GlobusFlpEncerramentoStage);
  const jobRepo = fastify.db.getRepository(SyncJob);

  return {
    async sincronizar(params: SyncFlpParams): Promise<SyncFlpResult> {
      const inicio = Date.now();
      // Filiais sao aplicadas via placeholder __FILIAIS__ no oraclePlugin
      // a partir de fastify.config.globus.filiais. Aqui registramos somente
      // para auditoria no log/sync_job — nao entram nos binds.
      const filiais = params.filiais ?? fastify.config.globus.filiais;
      // Calcula o range semi-aberto [dt_ini, dt_fim_excl) cobrindo ambas convenções.
      // Para competenciaYyyyMm='2026-05': dt_ini=2026-04-30, dt_fim_excl=2026-06-01.
      const [ano, mes] = params.competenciaYyyyMm.split('-').map(Number);
      const dtIni = new Date(Date.UTC(ano!, mes! - 1, 0)); // último dia do mês anterior
      const dtFimExcl = new Date(Date.UTC(ano!, mes!, 1)); // primeiro dia do mês seguinte
      const dtIniIso = dtIni.toISOString().slice(0, 10);
      const dtFimIso = dtFimExcl.toISOString().slice(0, 10);

      const log = fastify.log.child({
        sync: { sistema: 'globus', recurso: 'folha_flp' },
        params: { empresa: params.empresa, filiais, competencia: params.competenciaYyyyMm, dtIni: dtIniIso, dtFimExcl: dtFimIso, tipoFolha: params.tipoFolha ?? null },
      });
      log.info(`[sync:globus:flp] iniciando sincronização (COMPETFICHA ${dtIniIso} <= x < ${dtFimIso}, filiais=${filiais.join(',')})`);

      const job = jobRepo.create({
        sistema: 'globus',
        recurso: 'folha_flp',
        status: 'rodando',
        parametros: {
          empresa: params.empresa,
          filiais,
          competencia: params.competenciaYyyyMm,
          dtIni: dtIniIso,
          dtFimExcl: dtFimIso,
          tipoFolha: params.tipoFolha ?? null,
        },
        usuarioId: params.usuarioId ?? null,
      });
      await jobRepo.save(job);
      const jobLog = log.child({ jobId: job.id });

      let funcionariosLidos = 0, funcionariosGravados = 0;
      let eventosLidos = 0, eventosGravados = 0;
      let fichasLidas = 0, fichasGravadas = 0;
      let erros = 0;

      try {
        if (!fastify.oracle?.isAvailable?.()) {
          throw new Error('Conexão com Oracle (Globus) indisponível');
        }

        // ============ 0) ENCERRAMENTOS DA FOLHA ============
        // Le FLP_ENCERRAMENTOFICHAFIN no escopo +/- 1 mes da janela alvo —
        // tabela pequena, sync incremental quase de graca. Usado pra decidir
        // se vamos re-sync as fichas (competencia fechada NAO eh reprocessada
        // a menos que stage esteja vazio).
        const tEnc = Date.now();
        const encDtIni = new Date(Date.UTC(ano! - 1, mes! - 1, 1)); // 1 ano antes
        const encDtFimExcl = new Date(Date.UTC(ano!, mes! + 1, 1)); // ate inicio do mes seguinte
        const encerramentos = await fastify.oracle.execute<RawEncerramentoRow>(
          GLOBUS_QUERIES.flpEncerramentos,
          { empresa: params.empresa, dt_ini: encDtIni, dt_fim_excl: encDtFimExcl },
          { queryName: 'flpEncerramentos', syncJobId: job.id },
        );
        const encerramentosLidos = encerramentos.rows?.length ?? 0;
        jobLog.info({ encerramentosLidos, ms: Date.now() - tEnc }, `[sync:globus:flp] (0/3) encerramentos lidos: ${encerramentosLidos}`);

        for (const enc of encerramentos.rows ?? []) {
          try {
            const compIso = dataIso(enc.COMPETENCIA);
            const hash = sha256Json(enc);
            await encerramentoStageRepo.query(
              `INSERT INTO integration.globus_flp_encerramento_stage
                 (codigo_empresa, codigo_fl, tipo_folha, competencia, sync_job_id, raw_payload, hash_payload)
               VALUES ($1, $2, $3, $4::date, $5, $6::jsonb, $7)
               ON CONFLICT (codigo_empresa, codigo_fl, tipo_folha, competencia)
               DO UPDATE SET
                 sync_job_id = EXCLUDED.sync_job_id,
                 recebido_em = NOW(),
                 raw_payload = CASE WHEN integration.globus_flp_encerramento_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                    THEN EXCLUDED.raw_payload
                                    ELSE integration.globus_flp_encerramento_stage.raw_payload END,
                 hash_payload = EXCLUDED.hash_payload,
                 -- Volta para ativo se aparecer (Globus pode reabrir competencia em raros casos)
                 excluido_em = NULL,
                 excluido_motivo = NULL`,
              [enc.CODIGO_EMPRESA, enc.CODIGO_FL, enc.TIPO_FOLHA, compIso, job.id, JSON.stringify(enc), hash],
            );
          } catch (err) {
            jobLog.warn({ err, enc }, '[sync:globus:flp] falha ao gravar encerramento');
          }
        }

        // ============ 1) FUNCIONÁRIOS ============
        jobLog.info('[sync:globus:flp] (1/3) lendo funcionários…');
        const t1 = Date.now();
        const funcs = await fastify.oracle.execute<RawFuncRow>(
          GLOBUS_QUERIES.funcionariosAtivos,
          { empresa: params.empresa },
          { queryName: 'funcionariosAtivos', syncJobId: job.id },
        );
        funcionariosLidos = funcs.rows?.length ?? 0;
        jobLog.info({ funcionariosLidos, ms: Date.now() - t1 }, `[sync:globus:flp] funcionários lidos: ${funcionariosLidos}`);

        const tStageFunc = Date.now();
        for (const batch of chunk(funcs.rows ?? [], BATCH_SIZE)) {
          const values: string[] = [];
          const params: unknown[] = [];
          let i = 1;
          for (const f of batch) {
            values.push(`($${i},$${i + 1},$${i + 2},$${i + 3}::jsonb)`);
            params.push(f.CODIGO_EMPRESA, String(f.COD_INT_FUNC), job.id, JSON.stringify(f));
            i += 4;
          }
          try {
            await funcStageRepo.query(
              `INSERT INTO integration.globus_flp_func_stage (codigo_empresa, cod_int_func, sync_job_id, raw_payload)
               VALUES ${values.join(',')}
               ON CONFLICT (codigo_empresa, cod_int_func)
               DO UPDATE SET raw_payload = EXCLUDED.raw_payload,
                             sync_job_id = EXCLUDED.sync_job_id,
                             recebido_em = NOW(),
                             processado_em = NULL`,
              params,
            );
            funcionariosGravados += batch.length;
          } catch (err) {
            erros += batch.length;
            jobLog.warn({ err, batchSize: batch.length }, '[sync:globus:flp] falha ao gravar lote de funcionários');
            await registrarErroSync({
              fastify,
              sistema: 'globus',
              recurso: 'folha_flp_func',
              fase: 'stage_insert',
              syncJobId: job.id,
              chaveNatural: { lote_size: batch.length, lote_inicio_cod_int_func: batch[0]?.COD_INT_FUNC ?? null },
              rawPayload: { lote_amostra: batch.slice(0, 3) },
              erro: err,
            });
          }
        }
        jobLog.info({ ms: Date.now() - tStageFunc, gravados: funcionariosGravados }, `[sync:globus:flp] stage funcionários ok`);

        // ============ 2) EVENTOS ============
        jobLog.info('[sync:globus:flp] (2/3) lendo catálogo de eventos…');
        const t2 = Date.now();
        const eventos = await fastify.oracle.execute<RawEventoRow>(
          GLOBUS_QUERIES.eventosFolha,
          {},
          { queryName: 'eventosFolha', syncJobId: job.id },
        );
        eventosLidos = eventos.rows?.length ?? 0;
        jobLog.info({ eventosLidos, ms: Date.now() - t2 }, `[sync:globus:flp] eventos lidos: ${eventosLidos}`);

        for (const batch of chunk(eventos.rows ?? [], BATCH_SIZE)) {
          const values: string[] = [];
          const params: unknown[] = [];
          let i = 1;
          for (const e of batch) {
            values.push(`($${i},$${i + 1},$${i + 2}::jsonb)`);
            params.push(e.COD_EVENTO, job.id, JSON.stringify(e));
            i += 3;
          }
          try {
            await eventoStageRepo.query(
              `INSERT INTO integration.globus_flp_evento_stage (cod_evento, sync_job_id, raw_payload)
               VALUES ${values.join(',')}
               ON CONFLICT (cod_evento)
               DO UPDATE SET raw_payload = EXCLUDED.raw_payload,
                             sync_job_id = EXCLUDED.sync_job_id,
                             recebido_em = NOW(),
                             processado_em = NULL`,
              params,
            );
            eventosGravados += batch.length;
          } catch (err) {
            erros += batch.length;
            jobLog.warn({ err, batchSize: batch.length }, '[sync:globus:flp] falha ao gravar lote de eventos');
            await registrarErroSync({
              fastify,
              sistema: 'globus',
              recurso: 'folha_flp_evento',
              fase: 'stage_insert',
              syncJobId: job.id,
              chaveNatural: { lote_size: batch.length, lote_inicio_cod_evento: batch[0]?.COD_EVENTO ?? null },
              rawPayload: { lote_amostra: batch.slice(0, 3) },
              erro: err,
            });
          }
        }

        // ============ 3) FICHA DE EVENTOS ============
        // Checa encerramento: se a competencia (corrigida pela convencao Praxio
        // de dia >=28 ir pro mes seguinte) ja esta marcada como fechada E o
        // stage local ja tem dados pra esse escopo, pulamos o re-sync.
        // Motivacao: ficha de competencia fechada nao muda — re-sync gasta
        // CPU do Oracle a toa e marca tudo como "sumiu_do_sync" se errar.
        const competenciaAlvo = `${ano}-${String(mes).padStart(2, '0')}-01`;
        const encerramentoRow = await encerramentoStageRepo.query<Array<{ competencia: string; tipo_folha: number; codigo_fl: number }>>(
          params.tipoFolha
            ? `SELECT competencia::text, tipo_folha, codigo_fl
                 FROM integration.globus_flp_encerramento_stage
                WHERE codigo_empresa = $1
                  AND tipo_folha = $2
                  AND DATE_TRUNC('month', competencia) = $3::date
                  AND excluido_em IS NULL
                LIMIT 1`
            : `SELECT competencia::text, tipo_folha, codigo_fl
                 FROM integration.globus_flp_encerramento_stage
                WHERE codigo_empresa = $1
                  AND DATE_TRUNC('month', competencia) = $2::date
                  AND excluido_em IS NULL
                LIMIT 1`,
          params.tipoFolha
            ? [params.empresa, params.tipoFolha, competenciaAlvo]
            : [params.empresa, competenciaAlvo],
        );
        const fechada = encerramentoRow.length > 0;

        let stageJaTemDados = false;
        if (fechada) {
          // So pula se tambem ja temos os dados localmente (idempotente: 1a vez
          // de uma competencia fechada ainda precisa puxar pra popular)
          const cnt = await fichaStageRepo.query<Array<{ qtd: string }>>(
            params.tipoFolha
              ? `SELECT COUNT(*)::text AS qtd FROM integration.globus_flp_ficha_stage
                  WHERE competencia >= $1::date AND competencia < $2::date AND tipo_folha = $3 AND excluido_em IS NULL`
              : `SELECT COUNT(*)::text AS qtd FROM integration.globus_flp_ficha_stage
                  WHERE competencia >= $1::date AND competencia < $2::date AND excluido_em IS NULL`,
            params.tipoFolha ? [dtIniIso, dtFimIso, params.tipoFolha] : [dtIniIso, dtFimIso],
          );
          stageJaTemDados = Number(cnt[0]?.qtd ?? 0) > 0;
        }

        let fichas: { rows?: RawFichaRow[] };
        if (fechada && stageJaTemDados) {
          jobLog.info(
            { competencia: params.competenciaYyyyMm, tipoFolha: params.tipoFolha ?? null },
            `[sync:globus:flp] (3/3) PULANDO — competencia ja encerrada na Praxio + stage ja tem dados. Re-sync seria reprocesso inutil.`,
          );
          fichas = { rows: [] };
        } else {
          jobLog.info(
            { dtIni: dtIniIso, dtFimExcl: dtFimIso, tipoFolha: params.tipoFolha ?? null, fechada, stageJaTemDados },
            `[sync:globus:flp] (3/3) lendo ficha de eventos…`,
          );
          const t3 = Date.now();
          fichas = await fastify.oracle.execute<RawFichaRow>(
            GLOBUS_QUERIES.fichaEventos,
            {
              empresa: params.empresa,
              dt_ini: dtIni,
              dt_fim_excl: dtFimExcl,
              tipo_folha: params.tipoFolha ?? null,
            },
            { queryName: 'fichaEventos', syncJobId: job.id },
          );
          jobLog.info({ fichasLidas: fichas.rows?.length ?? 0, ms: Date.now() - t3 }, `[sync:globus:flp] fichas lidas: ${fichas.rows?.length ?? 0}`);
        }
        fichasLidas = fichas.rows?.length ?? 0;
        if (fichasLidas === 0 && !(fechada && stageJaTemDados)) {
          jobLog.warn(`[sync:globus:flp] ZERO fichas no range ${dtIniIso} <= COMPETFICHA < ${dtFimIso}. Confira se a folha já foi processada na Praxio para esta competência.`);
        }

        const tStageFicha = Date.now();
        const batchesFicha = chunk(fichas.rows ?? [], BATCH_SIZE);
        for (let b = 0; b < batchesFicha.length; b++) {
          const batch = batchesFicha[b]!;
          const values: string[] = [];
          const paramsArr: unknown[] = [];
          let i = 1;
          for (const fi of batch) {
            const hash = sha256Json(fi);
            values.push(`($${i},$${i + 1}::date,$${i + 2},$${i + 3},$${i + 4},$${i + 5}::jsonb,$${i + 6})`);
            paramsArr.push(
              String(fi.COD_INT_FUNC),
              dataIso(fi.COMPETENCIA),
              fi.COD_EVENTO,
              fi.TIPO_FOLHA,
              job.id,
              JSON.stringify(fi),
              hash,
            );
            i += 7;
          }
          try {
            await fichaStageRepo.query(
              `INSERT INTO integration.globus_flp_ficha_stage
                 (cod_int_func, competencia, cod_evento, tipo_folha, sync_job_id, raw_payload, hash_payload)
               VALUES ${values.join(',')}
               ON CONFLICT (cod_int_func, competencia, cod_evento, tipo_folha)
               DO UPDATE SET
                 sync_job_id  = EXCLUDED.sync_job_id,
                 recebido_em  = NOW(),
                 raw_payload  = CASE WHEN integration.globus_flp_ficha_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                     THEN EXCLUDED.raw_payload
                                     ELSE integration.globus_flp_ficha_stage.raw_payload END,
                 hash_payload = EXCLUDED.hash_payload,
                 processado_em = CASE WHEN integration.globus_flp_ficha_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                      THEN NULL
                                      ELSE integration.globus_flp_ficha_stage.processado_em END,
                 -- Reativa registros que voltaram a aparecer no sync (raro mas possivel).
                 excluido_em = NULL,
                 excluido_motivo = NULL`,
              paramsArr,
            );
            fichasGravadas += batch.length;
          } catch (err) {
            erros += batch.length;
            jobLog.warn({ err, batchSize: batch.length, batchIndex: b }, '[sync:globus:flp] falha ao gravar lote de ficha');
            await registrarErroSync({
              fastify,
              sistema: 'globus',
              recurso: 'folha_flp_ficha',
              fase: 'stage_insert',
              syncJobId: job.id,
              chaveNatural: {
                batch_index: b,
                lote_size: batch.length,
                competencia: batch[0]?.COMPETENCIA ?? null,
                tipo_folha: batch[0]?.TIPO_FOLHA ?? null,
              },
              rawPayload: { lote_amostra: batch.slice(0, 3) },
              erro: err,
            });
          }

          if ((b + 1) % 10 === 0 || b === batchesFicha.length - 1) {
            jobLog.info(
              { progresso: fichasGravadas, total: fichasLidas, lotes: `${b + 1}/${batchesFicha.length}`, ms: Date.now() - tStageFicha },
              `[sync:globus:flp] stage ficha: ${fichasGravadas}/${fichasLidas}`,
            );
          }
        }

        // Diff de sync para FLP_FICHA: marca como 'sumiu_do_sync' qualquer registro
        // que estava no escopo (competencia entre dtIni e dtFimExcl, tipo_folha
        // se informado) e nao foi tocado nesta rodada (sync_job_id != atual).
        const sqlDiff = params.tipoFolha
          ? `WITH atualizados AS (
               UPDATE integration.globus_flp_ficha_stage
                  SET excluido_em = COALESCE(excluido_em, NOW()),
                      excluido_motivo = COALESCE(excluido_motivo, 'sumiu_do_sync')
                WHERE competencia >= $1::date
                  AND competencia <  $2::date
                  AND tipo_folha = $3
                  AND (sync_job_id IS DISTINCT FROM $4 OR sync_job_id IS NULL)
                  AND excluido_em IS NULL
                RETURNING id
             )
             SELECT COUNT(*)::text AS marcados FROM atualizados`
          : `WITH atualizados AS (
               UPDATE integration.globus_flp_ficha_stage
                  SET excluido_em = COALESCE(excluido_em, NOW()),
                      excluido_motivo = COALESCE(excluido_motivo, 'sumiu_do_sync')
                WHERE competencia >= $1::date
                  AND competencia <  $2::date
                  AND (sync_job_id IS DISTINCT FROM $3 OR sync_job_id IS NULL)
                  AND excluido_em IS NULL
                RETURNING id
             )
             SELECT COUNT(*)::text AS marcados FROM atualizados`;
        const paramsSqlDiff = params.tipoFolha
          ? [dtIniIso, dtFimIso, params.tipoFolha, job.id]
          : [dtIniIso, dtFimIso, job.id];
        const diff = await fichaStageRepo.query<Array<{ marcados: string }>>(sqlDiff, paramsSqlDiff);
        const sumiramDoSync = Number(diff[0]?.marcados ?? 0);
        if (sumiramDoSync > 0) {
          jobLog.info({ sumiramDoSync }, `[sync:globus:flp] ${sumiramDoSync} fichas marcadas como sumiu_do_sync`);
        }

        const duracaoMs = Date.now() - inicio;
        const status: SyncFlpResult['status'] = erros === 0 ? 'ok' : 'parcial';

        job.status = status;
        job.terminadoEm = new Date();
        job.registrosLidos = funcionariosLidos + eventosLidos + fichasLidas;
        job.registrosGravados = funcionariosGravados + eventosGravados + fichasGravadas;
        job.registrosComErro = erros;
        await jobRepo.save(job);

        jobLog.info(
          { status, funcionariosLidos, funcionariosGravados, eventosLidos, eventosGravados, fichasLidas, fichasGravadas, erros, duracaoMs },
          `[sync:globus:flp] adapter concluído (${duracaoMs}ms)`,
        );

        return {
          jobId: job.id,
          funcionariosLidos,
          funcionariosGravados,
          eventosLidos,
          eventosGravados,
          fichasLidas,
          fichasGravadas,
          duracaoMs,
          status,
        };
      } catch (err) {
        const message = (err as Error).message;
        jobLog.error({ err }, '[sync:globus:flp] FALHA - sincronização abortada');
        job.status = 'erro';
        job.terminadoEm = new Date();
        job.erroMensagem = message;
        await jobRepo.save(job);

        return {
          jobId: job.id,
          funcionariosLidos,
          funcionariosGravados,
          eventosLidos,
          eventosGravados,
          fichasLidas,
          fichasGravadas,
          duracaoMs: Date.now() - inicio,
          status: 'erro',
          mensagem: message,
        };
      }
    },
  };
}

export type GlobusFlpAdapter = ReturnType<typeof buildGlobusFlpAdapter>;
