import type { FastifyInstance } from 'fastify';
import { IsNull } from 'typeorm';
import { GlobusFlpGpsStage } from '@/entities/globus-flp-gps-stage.entity.js';
import { FolhaGps } from '@/entities/folha-gps.entity.js';
import type { RawFlpGpsRow } from '@/integrations/globus/globus-flp-gps.adapter.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

function brlToCents(v: number | null | undefined): bigint {
  if (v === null || v === undefined) return 0n;
  return BigInt(Math.round(v * 100));
}

/** AAAAMM -> 'AAAA-MM-01'. Retorna null se formato invalido. */
function periodoParaCompetencia(periodo: string): string | null {
  if (!/^\d{6}$/.test(periodo)) return null;
  const ano = periodo.slice(0, 4);
  const mes = periodo.slice(4, 6);
  if (mes < '01' || mes > '12') return null;
  return `${ano}-${mes}-01`;
}

export interface FolhaGpsEtlResult {
  processados: number;
  gravados: number;
  ignorados: number;
  comErro: number;
  duracaoMs: number;
}

/**
 * ETL Folha GPS: normaliza FLP_GPS_INTEGRACPG cru -> finance.folha_gps.
 * Uma linha por (empresa, competencia, tipo de folha, filial, identificador).
 */
export function buildFolhaGpsEtl(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusFlpGpsStage);
  const canonRepo = fastify.db.getRepository(FolhaGps);

  return {
    async processarPendentes(opts: { limite?: number } = {}): Promise<FolhaGpsEtlResult> {
      const inicio = Date.now();
      const log = fastify.log.child({ etl: 'folha_gps' });

      const pendentes = await stageRepo.find({
        where: { processadoEm: IsNull(), excluidoEm: IsNull() },
        take: opts.limite ?? 20000,
        order: { recebidoEm: 'DESC' },
      });
      log.info({ pendentes: pendentes.length }, `[etl:folha_gps] processando ${pendentes.length} linhas`);

      let gravados = 0;
      let ignorados = 0;
      let comErro = 0;

      for (const stage of pendentes) {
        try {
          const raw = stage.rawPayload as unknown as RawFlpGpsRow;
          const competencia = periodoParaCompetencia(String(raw.PERIODO));
          if (!competencia) throw new Error(`PERIODO invalido: ${raw.PERIODO}`);

          const codIdent = raw.COD_IDENT ?? 0;
          const tipoIdent = (raw.TIPO_IDENT ?? '').trim();
          const origemIdExterno =
            `${raw.CODIGO_EMPRESA}|${raw.CODIGO_FL}|${raw.PERIODO}|${raw.TIPO_FOLHA}|${codIdent}|${tipoIdent}`;

          await canonRepo
            .createQueryBuilder()
            .insert()
            .values({
              empresaId: raw.CODIGO_EMPRESA,
              competencia,
              periodo: String(raw.PERIODO),
              tipoFolha: raw.TIPO_FOLHA,
              filial: raw.CODIGO_FL,
              codIdent,
              tipoIdent: tipoIdent || null,
              retidoCents: brlToCents(raw.RETIDO).toString(),
              baseContribCents: brlToCents(raw.BASE_CONTRIB).toString(),
              patronalComDesonCents: brlToCents(raw.INSS_EMPRESA_COMDESON).toString(),
              patronalSemDesonCents: brlToCents(raw.INSS_EMPRESA_SEMDESON).toString(),
              valorCents: brlToCents(raw.VALOR).toString(),
              codDoctoCpg: raw.COD_DOCTO_CPG != null ? String(raw.COD_DOCTO_CPG) : null,
              origemSistema: 'globus',
              origemIdExterno,
              ultimoSyncEm: new Date(),
            })
            .orUpdate(
              [
                'competencia', 'periodo', 'tipo_folha', 'filial', 'cod_ident', 'tipo_ident',
                'retido_cents', 'base_contrib_cents', 'patronal_com_deson_cents',
                'patronal_sem_deson_cents', 'valor_cents', 'cod_docto_cpg',
                'ultimo_sync_em', 'atualizado_em',
              ],
              ['origem_sistema', 'origem_id_externo'],
            )
            .execute();

          stage.processadoEm = new Date();
          await stageRepo.save(stage);
          gravados += 1;
        } catch (err) {
          comErro += 1;
          log.warn({ err, stageId: stage.id }, '[etl:folha_gps] falha ao processar');
          await registrarErroSync({
            fastify,
            sistema: 'globus',
            recurso: 'folha_gps',
            fase: 'etl_processamento',
            chaveNatural: {
              codigo_empresa: stage.codigoEmpresa,
              periodo: stage.periodo,
              filial: stage.codigoFl,
            },
            rawPayload: stage.rawPayload,
            erro: err,
          });
        }
      }

      const duracaoMs = Date.now() - inicio;
      log.info(
        { processados: pendentes.length, gravados, ignorados, comErro, duracaoMs },
        `[etl:folha_gps] concluido em ${duracaoMs}ms (${gravados} gravados, ${comErro} erros)`,
      );
      return { processados: pendentes.length, gravados, ignorados, comErro, duracaoMs };
    },
  };
}

export type FolhaGpsEtl = ReturnType<typeof buildFolhaGpsEtl>;
