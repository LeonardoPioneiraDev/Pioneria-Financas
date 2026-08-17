import type { FastifyInstance } from 'fastify';
import { GlobusCpStage } from '@/entities/globus-cp-stage.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { GLOBUS_QUERIES } from './globus.queries.js';
import { sha256Json } from '@/shared/utils/crypto.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

export interface SyncCpParams {
  empresa: number;
  dtInicio: Date;
  dtFimExclusivo: Date;
  usuarioId?: string | null;
  /**
   * Eixo de data da janela. 'vencimento' (default) filtra por VENCIMENTOCPG;
   * 'pagamento' por PAGAMENTOCPG (traz o que foi PAGO no intervalo). Ver SFN-47.
   */
  modo?: 'vencimento' | 'pagamento';
}

export interface RawCpRow {
  COD_DOCTO_CPG: number | string;
  CODIGO_EMPRESA: number;
  NUMERO_DOCUMENTO: string | null;
  SERIE_DOCUMENTO: string | null;
  NUMERO_PARCELA: number | null;
  TIPO_DOC: string | null;
  DATA_EMISSAO: Date | null;
  DATA_ENTRADA: Date | null;
  DATA_VENCIMENTO: Date;
  DATA_PAGAMENTO: Date | null;
  COMPETENCIA: Date | null;
  STATUS_DOCTO: string;
  QUITADO: string | null;
  PAGAMENTO_LIBERADO: string | null;
  VLR_ORIGINAL: number | null;
  DESCONTO: number | null;
  ACRESCIMO: number | null;
  CODIGO_FORN: number | null;
  FAVORECIDO: string | null;
  FORN_FANTASIA: string | null;
  // Atributos fiscais do fornecedor (BGM_FORNECEDOR).
  FORN_SIMPLES: string | null;       // 'S' | 'N' | null
  FORN_TP_INSCR: string | null;      // CNPJ | CPF | CEI | null
  FORN_UF: string | null;
  FORN_CIDADE: string | null;
  FORN_COD_MUNIC: number | null;
  NRINSCR_FAV: string | null;
  TPINSCR_FAV: string | null;
  // Favorecido "real" + banco que pagou + borderô (enriquecimento do cabecalho).
  FAVORECIDO_NOME: string | null;
  COD_BANCO_PAG: number | null;
  COD_AGENCIA_PAG: number | null;
  COD_CONTA_PAG: string | null;
  BANCO_PAG_NOME: string | null;
  COD_MOVTO_BCO: number | string | null;
  PAGAMENTO_DOC: string | null;
  // Remessa enviada ao banco (pagamento eletronico). Borderô/cheque vem null.
  NRO_REMESSA_PE: string | null;
  DT_REMESSA_PE: Date | null;
  MODALIDADE_PE: string | null;
  TIPO_PAGTO: string | null;
  // Substituicao (CPGDOCTO.CODDOCTOCPGSUBST): ponteiro do antigo -> sucessor. SFN-48.
  COD_DOCTO_CPG_SUBST: number | string | null;
  // Confirmacao do pagamento eletronico (AUTELETRONICA / STATUSPE).
  AUT_ELETRONICA: string | null;
  STATUS_PE: string | null;
  VLR_INSS: number | null;
  VLR_IRRF: number | null;
  VLR_PIS: number | null;
  VLR_COFINS: number | null;
  VLR_CSLL: number | null;
  VLR_ISS: number | null;
  DATA_INTEGROU_FLP: Date | null;
  COMPETENCIA_FLP: Date | null;
  VLR_INSS_CALC_FLP: number | null;
  VLR_IRRF_CALC_FLP: number | null;
  VLR_SESTSENAT_CALC_FLP: number | null;
  MODULO_INCLUSAO: string | null;
  USUARIO_INCLUSAO: string | null;
  DATA_INCLUSAO: Date | null;
  USUARIO_LIB_PAGTO: string | null;
  DATA_LIBERACAO_PAGTO: Date | null;
  USUARIO_ASSINATURA: string | null;
  USUARIO_RESPONSAVEL: string | null;
  ASSINATURA_1: string | null;
  ASSINATURA_2: string | null;
  OBSERVACAO: string | null;
  // Setor = centro de custo financeiro dominante do item (CPGITDOC.CODCUSTOFIN).
  COD_SETOR: number | string | null;
  SETOR_NOME: string | null;
  /** Qtd de unidades (CODCUSTOFIN) distintas no titulo — >1 = rateado. */
  QTD_SETORES: number | null;
  /** Quebra do rateio: "codigo|nome|centavos;codigo|nome|centavos;..." (maior valor 1o). */
  RATEIO_SETORES: string | null;
  /** Quebra por conta contabil: "classificador|nome|centavos;..." (maior valor 1o). */
  RATEIO_CONTAS: string | null;
  VLR_TOTAL_ITENS: number | null;
}

export interface SyncCpResult {
  jobId: string;
  registrosLidos: number;
  registrosGravados: number;
  /** Registros cujo hash_payload nao mudou desde o ultimo sync (skip de raw). */
  registrosInalterados: number;
  /** Registros com STATUS_DOCTO='C' no Globus (cancelados). */
  registrosCancelados: number;
  registrosComErro: number;
  duracaoMs: number;
  status: 'ok' | 'parcial' | 'erro';
  mensagem?: string;
}

/**
 * Adapter Globus - Contas a Pagar.
 * Le do Oracle (CPGDOCTO+CPGITDOC) e popula `integration.globus_cp_stage`
 * de forma idempotente (upsert pela chave natural codigo_empresa+cod_docto_cpg).
 */
export function buildGlobusCpAdapter(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusCpStage);
  const jobRepo = fastify.db.getRepository(SyncJob);

  /**
   * Grava UMA linha do Globus no stage (upsert por hash). Extraído para ser
   * reusado pela sincronização por janela E pela reconciliação por chave.
   * Retorna 'gravado' | 'inalterado'; lança em erro (o caller conta/loga).
   */
  async function gravarLinha(linha: RawCpRow, jobId: string): Promise<'gravado' | 'inalterado'> {
    const hash = sha256Json(linha);
    const cancelado = String(linha.STATUS_DOCTO ?? '').toUpperCase() === 'C';
    const motivo = cancelado ? 'cancelado_no_globus' : null;
    const resultado = await stageRepo.query<Array<{ inalterado: boolean }>>(
      `INSERT INTO integration.globus_cp_stage
         (cod_docto_cpg, codigo_empresa, sync_job_id, raw_payload, hash_payload,
          excluido_em, excluido_motivo)
       VALUES ($1, $2, $3, $4::jsonb, $5,
               CASE WHEN $6::varchar IS NULL THEN NULL ELSE NOW() END, $6)
       ON CONFLICT (codigo_empresa, cod_docto_cpg)
       DO UPDATE SET
         sync_job_id  = EXCLUDED.sync_job_id,
         recebido_em  = NOW(),
         raw_payload  = CASE WHEN integration.globus_cp_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                             THEN EXCLUDED.raw_payload ELSE integration.globus_cp_stage.raw_payload END,
         hash_payload = EXCLUDED.hash_payload,
         processado_em = CASE WHEN integration.globus_cp_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                              THEN NULL ELSE integration.globus_cp_stage.processado_em END,
         excluido_em = CASE
           WHEN $6::varchar IS NULL THEN NULL
           WHEN integration.globus_cp_stage.excluido_em IS NULL THEN NOW()
           ELSE integration.globus_cp_stage.excluido_em END,
         excluido_motivo = $6
       RETURNING (xmax <> 0 AND integration.globus_cp_stage.hash_payload = $5) AS inalterado`,
      [String(linha.COD_DOCTO_CPG), linha.CODIGO_EMPRESA, jobId, JSON.stringify(linha), hash, motivo],
    );
    return resultado[0]?.inalterado ? 'inalterado' : 'gravado';
  }

  return {
    /**
     * RECONCILIAÇÃO por chave — reconsulta títulos que JÁ temos, por
     * CODDOCTOCPG, em vez de por janela de data.
     *
     * Existe porque o sync por janela de VENCIMENTO tem um ponto cego: se um
     * título é prorrogado (ou cancelado, ou pago) e sai da janela consultada, a
     * nossa cópia congela com o dado antigo. Caso real: título 1000810
     * prorrogado de 23/07 para 30/07 — sumiu da janela de 23/07 e ficou preso.
     *
     * Consulta em lotes (Oracle limita IN a 1000). Grava no MESMO stage; o ETL
     * reprocessa o que mudou.
     */
    async reconciliarPorCodigos(codigos: number[], empresa: number): Promise<SyncCpResult> {
      const inicio = Date.now();
      const job = jobRepo.create({
        sistema: 'globus', recurso: 'contas_pagar', status: 'rodando',
        parametros: { empresa, modo: 'reconciliacao', totalCodigos: codigos.length },
      });
      await jobRepo.save(job);
      const jobLog = fastify.log.child({ jobId: job.id, sync: 'globus:cp:reconciliacao' });

      try {
        if (!fastify.oracle?.isAvailable?.()) throw new Error('Conexao com Oracle (Globus) indisponivel');
        if (codigos.length === 0) {
          job.status = 'ok'; job.terminadoEm = new Date(); await jobRepo.save(job);
          return { jobId: job.id, registrosLidos: 0, registrosGravados: 0, registrosInalterados: 0, registrosCancelados: 0, registrosComErro: 0, duracaoMs: Date.now() - inicio, status: 'ok' };
        }

        const LOTE = 500; // folga sob o limite de 1000 do Oracle IN
        let lidos = 0, gravados = 0, inalterados = 0, cancelados = 0, comErro = 0;

        for (let i = 0; i < codigos.length; i += LOTE) {
          const fatia = codigos.slice(i, i + LOTE);
          // Lista validada como inteiros -> seguro interpolar no placeholder.
          const inList = fatia.map((c) => Math.trunc(c)).join(', ');
          const sql = GLOBUS_QUERIES.contasAPagarPorCodigos.replace('__CODIGOS__', inList);
          const result = await fastify.oracle.execute<RawCpRow>(
            sql, { empresa }, { queryName: 'contasAPagarPorCodigos', syncJobId: job.id },
          );
          const linhas = result.rows ?? [];
          lidos += linhas.length;
          for (const linha of linhas) {
            try {
              if (String(linha.STATUS_DOCTO ?? '').toUpperCase() === 'C') cancelados += 1;
              const r = await gravarLinha(linha, job.id);
              if (r === 'inalterado') inalterados += 1; else gravados += 1;
            } catch (err) {
              comErro += 1;
              jobLog.warn({ err, codDoctoCpg: linha.COD_DOCTO_CPG }, '[reconciliacao] falha ao gravar');
            }
          }
        }

        const status: SyncCpResult['status'] = comErro === 0 ? 'ok' : comErro < lidos ? 'parcial' : 'erro';
        job.status = status; job.terminadoEm = new Date();
        job.registrosLidos = lidos; job.registrosGravados = gravados; job.registrosComErro = comErro;
        await jobRepo.save(job);
        jobLog.info({ status, pedidos: codigos.length, lidos, gravados, inalterados, cancelados, comErro },
          `[reconciliacao] concluida (${gravados} atualizados de ${lidos} lidos; ${codigos.length - lidos} sumiram do Globus)`);

        return { jobId: job.id, registrosLidos: lidos, registrosGravados: gravados, registrosInalterados: inalterados, registrosCancelados: cancelados, registrosComErro: comErro, duracaoMs: Date.now() - inicio, status };
      } catch (err) {
        const message = (err as Error).message;
        jobLog.error({ err }, '[reconciliacao] FALHA');
        job.status = 'erro'; job.terminadoEm = new Date(); job.erroMensagem = message;
        await jobRepo.save(job);
        return { jobId: job.id, registrosLidos: 0, registrosGravados: 0, registrosInalterados: 0, registrosCancelados: 0, registrosComErro: 0, duracaoMs: Date.now() - inicio, status: 'erro', mensagem: message };
      }
    },

    async sincronizar(params: SyncCpParams): Promise<SyncCpResult> {
      const inicio = Date.now();

      const porPagamento = params.modo === 'pagamento';

      const log = fastify.log.child({
        sync: { sistema: 'globus', recurso: 'contas_pagar' },
        params: {
          empresa: params.empresa,
          dt_ini: params.dtInicio.toISOString().slice(0, 10),
          dt_fim_excl: params.dtFimExclusivo.toISOString().slice(0, 10),
          modo: porPagamento ? 'pagamento' : 'vencimento',
        },
      });

      log.info('[sync:globus:cp] iniciando sincronizacao');

      // Cria o registro do sync_job antes mesmo de validar Oracle - util pra log.
      const job = jobRepo.create({
        sistema: 'globus',
        recurso: 'contas_pagar',
        status: 'rodando',
        parametros: {
          empresa: params.empresa,
          dtInicio: params.dtInicio.toISOString(),
          dtFimExclusivo: params.dtFimExclusivo.toISOString(),
          modo: porPagamento ? 'pagamento' : 'vencimento',
        },
        usuarioId: params.usuarioId ?? null,
      });
      await jobRepo.save(job);
      const jobLog = log.child({ jobId: job.id });

      try {
        if (!fastify.oracle?.isAvailable?.()) {
          throw new Error('Conexao com Oracle (Globus) indisponivel');
        }

        // Janela por vencimento (default) ou por pagamento (auditoria de caixa).
        // A query muda apenas a coluna do WHERE/ORDER BY; binds sao os mesmos.
        const query = porPagamento ? GLOBUS_QUERIES.contasAPagarPorPagamento : GLOBUS_QUERIES.contasAPagar;
        const queryName = porPagamento ? 'contasAPagarPorPagamento' : 'contasAPagar';

        jobLog.info({ modo: porPagamento ? 'pagamento' : 'vencimento' }, '[sync:globus:cp] executando query no Globus...');
        const queryStart = Date.now();
        const result = await fastify.oracle.execute<RawCpRow>(
          query,
          {
            empresa: params.empresa,
            dt_ini: params.dtInicio,
            dt_fim_excl: params.dtFimExclusivo,
          },
          { queryName, syncJobId: job.id },
        );
        const queryMs = Date.now() - queryStart;

        const linhas = result.rows ?? [];
        const lidos = linhas.length;
        jobLog.info({ lidos, queryMs }, `[sync:globus:cp] query retornou ${lidos} linhas em ${queryMs}ms`);

        let gravados = 0;
        let comErro = 0;
        let inalterados = 0;
        let cancelados = 0;
        const inicioStage = Date.now();

        // Upsert em lote pelo (codigo_empresa, cod_docto_cpg). Comportamento:
        //
        //  - Calcula hash_payload do payload canonico (chaves ordenadas + datas ISO).
        //
        //  - Se hash mudou OU registro novo: atualiza raw_payload + hash + zera
        //    processado_em (ETL precisa reprocessar).
        //
        //  - Se hash igual: so atualiza sync_job_id e recebido_em (audit trail
        //    de que o sync rodou), mantem processado_em (ETL pula).
        //
        //  - Se STATUS_DOCTO='C': marca excluido_em (preserva timestamp original
        //    se ja estava marcado). Senao, garante excluido_em=NULL (caso o
        //    Globus tenha reativado o titulo, raro mas existe).
        for (let i = 0; i < linhas.length; i++) {
          const linha = linhas[i]!;
          try {
            const hash = sha256Json(linha);
            const cancelado = String(linha.STATUS_DOCTO ?? '').toUpperCase() === 'C';
            const motivo = cancelado ? 'cancelado_no_globus' : null;
            if (cancelado) cancelados += 1;

            const resultado = await stageRepo.query<Array<{ inalterado: boolean }>>(
              `INSERT INTO integration.globus_cp_stage
                 (cod_docto_cpg, codigo_empresa, sync_job_id, raw_payload, hash_payload,
                  excluido_em, excluido_motivo)
               VALUES ($1, $2, $3, $4::jsonb, $5,
                       CASE WHEN $6::varchar IS NULL THEN NULL ELSE NOW() END,
                       $6)
               ON CONFLICT (codigo_empresa, cod_docto_cpg)
               DO UPDATE SET
                 sync_job_id  = EXCLUDED.sync_job_id,
                 recebido_em  = NOW(),
                 raw_payload  = CASE WHEN integration.globus_cp_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                     THEN EXCLUDED.raw_payload
                                     ELSE integration.globus_cp_stage.raw_payload END,
                 hash_payload = EXCLUDED.hash_payload,
                 processado_em = CASE WHEN integration.globus_cp_stage.hash_payload IS DISTINCT FROM EXCLUDED.hash_payload
                                      THEN NULL
                                      ELSE integration.globus_cp_stage.processado_em END,
                 excluido_em = CASE
                   WHEN $6::varchar IS NULL THEN NULL
                   WHEN integration.globus_cp_stage.excluido_em IS NULL THEN NOW()
                   ELSE integration.globus_cp_stage.excluido_em
                 END,
                 excluido_motivo = $6
               RETURNING (xmax <> 0 AND integration.globus_cp_stage.hash_payload = $5) AS inalterado`,
              [String(linha.COD_DOCTO_CPG), linha.CODIGO_EMPRESA, job.id, JSON.stringify(linha), hash, motivo],
            );
            if (resultado[0]?.inalterado) {
              inalterados += 1;
            } else {
              gravados += 1;
            }
          } catch (err) {
            comErro += 1;
            jobLog.warn({ err, codDoctoCpg: linha.COD_DOCTO_CPG }, '[sync:globus:cp] falha ao gravar linha no stage');
            await registrarErroSync({
              fastify,
              sistema: 'globus',
              recurso: 'contas_pagar',
              fase: 'stage_insert',
              syncJobId: job.id,
              chaveNatural: { cod_docto_cpg: String(linha.COD_DOCTO_CPG), codigo_empresa: linha.CODIGO_EMPRESA },
              rawPayload: linha as unknown as Record<string, unknown>,
              erro: err,
            });
          }

          // Log de progresso a cada 500 linhas - evita flood mas da feedback
          // em syncs grandes.
          if ((i + 1) % 500 === 0) {
            jobLog.info(
              { progresso: i + 1, total: lidos, gravados, inalterados, cancelados, comErro },
              `[sync:globus:cp] stage: ${i + 1}/${lidos} processados`,
            );
          }
        }

        const stageMs = Date.now() - inicioStage;
        const duracaoMs = Date.now() - inicio;
        const status: SyncCpResult['status'] = comErro === 0 ? 'ok' : comErro < lidos ? 'parcial' : 'erro';

        job.status = status;
        job.terminadoEm = new Date();
        job.registrosLidos = lidos;
        job.registrosGravados = gravados;
        job.registrosComErro = comErro;
        await jobRepo.save(job);

        jobLog.info(
          { status, lidos, gravados, inalterados, cancelados, comErro, queryMs, stageMs, duracaoMs },
          `[sync:globus:cp] adapter concluido status=${status} (${gravados}/${lidos} gravados, ${inalterados} inalterados, ${cancelados} cancelados, ${comErro} erros, ${duracaoMs}ms total)`,
        );

        return {
          jobId: job.id,
          registrosLidos: lidos,
          registrosGravados: gravados,
          registrosInalterados: inalterados,
          registrosCancelados: cancelados,
          registrosComErro: comErro,
          duracaoMs,
          status,
        };
      } catch (err) {
        const message = (err as Error).message;
        jobLog.error({ err }, '[sync:globus:cp] FALHA - sincronizacao abortada');
        job.status = 'erro';
        job.terminadoEm = new Date();
        job.erroMensagem = message;
        await jobRepo.save(job);

        return {
          jobId: job.id,
          registrosLidos: 0,
          registrosGravados: 0,
          registrosInalterados: 0,
          registrosCancelados: 0,
          registrosComErro: 0,
          duracaoMs: Date.now() - inicio,
          status: 'erro',
          mensagem: message,
        };
      }
    },
  };
}

export type GlobusCpAdapter = ReturnType<typeof buildGlobusCpAdapter>;
