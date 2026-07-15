import type { FastifyInstance } from 'fastify';
import type {
  CalendarioTributarioQuery,
  CalendarioTributarioResponse,
  CalendarioGuiaItem,
  CoberturaTributariaResponse,
  TributosFolhaQuery,
  TributosFolhaResponse,
  TributosFolhaSyncResponse,
} from '@pioneira/shared/schemas/tributos';
import { CALENDARIO_TRIBUTARIO_REF, FONTES_TRIBUTARIAS } from '@pioneira/shared/schemas/tributos';
import {
  COD_INSS_RETIDO,
  COD_FGTS,
  COD_IRRF_RETIDO,
  COD_BASE_INSS,
} from '@/shared/folha/eventos-pioneira.js';
import { ContaPagar } from '@/entities/conta-pagar.entity.js';
import { buildGlobusFlpGpsAdapter } from '@/integrations/globus/globus-flp-gps.adapter.js';
import { buildFolhaGpsEtl } from '@/etl/folha-gps.etl.js';
import { dataIsoSp } from '@/shared/utils/datetime.js';
import { TIPO_FOLHA_FLP_LABEL } from '@pioneira/shared/enums/tipo-folha-flp';

const MES_LABEL: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Marco', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
};

/** Alíquota patronal ESTIMADA (20% CPP + 3% RAT transporte + 5,8% terceiros). */
const ALIQUOTA_PATRONAL_ESTIMADA = 0.288;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Range da competência da folha. A Pioneira grava COMPETFICHA no último dia do
 * PRÓPRIO mês (maio=31/05), então usamos o MÊS SIMPLES [YYYY-MM-01, próximo-01).
 * A janela larga antiga apanhava dois meses e DOBRAVA o valor (ver
 * Leia/folha-integracao-transversal-2026-07.md, seção 6b).
 */
function rangeCompetenciaFolha(yyyyMm: string): { dtIni: string; dtFimExcl: string } {
  const [ano, mes] = yyyyMm.split('-').map(Number);
  const dtIni = new Date(Date.UTC(ano!, mes! - 1, 1)).toISOString().slice(0, 10);
  const dtFimExcl = new Date(Date.UTC(ano!, mes!, 1)).toISOString().slice(0, 10);
  return { dtIni, dtFimExcl };
}

/** Primeiro dia do mês (ISO) e primeiro dia do mês seguinte (exclusivo). */
function intervaloMes(ano: number, mes: number): { ini: string; fimExcl: string } {
  const ini = `${ano}-${pad2(mes)}-01`;
  const proxAno = mes === 12 ? ano + 1 : ano;
  const proxMes = mes === 12 ? 1 : mes + 1;
  const fimExcl = `${proxAno}-${pad2(proxMes)}-01`;
  return { ini, fimExcl };
}

export function buildTributosService(fastify: FastifyInstance) {
  const cpRepo = fastify.db.getRepository(ContaPagar);
  const gpsAdapter = buildGlobusFlpGpsAdapter(fastify);
  const gpsEtl = buildFolhaGpsEtl(fastify);

  return {
    async calendario(query: CalendarioTributarioQuery): Promise<CalendarioTributarioResponse> {
      // Default: mês corrente (America/Sao_Paulo). O frontend normalmente já envia.
      // Regra do projeto (#2): nada de `new Date()` cru — passar pelo utilitário de TZ.
      const [anoSp, mesSp] = dataIsoSp().slice(0, 7).split('-').map(Number);
      const ano = query.ano ?? anoSp!;
      const mes = query.mes ?? mesSp!;
      const { ini, fimExcl } = intervaloMes(ano, mes);

      // Guias (origem='guia') com vencimento no mês — dado REAL do banco.
      const PAGO = `(cp.status = 'pago' OR cp.quitado = true OR cp.data_pagamento IS NOT NULL)`;

      const base = cpRepo
        .createQueryBuilder('cp')
        .where('cp.origem_documento = :origem', { origem: 'guia' })
        .andWhere('cp.excluido_em IS NULL')
        .andWhere('cp.data_vencimento >= :ini', { ini })
        .andWhere('cp.data_vencimento < :fimExcl', { fimExcl });

      const totais = await base
        .clone()
        .select('COUNT(*)', 'qtd')
        .addSelect('COALESCE(SUM(cp.valor_liquido_cents), 0)', 'valor')
        .addSelect(`COALESCE(SUM(CASE WHEN ${PAGO} THEN 1 ELSE 0 END), 0)`, 'pagas_qtd')
        .addSelect(`COALESCE(SUM(CASE WHEN ${PAGO} THEN cp.valor_liquido_cents ELSE 0 END), 0)`, 'pagas_valor')
        .addSelect(
          `COALESCE(SUM(CASE WHEN NOT ${PAGO} AND cp.status <> 'cancelado' AND cp.data_vencimento < CURRENT_DATE THEN 1 ELSE 0 END), 0)`,
          'venc_qtd',
        )
        .addSelect(
          `COALESCE(SUM(CASE WHEN NOT ${PAGO} AND cp.status <> 'cancelado' AND cp.data_vencimento < CURRENT_DATE THEN cp.valor_liquido_cents ELSE 0 END), 0)`,
          'venc_valor',
        )
        .getRawOne<{ qtd: string; valor: string; pagas_qtd: string; pagas_valor: string; venc_qtd: string; venc_valor: string }>();

      const linhas = await cpRepo
        .createQueryBuilder('cp')
        .leftJoinAndSelect('cp.fornecedor', 'forn')
        .where('cp.origem_documento = :origem', { origem: 'guia' })
        .andWhere('cp.excluido_em IS NULL')
        .andWhere('cp.data_vencimento >= :ini', { ini })
        .andWhere('cp.data_vencimento < :fimExcl', { fimExcl })
        .orderBy('cp.dataVencimento', 'ASC')
        .limit(50)
        .getMany();

      const itens: CalendarioGuiaItem[] = linhas.map((cp) => ({
        id: cp.id,
        fornecedorRazaoSocial: cp.fornecedor?.razaoSocial ?? null,
        numeroDocumento: cp.numeroDocumento,
        tipoDocumento: cp.tipoDocumento,
        dataVencimento: cp.dataVencimento,
        dataPagamento: cp.dataPagamento,
        valorAPagarCents: Number(cp.valorLiquidoCents),
        status: cp.status,
      }));

      return {
        ano,
        mes,
        obrigacoes: CALENDARIO_TRIBUTARIO_REF.map((o) => ({ ...o })),
        guias: {
          quantidade: Number(totais?.qtd ?? 0),
          valorAPagarCents: Number(totais?.valor ?? 0),
          pagasQuantidade: Number(totais?.pagas_qtd ?? 0),
          pagasValorCents: Number(totais?.pagas_valor ?? 0),
          vencidasEmAbertoQuantidade: Number(totais?.venc_qtd ?? 0),
          vencidasEmAbertoValorCents: Number(totais?.venc_valor ?? 0),
          itens,
        },
      };
    },

    /**
     * Estado das fontes tributárias — transparência. Os números de retenção/guia
     * são PROVA AO VIVO do banco local (ex.: INSS/ISS somam zero porque o Globus
     * registra zero). As `fontes` qualitativas vêm do catálogo compartilhado.
     */
    async cobertura(): Promise<CoberturaTributariaResponse> {
      const row = await cpRepo
        .createQueryBuilder('cp')
        .where('cp.excluido_em IS NULL')
        .select(`COALESCE(SUM(CASE WHEN cp.tipo_documento = 'NFS' THEN 1 ELSE 0 END), 0)`, 'nfs')
        .addSelect(
          `COALESCE(SUM(CASE WHEN cp.tipo_documento = 'NFS' AND (cp.vlr_pis_cents + cp.vlr_cofins_cents + cp.vlr_csll_cents + cp.vlr_irrf_cents + cp.vlr_inss_cents + cp.vlr_iss_cents) > 0 THEN 1 ELSE 0 END), 0)`,
          'com_ret',
        )
        .addSelect('COALESCE(SUM(cp.vlr_inss_cents), 0)', 'inss')
        .addSelect('COALESCE(SUM(cp.vlr_iss_cents), 0)', 'iss')
        .addSelect(`COALESCE(SUM(CASE WHEN cp.origem_documento = 'guia' THEN 1 ELSE 0 END), 0)`, 'guias')
        .getRawOne<{ nfs: string; com_ret: string; inss: string; iss: string; guias: string }>();

      return {
        retencoes: {
          notasServico: Number(row?.nfs ?? 0),
          comAlgumaRetencao: Number(row?.com_ret ?? 0),
          inssCentsTotal: Number(row?.inss ?? 0),
          issCentsTotal: Number(row?.iss ?? 0),
        },
        guias: { total: Number(row?.guias ?? 0) },
        fontes: FONTES_TRIBUTARIAS.map((f) => ({ ...f })),
      };
    },

    /**
     * Tributos da FOLHA (INSS, FGTS, IRRF) — o peso tributário que o módulo, olhando
     * só o CP, não enxergava. Valores certos vêm de finance.ficha_evento por código
     * de evento; o INSS patronal é ESTIMATIVA marcada (base × alíquota).
     */
    async tributosFolha(query: TributosFolhaQuery): Promise<TributosFolhaResponse> {
      const tipoFolha = query.tipoFolha ?? 1;
      const { dtIni, dtFimExcl } = rangeCompetenciaFolha(query.competencia);

      const rows = await cpRepo.query<Array<{ cod: number; total: string }>>(
        `SELECT fe.cod_evento AS cod, COALESCE(SUM(fe.valor_cents), 0)::text AS total
         FROM finance.ficha_evento fe
         WHERE fe.competencia >= $1::date AND fe.competencia < $2::date AND fe.tipo_folha = $3
         GROUP BY fe.cod_evento`,
        [dtIni, dtFimExcl, tipoFolha],
      );
      const byCod = new Map<number, number>();
      for (const r of rows) byCod.set(Number(r.cod), Number(r.total));
      const disponivel = rows.length > 0;

      const soma = (codes: number[]): number => codes.reduce((s, c) => s + (byCod.get(c) ?? 0), 0);
      const inssRetidoCents = soma(COD_INSS_RETIDO);
      const fgtsCents = soma(COD_FGTS);
      const irrfRetidoCents = soma(COD_IRRF_RETIDO);
      const baseInssCents = byCod.get(COD_BASE_INSS) ?? 0;
      const inssPatronalEstimadoCents = Math.round(baseInssCents * ALIQUOTA_PATRONAL_ESTIMADA);

      // INSS patronal REAL do Globus (FLP_GPS_INTEGRACPG) — soma das filiais na
      // competência. COM_DESON é o que a empresa efetivamente recolhe (a Pioneira
      // está em desoneração/CPRB). Quando existe, vira dado CERTO e substitui a
      // estimativa de 28,8% no painel. Filtrado pelo mesmo tipo de folha.
      const empresaId = fastify.config.globus.empresaId;
      const gpsRows = await cpRepo.query<
        Array<{ com: string; sem: string; base: string; linhas: string; sync: string | null }>
      >(
        `SELECT COALESCE(SUM(patronal_com_deson_cents), 0)::text AS com,
                COALESCE(SUM(patronal_sem_deson_cents), 0)::text AS sem,
                COALESCE(SUM(base_contrib_cents), 0)::text AS base,
                COUNT(*)::text AS linhas,
                MAX(ultimo_sync_em)::text AS sync
           FROM finance.folha_gps
          WHERE empresa_id = $1 AND competencia = $2::date AND tipo_folha = $3 AND excluido_em IS NULL`,
        [empresaId, `${query.competencia}-01`, tipoFolha],
      );
      const gps = gpsRows[0];
      const temGps = !!gps && Number(gps.linhas) > 0 && Number(gps.com) > 0;
      const inssPatronalRealCents = temGps ? Number(gps!.com) : 0;
      const inssPatronalSemDesonCents = temGps ? Number(gps!.sem) : 0;
      const baseContribGpsCents = temGps ? Number(gps!.base) : 0;
      const patronalFonte: 'real' | 'estimativa' = temGps ? 'real' : 'estimativa';
      const gpsSincronizadoEm = temGps && gps!.sync ? new Date(gps!.sync).toISOString() : null;

      const qtdRows = await cpRepo.query<Array<{ qtd: string }>>(
        `SELECT COUNT(DISTINCT fe.funcionario_id)::text AS qtd
         FROM finance.ficha_evento fe
         WHERE fe.competencia >= $1::date AND fe.competencia < $2::date AND fe.tipo_folha = $3`,
        [dtIni, dtFimExcl, tipoFolha],
      );
      const qtdFuncionarios = Number(qtdRows[0]?.qtd ?? 0);

      const syncRaw = await cpRepo.query<Array<{ ultimo: Date | string | null }>>(
        `SELECT MAX(fe.ultimo_sync_em) AS ultimo FROM finance.ficha_evento fe`,
      );
      const ultimoRaw = syncRaw[0]?.ultimo ?? null;
      const ultimoSyncEm = ultimoRaw ? new Date(ultimoRaw).toISOString() : null;

      // Competências com folha (tipo mensal) no banco — guia o seletor quando vazio.
      const dispRaw = await cpRepo.query<Array<{ competencia: string; qtd: string }>>(
        `SELECT to_char(fe.competencia, 'YYYY-MM') AS competencia,
                COUNT(DISTINCT fe.funcionario_id)::text AS qtd
         FROM finance.ficha_evento fe
         WHERE fe.tipo_folha = $1
         GROUP BY to_char(fe.competencia, 'YYYY-MM')
         ORDER BY 1 DESC
         LIMIT 18`,
        [tipoFolha],
      );
      const competenciasDisponiveis = dispRaw.map((d) => ({
        competencia: d.competencia,
        qtdFuncionarios: Number(d.qtd),
      }));

      const [anoC, mesC] = query.competencia.split('-').map(Number);
      const competenciaLabel = `${MES_LABEL[mesC!] ?? mesC}/${anoC}`;

      const tipoFolhaLabel = TIPO_FOLHA_FLP_LABEL[tipoFolha] ?? `tipo ${tipoFolha}`;
      const observacoes = [
        `Este painel mostra UMA folha por vez — atualmente "${tipoFolhaLabel}". ` +
          'O 13º salário sai numa folha à parte (nov/dez): para vê-lo, troque o tipo de folha para "13º Salário". ' +
          'Férias já está dentro da Mensal o ano todo.',
        'INSS retido, FGTS e IRRF são valores CERTOS — o que a empresa desconta/deposita na folha.',
        temGps
          ? 'INSS patronal é DADO REAL do Globus (GPS da folha, COM desoneração). A Pioneira está em desoneração (CPRB, Lei 14.973/2024): o CPP sobre a folha é menor que 20% e parte do INSS patronal é recolhida sobre a RECEITA (guia à parte). "Sem desoneração" mostra quanto seria a 20%, só para comparação.'
          : 'INSS patronal é ESTIMATIVA (base × 28,8%) e SUPERESTIMA: o Globus (FLP_GPS_INTEGRACPG) confirma que a Pioneira está em DESONERAÇÃO da folha (CPRB, Lei 14.973/2024) — o CPP real sobre a folha em 2026 é ~12%, não 20%. Sincronize a guia da folha para trocar pela estimativa pelo valor real (menor).',
        'O recolhimento efetivo sai em guia (GPS / DARF / FGTS Digital) — cruze com as guias do mês no calendário abaixo.',
      ];

      return {
        disponivel,
        competencia: query.competencia,
        competenciaLabel,
        tipoFolha,
        qtdFuncionarios,
        inssRetidoCents,
        fgtsCents,
        irrfRetidoCents,
        baseInssCents,
        inssPatronalEstimadoCents,
        aliquotaPatronalEstimada: ALIQUOTA_PATRONAL_ESTIMADA,
        inssPatronalRealCents,
        inssPatronalSemDesonCents,
        baseContribGpsCents,
        patronalFonte,
        gpsSincronizadoEm,
        observacoes,
        competenciasDisponiveis,
        ultimoSyncEm,
      };
    },

    /** Sync do FLP_GPS_INTEGRACPG (INSS patronal real): Globus -> stage -> canônico. */
    async sincronizarFolhaGps(args: { usuarioId: string }): Promise<TributosFolhaSyncResponse> {
      const inicio = Date.now();
      const empresa = fastify.config.globus.empresaId;

      const sync = await gpsAdapter.sincronizar({ empresa, usuarioId: args.usuarioId });
      let etlGravados = 0;
      if (sync.status !== 'erro') {
        const r = await gpsEtl.processarPendentes({ limite: 50000 });
        etlGravados = r.gravados;
      }

      return {
        jobId: sync.jobId,
        registrosLidos: sync.registrosLidos,
        registrosGravados: sync.registrosGravados,
        etlGravados,
        duracaoMs: Date.now() - inicio,
        status: sync.status,
        mensagem: sync.mensagem,
      };
    },
  };
}

export type TributosService = ReturnType<typeof buildTributosService>;
