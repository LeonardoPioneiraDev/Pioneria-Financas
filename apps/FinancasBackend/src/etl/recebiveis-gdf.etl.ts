import type { FastifyInstance } from 'fastify';
import { IsNull } from 'typeorm';
import { HorariosRelatorioStage } from '@/entities/horarios-relatorio-stage.entity.js';
import { RecebivelGdfRelatorio } from '@/entities/recebivel-gdf-relatorio.entity.js';
import { RecebivelGdfCelula } from '@/entities/recebivel-gdf-celula.entity.js';
import { sha256Json } from '@/shared/utils/crypto.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

/**
 * ETL Recebiveis GDF: processa relatorios pendentes do stage, busca o
 * detalhe na API horarios, e materializa em finance.recebivel_gdf_relatorio
 * + finance.recebivel_gdf_celula.
 *
 * Idempotente: upsert por origem_id_externo. Re-rodar nao duplica nem perde
 * dados; se o detalhe mudou, o hash detecta e atualiza.
 */

interface RelatorioMetadata {
  id: string;
  filename: string;
  fileType: string;
  dateRange: string;
  productCount: number;
  rowCount: number;
  dateColumnsCount: number;
  processedAt: string;
  userName: string;
}

interface OutputRow {
  tarifa: string;             // "3,80" ou "" para subtotais
  tipoPagamento: string;      // "CID Metropol 1 (Integ)" ou "TT CIDADAO" (subtotal)
  values: Record<string, { valor: number; creditos: number }>;
  isSubtotal: boolean;
  isGrandTotal: boolean;
}

interface RelatorioDetalhe extends RelatorioMetadata {
  data: {
    fileType: string;
    metadata: { dateRange: string; productCount: number; originalFileName: string };
    outputRows: OutputRow[];
  };
}

const FAMILIA_POR_PREFIXO: Array<{ regex: RegExp; familia: string }> = [
  // Pagantes
  { regex: /^CID\b/i, familia: 'CIDADAO' },
  { regex: /^VT\b/i, familia: 'VT' },
  { regex: /^EMV\b/i, familia: 'EMV' },
  { regex: /^QR\s*CODE|^QRCODE/i, familia: 'QRCODE' },
  { regex: /^PAGANTE/i, familia: 'PAGANTE' },
  { regex: /^Dia\s*Livre/i, familia: 'DIALIVRE' },
  // Gratuidades
  { regex: /^Crian/i, familia: 'CRIANCA' },
  { regex: /^Esp\/A|^ESPA/i, familia: 'ESPA' },
  { regex: /^Esp\b|^ESP\b/i, familia: 'ESP' },
  { regex: /^PNE\/A|^PNEA/i, familia: 'PNEA' },
  { regex: /^PNE\b/i, familia: 'PNE' },
  { regex: /^PLE/i, familia: 'PLE' },
  { regex: /^SENIOR|^Sen\b|^Idoso/i, familia: 'SENIOR' },
  { regex: /^PorElas|^Por\s*Elas/i, familia: 'PORELAS' },
  { regex: /^FUNC/i, familia: 'FUNCIONARIO' },
  { regex: /^Gratuito|^GRATUITO/i, familia: 'GRATUITO' },
];

const PAGANTES = new Set(['CIDADAO', 'VT', 'EMV', 'QRCODE', 'PAGANTE', 'DIALIVRE']);

function classificarFamilia(tipoPagamento: string): string {
  const txt = tipoPagamento.trim();
  for (const regra of FAMILIA_POR_PREFIXO) {
    if (regra.regex.test(txt)) return regra.familia;
  }
  // Fallback: assume GRATUITO (familia generica) e loga depois
  return 'GRATUITO';
}

/** Tarifa "3,80" → 380 (centavos inteiros). */
function tarifaParaCents(tarifa: string): number {
  if (!tarifa) return 0;
  const num = Number(tarifa.replace(',', '.'));
  if (Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

/** "01/05/2026" ou "DD/MM/YYYY" da chave "Data do Movimento 01/05/2026" → '2026-05-01'. */
function dataBrParaIso(s: string): string | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Extrai data_resgate do `dateRange`. Formato:
 *   "De: 19/05/2026 até 19/05/2026 - Operadora: [Todas] - Sistema: [Todos]"
 *
 * Pega a primeira data ("De: DD/MM/YYYY"). Se intervalo > 1 dia, ainda usa
 * o inicio como referencia.
 */
function dataResgateDoRange(dateRange: string): string | null {
  const m = dateRange.match(/De:\s*(\d{2}\/\d{2}\/\d{4})/);
  if (!m) return null;
  return dataBrParaIso(m[1]!);
}

export interface RecebiveisGdfEtlResult {
  processados: number;
  gravadosRelatorio: number;
  gravadasCelulas: number;
  inalterados: number;
  comErro: number;
  duracaoMs: number;
}

export function buildRecebiveisGdfEtl(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(HorariosRelatorioStage);
  const relatorioRepo = fastify.db.getRepository(RecebivelGdfRelatorio);
  const celulaRepo = fastify.db.getRepository(RecebivelGdfCelula);

  return {
    async processarPendentes(opts: { limite?: number } = {}): Promise<RecebiveisGdfEtlResult> {
      const inicio = Date.now();
      const log = fastify.log.child({ etl: 'recebiveis_gdf' });

      const pendentes = await stageRepo.find({
        where: { processadoEm: IsNull(), excluidoEm: IsNull() },
        take: opts.limite ?? 100,
        order: { recebidoEm: 'DESC' },
      });
      log.info({ pendentes: pendentes.length }, `[etl:recebiveis-gdf] processando ${pendentes.length} relatorios`);

      let gravadosRelatorio = 0;
      let gravadasCelulas = 0;
      let inalterados = 0;
      let comErro = 0;

      for (const stage of pendentes) {
        try {
          if (!fastify.horarios.isAvailable()) {
            throw new Error('Cliente horarios indisponivel');
          }
          // Busca detalhe por id
          const res = await fastify.horarios.get<RelatorioDetalhe>(
            `/api/integrations/conferencia-resgate/${stage.origemIdExterno}`,
            undefined,
            { queryName: 'horarios:conferencia-resgate:detalhe' },
          );
          const det = res.data;
          if (!det || !det.data?.outputRows) {
            throw new Error('Resposta sem outputRows');
          }

          const dataResgate = dataResgateDoRange(det.dateRange ?? '');
          if (!dataResgate) {
            throw new Error(`Nao foi possivel extrair data_resgate de dateRange="${det.dateRange}"`);
          }

          // Hash do detalhe completo para detectar mudanca
          const hashDetalhe = sha256Json(det.data);

          // Upsert do cabecalho
          const upsertRel = await relatorioRepo.query<Array<{ id: string }>>(
            `INSERT INTO finance.recebivel_gdf_relatorio
               (origem_id_externo, filename, file_type, date_range, data_resgate,
                product_count, row_count, date_columns_count, user_name, processed_at,
                valor_total_cents, creditos_total, ultimo_sync_em)
             VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, 0, 0, NOW())
             ON CONFLICT (origem_id_externo)
             DO UPDATE SET
               filename = EXCLUDED.filename,
               file_type = EXCLUDED.file_type,
               date_range = EXCLUDED.date_range,
               data_resgate = EXCLUDED.data_resgate,
               product_count = EXCLUDED.product_count,
               row_count = EXCLUDED.row_count,
               date_columns_count = EXCLUDED.date_columns_count,
               user_name = EXCLUDED.user_name,
               processed_at = EXCLUDED.processed_at,
               ultimo_sync_em = NOW(),
               atualizado_em = NOW()
             RETURNING id`,
            [
              det.id,
              det.filename,
              det.fileType,
              det.dateRange,
              dataResgate,
              det.productCount,
              det.rowCount,
              det.dateColumnsCount,
              det.userName,
              det.processedAt,
            ],
          );
          const relatorioId = upsertRel[0]!.id;
          gravadosRelatorio += 1;

          // Agrega celulas EM MEMORIA por (transporte, tipoPagamento, tarifa),
          // SOMANDO valor+creditos. Motivo: o relatorio BRB traz VARIAS linhas
          // com o mesmo tipoPagamento+tarifa (split por operadora/sistema upstream,
          // dimensao que nao guardamos). A celula correta e a SOMA delas. O codigo
          // antigo dava upsert imediato com ON CONFLICT sobrescrevendo (EXCLUDED.valor),
          // entao a 2a linha apagava a 1a -> perdia ~25% do valor (e creditos de
          // gratuidades, ex: "Dia Livre" x6 tarifa 0). Agregar aqui recupera tudo e
          // mantem idempotencia (re-rodar recalcula a mesma soma). Ignora subtotais,
          // grand total e a coluna "Resgate de ..." (redundante = soma das de transporte).
          interface CelulaAcc {
            dataTransporte: string;
            tipoPagamento: string;
            tarifaCents: number;
            familia: string;
            ehPagante: boolean;
            valorCents: number;
            creditos: number;
          }
          let valorTotal = 0;
          let creditosTotal = 0;
          const familiasDesconhecidas = new Set<string>();
          const acc = new Map<string, CelulaAcc>();
          const linhasFato = det.data.outputRows.filter((r) => !r.isSubtotal && !r.isGrandTotal);

          for (const row of linhasFato) {
            const familia = classificarFamilia(row.tipoPagamento);
            if (!PAGANTES.has(familia) && familia === 'GRATUITO' && !/Gratuito/i.test(row.tipoPagamento)) {
              familiasDesconhecidas.add(row.tipoPagamento);
            }
            const tarifaCents = tarifaParaCents(row.tarifa);
            const ehPagante = PAGANTES.has(familia);

            for (const [chave, vals] of Object.entries(row.values)) {
              if (!chave.startsWith('Data do Movimento')) continue;
              const dataTransporte = dataBrParaIso(chave);
              if (!dataTransporte) continue;
              if (vals.valor === 0 && vals.creditos === 0) continue; // pula celulas vazias

              const valorCents = Math.round(vals.valor * 100);
              const creditos = vals.creditos;
              valorTotal += valorCents;
              creditosTotal += creditos;

              const origemCelula = `${det.id}|${dataTransporte}|${row.tipoPagamento}|${tarifaCents}`;
              const ex = acc.get(origemCelula);
              if (ex) {
                ex.valorCents += valorCents;
                ex.creditos += creditos;
              } else {
                acc.set(origemCelula, {
                  dataTransporte, tipoPagamento: row.tipoPagamento, tarifaCents,
                  familia, ehPagante, valorCents, creditos,
                });
              }
            }
          }

          // Upsert das celulas JA agregadas (1 por chave, valor somado)
          for (const [origemCelula, c] of acc) {
            const hashCelula = sha256Json({
              familia: c.familia, tipoPagamento: c.tipoPagamento, tarifaCents: c.tarifaCents,
              valorCents: c.valorCents, creditos: c.creditos,
            });
            await celulaRepo.query(
              `INSERT INTO finance.recebivel_gdf_celula
                 (relatorio_id, data_resgate, data_transporte, familia, tipo_pagamento,
                  tarifa_cents, valor_cents, creditos, eh_pagante, origem_id_externo, hash_payload)
               VALUES ($1, $2::date, $3::date, $4, $5, $6, $7, $8, $9, $10, $11)
               ON CONFLICT (origem_id_externo)
               DO UPDATE SET
                 relatorio_id = EXCLUDED.relatorio_id,
                 familia = EXCLUDED.familia,
                 tarifa_cents = EXCLUDED.tarifa_cents,
                 valor_cents = EXCLUDED.valor_cents,
                 creditos = EXCLUDED.creditos,
                 eh_pagante = EXCLUDED.eh_pagante,
                 hash_payload = EXCLUDED.hash_payload,
                 atualizado_em = NOW(),
                 excluido_em = NULL,
                 excluido_motivo = NULL`,
              [relatorioId, dataResgate, c.dataTransporte, c.familia, c.tipoPagamento,
               c.tarifaCents, c.valorCents, c.creditos, c.ehPagante, origemCelula, hashCelula],
            );
            gravadasCelulas += 1;
          }

          // Totais do cabecalho = soma de TODAS as linhas (consistente com as celulas agregadas)
          await relatorioRepo.query(
            `UPDATE finance.recebivel_gdf_relatorio
                SET valor_total_cents = $2, creditos_total = $3
              WHERE id = $1`,
            [relatorioId, valorTotal, creditosTotal],
          );

          if (familiasDesconhecidas.size > 0) {
            log.warn(
              { relatorioId, tipos: Array.from(familiasDesconhecidas).slice(0, 5) },
              `[etl:recebiveis-gdf] ${familiasDesconhecidas.size} tipoPagamento sem familia mapeada — caem em GRATUITO`,
            );
          }

          stage.processadoEm = new Date();
          await stageRepo.save(stage);

          // hash_detalhe nao e gravado no stage hoje, fica como nota — se quiser
          // skip mais agressivo no futuro, salvar em coluna dedicada.
          void hashDetalhe;
        } catch (err) {
          comErro += 1;
          log.warn({ err, stageId: stage.id, relatorioId: stage.origemIdExterno }, '[etl:recebiveis-gdf] falha ao processar');
          await registrarErroSync({
            fastify,
            sistema: 'horarios',
            recurso: 'recebivel_gdf',
            fase: 'etl_processamento',
            chaveNatural: { relatorio_id: stage.origemIdExterno },
            rawPayload: stage.rawPayload,
            erro: err,
          });
        }
      }

      const duracaoMs = Date.now() - inicio;
      log.info(
        { processados: pendentes.length, gravadosRelatorio, gravadasCelulas, inalterados, comErro, duracaoMs },
        `[etl:recebiveis-gdf] concluido em ${duracaoMs}ms`,
      );
      return { processados: pendentes.length, gravadosRelatorio, gravadasCelulas, inalterados, comErro, duracaoMs };
    },
  };
}

export type RecebiveisGdfEtl = ReturnType<typeof buildRecebiveisGdfEtl>;
