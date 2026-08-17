import type { FastifyInstance } from 'fastify';
import type {
  DetalheOrigemQuery,
  DetalheOrigemResponse,
  RecebiveisContasResponse,
  RecebiveisListQuery,
  RecebiveisListResponse,
  RecebivelComposicaoItem,
  RecebivelDetalheResponse,
  RecebivelDistribuicaoDia,
  RecebivelItem,
  RecebivelOrigem,
  SumarioRecebiveisQuery,
  SumarioRecebiveisResponse,
  SyncExtratoBody,
  SyncExtratoResponse,
} from '@pioneira/shared';
import { BancoConta } from '@/entities/banco-conta.entity.js';
import { BancoMovto } from '@/entities/banco-movto.entity.js';
import { Conciliacao } from '@/entities/conciliacao.entity.js';
import { buildGlobusBcomovtoAdapter } from '@/integrations/globus/globus-bcomovto.adapter.js';
import { buildBancoMovtoEtl } from '@/etl/banco-movto.etl.js';

/**
 * Recebíveis — dinheiro que entrou no extrato (`banco_movto`, créditos),
 * classificado por origem em tempo de consulta (sem coluna nova / migration):
 *   - gdf      → eh_repasse_brb (repasse BRB Mobilidade, flag já validada);
 *   - clientes → crédito conciliado a um título de Contas a Receber (confirmado);
 *   - outras   → o restante, agrupado pela descrição do histórico bancário.
 *
 * Créditos sem sentido D/C no Globus (debito_credito nulo) ficam de fora do total
 * e são sinalizados à parte — "quando não tem dado, o sistema diz que não tem".
 */

// Crédito conciliado a um CR confirmado = "veio de cliente".
const CLIENTES_EXISTS =
  "EXISTS (SELECT 1 FROM finance.conciliacoes cc " +
  "WHERE cc.banco_movto_id = m.id AND cc.status = 'confirmado' AND cc.conta_receber_id IS NOT NULL)";

// NÃO é receita nova (dinheiro que não é faturamento da operação): transferência
// entre contas de mesma titularidade, resgate/aplicação de investimento, estorno
// (DOC/cheque devolvido) E entrada de DÍVIDA (empréstimo / capital de giro /
// financiamento — entra na conta mas tem que ser devolvido, não é receita).
// Heurística pelo histórico bancário (desc_histo_bco), validada contra os créditos
// reais de jun/2026 (incl. "EMPRESTIMO DE CAPITAL DE GIRO BANCO GENIAL" = R$2,65M,
// que antes caía em "outras" como se fosse receita).
const TRANSFER_COND =
  "(m.desc_histo_bco ILIKE '%TITULARIDADE%' " +
  "OR m.desc_histo_bco ILIKE '%APLICA%' " +
  "OR m.desc_histo_bco ILIKE '%DEVOLVID%' " +
  "OR m.desc_histo_bco ILIKE '%EMPREST%' " +
  "OR m.desc_histo_bco ILIKE '%CAPITAL DE GIRO%' " +
  "OR m.desc_histo_bco ILIKE '%FINANCIAMENTO%')";

// Alguns códigos de histórico bancário (BCOHISTO) são, por natureza, "não
// receita" e o texto não os pega: recuperação de despesa / estorno. Classificar
// pelo CÓDIGO é mais firme que caçar palavra em texto livre.
//   780 = DEPÓSITO DE RECUPERAÇÃO DE DESPESAS (ex.: estorno de cartão corporativo).
// 523 (DEPÓSITO CONF RECIBO) fica de fora por enquanto — ambíguo, em validação.
const HIST_NAO_RECEITA = [780];
const HIST_NAO_RECEITA_COND = `m.cod_histo_bco IN (${HIST_NAO_RECEITA.join(', ')})`;

// "Não é receita nova" = heurística de texto OU código de histórico conhecido.
const NAO_RECEITA_COND = `(${TRANSFER_COND} OR ${HIST_NAO_RECEITA_COND})`;

// Expressão de origem reutilizada em SELECT e WHERE.
const ORIGEM_CASE =
  `CASE WHEN m.eh_repasse_brb THEN 'gdf' ` +
  `WHEN ${CLIENTES_EXISTS} THEN 'clientes' ` +
  `WHEN ${NAO_RECEITA_COND} THEN 'transferencias' ELSE 'outras' END`;

/** Filtro SQL de UMA origem, respeitando a prioridade do CASE acima. */
function origemWhere(origem: RecebivelOrigem): string {
  switch (origem) {
    case 'gdf': return 'm.eh_repasse_brb';
    case 'clientes': return `NOT m.eh_repasse_brb AND ${CLIENTES_EXISTS}`;
    case 'transferencias': return `NOT m.eh_repasse_brb AND NOT ${CLIENTES_EXISTS} AND ${NAO_RECEITA_COND}`;
    case 'outras': return `NOT m.eh_repasse_brb AND NOT ${CLIENTES_EXISTS} AND NOT ${NAO_RECEITA_COND}`;
  }
}

interface OrigemRow { origem: RecebivelOrigem; qtd: string; valor_cents: string }
interface OutraRow { descricao: string | null; qtd: string; valor_cents: string }
interface SemSentidoRow { qtd: string; valor_cents: string }
interface ItemRow {
  id: string;
  data_movto: string;
  valor_cents: string;
  origem: RecebivelOrigem;
  desc_histo_bco: string | null;
  hist_movto_bco: string | null;
  doc_movto_bco: string | null;
  cod_banco: number;
  cod_agencia: number;
  cod_conta_bco: string;
  nome_amigavel: string | null;
  nome_conta_bco: string | null;
  conciliado: boolean;
}

/** Mesma regra do NAO_RECEITA_COND/ORIGEM_CASE, em JS (pro detalhe de 1 lançamento). */
function ehTransferencia(descHistoBco: string | null, codHistoBco: number | null): boolean {
  if (codHistoBco != null && HIST_NAO_RECEITA.includes(codHistoBco)) return true;
  return /TITULARIDADE|APLICA|DEVOLVID|EMPREST|CAPITAL DE GIRO|FINANCIAMENTO/i.test(descHistoBco ?? '');
}

// Rótulos dos tipos de receita do repasse GDF (CRCTPREC). Fallback legível
// enquanto o mestre finance.tipos_receita não tem a descrição sincronizada
// (hoje só placeholder '(sync pendente)' — a query CRCTPREC existe mas não roda).
const ROTULO_TP_RECEITA: Record<string, string> = {
  '40005': 'Receita de pagante em espécie',
  '40006': 'Receita de VT e Cidadão (tarifa do usuário)',
  '40012': 'Receita de PLE (estudante)',
  '40018': 'Receita de PNE (especial)',
  '40019': 'Complemento tarifário em dinheiro',
  '40020': 'Complemento tarifário em VT',
  '40021': 'Complemento tarifário cartão Cidadão',
  '40022': 'Complemento gratuidade — Estudante (PLE)',
  '40023': 'Complemento gratuidade — Especial (PNE)',
  '40027': 'Receita de cartão D/C EMV contactless',
};

/** Descrição sincronizada (se real) senão o mapa conhecido do repasse senão o código. */
function rotuloTipoReceita(cod: string | null, descricao: string | null): string | null {
  if (descricao && descricao !== '(sync pendente)') return descricao;
  if (cod && ROTULO_TP_RECEITA[cod]) return ROTULO_TP_RECEITA[cod];
  return descricao ?? null;
}

export function buildRecebiveisService(fastify: FastifyInstance) {
  const movtoRepo = fastify.db.getRepository(BancoMovto);
  const contaRepo = fastify.db.getRepository(BancoConta);
  const conciliacaoRepo = fastify.db.getRepository(Conciliacao);
  const bcomovtoAdapter = buildGlobusBcomovtoAdapter(fastify);
  const bancoMovtoEtl = buildBancoMovtoEtl(fastify);

  /**
   * Monta o filtro de conta (banco/agência/conta) a partir do id do cadastro.
   * Devolve o trecho SQL + os params, ou vazio quando não há filtro. Lança 404
   * quando o id não existe (em vez de silenciosamente ignorar).
   */
  async function filtroConta(
    contaId: string | undefined,
    params: unknown[],
  ): Promise<string> {
    if (!contaId) return '';
    const conta = await contaRepo.findOne({ where: { id: contaId } });
    if (!conta) throw fastify.httpErrors.notFound('Conta bancária não encontrada');
    params.push(conta.codBanco, conta.codAgencia, conta.codContaBco);
    return ` AND m.cod_banco = $${params.length - 2} AND m.cod_agencia = $${params.length - 1} AND m.cod_conta_bco = $${params.length}`;
  }

  return {
    async sumario(query: SumarioRecebiveisQuery): Promise<SumarioRecebiveisResponse> {
      // ---- por origem (só créditos com sentido definido) ----
      const pOrigem: unknown[] = [query.dtIni, query.dtFim];
      const fOrigem = await filtroConta(query.contaId, pOrigem);
      const porOrigemRows = await movtoRepo.query<OrigemRow[]>(
        `SELECT ${ORIGEM_CASE} AS origem,
                COUNT(*)::text AS qtd,
                COALESCE(SUM(m.valor_cents), 0)::text AS valor_cents
           FROM finance.banco_movto m
          WHERE m.excluido_em IS NULL
            AND m.debito_credito = 'C'
            AND m.data_movto BETWEEN $1::date AND $2::date${fOrigem}
          GROUP BY 1`,
        pOrigem,
      );

      const porOrigem = porOrigemRows.map((r) => ({
        origem: r.origem,
        qtd: Number(r.qtd),
        valorCents: Number(r.valor_cents),
      }));
      // Total = só RECEITA real (exclui movimentação entre contas próprias).
      const receita = porOrigem.filter((o) => o.origem !== 'transferencias');
      const totalRecebidoCents = receita.reduce((s, o) => s + o.valorCents, 0);
      const qtd = receita.reduce((s, o) => s + o.qtd, 0);

      // ---- créditos sem sentido D/C (transparência: não entram no total) ----
      const pSem: unknown[] = [query.dtIni, query.dtFim];
      const fSem = await filtroConta(query.contaId, pSem);
      const semRows = await movtoRepo.query<SemSentidoRow[]>(
        `SELECT COUNT(*)::text AS qtd, COALESCE(SUM(m.valor_cents), 0)::text AS valor_cents
           FROM finance.banco_movto m
          WHERE m.excluido_em IS NULL
            AND m.debito_credito IS NULL
            AND m.data_movto BETWEEN $1::date AND $2::date${fSem}`,
        pSem,
      );
      const sem = semRows[0] ?? { qtd: '0', valor_cents: '0' };

      // ---- frescor do extrato (independe do período consultado) ----
      // Até que data temos lançamento e quando foi o último sync, pra conta
      // filtrada. Serve pra tela avisar quando o período pedido vai ALÉM do que
      // está sincronizado — senão um total pela metade parece o total inteiro.
      const pFresh: unknown[] = [];
      const fFresh = await filtroConta(query.contaId, pFresh);
      const freshRows = await movtoRepo.query<{ ultimo_sync: string | null; ate_data: string | null }[]>(
        `SELECT MAX(m.ultimo_sync_em)::text AS ultimo_sync,
                MAX(m.data_movto)::text     AS ate_data
           FROM finance.banco_movto m
          WHERE m.excluido_em IS NULL${fFresh}`,
        pFresh,
      );
      const fresh = freshRows[0] ?? { ultimo_sync: null, ate_data: null };

      return {
        totalRecebidoCents,
        qtd,
        porOrigem,
        semSentidoQtd: Number(sem.qtd),
        semSentidoCents: Number(sem.valor_cents),
        extratoAteData: fresh.ate_data ?? null,
        ultimoSyncEm: fresh.ultimo_sync ? new Date(fresh.ultimo_sync).toISOString() : null,
      };
    },

    /**
     * Detalhe de UMA origem (pro modal): os tipos de lançamento (histórico
     * bancário) que compõem aquela origem, do maior valor pro menor. Sem
     * ranking/pódio — é só o detalhamento da composição.
     */
    async detalheOrigem(query: DetalheOrigemQuery): Promise<DetalheOrigemResponse> {
      const params: unknown[] = [query.dtIni, query.dtFim];
      const fConta = await filtroConta(query.contaId, params);
      const fontesRows = await movtoRepo.query<OutraRow[]>(
        `SELECT m.desc_histo_bco AS descricao,
                COUNT(*)::text AS qtd,
                COALESCE(SUM(m.valor_cents), 0)::text AS valor_cents
           FROM finance.banco_movto m
          WHERE m.excluido_em IS NULL
            AND m.debito_credito = 'C'
            AND m.data_movto BETWEEN $1::date AND $2::date${fConta}
            AND ${origemWhere(query.origem)}
          GROUP BY m.desc_histo_bco
          ORDER BY SUM(m.valor_cents) DESC`,
        params,
      );
      const fontes = fontesRows.map((r) => ({
        descricao: r.descricao,
        qtd: Number(r.qtd),
        valorCents: Number(r.valor_cents),
      }));
      return {
        origem: query.origem,
        totalCents: fontes.reduce((s, f) => s + f.valorCents, 0),
        qtd: fontes.reduce((s, f) => s + f.qtd, 0),
        fontes,
      };
    },

    async listar(query: RecebiveisListQuery): Promise<RecebiveisListResponse> {
      const pagina = query.pagina ?? 1;
      const porPagina = query.porPagina ?? 50;
      const offset = (pagina - 1) * porPagina;

      // WHERE base compartilhado entre count e página.
      const params: unknown[] = [query.dtIni, query.dtFim];
      let where =
        `m.excluido_em IS NULL AND m.debito_credito = 'C' ` +
        `AND m.data_movto BETWEEN $1::date AND $2::date`;
      where += await filtroConta(query.contaId, params);

      if (query.origem) {
        params.push(query.origem);
        where += ` AND (${ORIGEM_CASE}) = $${params.length}`;
      }
      if (query.busca?.trim()) {
        params.push(`%${query.busca.trim()}%`);
        const i = params.length;
        where += ` AND (m.desc_histo_bco ILIKE $${i} OR m.hist_movto_bco ILIKE $${i} OR m.doc_movto_bco ILIKE $${i})`;
      }

      const totalRows = await movtoRepo.query<{ total: string }[]>(
        `SELECT COUNT(*)::text AS total
           FROM finance.banco_movto m
          WHERE ${where}`,
        params,
      );
      const total = Number(totalRows[0]?.total ?? 0);

      const pageParams = [...params, porPagina, offset];
      const rows = await movtoRepo.query<ItemRow[]>(
        `SELECT m.id, m.data_movto::text, m.valor_cents::text,
                ${ORIGEM_CASE} AS origem,
                m.desc_histo_bco, m.hist_movto_bco, m.doc_movto_bco,
                m.cod_banco, m.cod_agencia, m.cod_conta_bco, m.conciliado,
                bc.nome_amigavel, bc.nome_conta_bco
           FROM finance.banco_movto m
           LEFT JOIN finance.banco_conta bc
             ON bc.cod_banco = m.cod_banco
            AND bc.cod_agencia = m.cod_agencia
            AND bc.cod_conta_bco = m.cod_conta_bco
            AND bc.excluido_em IS NULL
          WHERE ${where}
          ORDER BY m.data_movto DESC, m.cod_movto_bco DESC
          LIMIT $${pageParams.length - 1} OFFSET $${pageParams.length}`,
        pageParams,
      );

      const itens: RecebivelItem[] = rows.map((r) => ({
        id: r.id,
        dataMovto: r.data_movto,
        valorCents: Number(r.valor_cents),
        origem: r.origem,
        descHistoBco: r.desc_histo_bco,
        histMovtoBco: r.hist_movto_bco ? r.hist_movto_bco.slice(0, 200) : null,
        docMovtoBco: r.doc_movto_bco,
        codBanco: r.cod_banco,
        codAgencia: r.cod_agencia,
        codContaBco: r.cod_conta_bco,
        contaNome: r.nome_amigavel ?? r.nome_conta_bco ?? null,
        conciliado: r.conciliado === true,
      }));

      return {
        itens,
        total,
        pagina,
        porPagina,
        totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
      };
    },

    /** Contas bancárias para o filtro (principais primeiro). */
    async contas(): Promise<RecebiveisContasResponse> {
      const contas = await contaRepo
        .createQueryBuilder('bc')
        .where('bc.excluido_em IS NULL')
        .orderBy('bc.eh_principal', 'DESC')
        .addOrderBy('bc.nome_conta_bco', 'ASC')
        .getMany();
      return {
        itens: contas.map((bc) => ({
          id: bc.id,
          codBanco: bc.codBanco,
          codAgencia: bc.codAgencia,
          codContaBco: bc.codContaBco,
          nome: bc.nomeAmigavel ?? bc.nomeContaBco,
          ehPrincipal: bc.ehPrincipal,
        })),
      };
    },

    /** Detalhe de UM lançamento (modal da linha): tudo do extrato + cliente/título casado. */
    async detalhe(id: string): Promise<RecebivelDetalheResponse> {
      const m = await movtoRepo.findOne({ where: { id } });
      if (!m || m.excluidoEm) throw fastify.httpErrors.notFound('Lançamento não encontrado');

      const conta = await contaRepo.findOne({
        where: { codBanco: m.codBanco, codAgencia: m.codAgencia, codContaBco: m.codContaBco },
      });

      // Conciliação confirmada -> título de Contas a Receber (e cliente).
      const conc = await conciliacaoRepo.findOne({
        where: { bancoMovtoId: id, status: 'confirmado' },
        relations: ['contaReceber', 'contaReceber.cliente'],
      });
      const cr = conc?.contaReceberId ? conc.contaReceber ?? null : null;

      // Origem (mesma prioridade do ORIGEM_CASE).
      let origem: RecebivelOrigem;
      if (m.ehRepasseBrb) origem = 'gdf';
      else if (cr) origem = 'clientes';
      else if (ehTransferencia(m.descHistoBco, m.codHistoBco)) origem = 'transferencias';
      else origem = 'outras';

      // Composição do repasse por tipo de receita (só GDF): o número "AD-xxxx"
      // no histórico do banco casa 1:1 com contas_receber.numero_documento
      // (= NRODOCTOCRC), cujos itens trazem o CODTPRECEITA. 100% snapshot local —
      // não lê o Oracle em runtime. Vazio se não achar o AD ou o título não
      // estiver sincronizado (aí a tela simplesmente não mostra — não inventa).
      // Número do título AD do repasse (ex.: "AD-0004581"), extraído do histórico.
      // Fica disponível MESMO quando a composição não casa — pra a tela explicar de
      // onde viria a quebra e o que falta (sincronizar o Contas a Receber).
      const adMatch = m.ehRepasseBrb ? /AD-\d+/i.exec(`${m.histMovtoBco ?? ''} ${m.docMovtoBco ?? ''}`) : null;
      const repasseAd = adMatch ? adMatch[0].toUpperCase() : null;

      let composicao: RecebivelComposicaoItem[] = [];
      if (m.ehRepasseBrb) {
        const ad = repasseAd;
        if (ad) {
          const compRows = await movtoRepo.query<{ cod: string | null; descricao: string | null; valor_cents: string }[]>(
            `SELECT it.cod_tp_receita AS cod,
                    tr.descricao       AS descricao,
                    COALESCE(SUM(it.valor_cents), 0)::text AS valor_cents
               FROM finance.contas_receber cr2
               JOIN finance.contas_receber_itens it ON it.conta_receber_id = cr2.id
               LEFT JOIN finance.tipos_receita tr ON tr.cod_tp_receita = it.cod_tp_receita
              WHERE cr2.numero_documento = $1 AND cr2.excluido_em IS NULL
              GROUP BY it.cod_tp_receita, tr.descricao
              ORDER BY SUM(it.valor_cents) DESC`,
            [ad],
          );
          composicao = compRows.map((r) => ({
            codTpReceita: r.cod,
            descricao: rotuloTipoReceita(r.cod, r.descricao),
            valorCents: Number(r.valor_cents),
          }));
        }
      }

      // A que dias de TRANSPORTE este repasse se refere. A apuração diária do GDF
      // (AD) quita o que foi RESGATADO num dia; esse resgate é rodagem de dias
      // anteriores (tipicamente T+1). Cruza a matriz BRB (recebivel_gdf_celula)
      // pela data de resgate = data de crédito do repasse (senão a do movimento).
      // 100% snapshot local. Vazio se não é repasse ou a matriz não cobre o dia
      // (a tela então não mostra — "não inventa"). A matriz é BILHETAGEM: serve de
      // PESO/distribuição, não bate ao centavo com o repasse (que é tarifa técnica).
      const resgateEm = m.ehRepasseBrb ? (m.dataCredito ?? m.dataMovto) : null;
      let distribuicaoTransporte: RecebivelDistribuicaoDia[] = [];
      if (resgateEm) {
        const diaRows = await movtoRepo.query<{ data_transporte: string; valor_cents: string; creditos: string }[]>(
          `SELECT c.data_transporte::text AS data_transporte,
                  COALESCE(SUM(c.valor_cents), 0)::text AS valor_cents,
                  COALESCE(SUM(c.creditos), 0)::text    AS creditos
             FROM finance.recebivel_gdf_celula c
            WHERE c.data_resgate = $1::date AND c.excluido_em IS NULL
            GROUP BY c.data_transporte
            ORDER BY SUM(c.valor_cents) DESC`,
          [resgateEm],
        );
        const totalDist = diaRows.reduce((s, r) => s + Number(r.valor_cents), 0);
        const resgateMs = new Date(`${resgateEm}T00:00:00Z`).getTime();
        distribuicaoTransporte = diaRows.map((r) => {
          const v = Number(r.valor_cents);
          const dias = Math.round((resgateMs - new Date(`${r.data_transporte}T00:00:00Z`).getTime()) / 86400000);
          return {
            dataTransporte: r.data_transporte,
            diasDefasagem: Number.isFinite(dias) ? dias : null,
            creditos: Number(r.creditos),
            valorCents: v,
            percDoResgate: totalDist > 0 ? Number(((v / totalDist) * 100).toFixed(1)) : 0,
          };
        });
      }

      return {
        id: m.id,
        dataMovto: m.dataMovto,
        dataEfetiva: m.dataEfetiva,
        dataCredito: m.dataCredito,
        valorCents: Number(m.valorCents),
        origem,
        descHistoBco: m.descHistoBco,
        histMovtoBco: m.histMovtoBco,
        docMovtoBco: m.docMovtoBco,
        codHistoBco: m.codHistoBco,
        debitoCredito: m.debitoCredito,
        codBanco: m.codBanco,
        codAgencia: m.codAgencia,
        codContaBco: m.codContaBco,
        contaNome: conta ? conta.nomeAmigavel ?? conta.nomeContaBco : null,
        conciliado: m.conciliado,
        confirmado: m.confirmado,
        statusMovto: m.statusMovto,
        codTpReceita: m.codTpReceita,
        origemIdExterno: m.origemIdExterno,
        ultimoSyncEm: m.ultimoSyncEm ? m.ultimoSyncEm.toISOString() : null,
        cliente: cr?.cliente
          ? { razaoSocial: cr.cliente.razaoSocial, numeroInscricao: cr.cliente.numeroInscricao }
          : null,
        tituloNumeroDocumento: cr?.numeroDocumento ?? null,
        repasseAd,
        composicao,
        resgateEm,
        distribuicaoTransporte,
      };
    },

    /**
     * Atualiza o extrato (banco_movto) puxando BCOMOVTO do Globus + ETL — mesmo
     * "lado banco" que o sync do Recebíveis GDF dispara. Sem janela = mês corrente
     * (regra empresa=4 + mês atual; histórico é carga manual em lote).
     */
    async sincronizarExtrato(body: SyncExtratoBody, usuarioId: string): Promise<SyncExtratoResponse> {
      const hoje = new Date();
      const dtInicio = body.dtIni
        ? new Date(`${body.dtIni}T00:00:00Z`)
        : new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
      const dtFimExclusivo = body.dtFim
        ? new Date(`${body.dtFim}T00:00:00Z`)
        : new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 1));

      const syncBanco = await bcomovtoAdapter.sincronizar({
        empresa: fastify.config.globus.empresaId,
        dtInicio,
        dtFimExclusivo,
        usuarioId,
      });

      let gravados = 0;
      let repassesBrb = 0;
      let etlMs = 0;
      if (syncBanco.status !== 'erro') {
        const etl = await bancoMovtoEtl.processarPendentes({ limite: 10000 });
        gravados = etl.gravados;
        repassesBrb = etl.repassesBrb;
        etlMs = etl.duracaoMs;
      }

      return {
        status: syncBanco.status,
        registrosLidos: syncBanco.registrosLidos,
        gravados,
        repassesBrb,
        duracaoMs: syncBanco.duracaoMs + etlMs,
        mensagem: syncBanco.mensagem,
      };
    },
  };
}

export type RecebiveisService = ReturnType<typeof buildRecebiveisService>;
