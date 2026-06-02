import type { FastifyInstance } from 'fastify';
import type { FolhaCompetenciasQuery, FolhaCompetenciasResponse, CompetenciaFolhaItem, QuebraTipoFolha } from '@pioneira/shared/schemas/folha';
import type { TipoFolha } from '@pioneira/shared/enums/tipo-folha';
import { ContaPagar } from '@/entities/conta-pagar.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';

const MES_LABEL: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Marco', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
};

interface CompetenciaRaw {
  competencia: Date | string;
  qtd_titulos: string;
  qtd_fornecedores: string;
  bruto: string;
  inss: string;
  irrf: string;
  pis: string;
  cofins: string;
  csll: string;
  iss: string;
  liquido: string;
  pago: string;
  primeiro_vencimento: Date | string | null;
  ultimo_vencimento: Date | string | null;
}

function competenciaLabelFromDate(iso: string): string {
  // iso = 'YYYY-MM-01'
  const ano = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  return `${MES_LABEL[mes] ?? mes}/${ano}`;
}

/** Converte qualquer entrada de data do TypeORM para string YYYY-MM-DD. */
function dataIsoOuNull(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  // Pode vir como '2026-04-01' ou '2026-04-01T00:00:00.000Z' ou 'Wed May 13 2026...'
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Ultimo fallback: parsear como Date
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function buildFolhaService(fastify: FastifyInstance) {
  const cpRepo = fastify.db.getRepository(ContaPagar);
  const jobRepo = fastify.db.getRepository(SyncJob);

  return {
    /**
     * Agrega todos os titulos com origem_documento='folha' por competencia_flp.
     * Calcula totais brutos, retencoes detalhadas, valor a pagar (liquido apos
     * retencoes) e quanto ja foi pago.
     */
    async listarCompetencias(query: FolhaCompetenciasQuery): Promise<FolhaCompetenciasResponse> {
      // Padrao: filtra pelo mes de PAGAMENTO (data_vencimento) - faz sentido para tesouraria.
      // Folha de Abril (competencia_flp=2026-04) eh paga em Maio (data_vencimento=2026-05).
      const filtrarPor = query.filtrarPor ?? 'vencimento';
      const colunaFiltro = filtrarPor === 'competencia' ? 'cp.competencia_flp' : 'cp.data_vencimento';

      const qb = cpRepo
        .createQueryBuilder('cp')
        .select('cp.competencia_flp', 'competencia')
        .addSelect('COUNT(*)', 'qtd_titulos')
        .addSelect('COUNT(DISTINCT cp.fornecedor_id)', 'qtd_fornecedores')
        .addSelect('COALESCE(SUM(cp.valor_bruto_cents), 0)', 'bruto')
        .addSelect('COALESCE(SUM(cp.vlr_inss_cents), 0)', 'inss')
        .addSelect('COALESCE(SUM(cp.vlr_irrf_cents), 0)', 'irrf')
        .addSelect('COALESCE(SUM(cp.vlr_pis_cents), 0)', 'pis')
        .addSelect('COALESCE(SUM(cp.vlr_cofins_cents), 0)', 'cofins')
        .addSelect('COALESCE(SUM(cp.vlr_csll_cents), 0)', 'csll')
        .addSelect('COALESCE(SUM(cp.vlr_iss_cents), 0)', 'iss')
        .addSelect('COALESCE(SUM(cp.valor_liquido_cents), 0)', 'liquido')
        .addSelect(
          `COALESCE(SUM(CASE WHEN cp.quitado = true OR cp.data_pagamento IS NOT NULL THEN cp.valor_liquido_cents ELSE 0 END), 0)`,
          'pago',
        )
        .addSelect('MIN(cp.data_vencimento)', 'primeiro_vencimento')
        .addSelect('MAX(cp.data_vencimento)', 'ultimo_vencimento')
        .where('cp.origem_documento = :origem', { origem: 'folha' })
        .groupBy('cp.competencia_flp')
        .orderBy('cp.competencia_flp', 'DESC', 'NULLS LAST');

      if (query.competencia) {
        const [ano, mes] = query.competencia.split('-').map(Number);
        qb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano AND EXTRACT(MONTH FROM ${colunaFiltro}) = :mes`, {
          ano,
          mes,
        });
      } else if (query.ano) {
        qb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano`, { ano: query.ano });
      }

      const raw = await qb.getRawMany<CompetenciaRaw>();

      // Quebra por tipo_folha para cada competencia
      const tipoQb = cpRepo
        .createQueryBuilder('cp')
        .select('cp.competencia_flp', 'competencia')
        .addSelect("COALESCE(cp.tipo_folha, 'nao_classificado')", 'tipo')
        .addSelect('COUNT(*)', 'qtd_titulos')
        .addSelect('COALESCE(SUM(cp.valor_bruto_cents), 0)', 'bruto')
        .addSelect('COALESCE(SUM(cp.valor_liquido_cents), 0)', 'liquido')
        .addSelect(
          `COALESCE(SUM(CASE WHEN cp.quitado = true OR cp.data_pagamento IS NOT NULL THEN cp.valor_liquido_cents ELSE 0 END), 0)`,
          'pago',
        )
        .where('cp.origem_documento = :origem', { origem: 'folha' })
        .groupBy('cp.competencia_flp')
        .addGroupBy('cp.tipo_folha');

      if (query.competencia) {
        const [ano, mes] = query.competencia.split('-').map(Number);
        tipoQb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano AND EXTRACT(MONTH FROM ${colunaFiltro}) = :mes`, { ano, mes });
      } else if (query.ano) {
        tipoQb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano`, { ano: query.ano });
      }

      const tipoRaw = await tipoQb.getRawMany<{ competencia: Date | string | null; tipo: string; qtd_titulos: string; bruto: string; liquido: string; pago: string }>();
      const tiposPorCompetencia = new Map<string, QuebraTipoFolha[]>();
      for (const t of tipoRaw) {
        const compIso = dataIsoOuNull(t.competencia) ?? '';
        if (!tiposPorCompetencia.has(compIso)) tiposPorCompetencia.set(compIso, []);
        tiposPorCompetencia.get(compIso)!.push({
          tipo: t.tipo as TipoFolha,
          qtdTitulos: Number(t.qtd_titulos),
          valorBrutoCents: Number(t.bruto),
          valorLiquidoCents: Number(t.liquido),
          valorPagoCents: Number(t.pago),
        });
      }

      const competencias: CompetenciaFolhaItem[] = raw.map((r) => {
        const inss = Number(r.inss);
        const irrf = Number(r.irrf);
        const pis = Number(r.pis);
        const cofins = Number(r.cofins);
        const csll = Number(r.csll);
        const iss = Number(r.iss);
        const totalRetencoes = inss + irrf + pis + cofins + csll + iss;
        const liquido = Number(r.liquido);
        const pago = Number(r.pago);
        const valorAPagar = liquido - totalRetencoes;
        const competenciaIso = dataIsoOuNull(r.competencia);

        return {
          competencia: competenciaIso ?? '',
          competenciaLabel: competenciaIso ? competenciaLabelFromDate(competenciaIso) : 'Sem competência',
          qtdTitulos: Number(r.qtd_titulos),
          qtdFornecedores: Number(r.qtd_fornecedores),
          valorBrutoCents: Number(r.bruto),
          retencoes: { inssCents: inss, irrfCents: irrf, pisCents: pis, cofinsCents: cofins, csllCents: csll, issCents: iss, totalCents: totalRetencoes },
          valorLiquidoCents: liquido,
          valorAPagarCents: valorAPagar,
          valorPagoCents: pago,
          valorEmAbertoCents: Math.max(0, liquido - pago),
          primeiroVencimento: dataIsoOuNull(r.primeiro_vencimento),
          ultimoVencimento: dataIsoOuNull(r.ultimo_vencimento),
          porTipo: (tiposPorCompetencia.get(competenciaIso ?? '') ?? []).sort((a, b) => b.valorLiquidoCents - a.valorLiquidoCents),
        };
      });

      // ============ BUCKETS DE AGING EXCLUSIVOS + QUEBRA POR TIPO GERAL ============
      // Faz UMA query consolidada do período inteiro com 4 buckets exclusivos.
      const agingQb = cpRepo
        .createQueryBuilder('cp')
        .select(
          `CASE
             WHEN cp.status = 'pago' OR cp.quitado = true OR cp.data_pagamento IS NOT NULL THEN 'pago'
             WHEN cp.status = 'cancelado' THEN 'cancelado'
             WHEN cp.data_vencimento <  CURRENT_DATE                            THEN 'vencido'
             WHEN cp.data_vencimento <= CURRENT_DATE + INTERVAL '7 days'        THEN 'vence_7d'
             ELSE 'vence_mais'
           END`,
          'bucket',
        )
        .addSelect('COUNT(*)', 'qtd')
        .addSelect('COALESCE(SUM(cp.valor_liquido_cents), 0)', 'liquido')
        .where('cp.origem_documento = :origem', { origem: 'folha' })
        .groupBy('1');

      if (query.competencia) {
        const [ano, mes] = query.competencia.split('-').map(Number);
        agingQb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano AND EXTRACT(MONTH FROM ${colunaFiltro}) = :mes`, { ano, mes });
      } else if (query.ano) {
        agingQb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano`, { ano: query.ano });
      }

      const agingRaw = await agingQb.getRawMany<{ bucket: string; qtd: string; liquido: string }>();
      const buckets = {
        vencidos: { qtd: 0, valorCents: 0 },
        venceEm7d: { qtd: 0, valorCents: 0 },
        venceMaisDe7: { qtd: 0, valorCents: 0 },
        pago: { qtd: 0, valorCents: 0 },
      };
      for (const b of agingRaw) {
        const qtd = Number(b.qtd);
        const valor = Number(b.liquido);
        if (b.bucket === 'pago') buckets.pago = { qtd, valorCents: valor };
        else if (b.bucket === 'vencido') buckets.vencidos = { qtd, valorCents: valor };
        else if (b.bucket === 'vence_7d') buckets.venceEm7d = { qtd, valorCents: valor };
        else if (b.bucket === 'vence_mais') buckets.venceMaisDe7 = { qtd, valorCents: valor };
        // 'cancelado' não vai pra card mas conta no total
      }

      // Quebra por tipo AGREGADA do período inteiro (não por competência).
      const tipoGeralQb = cpRepo
        .createQueryBuilder('cp')
        .select("COALESCE(cp.tipo_folha, 'nao_classificado')", 'tipo')
        .addSelect('COUNT(*)', 'qtd_titulos')
        .addSelect('COALESCE(SUM(cp.valor_bruto_cents), 0)', 'bruto')
        .addSelect('COALESCE(SUM(cp.valor_liquido_cents), 0)', 'liquido')
        .addSelect(
          `COALESCE(SUM(CASE WHEN cp.quitado = true OR cp.data_pagamento IS NOT NULL THEN cp.valor_liquido_cents ELSE 0 END), 0)`,
          'pago',
        )
        .where('cp.origem_documento = :origem', { origem: 'folha' })
        .groupBy('cp.tipo_folha');

      if (query.competencia) {
        const [ano, mes] = query.competencia.split('-').map(Number);
        tipoGeralQb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano AND EXTRACT(MONTH FROM ${colunaFiltro}) = :mes`, { ano, mes });
      } else if (query.ano) {
        tipoGeralQb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano`, { ano: query.ano });
      }

      const tipoGeralRaw = await tipoGeralQb.getRawMany<{ tipo: string; qtd_titulos: string; bruto: string; liquido: string; pago: string }>();
      const porTipoGeral: QuebraTipoFolha[] = tipoGeralRaw
        .map((t) => ({
          tipo: t.tipo as TipoFolha,
          qtdTitulos: Number(t.qtd_titulos),
          valorBrutoCents: Number(t.bruto),
          valorLiquidoCents: Number(t.liquido),
          valorPagoCents: Number(t.pago),
        }))
        .sort((a, b) => b.valorLiquidoCents - a.valorLiquidoCents);

      const totais = competencias.reduce(
        (acc, c) => ({
          qtdCompetencias: acc.qtdCompetencias + 1,
          qtdTitulos: acc.qtdTitulos + c.qtdTitulos,
          valorBrutoCents: acc.valorBrutoCents + c.valorBrutoCents,
          valorLiquidoCents: acc.valorLiquidoCents + c.valorLiquidoCents,
          valorAPagarCents: acc.valorAPagarCents + c.valorAPagarCents,
          valorPagoCents: acc.valorPagoCents + c.valorPagoCents,
          valorEmAbertoCents: acc.valorEmAbertoCents + c.valorEmAbertoCents,
          retencoesCents: acc.retencoesCents + c.retencoes.totalCents,
        }),
        { qtdCompetencias: 0, qtdTitulos: 0, valorBrutoCents: 0, valorLiquidoCents: 0, valorAPagarCents: 0, valorPagoCents: 0, valorEmAbertoCents: 0, retencoesCents: 0 },
      );

      const ultimoJob = await jobRepo.findOne({
        where: { sistema: 'globus', recurso: 'contas_pagar' },
        order: { iniciadoEm: 'DESC' },
      });
      const totalLocal = await cpRepo.count({ where: { origemDocumento: 'folha' } });

      return {
        competencias,
        totais: {
          ...totais,
          vencidos: buckets.vencidos,
          venceEm7d: buckets.venceEm7d,
          venceMaisDe7: buckets.venceMaisDe7,
          pago: buckets.pago,
        },
        porTipoGeral,
        syncInfo: {
          ultimoSyncEm: ultimoJob?.terminadoEm ? ultimoJob.terminadoEm.toISOString() : null,
          totalLocal,
          precisaSincronizar: totalLocal === 0,
        },
      };
    },
  };
}

export type FolhaService = ReturnType<typeof buildFolhaService>;
