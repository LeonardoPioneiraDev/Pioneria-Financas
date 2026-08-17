import type { FastifyInstance } from 'fastify';
import { IsNull } from 'typeorm';
import { GlobusCtbsaldoStage } from '@/entities/globus-ctbsaldo-stage.entity.js';
import { DepreciacaoMensal } from '@/entities/depreciacao-mensal.entity.js';
import type { RawCtbSaldoRow } from '@/integrations/globus/globus-depreciacao.adapter.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

/** Grupos contabeis do modulo (prefixo do CLASSIFICADOR). */
function classificarGrupo(classificador: string): 'despesa' | 'imobilizado_bruto' | 'direito_uso' | 'deprec_acumulada' | null {
  if (classificador.startsWith('3.1.02.07')) return 'despesa';
  if (classificador.startsWith('1.3.02.01')) return 'imobilizado_bruto';
  if (classificador.startsWith('1.3.02.02')) return 'direito_uso';
  if (classificador.startsWith('1.3.02.50') || classificador.startsWith('1.3.02.51')) return 'deprec_acumulada';
  return null;
}

/** Sub-conta (ultimo segmento) -> classe amigavel. */
const CLASSE_POR_SEGMENTO: Record<string, string> = {
  '1501': 'frota_operacional',
  '1508': 'caminhoes',
  '6301': 'veiculos_auxiliares',
  '0602': 'computadores',
  '2401': 'instalacoes',
  '3601': 'maquinas_oficina',
  '3602': 'maquinas_escritorio',
  '3603': 'moveis',
};
const RE_IMOVEIS = /TERRENO|CASA|LOTE|IM[OÓ]VEL|EDIF|SALA|APARTAMENTO/i;

function classificarClasse(classificador: string, nomeConta: string | null): string {
  const seg = classificador.split('.').pop() ?? '';
  const mapped = CLASSE_POR_SEGMENTO[seg];
  if (mapped) return mapped;
  if (nomeConta && RE_IMOVEIS.test(nomeConta)) return 'imoveis';
  return 'outros';
}

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

export interface DepreciacaoEtlResult {
  processados: number;
  gravados: number;
  ignorados: number;
  comErro: number;
  duracaoMs: number;
}

/**
 * ETL Depreciacao: normaliza CTBSALDO cru -> finance.depreciacao_mensal.
 * Descarta contas sinteticas ('.0000', que repetem a soma dos filhos) e as
 * fora das familias de interesse.
 */
export function buildDepreciacaoEtl(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusCtbsaldoStage);
  const canonRepo = fastify.db.getRepository(DepreciacaoMensal);

  return {
    async processarPendentes(opts: { limite?: number } = {}): Promise<DepreciacaoEtlResult> {
      const inicio = Date.now();
      const log = fastify.log.child({ etl: 'depreciacao' });

      const pendentes = await stageRepo.find({
        where: { processadoEm: IsNull(), excluidoEm: IsNull() },
        take: opts.limite ?? 20000,
        order: { recebidoEm: 'DESC' },
      });
      log.info({ pendentes: pendentes.length }, `[etl:depreciacao] processando ${pendentes.length} linhas`);

      let gravados = 0;
      let ignorados = 0;
      let comErro = 0;

      for (const stage of pendentes) {
        try {
          const raw = stage.rawPayload as unknown as RawCtbSaldoRow;
          const classificador = String(raw.CLASSIFICADOR ?? '').trim();

          // Descarta contas sinteticas (rollup) e familias fora de escopo.
          const grupo = classificarGrupo(classificador);
          if (!grupo || classificador.endsWith('.0000')) {
            stage.processadoEm = new Date();
            await stageRepo.save(stage);
            ignorados += 1;
            continue;
          }

          const competencia = periodoParaCompetencia(String(raw.PERIODO));
          if (!competencia) throw new Error(`PERIODO invalido: ${raw.PERIODO}`);

          const classe = classificarClasse(classificador, raw.NOME_CONTA);
          const debito = brlToCents(raw.VL_DEBITO);
          const credito = brlToCents(raw.VL_CREDITO);
          // Sinal por grupo: despesa/base = deb-cred; acumulada (redutora) = cred-deb.
          const valor = grupo === 'deprec_acumulada' ? credito - debito : debito - credito;

          const origemIdExterno = `${raw.PERIODO}-${raw.NRO_PLANO}-${raw.COD_CONTA_CTB}`;

          await canonRepo
            .createQueryBuilder()
            .insert()
            .values({
              empresaId: raw.CODIGO_EMPRESA,
              competencia,
              periodo: String(raw.PERIODO),
              nroPlano: raw.NRO_PLANO,
              codContaCtb: raw.COD_CONTA_CTB,
              classificador,
              nomeConta: raw.NOME_CONTA ?? null,
              grupo,
              classe,
              debitoCents: debito.toString(),
              creditoCents: credito.toString(),
              valorCents: valor.toString(),
              origemSistema: 'globus',
              origemIdExterno,
              ultimoSyncEm: new Date(),
            })
            .orUpdate(
              [
                'competencia', 'periodo', 'nro_plano', 'classificador', 'nome_conta',
                'grupo', 'classe', 'debito_cents', 'credito_cents', 'valor_cents',
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
          log.warn({ err, stageId: stage.id }, '[etl:depreciacao] falha ao processar');
          await registrarErroSync({
            fastify,
            sistema: 'globus',
            recurso: 'depreciacao',
            fase: 'etl_processamento',
            chaveNatural: {
              codigo_empresa: stage.codigoEmpresa,
              periodo: stage.periodo,
              cod_conta_ctb: stage.codContaCtb,
            },
            rawPayload: stage.rawPayload,
            erro: err,
          });
        }
      }

      const duracaoMs = Date.now() - inicio;
      log.info(
        { processados: pendentes.length, gravados, ignorados, comErro, duracaoMs },
        `[etl:depreciacao] concluido em ${duracaoMs}ms (${gravados} gravados, ${ignorados} ignorados, ${comErro} erros)`,
      );
      return { processados: pendentes.length, gravados, ignorados, comErro, duracaoMs };
    },
  };
}

export type DepreciacaoEtl = ReturnType<typeof buildDepreciacaoEtl>;
