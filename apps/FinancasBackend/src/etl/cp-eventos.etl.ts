import type { FastifyInstance } from 'fastify';
import { IsNull } from 'typeorm';
import { GlobusCpEventosStage } from '@/entities/globus-cp-eventos-stage.entity.js';
import { CpEvento } from '@/entities/cp-evento.entity.js';
import { ContaPagar } from '@/entities/conta-pagar.entity.js';
import type { RawCpEventoRow } from '@/integrations/globus/globus-cp-eventos.adapter.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

interface EtlResult {
  processados: number;
  gravados: number;
  comErro: number;
}

const SISTEMA = 'globus';

/**
 * Le eventos nao processados de integration.globus_cp_eventos_stage e
 * materializa em finance.cp_eventos, ligando ao titulo
 * (finance.contas_pagar.origem_id_externo = cod_docto_cpg). Idempotente pela
 * chave (origem_sistema, origem_id_externo = '<coddoctocpg>-<sequencia>').
 */
export function buildCpEventosEtl(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusCpEventosStage);
  const eventoRepo = fastify.db.getRepository(CpEvento);
  const cpRepo = fastify.db.getRepository(ContaPagar);

  return {
    async processarPendentes(syncJobId?: string): Promise<EtlResult> {
      const log = fastify.log.child({ etl: 'cp_eventos', jobId: syncJobId });
      const inicio = Date.now();

      const where = syncJobId
        ? { syncJobId, processadoEm: IsNull() }
        : { processadoEm: IsNull() };
      const pendentes = await stageRepo.find({ where, take: 10000 });
      log.info({ pendentes: pendentes.length }, `[etl:cp-eventos] ${pendentes.length} eventos pendentes`);

      // Cache cod_docto_cpg -> conta_pagar_id (evita N lookups repetidos).
      const cacheCpId = new Map<string, string | null>();
      async function resolverContaPagarId(codDoctoCpg: string): Promise<string | null> {
        if (cacheCpId.has(codDoctoCpg)) return cacheCpId.get(codDoctoCpg)!;
        const cp = await cpRepo.findOne({
          where: { origemSistema: SISTEMA, origemIdExterno: codDoctoCpg },
          select: { id: true },
        });
        const id = cp?.id ?? null;
        cacheCpId.set(codDoctoCpg, id);
        return id;
      }

      let gravados = 0;
      let comErro = 0;

      for (const linha of pendentes) {
        try {
          const raw = linha.rawPayload as unknown as RawCpEventoRow;
          const codDoctoCpg = String(raw.COD_DOCTO_CPG);
          const origemIdExterno = `${codDoctoCpg}-${raw.SEQUENCIA_EVENTO}`;
          const contaPagarId = await resolverContaPagarId(codDoctoCpg);

          await eventoRepo
            .createQueryBuilder()
            .insert()
            .values({
              contaPagarId,
              empresaId: raw.CODIGO_EMPRESA,
              codDoctoCpg,
              sequenciaEvento: raw.SEQUENCIA_EVENTO,
              codTpEvento: raw.COD_TP_EVENTO,
              tipoEventoDesc: raw.TIPO_EVENTO_DESC,
              maisInformacoes: raw.MAIS_INFORMACOES,
              statusDocto: raw.STATUS_DOCTO,
              usuario: raw.USUARIO,
              ocorridoEm: raw.DATA_EVENTO,
              origemSistema: SISTEMA,
              origemIdExterno,
            })
            .orUpdate(
              [
                'conta_pagar_id', 'empresa_id', 'cod_tp_evento', 'tipo_evento_desc',
                'mais_informacoes', 'status_docto', 'usuario', 'ocorrido_em', 'atualizado_em',
              ],
              ['origem_sistema', 'origem_id_externo'],
            )
            .execute();

          linha.processadoEm = new Date();
          await stageRepo.save(linha);
          gravados += 1;
        } catch (err) {
          comErro += 1;
          log.warn({ err, stageId: linha.id }, '[etl:cp-eventos] falha ao processar evento');
          await registrarErroSync({
            fastify,
            sistema: 'globus',
            recurso: 'cp_eventos',
            fase: 'etl_processamento',
            syncJobId: syncJobId ?? null,
            chaveNatural: { cod_docto_cpg: linha.codDoctoCpg, sequencia_evento: linha.sequenciaEvento },
            rawPayload: linha.rawPayload,
            erro: err,
          });
        }
      }

      const duracaoMs = Date.now() - inicio;
      log.info(
        { processados: pendentes.length, gravados, comErro, duracaoMs },
        `[etl:cp-eventos] concluido (${gravados}/${pendentes.length} gravados, ${comErro} erros, ${duracaoMs}ms)`,
      );
      return { processados: pendentes.length, gravados, comErro };
    },
  };
}

export type CpEventosEtl = ReturnType<typeof buildCpEventosEtl>;
