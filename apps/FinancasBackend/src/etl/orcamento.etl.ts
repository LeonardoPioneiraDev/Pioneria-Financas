import type { FastifyInstance } from 'fastify';
import { IsNull } from 'typeorm';
import { GlobusCpgorcStage } from '@/entities/globus-cpgorc-stage.entity.js';
import { OrcamentoPrevisao } from '@/entities/orcamento-previsao.entity.js';
import type { RawOrcamentoRow } from '@/integrations/globus/globus-orcamento.adapter.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

function brlToCents(v: number | null | undefined): bigint {
  if (v === null || v === undefined) return 0n;
  return BigInt(Math.round(v * 100));
}

/** 'YYYY-MM-DD' -> { ano, competencia 'YYYY-MM-01' }. Null-safe. */
function derivarData(dataPrevisao: string | null): { ano: number | null; competencia: string | null; data: string | null } {
  if (!dataPrevisao || !/^\d{4}-\d{2}-\d{2}$/.test(dataPrevisao)) {
    return { ano: null, competencia: null, data: null };
  }
  const ano = Number(dataPrevisao.slice(0, 4));
  const competencia = `${dataPrevisao.slice(0, 7)}-01`;
  return { ano, competencia, data: dataPrevisao };
}

/** Deriva receita/despesa das colunas TIPORECEITA/TIPODESPESA do Globus. */
function derivarTipo(raw: RawOrcamentoRow): 'receita' | 'despesa' | 'indefinido' {
  if (raw.TIPO_DESPESA != null && raw.TIPO_DESPESA > 0) return 'despesa';
  if (raw.TIPO_RECEITA != null && raw.TIPO_RECEITA > 0) return 'receita';
  return 'indefinido';
}

export interface OrcamentoEtlResult {
  processados: number;
  gravados: number;
  ignorados: number;
  comErro: number;
  duracaoMs: number;
}

/**
 * ETL Orcamento: normaliza CPGORCPREVISOES cru -> finance.orcamento_previsao.
 * Uma linha por CODINTORC. Deriva ano/competencia/tipo pra o baseline.
 */
export function buildOrcamentoEtl(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusCpgorcStage);
  const canonRepo = fastify.db.getRepository(OrcamentoPrevisao);

  return {
    async processarPendentes(opts: { limite?: number } = {}): Promise<OrcamentoEtlResult> {
      const inicio = Date.now();
      const log = fastify.log.child({ etl: 'orcamento' });

      const pendentes = await stageRepo.find({
        where: { processadoEm: IsNull(), excluidoEm: IsNull() },
        take: opts.limite ?? 20000,
        order: { recebidoEm: 'DESC' },
      });
      log.info({ pendentes: pendentes.length }, `[etl:orcamento] processando ${pendentes.length} linhas`);

      let gravados = 0;
      let ignorados = 0;
      let comErro = 0;

      for (const stage of pendentes) {
        try {
          const raw = stage.rawPayload as unknown as RawOrcamentoRow;
          const { ano, competencia, data } = derivarData(raw.DATA_PREVISAO);
          const tipo = derivarTipo(raw);
          const origemIdExterno = `${raw.CODIGO_EMPRESA}|${raw.COD_INT_ORC}`;
          const desc = (raw.CENTRO_CUSTO_DESC ?? '').trim() || null;

          await canonRepo
            .createQueryBuilder()
            .insert()
            .values({
              empresaId: raw.CODIGO_EMPRESA,
              filial: raw.CODIGO_FL ?? null,
              dataPrevisao: data,
              ano,
              competencia,
              tipo,
              tipoReceita: raw.TIPO_RECEITA ?? null,
              tipoDespesa: raw.TIPO_DESPESA ?? null,
              codCustoFin: raw.CCUSTOFINANC ?? null,
              centroCustoDesc: desc,
              valorCents: brlToCents(raw.VALOR).toString(),
              justificativa: (raw.JUSTIFICATIVA ?? '').trim() || null,
              origemSistema: 'globus',
              origemIdExterno,
              ultimoSyncEm: new Date(),
            })
            .orUpdate(
              [
                'filial', 'data_previsao', 'ano', 'competencia', 'tipo', 'tipo_receita',
                'tipo_despesa', 'cod_custo_fin', 'centro_custo_desc', 'valor_cents',
                'justificativa', 'ultimo_sync_em', 'atualizado_em',
              ],
              ['origem_sistema', 'origem_id_externo'],
            )
            .execute();

          stage.processadoEm = new Date();
          await stageRepo.save(stage);
          gravados += 1;
        } catch (err) {
          comErro += 1;
          log.warn({ err, stageId: stage.id }, '[etl:orcamento] falha ao processar');
          await registrarErroSync({
            fastify,
            sistema: 'globus',
            recurso: 'orcamento',
            fase: 'etl_processamento',
            chaveNatural: {
              codigo_empresa: stage.codigoEmpresa,
              cod_int_orc: stage.codIntOrc,
            },
            rawPayload: stage.rawPayload,
            erro: err,
          });
        }
      }

      const duracaoMs = Date.now() - inicio;
      log.info(
        { processados: pendentes.length, gravados, ignorados, comErro, duracaoMs },
        `[etl:orcamento] concluido em ${duracaoMs}ms (${gravados} gravados, ${comErro} erros)`,
      );
      return { processados: pendentes.length, gravados, ignorados, comErro, duracaoMs };
    },
  };
}

export type OrcamentoEtl = ReturnType<typeof buildOrcamentoEtl>;
