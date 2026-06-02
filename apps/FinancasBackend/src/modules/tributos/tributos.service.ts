import type { FastifyInstance } from 'fastify';
import type {
  CalendarioTributarioQuery,
  CalendarioTributarioResponse,
  CalendarioGuiaItem,
  CoberturaTributariaResponse,
} from '@pioneira/shared/schemas/tributos';
import { CALENDARIO_TRIBUTARIO_REF, FONTES_TRIBUTARIAS } from '@pioneira/shared/schemas/tributos';
import { ContaPagar } from '@/entities/conta-pagar.entity.js';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
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

  return {
    async calendario(query: CalendarioTributarioQuery): Promise<CalendarioTributarioResponse> {
      // Default: mês corrente (America/Sao_Paulo). O frontend normalmente já envia.
      const agora = new Date();
      const ano = query.ano ?? agora.getFullYear();
      const mes = query.mes ?? agora.getMonth() + 1;
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
  };
}

export type TributosService = ReturnType<typeof buildTributosService>;
