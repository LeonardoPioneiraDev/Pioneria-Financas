import type { FastifyInstance } from 'fastify';
import { In } from 'typeorm';
import type {
  ContaPagarListQuery,
  ContaPagarListResponse,
  ContaPagarResponse,
  OrigemDocumentoCp,
  SumarioContasPagarRequest,
  SumarioContasPagarResponse,
  SyncContasPagarRequest,
  SyncInfo,
  SyncResponse,
} from '@pioneira/shared/schemas/contas-pagar';
import { CONTA_PAGAR_STATUS, ORIGEM_DOCUMENTO_CP } from '@pioneira/shared/schemas/contas-pagar';
import { ContaPagar, type ContaPagarStatus } from '@/entities/conta-pagar.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { buildGlobusCpAdapter } from '@/integrations/globus/globus-cp.adapter.js';
import { buildContasPagarEtl } from '@/etl/contas-pagar.etl.js';
import { buildGlobusCpEventosAdapter } from '@/integrations/globus/globus-cp-eventos.adapter.js';
import { buildCpEventosEtl } from '@/etl/cp-eventos.etl.js';

// EMPRESA_GLOBUS_ID centralizado em config/environment.ts (fastify.config.globus.empresaId).
// Default 4 = Viação Pioneira. Para multi-empresa, basta trocar a env var.

function toResponse(cp: ContaPagar): ContaPagarResponse {
  const inss = Number(cp.vlrInssCents ?? 0);
  const irrf = Number(cp.vlrIrrfCents ?? 0);
  const pis = Number(cp.vlrPisCents ?? 0);
  const cofins = Number(cp.vlrCofinsCents ?? 0);
  const csll = Number(cp.vlrCsllCents ?? 0);
  const iss = Number(cp.vlrIssCents ?? 0);
  const totalRetencoes = inss + irrf + pis + cofins + csll + iss;
  const liquido = Number(cp.valorLiquidoCents);

  return {
    id: cp.id,
    fornecedor: cp.fornecedor
      ? {
          id: cp.fornecedor.id,
          razaoSocial: cp.fornecedor.razaoSocial,
          nomeFantasia: cp.fornecedor.nomeFantasia,
          cnpjCpf: cp.fornecedor.cnpjCpf,
        }
      : null,
    numeroDocumento: cp.numeroDocumento,
    serieDocumento: cp.serieDocumento,
    numeroParcela: cp.numeroParcela,
    tipoDocumento: cp.tipoDocumento,
    competencia: cp.competencia,
    dataEmissao: cp.dataEmissao,
    dataEntrada: cp.dataEntrada,
    dataVencimento: cp.dataVencimento,
    dataPagamento: cp.dataPagamento,
    valorBrutoCents: Number(cp.valorBrutoCents),
    descontoCents: Number(cp.descontoCents),
    jurosCents: Number(cp.jurosCents),
    multaCents: Number(cp.multaCents),
    valorLiquidoCents: liquido,
    retencoes: {
      inssCents: inss,
      irrfCents: irrf,
      pisCents: pis,
      cofinsCents: cofins,
      csllCents: csll,
      issCents: iss,
      totalCents: totalRetencoes,
    },
    valorAPagarCents: liquido - totalRetencoes,
    status: cp.status as ContaPagarStatus,
    quitado: cp.quitado,
    pagamentoLiberado: cp.pagamentoLiberado,
    modalidadePagamento: cp.modalidadePagamento,
    tipoPagto: cp.tipoPagto,
    favorecido: {
      nome: cp.favorecidoNome,
      inscricao: cp.favorecidoInscricao,
      tipoInscricao: cp.favorecidoTipoInscricao,
    },
    pagamento: {
      bancoCodigo: cp.bancoPagadorCodigo,
      bancoNome: cp.bancoPagadorNome,
      agencia: cp.bancoPagadorAgencia,
      conta: cp.bancoPagadorConta,
      documento: cp.pagamentoDoc,
    },
    observacao: cp.observacao,
    codSetor: cp.codSetor,
    setorNome: cp.setorNome,
    setorRateado: cp.setorRateado,
    origemDocumento: (cp.origemDocumento ?? 'desconhecido') as OrigemDocumentoCp,
    dataIntegrouFlp: cp.dataIntegrouFlp,
    competenciaFlp: cp.competenciaFlp,
    origemSistema: cp.origemSistema,
    origemIdExterno: cp.origemIdExterno,
    ultimoSyncEm: cp.ultimoSyncEm ? cp.ultimoSyncEm.toISOString() : null,
    auditoria: {
      usuarioInclusao: cp.usuarioInclusao,
      dataInclusao: cp.dataInclusao ? cp.dataInclusao.toISOString() : null,
      usuarioLiberacaoPagto: cp.usuarioLibPagto,
      dataLiberacaoPagto: cp.dataLiberacaoPagto ? cp.dataLiberacaoPagto.toISOString() : null,
      usuarioAssinatura: cp.usuarioAssinatura,
    },
  };
}

function origensValidas(input: string | undefined): OrigemDocumentoCp[] {
  if (!input) return [];
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is OrigemDocumentoCp => ORIGEM_DOCUMENTO_CP.includes(s as OrigemDocumentoCp));
}

function primeiroDiaDoMesUtc(): Date {
  const hoje = new Date();
  return new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
}

function primeiroDiaProximoMesUtc(): Date {
  const hoje = new Date();
  return new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 1));
}

function statusValidos(input: string | undefined): ContaPagarStatus[] {
  if (!input) return [];
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is ContaPagarStatus => CONTA_PAGAR_STATUS.includes(s as ContaPagarStatus));
}

/**
 * Quando ini === fim, retorna fim+1 dia (mantem o range semi-aberto interno
 * `[ini, fim)` valido sobre exatamente esse 1 dia). Caso contrario, devolve
 * os valores inalterados. Garante que "19/05 a 19/05" no formulario nao vire
 * range vazio. Datas vem em ISO `YYYY-MM-DD`.
 */
function expandirSeMesmaData(ini?: string, fim?: string): { ini?: string; fim?: string } {
  if (ini && fim && ini === fim) {
    const d = new Date(`${fim}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    return { ini, fim: d.toISOString().slice(0, 10) };
  }
  return { ini, fim };
}

/**
 * Parseia CSV de codigos de setor (CODCUSTOFIN, ex: "10003,20003"). Filtra vazios.
 */
function setoresValidos(input: string | undefined): string[] {
  if (!input) return [];
  return input
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 10);
}

const ORDEM_COLUNAS: Record<string, string> = {
  dataVencimento: 'cp.data_vencimento',
  valor: 'cp.valor_liquido_cents',
  fornecedor: 'forn.razao_social',
  dataEmissao: 'cp.data_emissao',
  status: 'cp.status',
};

type FiltrosBase = Pick<ContaPagarListQuery, 'dtIni' | 'dtFim' | 'dtPagIni' | 'dtPagFim' | 'search' | 'status' | 'valorMinCents' | 'valorMaxCents' | 'somenteVencidos' | 'origem' | 'setores'>;

export function buildContasPagarService(fastify: FastifyInstance) {
  const cpRepo = fastify.db.getRepository(ContaPagar);
  const jobRepo = fastify.db.getRepository(SyncJob);
  const adapter = buildGlobusCpAdapter(fastify);
  const etl = buildContasPagarEtl(fastify);
  const eventosAdapter = buildGlobusCpEventosAdapter(fastify);
  const eventosEtl = buildCpEventosEtl(fastify);

  function aplicarFiltros<T extends import('typeorm').SelectQueryBuilder<ContaPagar>>(qb: T, query: FiltrosBase): T {
    const filtraPagamento = !!(query.dtPagIni || query.dtPagFim);

    // UX: quando o user digita a MESMA data no inicio e fim ("19/05 a 19/05"),
    // ele quer dizer "esse dia inteiro" — nao um range vazio. Expandimos
    // automaticamente o fim em +1 dia (mantendo a semantica semi-aberta interna
    // [ini, fim)). Para ranges normais (ex: "01/05 a 01/06") nao mexe.
    const { ini: dtIni, fim: dtFim } = expandirSeMesmaData(query.dtIni, query.dtFim);
    const { ini: dtPagIni, fim: dtPagFim } = expandirSeMesmaData(query.dtPagIni, query.dtPagFim);

    // Filtro por VENCIMENTO — desabilitado quando ha filtro de PAGAMENTO ativo.
    // Quando o user filtra por "pagamento entre X e Y", a busca deve trazer
    // todos os titulos pagos no periodo, INDEPENDENTE de quando venceram (uma
    // conta vencida em 04/2026 mas paga em 19/05/2026 deve aparecer no filtro
    // "pagamento 19/05-20/05"). Sem isso, vencimento e pagamento se sobrepoem
    // e excluem casos validos.
    if (!filtraPagamento) {
      if (dtIni) qb.andWhere('cp.data_vencimento >= :dtIni', { dtIni });
      if (dtFim) qb.andWhere('cp.data_vencimento < :dtFim', { dtFim });
    }

    // Data de pagamento (semi-aberto). Titulos nao pagos tem data_pagamento NULL
    // e ficam de fora automaticamente — comportamento desejado.
    if (dtPagIni) qb.andWhere('cp.data_pagamento >= :dtPagIni', { dtPagIni });
    if (dtPagFim) qb.andWhere('cp.data_pagamento < :dtPagFim', { dtPagFim });

    if (query.search) {
      qb.andWhere(
        '(cp.numero_documento ILIKE :s OR forn.razao_social ILIKE :s OR forn.nome_fantasia ILIKE :s OR forn.cnpj_cpf ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }

    const statuses = statusValidos(query.status);
    if (statuses.length > 0) {
      qb.andWhere('cp.status IN (:...statuses)', { statuses });
    }

    const origens = origensValidas(query.origem);
    if (origens.length > 0) {
      qb.andWhere('cp.origem_documento IN (:...origens)', { origens });
    }

    const setores = setoresValidos(query.setores);
    if (setores.length > 0) {
      qb.andWhere('cp.cod_setor IN (:...setores)', { setores });
    }

    if (query.valorMinCents !== undefined) qb.andWhere('cp.valor_liquido_cents >= :vmin', { vmin: query.valorMinCents });
    if (query.valorMaxCents !== undefined) qb.andWhere('cp.valor_liquido_cents <= :vmax', { vmax: query.valorMaxCents });

    if (query.somenteVencidos) {
      qb.andWhere('cp.data_vencimento < CURRENT_DATE AND cp.quitado = false AND cp.status NOT IN (:...exclStatus)', {
        exclStatus: ['cancelado', 'pago'],
      });
    }
    return qb;
  }

  async function obterSyncInfo(): Promise<SyncInfo> {
    const ultimoJob = await jobRepo.findOne({
      where: { sistema: 'globus', recurso: 'contas_pagar' },
      order: { iniciadoEm: 'DESC' },
    });
    const totalLocal = await cpRepo.count();
    return {
      ultimoSyncEm: ultimoJob?.terminadoEm ? ultimoJob.terminadoEm.toISOString() : null,
      ultimoSyncStatus: ultimoJob?.status ?? null,
      ultimoSyncMensagem: ultimoJob?.erroMensagem ?? null,
      totalLocal,
      precisaSincronizar: totalLocal === 0,
    };
  }

  return {
    async listar(query: ContaPagarListQuery): Promise<ContaPagarListResponse> {
      const page = query.page ?? 1;
      const limit = query.limit ?? 50;

      const [campo, direcaoStr] = (query.ordenarPor ?? 'dataVencimento:desc').split(':');
      const coluna = ORDEM_COLUNAS[campo ?? 'dataVencimento'] ?? 'cp.data_vencimento';
      const direcao: 'ASC' | 'DESC' = direcaoStr?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

      try {
        // (1) Totais do conjunto FILTRADO (count + somas) — aplica os MESMOS filtros
        // da lista, incluindo data de pagamento. Agregado sobre todas as paginas.
        // Responde "quanto foi pago no periodo filtrado" (independente do vencimento).
        const RET_SQL = '(cp.vlr_inss_cents + cp.vlr_irrf_cents + cp.vlr_pis_cents + cp.vlr_cofins_cents + cp.vlr_csll_cents + cp.vlr_iss_cents)';
        const APAGAR_SQL = `(cp.valor_liquido_cents - ${RET_SQL})`;
        const PAGO_SQL = `(cp.status = 'pago' OR cp.quitado = true OR cp.data_pagamento IS NOT NULL)`;

        const totaisQb = cpRepo.createQueryBuilder('cp').leftJoin('cp.fornecedor', 'forn');
        aplicarFiltros(totaisQb, query);
        const totaisRow = await totaisQb
          .select('COUNT(*)', 'qtd')
          .addSelect('COALESCE(SUM(cp.valor_liquido_cents), 0)', 'liquido')
          .addSelect(`COALESCE(SUM(${APAGAR_SQL}), 0)`, 'apagar')
          .addSelect(`COALESCE(SUM(CASE WHEN ${PAGO_SQL} THEN ${APAGAR_SQL} ELSE 0 END), 0)`, 'pago')
          .addSelect(`COALESCE(SUM(CASE WHEN ${PAGO_SQL} THEN 1 ELSE 0 END), 0)`, 'pagoqtd')
          .getRawOne<{ qtd: string; liquido: string; apagar: string; pago: string; pagoqtd: string }>();

        const total = Number(totaisRow?.qtd ?? 0);
        const totais = {
          quantidade: total,
          valorLiquidoCents: Number(totaisRow?.liquido ?? 0),
          valorAPagarCents: Number(totaisRow?.apagar ?? 0),
          pagoCents: Number(totaisRow?.pago ?? 0),
          pagoQuantidade: Number(totaisRow?.pagoqtd ?? 0),
        };

        if (total === 0) {
          const syncInfo = await obterSyncInfo();
          fastify.log.info({ filtros: query }, '[contas-pagar] listar - total=0 (nenhum registro)');
          return {
            data: [],
            pagination: { page, limit, total: 0, totalPages: 1 },
            totais,
            syncInfo,
          };
        }

        // (2) PRIMEIRO passo: pega so os IDs paginados (sem join expandido).
        // Isso evita o bug do TypeORM com leftJoinAndSelect + skip/take + orderBy
        // que pode gerar SQL invalido com ORDER BY de coluna joinada.
        const idsQb = cpRepo
          .createQueryBuilder('cp')
          .select('cp.id', 'id')
          .leftJoin('cp.fornecedor', 'forn');
        aplicarFiltros(idsQb, query);
        idsQb.orderBy(coluna, direcao).addOrderBy('cp.id', 'ASC').limit(limit).offset((page - 1) * limit);

        const [sqlIds, paramsIds] = idsQb.getQueryAndParameters();
        fastify.log.info({ sqlIds, paramsIds }, `[contas-pagar] listar - querying IDs (page ${page}, limit ${limit})`);

        const idsRaw = await idsQb.getRawMany<{ id: string }>();
        const ids = idsRaw.map((r) => r.id);

        if (ids.length === 0) {
          const syncInfo = await obterSyncInfo();
          return {
            data: [],
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
            totais,
            syncInfo,
          };
        }

        // (3) SEGUNDO passo: carrega as entities completas usando os IDs.
        const rows = await cpRepo.find({
          where: { id: In(ids) },
          relations: ['fornecedor'],
          // mantem a mesma ordem dos IDs paginados via mapa
        });
        const ordenado = ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is ContaPagar => !!r);

        fastify.log.info(
          { quantidadeRetornada: ordenado.length, total, primeirosIds: ordenado.slice(0, 3).map((r) => r.id) },
          `[contas-pagar] listar - retornando ${ordenado.length}/${total} linhas (pagina ${page})`,
        );

        const syncInfo = await obterSyncInfo();

        return {
          data: ordenado.map(toResponse),
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
          totais,
          syncInfo,
        };
      } catch (err) {
        fastify.log.error(
          { err, errMessage: (err as Error).message, errStack: (err as Error).stack, filtros: query },
          '[contas-pagar] listar - ERRO inesperado',
        );
        throw err;
      }
    },

    async sumario(payload: SumarioContasPagarRequest): Promise<SumarioContasPagarResponse> {
      const baseQb = cpRepo.createQueryBuilder('cp').leftJoin('cp.fornecedor', 'forn');
      aplicarFiltros(baseQb, payload);

      const RETENCOES_SQL = '(cp.vlr_inss_cents + cp.vlr_irrf_cents + cp.vlr_pis_cents + cp.vlr_cofins_cents + cp.vlr_csll_cents + cp.vlr_iss_cents)';
      const APAGAR_SQL = `(cp.valor_liquido_cents - ${RETENCOES_SQL})`;

      const totaisRow = await baseQb
        .clone()
        .select('COUNT(*)', 'qtd')
        .addSelect('COALESCE(SUM(cp.valor_bruto_cents), 0)', 'bruto')
        .addSelect('COALESCE(SUM(cp.valor_liquido_cents), 0)', 'liquido')
        .addSelect(`COALESCE(SUM(${APAGAR_SQL}), 0)`, 'apagar')
        .getRawOne<{ qtd: string; bruto: string; liquido: string; apagar: string }>();

      const porStatusRaw = await baseQb
        .clone()
        .select('cp.status', 'status')
        .addSelect('COUNT(*)', 'qtd')
        .addSelect('COALESCE(SUM(cp.valor_bruto_cents), 0)', 'bruto')
        .addSelect('COALESCE(SUM(cp.valor_liquido_cents), 0)', 'liquido')
        .groupBy('cp.status')
        .getRawMany<{ status: string; qtd: string; bruto: string; liquido: string }>();

      // ============ CARDS DE AGING (mutuamente exclusivos) ============
      // Definição:
      //   pago        = status='pago' OU quitado=true OU data_pagamento IS NOT NULL
      //   vencido     = NÃO pago AND data_vencimento < hoje
      //   vence_7d    = NÃO pago AND data_vencimento ∈ [hoje, hoje+7d]   (INCLUSIVO!)
      //   vence_mais  = NÃO pago AND data_vencimento > hoje+7d
      // Soma dos 4 = total do período. Cards somam exato.

      const PAGO_COND = `(cp.status = 'pago' OR cp.quitado = true OR cp.data_pagamento IS NOT NULL)`;
      const NAO_PAGO_COND = `NOT ${PAGO_COND} AND cp.status <> 'cancelado'`;

      const vencidosRow = await baseQb
        .clone()
        .andWhere(`${NAO_PAGO_COND} AND cp.data_vencimento < CURRENT_DATE`)
        .select('COUNT(*)', 'qtd')
        .addSelect(`COALESCE(SUM(${APAGAR_SQL}), 0)`, 'apagar')
        .getRawOne<{ qtd: string; apagar: string }>();

      const proximos7Row = await baseQb
        .clone()
        .andWhere(
          `${NAO_PAGO_COND}
           AND cp.data_vencimento >= CURRENT_DATE
           AND cp.data_vencimento <= CURRENT_DATE + INTERVAL '7 days'`,
        )
        .select('COUNT(*)', 'qtd')
        .addSelect(`COALESCE(SUM(${APAGAR_SQL}), 0)`, 'apagar')
        .getRawOne<{ qtd: string; apagar: string }>();

      const vencerMaisDe7Row = await baseQb
        .clone()
        .andWhere(
          `${NAO_PAGO_COND}
           AND cp.data_vencimento > CURRENT_DATE + INTERVAL '7 days'`,
        )
        .select('COUNT(*)', 'qtd')
        .addSelect(`COALESCE(SUM(${APAGAR_SQL}), 0)`, 'apagar')
        .getRawOne<{ qtd: string; apagar: string }>();

      const pagoRow = await baseQb
        .clone()
        .andWhere(PAGO_COND)
        .select('COUNT(*)', 'qtd')
        .addSelect(`COALESCE(SUM(${APAGAR_SQL}), 0)`, 'apagar')
        .getRawOne<{ qtd: string; apagar: string }>();

      // Cancelados em aberto — NAO entram nos 4 cards de aging (NAO_PAGO_COND
      // exclui 'cancelado'), mas contam no total. Sem este 5o bucket a soma
      // dos cards nao fecha com o total. Particao completa e mutuamente
      // exclusiva: pago + (vencido|prox7|mais7, todos != cancelado) + cancelado.
      const canceladosRow = await baseQb
        .clone()
        .andWhere(`NOT ${PAGO_COND} AND cp.status = 'cancelado'`)
        .select('COUNT(*)', 'qtd')
        .addSelect(`COALESCE(SUM(${APAGAR_SQL}), 0)`, 'apagar')
        .getRawOne<{ qtd: string; apagar: string }>();

      const topFornecedoresRaw = await baseQb
        .clone()
        .select('forn.id', 'fornecedor_id')
        .addSelect("COALESCE(forn.razao_social, 'Sem fornecedor')", 'razao_social')
        .addSelect('COUNT(*)', 'qtd')
        .addSelect(`COALESCE(SUM(${APAGAR_SQL}), 0)`, 'apagar')
        .groupBy('forn.id')
        .addGroupBy('forn.razao_social')
        .orderBy('apagar', 'DESC')
        .limit(5)
        .getRawMany<{ fornecedor_id: string | null; razao_social: string; qtd: string; apagar: string }>();

      return {
        periodo: { dtIni: payload.dtIni ?? null, dtFim: payload.dtFim ?? null },
        total: {
          quantidade: Number(totaisRow?.qtd ?? 0),
          valorBrutoCents: Number(totaisRow?.bruto ?? 0),
          valorLiquidoCents: Number(totaisRow?.liquido ?? 0),
          valorAPagarCents: Number(totaisRow?.apagar ?? 0),
        },
        porStatus: porStatusRaw.map((r) => ({
          status: r.status as ContaPagarStatus,
          quantidade: Number(r.qtd),
          valorBrutoCents: Number(r.bruto),
          valorLiquidoCents: Number(r.liquido),
        })),
        vencidos: {
          quantidade: Number(vencidosRow?.qtd ?? 0),
          valorAPagarCents: Number(vencidosRow?.apagar ?? 0),
        },
        proximos7Dias: {
          quantidade: Number(proximos7Row?.qtd ?? 0),
          valorAPagarCents: Number(proximos7Row?.apagar ?? 0),
        },
        vencerMaisDe7: {
          quantidade: Number(vencerMaisDe7Row?.qtd ?? 0),
          valorAPagarCents: Number(vencerMaisDe7Row?.apagar ?? 0),
        },
        pago: {
          quantidade: Number(pagoRow?.qtd ?? 0),
          valorAPagarCents: Number(pagoRow?.apagar ?? 0),
        },
        cancelados: {
          quantidade: Number(canceladosRow?.qtd ?? 0),
          valorAPagarCents: Number(canceladosRow?.apagar ?? 0),
        },
        topFornecedores: topFornecedoresRaw.map((r) => ({
          fornecedorId: r.fornecedor_id,
          razaoSocial: r.razao_social,
          quantidade: Number(r.qtd),
          valorAPagarCents: Number(r.apagar),
        })),
      };
    },

    async sincronizar(payload: SyncContasPagarRequest, usuarioId: string): Promise<SyncResponse> {
      const dtInicio = payload.dtIni ? new Date(`${payload.dtIni}T00:00:00Z`) : primeiroDiaDoMesUtc();
      const dtFimExclusivo = payload.dtFim ? new Date(`${payload.dtFim}T00:00:00Z`) : primeiroDiaProximoMesUtc();
      const empresa = payload.empresa ?? fastify.config.globus.empresaId;

      fastify.log.info(
        { empresa, dtInicio: dtInicio.toISOString().slice(0, 10), dtFimExclusivo: dtFimExclusivo.toISOString().slice(0, 10), usuarioId },
        '[contas-pagar] sync solicitada',
      );

      const syncResult = await adapter.sincronizar({ empresa, dtInicio, dtFimExclusivo, usuarioId });

      if (syncResult.status !== 'erro') {
        await etl.processarPendentes(syncResult.jobId);
        // Trilha de eventos (quem incluiu/liberou/PAGOU + hora real). Roda DEPOIS
        // do ETL do CP pra que os titulos ja existam e os eventos liguem em
        // conta_pagar_id. Best-effort: falha aqui nao derruba o sync do titulo.
        try {
          const ev = await eventosAdapter.sincronizar({ empresa, dtInicio, dtFimExclusivo, usuarioId });
          if (ev.status !== 'erro') await eventosEtl.processarPendentes(ev.jobId);
        } catch (err) {
          fastify.log.warn({ err }, '[contas-pagar] sync de eventos (CPGDOCTO_HISTORICO_NEGOCIACOES) falhou - nao critico p/ o CP');
        }
      } else {
        fastify.log.warn({ jobId: syncResult.jobId, mensagem: syncResult.mensagem }, '[contas-pagar] adapter falhou - ETL nao rodara');
      }

      return {
        jobId: syncResult.jobId,
        status: syncResult.status,
        registrosLidos: syncResult.registrosLidos,
        registrosGravados: syncResult.registrosGravados,
        registrosComErro: syncResult.registrosComErro,
        duracaoMs: syncResult.duracaoMs,
        mensagem: syncResult.mensagem,
      };
    },

    async statusSync(): Promise<SyncInfo> {
      return obterSyncInfo();
    },

    /**
     * Lista setores distintos presentes em finance.contas_pagar — usado pra
     * popular o filtro. `codigo` = CODCUSTOFIN (centro de custo financeiro do
     * Globus), `nome` = CPGCUSTOS.DESCRICAO. Ignora linhas com cod_setor NULL.
     */
    async listarSetores(): Promise<Array<{ codigo: string; nome: string | null; totalCps: number }>> {
      const rows = await cpRepo
        .createQueryBuilder('cp')
        .select('cp.cod_setor', 'codigo')
        .addSelect('MAX(cp.setor_nome)', 'nome')
        .addSelect('COUNT(*)::int', 'totalCps')
        .where('cp.cod_setor IS NOT NULL')
        .andWhere('cp.excluido_em IS NULL')
        .groupBy('cp.cod_setor')
        .orderBy('MAX(cp.setor_nome)', 'ASC', 'NULLS LAST')
        .getRawMany<{ codigo: string; nome: string | null; totalCps: number }>();
      return rows.map((r) => ({ codigo: r.codigo, nome: r.nome, totalCps: Number(r.totalCps) }));
    },
  };
}

export type ContasPagarService = ReturnType<typeof buildContasPagarService>;
