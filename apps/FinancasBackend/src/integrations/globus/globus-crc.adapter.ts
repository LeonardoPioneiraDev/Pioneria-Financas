import type { FastifyInstance } from 'fastify';
import { GlobusCrcStage } from '@/entities/globus-crc-stage.entity.js';
import { GlobusCrcClienteStage } from '@/entities/globus-crc-cliente-stage.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { GLOBUS_QUERIES } from './globus.queries.js';
import { sha256Json } from '@/shared/utils/crypto.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

export interface SyncCrcParams {
  empresa: number;
  dtInicio: Date;
  dtFimExclusivo: Date;
  usuarioId?: string | null;
}

interface RawCliente {
  COD_CLI: number | string;
  NR_CLI: string | null;
  RAZAO_SOCIAL: string | null;
  NOME_FANTASIA: string | null;
  TIPO_INSCRICAO: string | null;
  NUMERO_INSCRICAO: string | null;
  EMAIL: string | null;
  TELEFONE: string | null;
  ENDERECO: string | null;
  BAIRRO: string | null;
  CIDADE: string | null;
  UF: string | null;
  CEP: string | null;
  CONDICAO: string | null;
  DATA_CADASTRO: Date | null;
  ULTIMO_MOVTO: Date | null;
  BANCO_FAT: number | null;
  AGENCIA_FAT: number | null;
  CONTA_FAT: string | null;
}

interface RawCrcTitulo {
  COD_DOCTO_CRC: number;
  CODIGO_EMPRESA: number;
  CODIGO_FL: number | null;
  COD_CLI: number;
  NUMERO_DOCUMENTO: string | null;
  SERIE_DOCUMENTO: string | null;
  NUMERO_PARCELA: number | null;
  TIPO_DOCUMENTO: string | null;
  DATA_EMISSAO: Date | null;
  DATA_SAIDA: Date | null;
  DATA_VENCIMENTO: Date;
  DATA_VENCIMENTO_ORIGINAL: Date | null;
  DATA_RECEBIMENTO: Date | null;
  DESCONTO: number | null;
  ACRESCIMO: number | null;
  STATUS_DOCTO: string;
  QUITADO: string | null;
  RENEGOCIADO: string | null;
  PROTESTADO: string | null;
  DATA_PROTESTO: Date | null;
  VLR_INSS: number | null;
  VLR_IRRF: number | null;
  VLR_PIS: number | null;
  VLR_COFINS: number | null;
  VLR_CSLL: number | null;
  VLR_ISS: number | null;
  BANCO_COBRANCA: number | null;
  AGENCIA_COBRANCA: number | null;
  CONTA_COBRANCA: string | null;
  NOSSO_NUMERO: string | null;
  COBELETRONICA_STATUS: string | null;
  MSG_BOLETO: string | null;
  FATURA_IMPRESSA: string | null;
  CARTAO_AUTORIZACAO: string | null;
  CARTAO_TID: string | null;
  CARTAO_PARCELAS: number | null;
  OBSERVACAO: string | null;
  USUARIO_INCLUSAO: string | null;
  SISTEMA_ORIGEM: string | null;
  VLR_TOTAL_ITENS: number | null;
}

interface RawCrcItem {
  COD_DOCTO_CRC: number;
  COD_ITEM_DOC: number;
  VALOR_ITEM: number;
  COD_TP_RECEITA: string | null;
  CONTA_CONTABIL: number | null;
  CENTRO_CUSTO: number | null;
  CENTRO_CUSTO_FIN: number | null;
  OBSERVACAO: string | null;
  ITEM_RATEADO: string | null;
}

export interface SyncCrcResult {
  jobId: string;
  clientesLidos: number;
  clientesGravados: number;
  titulosLidos: number;
  titulosGravados: number;
  itensLidos: number;
  itensGravados: number;
  duracaoMs: number;
  status: 'ok' | 'parcial' | 'erro';
  mensagem?: string;
}

const BATCH = 500;
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Adapter Globus — Contas a Receber.
 * Lê CRCDOCTO + CRCITDOC + BGM_CLIENTE do Oracle e popula stage idempotente.
 */
export function buildGlobusCrcAdapter(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusCrcStage);
  const clienteStageRepo = fastify.db.getRepository(GlobusCrcClienteStage);
  const jobRepo = fastify.db.getRepository(SyncJob);

  return {
    async sincronizar(params: SyncCrcParams): Promise<SyncCrcResult> {
      const inicio = Date.now();
      const dtIniIso = params.dtInicio.toISOString().slice(0, 10);
      const dtFimIso = params.dtFimExclusivo.toISOString().slice(0, 10);

      const log = fastify.log.child({
        sync: { sistema: 'globus', recurso: 'contas_receber' },
        params: { empresa: params.empresa, dt_ini: dtIniIso, dt_fim_excl: dtFimIso },
      });
      log.info(`[sync:globus:crc] iniciando — vencimento [${dtIniIso}, ${dtFimIso})`);

      const job = jobRepo.create({
        sistema: 'globus',
        recurso: 'contas_receber',
        status: 'rodando',
        parametros: {
          empresa: params.empresa,
          dtIni: params.dtInicio.toISOString(),
          dtFimExclusivo: params.dtFimExclusivo.toISOString(),
        },
        usuarioId: params.usuarioId ?? null,
      });
      await jobRepo.save(job);
      const jobLog = log.child({ jobId: job.id });

      let clientesLidos = 0, clientesGravados = 0;
      let titulosLidos = 0, titulosGravados = 0;
      let itensLidos = 0, itensGravados = 0;
      let erros = 0;

      try {
        if (!fastify.oracle?.isAvailable?.()) {
          throw new Error('Conexão com Oracle (Globus) indisponível');
        }

        // ============ 1) CLIENTES ATIVOS ============
        jobLog.info('[sync:globus:crc] (1/3) lendo clientes ativos…');
        const tClientes = Date.now();
        const clientesRs = await fastify.oracle.execute<RawCliente>(
          GLOBUS_QUERIES.clientesAtivos,
          { empresa: params.empresa },
          { queryName: 'clientesAtivos', syncJobId: job.id },
        );
        clientesLidos = clientesRs.rows?.length ?? 0;
        jobLog.info({ clientesLidos, ms: Date.now() - tClientes }, `[sync:globus:crc] ${clientesLidos} clientes lidos`);

        for (const lote of chunk(clientesRs.rows ?? [], BATCH)) {
          const valores: string[] = [];
          const params2: unknown[] = [];
          let p = 1;
          for (const cli of lote) {
            valores.push(`($${p},$${p + 1},$${p + 2}::jsonb)`);
            params2.push(String(cli.COD_CLI), job.id, JSON.stringify(cli));
            p += 3;
          }
          try {
            await clienteStageRepo.query(
              `INSERT INTO integration.globus_crc_cliente_stage (cod_cli, sync_job_id, raw_payload)
               VALUES ${valores.join(',')}
               ON CONFLICT (cod_cli)
               DO UPDATE SET raw_payload = EXCLUDED.raw_payload, sync_job_id = EXCLUDED.sync_job_id,
                             recebido_em = NOW(), processado_em = NULL`,
              params2,
            );
            clientesGravados += lote.length;
          } catch (err) {
            erros += lote.length;
            jobLog.warn({ err, loteSize: lote.length }, '[sync:globus:crc] falha lote cliente');
            // Registra UMA entrada DLQ pelo lote — o payload do lote inteiro
            // ajuda a debugar, mesmo que perca a granularidade por cliente.
            await registrarErroSync({
              fastify,
              sistema: 'globus',
              recurso: 'contas_receber_cliente',
              fase: 'stage_insert',
              syncJobId: job.id,
              chaveNatural: { lote_size: lote.length, lote_inicio_cod_cli: lote[0]?.COD_CLI ?? null },
              rawPayload: { lote_amostra: lote.slice(0, 3) },
              erro: err,
            });
          }
        }

        // ============ 2) TÍTULOS ============
        jobLog.info('[sync:globus:crc] (2/3) lendo títulos CRCDOCTO…');
        const tTitulos = Date.now();
        const titulosRs = await fastify.oracle.execute<RawCrcTitulo>(
          GLOBUS_QUERIES.contasReceber,
          {
            empresa: params.empresa,
            dt_ini: params.dtInicio,
            dt_fim_excl: params.dtFimExclusivo,
          },
          { queryName: 'contasReceber', syncJobId: job.id },
        );
        titulosLidos = titulosRs.rows?.length ?? 0;
        jobLog.info({ titulosLidos, ms: Date.now() - tTitulos }, `[sync:globus:crc] ${titulosLidos} títulos lidos`);

        // Coleta os IDs pra buscar os itens em uma única query (com IN dinâmico).
        const idsDocto: number[] = (titulosRs.rows ?? []).map((t) => Number(t.COD_DOCTO_CRC));

        // ============ 2.5) ITENS (CRCITDOC) ============
        const itensPorDocto = new Map<number, RawCrcItem[]>();
        if (idsDocto.length > 0) {
          jobLog.info(`[sync:globus:crc] (2.5/3) lendo ${idsDocto.length * 2} itens estimados…`);
          // IN em batches de 1000 (Oracle suporta até ~1000 valores por IN list)
          for (const subset of chunk(idsDocto, 1000)) {
            const placeholders = subset.map((_, i) => `:id${i}`).join(',');
            const sql = GLOBUS_QUERIES.contasReceberItensTemplate.replace('__IN_PLACEHOLDER__', placeholders);
            const binds: Record<string, number> = {};
            subset.forEach((id, i) => { binds[`id${i}`] = id; });
            const itensRs = await fastify.oracle.execute<RawCrcItem>(sql, binds, {
              queryName: 'contasReceberItens',
              syncJobId: job.id,
            });
            for (const item of itensRs.rows ?? []) {
              const idDocto = Number(item.COD_DOCTO_CRC);
              if (!itensPorDocto.has(idDocto)) itensPorDocto.set(idDocto, []);
              itensPorDocto.get(idDocto)!.push(item);
              itensLidos++;
            }
          }
          jobLog.info({ itensLidos }, `[sync:globus:crc] ${itensLidos} itens lidos`);
        }

        // ============ 3) GRAVA STAGE (título + itens embutidos) ============
        // Comportamento (Sprint 2.3 — espelha globus-cp.adapter):
        //   - Hash do payload {titulo, itens} pula update quando inalterado.
        //   - STATUSDOCTOCRC='C' marca excluido_em='cancelado_no_globus'.
        //   - Pos-sync, marca como 'sumiu_do_sync' tudo que estava no escopo e
        //     nao foi tocado nesta rodada.
        const tStage = Date.now();
        let titulosCancelados = 0;
        for (const lote of chunk(titulosRs.rows ?? [], BATCH)) {
          // Cada linha grava 7 valores: empresa, cod, jobId, payload, itens, hash, motivo
          // O CASE WHEN motivo IS NULL THEN NULL ELSE NOW() END para excluido_em
          // referencia o mesmo $idx_motivo (sem duplicar bind).
          const valores: string[] = [];
          const params3: unknown[] = [];
          let p = 1;
          for (const t of lote) {
            const itens = itensPorDocto.get(Number(t.COD_DOCTO_CRC)) ?? [];
            const payload = { titulo: t, itens };
            const hash = sha256Json(payload);
            const cancelado = String(t.STATUS_DOCTO ?? '').toUpperCase() === 'C';
            const motivo = cancelado ? 'cancelado_no_globus' : null;
            if (cancelado) titulosCancelados += 1;
            // empresa($p), cod($p+1), jobId($p+2), payload($p+3), itens($p+4), hash($p+5), motivo($p+6)
            // excluido_em = CASE WHEN $p+6 IS NULL THEN NULL ELSE NOW() END
            valores.push(
              `($${p},$${p + 1},$${p + 2},$${p + 3}::jsonb,$${p + 4}::jsonb,$${p + 5},` +
              `CASE WHEN $${p + 6}::varchar IS NULL THEN NULL ELSE NOW() END,$${p + 6})`,
            );
            params3.push(
              t.CODIGO_EMPRESA,
              String(t.COD_DOCTO_CRC),
              job.id,
              JSON.stringify(t),
              JSON.stringify(itens),
              hash,
              motivo,
            );
            p += 7;
          }
          try {
            await stageRepo.query(
              `INSERT INTO integration.globus_crc_stage
                 (codigo_empresa, cod_docto_crc, sync_job_id, raw_payload, raw_itens, hash_payload,
                  excluido_em, excluido_motivo)
               VALUES ${valores.join(',')}
               ON CONFLICT (codigo_empresa, cod_docto_crc)
               DO UPDATE SET
                 sync_job_id  = EXCLUDED.sync_job_id,
                 recebido_em  = NOW(),
                 raw_payload  = CASE WHEN integration.globus_crc_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                     THEN EXCLUDED.raw_payload
                                     ELSE integration.globus_crc_stage.raw_payload END,
                 raw_itens    = CASE WHEN integration.globus_crc_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                     THEN EXCLUDED.raw_itens
                                     ELSE integration.globus_crc_stage.raw_itens END,
                 hash_payload = EXCLUDED.hash_payload,
                 processado_em = CASE WHEN integration.globus_crc_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                      THEN NULL
                                      ELSE integration.globus_crc_stage.processado_em END,
                 excluido_em = CASE
                   WHEN EXCLUDED.excluido_motivo IS NULL THEN NULL
                   WHEN integration.globus_crc_stage.excluido_em IS NULL THEN NOW()
                   ELSE integration.globus_crc_stage.excluido_em
                 END,
                 excluido_motivo = EXCLUDED.excluido_motivo`,
              params3,
            );
            titulosGravados += lote.length;
            itensGravados += lote.reduce((acc, t) => acc + (itensPorDocto.get(Number(t.COD_DOCTO_CRC))?.length ?? 0), 0);
          } catch (err) {
            erros += lote.length;
            jobLog.warn({ err, loteSize: lote.length }, '[sync:globus:crc] falha lote título');
            await registrarErroSync({
              fastify,
              sistema: 'globus',
              recurso: 'contas_receber',
              fase: 'stage_insert',
              syncJobId: job.id,
              chaveNatural: { lote_size: lote.length, lote_inicio_cod_docto: lote[0]?.COD_DOCTO_CRC ?? null },
              rawPayload: { lote_amostra: lote.slice(0, 3) },
              erro: err,
            });
          }
        }
        jobLog.info({ titulosGravados, titulosCancelados, itensGravados, ms: Date.now() - tStage }, `[sync:globus:crc] stage títulos OK`);

        // Diff de sync: tudo que estava no escopo (empresa + vencimento) e nao
        // veio nesta rodada vira 'sumiu_do_sync'. Preserva timestamp original
        // se ja estava marcado.
        const diff = await stageRepo.query<Array<{ marcados: string }>>(
          `WITH atualizados AS (
             UPDATE integration.globus_crc_stage
                SET excluido_em = COALESCE(excluido_em, NOW()),
                    excluido_motivo = COALESCE(excluido_motivo, 'sumiu_do_sync')
              WHERE codigo_empresa = $1
                AND (raw_payload->>'DATA_VENCIMENTO')::date >= $2::date
                AND (raw_payload->>'DATA_VENCIMENTO')::date <  $3::date
                AND (sync_job_id IS DISTINCT FROM $4 OR sync_job_id IS NULL)
                AND excluido_em IS NULL
              RETURNING id
           )
           SELECT COUNT(*)::text AS marcados FROM atualizados`,
          [params.empresa, dtIniIso, dtFimIso, job.id],
        );
        const sumiramDoSync = Number(diff[0]?.marcados ?? 0);
        if (sumiramDoSync > 0) {
          jobLog.info({ sumiramDoSync }, `[sync:globus:crc] ${sumiramDoSync} registros marcados como sumiu_do_sync`);
        }

        const duracaoMs = Date.now() - inicio;
        const status: SyncCrcResult['status'] = erros === 0 ? 'ok' : 'parcial';

        job.status = status;
        job.terminadoEm = new Date();
        job.registrosLidos = clientesLidos + titulosLidos + itensLidos;
        job.registrosGravados = clientesGravados + titulosGravados + itensGravados;
        job.registrosComErro = erros;
        await jobRepo.save(job);

        return {
          jobId: job.id,
          clientesLidos, clientesGravados,
          titulosLidos, titulosGravados,
          itensLidos, itensGravados,
          duracaoMs, status,
        };
      } catch (err) {
        const message = (err as Error).message;
        jobLog.error({ err }, '[sync:globus:crc] FALHA');
        job.status = 'erro';
        job.terminadoEm = new Date();
        job.erroMensagem = message;
        await jobRepo.save(job);

        return {
          jobId: job.id,
          clientesLidos, clientesGravados,
          titulosLidos, titulosGravados,
          itensLidos, itensGravados,
          duracaoMs: Date.now() - inicio,
          status: 'erro',
          mensagem: message,
        };
      }
    },
  };
}

export type GlobusCrcAdapter = ReturnType<typeof buildGlobusCrcAdapter>;
