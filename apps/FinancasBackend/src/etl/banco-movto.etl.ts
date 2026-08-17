import type { FastifyInstance } from 'fastify';
import { IsNull } from 'typeorm';
import { GlobusBcomovtoStage } from '@/entities/globus-bcomovto-stage.entity.js';
import { BancoMovto } from '@/entities/banco-movto.entity.js';
import type { RawBcoMovtoRow } from '@/integrations/globus/globus-bcomovto.adapter.js';
import { dataIsoSpOuNull } from '@/shared/utils/datetime.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

/**
 * Heuristica validada em 2026-05-20 (R$ 11,94 M no mes 05/2026, 21 lancamentos
 * 100% identificados — conta dedicada BRB).
 *
 * CODHISTOBCO = 908 (RECEBIMENTO ARR/CRC/BCO)
 *   AND CODBANCO = 70 (BRB)
 *   AND CODAGENCIA = 51
 *   AND CODCONTABCO = '108'
 */
function ehRepasseBrb(raw: RawBcoMovtoRow): boolean {
  return (
    raw.COD_HISTO_BCO === 908 &&
    raw.COD_BANCO === 70 &&
    raw.COD_AGENCIA === 51 &&
    String(raw.COD_CONTA_BCO).trim() === '108'
  );
}

function brlToCents(v: number | null | undefined): string {
  if (v === null || v === undefined) return '0';
  return Math.round(v * 100).toString();
}

export interface BancoMovtoEtlResult {
  processados: number;
  gravados: number;
  repassesBrb: number;
  comErro: number;
  duracaoMs: number;
}

export function buildBancoMovtoEtl(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusBcomovtoStage);
  const movtoRepo = fastify.db.getRepository(BancoMovto);

  return {
    async processarPendentes(opts: { limite?: number } = {}): Promise<BancoMovtoEtlResult> {
      const inicio = Date.now();
      const log = fastify.log.child({ etl: 'banco_movto' });

      const pendentes = await stageRepo.find({
        where: { processadoEm: IsNull(), excluidoEm: IsNull() },
        take: opts.limite ?? 5000,
        order: { recebidoEm: 'DESC' },
      });
      log.info({ pendentes: pendentes.length }, `[etl:banco-movto] processando ${pendentes.length} lancamentos`);

      let gravados = 0;
      let repassesBrb = 0;
      let comErro = 0;

      for (const stage of pendentes) {
        try {
          const raw = stage.rawPayload as unknown as RawBcoMovtoRow;
          const dataMovto = dataIsoSpOuNull(raw.DATA_MOVTO);
          if (!dataMovto) throw new Error('DATA_MOVTO ausente ou invalida');

          const ehBrb = ehRepasseBrb(raw);
          if (ehBrb) repassesBrb += 1;

          const origemIdExterno = String(raw.COD_MOVTO_BCO);
          // O Globus PODE trazer VLMOVTOBCO negativo (debito). Gravamos sempre em
          // modulo (abs) em valor_cents — a conciliacao e o saldo dependem disso —
          // e preservamos o sentido separadamente em debito_credito (de BCOHISTO).
          // Antes o D/C ficava sempre null (comentario antigo assumia valor sempre
          // positivo, o que e falso pra despesas): assim somas que dependem do sinal
          // (ex.: pagamentos diretos no banco com estornos) ficavam impossiveis.
          const valorAbs = Math.abs(raw.VALOR ?? 0);
          const dc = raw.DEBITO_CREDITO?.trim().toUpperCase();
          const debitoCredito: string | null = dc === 'D' || dc === 'C' ? dc : null;

          await movtoRepo
            .createQueryBuilder()
            .insert()
            .values({
              empresaId: raw.CODIGO_EMPRESA,
              codigoFl: raw.CODIGO_FL,
              codMovtoBco: origemIdExterno,
              codBanco: raw.COD_BANCO,
              codAgencia: raw.COD_AGENCIA,
              codContaBco: String(raw.COD_CONTA_BCO),
              dataMovto,
              dataEfetiva: dataIsoSpOuNull(raw.DATA_EFETIVA),
              dataCredito: dataIsoSpOuNull(raw.DATA_CREDITO),
              valorCents: brlToCents(valorAbs),
              // Sinal preservado (efeito no saldo): + entrou, − saiu. Base do extrato.
              efeitoSaldoCents: raw.VALOR != null ? String(Math.round(raw.VALOR * 100)) : null,
              codHistoBco: raw.COD_HISTO_BCO,
              descHistoBco: raw.DESC_HISTO_BCO,
              histMovtoBco: raw.HIST_MOVTO_BCO,
              docMovtoBco: raw.DOC_MOVTO_BCO,
              debitoCredito,
              confirmado: String(raw.CONFIRMADO ?? '').toUpperCase() === 'S',
              conciliado: String(raw.CONCILIADO ?? '').toUpperCase() === 'S',
              statusMovto: raw.STATUS_MOVTO,
              codTpDespesa: raw.COD_TP_DESPESA,
              codTpReceita: raw.COD_TP_RECEITA,
              codCusto: raw.COD_CUSTO,
              ehRepasseBrb: ehBrb,
              origemSistema: 'globus',
              origemIdExterno,
              ultimoSyncEm: new Date(),
            })
            .orUpdate(
              [
                'codigo_fl', 'cod_banco', 'cod_agencia', 'cod_conta_bco',
                'data_movto', 'data_efetiva', 'data_credito',
                'valor_cents', 'efeito_saldo_cents', 'cod_histo_bco', 'desc_histo_bco', 'hist_movto_bco', 'doc_movto_bco',
                'debito_credito',
                'confirmado', 'conciliado', 'status_movto',
                'cod_tp_despesa', 'cod_tp_receita', 'cod_custo',
                'eh_repasse_brb', 'ultimo_sync_em', 'atualizado_em',
              ],
              ['origem_sistema', 'origem_id_externo'],
            )
            .execute();

          stage.processadoEm = new Date();
          await stageRepo.save(stage);
          gravados += 1;
        } catch (err) {
          comErro += 1;
          log.warn({ err, stageId: stage.id }, '[etl:banco-movto] falha ao processar');
          await registrarErroSync({
            fastify,
            sistema: 'globus',
            recurso: 'banco_movto',
            fase: 'etl_processamento',
            chaveNatural: { cod_movto_bco: stage.codMovtoBco, codigo_empresa: stage.codigoEmpresa },
            rawPayload: stage.rawPayload,
            erro: err,
          });
        }
      }

      const duracaoMs = Date.now() - inicio;
      log.info(
        { processados: pendentes.length, gravados, repassesBrb, comErro, duracaoMs },
        `[etl:banco-movto] concluido em ${duracaoMs}ms (${gravados} gravados, ${repassesBrb} repasses BRB identificados)`,
      );
      return { processados: pendentes.length, gravados, repassesBrb, comErro, duracaoMs };
    },
  };
}

export type BancoMovtoEtl = ReturnType<typeof buildBancoMovtoEtl>;
