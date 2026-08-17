import type { FastifyInstance } from 'fastify';
import { In } from 'typeorm';
import type {
  ContaReceberListQuery,
  ContaReceberListResponse,
  ContaReceberItem,
  ContaReceberStatus,
  SumarioContasReceberQuery,
  SumarioContasReceberResponse,
  SyncContasReceberBody,
  SyncContasReceberResponse,
  SyncInfoCr,
  FaixaAging,
} from '@pioneira/shared/schemas/contas-receber';
import { CONTA_RECEBER_STATUS } from '@pioneira/shared/enums/conta-receber-status';
import { ContaReceber } from '@/entities/conta-receber.entity.js';
import { Cliente } from '@/entities/cliente.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { buildGlobusCrcAdapter } from '@/integrations/globus/globus-crc.adapter.js';
import { buildCrcEtl } from '@/etl/crc.etl.js';

// EMPRESA_GLOBUS_ID centralizado em config/environment.ts (fastify.config.globus.empresaId).

function primeiroDiaMesUtc(): Date {
  const h = new Date();
  return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), 1));
}
function primeiroDiaProximoMesUtc(): Date {
  const h = new Date();
  return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth() + 1, 1));
}

function statusValidos(input: string | undefined): ContaReceberStatus[] {
  if (!input) return [];
  return input.split(',').map((s) => s.trim()).filter((s): s is ContaReceberStatus =>
    CONTA_RECEBER_STATUS.includes(s as ContaReceberStatus),
  );
}

function calcLiquido(cr: ContaReceber): number {
  const bruto = Number(cr.valorBrutoCents);
  const desc = Number(cr.descontoCents);
  const acres = Number(cr.acrescimoCents);
  const retencoes = Number(cr.vlrInssCents) + Number(cr.vlrIrrfCents) + Number(cr.vlrPisCents)
    + Number(cr.vlrCofinsCents) + Number(cr.vlrCsllCents) + Number(cr.vlrIssCents);
  return bruto - desc + acres - retencoes;
}

function toResponse(cr: ContaReceber): ContaReceberItem {
  const inss = Number(cr.vlrInssCents);
  const irrf = Number(cr.vlrIrrfCents);
  const pis = Number(cr.vlrPisCents);
  const cofins = Number(cr.vlrCofinsCents);
  const csll = Number(cr.vlrCsllCents);
  const iss = Number(cr.vlrIssCents);
  const totalRet = inss + irrf + pis + cofins + csll + iss;
  return {
    id: cr.id,
    cliente: cr.cliente
      ? {
          id: cr.cliente.id,
          razaoSocial: cr.cliente.razaoSocial,
          nomeFantasia: cr.cliente.nomeFantasia,
          numeroInscricao: cr.cliente.numeroInscricao,
        }
      : null,
    numeroDocumento: cr.numeroDocumento,
    serieDocumento: cr.serieDocumento,
    numeroParcela: cr.numeroParcela,
    tipoDocumento: cr.tipoDocumento,
    dataEmissao: cr.dataEmissao,
    dataVencimento: cr.dataVencimento,
    dataVencimentoOriginal: cr.dataVencimentoOriginal,
    dataRecebimento: cr.dataRecebimento,
    valorBrutoCents: Number(cr.valorBrutoCents),
    descontoCents: Number(cr.descontoCents),
    acrescimoCents: Number(cr.acrescimoCents),
    retencoes: {
      inssCents: inss, irrfCents: irrf, pisCents: pis,
      cofinsCents: cofins, csllCents: csll, issCents: iss,
      totalCents: totalRet,
    },
    valorLiquidoCents: calcLiquido(cr),
    status: cr.status,
    quitado: cr.quitado,
    renegociado: cr.renegociado,
    protestado: cr.protestado,
    faturaImpressa: cr.faturaImpressa,
    nossoNumero: cr.nossoNumero,
    observacao: cr.observacao,
  };
}

export function buildContasReceberService(fastify: FastifyInstance) {
  const crRepo = fastify.db.getRepository(ContaReceber);
  const cliRepo = fastify.db.getRepository(Cliente);
  const jobRepo = fastify.db.getRepository(SyncJob);
  const adapter = buildGlobusCrcAdapter(fastify);
  const etl = buildCrcEtl(fastify);

  return {
    async listar(query: ContaReceberListQuery): Promise<ContaReceberListResponse> {
      const pagina = query.pagina ?? 1;
      const porPagina = query.porPagina ?? 50;
      const offset = (pagina - 1) * porPagina;

      const qb = crRepo.createQueryBuilder('cr');

      // Filtro por DATA DE RECEBIMENTO (o que foi recebido no período) — espelho do
      // filtro de pagamento do CP. Quando ativo, desabilita o filtro de vencimento
      // pra trazer tudo que foi recebido no intervalo, independente de quando vencia.
      // Títulos não recebidos têm data_recebimento nula e ficam de fora.
      const filtraRecebimento = !!(query.dtRecIni || query.dtRecFim);
      if (filtraRecebimento) {
        if (query.dtRecIni) qb.andWhere('cr.data_recebimento >= :dtRecIni', { dtRecIni: query.dtRecIni });
        if (query.dtRecFim) qb.andWhere('cr.data_recebimento <= :dtRecFim', { dtRecFim: query.dtRecFim });
      } else {
        if (query.dtIni) qb.andWhere('cr.data_vencimento >= :dtIni', { dtIni: query.dtIni });
        if (query.dtFim) qb.andWhere('cr.data_vencimento <= :dtFim', { dtFim: query.dtFim });
      }
      const statuses = statusValidos(query.status);
      if (statuses.length > 0) qb.andWhere('cr.status IN (:...statuses)', { statuses });
      if (query.clienteId) qb.andWhere('cr.cliente_id = :clienteId', { clienteId: query.clienteId });

      // Aging
      const hoje = new Date().toISOString().slice(0, 10);
      if (query.faixa) {
        if (query.faixa === 'atrasado') {
          qb.andWhere('cr.data_vencimento < :hoje', { hoje });
          qb.andWhere(`cr.status IN ('aberto','renegociado')`);
        } else if (query.faixa === 'vence_hoje') {
          qb.andWhere('cr.data_vencimento = :hoje', { hoje });
        } else if (query.faixa === 'vence_7d') {
          qb.andWhere(`cr.data_vencimento BETWEEN CAST(:hoje AS DATE) AND (CAST(:hoje AS DATE) + INTERVAL '7 days')`, { hoje });
        } else if (query.faixa === 'vence_30d') {
          qb.andWhere(`cr.data_vencimento BETWEEN CAST(:hoje AS DATE) AND (CAST(:hoje AS DATE) + INTERVAL '30 days')`, { hoje });
        } else if (query.faixa === 'futuro') {
          qb.andWhere(`cr.data_vencimento > (CAST(:hoje AS DATE) + INTERVAL '30 days')`, { hoje });
        }
      }

      // Busca por documento, nosso número, observação ou nome cliente
      if (query.busca) {
        const termo = `%${query.busca}%`;
        qb.leftJoin('cr.cliente', 'cli');
        qb.andWhere(
          '(cr.numero_documento ILIKE :termo OR cr.nosso_numero ILIKE :termo OR cli.razao_social ILIKE :termo OR cli.numero_inscricao ILIKE :termo)',
          { termo },
        );
      }

      const ordem = query.ordenacao ?? 'vencimento_desc';
      const sort: Record<typeof ordem, [string, 'ASC' | 'DESC']> = {
        vencimento_asc: ['cr.data_vencimento', 'ASC'],
        vencimento_desc: ['cr.data_vencimento', 'DESC'],
        valor_asc: ['cr.valor_bruto_cents', 'ASC'],
        valor_desc: ['cr.valor_bruto_cents', 'DESC'],
      };
      const [col, dir] = sort[ordem];
      qb.orderBy(col, dir).addOrderBy('cr.id', 'ASC');

      // Estratégia "IDs first, entities second" pra evitar problema com leftJoinAndSelect+limit
      const total = await qb.getCount();
      const ids = await qb.select('cr.id', 'id').limit(porPagina).offset(offset).getRawMany<{ id: string }>();

      const entidades = ids.length === 0
        ? []
        : await crRepo.find({
            where: { id: In(ids.map((r) => r.id)) },
            relations: { cliente: true },
            order: { dataVencimento: dir === 'ASC' ? 'ASC' : 'DESC', id: 'ASC' },
          });

      return {
        itens: entidades.map(toResponse),
        total,
        pagina,
        porPagina,
        totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
      };
    },

    async sumario(query: SumarioContasReceberQuery): Promise<SumarioContasReceberResponse> {
      const dtIni = query.dtIni;
      const dtFim = query.dtFim;
      const hoje = new Date().toISOString().slice(0, 10);

      const baseWhere = (alias = 'cr'): { sql: string; params: Record<string, unknown> } => {
        const partes: string[] = [];
        const params: Record<string, unknown> = {};
        if (dtIni) { partes.push(`${alias}.data_vencimento >= :dtIni`); params.dtIni = dtIni; }
        if (dtFim) { partes.push(`${alias}.data_vencimento <= :dtFim`); params.dtFim = dtFim; }
        return { sql: partes.length > 0 ? partes.join(' AND ') : '1=1', params };
      };

      // Totais gerais
      const { sql: whereSql, params: whereParams } = baseWhere();
      const totaisRaw = await crRepo
        .createQueryBuilder('cr')
        .select('COUNT(*)', 'qtd')
        .addSelect(`COUNT(*) FILTER (WHERE cr.status IN ('aberto','renegociado'))`, 'qtd_aberto')
        .addSelect(`COUNT(*) FILTER (WHERE cr.status = 'pago')`, 'qtd_recebido')
        .addSelect(`COUNT(*) FILTER (WHERE cr.status = 'cancelado')`, 'qtd_cancelado')
        .addSelect(`COALESCE(SUM(cr.valor_bruto_cents), 0)`, 'valor_bruto')
        .addSelect(
          `COALESCE(SUM(cr.valor_bruto_cents - cr.desconto_cents + cr.acrescimo_cents - cr.vlr_inss_cents - cr.vlr_irrf_cents - cr.vlr_pis_cents - cr.vlr_cofins_cents - cr.vlr_csll_cents - cr.vlr_iss_cents) FILTER (WHERE cr.status IN ('aberto','renegociado'))), 0)`,
          'valor_aberto',
        )
        .addSelect(
          `COALESCE(SUM(cr.valor_bruto_cents - cr.desconto_cents + cr.acrescimo_cents - cr.vlr_inss_cents - cr.vlr_irrf_cents - cr.vlr_pis_cents - cr.vlr_cofins_cents - cr.vlr_csll_cents - cr.vlr_iss_cents) FILTER (WHERE cr.status = 'pago')), 0)`,
          'valor_recebido',
        )
        .addSelect(
          `COALESCE(SUM(cr.valor_bruto_cents - cr.desconto_cents + cr.acrescimo_cents - cr.vlr_inss_cents - cr.vlr_irrf_cents - cr.vlr_pis_cents - cr.vlr_cofins_cents - cr.vlr_csll_cents - cr.vlr_iss_cents) FILTER (WHERE cr.status IN ('aberto','renegociado') AND cr.data_vencimento < CAST(:hoje AS DATE))), 0)`,
          'valor_atrasado',
        )
        .setParameter('hoje', hoje)
        .where(whereSql, whereParams)
        .getRawOne<{
          qtd: string; qtd_aberto: string; qtd_recebido: string; qtd_cancelado: string;
          valor_bruto: string; valor_aberto: string; valor_recebido: string; valor_atrasado: string;
        }>();

      // Por status
      const statusRaw = await crRepo
        .createQueryBuilder('cr')
        .select('cr.status', 'status')
        .addSelect('COUNT(*)', 'qtd')
        .addSelect(
          `COALESCE(SUM(cr.valor_bruto_cents - cr.desconto_cents + cr.acrescimo_cents - cr.vlr_inss_cents - cr.vlr_irrf_cents - cr.vlr_pis_cents - cr.vlr_cofins_cents - cr.vlr_csll_cents - cr.vlr_iss_cents), 0)`,
          'valor',
        )
        .where(whereSql, whereParams)
        .groupBy('cr.status')
        .getRawMany<{ status: ContaReceberStatus; qtd: string; valor: string }>();

      // Aging (somente abertos)
      const agingRaw = await crRepo
        .createQueryBuilder('cr')
        .select(
          `CASE
             WHEN cr.data_vencimento < CAST(:hoje AS DATE) THEN 'atrasado'
             WHEN cr.data_vencimento = CAST(:hoje AS DATE) THEN 'vence_hoje'
             WHEN cr.data_vencimento <= CAST(:hoje AS DATE) + INTERVAL '7 days' THEN 'vence_7d'
             WHEN cr.data_vencimento <= CAST(:hoje AS DATE) + INTERVAL '30 days' THEN 'vence_30d'
             ELSE 'futuro'
           END`,
          'faixa',
        )
        .addSelect('COUNT(*)', 'qtd')
        .addSelect(
          `COALESCE(SUM(cr.valor_bruto_cents - cr.desconto_cents + cr.acrescimo_cents - cr.vlr_inss_cents - cr.vlr_irrf_cents - cr.vlr_pis_cents - cr.vlr_cofins_cents - cr.vlr_csll_cents - cr.vlr_iss_cents), 0)`,
          'valor',
        )
        .setParameter('hoje', hoje)
        .where(`cr.status IN ('aberto','renegociado')`)
        .groupBy('1')
        .getRawMany<{ faixa: FaixaAging; qtd: string; valor: string }>();

      // Top 5 clientes por valor em aberto
      const topRaw = await crRepo
        .createQueryBuilder('cr')
        .leftJoin('cr.cliente', 'cli')
        .select('cli.id', 'cliente_id')
        .addSelect(`COALESCE(cli.razao_social, 'Sem cliente')`, 'razao_social')
        .addSelect('COUNT(*)', 'qtd')
        .addSelect(
          `COALESCE(SUM(cr.valor_bruto_cents - cr.desconto_cents + cr.acrescimo_cents - cr.vlr_inss_cents - cr.vlr_irrf_cents - cr.vlr_pis_cents - cr.vlr_cofins_cents - cr.vlr_csll_cents - cr.vlr_iss_cents), 0)`,
          'valor',
        )
        .where(`cr.status IN ('aberto','renegociado')`)
        .andWhere(whereSql, whereParams)
        .groupBy('cli.id')
        .addGroupBy('cli.razao_social')
        .orderBy('valor', 'DESC')
        .limit(5)
        .getRawMany<{ cliente_id: string | null; razao_social: string; qtd: string; valor: string }>();

      return {
        totais: {
          qtd: Number(totaisRaw?.qtd ?? 0),
          qtdAberto: Number(totaisRaw?.qtd_aberto ?? 0),
          qtdRecebido: Number(totaisRaw?.qtd_recebido ?? 0),
          qtdCancelado: Number(totaisRaw?.qtd_cancelado ?? 0),
          valorBrutoCents: Number(totaisRaw?.valor_bruto ?? 0),
          valorAbertoCents: Number(totaisRaw?.valor_aberto ?? 0),
          valorRecebidoCents: Number(totaisRaw?.valor_recebido ?? 0),
          valorAtrasadoCents: Number(totaisRaw?.valor_atrasado ?? 0),
        },
        porStatus: statusRaw.map((r) => ({
          status: r.status,
          qtd: Number(r.qtd),
          valorCents: Number(r.valor),
        })),
        aging: agingRaw.map((r) => ({
          faixa: r.faixa,
          qtd: Number(r.qtd),
          valorCents: Number(r.valor),
        })),
        topClientes: topRaw.map((r) => ({
          clienteId: r.cliente_id,
          razaoSocial: r.razao_social,
          qtd: Number(r.qtd),
          valorCents: Number(r.valor),
        })),
      };
    },

    async statusSync(): Promise<SyncInfoCr> {
      const job = await jobRepo.findOne({
        where: { sistema: 'globus', recurso: 'contas_receber' },
        order: { iniciadoEm: 'DESC' },
      });
      const totalLocal = await crRepo.count();
      const totalClientes = await cliRepo.count();
      return {
        ultimoSyncEm: job?.terminadoEm ? job.terminadoEm.toISOString() : null,
        totalLocal,
        totalClientes,
        precisaSincronizar: totalLocal === 0,
      };
    },

    async sincronizar(body: SyncContasReceberBody, usuarioId: string): Promise<SyncContasReceberResponse> {
      const dtIni = body.dtIni ? new Date(`${body.dtIni}T00:00:00Z`) : primeiroDiaMesUtc();
      const dtFim = body.dtFim ? new Date(`${body.dtFim}T00:00:00Z`) : primeiroDiaProximoMesUtc();

      const sync = await adapter.sincronizar({
        empresa: fastify.config.globus.empresaId,
        dtInicio: dtIni,
        dtFimExclusivo: dtFim,
        usuarioId,
      });

      // Roda o ETL (stage -> finance) e usa o resultado REAL dele nos "*Gravados".
      // Antes retornava o count do STAGE (sync.*Gravados): um erro de ETL (lote
      // atômico que cai, ex.: cliente_id nulo) passava como SUCESSO ("18 títulos")
      // com finance.contas_receber vazio -> tela zerada sem explicação.
      const etlRes = sync.status !== 'erro' ? await etl.processar() : null;

      let mensagem = sync.mensagem;
      if (etlRes && (etlRes.titulosComErro > 0 || etlRes.clientesComErro > 0)) {
        const partes: string[] = [];
        if (etlRes.clientesComErro > 0) partes.push(`${etlRes.clientesComErro} cliente(s)`);
        if (etlRes.titulosComErro > 0) partes.push(`${etlRes.titulosComErro} título(s)`);
        mensagem = `Lidos do Globus, mas ${partes.join(' e ')} não gravaram no banco local` +
          (etlRes.erroDetalhe ? `. Motivo: ${etlRes.erroDetalhe}` : ' (ver logs do ETL crc).');
      }

      return {
        jobId: sync.jobId,
        status: sync.status,
        clientesLidos: sync.clientesLidos,
        clientesGravados: etlRes?.clientesProcessados ?? 0,
        titulosLidos: sync.titulosLidos,
        titulosGravados: etlRes?.titulosProcessados ?? 0,
        itensLidos: sync.itensLidos,
        itensGravados: etlRes?.itensProcessados ?? 0,
        duracaoMs: sync.duracaoMs,
        mensagem,
      };
    },
  };
}

export type ContasReceberService = ReturnType<typeof buildContasReceberService>;
