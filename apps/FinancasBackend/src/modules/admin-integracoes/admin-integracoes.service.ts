import type { FastifyInstance } from 'fastify';
import { SyncError } from '@/entities/sync-error.entity.js';

/**
 * Servico admin para inspecao e operacao da integracao Globus.
 *
 * Tres areas:
 *  1. Visao consolidada (dashboard)
 *  2. Gerencia da DLQ (`sync_errors`)
 *  3. Telemetria Oracle (`oracle_query_logs`)
 */
export function buildAdminIntegracoesService(fastify: FastifyInstance) {
  const errorRepo = fastify.db.getRepository(SyncError);

  return {
    /** Visao geral: ultimos jobs, DLQ pendente, queries lentas. */
    async dashboard() {
      const [ultimosJobs, dlqPorRecurso, queriesLentas, queriesComErro, totalDlqPendente] = await Promise.all([
        // Ultimos 20 sync_jobs ordenados por inicio
        fastify.db.query<Array<{
          id: string;
          sistema: string;
          recurso: string;
          status: string;
          iniciado_em: string;
          terminado_em: string | null;
          registros_lidos: string;
          registros_gravados: string;
          registros_com_erro: string;
          duracao_s: string | null;
        }>>(
          `SELECT id, sistema, recurso, status, iniciado_em, terminado_em,
                  registros_lidos::text, registros_gravados::text, registros_com_erro::text,
                  EXTRACT(EPOCH FROM (terminado_em - iniciado_em))::text AS duracao_s
             FROM integration.sync_jobs
            ORDER BY iniciado_em DESC
            LIMIT 20`,
        ),
        // DLQ pendente agrupada por (sistema, recurso)
        fastify.db.query<Array<{ sistema: string; recurso: string; qtd: string; mais_antigo: string }>>(
          `SELECT sistema, recurso, COUNT(*)::text AS qtd, MIN(criado_em) AS mais_antigo
             FROM integration.sync_errors
            WHERE resolvido_em IS NULL
            GROUP BY sistema, recurso
            ORDER BY COUNT(*) DESC`,
        ),
        // Top 10 queries mais lentas nas ultimas 24h
        fastify.db.query<Array<{
          query_name: string;
          p50_ms: string;
          p95_ms: string;
          max_ms: string;
          qtd: string;
        }>>(
          `SELECT query_name,
                  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duracao_ms)::text AS p50_ms,
                  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duracao_ms)::text AS p95_ms,
                  MAX(duracao_ms)::text AS max_ms,
                  COUNT(*)::text AS qtd
             FROM integration.oracle_query_logs
            WHERE criado_em >= NOW() - INTERVAL '24 hours'
              AND erro_mensagem IS NULL
            GROUP BY query_name
            ORDER BY PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duracao_ms) DESC NULLS LAST
            LIMIT 10`,
        ),
        // Queries com erro nas ultimas 24h
        fastify.db.query<Array<{ query_name: string; qtd: string; ultimo_erro: string }>>(
          `SELECT query_name, COUNT(*)::text AS qtd, MAX(erro_mensagem) AS ultimo_erro
             FROM integration.oracle_query_logs
            WHERE criado_em >= NOW() - INTERVAL '24 hours'
              AND erro_mensagem IS NOT NULL
            GROUP BY query_name
            ORDER BY COUNT(*) DESC`,
        ),
        fastify.db.query<Array<{ total: string }>>(
          `SELECT COUNT(*)::text AS total FROM integration.sync_errors WHERE resolvido_em IS NULL`,
        ),
      ]);

      return {
        ultimosJobs: ultimosJobs.map((j) => ({
          id: j.id,
          sistema: j.sistema,
          recurso: j.recurso,
          status: j.status,
          iniciadoEm: j.iniciado_em,
          terminadoEm: j.terminado_em,
          registrosLidos: Number(j.registros_lidos),
          registrosGravados: Number(j.registros_gravados),
          registrosComErro: Number(j.registros_com_erro),
          duracaoSegundos: j.duracao_s ? Number(j.duracao_s) : null,
        })),
        dlq: {
          totalPendente: Number(totalDlqPendente[0]?.total ?? 0),
          porRecurso: dlqPorRecurso.map((d) => ({
            sistema: d.sistema,
            recurso: d.recurso,
            qtdPendente: Number(d.qtd),
            maisAntigoEm: d.mais_antigo,
          })),
        },
        telemetriaOracle: {
          queriesLentasUltimas24h: queriesLentas.map((q) => ({
            queryName: q.query_name,
            p50Ms: Number(q.p50_ms),
            p95Ms: Number(q.p95_ms),
            maxMs: Number(q.max_ms),
            execucoes: Number(q.qtd),
          })),
          queriesComErroUltimas24h: queriesComErro.map((q) => ({
            queryName: q.query_name,
            qtdErros: Number(q.qtd),
            ultimoErro: q.ultimo_erro,
          })),
        },
      };
    },

    /** Lista paginada da DLQ. */
    async listarErros(filtros: { sistema?: string; recurso?: string; resolvidos?: boolean; pagina: number; porPagina: number }) {
      const wheres: string[] = [];
      const params: unknown[] = [];
      if (filtros.sistema) {
        params.push(filtros.sistema);
        wheres.push(`sistema = $${params.length}`);
      }
      if (filtros.recurso) {
        params.push(filtros.recurso);
        wheres.push(`recurso = $${params.length}`);
      }
      // Default: lista somente pendentes
      if (filtros.resolvidos === true) {
        wheres.push(`resolvido_em IS NOT NULL`);
      } else if (filtros.resolvidos !== undefined) {
        wheres.push(`resolvido_em IS NULL`);
      } else {
        wheres.push(`resolvido_em IS NULL`);
      }
      const whereSql = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';

      const offset = (filtros.pagina - 1) * filtros.porPagina;

      const totalRows = await errorRepo.query<Array<{ total: string }>>(
        `SELECT COUNT(*)::text AS total FROM integration.sync_errors ${whereSql}`,
        params,
      );
      const total = Number(totalRows[0]?.total ?? 0);

      params.push(filtros.porPagina, offset);
      const itens = await errorRepo.query<Array<{
        id: string;
        sync_job_id: string | null;
        sistema: string;
        recurso: string;
        fase: string;
        chave_natural: Record<string, unknown> | null;
        erro_mensagem: string;
        erro_codigo: string | null;
        tentativas: string;
        criado_em: string;
        atualizado_em: string;
        resolvido_em: string | null;
        resolvido_por: string | null;
      }>>(
        `SELECT id, sync_job_id, sistema, recurso, fase,
                chave_natural, erro_mensagem, erro_codigo,
                tentativas::text, criado_em, atualizado_em, resolvido_em, resolvido_por
           FROM integration.sync_errors
           ${whereSql}
          ORDER BY criado_em DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      return {
        total,
        pagina: filtros.pagina,
        porPagina: filtros.porPagina,
        totalPaginas: Math.max(1, Math.ceil(total / filtros.porPagina)),
        itens: itens.map((i) => ({
          id: i.id,
          syncJobId: i.sync_job_id,
          sistema: i.sistema,
          recurso: i.recurso,
          fase: i.fase,
          chaveNatural: i.chave_natural,
          erroMensagem: i.erro_mensagem,
          erroCodigo: i.erro_codigo,
          tentativas: Number(i.tentativas),
          criadoEm: i.criado_em,
          atualizadoEm: i.atualizado_em,
          resolvidoEm: i.resolvido_em,
          resolvidoPor: i.resolvido_por,
        })),
      };
    },

    /** Detalhe de UM erro (com raw_payload e stack). */
    async obterErro(id: string) {
      const rows = await errorRepo.query<Array<{
        id: string;
        sync_job_id: string | null;
        sistema: string;
        recurso: string;
        fase: string;
        chave_natural: Record<string, unknown> | null;
        raw_payload: Record<string, unknown> | null;
        erro_mensagem: string;
        erro_codigo: string | null;
        erro_stack: string | null;
        tentativas: string;
        criado_em: string;
        atualizado_em: string;
        resolvido_em: string | null;
        resolvido_por: string | null;
      }>>(
        `SELECT id, sync_job_id, sistema, recurso, fase, chave_natural, raw_payload,
                erro_mensagem, erro_codigo, erro_stack, tentativas::text,
                criado_em, atualizado_em, resolvido_em, resolvido_por
           FROM integration.sync_errors
          WHERE id = $1`,
        [id],
      );
      const r = rows[0];
      if (!r) {
        throw fastify.httpErrors.notFound(`Erro ${id} nao encontrado`);
      }
      return {
        id: r.id,
        syncJobId: r.sync_job_id,
        sistema: r.sistema,
        recurso: r.recurso,
        fase: r.fase,
        chaveNatural: r.chave_natural,
        rawPayload: r.raw_payload,
        erroMensagem: r.erro_mensagem,
        erroCodigo: r.erro_codigo,
        erroStack: r.erro_stack,
        tentativas: Number(r.tentativas),
        criadoEm: r.criado_em,
        atualizadoEm: r.atualizado_em,
        resolvidoEm: r.resolvido_em,
        resolvidoPor: r.resolvido_por,
      };
    },

    /**
     * Drill-down de UM registro: vai do stage raw ate o domain em finance,
     * incluindo sync_jobs que o tocaram e erros DLQ associados.
     *
     * Recursos suportados:
     *   - 'contas_pagar': origemIdExterno = CODDOCTOCPG (string numerica)
     *   - 'contas_receber': origemIdExterno = "{CODIGOEMPRESA}|{CODDOCTOCRC}"
     */
    async drillDown(args: { recurso: 'contas_pagar' | 'contas_receber'; origemIdExterno: string }) {
      const { recurso, origemIdExterno } = args;

      let stage: Record<string, unknown> | null = null;
      let finance: Record<string, unknown> | null = null;

      if (recurso === 'contas_pagar') {
        const stageRows = await fastify.db.query<Array<Record<string, unknown>>>(
          `SELECT id, cod_docto_cpg, codigo_empresa, sync_job_id,
                  raw_payload, hash_payload, recebido_em, processado_em,
                  excluido_em, excluido_motivo
             FROM integration.globus_cp_stage
            WHERE cod_docto_cpg = $1::bigint
            LIMIT 1`,
          [origemIdExterno],
        );
        stage = stageRows[0] ?? null;

        const financeRows = await fastify.db.query<Array<Record<string, unknown>>>(
          `SELECT id, empresa_id, fornecedor_id, numero_documento, serie_documento,
                  numero_parcela, competencia, data_emissao, data_entrada, data_vencimento,
                  data_pagamento, valor_bruto_cents::text, valor_liquido_cents::text,
                  status, quitado, origem_documento, tipo_folha,
                  origem_sistema, origem_id_externo, ultimo_sync_em,
                  excluido_em, excluido_motivo, criado_em, atualizado_em
             FROM finance.contas_pagar
            WHERE origem_sistema = 'globus' AND origem_id_externo = $1
            LIMIT 1`,
          [origemIdExterno],
        );
        finance = financeRows[0] ?? null;
      } else if (recurso === 'contas_receber') {
        // origem_id_externo = "{CODIGOEMPRESA}|{CODDOCTOCRC}"
        const partes = origemIdExterno.split('|');
        if (partes.length !== 2) {
          throw fastify.httpErrors.badRequest('Para contas_receber, origemIdExterno deve estar no formato "EMPRESA|CODDOCTOCRC"');
        }
        const stageRows = await fastify.db.query<Array<Record<string, unknown>>>(
          `SELECT id, codigo_empresa, cod_docto_crc, sync_job_id,
                  raw_payload, raw_itens, hash_payload, recebido_em, processado_em,
                  excluido_em, excluido_motivo
             FROM integration.globus_crc_stage
            WHERE codigo_empresa = $1::int AND cod_docto_crc = $2
            LIMIT 1`,
          [Number(partes[0]), partes[1]],
        );
        stage = stageRows[0] ?? null;

        const financeRows = await fastify.db.query<Array<Record<string, unknown>>>(
          `SELECT id, empresa_id, cliente_id, numero_documento, serie_documento,
                  numero_parcela, data_emissao, data_vencimento, data_recebimento,
                  valor_bruto_cents::text, status, quitado,
                  origem_sistema, origem_id_externo, ultimo_sync_em,
                  excluido_em, excluido_motivo, criado_em, atualizado_em
             FROM finance.contas_receber
            WHERE origem_sistema = 'globus' AND origem_id_externo = $1
            LIMIT 1`,
          [origemIdExterno],
        );
        finance = financeRows[0] ?? null;
      }

      if (!stage && !finance) {
        throw fastify.httpErrors.notFound(`Registro ${recurso}/${origemIdExterno} nao encontrado no stage nem em finance`);
      }

      // Sync jobs que tocaram esse registro (busca pelo sync_job_id do stage)
      const syncJobId = stage?.['sync_job_id'] as string | null | undefined;
      const syncs = syncJobId
        ? await fastify.db.query<Array<{
            id: string; status: string; iniciado_em: string; terminado_em: string | null;
            registros_lidos: string; registros_gravados: string; registros_com_erro: string;
          }>>(
            `SELECT id, status, iniciado_em, terminado_em,
                    registros_lidos::text, registros_gravados::text, registros_com_erro::text
               FROM integration.sync_jobs
              WHERE id = $1
              LIMIT 1`,
            [syncJobId],
          )
        : [];

      // Erros DLQ relacionados (chave_natural contem origem_id_externo)
      const chaveBusca = recurso === 'contas_pagar'
        ? { cod_docto_cpg: origemIdExterno }
        : { /* contas_receber tem chave (codigo_empresa, cod_docto_crc) */ };
      const erros = await fastify.db.query<Array<{
        id: string; fase: string; erro_mensagem: string; tentativas: string; criado_em: string; resolvido_em: string | null;
      }>>(
        `SELECT id, fase, erro_mensagem, tentativas::text, criado_em, resolvido_em
           FROM integration.sync_errors
          WHERE sistema = 'globus' AND recurso = $1
            AND chave_natural @> $2::jsonb
          ORDER BY criado_em DESC
          LIMIT 10`,
        [recurso, JSON.stringify(chaveBusca)],
      );

      return {
        recurso,
        origemIdExterno,
        stage,
        finance,
        syncs: syncs.map((s) => ({
          id: s.id,
          status: s.status,
          iniciadoEm: s.iniciado_em,
          terminadoEm: s.terminado_em,
          registrosLidos: Number(s.registros_lidos),
          registrosGravados: Number(s.registros_gravados),
          registrosComErro: Number(s.registros_com_erro),
        })),
        erros: erros.map((e) => ({
          id: e.id,
          fase: e.fase,
          erroMensagem: e.erro_mensagem,
          tentativas: Number(e.tentativas),
          criadoEm: e.criado_em,
          resolvidoEm: e.resolvido_em,
        })),
      };
    },

    /** Marca um erro como resolvido manualmente. Idempotente. */
    async resolverManual(id: string, usuarioId: string) {
      const result = await errorRepo.query<Array<{ id: string }>>(
        `UPDATE integration.sync_errors
            SET resolvido_em = NOW(),
                resolvido_por = $2,
                atualizado_em = NOW()
          WHERE id = $1
            AND resolvido_em IS NULL
          RETURNING id`,
        [id, usuarioId],
      );
      if (result.length === 0) {
        // Pode nao existir ou ja estar resolvido
        const existe = await errorRepo.query<Array<{ id: string }>>(
          `SELECT id FROM integration.sync_errors WHERE id = $1`,
          [id],
        );
        if (existe.length === 0) {
          throw fastify.httpErrors.notFound(`Erro ${id} nao encontrado`);
        }
        return { id, jaResolvido: true };
      }
      return { id, jaResolvido: false };
    },
  };
}

export type AdminIntegracoesService = ReturnType<typeof buildAdminIntegracoesService>;
