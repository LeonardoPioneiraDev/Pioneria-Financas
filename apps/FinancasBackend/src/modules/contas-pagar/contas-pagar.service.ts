import type { FastifyInstance } from 'fastify';
import { In, IsNull } from 'typeorm';
import ExcelJS from 'exceljs';
import { MODALIDADE_PAGAMENTO_LABEL, TIPO_DOCUMENTO_LABEL } from '@pioneira/shared/enums/globus-codigos';
import { ORIGEM_DOCUMENTO_CP_LABELS } from '@pioneira/shared/enums/conta-pagar-status';
import type {
  AnalisePrazoRequest,
  AnalisePrazoResponse,
  ContaPagarListQuery,
  ContaPagarListResponse,
  ContaPagarResponse,
  DevolucaoComprovanteResponse,
  MovimentoBancoItem,
  MovimentoBancoQuery,
  MovimentoBancoResponse,
  OrigemDocumentoCp,
  PagamentoGrupoResponse,
  RemessaGrupoResponse,
  SubstituicaoCadeiaResponse,
  SumarioContasPagarRequest,
  SumarioContasPagarResponse,
  SyncContasPagarRequest,
  SyncInfo,
  SyncResponse,
} from '@pioneira/shared/schemas/contas-pagar';
import { CONTA_PAGAR_STATUS, ORIGEM_DOCUMENTO_CP } from '@pioneira/shared/schemas/contas-pagar';
import { ContaPagar, type ContaPagarStatus } from '@/entities/conta-pagar.entity.js';
import { BancoMovto } from '@/entities/banco-movto.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { buildGlobusCpAdapter } from '@/integrations/globus/globus-cp.adapter.js';
import { buildContasPagarEtl } from '@/etl/contas-pagar.etl.js';
import { buildGlobusCpEventosAdapter } from '@/integrations/globus/globus-cp-eventos.adapter.js';
import { buildCpEventosEtl } from '@/etl/cp-eventos.etl.js';
import type { CpEvento, CpEventosResponse } from '@pioneira/shared/schemas/cp-eventos';
import type { CpConferenciaLinha, CpConferenciaQuery, CpConferenciaResponse } from '@pioneira/shared/schemas/cp-conferencia';
import { CpEvento as CpEventoEntity } from '@/entities/cp-evento.entity.js';
import { ENTRA_NA_SOMA_SQL, NAO_SUBSTITUIDO_SQL, SUCESSOR_SINCRONIZADO_SQL } from '@/shared/contas-pagar/regras-soma.js';
import { expandirSeMesmaData } from '@/shared/utils/date-range.js';
import { GLOBUS_QUERIES } from '@/integrations/globus/globus.queries.js';
import { buildGlobusBcomovtoAdapter } from '@/integrations/globus/globus-bcomovto.adapter.js';
import { buildBancoMovtoEtl } from '@/etl/banco-movto.etl.js';

// EMPRESA_GLOBUS_ID centralizado em config/environment.ts (fastify.config.globus.empresaId).
// Default 4 = Viação Pioneira. Para multi-empresa, basta trocar a env var.

function toResponse(
  cp: ContaPagar,
  substituidoPorDoc: string | null = null,
  pagamentoDevolvido = false,
): ContaPagarResponse {
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
    substituido: cp.substituido,
    vezesPagoGlobus: cp.vezesPagoGlobus ?? 0,
    teveCancelamentoPagamento: cp.teveCancelamentoPagamento ?? false,
    vencimentoAnterior: cp.vencimentoAnterior ?? null,
    vencimentoAlteradoEm: cp.vencimentoAlteradoEm ? cp.vencimentoAlteradoEm.toISOString() : null,
    teveProrrogacao: cp.teveProrrogacao ?? false,
    substituidoPorCod: cp.substituidoPorCod,
    substituidoPorDoc,
    pagamentoDevolvido,
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
      movimentoId: cp.codMovtoBco,
      numeroRemessa: cp.numeroRemessa,
      dataRemessa: cp.dataRemessa ? cp.dataRemessa.toISOString() : null,
      autenticacaoEletronica: cp.autenticacaoEletronica,
      statusPe: cp.statusPe,
    },
    observacao: cp.observacao,
    codSetor: cp.codSetor,
    setorNome: cp.setorNome,
    setorRateado: cp.setorRateado,
    rateioSetores: cp.rateioSetores ?? null,
    rateioContas: cp.rateioContas ?? null,
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
 * Parseia CSV de códigos de setor (CODCUSTOFIN, ex: "10003,20003"). Filtra vazios.
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

/**
 * Tipos de despesa (CPGTPDES) que NÃO são pagamento de obrigação e por isso ficam
 * de FORA da Perna B do "total pago" (débitos diretos no banco). São movimentos
 * FINANCEIROS — moviam dinheiro próprio, não pagaram fornecedor/obrigação:
 *   35308/35301/35306 = APLICAÇÃO FINANCEIRA (Santander/BB/Safra) — investimento
 *   33119             = EMPRÉSTIMO para empresa do grupo (Via. Cidade Brasília)
 *   33130             = transferência/participação ("...EMPREE. E PART.")
 * Sem isso, uma única aplicação financeira (ex.: R$ 30,5 M em 05/2026) inflava o
 * "total pago". Lista INTERINA validada com dados locais (2026-05); o ideal é
 * sincronizar CPGTPDES e filtrar pelo CLASSIFICADOR (jeito robusto). Ver SFN-47.
 * Para reincluir um código (ex.: se 33130 for pagamento real), basta removê-lo daqui.
 */
const DESPESAS_NAO_PAGAMENTO = ['35308', '35301', '35306', '33119', '33130'];

/**
 * Códigos de histórico bancário (BCOHISTO.CODHISTOBCO) de DEVOLUÇÃO de pagamento —
 * o crédito que casa um débito de pagamento que o banco aceitou mas não liquidou.
 * Confirmados no Globus (2026-06): 10 = "DOC DEVOLVIDO", 541 = "CHEQUE DEVOLVIDO".
 * São CRÉDITOS (debito_credito='C'), então quando entram numa soma de saídas
 * (BCO_VALOR_SQL) eles SUBTRAEM — netando a tentativa que voltou. Follow-up SFN-48.
 */
const HISTORICOS_DEVOLUCAO_BCO = [10, 541];
const HISTORICOS_DEVOLUCAO_BCO_SQL = HISTORICOS_DEVOLUCAO_BCO.join(', ');

// Valor a pagar (líquido - retenções) com alias `cp` — usado no detector de devolução.
const RET_SQL_CP =
  '(cp.vlr_inss_cents + cp.vlr_irrf_cents + cp.vlr_pis_cents + cp.vlr_cofins_cents + cp.vlr_csll_cents + cp.vlr_iss_cents)';
const APAGAR_SQL_CP = `(cp.valor_liquido_cents - ${RET_SQL_CP})`;

/**
 * Detecta PAGAMENTO DEVOLVIDO (tentativa que o banco aceitou mas não liquidou,
 * devolveu e foi refeita). Sinal, todo determinístico:
 *   - QUITADO real do Globus = false (não compensou) E
 *   - não é substituição (SFN-48, caso já tratado) E
 *   - tem data de pagamento (o Globus registrou a baixa) E
 *   - EXISTE no extrato um crédito de devolução (DOC/CHEQUE DEVOLVIDO) na MESMA
 *     conta, MESMO valor (= valor a pagar) e janela de até 10 dias do pagamento.
 * O crédito de devolução é o que separa um bounce REAL de um título apenas "baixado
 * operacionalmente mas ainda não compensado" (que também tem QUITADO='N' — comum).
 */
const DEVOLVIDO_SQL_CP = `(
  cp.quitado_globus = false
  AND cp.substituido = false
  AND cp.data_pagamento IS NOT NULL
  AND cp.banco_pagador_codigo IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM finance.banco_movto mc
    WHERE mc.empresa_id = cp.empresa_id
      AND mc.excluido_em IS NULL
      AND mc.debito_credito = 'C'
      AND mc.cod_histo_bco IN (${HISTORICOS_DEVOLUCAO_BCO_SQL})
      AND mc.cod_banco = cp.banco_pagador_codigo
      AND (cp.banco_pagador_conta IS NULL OR mc.cod_conta_bco = cp.banco_pagador_conta)
      AND mc.valor_cents = ${APAGAR_SQL_CP}
      AND mc.data_movto BETWEEN cp.data_pagamento - INTERVAL '1 day' AND cp.data_pagamento + INTERVAL '10 days'
  )
)`;

type FiltrosBase = Pick<ContaPagarListQuery, 'dtIni' | 'dtFim' | 'dtPagIni' | 'dtPagFim' | 'search' | 'status' | 'valorMinCents' | 'valorMaxCents' | 'somenteVencidos' | 'origem' | 'setores' | 'substituido' | 'remessa' | 'prazoFaixa' | 'prazoLongoVencido'>;

export function buildContasPagarService(fastify: FastifyInstance) {
  const cpRepo = fastify.db.getRepository(ContaPagar);
  const bcoMovtoRepo = fastify.db.getRepository(BancoMovto);
  const jobRepo = fastify.db.getRepository(SyncJob);
  const adapter = buildGlobusCpAdapter(fastify);
  const etl = buildContasPagarEtl(fastify);
  const eventosAdapter = buildGlobusCpEventosAdapter(fastify);
  const eventosEtl = buildCpEventosEtl(fastify);
  const eventoRepo = fastify.db.getRepository(CpEventoEntity);
  const bcomovtoAdapter = buildGlobusBcomovtoAdapter(fastify);
  const bancoMovtoEtl = buildBancoMovtoEtl(fastify);

  function aplicarFiltros<T extends import('typeorm').SelectQueryBuilder<ContaPagar>>(qb: T, query: FiltrosBase): T {
    const filtraPagamento = !!(query.dtPagIni || query.dtPagFim);

    // UX: quando o user digita a MESMA data no início e fim ("19/05 a 19/05"),
    // ele quer dizer "esse dia inteiro" — não um range vazio. Expandimos
    // automaticamente o fim em +1 dia (mantendo a semântica semi-aberta interna
    // [ini, fim)). Para ranges normais (ex: "01/05 a 01/06") não mexe.
    const { ini: dtIni, fim: dtFim } = expandirSeMesmaData(query.dtIni, query.dtFim);
    const { ini: dtPagIni, fim: dtPagFim } = expandirSeMesmaData(query.dtPagIni, query.dtPagFim);

    // Filtro por VENCIMENTO — desabilitado quando há filtro de PAGAMENTO ativo.
    // Quando o user filtra por "pagamento entre X e Y", a busca deve trazer
    // todos os títulos pagos no período, INDEPENDENTE de quando venceram (uma
    // conta vencida em 04/2026 mas paga em 19/05/2026 deve aparecer no filtro
    // "pagamento 19/05-20/05"). Sem isso, vencimento e pagamento se sobrepõem
    // e excluem casos válidos.
    if (!filtraPagamento) {
      if (dtIni) qb.andWhere('cp.data_vencimento >= :dtIni', { dtIni });
      if (dtFim) qb.andWhere('cp.data_vencimento < :dtFim', { dtFim });
    }

    // Data de pagamento (semi-aberto). Títulos não pagos têm data_pagamento NULL
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
      // Pega o título em QUALQUER unidade dele (dominante + rateio), via setores_codigos.
      // Fallback no cod_setor (dominante) pra títulos ainda não re-sincronizados (coluna
      // setores_codigos null). Assim filtrar "Santa Maria" traz a DOBRAS cuja dominante
      // é Itapoá mas que tem um item em Santa Maria.
      qb.andWhere(
        '(cp.setores_codigos && ARRAY[:...setores]::text[] OR (cp.setores_codigos IS NULL AND cp.cod_setor IN (:...setores)))',
        { setores },
      );
    }

    // Filtro por substituição (SFN-48). 'validos' = pagamentos de verdade (não
    // substituídos); 'substituidos' = só as duplicatas (auditoria). 'todos'/undefined
    // não filtra. Aplica só na listagem/export; o sumário sempre exclui substituídos.
    if (query.substituido === 'validos') qb.andWhere('cp.substituido = false');
    else if (query.substituido === 'substituidos') qb.andWhere('cp.substituido = true');

    // Remessa enviada ao banco (NROREMESSAPE). Busca por "contém" (ILIKE) pra aceitar
    // o número sem os zeros à esquerda — ex.: "12" casa "0000000012". Só pagamento
    // eletrônico tem remessa; títulos sem (borderô/cheque) ficam de fora do filtro.
    if (query.remessa?.trim()) {
      qb.andWhere('cp.numero_remessa ILIKE :remessa', { remessa: `%${query.remessa.trim()}%` });
    }

    if (query.valorMinCents !== undefined) qb.andWhere('cp.valor_liquido_cents >= :vmin', { vmin: query.valorMinCents });
    if (query.valorMaxCents !== undefined) qb.andWhere('cp.valor_liquido_cents <= :vmax', { vmax: query.valorMaxCents });

    if (query.somenteVencidos) {
      qb.andWhere('cp.data_vencimento < CURRENT_DATE AND cp.quitado = false AND cp.status NOT IN (:...exclStatus)', {
        exclStatus: ['cancelado', 'pago'],
      });
    }

    // Drill-down do painel de análise de prazo. Faixa de prazo = vencimento − emissão.
    if (query.prazoFaixa) {
      const P = '(cp.data_vencimento - cp.data_emissao)';
      switch (query.prazoFaixa) {
        case 'semData': qb.andWhere('cp.data_emissao IS NULL'); break;
        case 'ate30': qb.andWhere(`cp.data_emissao IS NOT NULL AND ${P} <= 30`); break;
        case 'de31a60': qb.andWhere(`cp.data_emissao IS NOT NULL AND ${P} > 30 AND ${P} <= 60`); break;
        case 'de61a90': qb.andWhere(`cp.data_emissao IS NOT NULL AND ${P} > 60 AND ${P} <= 90`); break;
        case 'mais90': qb.andWhere(`cp.data_emissao IS NOT NULL AND ${P} > 90`); break;
      }
    }
    // Alerta: prazo > 30 dias, já venceu e não foi pago (o card vermelho do painel).
    if (query.prazoLongoVencido) {
      const P = '(cp.data_vencimento - cp.data_emissao)';
      const PAGO = `(cp.status = 'pago' OR cp.quitado = true OR cp.data_pagamento IS NOT NULL)`;
      qb.andWhere(
        `cp.data_emissao IS NOT NULL AND ${P} > 30 AND cp.data_vencimento < CURRENT_DATE AND NOT ${PAGO} AND cp.status <> 'cancelado'`,
      );
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

  // Perna B do "total pago": débitos diretos de despesa no banco (BCOMOVTO),
  // SEM movimentos financeiros (DESPESAS_NAO_PAGAMENTO) e sem o que já é pagamento
  // de um título do CP (anti-dupla-contagem). Usado tanto na `listar` quanto no
  // `sumario` pra os dois baterem no mesmo "total pago". Janela = datas de pagamento.
  async function somaPernaBPago(dtPagIniRaw?: string, dtPagFimRaw?: string): Promise<{ cents: number; qtd: number }> {
    const { ini: dtPagIni, fim: dtPagFim } = expandirSeMesmaData(dtPagIniRaw, dtPagFimRaw);
    const qb = bcoMovtoRepo
      .createQueryBuilder('m')
      .where('m.empresa_id = :empresa', { empresa: fastify.config.globus.empresaId })
      .andWhere('m.excluido_em IS NULL')
      .andWhere('m.cod_tp_despesa IS NOT NULL')
      .andWhere('m.cod_tp_despesa NOT IN (:...despesasFora)', { despesasFora: DESPESAS_NAO_PAGAMENTO })
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM finance.contas_pagar cpx
                     WHERE cpx.cod_movto_bco = m.cod_movto_bco
                       AND cpx.empresa_id = m.empresa_id
                       AND cpx.excluido_em IS NULL)`,
      );
    if (dtPagIni) qb.andWhere('m.data_movto >= :dtPagIni', { dtPagIni });
    if (dtPagFim) qb.andWhere('m.data_movto < :dtPagFim', { dtPagFim });
    const row = await qb
      .select(`COALESCE(SUM(CASE WHEN m.debito_credito = 'C' THEN -m.valor_cents ELSE m.valor_cents END), 0)`, 'valor')
      .addSelect('COUNT(*)', 'qtd')
      .getRawOne<{ valor: string; qtd: string }>();
    return { cents: Number(row?.valor ?? 0), qtd: Number(row?.qtd ?? 0) };
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
        // da lista, incluindo data de pagamento. Agregado sobre todas as páginas.
        // Responde "quanto foi pago no período filtrado" (independente do vencimento).
        //
        // Quando há filtro por PAGAMENTO, o "total pago" reproduz os PAGAMENTOS
        // EFETUADOS, somando DUAS pernas:
        //   A) títulos do CP pagos no período (TODOS, inclusive boletos);
        //   B) débitos diretos no banco (BCOMOVTO classificado por tipo de despesa)
        //      que nunca passaram pela carteira do CP (calculado mais abaixo).
        // Boletos ENTRAM na perna A (são caixa real — validado: 100% tem movimento
        // bancário) e NÃO aparecem na perna B (o movimento bancário do boleto não é
        // classificado por despesa, então não casa com CPGTPDES). Ou seja: cada
        // pagamento é contado uma única vez. Isso difere do relatório PL/SQL antigo,
        // que excluía BOL/BO da perna A e acabava PERDENDO ~R$1,5M/mês de boletos.
        // Sem filtro por pagamento, perna B = 0 (comportamento legado). Ver SFN-47.
        const filtraPagamento = !!(query.dtPagIni || query.dtPagFim);
        const RET_SQL = '(cp.vlr_inss_cents + cp.vlr_irrf_cents + cp.vlr_pis_cents + cp.vlr_cofins_cents + cp.vlr_csll_cents + cp.vlr_iss_cents)';
        const APAGAR_SQL = `(cp.valor_liquido_cents - ${RET_SQL})`;
        // Títulos SUBSTITUÍDOS (CODDOCTOCPGSUBST preenchido) continuam na LISTA com
        // selo, mas saem de TODAS as somas de valor — senão o antigo dobraria o
        // valor do sucessor (~23% dos títulos). Ver SFN-48. O COUNT(*) (qtd) conta
        // todos, pra bater com as linhas paginadas; `substituidosqtd` informa quantos.
        //
        // CANCELADOS (STATUSDOCTOCPG='C') saem das somas pelo MESMO motivo. Caso
        // real de 23/07/2026: o documento 1814 (EP NOVO GAMA, R$ 840) foi cancelado
        // e a obrigação reemitida como 1841 — mesmo fornecedor, emissão, vencimento,
        // valor e observação. O Globus NÃO liga os dois (CODDOCTOCPGSUBST vazio),
        // então `substituido` é false nos dois e o cancelado somava junto: nosso
        // "Valor das contas" dava R$ 692.743,81 contra R$ 691.903,81 do relatório do
        // financeiro — diferença de exatamente os R$ 840 cancelados.
        // Cancelado continua na LISTA com o selo; só não entra em valor.
        const NAO_SUBST_SQL = ENTRA_NA_SOMA_SQL;
        // "Pago de verdade" exclui também os DEVOLVIDOS (banco aceitou mas não liquidou,
        // devolveu e refez) — senão a tentativa devolvida + a refeita contam o mesmo
        // valor 2x. So a refeita (quitado_globus=true) entra. Follow-up SFN-48.
        const PAGO_TITULO_SQL = `(cp.status = 'pago' OR cp.quitado = true OR cp.data_pagamento IS NOT NULL) AND ${NAO_SUBST_SQL} AND NOT ${DEVOLVIDO_SQL_CP}`;

        const totaisQb = cpRepo.createQueryBuilder('cp').leftJoin('cp.fornecedor', 'forn');
        aplicarFiltros(totaisQb, query);
        const totaisRow = await totaisQb
          .select('COUNT(*)', 'qtd')
          // Substituído com sucessor confirmado: fica de fora das somas de verdade.
          .addSelect(`COALESCE(SUM(CASE WHEN cp.substituido AND ${SUCESSOR_SINCRONIZADO_SQL} THEN 1 ELSE 0 END), 0)`, 'substituidosqtd')
          // Substituído SEM sucessor ainda: continua somando por segurança (não some).
          .addSelect(`COALESCE(SUM(CASE WHEN cp.substituido AND NOT ${SUCESSOR_SINCRONIZADO_SQL} THEN 1 ELSE 0 END), 0)`, 'substituidospendentesqtd')
          .addSelect(`COALESCE(SUM(CASE WHEN ${DEVOLVIDO_SQL_CP} THEN 1 ELSE 0 END), 0)`, 'devolvidosqtd')
          // Pagamento cancelado e refeito no Globus. NÃO sai dos totais — o
          // título é um só; o contador serve de aviso ao financeiro.
          .addSelect(`COALESCE(SUM(CASE WHEN cp.vezes_pago_globus > 1 THEN 1 ELSE 0 END), 0)`, 'refeitosqtd')
          // Cancelados: ficam na lista com selo, mas FORA das somas de valor.
          .addSelect(`COALESCE(SUM(CASE WHEN cp.status = 'cancelado' THEN 1 ELSE 0 END), 0)`, 'canceladosqtd')
          .addSelect(`COALESCE(SUM(CASE WHEN cp.status = 'cancelado' THEN cp.valor_liquido_cents ELSE 0 END), 0)`, 'canceladosvalor')
          .addSelect(`COALESCE(SUM(CASE WHEN ${NAO_SUBST_SQL} THEN cp.valor_liquido_cents ELSE 0 END), 0)`, 'liquido')
          .addSelect(`COALESCE(SUM(CASE WHEN ${NAO_SUBST_SQL} THEN ${APAGAR_SQL} ELSE 0 END), 0)`, 'apagar')
          // Perna A — títulos do CP pagos (exceto boletos quando reconcilia por pagamento).
          .addSelect(`COALESCE(SUM(CASE WHEN ${PAGO_TITULO_SQL} THEN ${APAGAR_SQL} ELSE 0 END), 0)`, 'pagotitulos')
          .addSelect(`COALESCE(SUM(CASE WHEN ${PAGO_TITULO_SQL} THEN 1 ELSE 0 END), 0)`, 'pagotitulosqtd')
          // Quebra da perna A: pago COM movimento bancário (caixa real) vs SEM
          // movimento (quitado sem débito — ex.: NF abatida por adiantamento). Não infla.
          .addSelect(`COALESCE(SUM(CASE WHEN ${PAGO_TITULO_SQL} AND cp.cod_movto_bco IS NOT NULL THEN ${APAGAR_SQL} ELSE 0 END), 0)`, 'pagocaixa')
          .addSelect(`COALESCE(SUM(CASE WHEN ${PAGO_TITULO_SQL} AND cp.cod_movto_bco IS NOT NULL THEN 1 ELSE 0 END), 0)`, 'pagocaixaqtd')
          .addSelect(`COALESCE(SUM(CASE WHEN ${PAGO_TITULO_SQL} AND cp.cod_movto_bco IS NULL THEN ${APAGAR_SQL} ELSE 0 END), 0)`, 'pagosem')
          .addSelect(`COALESCE(SUM(CASE WHEN ${PAGO_TITULO_SQL} AND cp.cod_movto_bco IS NULL THEN 1 ELSE 0 END), 0)`, 'pagosemqtd')
          .getRawOne<{ qtd: string; substituidosqtd: string; substituidospendentesqtd: string; devolvidosqtd: string; refeitosqtd: string; canceladosqtd: string; canceladosvalor: string; liquido: string; apagar: string; pagotitulos: string; pagotitulosqtd: string; pagocaixa: string; pagocaixaqtd: string; pagosem: string; pagosemqtd: string }>();

        const total = Number(totaisRow?.qtd ?? 0);

        // (1b) Perna B — pagamentos efetuados DIRETO no banco. Soma BCOMOVTO da
        // mesma janela de pagamento classificado por tipo de despesa, replicando
        // o `VLMOVTOBCO * -1` do relatório: débito (D) soma, crédito (C, estorno)
        // subtrai — `valor_cents` é sempre em módulo, o sinal vem de `debito_credito`.
        // Só roda quando há filtro por pagamento (a janela vem das datas de pagamento).
        // NOT EXISTS contra contas_pagar: defesa anti-dupla-contagem (movimento que
        // já é o pagamento de um título do CP) — hoje 0 casos, mas protege o futuro.
        // Soma assinada do banco (débito 'D'/null = saída positiva; crédito 'C' =
        // estorno, subtrai). valor_cents é sempre em módulo; o sinal vem do D/C.
        const BCO_VALOR_SQL = `CASE WHEN m.debito_credito = 'C' THEN -m.valor_cents ELSE m.valor_cents END`;

        let pagoDiretoBancoCents = 0;
        let pagoDiretoBancoQtd = 0;
        let movimentoDiaCents = 0;
        let movimentoDiaQtd = 0;
        // Quebra do "saiu da conta" que NÃO é pagamento de obrigação — pra a tela
        // mostrar a diferença direto, sem abrir o modal: aplicação/investimento
        // (financeiro) e devoluções (estorno que voltou, negativo).
        let movimentoFinanceiroCents = 0;
        let movimentoDevolucaoCents = 0;
        if (filtraPagamento) {
          const { ini: dtPagIni, fim: dtPagFim } = expandirSeMesmaData(query.dtPagIni, query.dtPagFim);

          // (B) Perna B do "total pago": despesa direta, SEM movimentos financeiros
          // e sem o que já é pagamento de um título do CP. Mesmo helper do `sumario`,
          // pra os cards de cima e o card de baixo baterem no mesmo número.
          const pb = await somaPernaBPago(query.dtPagIni, query.dtPagFim);
          pagoDiretoBancoCents = pb.cents;
          pagoDiretoBancoQtd = pb.qtd;

          // (M) "Total movimento": TUDO que saiu da conta no período (caixa bruto) —
          // saídas = despesa direta (INCLUSIVE aplicação/investimento/transferência,
          // SEM a denylist) OU pagamento de título do CP (movimento ligado a um CP).
          // Entradas (receita/repasse/resgate, sem despesa e sem CP) ficam de fora.
          const mQb = bcoMovtoRepo
            .createQueryBuilder('m')
            .where('m.empresa_id = :empresa', { empresa: fastify.config.globus.empresaId })
            .andWhere('m.excluido_em IS NULL')
            .andWhere(
              `(m.cod_tp_despesa IS NOT NULL
                OR m.cod_histo_bco IN (${HISTORICOS_DEVOLUCAO_BCO_SQL})
                OR EXISTS (SELECT 1 FROM finance.contas_pagar cpx
                           WHERE cpx.cod_movto_bco = m.cod_movto_bco
                             AND cpx.empresa_id = m.empresa_id
                             AND cpx.excluido_em IS NULL))`,
            );
          if (dtPagIni) mQb.andWhere('m.data_movto >= :dtPagIni', { dtPagIni });
          if (dtPagFim) mQb.andWhere('m.data_movto < :dtPagFim', { dtPagFim });
          const mRow = await mQb
            .select(`COALESCE(SUM(${BCO_VALOR_SQL}), 0)`, 'valor')
            .addSelect('COUNT(*)', 'qtd')
            // Aplicação/investimento/transferência entre contas (DESPESAS_NAO_PAGAMENTO):
            // saiu do banco mas NÃO é pagamento de obrigação.
            .addSelect(
              `COALESCE(SUM(CASE WHEN m.cod_tp_despesa IN (:...despFin) THEN ${BCO_VALOR_SQL} ELSE 0 END), 0)`,
              'financeiro',
            )
            // Devoluções (DOC/CHEQUE DEVOLVIDO) — crédito que reverte uma saída (negativo).
            .addSelect(
              `COALESCE(SUM(CASE WHEN m.cod_histo_bco IN (${HISTORICOS_DEVOLUCAO_BCO_SQL}) THEN ${BCO_VALOR_SQL} ELSE 0 END), 0)`,
              'devolucao',
            )
            .setParameter('despFin', DESPESAS_NAO_PAGAMENTO)
            .getRawOne<{ valor: string; qtd: string; financeiro: string; devolucao: string }>();
          movimentoDiaCents = Number(mRow?.valor ?? 0);
          movimentoDiaQtd = Number(mRow?.qtd ?? 0);
          movimentoFinanceiroCents = Number(mRow?.financeiro ?? 0);
          movimentoDevolucaoCents = Number(mRow?.devolucao ?? 0);
        }

        const pagoTitulosCents = Number(totaisRow?.pagotitulos ?? 0);
        const pagoTitulosQtd = Number(totaisRow?.pagotitulosqtd ?? 0);
        const totais = {
          quantidade: total,
          substituidosQuantidade: Number(totaisRow?.substituidosqtd ?? 0),
          substituidosPendentesQuantidade: Number(totaisRow?.substituidospendentesqtd ?? 0),
          devolvidosQuantidade: Number(totaisRow?.devolvidosqtd ?? 0),
          refeitosQuantidade: Number(totaisRow?.refeitosqtd ?? 0),
          canceladosQuantidade: Number(totaisRow?.canceladosqtd ?? 0),
          canceladosCents: Number(totaisRow?.canceladosvalor ?? 0),
          valorLiquidoCents: Number(totaisRow?.liquido ?? 0),
          valorAPagarCents: Number(totaisRow?.apagar ?? 0),
          // Total pago = perna A (títulos) + perna B (direto no banco).
          pagoCents: pagoTitulosCents + pagoDiretoBancoCents,
          pagoQuantidade: pagoTitulosQtd + pagoDiretoBancoQtd,
          pagoTitulosCents,
          pagoTitulosQuantidade: pagoTitulosQtd,
          pagoDiretoBancoCents,
          pagoDiretoBancoQuantidade: pagoDiretoBancoQtd,
          movimentoDiaCents,
          movimentoDiaQuantidade: movimentoDiaQtd,
          movimentoFinanceiroCents,
          movimentoDevolucaoCents,
          pagoComMovimentoCents: Number(totaisRow?.pagocaixa ?? 0),
          pagoComMovimentoQuantidade: Number(totaisRow?.pagocaixaqtd ?? 0),
          pagoSemMovimentoCents: Number(totaisRow?.pagosem ?? 0),
          pagoSemMovimentoQuantidade: Number(totaisRow?.pagosemqtd ?? 0),
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

        // (2) PRIMEIRO passo: pega só os IDs paginados (sem join expandido).
        // Isso evita o bug do TypeORM com leftJoinAndSelect + skip/take + orderBy
        // que pode gerar SQL inválido com ORDER BY de coluna joinada.
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
          // mantém a mesma ordem dos IDs paginados via mapa
        });
        const ordenado = ids.map((id) => rows.find((r) => r.id === id)).filter((r): r is ContaPagar => !!r);

        // Resolve o NÚMERO REAL do documento que substituiu (o usuário não conhece o
        // CODDOCTOCPG interno do Globus). substituido_por_cod = origem_id_externo do
        // sucessor. Busca em lote só os sucessores dos substituídos desta página.
        const codsSucessores = Array.from(
          new Set(ordenado.filter((r) => r.substituido && r.substituidoPorCod).map((r) => r.substituidoPorCod as string)),
        );
        const mapaSubDoc = new Map<string, string>();
        if (codsSucessores.length > 0) {
          const sucessores = await cpRepo.find({
            where: { origemSistema: 'globus', origemIdExterno: In(codsSucessores) },
          });
          for (const s of sucessores) {
            if (s.numeroDocumento) mapaSubDoc.set(s.origemIdExterno, s.numeroDocumento);
          }
        }

        // Marca quais títulos DESTA página são pagamentos devolvidos (banco aceitou,
        // não liquidou, devolveu). Uma query só com os IDs da página + o detector.
        const devolvidosIds = new Set<string>();
        const idsPagina = ordenado.map((r) => r.id);
        if (idsPagina.length > 0) {
          const devolvidosRows = await cpRepo
            .createQueryBuilder('cp')
            .select('cp.id', 'id')
            .where('cp.id IN (:...idsPagina)', { idsPagina })
            .andWhere(DEVOLVIDO_SQL_CP)
            .getRawMany<{ id: string }>();
          for (const d of devolvidosRows) devolvidosIds.add(d.id);
        }

        fastify.log.info(
          { quantidadeRetornada: ordenado.length, total, primeirosIds: ordenado.slice(0, 3).map((r) => r.id) },
          `[contas-pagar] listar - retornando ${ordenado.length}/${total} linhas (página ${page})`,
        );

        const syncInfo = await obterSyncInfo();

        return {
          data: ordenado.map((r) =>
            toResponse(
              r,
              r.substituidoPorCod ? mapaSubDoc.get(r.substituidoPorCod) ?? null : null,
              devolvidosIds.has(r.id),
            ),
          ),
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
      // Cards do sumário refletem a realidade DEDUPLICADA: títulos substituídos
      // (o antigo, relançado) ficam de fora de TODOS os cards/contagens — senão
      // inflariam tanto o valor quanto a quantidade. Ver SFN-48.
      baseQb.andWhere(NAO_SUBSTITUIDO_SQL);

      const RETENCOES_SQL = '(cp.vlr_inss_cents + cp.vlr_irrf_cents + cp.vlr_pis_cents + cp.vlr_cofins_cents + cp.vlr_csll_cents + cp.vlr_iss_cents)';
      const APAGAR_SQL = `(cp.valor_liquido_cents - ${RETENCOES_SQL})`;

      // TOTAL do período NÃO soma cancelados (regra central). A base os mantém
      // porque o card "Cancelado" e os buckets por status precisam deles.
      const totaisRow = await baseQb
        .clone()
        .andWhere(ENTRA_NA_SOMA_SQL)
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

      // Cancelados em aberto — NÃO entram nos 4 cards de aging (NAO_PAGO_COND
      // exclui 'cancelado'), mas contam no total. Sem este 5º bucket a soma
      // dos cards não fecha com o total. Partição completa e mutuamente
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

      // Quando filtra por PAGAMENTO, soma a Perna B (débitos diretos de despesa no
      // banco, sem financeiras) no total e no card "Pago" — pra os cards de cima
      // baterem com o "Total pago" do card de baixo (mesma definição). No modo
      // pagamento, todos os títulos do CP no filtro estão pagos, então total = pago
      // e a soma dos cards continua fechando. Ver SFN-47.
      const filtraPagamentoSum = !!(payload.dtPagIni || payload.dtPagFim);
      // A "Perna B" (débitos diretos do banco SEM vínculo a um CP) não tem setor,
      // fornecedor, status nem documento — logo não dá pra honrar filtros de CP. Se o
      // usuário aplicou QUALQUER filtro que estreita por atributo do título, somar a
      // Perna B inflaria o "Total pago" (ficaria MAIOR que a lista filtrada, que é
      // puro CP). Só entra quando o escopo é apenas período/data de pagamento.
      const temFiltroCp = !!(
        payload.search || payload.status || payload.setores || payload.origem ||
        payload.valorMinCents || payload.valorMaxCents || payload.somenteVencidos
      );
      const pbSum = filtraPagamentoSum && !temFiltroCp
        ? await somaPernaBPago(payload.dtPagIni, payload.dtPagFim)
        : { cents: 0, qtd: 0 };

      return {
        periodo: { dtIni: payload.dtIni ?? null, dtFim: payload.dtFim ?? null },
        total: {
          quantidade: Number(totaisRow?.qtd ?? 0) + pbSum.qtd,
          valorBrutoCents: Number(totaisRow?.bruto ?? 0),
          valorLiquidoCents: Number(totaisRow?.liquido ?? 0),
          valorAPagarCents: Number(totaisRow?.apagar ?? 0) + pbSum.cents,
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
          quantidade: Number(pagoRow?.qtd ?? 0) + pbSum.qtd,
          valorAPagarCents: Number(pagoRow?.apagar ?? 0) + pbSum.cents,
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

    /**
     * Análise de PRAZO dos títulos: quantos entram por mês, quantos têm prazo
     * (vencimento − emissão) > 30 dias, e quantos desses já venceram sem pagamento.
     * Usa os MESMOS filtros do sumário/listagem. Exclui substituídos (SFN-48).
     */
    async analisePrazo(payload: AnalisePrazoRequest): Promise<AnalisePrazoResponse> {
      const baseQb = cpRepo.createQueryBuilder('cp').leftJoin('cp.fornecedor', 'forn');
      aplicarFiltros(baseQb, payload);
      baseQb.andWhere(ENTRA_NA_SOMA_SQL);

      const RET_SQL = '(cp.vlr_inss_cents + cp.vlr_irrf_cents + cp.vlr_pis_cents + cp.vlr_cofins_cents + cp.vlr_csll_cents + cp.vlr_iss_cents)';
      const APAGAR_SQL = `(cp.valor_liquido_cents - ${RET_SQL})`;
      const PAGO_COND = `(cp.status = 'pago' OR cp.quitado = true OR cp.data_pagamento IS NOT NULL)`;
      const NAO_PAGO_COND = `NOT ${PAGO_COND} AND cp.status <> 'cancelado'`;
      // Prazo em dias = vencimento − emissão (Postgres: date - date = int).
      const PRAZO_SQL = '(cp.data_vencimento - cp.data_emissao)';

      // (1) Inclusões por mês — ÚLTIMOS N meses por DATA DE INCLUSÃO no Globus
      // (data_inclusao, em America/Sao_Paulo; fallback emissão). DESACOPLADO da janela
      // de vencimento: usa uma query própria com só os filtros de atributo (setor/
      // status/origem/busca/valor), sem o período de vencimento — senão a série herdaria
      // o período e mostraria inclusões de anos atrás. `mesesInclusao` = 3 (default) / 6 / 12.
      const meses = payload.mesesInclusao ?? 3;
      const MES_TS = `COALESCE((cp.data_inclusao AT TIME ZONE 'America/Sao_Paulo'), cp.data_emissao::timestamp)`;
      const MES_SQL = `to_char(${MES_TS}, 'YYYY-MM')`;
      const inclQb = cpRepo.createQueryBuilder('cp').leftJoin('cp.fornecedor', 'forn');
      aplicarFiltros(inclQb, { ...payload, dtIni: undefined, dtFim: undefined });
      inclQb.andWhere(ENTRA_NA_SOMA_SQL);
      inclQb.andWhere(
        `${MES_TS} >= date_trunc('month', CURRENT_DATE) - make_interval(months => :mesesMenos1)`,
        { mesesMenos1: meses - 1 },
      );
      const inclusoesRaw = await inclQb
        .select(MES_SQL, 'mes')
        .addSelect('COUNT(*)', 'qtd')
        .addSelect('COALESCE(SUM(cp.valor_liquido_cents), 0)', 'liq')
        .groupBy(MES_SQL)
        .orderBy(MES_SQL, 'ASC')
        .getRawMany<{ mes: string; qtd: string; liq: string }>();

      // (2) Distribuição por faixa de prazo (baldes mutuamente exclusivos).
      const FAIXA_SQL = `CASE
          WHEN cp.data_emissao IS NULL THEN 'semData'
          WHEN ${PRAZO_SQL} <= 30 THEN 'ate30'
          WHEN ${PRAZO_SQL} <= 60 THEN 'de31a60'
          WHEN ${PRAZO_SQL} <= 90 THEN 'de61a90'
          ELSE 'mais90'
        END`;
      const faixasRaw = await baseQb
        .clone()
        .select(FAIXA_SQL, 'faixa')
        .addSelect('COUNT(*)', 'qtd')
        .addSelect('COALESCE(SUM(cp.valor_liquido_cents), 0)', 'liq')
        .groupBy(FAIXA_SQL)
        .getRawMany<{ faixa: string; qtd: string; liq: string }>();

      const distribuicaoPrazo = {
        ate30: { quantidade: 0, valorLiquidoCents: 0 },
        de31a60: { quantidade: 0, valorLiquidoCents: 0 },
        de61a90: { quantidade: 0, valorLiquidoCents: 0 },
        mais90: { quantidade: 0, valorLiquidoCents: 0 },
        semData: { quantidade: 0, valorLiquidoCents: 0 },
      };
      for (const r of faixasRaw) {
        const key = r.faixa as keyof typeof distribuicaoPrazo;
        if (key in distribuicaoPrazo) {
          distribuicaoPrazo[key] = { quantidade: Number(r.qtd), valorLiquidoCents: Number(r.liq) };
        }
      }
      const prazoLongo = {
        quantidade:
          distribuicaoPrazo.de31a60.quantidade +
          distribuicaoPrazo.de61a90.quantidade +
          distribuicaoPrazo.mais90.quantidade,
        valorLiquidoCents:
          distribuicaoPrazo.de31a60.valorLiquidoCents +
          distribuicaoPrazo.de61a90.valorLiquidoCents +
          distribuicaoPrazo.mais90.valorLiquidoCents,
      };

      // (3) Alerta — prazo > 30 dias, já venceu (vencimento < hoje) e não foi pago.
      const alertaRow = await baseQb
        .clone()
        .andWhere('cp.data_emissao IS NOT NULL')
        .andWhere(`${PRAZO_SQL} > 30`)
        .andWhere(NAO_PAGO_COND)
        .andWhere('cp.data_vencimento < CURRENT_DATE')
        .select('COUNT(*)', 'qtd')
        .addSelect(`COALESCE(SUM(${APAGAR_SQL}), 0)`, 'apagar')
        .getRawOne<{ qtd: string; apagar: string }>();

      return {
        periodo: { dtIni: payload.dtIni ?? null, dtFim: payload.dtFim ?? null },
        inclusoesPorMes: inclusoesRaw.map((r) => ({
          mes: r.mes,
          quantidade: Number(r.qtd),
          valorLiquidoCents: Number(r.liq),
        })),
        distribuicaoPrazo,
        prazoLongo,
        prazoLongoVencidoNaoPago: {
          quantidade: Number(alertaRow?.qtd ?? 0),
          valorAPagarCents: Number(alertaRow?.apagar ?? 0),
        },
      };
    },

    async sincronizar(payload: SyncContasPagarRequest, usuarioId: string): Promise<SyncResponse> {
      // MESMA expansão "dia inteiro" de listar/sumario/conferência (aplicarFiltros).
      // Sem isso, sincronizar "30/07 a 30/07" (o caso mais comum — "atualiza só
      // hoje") virava uma janela VAZIA no Oracle (VENCIMENTOCPG >= X AND < X) — o
      // sync rodava, reportava "ok" e lia ZERO registros, sem avisar que não fez
      // nada. Achado em 30/07/2026 junto com o mesmo bug na Conferência.
      const { ini: dtIniExp, fim: dtFimExp } = expandirSeMesmaData(payload.dtIni, payload.dtFim);
      const dtInicio = dtIniExp ? new Date(`${dtIniExp}T00:00:00Z`) : primeiroDiaDoMesUtc();
      const dtFimExclusivo = dtFimExp ? new Date(`${dtFimExp}T00:00:00Z`) : primeiroDiaProximoMesUtc();
      const empresa = payload.empresa ?? fastify.config.globus.empresaId;
      const modo = payload.modo ?? 'vencimento';

      fastify.log.info(
        { empresa, dtInicio: dtInicio.toISOString().slice(0, 10), dtFimExclusivo: dtFimExclusivo.toISOString().slice(0, 10), modo, usuarioId },
        '[contas-pagar] sync solicitada',
      );

      const syncResult = await adapter.sincronizar({ empresa, dtInicio, dtFimExclusivo, usuarioId, modo });

      if (syncResult.status !== 'erro') {
        await etl.processarPendentes(syncResult.jobId);
        // Trilha de eventos (quem incluiu/liberou/PAGOU + hora real). Roda DEPOIS
        // do ETL do CP pra que os títulos já existam e os eventos liguem em
        // conta_pagar_id. Best-effort: falha aqui não derruba o sync do título.
        try {
          const ev = await eventosAdapter.sincronizar({ empresa, dtInicio, dtFimExclusivo, usuarioId });
          if (ev.status !== 'erro') await eventosEtl.processarPendentes(ev.jobId);
        } catch (err) {
          fastify.log.warn({ err }, '[contas-pagar] sync de eventos (CPGDOCTO_HISTORICO_NEGOCIACOES) falhou - não crítico p/ o CP');
        }

        // Perna B do "pagamentos efetuados": quando o sync é por PAGAMENTO, puxa
        // também o extrato bancário (BCOMOVTO) da MESMA janela, pra que o "total
        // pago" inclua os débitos diretos no banco (despesa) que não passam pela
        // carteira do CP. Best-effort: falha aqui não derruba o sync do título.
        if (modo === 'pagamento') {
          try {
            const bm = await bcomovtoAdapter.sincronizar({ empresa, dtInicio, dtFimExclusivo, usuarioId });
            if (bm.status !== 'erro') await bancoMovtoEtl.processarPendentes({});
          } catch (err) {
            fastify.log.warn({ err }, '[contas-pagar] sync de banco_movto (Perna B / pagamentos diretos) falhou - não crítico p/ o CP');
          }
        }
      } else {
        fastify.log.warn({ jobId: syncResult.jobId, mensagem: syncResult.mensagem }, '[contas-pagar] adapter falhou - ETL não rodará');
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

    /**
     * RECONCILIAÇÃO dos títulos EM ABERTO contra o Globus, por chave.
     *
     * Fecha o ponto cego do sync por janela: um título aberto que muda de
     * vencimento (prorrogação), é cancelado ou pago sai da janela consultada e a
     * nossa cópia congela. Aqui pegamos todos os que temos como pendente/aprovado
     * e reconsultamos por CODDOCTOCPG — a chave não some, a janela sim.
     *
     * Também marca como cancelado o que sumiu do Globus: um título aberto que
     * não volta na reconsulta por chave foi apagado no ERP.
     *
     * Também busca o SUCESSOR de todo título substituído cujo sucessor ainda não
     * está na nossa base (mesmo ponto cego, outra face: Globus reemite sob NOVO
     * CODDOCTOCPG antes do vencimento, o antigo já sai da soma, mas o sync por
     * janela ainda não trouxe o novo — a obrigação some dos dois lados). A regra
     * de soma (`regras-soma.ts`) já tem um fallback pra não sumir o dinheiro
     * enquanto isso; aqui é o que resolve de vez, trazendo o dado real.
     */
    async reconciliarAbertos(usuarioId: string): Promise<{ jobId: string; status: string; verificados: number; atualizados: number; sumiram: number; sucessoresBuscados: number; duracaoMs: number }> {
      const t0 = Date.now();
      const empresa = fastify.config.globus.empresaId;

      // Títulos que ainda podem mudar no ERP (os pagos/cancelados são terminais).
      const abertos = await cpRepo.find({
        where: { empresaId: empresa, status: In(['pendente', 'aprovado', 'em_aprovacao']) },
        select: { id: true, origemIdExterno: true },
      });
      const codigosAbertos = abertos
        .map((c) => Number(c.origemIdExterno))
        .filter((n) => Number.isInteger(n) && n > 0);

      // Sucessores de título substituído (CODDOCTOCPGSUBST) que o sync por janela
      // ainda não trouxe. Sem isso a obrigação some: nem o antigo (substituído,
      // fora da soma) nem o novo (nunca sincronizado) contam. Ver regras-soma.ts,
      // caso 30/07/2026 (R$ 640.998,50 sumindo em silêncio).
      const sucessoresFaltando = await fastify.db.query<Array<{ cod: string }>>(
        `SELECT DISTINCT cp.substituido_por_cod AS cod
         FROM finance.contas_pagar cp
         WHERE cp.empresa_id = $1 AND cp.substituido = true AND cp.excluido_em IS NULL
           AND cp.substituido_por_cod IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM finance.contas_pagar suc
             WHERE suc.origem_sistema = cp.origem_sistema
               AND suc.origem_id_externo = cp.substituido_por_cod
               AND suc.excluido_em IS NULL
           )`,
        [empresa],
      );
      const codigosSucessores = sucessoresFaltando
        .map((r) => Number(r.cod))
        .filter((n) => Number.isInteger(n) && n > 0);

      const codigos = [...new Set([...codigosAbertos, ...codigosSucessores])];

      fastify.log.info(
        { verificados: codigosAbertos.length, sucessoresBuscados: codigosSucessores.length, usuarioId },
        '[contas-pagar] reconciliação de abertos iniciada',
      );

      const r = await adapter.reconciliarPorCodigos(codigos, empresa);
      // `atualizados` vem do ETL (títulos que de fato mudaram em finance), não do
      // adapter: o contador do stage distingue novo/existente, não mudou/igual.
      let atualizados = 0;
      if (r.status !== 'erro') {
        const etlRes = await etl.processarPendentes(r.jobId);
        atualizados = etlRes.gravados;
      }

      // Sumiram do Globus = estavam abertos aqui mas a reconsulta por chave não
      // os trouxe. São títulos apagados no ERP; marca cancelado (soft-delete).
      let sumiram = 0;
      if (r.status === 'ok' && r.registrosLidos < codigos.length) {
        const stageAtualizados = await fastify.db.query<Array<{ cod_docto_cpg: string }>>(
          `SELECT cod_docto_cpg::text FROM integration.globus_cp_stage
           WHERE sync_job_id = $1`,
          [r.jobId],
        );
        const vistos = new Set(stageAtualizados.map((x) => x.cod_docto_cpg));
        const ausentes = abertos.filter((c) => !vistos.has(String(Number(c.origemIdExterno))));
        for (const a of ausentes) {
          await cpRepo.update({ id: a.id }, {
            status: 'cancelado', statusDoctoGlobus: 'C',
            excluidoEm: new Date(), excluidoMotivo: 'ausente_no_globus',
          });
          sumiram += 1;
        }
        if (sumiram > 0) fastify.log.warn({ sumiram }, '[contas-pagar] títulos abertos ausentes no Globus — marcados cancelados');
      }

      return {
        jobId: r.jobId, status: r.status,
        verificados: codigosAbertos.length, atualizados, sumiram,
        sucessoresBuscados: codigosSucessores.length,
        duracaoMs: Date.now() - t0,
      };
    },

    async statusSync(): Promise<SyncInfo> {
      return obterSyncInfo();
    },

    /**
     * Grupo de pagamento de um título: todos os títulos quitados pelo MESMO
     * movimento bancário (cod_movto_bco). Deixa claro que parcelas de um
     * adiantamento são UM pagamento só, fatiado. Retorna vazio se o título não tem
     * movimento (quitado sem débito / não sincronizado).
     */
    async pagamentoGrupo(id: string): Promise<PagamentoGrupoResponse> {
      const cp = await cpRepo.findOne({ where: { id } });
      if (!cp || !cp.codMovtoBco) {
        return {
          movimentoId: cp?.codMovtoBco ?? null,
          documento: cp?.pagamentoDoc ?? null,
          bancoNome: cp?.bancoPagadorNome ?? null,
          quantidade: 0,
          totalCents: 0,
          titulos: [],
        };
      }

      const irmaos = await cpRepo.find({
        where: { codMovtoBco: cp.codMovtoBco, empresaId: cp.empresaId, excluidoEm: IsNull() },
        relations: ['fornecedor'],
      });

      const valorAPagarDe = (t: ContaPagar): number => {
        const ret =
          Number(t.vlrInssCents ?? 0) +
          Number(t.vlrIrrfCents ?? 0) +
          Number(t.vlrPisCents ?? 0) +
          Number(t.vlrCofinsCents ?? 0) +
          Number(t.vlrCsllCents ?? 0) +
          Number(t.vlrIssCents ?? 0);
        return Number(t.valorLiquidoCents) - ret;
      };

      const titulos = irmaos
        .map((t) => ({
          id: t.id,
          numeroDocumento: t.numeroDocumento,
          numeroParcela: t.numeroParcela,
          tipoDocumento: t.tipoDocumento,
          fornecedor: t.fornecedor?.razaoSocial ?? null,
          valorAPagarCents: valorAPagarDe(t),
          substituido: t.substituido,
        }))
        .sort(
          (a, b) =>
            (a.numeroDocumento ?? '').localeCompare(b.numeroDocumento ?? '') ||
            (a.numeroParcela ?? 0) - (b.numeroParcela ?? 0),
        );

      // Substituídos (o título antigo, ex.: a NF relançada como boleto no mesmo
      // borderô) ficam na LISTA pra transparência, mas NÃO entram no total nem na
      // quantidade — senão o borderô dobraria o valor (NF + Boleto do mesmo doc).
      // Ver SFN-48.
      const validos = titulos.filter((t) => !t.substituido);
      const totalCents = validos.reduce((s, t) => s + t.valorAPagarCents, 0);

      return {
        movimentoId: cp.codMovtoBco,
        documento: cp.pagamentoDoc,
        bancoNome: cp.bancoPagadorNome,
        quantidade: validos.length,
        totalCents,
        titulos,
      };
    },

    /**
     * Remessa enviada ao banco (pagamento eletrônico): todos os títulos enviados no
     * MESMO arquivo de remessa — chave conta (banco/conta pagador) + data + número.
     * Espelha o `pagamentoGrupo` (que agrupa por borderô/movimento). Só o pagamento
     * eletrônico tem remessa; borderô/cheque ficam sem (a UI cai no borderô).
     * Agrupa entre os títulos já sincronizados localmente.
     */
    async remessaGrupo(id: string): Promise<RemessaGrupoResponse> {
      const cp = await cpRepo.findOne({ where: { id } });
      if (!cp || !cp.numeroRemessa || !cp.dataRemessa) {
        return {
          numeroRemessa: cp?.numeroRemessa ?? null,
          dataRemessa: cp?.dataRemessa ? cp.dataRemessa.toISOString() : null,
          bancoNome: cp?.bancoPagadorNome ?? null,
          quantidade: 0,
          totalCents: 0,
          titulos: [],
        };
      }

      // Chave da remessa = conta pagadora + data + número (o número REPETE entre
      // dias/contas, por isso a conta e a data entram na chave). Ver memory.
      const irmaos = await cpRepo.find({
        where: {
          numeroRemessa: cp.numeroRemessa,
          dataRemessa: cp.dataRemessa,
          bancoPagadorCodigo: cp.bancoPagadorCodigo ?? IsNull(),
          bancoPagadorConta: cp.bancoPagadorConta ?? IsNull(),
          empresaId: cp.empresaId,
          excluidoEm: IsNull(),
        },
        relations: ['fornecedor'],
      });

      const valorAPagarDe = (t: ContaPagar): number => {
        const ret =
          Number(t.vlrInssCents ?? 0) +
          Number(t.vlrIrrfCents ?? 0) +
          Number(t.vlrPisCents ?? 0) +
          Number(t.vlrCofinsCents ?? 0) +
          Number(t.vlrCsllCents ?? 0) +
          Number(t.vlrIssCents ?? 0);
        return Number(t.valorLiquidoCents) - ret;
      };

      const titulos = irmaos
        .map((t) => ({
          id: t.id,
          numeroDocumento: t.numeroDocumento,
          numeroParcela: t.numeroParcela,
          tipoDocumento: t.tipoDocumento,
          fornecedor: t.fornecedor?.razaoSocial ?? null,
          valorAPagarCents: valorAPagarDe(t),
          substituido: t.substituido,
        }))
        .sort(
          (a, b) =>
            (a.numeroDocumento ?? '').localeCompare(b.numeroDocumento ?? '') ||
            (a.numeroParcela ?? 0) - (b.numeroParcela ?? 0),
        );

      // Substituídos ficam na lista (transparência) mas fora do total/quantidade.
      const validos = titulos.filter((t) => !t.substituido);
      const totalCents = validos.reduce((s, t) => s + t.valorAPagarCents, 0);

      return {
        numeroRemessa: cp.numeroRemessa,
        dataRemessa: cp.dataRemessa.toISOString(),
        bancoNome: cp.bancoPagadorNome,
        quantidade: validos.length,
        totalCents,
        titulos,
      };
    },

    /**
     * Comprovante da DEVOLUÇÃO de um pagamento (follow-up SFN-48). Para um título
     * marcado como "Devolvido", devolve a PROVA real no extrato bancário, em vez de
     * só afirmar que houve devolução:
     *   - `debito`  = a saída que o banco aceitou mas devolveu (dados do próprio título);
     *   - `credito` = o lançamento de DOC/CHEQUE DEVOLVIDO (BCOMOVTO) que casou
     *                 conta + valor (= valor a pagar) + janela de data — MESMA regra do
     *                 detector DEVOLVIDO_SQL_CP. Null quando não localizado;
     *   - `refeito` = o título que de fato liquidou a obrigação (quitado_globus=true,
     *                 mesmo fornecedor + mesmo valor, pago depois), quando identificável.
     * Nada é inferido: o crédito sai linha-a-linha do extrato importado.
     */
    /**
     * TRILHA REAL do documento no Globus — um evento por ato, com usuário e
     * hora, sem resumir nem inferir.
     *
     * Existe porque a visão anterior contava uma história limpa em 4 etapas e
     * escondia o que o financeiro via no ERP: pagamento cancelado e refeito
     * minutos depois. Ao esconder, o sistema parecia divergir do Globus quando
     * na verdade só omitia. Aqui tudo aparece, na ordem em que aconteceu.
     */
    async eventos(id: string): Promise<CpEventosResponse> {
      const cp = await cpRepo.findOne({ where: { id } });
      if (!cp) throw fastify.httpErrors.notFound('Título não encontrado');

      // `codDoctoCpg` é bigint -> vem como string no TypeORM.
      const linhas = await eventoRepo.find({
        where: { codDoctoCpg: cp.origemIdExterno },
        order: { sequenciaEvento: 'ASC' },
      });

      /**
       * Classifica o ato pelo TEXTO do Globus. Não usar o status resultante como
       * atalho: atos como "Adiantamento associado." e "Alterou: valor de
       * adiantamento" também terminam em status 'B' e seriam contados como
       * pagamento, inflando `vezesPago`. Só conta pagamento o que diz que é.
       */
      function classificar(detalhe: string | null, tipoDesc: string | null): CpEvento['natureza'] {
        const t = `${detalhe ?? ''} ${tipoDesc ?? ''}`.toLowerCase();
        if (t.includes('cancelamento de pagamento') || t.includes('cancelou liberação')) return 'cancelamento_pagamento';
        if (t.includes('cancelamento de documento')) return 'cancelamento_documento';
        if (t.includes('pagamento de documento')) return 'pagamento';
        if (t.includes('liberou pagamento') || t.includes('liberação de pagamento')) return 'liberacao';
        if (t.includes('documento criado') || t.includes('origem')) return 'criacao';
        return 'outro';
      }

      const eventos: CpEvento[] = linhas.map((e) => ({
        sequencia: e.sequenciaEvento,
        codTipoEvento: e.codTpEvento ?? null,
        tipoDescricao: e.tipoEventoDesc ?? null,
        detalhe: e.maisInformacoes ?? null,
        statusResultante: e.statusDocto ?? null,
        usuario: e.usuario ?? null,
        ocorridoEm: e.ocorridoEm ? e.ocorridoEm.toISOString() : null,
        natureza: classificar(e.maisInformacoes ?? null, e.tipoEventoDesc ?? null),
      }));

      const teveCancelamentoPagamento = eventos.some((e) => e.natureza === 'cancelamento_pagamento');
      const vezesPago = eventos.filter((e) => e.natureza === 'pagamento').length;

      // Divergência: o que mostramos x o que o ERP diz. N/A = em aberto.
      const esperado = cp.statusDoctoGlobus === 'B' ? 'pago'
        : cp.statusDoctoGlobus === 'C' ? 'cancelado'
        : cp.statusDoctoGlobus === 'F' ? 'aprovado'
        : cp.statusDoctoGlobus ? 'pendente' : null;
      const divergente = esperado !== null && esperado !== cp.status;

      const partes: string[] = [];
      if (vezesPago > 1) partes.push(`pagamento refeito ${vezesPago}× no Globus`);
      else if (teveCancelamentoPagamento) partes.push('houve cancelamento de pagamento');
      if (divergente) partes.push(`nosso status (${cp.status}) difere do Globus (${esperado})`);
      const resumo = partes.length > 0
        ? partes.join(' · ')
        : eventos.length > 0 ? 'Trilha sem cancelamentos.' : 'Sem eventos sincronizados para este título.';

      return {
        eventos,
        statusSistema: cp.status,
        statusGlobus: cp.statusDoctoGlobus ?? null,
        quitadoGlobus: cp.quitadoGlobus,
        divergente,
        teveCancelamentoPagamento,
        vezesPago,
        resumo,
      };
    },

    /**
     * CONFERÊNCIA contra o Globus — a defesa contra "cada linha certa, total errado".
     *
     * Soma os dois lados de forma INDEPENDENTE (nós no Postgres, o ERP no Oracle)
     * e compara. Divergência aponta padrão de duplicidade que ainda não tratamos,
     * sem depender de alguém trazer uma planilha para descobrir.
     *
     * Ver `Leia/cp-status-divergencia-globus.md`.
     */
    async conferencia(query: CpConferenciaQuery): Promise<CpConferenciaResponse> {
      const periodo = { de: query.dtIni, ate: query.dtFim };
      // MESMA expansão "dia inteiro" usada em listar/sumario (aplicarFiltros). Sem
      // isso, um filtro de UM dia só (dtIni === dtFim, o caso mais comum — "o que
      // vence hoje") virava um range VAZIO aqui (data_vencimento >= X AND < X) e a
      // conferência respondia "confere, 0 títulos" sem comparar nada de verdade —
      // um falso-positivo silencioso. Bug real, achado em 30/07/2026.
      const { ini: dtIniExp, fim: dtFimExp } = expandirSeMesmaData(query.dtIni, query.dtFim);
      const dtIni = dtIniExp ?? query.dtIni;
      const dtFim = dtFimExp ?? query.dtFim;
      const vazia = (rotulo: string): CpConferenciaLinha => ({
        statusGlobus: '', rotulo,
        globusQuantidade: 0, globusCents: 0, sistemaQuantidade: 0, sistemaCents: 0,
        difQuantidade: 0, difCents: 0, ok: true,
      });

      if (!fastify.oracle?.isAvailable?.()) {
        return {
          periodo, porStatus: [], totalSomavel: vazia('Total conferível'),
          conferido: false, resumo: 'Globus indisponível — não dá para conferir agora.',
          indisponivel: 'Conexão com o Globus (Oracle) indisponível.',
        };
      }

      interface RawTotalRow {
        STATUS_DOCTO: string | null; SUBSTITUIDO: string;
        QTDE: number; VLR_ORIGINAL: number | null;
        DESCONTO: number | null; ACRESCIMO: number | null;
      }

      let linhasGlobus: RawTotalRow[];
      try {
        const r = await fastify.oracle.execute<RawTotalRow>(
          GLOBUS_QUERIES.conferenciaCpTotais,
          { empresa: fastify.config.globus.empresaId, dt_ini: new Date(`${dtIni}T00:00:00`), dt_fim_excl: new Date(`${dtFim}T00:00:00`) },
          { queryName: 'conferenciaCpTotais' },
        );
        linhasGlobus = r.rows ?? [];
      } catch (err) {
        fastify.log.warn({ err }, '[cp:conferencia] falha ao consultar o Globus');
        return {
          periodo, porStatus: [], totalSomavel: vazia('Total conferível'),
          conferido: false, resumo: 'Não foi possível consultar o Globus.',
          indisponivel: err instanceof Error ? err.message : 'Erro ao consultar o Globus.',
        };
      }

      // Nosso lado, agregado pelo MESMO recorte (status do ERP × substituído).
      const nossas = await cpRepo
        .createQueryBuilder('cp')
        .select('cp.status_docto_globus', 'status')
        .addSelect('cp.substituido', 'substituido')
        .addSelect('COUNT(*)', 'qtd')
        .addSelect('COALESCE(SUM(cp.valor_bruto_cents), 0)', 'cents')
        .where('cp.empresa_id = :empresa', { empresa: fastify.config.globus.empresaId })
        // SEM filtro de `excluido_em`: os cancelados ficam soft-deleted aqui
        // (motivo 'cancelado_no_globus') mas existem no Globus. Filtrar deixaria
        // os dois lados olhando universos diferentes e acusaria falsa divergência.
        .andWhere('cp.data_vencimento >= :dtIni', { dtIni })
        .andWhere('cp.data_vencimento < :dtFim', { dtFim })
        .groupBy('cp.status_docto_globus')
        .addGroupBy('cp.substituido')
        .getRawMany<{ status: string | null; substituido: boolean; qtd: string; cents: string }>();

      const ROTULO: Record<string, string> = {
        N: 'Em aberto (N)', B: 'Baixado / pago (B)', C: 'Cancelado (C)', F: 'Aprovado (F)', A: 'Em aberto (A)',
      };
      /** Reais -> centavos, com arredondamento (o Oracle devolve NUMBER). */
      const cents = (v: number | null | undefined): number => Math.round((v ?? 0) * 100);

      const chaves = new Set<string>([
        ...linhasGlobus.map((l) => (l.STATUS_DOCTO ?? '?').toUpperCase()),
        ...nossas.map((n) => (n.status ?? '?').toUpperCase()),
      ]);

      const porStatus: CpConferenciaLinha[] = [...chaves].sort().map((st) => {
        const g = linhasGlobus.filter((l) => (l.STATUS_DOCTO ?? '?').toUpperCase() === st);
        const n = nossas.filter((x) => (x.status ?? '?').toUpperCase() === st);
        const gQtd = g.reduce((a, l) => a + Number(l.QTDE ?? 0), 0);
        const gCents = g.reduce((a, l) => a + cents(l.VLR_ORIGINAL), 0);
        const nQtd = n.reduce((a, x) => a + Number(x.qtd), 0);
        const nCents = n.reduce((a, x) => a + Number(x.cents), 0);
        return {
          statusGlobus: st, rotulo: ROTULO[st] ?? `Status ${st}`,
          globusQuantidade: gQtd, globusCents: gCents,
          sistemaQuantidade: nQtd, sistemaCents: nCents,
          difQuantidade: nQtd - gQtd, difCents: nCents - gCents,
          ok: nQtd === gQtd && nCents === gCents,
        };
      });

      // O total que a tela mostra: fora substituídos e cancelados nos DOIS lados.
      const gSoma = linhasGlobus.filter((l) => (l.STATUS_DOCTO ?? '').toUpperCase() !== 'C' && l.SUBSTITUIDO !== 'S');
      const nSoma = nossas.filter((x) => (x.status ?? '').toUpperCase() !== 'C' && !x.substituido);
      const gQ = gSoma.reduce((a, l) => a + Number(l.QTDE ?? 0), 0);
      const gC = gSoma.reduce((a, l) => a + cents(l.VLR_ORIGINAL), 0);
      const nQ = nSoma.reduce((a, x) => a + Number(x.qtd), 0);
      const nC = nSoma.reduce((a, x) => a + Number(x.cents), 0);
      const totalSomavel: CpConferenciaLinha = {
        statusGlobus: '', rotulo: 'Total conferível (fora substituídos e cancelados)',
        globusQuantidade: gQ, globusCents: gC, sistemaQuantidade: nQ, sistemaCents: nC,
        difQuantidade: nQ - gQ, difCents: nC - gC,
        ok: nQ === gQ && nC === gC,
      };

      const conferido = totalSomavel.ok && porStatus.every((l) => l.ok);
      const brl = (c: number): string => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const resumo = conferido
        ? `Confere com o Globus: ${brl(totalSomavel.sistemaCents)} em ${nQ} título(s).`
        : totalSomavel.ok
          ? 'O total confere, mas há diferença na quebra por status — vale sincronizar.'
          : `DIVERGE do Globus em ${brl(Math.abs(totalSomavel.difCents))} (${totalSomavel.difQuantidade >= 0 ? '+' : ''}${totalSomavel.difQuantidade} título(s)).`;

      if (!conferido) {
        fastify.log.warn({ periodo, difCents: totalSomavel.difCents, difQtd: totalSomavel.difQuantidade },
          '[cp:conferencia] DIVERGÊNCIA com o Globus');
      }
      return { periodo, porStatus, totalSomavel, conferido, resumo, indisponivel: null };
    },

    async devolucaoComprovante(id: string): Promise<DevolucaoComprovanteResponse> {
      const cp = await cpRepo.findOne({ where: { id } });

      const valorAPagarDe = (t: ContaPagar): number => {
        const ret =
          Number(t.vlrInssCents ?? 0) +
          Number(t.vlrIrrfCents ?? 0) +
          Number(t.vlrPisCents ?? 0) +
          Number(t.vlrCofinsCents ?? 0) +
          Number(t.vlrCsllCents ?? 0) +
          Number(t.vlrIssCents ?? 0);
        return Number(t.valorLiquidoCents) - ret;
      };

      const debitoVazio = {
        dataPagamento: cp?.dataPagamento ?? null,
        valorCents: cp ? valorAPagarDe(cp) : 0,
        bancoCodigo: cp?.bancoPagadorCodigo ?? null,
        bancoNome: cp?.bancoPagadorNome ?? null,
        agencia: cp?.bancoPagadorAgencia ?? null,
        conta: cp?.bancoPagadorConta ?? null,
        documento: cp?.pagamentoDoc ?? null,
        movimentoId: cp?.codMovtoBco ?? null,
      };

      // Sem título, sem data de pagamento ou sem banco pagador não há como casar o
      // crédito de devolução — devolve "não encontrado" explícito.
      if (!cp || !cp.dataPagamento || cp.bancoPagadorCodigo == null) {
        return { encontrado: false, debito: debitoVazio, credito: null, refeito: null };
      }

      const valorAPagar = valorAPagarDe(cp);

      // Crédito de devolução: MESMA regra do detector (DEVOLVIDO_SQL_CP). DOC/CHEQUE
      // DEVOLVIDO, mesma conta, mesmo valor, janela [pagamento-1d, pagamento+10d].
      // Pega o mais próximo da data de pagamento (o casamento mais provável).
      const creditoQb = bcoMovtoRepo
        .createQueryBuilder('mc')
        .where('mc.empresa_id = :empresa', { empresa: cp.empresaId })
        .andWhere('mc.excluido_em IS NULL')
        .andWhere("mc.debito_credito = 'C'")
        .andWhere(`mc.cod_histo_bco IN (${HISTORICOS_DEVOLUCAO_BCO_SQL})`)
        .andWhere('mc.cod_banco = :banco', { banco: cp.bancoPagadorCodigo })
        .andWhere('mc.valor_cents = :valor', { valor: valorAPagar })
        // Janela do detector: pagamento-1d até pagamento+10d.
        .andWhere(
          "mc.data_movto BETWEEN (:pag::date - INTERVAL '1 day') AND (:pag::date + INTERVAL '10 days')",
          { pag: cp.dataPagamento },
        )
        .orderBy(`ABS(mc.data_movto - :pag::date)`, 'ASC')
        .setParameter('pag', cp.dataPagamento);

      if (cp.bancoPagadorConta) {
        creditoQb.andWhere('mc.cod_conta_bco = :conta', { conta: cp.bancoPagadorConta });
      }

      const creditoRow = await creditoQb.getOne();

      const credito = creditoRow
        ? {
            codMovtoBco: creditoRow.codMovtoBco,
            dataMovto: creditoRow.dataMovto ?? null,
            dataEfetiva: creditoRow.dataEfetiva ?? null,
            dataCredito: creditoRow.dataCredito ?? null,
            valorCents: Number(creditoRow.valorCents),
            bancoCodigo: creditoRow.codBanco,
            // BCOMOVTO não guarda o nome do banco; é a MESMA conta pagadora do título.
            bancoNome: cp.bancoPagadorNome,
            agencia: creditoRow.codAgencia != null ? String(creditoRow.codAgencia) : null,
            conta: creditoRow.codContaBco ?? null,
            codHistoBco: creditoRow.codHistoBco,
            descHistoBco: creditoRow.descHistoBco,
            documento: creditoRow.docMovtoBco,
            historico: creditoRow.histMovtoBco,
          }
        : null;

      // Título que REFEZ a obrigação: quitado de verdade (quitado_globus=true), mesmo
      // fornecedor, mesmo valor a pagar, pago a partir da data deste — o sucessor que
      // de fato liquidou. Só sugere quando há candidato seguro; senão null.
      let refeito: DevolucaoComprovanteResponse['refeito'] = null;
      if (cp.fornecedorId) {
        const candidatos = await cpRepo.find({
          where: {
            fornecedorId: cp.fornecedorId,
            quitadoGlobus: true,
            substituido: false,
            empresaId: cp.empresaId,
            excluidoEm: IsNull(),
          },
        });
        const refeitoCp = candidatos
          .filter((c) => c.id !== cp.id && valorAPagarDe(c) === valorAPagar && c.dataPagamento)
          .sort((a, b) => (a.dataPagamento ?? '').localeCompare(b.dataPagamento ?? ''))
          .find((c) => (c.dataPagamento ?? '') >= (cp.dataPagamento ?? ''));
        if (refeitoCp) {
          refeito = {
            id: refeitoCp.id,
            numeroDocumento: refeitoCp.numeroDocumento,
            numeroParcela: refeitoCp.numeroParcela,
            tipoDocumento: refeitoCp.tipoDocumento,
            dataPagamento: refeitoCp.dataPagamento,
            documento: refeitoCp.pagamentoDoc,
            valorAPagarCents: valorAPagarDe(refeitoCp),
          };
        }
      }

      return { encontrado: credito !== null, debito: debitoVazio, credito, refeito };
    },

    /**
     * Cadeia de substituição de um documento (SFN-48). Um título tramita por
     * vários ESTADOS no Globus (ex.: NF -> Recibo -> Boleto), ligados por
     * substituido_por_cod (= origem_id_externo do sucessor). Faz BFS nos dois
     * sentidos (frente: quem este aponta; trás: quem aponta pra este) e devolve a
     * cadeia ordenada do mais antigo ao final. Só o final (sem sucessor) conta.
     */
    async substituicaoCadeia(id: string): Promise<SubstituicaoCadeiaResponse> {
      const base = await cpRepo.findOne({ where: { id } });
      if (!base) return { total: 0, valorFinalCents: 0, cadeia: [] };

      const valorAPagarDe = (t: ContaPagar): number => {
        const ret =
          Number(t.vlrInssCents ?? 0) +
          Number(t.vlrIrrfCents ?? 0) +
          Number(t.vlrPisCents ?? 0) +
          Number(t.vlrCofinsCents ?? 0) +
          Number(t.vlrCsllCents ?? 0) +
          Number(t.vlrIssCents ?? 0);
        return Number(t.valorLiquidoCents) - ret;
      };

      // BFS pela cadeia. Cap de 50 nós por segurança (evita loop em dado sujo).
      const visitados = new Map<string, ContaPagar>();
      visitados.set(base.origemIdExterno, base);
      const fila: ContaPagar[] = [base];
      while (fila.length > 0 && visitados.size <= 50) {
        const n = fila.shift()!;
        // Frente: o sucessor que ESTE título aponta.
        if (n.substituidoPorCod && !visitados.has(n.substituidoPorCod)) {
          const suc = await cpRepo.findOne({
            where: { origemSistema: 'globus', origemIdExterno: n.substituidoPorCod, empresaId: n.empresaId, excluidoEm: IsNull() },
          });
          if (suc) {
            visitados.set(suc.origemIdExterno, suc);
            fila.push(suc);
          }
        }
        // Trás: títulos que apontam pra ESTE (podem ser vários — consolidação N:1).
        const preds = await cpRepo.find({
          where: { substituidoPorCod: n.origemIdExterno, empresaId: n.empresaId, excluidoEm: IsNull() },
        });
        for (const p of preds) {
          if (!visitados.has(p.origemIdExterno)) {
            visitados.set(p.origemIdExterno, p);
            fila.push(p);
          }
        }
      }

      const nos = Array.from(visitados.values()).sort((a, b) => {
        const da = a.dataInclusao ? a.dataInclusao.getTime() : 0;
        const db = b.dataInclusao ? b.dataInclusao.getTime() : 0;
        return da - db || a.origemIdExterno.localeCompare(b.origemIdExterno);
      });

      const cadeia = nos.map((t) => ({
        id: t.id,
        numeroDocumento: t.numeroDocumento,
        serieDocumento: t.serieDocumento,
        numeroParcela: t.numeroParcela,
        tipoDocumento: t.tipoDocumento,
        valorAPagarCents: valorAPagarDe(t),
        dataInclusao: t.dataInclusao ? t.dataInclusao.toISOString() : null,
        dataPagamento: t.dataPagamento,
        quitado: t.quitado,
        status: t.status,
        numeroRemessa: t.numeroRemessa,
        dataRemessa: t.dataRemessa ? t.dataRemessa.toISOString() : null,
        statusPe: t.statusPe,
        substituido: t.substituido,
        final: !t.substituido,
        atual: t.id === id,
        rateioContas: t.rateioContas ?? null,
      }));

      const finalNo = cadeia.find((c) => c.final);
      return { total: cadeia.length, valorFinalCents: finalNo?.valorAPagarCents ?? 0, cadeia };
    },

    /**
     * Lista setores distintos presentes em finance.contas_pagar — usado pra
     * popular o filtro. `codigo` = CODCUSTOFIN (centro de custo financeiro do
     * Globus), `nome` = CPGCUSTOS.DESCRICAO. Ignora linhas com cod_setor NULL.
     */
    async listarSetores(): Promise<Array<{ codigo: string; nome: string | null; totalCps: number }>> {
      // Conta o título em CADA unidade que ele tem (dominante + rateio), via a quebra
      // rateio_setores. Assim a DOBRAS (Itapoá dominante) entra na contagem de Santa
      // Maria/Gama/São Sebastião também. Fallback no cod_setor pra títulos legados
      // (rateio_setores null, ainda não re-sincronizados).
      const rows = await cpRepo.query<Array<{ codigo: string; nome: string | null; totalcps: string }>>(
        `SELECT codigo, MAX(nome) AS nome, COUNT(*)::int AS totalcps
           FROM (
             SELECT cp.id, e.codigo, e.nome
               FROM finance.contas_pagar cp,
                    LATERAL jsonb_to_recordset(cp.rateio_setores) AS e(codigo text, nome text)
              WHERE cp.excluido_em IS NULL AND cp.rateio_setores IS NOT NULL
             UNION ALL
             SELECT cp.id, cp.cod_setor AS codigo, cp.setor_nome AS nome
               FROM finance.contas_pagar cp
              WHERE cp.excluido_em IS NULL AND cp.rateio_setores IS NULL AND cp.cod_setor IS NOT NULL
           ) x
          WHERE x.codigo IS NOT NULL
          GROUP BY x.codigo
          ORDER BY MAX(nome) ASC NULLS LAST`,
      );
      return rows.map((r) => ({ codigo: r.codigo, nome: r.nome, totalCps: Number(r.totalcps) }));
    },

    /**
     * Detalhe dos movimentos bancários (saídas) que compõem o "Total movimento" /
     * "Direto no banco" do período de PAGAMENTO. Lista cada lançamento do extrato
     * (BCOMOVTO) que é despesa direta OU pagamento de título do CP, classificado em
     * pagamento_cp / despesa / financeiro. Usado pelo modal de detalhe na tela do CP.
     */
    async movimentoBanco(query: MovimentoBancoQuery): Promise<MovimentoBancoResponse> {
      const { ini: dtPagIni, fim: dtPagFim } = expandirSeMesmaData(query.dtPagIni, query.dtPagFim);
      const qb = bcoMovtoRepo
        .createQueryBuilder('m')
        .where('m.empresa_id = :empresa', { empresa: fastify.config.globus.empresaId })
        .andWhere('m.excluido_em IS NULL')
        .andWhere(
          `(m.cod_tp_despesa IS NOT NULL
            OR m.cod_histo_bco IN (${HISTORICOS_DEVOLUCAO_BCO_SQL})
            OR EXISTS (SELECT 1 FROM finance.contas_pagar cpx
                       WHERE cpx.cod_movto_bco = m.cod_movto_bco
                         AND cpx.empresa_id = m.empresa_id
                         AND cpx.excluido_em IS NULL))`,
        );
      if (dtPagIni) qb.andWhere('m.data_movto >= :dtPagIni', { dtPagIni });
      if (dtPagFim) qb.andWhere('m.data_movto < :dtPagFim', { dtPagFim });

      const rows = await qb
        .select('m.cod_movto_bco', 'cod_movto_bco')
        .addSelect('m.data_movto', 'data_movto')
        .addSelect('m.cod_tp_despesa', 'cod_tp_despesa')
        .addSelect('m.cod_histo_bco', 'cod_histo_bco')
        .addSelect('m.desc_histo_bco', 'desc_histo_bco')
        .addSelect('m.hist_movto_bco', 'hist_movto_bco')
        .addSelect('m.doc_movto_bco', 'doc_movto_bco')
        .addSelect('m.valor_cents', 'valor_cents')
        .addSelect('m.debito_credito', 'debito_credito')
        .addSelect(
          `EXISTS (SELECT 1 FROM finance.contas_pagar cpx
                   WHERE cpx.cod_movto_bco = m.cod_movto_bco
                     AND cpx.empresa_id = m.empresa_id
                     AND cpx.excluido_em IS NULL)`,
          'tem_cp',
        )
        .orderBy('m.valor_cents', 'DESC')
        .getRawMany<{
          cod_movto_bco: string;
          data_movto: string | Date | null;
          cod_tp_despesa: string | null;
          cod_histo_bco: number | null;
          desc_histo_bco: string | null;
          hist_movto_bco: string | null;
          doc_movto_bco: string | null;
          valor_cents: string;
          debito_credito: string | null;
          tem_cp: boolean;
        }>();

      const itens: MovimentoBancoItem[] = rows.map((r) => {
        const sinal = r.debito_credito === 'C' ? -1 : 1;
        const valorCents = sinal * Number(r.valor_cents);
        // Devolução de pagamento (DOC/CHEQUE DEVOLVIDO): crédito que reverte uma saída.
        // Categoria própria pra ficar claro "saiu e voltou" e netar o Total movimento.
        const ehDevolucao = r.cod_histo_bco != null && HISTORICOS_DEVOLUCAO_BCO.includes(Number(r.cod_histo_bco));
        const categoria: MovimentoBancoItem['categoria'] = ehDevolucao
          ? 'devolucao'
          : r.tem_cp === true
            ? 'pagamento_cp'
            : DESPESAS_NAO_PAGAMENTO.includes(r.cod_tp_despesa ?? '')
              ? 'financeiro'
              : 'despesa';
        const dataMovto =
          r.data_movto instanceof Date
            ? r.data_movto.toISOString().slice(0, 10)
            : r.data_movto
              ? String(r.data_movto).slice(0, 10)
              : null;
        return {
          codMovtoBco: String(r.cod_movto_bco),
          dataMovto,
          codTpDespesa: r.cod_tp_despesa,
          descricao: (r.desc_histo_bco ?? r.hist_movto_bco)?.trim() || null,
          documento: r.doc_movto_bco?.trim() || null,
          valorCents,
          categoria,
        };
      });

      const soma = (cat: MovimentoBancoItem['categoria']): number =>
        itens.filter((i) => i.categoria === cat).reduce((s, i) => s + i.valorCents, 0);

      return {
        itens,
        totais: {
          quantidade: itens.length,
          movimentoCents: itens.reduce((s, i) => s + i.valorCents, 0),
          pagamentoCpCents: soma('pagamento_cp'),
          despesaCents: soma('despesa'),
          financeiroCents: soma('financeiro'),
          devolucaoCents: soma('devolucao'),
        },
      };
    },

    /**
     * Exporta a listagem FILTRADA (mesmos filtros da tela, sem paginação) para um
     * .xlsx formatado: cabeçalho colorido congelado, autofiltro, colunas de moeda/
     * data, e linhas SUBSTITUÍDAS destacadas em âmbar + tachado. Limite de segurança
     * de 50k linhas. Ver SFN-48.
     */
    async exportarXlsx(query: ContaPagarListQuery): Promise<{ buffer: Buffer; filename: string }> {
      const LIMITE = 50000;
      const qb = cpRepo.createQueryBuilder('cp').leftJoinAndSelect('cp.fornecedor', 'forn');
      aplicarFiltros(qb, query);
      // orderBy precisa do nome da PROPERTY (camelCase), não da coluna snake_case:
      // com leftJoinAndSelect + limit o TypeORM monta o subquery de paginação e
      // resolve o metadata da coluna pela property. Com 'cp.data_vencimento' estoura
      // "Cannot read ... 'databaseName'" -> 500. Ver memória typeorm-orderby-property-name.
      qb.orderBy('cp.dataVencimento', 'DESC').addOrderBy('cp.id', 'ASC').limit(LIMITE);
      const rows = await qb.getMany();

      // Número REAL do documento sucessor (o usuário não conhece o cod interno).
      const codsSucessores = Array.from(
        new Set(rows.filter((r) => r.substituido && r.substituidoPorCod).map((r) => r.substituidoPorCod as string)),
      );
      const mapaSubDoc = new Map<string, string>();
      if (codsSucessores.length > 0) {
        const sucessores = await cpRepo.find({ where: { origemSistema: 'globus', origemIdExterno: In(codsSucessores) } });
        for (const s of sucessores) if (s.numeroDocumento) mapaSubDoc.set(s.origemIdExterno, s.numeroDocumento);
      }

      const retDe = (t: ContaPagar): number =>
        Number(t.vlrInssCents ?? 0) + Number(t.vlrIrrfCents ?? 0) + Number(t.vlrPisCents ?? 0) +
        Number(t.vlrCofinsCents ?? 0) + Number(t.vlrCsllCents ?? 0) + Number(t.vlrIssCents ?? 0);
      const reais = (cents: number): number => cents / 100;
      const dataDe = (s: string | null): Date | null => (s ? new Date(`${s}T00:00:00`) : null);
      const label = (map: Record<string, string>, code: string | null): string => (code ? map[code] ?? code : '');
      const STATUS_PT: Record<string, string> = {
        pendente: 'Pendente', em_aprovacao: 'Em aprovação', aprovado: 'Aprovado', pago: 'Pago', cancelado: 'Cancelado',
      };
      // "Tipo de despesa" = natureza da despesa (conta contábil DOMINANTE do título).
      // Fonte: rateioContas (CPGITDOC.CODCONTACTB -> CTBCONTA), já sincronizado. Quando
      // há mais de uma conta (rateio), mostra a de maior valor + marcador; a quebra
      // completa fica na aba "Itens por conta".
      const tipoDespesa = (t: ContaPagar): string => {
        const cs = t.rateioContas ?? [];
        if (cs.length === 0) return '';
        const dom = cs.reduce((a, b) => (b.valorCents > a.valorCents ? b : a));
        const nome = dom.nome ?? dom.classificador;
        return cs.length > 1 ? `${nome} (rateado +${cs.length - 1})` : nome;
      };

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Pioneira Finanças';
      const ws = wb.addWorksheet('Contas a Pagar', { views: [{ state: 'frozen', ySplit: 1 }] });

      ws.columns = [
        { header: 'Fornecedor', key: 'fornecedor', width: 40 },
        { header: 'CNPJ/CPF', key: 'cnpj', width: 20 },
        { header: 'Favorecido (real)', key: 'favorecido', width: 34 },
        { header: 'Tipo', key: 'tipo', width: 16 },
        { header: 'Documento', key: 'doc', width: 16 },
        { header: 'Série', key: 'serie', width: 8 },
        { header: 'Parcela', key: 'parcela', width: 9 },
        { header: 'Setor', key: 'setor', width: 26 },
        { header: 'Tipo de despesa', key: 'tpdespesa', width: 32 },
        { header: 'Origem', key: 'origem', width: 16 },
        { header: 'Emissão', key: 'emissao', width: 13 },
        { header: 'Entrada', key: 'entrada', width: 13 },
        { header: 'Vencimento', key: 'venc', width: 13 },
        { header: 'Pagamento', key: 'pag', width: 13 },
        { header: 'Valor bruto', key: 'bruto', width: 15 },
        { header: 'Retenções', key: 'ret', width: 14 },
        { header: 'Valor a pagar', key: 'apagar', width: 15 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Incluído por', key: 'incluido', width: 16 },
        { header: 'Liberado por', key: 'liberado', width: 16 },
        { header: 'Liberado em', key: 'libem', width: 13 },
        { header: 'Responsável', key: 'responsavel', width: 16 },
        { header: 'Substituído', key: 'subst', width: 12 },
        { header: 'Substituído por (doc)', key: 'substdoc', width: 20 },
        { header: 'Modalidade', key: 'modalidade', width: 26 },
        { header: 'Banco pagador', key: 'banco', width: 24 },
        { header: 'Agência', key: 'agencia', width: 10 },
        { header: 'Conta', key: 'conta', width: 14 },
        { header: 'Borderô', key: 'bordero', width: 14 },
        { header: 'Remessa', key: 'remessa', width: 16 },
      ];

      for (const t of rows) {
        ws.addRow({
          fornecedor: t.fornecedor?.razaoSocial ?? t.favorecidoNome ?? '-',
          cnpj: t.fornecedor?.cnpjCpf ?? t.favorecidoInscricao ?? '',
          favorecido: t.favorecidoNome ?? '',
          tipo: label(TIPO_DOCUMENTO_LABEL, t.tipoDocumento),
          doc: t.numeroDocumento ?? '',
          serie: t.serieDocumento ?? '',
          parcela: t.numeroParcela ?? '',
          setor: t.setorNome ?? '',
          tpdespesa: tipoDespesa(t),
          origem: label(ORIGEM_DOCUMENTO_CP_LABELS as Record<string, string>, t.origemDocumento),
          emissao: dataDe(t.dataEmissao),
          entrada: dataDe(t.dataEntrada),
          venc: dataDe(t.dataVencimento),
          pag: dataDe(t.dataPagamento),
          bruto: reais(Number(t.valorBrutoCents)),
          ret: reais(retDe(t)),
          apagar: reais(Number(t.valorLiquidoCents) - retDe(t)),
          status: STATUS_PT[t.status] ?? t.status,
          incluido: t.usuarioInclusao ?? '',
          liberado: t.usuarioLibPagto ?? '',
          libem: t.dataLiberacaoPagto ?? null,
          responsavel: t.usuarioResponsavel ?? '',
          subst: t.substituido ? 'SIM' : 'Não',
          substdoc: t.substituido && t.substituidoPorCod ? mapaSubDoc.get(t.substituidoPorCod) ?? '' : '',
          modalidade: label(MODALIDADE_PAGAMENTO_LABEL, t.modalidadePagamento),
          banco: t.bancoPagadorNome ?? '',
          agencia: t.bancoPagadorAgencia ?? '',
          conta: t.bancoPagadorConta ?? '',
          bordero: t.pagamentoDoc ?? '',
          remessa: t.numeroRemessa ?? '',
        });
      }

      // -------- estilo compartilhado --------
      const FONTE = { name: 'Calibri', size: 10 } as const;
      const VERDE = 'FF1F4E3D';
      const VERDE_CLARO = 'FFEAF1EE';
      const ZEBRA = 'FFF6F8F7';
      const MOEDA_FMT = 'R$ #,##0.00';
      const COLS_MOEDA = ['bruto', 'ret', 'apagar'];

      // Cabeçalho: negrito, fonte branca, fundo verde Pioneira, centralizado.
      const header = ws.getRow(1);
      header.font = { ...FONTE, bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
      header.alignment = { vertical: 'middle', horizontal: 'center' };
      header.height = 22;

      // Formato moeda/data + alinhamento das colunas numéricas.
      COLS_MOEDA.forEach((k) => {
        ws.getColumn(k).numFmt = MOEDA_FMT;
        ws.getColumn(k).alignment = { horizontal: 'right' };
      });
      ['emissao', 'entrada', 'venc', 'pag', 'libem'].forEach((k) => {
        ws.getColumn(k).numFmt = 'dd/mm/yyyy';
        ws.getColumn(k).alignment = { horizontal: 'center' };
      });

      // Corpo: fonte base, zebra, bordas suaves; substituídas em âmbar + tachado.
      ws.eachRow((row, n) => {
        if (n === 1) return;
        row.height = 16;
        const subst = row.getCell('subst').value === 'SIM';
        row.eachCell((cell) => {
          cell.font = subst ? { ...FONTE, color: { argb: 'FF8A6D00' }, strike: true } : { ...FONTE };
          cell.border = { bottom: { style: 'thin', color: { argb: 'FFE6ECEA' } } };
          if (subst) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
          else if (n % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
        });
      });

      // Totais gerais (reaproveitados na aba Resumo).
      const totalBruto = rows.reduce((s, t) => s + Number(t.valorBrutoCents), 0);
      const totalRet = rows.reduce((s, t) => s + retDe(t), 0);
      const totalAPagar = rows.reduce((s, t) => s + (Number(t.valorLiquidoCents) - retDe(t)), 0);

      // Linha de total no rodapé da lista.
      const linhaTotal = ws.addRow({
        fornecedor: `TOTAL — ${rows.length} título(s)`,
        bruto: reais(totalBruto),
        ret: reais(totalRet),
        apagar: reais(totalAPagar),
      });
      linhaTotal.eachCell((cell) => {
        cell.font = { ...FONTE, bold: true };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE_CLARO } };
        cell.border = { top: { style: 'medium', color: { argb: VERDE } } };
      });
      COLS_MOEDA.forEach((k) => { ws.getCell(linhaTotal.number, ws.getColumn(k).number).numFmt = MOEDA_FMT; });

      // Autofiltro no cabeçalho.
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };

      // ======================= ABA 2: RESUMO =======================
      const resumo = wb.addWorksheet('Resumo');
      resumo.columns = [
        { key: 'a', width: 40 },
        { key: 'b', width: 12 },
        { key: 'c', width: 20 },
      ];

      const tit = resumo.addRow(['Resumo — Contas a Pagar']);
      tit.font = { ...FONTE, bold: true, size: 14, color: { argb: VERDE } };
      const periodoTxt = [query.dtIni, query.dtFim].filter(Boolean).join(' a ');
      resumo.addRow([periodoTxt ? `Período (vencimento): ${periodoTxt}` : 'Todos os períodos']).font = {
        ...FONTE, italic: true, color: { argb: 'FF6B7280' },
      };
      resumo.addRow(['Títulos rateados são contados na unidade de maior valor (dominante).']).font = {
        ...FONTE, italic: true, size: 9, color: { argb: 'FF9AA3A0' },
      };

      // Filtros aplicados: deixa explícito no resumo SOBRE O QUE os totais foram
      // calculados (o resumo já roda sobre as linhas filtradas). Só lista o que
      // estiver ativo — "quando não tem filtro, não polui".
      const filtrosTxt: string[] = [];
      const pagTxt = [query.dtPagIni, query.dtPagFim].filter(Boolean).join(' a ');
      if (pagTxt) filtrosTxt.push(`Pagamento: ${pagTxt}`);
      if (query.remessa?.trim()) filtrosTxt.push(`Remessa: ${query.remessa.trim()}`);
      if (query.search?.trim()) filtrosTxt.push(`Busca: "${query.search.trim()}"`);
      if (query.status?.trim()) filtrosTxt.push(`Status: ${query.status.trim()}`);
      if (query.origem?.trim()) filtrosTxt.push(`Origem: ${query.origem.trim()}`);
      if (query.setores?.trim()) filtrosTxt.push(`Setores: ${query.setores.trim().split(',').length} selecionado(s)`);
      if (query.substituido && query.substituido !== 'todos') {
        filtrosTxt.push(`Substituição: ${query.substituido === 'validos' ? 'pagos de verdade' : 'substituídos'}`);
      }
      if (query.valorMinCents != null) filtrosTxt.push(`Valor min: R$ ${reais(query.valorMinCents).toFixed(2)}`);
      if (query.valorMaxCents != null) filtrosTxt.push(`Valor max: R$ ${reais(query.valorMaxCents).toFixed(2)}`);
      if (query.somenteVencidos) filtrosTxt.push('Apenas vencidos em aberto');
      if (filtrosTxt.length > 0) {
        resumo.addRow([`Filtros aplicados: ${filtrosTxt.join(' · ')}`]).font = {
          ...FONTE, italic: true, size: 9, color: { argb: 'FF6B7280' },
        };
      }

      resumo.addRow([]);

      // Agrupa as linhas (em memória) por uma chave, somando "a pagar".
      const agrupar = (
        keyFn: (t: ContaPagar) => string,
      ): Array<{ chave: string; qtd: number; cents: number }> => {
        const m = new Map<string, { qtd: number; cents: number }>();
        for (const t of rows) {
          const k = keyFn(t) || '—';
          const cur = m.get(k) ?? { qtd: 0, cents: 0 };
          cur.qtd += 1;
          cur.cents += Number(t.valorLiquidoCents) - retDe(t);
          m.set(k, cur);
        }
        return [...m.entries()]
          .map(([chave, v]) => ({ chave, qtd: v.qtd, cents: v.cents }))
          .sort((x, y) => y.cents - x.cents);
      };

      const fundoVerde = (rowNum: number): void => {
        for (let c = 1; c <= 3; c++) {
          resumo.getCell(rowNum, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
        }
      };

      const escreverBloco = (
        titulo: string,
        rotulo: string,
        dados: Array<{ chave: string; qtd: number; cents: number }>,
      ): void => {
        const cab1 = resumo.addRow([titulo]);
        cab1.font = { ...FONTE, bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
        fundoVerde(cab1.number);
        const cab2 = resumo.addRow([rotulo, 'Qtd', 'Valor a pagar']);
        cab2.eachCell((cell) => {
          cell.font = { ...FONTE, bold: true };
          cell.border = { bottom: { style: 'thin', color: { argb: VERDE } } };
        });
        dados.forEach((d, i) => {
          const r = resumo.addRow([d.chave, d.qtd, reais(d.cents)]);
          r.eachCell((cell) => {
            cell.font = { ...FONTE };
            if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
          });
          resumo.getCell(r.number, 2).alignment = { horizontal: 'center' };
          resumo.getCell(r.number, 3).numFmt = MOEDA_FMT;
          resumo.getCell(r.number, 3).alignment = { horizontal: 'right' };
        });
        const sub = resumo.addRow([
          'Subtotal',
          dados.reduce((s, d) => s + d.qtd, 0),
          reais(dados.reduce((s, d) => s + d.cents, 0)),
        ]);
        sub.eachCell((cell) => {
          cell.font = { ...FONTE, bold: true };
          cell.border = { top: { style: 'thin', color: { argb: 'FFCBD5D0' } } };
        });
        resumo.getCell(sub.number, 2).alignment = { horizontal: 'center' };
        resumo.getCell(sub.number, 3).numFmt = MOEDA_FMT;
        resumo.getCell(sub.number, 3).alignment = { horizontal: 'right' };
        resumo.addRow([]);
      };

      escreverBloco('Por Setor (centro de custo)', 'Setor', agrupar((t) => t.setorNome ?? 'Sem setor'));
      escreverBloco('Por Status', 'Status', agrupar((t) => STATUS_PT[t.status] ?? t.status));
      escreverBloco(
        'Por Origem',
        'Origem',
        agrupar((t) => label(ORIGEM_DOCUMENTO_CP_LABELS as Record<string, string>, t.origemDocumento) || 'Não identificada'),
      );

      // Por CONTA CONTÁBIL (natureza da despesa): soma os ITENS de cada título por conta.
      // Exclui substituídos (fora dos totais) pra não dobrar (NF substituída + Boleto).
      const contasAgg = (() => {
        const m = new Map<string, { qtd: number; cents: number }>();
        for (const t of rows) {
          if (t.substituido) continue;
          for (const c of t.rateioContas ?? []) {
            const k = c.nome ?? c.classificador;
            const cur = m.get(k) ?? { qtd: 0, cents: 0 };
            cur.qtd += 1;
            cur.cents += c.valorCents;
            m.set(k, cur);
          }
        }
        return [...m.entries()]
          .map(([chave, v]) => ({ chave, qtd: v.qtd, cents: v.cents }))
          .sort((a, b) => b.cents - a.cents);
      })();
      if (contasAgg.length > 0) {
        escreverBloco('Por Conta Contábil (natureza da despesa)', 'Conta', contasAgg);
      }

      const totalGeral = resumo.addRow(['TOTAL GERAL', rows.length, reais(totalAPagar)]);
      totalGeral.font = { ...FONTE, bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
      fundoVerde(totalGeral.number);
      resumo.getCell(totalGeral.number, 2).alignment = { horizontal: 'center' };
      resumo.getCell(totalGeral.number, 3).numFmt = MOEDA_FMT;
      resumo.getCell(totalGeral.number, 3).alignment = { horizontal: 'right' };

      // ===================== ABA 3: ITENS POR CONTA =====================
      // Detalhe item-a-item por conta contábil, SÓ dos títulos com 2+ contas (onde o
      // valor é a SOMA de naturezas diferentes — o que o financeiro pediu pra detalhar).
      // Inclui substituídos (marcados): a quebra costuma morar na NF substituída.
      const comMultiplasContas = rows.filter((t) => (t.rateioContas?.length ?? 0) > 1);
      if (comMultiplasContas.length > 0) {
        const wsItens = wb.addWorksheet('Itens por conta', { views: [{ state: 'frozen', ySplit: 1 }] });
        wsItens.columns = [
          { header: 'Fornecedor', key: 'fornecedor', width: 40 },
          { header: 'Documento', key: 'doc', width: 16 },
          { header: 'Parcela', key: 'parcela', width: 9 },
          { header: 'Tipo', key: 'tipo', width: 14 },
          { header: 'Substituído', key: 'subst', width: 12 },
          { header: 'Conta (código)', key: 'conta', width: 18 },
          { header: 'Natureza da despesa', key: 'natureza', width: 34 },
          { header: 'Valor do item', key: 'valor', width: 15 },
        ];
        for (const t of comMultiplasContas) {
          for (const c of t.rateioContas ?? []) {
            wsItens.addRow({
              fornecedor: t.fornecedor?.razaoSocial ?? t.favorecidoNome ?? '-',
              doc: t.numeroDocumento ?? '',
              parcela: t.numeroParcela ?? '',
              tipo: label(TIPO_DOCUMENTO_LABEL, t.tipoDocumento),
              subst: t.substituido ? 'SIM' : 'Não',
              conta: c.classificador,
              natureza: c.nome ?? '',
              valor: reais(c.valorCents),
            });
          }
        }
        const hdrItens = wsItens.getRow(1);
        hdrItens.font = { ...FONTE, bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
        hdrItens.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
        hdrItens.alignment = { vertical: 'middle', horizontal: 'center' };
        hdrItens.height = 22;
        wsItens.getColumn('valor').numFmt = MOEDA_FMT;
        wsItens.getColumn('valor').alignment = { horizontal: 'right' };
        wsItens.eachRow((row, n) => {
          if (n === 1) return;
          row.height = 16;
          const subst = row.getCell('subst').value === 'SIM';
          row.eachCell((cell) => {
            cell.font = subst ? { ...FONTE, color: { argb: 'FF8A6D00' } } : { ...FONTE };
            cell.border = { bottom: { style: 'thin', color: { argb: 'FFE6ECEA' } } };
            if (subst) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
            else if (n % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
          });
        });
        wsItens.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: wsItens.columnCount } };
      }

      const buffer = Buffer.from(await wb.xlsx.writeBuffer());
      const partes = [query.dtIni, query.dtFim, query.dtPagIni, query.dtPagFim].filter((p): p is string => !!p);
      const sufixo = partes.length > 0 ? partes.join('_') : 'todos';
      return { buffer, filename: `contas-pagar-${sufixo}.xlsx` };
    },
  };
}

export type ContasPagarService = ReturnType<typeof buildContasPagarService>;
