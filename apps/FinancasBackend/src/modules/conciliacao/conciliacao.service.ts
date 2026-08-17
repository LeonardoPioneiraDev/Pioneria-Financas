import type { FastifyInstance } from 'fastify';
import type {
  ConciliacaoCandidatosResponse,
  ConciliacaoDashboard,
  ConciliacaoResponse,
  ConciliacoesListResponse,
  ContasBancariasResponse,
  ExtratoMensalQuery,
  ExtratoMensalResponse,
  MovimentosQuery,
  MovimentosResponse,
  MovtoBancoResumo,
  SemParResponse,
  SugerirAgregacaoResponse,
  SugerirResponse,
  TituloCandidato,
  TituloResumo,
  TituloVinculado,
} from '@pioneira/shared';
import { BancoConta } from '@/entities/banco-conta.entity.js';
import { BancoMovto } from '@/entities/banco-movto.entity.js';
import { ContaPagar } from '@/entities/conta-pagar.entity.js';
import { ContaReceber } from '@/entities/conta-receber.entity.js';
import { Conciliacao, type ConciliacaoStatus } from '@/entities/conciliacao.entity.js';
import { GLOBUS_QUERIES } from '@/integrations/globus/globus.queries.js';
import { buildGlobusCpAdapter } from '@/integrations/globus/globus-cp.adapter.js';
import { buildContasPagarEtl } from '@/etl/contas-pagar.etl.js';

const TOLERANCIA_DIAS = 3;

/**
 * Um lançamento tem TÍTULO de CP ligado pela chave do Globus
 * (CPGDOCTO.CODMOVTOBCO → banco_movto.cod_movto_bco). Alias do movto = `m`.
 */
const TEM_CP_POR_CODMOVTO_SQL =
  'EXISTS (SELECT 1 FROM finance.contas_pagar cp WHERE cp.cod_movto_bco = m.cod_movto_bco AND cp.excluido_em IS NULL)';

/**
 * Um lançamento está IDENTIFICADO quando sabemos a que conta ele corresponde —
 * seja porque o Globus marcou `conciliado`, seja porque JÁ TEMOS o(s) título(s)
 * de CP ligados por cod_movto_bco. O flag do Globus fica false em muitos débitos
 * de borderô que, ainda assim, sabemos exatamente o que pagaram (ex.: BO-011084:
 * conciliado=false, mas 4 títulos ligados). Sem esta segunda via, 54 dos 78
 * "sem par" apareciam como não-identificados sem motivo. Alias do movto = `m`.
 */
const IDENTIFICADO_SQL = `(m.conciliado = true OR ${TEM_CP_POR_CODMOVTO_SQL})`;

function toMovtoResumo(m: BancoMovto): MovtoBancoResumo {
  return {
    id: m.id,
    dataMovto: m.dataMovto,
    valorCents: Number(m.valorCents),
    debitoCredito: m.debitoCredito,
    descHistoBco: m.descHistoBco,
    docMovtoBco: m.docMovtoBco,
    histMovtoBco: m.histMovtoBco ? m.histMovtoBco.slice(0, 200) : null,
    codBanco: m.codBanco,
    codAgencia: m.codAgencia,
    codContaBco: m.codContaBco,
  };
}

function toTituloFromCp(cp: ContaPagar): TituloResumo {
  return {
    id: cp.id,
    tipo: 'cp',
    numeroDocumento: cp.numeroDocumento,
    contraparteRazaoSocial: cp.fornecedor?.razaoSocial ?? null,
    dataReferencia: cp.dataPagamento ?? cp.dataVencimento,
    valorCents: Number(cp.valorBrutoCents),
  };
}

function toTituloFromCr(cr: ContaReceber): TituloResumo {
  return {
    id: cr.id,
    tipo: 'cr',
    numeroDocumento: cr.numeroDocumento,
    contraparteRazaoSocial: cr.cliente?.razaoSocial ?? null,
    dataReferencia: cr.dataRecebimento ?? cr.dataVencimento,
    valorCents: Number(cr.valorBrutoCents),
  };
}

/** Enriquece um título com a diferença (valor/dias) em relação ao movto-alvo. */
function toCandidato(t: TituloResumo, valorMovtoAbs: number, dataMovto: string): TituloCandidato {
  return {
    ...t,
    diferencaValorCents: t.valorCents - valorMovtoAbs,
    diferencaDias: diasEntre(dataMovto, t.dataReferencia),
  };
}

function toConciliacaoResponse(c: Conciliacao): ConciliacaoResponse {
  const titulo: TituloResumo | null =
    c.contaPagar ? toTituloFromCp(c.contaPagar) :
    c.contaReceber ? toTituloFromCr(c.contaReceber) :
    null;

  return {
    id: c.id,
    bancoMovto: c.bancoMovto ? toMovtoResumo(c.bancoMovto) : {
      id: c.bancoMovtoId, dataMovto: '', valorCents: 0, debitoCredito: null,
      descHistoBco: null, docMovtoBco: null, histMovtoBco: null,
      codBanco: 0, codAgencia: 0, codContaBco: '',
    },
    titulo,
    tipo: c.tipo,
    scoreConfianca: c.scoreConfianca,
    diferencaDias: c.diferencaDias,
    status: c.status as ConciliacaoStatus,
    observacao: c.observacao,
    sugeridoEm: c.sugeridoEm.toISOString(),
    confirmadoEm: c.confirmadoEm ? c.confirmadoEm.toISOString() : null,
  };
}

function diasEntre(d1: string, d2: string): number {
  const t1 = new Date(`${d1}T00:00:00Z`).getTime();
  const t2 = new Date(`${d2}T00:00:00Z`).getTime();
  return Math.abs(Math.round((t1 - t2) / 86_400_000));
}

interface ItemCandidato {
  id: string;
  valor: number;
  data: string;
  isCp: boolean;
}

/**
 * Subset-sum bounded com backtracking + poda.
 * Retorna o PRIMEIRO subconjunto que soma == alvo (±tolerancia).
 * Min 2 items (1-only já é coberto pelo match individual).
 */
function encontrarSubset(
  candidatos: ItemCandidato[],
  alvo: number,
  maxSize: number,
  tolerancia: number,
): ItemCandidato[] | null {
  // Ordena por valor DESC pra podar melhor
  const ordenados = [...candidatos].sort((a, b) => b.valor - a.valor);
  const resultado: ItemCandidato[] = [];

  function backtrack(start: number, soma: number): boolean {
    if (Math.abs(soma - alvo) <= tolerancia && resultado.length >= 2) return true;
    if (soma > alvo + tolerancia) return false;
    if (resultado.length >= maxSize) return false;
    for (let i = start; i < ordenados.length; i++) {
      const c = ordenados[i]!;
      if (soma + c.valor > alvo + tolerancia) continue;
      resultado.push(c);
      if (backtrack(i + 1, soma + c.valor)) return true;
      resultado.pop();
    }
    return false;
  }

  if (backtrack(0, 0)) return resultado;
  return null;
}

export function buildConciliacaoService(fastify: FastifyInstance) {
  const cpAdapter = buildGlobusCpAdapter(fastify);
  const cpEtl = buildContasPagarEtl(fastify);
  const movtoRepo = fastify.db.getRepository(BancoMovto);
  const contaRepo = fastify.db.getRepository(BancoConta);
  const cpRepo = fastify.db.getRepository(ContaPagar);
  const crRepo = fastify.db.getRepository(ContaReceber);
  const conciliacaoRepo = fastify.db.getRepository(Conciliacao);

  return {
    async dashboard(): Promise<ConciliacaoDashboard> {
      const [
        movtosTotais,
        movtosConciliados,
        movtosComTitulo,
        movtosIdentificados,
        sugeridas,
        confirmadas,
        rejeitadas,
      ] = await Promise.all([
        movtoRepo.createQueryBuilder('m').where('m.excluido_em IS NULL').getCount(),
        // Marcados como conciliado PELO GLOBUS (mantém o rótulo específico).
        movtoRepo.createQueryBuilder('m').where('m.excluido_em IS NULL').andWhere('m.conciliado = true').getCount(),
        // Lançamentos com título (CP) já amarrado pelo Globus via cod_movto_bco.
        movtoRepo.createQueryBuilder('m').where('m.excluido_em IS NULL').andWhere(TEM_CP_POR_CODMOVTO_SQL).getCount(),
        // IDENTIFICADOS de verdade: conciliado no Globus OU com título ligado.
        movtoRepo.createQueryBuilder('m').where('m.excluido_em IS NULL').andWhere(IDENTIFICADO_SQL).getCount(),
        conciliacaoRepo.createQueryBuilder('c').where("c.status = 'sugerido'").getCount(),
        conciliacaoRepo.createQueryBuilder('c').where("c.status = 'confirmado'").getCount(),
        conciliacaoRepo.createQueryBuilder('c').where("c.status = 'rejeitado'").getCount(),
      ]);

      const valoresConciliados = await conciliacaoRepo
        .createQueryBuilder('c')
        .leftJoin('c.bancoMovto', 'm')
        .where("c.status = 'confirmado'")
        .select('COALESCE(SUM(ABS(m.valor_cents)), 0)', 'total')
        .getRawOne<{ total: string }>();

      // "Sem par" = nem conciliado nem com título ligado. É o que sobra de fato.
      const valorSemPar = await movtoRepo
        .createQueryBuilder('m')
        .where('m.excluido_em IS NULL')
        .andWhere(`NOT ${IDENTIFICADO_SQL}`)
        .select('COALESCE(SUM(ABS(m.valor_cents)), 0)', 'total')
        .getRawOne<{ total: string }>();

      return {
        movtosTotais,
        movtosConciliados,
        movtosSemPar: movtosTotais - movtosIdentificados,
        movtosComTitulo,
        // Total identificado (Globus + título) e a fatia que veio SÓ do título —
        // para a UI explicar "X já têm conta a pagar ligada, mesmo sem o flag".
        movtosIdentificados,
        movtosIdentificadosPorTitulo: movtosIdentificados - movtosConciliados,
        conciliacoesSugeridas: sugeridas,
        conciliacoesConfirmadas: confirmadas,
        conciliacoesRejeitadas: rejeitadas,
        valorTotalConciliadoCents: Number(valoresConciliados?.total ?? 0),
        valorSemParCents: Number(valorSemPar?.total ?? 0),
      };
    },

    /**
     * Visão Globus (só leitura): lista lançamentos do banco com o(s) título(s)
     * que o GLOBUS já amarrou (via cod_movto_bco), sem nenhum matching nosso.
     * status 'identificados' = conciliado no Globus; 'nao_identificados' = não.
     * Onde o Globus não vinculou (ex.: créditos/CR), títulos vêm vazio.
     */
    async listarMovimentos(query: MovimentosQuery): Promise<MovimentosResponse> {
      const pagina = query.pagina ?? 1;
      const porPagina = query.porPagina ?? 20;
      const offset = (pagina - 1) * porPagina;

      const qb = movtoRepo.createQueryBuilder('m').where('m.excluido_em IS NULL');
      // "Identificado" = conciliado no Globus OU com título de CP ligado. Assim
      // um borderô que sabemos o que pagou não cai em "falta identificar".
      if (query.status === 'identificados') qb.andWhere(IDENTIFICADO_SQL);
      else if (query.status === 'nao_identificados') qb.andWhere(`NOT ${IDENTIFICADO_SQL}`);

      if (query.contaId) {
        const conta = await contaRepo.findOne({ where: { id: query.contaId } });
        if (conta) {
          qb.andWhere('m.cod_banco = :cb AND m.cod_agencia = :ca AND m.cod_conta_bco = :cc', {
            cb: conta.codBanco, ca: conta.codAgencia, cc: conta.codContaBco,
          });
        }
      }
      if (query.busca?.trim()) {
        qb.andWhere(
          '(m.desc_histo_bco ILIKE :q OR m.hist_movto_bco ILIKE :q OR m.doc_movto_bco ILIKE :q)',
          { q: `%${query.busca.trim()}%` },
        );
      }
      if (query.dtIni) qb.andWhere('m.data_movto >= :dtIni', { dtIni: query.dtIni });
      if (query.dtFim) qb.andWhere('m.data_movto <= :dtFim', { dtFim: query.dtFim });

      const total = await qb.getCount();
      const movtos = await qb
        .orderBy('m.data_movto', 'DESC')
        .addOrderBy('m.cod_movto_bco', 'DESC')
        .limit(porPagina)
        .offset(offset)
        .getMany();

      // Resolve os títulos (CP) que o Globus amarrou, em lote por cod_movto_bco.
      const cods = [...new Set(movtos.map((m) => m.codMovtoBco).filter((c): c is string => !!c))];
      const titulosPorCod = new Map<string, TituloVinculado[]>();
      if (cods.length > 0) {
        const cps = await cpRepo
          .createQueryBuilder('cp')
          .leftJoinAndSelect('cp.fornecedor', 'forn')
          .where('cp.cod_movto_bco IN (:...cods)', { cods })
          .andWhere('cp.excluido_em IS NULL')
          .getMany();
        for (const cp of cps) {
          const k = String(cp.codMovtoBco);
          const arr = titulosPorCod.get(k) ?? [];
          arr.push({
            id: cp.id,
            tipo: 'cp',
            numeroDocumento: cp.numeroDocumento,
            fornecedorRazaoSocial: cp.fornecedor?.razaoSocial ?? null,
            valorCents: Number(cp.valorBrutoCents),
          });
          titulosPorCod.set(k, arr);
        }
      }

      // Vínculos MANUAIS (nossos): conciliações confirmadas por operador. Complementam
      // o que o Globus não amarrou (créditos/CR, ou CP sem cod_movto_bco). Chave = banco_movto_id.
      const movtoIds = movtos.map((m) => m.id);
      const manualPorMovto = new Map<string, TituloVinculado[]>();
      if (movtoIds.length > 0) {
        const manuais = await conciliacaoRepo
          .createQueryBuilder('c')
          .leftJoinAndSelect('c.contaPagar', 'cp')
          .leftJoinAndSelect('cp.fornecedor', 'forn')
          .leftJoinAndSelect('c.contaReceber', 'cr')
          .leftJoinAndSelect('cr.cliente', 'cli')
          .where('c.banco_movto_id IN (:...ids)', { ids: movtoIds })
          .andWhere("c.status = 'confirmado'")
          .getMany();
        for (const c of manuais) {
          const arr = manualPorMovto.get(c.bancoMovtoId) ?? [];
          if (c.contaPagar) {
            arr.push({
              id: c.contaPagar.id,
              tipo: 'cp',
              numeroDocumento: c.contaPagar.numeroDocumento,
              fornecedorRazaoSocial: c.contaPagar.fornecedor?.razaoSocial ?? null,
              valorCents: Number(c.contaPagar.valorBrutoCents),
            });
          } else if (c.contaReceber) {
            arr.push({
              id: c.contaReceber.id,
              tipo: 'cr',
              numeroDocumento: c.contaReceber.numeroDocumento,
              fornecedorRazaoSocial: c.contaReceber.cliente?.razaoSocial ?? null,
              valorCents: Number(c.contaReceber.valorBrutoCents),
            });
          }
          manualPorMovto.set(c.bancoMovtoId, arr);
        }
      }

      // Nome amigável da conta (cadastro pequeno — carrega tudo e indexa).
      const contas = await contaRepo.createQueryBuilder('bc').where('bc.excluido_em IS NULL').getMany();
      const nomePorChave = new Map(
        contas.map((c) => [`${c.codBanco}|${c.codAgencia}|${c.codContaBco}`, c.nomeAmigavel ?? c.nomeContaBco]),
      );

      const itens = movtos.map((m) => {
        const titulosGlobus = titulosPorCod.get(String(m.codMovtoBco)) ?? [];
        const titulosManuais = manualPorMovto.get(m.id) ?? [];
        return {
          id: m.id,
          dataMovto: m.dataMovto,
          valorCents: Number(m.valorCents),
          debitoCredito: m.debitoCredito,
          descHistoBco: m.descHistoBco,
          docMovtoBco: m.docMovtoBco,
          histMovtoBco: m.histMovtoBco ? m.histMovtoBco.slice(0, 200) : null,
          codBanco: m.codBanco,
          codAgencia: m.codAgencia,
          codContaBco: m.codContaBco,
          conciliadoGlobus: m.conciliado,
          vinculoManual: titulosManuais.length > 0,
          contaNome: nomePorChave.get(`${m.codBanco}|${m.codAgencia}|${m.codContaBco}`) ?? null,
          titulos: [...titulosGlobus, ...titulosManuais],
        };
      });

      return {
        itens,
        total,
        pagina,
        porPagina,
        totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
      };
    },

    /**
     * Contas bancárias com saldo (âncora preenchida pelo tesoureiro) + agregados
     * de movimentos (total / conciliados / sem par). Saldo null = sem dado, exibido
     * como tal no front (nunca zerar em silêncio). Ordena: principais primeiro,
     * depois maior saldo.
     */
    async listarContas(): Promise<ContasBancariasResponse> {
      const contas = await contaRepo
        .createQueryBuilder('bc')
        .where('bc.excluido_em IS NULL')
        .orderBy('bc.eh_principal', 'DESC')
        .addOrderBy('bc.saldo_acm_cents', 'DESC', 'NULLS LAST')
        .getMany();

      // Agrega movimentos por (banco, agencia, conta) — chave que liga banco_movto a banco_conta
      const agregados = await movtoRepo
        .createQueryBuilder('m')
        .select('m.cod_banco', 'b')
        .addSelect('m.cod_agencia', 'a')
        .addSelect('m.cod_conta_bco', 'c')
        .addSelect('COUNT(*)', 'tot')
        // Identificado = conciliado no Globus OU com título de CP ligado (mesma
        // regra do dashboard). Antes contava só o flag e inflava o "sem par".
        .addSelect(`COUNT(*) FILTER (WHERE ${IDENTIFICADO_SQL})`, 'conc')
        .addSelect(`COUNT(*) FILTER (WHERE NOT ${IDENTIFICADO_SQL})`, 'sp')
        .addSelect(`COALESCE(SUM(ABS(m.valor_cents)) FILTER (WHERE NOT ${IDENTIFICADO_SQL}), 0)`, 'vsp')
        .where('m.excluido_em IS NULL')
        .groupBy('m.cod_banco')
        .addGroupBy('m.cod_agencia')
        .addGroupBy('m.cod_conta_bco')
        .getRawMany<{ b: number; a: number; c: string; tot: string; conc: string; sp: string; vsp: string }>();

      const chave = (b: number, a: number, c: string): string => `${b}|${a}|${c}`;
      const mapAgg = new Map(
        agregados.map((r) => [
          chave(r.b, r.a, r.c),
          {
            movtosTotais: Number(r.tot),
            movtosConciliados: Number(r.conc),
            movtosSemPar: Number(r.sp),
            valorSemParCents: Number(r.vsp),
          },
        ]),
      );

      const itens = contas.map((bc) => {
        const agg = mapAgg.get(chave(bc.codBanco, bc.codAgencia, bc.codContaBco));
        const pix = bc.chavePix && bc.chavePix.trim() !== '' ? bc.chavePix : null;
        return {
          id: bc.id,
          codBanco: bc.codBanco,
          codAgencia: bc.codAgencia,
          codContaBco: bc.codContaBco,
          digito: bc.digito,
          nome: bc.nomeAmigavel ?? bc.nomeContaBco,
          ehPrincipal: bc.ehPrincipal,
          contaCaixa: bc.contaCaixa,
          saldoAcmCents: bc.saldoAcmCents === null ? null : Number(bc.saldoAcmCents),
          dataSaldoAcm: bc.dataSaldoAcm,
          chavePix: pix,
          tipoChavePix: pix ? bc.tipoChavePix : null,
          movtosTotais: agg?.movtosTotais ?? 0,
          movtosConciliados: agg?.movtosConciliados ?? 0,
          movtosSemPar: agg?.movtosSemPar ?? 0,
          valorSemParCents: agg?.valorSemParCents ?? 0,
        };
      });

      return { itens };
    },

    /**
     * Auto-match: para cada movto banco não conciliado e sem sugestão ativa,
     * procura CP (débito) ou CR (crédito) com data +/- N dias e valor exato.
     */
    async sugerir(): Promise<SugerirResponse> {
      const inicio = Date.now();

      const movtos = await movtoRepo
        .createQueryBuilder('m')
        .where('m.excluido_em IS NULL')
        .andWhere('m.conciliado = false')
        .andWhere('m.data_movto >= CURRENT_DATE - INTERVAL \'365 days\'')
        .limit(2000)
        .getMany();

      // IDs já com sugestão ativa
      const jaSugeridos = await conciliacaoRepo
        .createQueryBuilder('c')
        .select('DISTINCT c.banco_movto_id', 'id')
        .where("c.status IN ('sugerido','confirmado')")
        .getRawMany<{ id: string }>();
      const setJa = new Set(jaSugeridos.map((r) => r.id));

      let gerados = 0;
      let pulados = 0;

      for (const m of movtos) {
        if (setJa.has(m.id)) { pulados++; continue; }
        const valorAbs = Math.abs(Number(m.valorCents));
        const ehCredito = m.debitoCredito === 'C' || Number(m.valorCents) > 0;
        const dataIni = new Date(`${m.dataMovto}T00:00:00Z`);
        dataIni.setUTCDate(dataIni.getUTCDate() - TOLERANCIA_DIAS);
        const dataFim = new Date(`${m.dataMovto}T00:00:00Z`);
        dataFim.setUTCDate(dataFim.getUTCDate() + TOLERANCIA_DIAS);

        const dataIniIso = dataIni.toISOString().slice(0, 10);
        const dataFimIso = dataFim.toISOString().slice(0, 10);

        let candidato: { id: string; data: string; isCp: boolean } | null = null;

        if (ehCredito) {
          // CR — recebimento
          const crs = await crRepo
            .createQueryBuilder('cr')
            .where('cr.valor_bruto_cents = :valor', { valor: String(valorAbs) })
            .andWhere(
              '(cr.data_recebimento BETWEEN :dtIni AND :dtFim OR cr.data_vencimento BETWEEN :dtIni AND :dtFim)',
              { dtIni: dataIniIso, dtFim: dataFimIso },
            )
            .andWhere('cr.excluido_em IS NULL')
            .limit(5)
            .getMany();
          if (crs.length > 0) {
            const escolhido = crs[0]!;
            candidato = {
              id: escolhido.id,
              data: escolhido.dataRecebimento ?? escolhido.dataVencimento,
              isCp: false,
            };
          }
        } else {
          // CP — pagamento
          const cps = await cpRepo
            .createQueryBuilder('cp')
            .where('cp.valor_bruto_cents = :valor', { valor: String(valorAbs) })
            .andWhere(
              '(cp.data_pagamento BETWEEN :dtIni AND :dtFim OR cp.data_vencimento BETWEEN :dtIni AND :dtFim)',
              { dtIni: dataIniIso, dtFim: dataFimIso },
            )
            .andWhere('cp.excluido_em IS NULL')
            .limit(5)
            .getMany();
          if (cps.length > 0) {
            const escolhido = cps[0]!;
            candidato = {
              id: escolhido.id,
              data: escolhido.dataPagamento ?? escolhido.dataVencimento,
              isCp: true,
            };
          }
        }

        if (!candidato) { pulados++; continue; }

        const diff = diasEntre(m.dataMovto, candidato.data);
        const score = Math.max(50, 100 - diff * 10);

        const novo = conciliacaoRepo.create({
          bancoMovtoId: m.id,
          contaPagarId: candidato.isCp ? candidato.id : null,
          contaReceberId: candidato.isCp ? null : candidato.id,
          tipo: 'auto',
          scoreConfianca: score,
          diferencaDias: diff,
          status: 'sugerido',
          observacao: `Auto-match por data ±${TOLERANCIA_DIAS}d + valor exato`,
        });
        await conciliacaoRepo.save(novo);
        gerados++;
      }

      return {
        movtosAnalisados: movtos.length,
        matchesGerados: gerados,
        matchesPulados: pulados,
        duracaoMs: Date.now() - inicio,
      };
    },

    async listarSugestoes(): Promise<ConciliacoesListResponse> {
      const sugestoes = await conciliacaoRepo
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.bancoMovto', 'm')
        .leftJoinAndSelect('c.contaPagar', 'cp')
        .leftJoinAndSelect('cp.fornecedor', 'forn')
        .leftJoinAndSelect('c.contaReceber', 'cr')
        .leftJoinAndSelect('cr.cliente', 'cli')
        .where("c.status = 'sugerido'")
        // PROPERTY name no orderBy (não coluna do banco): leftJoinAndSelect + limit
        // cai no caminho combined-select do TypeORM, que resolve por property.
        .orderBy('c.scoreConfianca', 'DESC')
        .limit(200)
        .getMany();
      return { itens: sugestoes.map(toConciliacaoResponse) };
    },

    async listarConfirmadas(): Promise<ConciliacoesListResponse> {
      const confirmadas = await conciliacaoRepo
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.bancoMovto', 'm')
        .leftJoinAndSelect('c.contaPagar', 'cp')
        .leftJoinAndSelect('cp.fornecedor', 'forn')
        .leftJoinAndSelect('c.contaReceber', 'cr')
        .leftJoinAndSelect('cr.cliente', 'cli')
        .where("c.status = 'confirmado'")
        // PROPERTY name no orderBy (não coluna do banco): leftJoinAndSelect + limit
        // cai no caminho combined-select do TypeORM, que resolve por property.
        .orderBy('c.confirmadoEm', 'DESC')
        .limit(100)
        .getMany();
      return { itens: confirmadas.map(toConciliacaoResponse) };
    },

    async semPar(): Promise<SemParResponse> {
      // Movtos SEM PAR de verdade: não identificados (nem conciliado no Globus,
      // nem com título de CP ligado) E sem sugestão/confirmação ativa nossa.
      // Sem janela de data — bate com o card do dashboard.
      const semParMovtos = await movtoRepo
        .createQueryBuilder('m')
        .where('m.excluido_em IS NULL')
        .andWhere(`NOT ${IDENTIFICADO_SQL}`)
        .andWhere(
          "NOT EXISTS (SELECT 1 FROM finance.conciliacoes cc WHERE cc.banco_movto_id = m.id AND cc.status IN ('sugerido','confirmado'))",
        )
        .orderBy('m.data_movto', 'DESC')
        .limit(500)
        .getMany();

      // "CPs pagos sem extrato" removido por ora: listava 100 de milhares de CPs
      // pagos sem relação real com os movimentos (a maioria anterior ao sync banco).
      // Volta quando houver match CP<->movto que selecione só os CPs relevantes.
      return {
        movimentos: semParMovtos.map(toMovtoResumo),
        titulos: [],
      };
    },

    /**
     * Candidatos a conciliação manual de UM movto banco. Como o Globus guarda
     * valor sempre positivo (débito/crédito implícito no histórico, não lido),
     * não dá pra saber se o movto é CP ou CR — devolve OS DOIS lados e o operador
     * julga. Estratégia:
     *   - sem busca textual: títulos com valor ±10% e data ±30d do movto;
     *   - com busca (q >= 2 chars): casa por nº do documento OU razão social,
     *     ignorando valor/data (pra achar aquele título específico).
     * Exclui títulos já conciliados (status=confirmado) pra não duplicar baixa.
     * Ordena por proximidade de valor, depois de data — em JS, pra evitar o
     * caminho orderBy+leftJoinAndSelect+limit do TypeORM (quebra com coluna crua).
     */
    async buscarCandidatos(args: { movtoId: string; q?: string }): Promise<ConciliacaoCandidatosResponse> {
      const movto = await movtoRepo.findOne({ where: { id: args.movtoId } });
      if (!movto) throw fastify.httpErrors.notFound('Movimento bancário não encontrado');

      const valorAlvo = Math.abs(Number(movto.valorCents));
      const q = args.q?.trim();
      const temBusca = !!q && q.length >= 2;

      const valorMin = Math.floor(valorAlvo * 0.9);
      const valorMax = Math.ceil(valorAlvo * 1.1);
      const dataIni = new Date(`${movto.dataMovto}T00:00:00Z`);
      dataIni.setUTCDate(dataIni.getUTCDate() - 30);
      const dataFim = new Date(`${movto.dataMovto}T00:00:00Z`);
      dataFim.setUTCDate(dataFim.getUTCDate() + 30);
      const dtIni = dataIni.toISOString().slice(0, 10);
      const dtFim = dataFim.toISOString().slice(0, 10);

      const FETCH = 50; // busca solta, ordena/corta em JS
      const RETORNO = 25;

      const cpQb = cpRepo
        .createQueryBuilder('cp')
        .leftJoinAndSelect('cp.fornecedor', 'forn')
        .where('cp.excluido_em IS NULL')
        .andWhere(
          "NOT EXISTS (SELECT 1 FROM finance.conciliacoes cc WHERE cc.conta_pagar_id = cp.id AND cc.status = 'confirmado')",
        );
      if (temBusca) {
        cpQb.andWhere('(cp.numero_documento ILIKE :q OR forn.razao_social ILIKE :q)', { q: `%${q}%` });
      } else {
        cpQb
          .andWhere('cp.valor_bruto_cents BETWEEN :vmin AND :vmax', { vmin: String(valorMin), vmax: String(valorMax) })
          .andWhere(
            '(cp.data_pagamento BETWEEN :dtIni AND :dtFim OR cp.data_vencimento BETWEEN :dtIni AND :dtFim)',
            { dtIni, dtFim },
          );
      }
      const cps = await cpQb.limit(FETCH).getMany();

      const crQb = crRepo
        .createQueryBuilder('cr')
        .leftJoinAndSelect('cr.cliente', 'cli')
        .where('cr.excluido_em IS NULL')
        .andWhere(
          "NOT EXISTS (SELECT 1 FROM finance.conciliacoes cc WHERE cc.conta_receber_id = cr.id AND cc.status = 'confirmado')",
        );
      if (temBusca) {
        crQb.andWhere('(cr.numero_documento ILIKE :q OR cli.razao_social ILIKE :q)', { q: `%${q}%` });
      } else {
        crQb
          .andWhere('cr.valor_bruto_cents BETWEEN :vmin AND :vmax', { vmin: String(valorMin), vmax: String(valorMax) })
          .andWhere(
            '(cr.data_recebimento BETWEEN :dtIni AND :dtFim OR cr.data_vencimento BETWEEN :dtIni AND :dtFim)',
            { dtIni, dtFim },
          );
      }
      const crs = await crQb.limit(FETCH).getMany();

      const candidatos: TituloCandidato[] = [
        ...cps.map((cp) => toCandidato(toTituloFromCp(cp), valorAlvo, movto.dataMovto)),
        ...crs.map((cr) => toCandidato(toTituloFromCr(cr), valorAlvo, movto.dataMovto)),
      ];

      // Mais perto no valor primeiro; empate, mais perto na data.
      candidatos.sort((a, b) => {
        const dv = Math.abs(a.diferencaValorCents) - Math.abs(b.diferencaValorCents);
        if (dv !== 0) return dv;
        return a.diferencaDias - b.diferencaDias;
      });

      return { movto: toMovtoResumo(movto), candidatos: candidatos.slice(0, RETORNO) };
    },

    /**
     * Conciliação manual: o operador vincula UM movto banco a UM título (CP/CR).
     * Diferente do auto-match, já entra como 'confirmado' (decisão humana, score 100)
     * e marca o movto como conciliado. Bloqueia se o movto já tem conciliação ativa.
     */
    async conciliarManual(args: {
      bancoMovtoId: string;
      tipo: 'cp' | 'cr';
      tituloId: string;
      usuarioId: string;
      observacao?: string;
    }): Promise<ConciliacaoResponse> {
      const movto = await movtoRepo.findOne({ where: { id: args.bancoMovtoId } });
      if (!movto) throw fastify.httpErrors.notFound('Movimento bancário não encontrado');
      if (movto.excluidoEm) throw fastify.httpErrors.conflict('Movimento bancário excluído');
      if (movto.conciliado) throw fastify.httpErrors.conflict('Movimento bancário já conciliado');

      const ativa = await conciliacaoRepo
        .createQueryBuilder('c')
        .where('c.banco_movto_id = :id', { id: args.bancoMovtoId })
        .andWhere("c.status IN ('sugerido','confirmado')")
        .getCount();
      if (ativa > 0) {
        throw fastify.httpErrors.conflict('Movimento já possui conciliação ativa (sugerida ou confirmada)');
      }

      let contaPagarId: string | null = null;
      let contaReceberId: string | null = null;
      let dataTitulo: string;

      if (args.tipo === 'cp') {
        const cp = await cpRepo.findOne({ where: { id: args.tituloId } });
        if (!cp || cp.excluidoEm) throw fastify.httpErrors.notFound('Conta a pagar não encontrada');
        contaPagarId = cp.id;
        dataTitulo = cp.dataPagamento ?? cp.dataVencimento;
      } else {
        const cr = await crRepo.findOne({ where: { id: args.tituloId } });
        if (!cr || cr.excluidoEm) throw fastify.httpErrors.notFound('Conta a receber não encontrada');
        contaReceberId = cr.id;
        dataTitulo = cr.dataRecebimento ?? cr.dataVencimento;
      }

      const diff = diasEntre(movto.dataMovto, dataTitulo);

      const nova = conciliacaoRepo.create({
        bancoMovtoId: movto.id,
        contaPagarId,
        contaReceberId,
        tipo: 'manual',
        scoreConfianca: 100, // decisão humana
        diferencaDias: diff,
        status: 'confirmado',
        observacao: args.observacao?.trim() || 'Conciliação manual',
        confirmadoEm: new Date(),
        confirmadoPorId: args.usuarioId,
      });
      await conciliacaoRepo.save(nova);

      movto.conciliado = true;
      await movtoRepo.save(movto);

      const full = await conciliacaoRepo.findOne({
        where: { id: nova.id },
        relations: ['bancoMovto', 'contaPagar', 'contaPagar.fornecedor', 'contaReceber', 'contaReceber.cliente'],
      });
      return toConciliacaoResponse(full ?? nova);
    },

    async confirmar(args: { id: string; usuarioId: string }): Promise<ConciliacaoResponse> {
      const c = await conciliacaoRepo.findOne({
        where: { id: args.id },
        relations: ['bancoMovto', 'contaPagar', 'contaPagar.fornecedor', 'contaReceber', 'contaReceber.cliente'],
      });
      if (!c) throw fastify.httpErrors.notFound('Conciliação não encontrada');
      if (c.status !== 'sugerido') {
        throw fastify.httpErrors.conflict(`Conciliação com status ${c.status} não pode ser confirmada`);
      }
      c.status = 'confirmado';
      c.confirmadoEm = new Date();
      c.confirmadoPorId = args.usuarioId;
      await conciliacaoRepo.save(c);

      if (c.bancoMovto) {
        c.bancoMovto.conciliado = true;
        await movtoRepo.save(c.bancoMovto);
      }

      await fastify.auditoria.registrarAlteracao({
        usuarioId: args.usuarioId,
        recurso: 'conciliacao',
        recursoId: c.id,
        acao: 'aprovou',
        descricao: 'Conciliação bancária confirmada',
        antes: { status: 'sugerido' },
        depois: { status: 'confirmado' },
      });

      return toConciliacaoResponse(c);
    },

    /**
     * Conciliação por AGREGAÇÃO (borderô): para cada movto banco sem par,
     * busca subconjunto de CPs/CRs cuja SOMA bate com o valor do movto
     * (data ±3d). Limita combinações pra evitar explosão.
     *
     * Exemplo: borderô #010315 R$ 36.354,97 → acha que são 3 fornecedores
     * pagos juntos (R$ 10k + R$ 15k + R$ 11.354,97).
     *
     * Cria 1 conciliação 'sugerido' por CP/CR do subset, todas referenciando
     * o mesmo banco_movto_id. Observação registra o tamanho do agregado.
     */
    async sugerirAgregacao(): Promise<SugerirAgregacaoResponse> {
      const inicio = Date.now();
      const MAX_CANDIDATOS = 15;
      const MAX_SUBSET_SIZE = 5;
      const TOLERANCIA_CENTAVOS = 1;

      const movtos = await movtoRepo
        .createQueryBuilder('m')
        .where('m.excluido_em IS NULL')
        .andWhere('m.conciliado = false')
        .andWhere("m.data_movto >= CURRENT_DATE - INTERVAL '365 days'")
        .limit(500)
        .getMany();

      const jaSugeridos = await conciliacaoRepo
        .createQueryBuilder('c')
        .select('DISTINCT c.banco_movto_id', 'id')
        .where("c.status IN ('sugerido','confirmado')")
        .getRawMany<{ id: string }>();
      const setJa = new Set(jaSugeridos.map((r) => r.id));

      let borderosResolvidos = 0;
      let titulosNoSubset = 0;
      let movtosSemSubset = 0;

      for (const m of movtos) {
        if (setJa.has(m.id)) continue;
        const valorAlvo = Math.abs(Number(m.valorCents));
        if (valorAlvo === 0) continue;

        const ehCredito = m.debitoCredito === 'C' || Number(m.valorCents) > 0;
        const dataIni = new Date(`${m.dataMovto}T00:00:00Z`);
        dataIni.setUTCDate(dataIni.getUTCDate() - 3);
        const dataFim = new Date(`${m.dataMovto}T00:00:00Z`);
        dataFim.setUTCDate(dataFim.getUTCDate() + 3);
        const dtIni = dataIni.toISOString().slice(0, 10);
        const dtFim = dataFim.toISOString().slice(0, 10);

        // Busca candidatos (CR se crédito, CP se débito)
        type Candidato = { id: string; valor: number; data: string; isCp: boolean };
        let candidatos: Candidato[] = [];

        if (ehCredito) {
          const crs = await crRepo
            .createQueryBuilder('cr')
            .where('cr.valor_bruto_cents <= :alvo', { alvo: String(valorAlvo) })
            .andWhere('cr.valor_bruto_cents > 0')
            .andWhere(
              '(cr.data_recebimento BETWEEN :dtIni AND :dtFim OR cr.data_vencimento BETWEEN :dtIni AND :dtFim)',
              { dtIni, dtFim },
            )
            .andWhere('cr.excluido_em IS NULL')
            .orderBy('cr.valor_bruto_cents', 'DESC')
            .limit(MAX_CANDIDATOS)
            .getMany();
          candidatos = crs.map((cr) => ({
            id: cr.id,
            valor: Number(cr.valorBrutoCents),
            data: cr.dataRecebimento ?? cr.dataVencimento,
            isCp: false,
          }));
        } else {
          const cps = await cpRepo
            .createQueryBuilder('cp')
            .where('cp.valor_bruto_cents <= :alvo', { alvo: String(valorAlvo) })
            .andWhere('cp.valor_bruto_cents > 0')
            .andWhere(
              '(cp.data_pagamento BETWEEN :dtIni AND :dtFim OR cp.data_vencimento BETWEEN :dtIni AND :dtFim)',
              { dtIni, dtFim },
            )
            .andWhere('cp.excluido_em IS NULL')
            .orderBy('cp.valor_bruto_cents', 'DESC')
            .limit(MAX_CANDIDATOS)
            .getMany();
          candidatos = cps.map((cp) => ({
            id: cp.id,
            valor: Number(cp.valorBrutoCents),
            data: cp.dataPagamento ?? cp.dataVencimento,
            isCp: true,
          }));
        }

        // Subset-sum bounded (backtracking com poda)
        const subset = encontrarSubset(candidatos, valorAlvo, MAX_SUBSET_SIZE, TOLERANCIA_CENTAVOS);
        if (!subset || subset.length < 2) {
          movtosSemSubset++;
          continue;
        }

        // Cria 1 conciliação por item do subset
        for (const item of subset) {
          const diff = Math.abs(
            Math.round((new Date(`${item.data}T00:00:00Z`).getTime() - new Date(`${m.dataMovto}T00:00:00Z`).getTime()) / 86_400_000),
          );
          const novo = conciliacaoRepo.create({
            bancoMovtoId: m.id,
            contaPagarId: item.isCp ? item.id : null,
            contaReceberId: item.isCp ? null : item.id,
            tipo: 'auto',
            scoreConfianca: Math.max(50, 90 - diff * 5),
            diferencaDias: diff,
            status: 'sugerido',
            observacao: `Agregação: ${subset.length} títulos somando R$ ${(valorAlvo / 100).toFixed(2)} (borderô)`,
          });
          await conciliacaoRepo.save(novo);
          titulosNoSubset++;
        }
        borderosResolvidos++;
      }

      return {
        movtosAnalisados: movtos.length,
        borderosResolvidos,
        titulosNoSubset,
        movtosSemSubset,
        duracaoMs: Date.now() - inicio,
      };
    },

    async rejeitar(args: { id: string; usuarioId: string; motivo?: string }): Promise<ConciliacaoResponse> {
      const c = await conciliacaoRepo.findOne({
        where: { id: args.id },
        relations: ['bancoMovto', 'contaPagar', 'contaPagar.fornecedor', 'contaReceber', 'contaReceber.cliente'],
      });
      if (!c) throw fastify.httpErrors.notFound('Conciliação não encontrada');
      const statusAntes = c.status;
      c.status = 'rejeitado';
      c.observacao = args.motivo ?? c.observacao;
      await conciliacaoRepo.save(c);
      await fastify.auditoria.registrarAlteracao({
        usuarioId: args.usuarioId,
        recurso: 'conciliacao',
        recursoId: c.id,
        acao: 'rejeitou',
        descricao: args.motivo ? `Conciliação rejeitada — ${args.motivo}` : 'Conciliação rejeitada',
        antes: { status: statusAntes },
        depois: { status: 'rejeitado' },
      });
      return toConciliacaoResponse(c);
    },

    /**
     * EXTRATO MENSAL — entrou × saiu por mês. Transferências entre contas
     * próprias ficam à parte (não são resultado operacional). O resultado do mês
     * é entradas − saídas.
     */
    async extratoMensal(query: ExtratoMensalQuery): Promise<ExtratoMensalResponse> {
      // Agrega SEMPRE o histórico inteiro (o saldo acumula desde o 1º movimento);
      // o filtro de período só recorta a EXIBIÇÃO no fim. O sinal do movimento
      // (efeito_saldo_cents: + entrou, − saiu) resolve entrada/saída e o saldo.
      const qb = movtoRepo.createQueryBuilder('m')
        .where('m.excluido_em IS NULL')
        .andWhere('m.efeito_saldo_cents IS NOT NULL');

      if (query.contaId) {
        const conta = await contaRepo.findOne({ where: { id: query.contaId } });
        if (conta) {
          qb.andWhere('m.cod_banco = :cb AND m.cod_agencia = :ca AND m.cod_conta_bco = :cc', {
            cb: conta.codBanco, ca: conta.codAgencia, cc: conta.codContaBco,
          });
        }
      }

      const linhas = await qb
        .select('m.cod_banco', 'cb')
        .addSelect('m.cod_agencia', 'ca')
        .addSelect('m.cod_conta_bco', 'cc')
        .addSelect("to_char(m.data_movto, 'YYYY-MM')", 'mes')
        .addSelect('COUNT(*)', 'qtd')
        .addSelect('COALESCE(SUM(m.efeito_saldo_cents) FILTER (WHERE m.efeito_saldo_cents > 0), 0)', 'entrou')
        .addSelect('COALESCE(-SUM(m.efeito_saldo_cents) FILTER (WHERE m.efeito_saldo_cents < 0), 0)', 'saiu')
        .groupBy('m.cod_banco').addGroupBy('m.cod_agencia').addGroupBy('m.cod_conta_bco')
        .addGroupBy("to_char(m.data_movto, 'YYYY-MM')")
        .getRawMany<{ cb: number; ca: number; cc: string; mes: string; qtd: string; entrou: string; saiu: string }>();

      const MES_LABEL = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
      const rotulo = (mes: string): string => {
        const [ano, m] = mes.split('-');
        return `${MES_LABEL[Number(m) - 1] ?? m}/${ano}`;
      };

      // Recorte do período (só a exibição). Sem ano = últimos 12 meses.
      const hoje = new Date();
      const limiteIso = query.ano
        ? `${query.ano}-01`
        : `${new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1).toISOString().slice(0, 7)}`;
      const fimIso = query.ano ? `${query.ano}-12` : `${hoje.toISOString().slice(0, 7)}`;
      const noPeriodo = (mes: string): boolean => mes >= limiteIso && mes <= fimIso;

      interface MesBruto { mes: string; movimentos: number; entradasCents: number; saidasCents: number }

      // Âncoras de saldo por conta (id → {data, saldo}).
      const contas = await contaRepo.find();
      const chaveConta = (cb: number, ca: number, cc: string): string => `${cb}|${ca}|${cc}`;
      const ancoraPorChave = new Map<string, { dataMes: string; saldoCents: number }>();
      for (const c of contas) {
        if (c.saldoAcmCents !== null && c.dataSaldoAcm) {
          ancoraPorChave.set(chaveConta(c.codBanco, c.codAgencia, c.codContaBco), {
            dataMes: c.dataSaldoAcm.slice(0, 7), saldoCents: Number(c.saldoAcmCents),
          });
        }
      }

      // Agrupa as linhas por conta.
      const porContaBruto = new Map<string, { cb: number; ca: number; cc: string; meses: Map<string, MesBruto> }>();
      for (const l of linhas) {
        const chave = chaveConta(l.cb, l.ca, l.cc);
        const c = porContaBruto.get(chave) ?? { cb: l.cb, ca: l.ca, cc: l.cc, meses: new Map<string, MesBruto>() };
        c.meses.set(l.mes, {
          mes: l.mes, movimentos: Number(l.qtd),
          entradasCents: Number(l.entrou), saidasCents: Number(l.saiu),
        });
        porContaBruto.set(chave, c);
      }

      /**
       * Constrói os meses de uma conta com SALDO ACUMULADO. Percorre TODOS os
       * meses em ordem cronológica somando (entrou − saiu); aplica o offset da
       * âncora quando existe (aí o saldo é real); recorta o período no fim.
       */
      function montarComSaldo(mesesMap: Map<string, MesBruto>, ancora: { dataMes: string; saldoCents: number } | undefined) {
        const ordenados = [...mesesMap.values()].sort((a, b) => a.mes.localeCompare(b.mes));

        // offset: sem âncora = 0 (saldo relativo, parte de zero). Com âncora,
        // ajusta para o saldo acumulado até o mês da âncora bater com o conferido.
        let offset = 0;
        if (ancora) {
          let acumAteAncora = 0;
          for (const m of ordenados) {
            acumAteAncora += m.entradasCents - m.saidasCents;
            if (m.mes >= ancora.dataMes) break;
          }
          offset = ancora.saldoCents - acumAteAncora;
        }

        let saldo = offset;
        const comSaldo = ordenados.map((m) => {
          const inicial = saldo;
          saldo += m.entradasCents - m.saidasCents;
          return {
            mes: m.mes, rotulo: rotulo(m.mes), movimentos: m.movimentos,
            entradasCents: m.entradasCents, saidasCents: m.saidasCents,
            resultadoCents: m.entradasCents - m.saidasCents,
            saldoInicialCents: inicial, saldoFinalCents: saldo,
          };
        });

        const doPeriodo = comSaldo.filter((m) => noPeriodo(m.mes)).sort((a, b) => b.mes.localeCompare(a.mes));
        const totais = doPeriodo.reduce(
          (a, m) => ({
            entradasCents: a.entradasCents + m.entradasCents, saidasCents: a.saidasCents + m.saidasCents,
            resultadoCents: a.resultadoCents + m.resultadoCents, movimentos: a.movimentos + m.movimentos,
          }),
          { entradasCents: 0, saidasCents: 0, resultadoCents: 0, movimentos: 0 },
        );
        return { meses: doPeriodo, totais, saldoAtualCents: saldo, saldoRelativo: !ancora };
      }

      const porConta = [...porContaBruto.values()]
        .map((c) => {
          const cad = contas.find((x) => x.codBanco === c.cb && x.codAgencia === c.ca && x.codContaBco === c.cc);
          const built = montarComSaldo(c.meses, ancoraPorChave.get(chaveConta(c.cb, c.ca, c.cc)));
          return {
            contaId: cad?.id ?? null, nome: `Banco ${c.cb}`,
            codBanco: c.cb, codAgencia: c.ca, codContaBco: c.cc, ...built,
          };
        })
        .filter((c) => c.totais.movimentos > 0)
        .sort((a, b) => b.totais.movimentos - a.totais.movimentos);

      // Consolidado: soma dos meses de todas as contas (saldo = soma dos saldos).
      const consMap = new Map<string, { movimentos: number; entradasCents: number; saidasCents: number; saldoFinalCents: number; saldoInicialCents: number }>();
      for (const c of porConta) {
        for (const m of c.meses) {
          const cur = consMap.get(m.mes) ?? { movimentos: 0, entradasCents: 0, saidasCents: 0, saldoFinalCents: 0, saldoInicialCents: 0 };
          cur.movimentos += m.movimentos;
          cur.entradasCents += m.entradasCents;
          cur.saidasCents += m.saidasCents;
          cur.saldoFinalCents += m.saldoFinalCents;
          cur.saldoInicialCents += m.saldoInicialCents;
          consMap.set(m.mes, cur);
        }
      }
      const meses = [...consMap.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([mes, v]) => ({
          mes, rotulo: rotulo(mes), movimentos: v.movimentos,
          entradasCents: v.entradasCents, saidasCents: v.saidasCents,
          resultadoCents: v.entradasCents - v.saidasCents,
          saldoInicialCents: v.saldoInicialCents, saldoFinalCents: v.saldoFinalCents,
        }));
      const totais = meses.reduce(
        (a, m) => ({
          entradasCents: a.entradasCents + m.entradasCents, saidasCents: a.saidasCents + m.saidasCents,
          resultadoCents: a.resultadoCents + m.resultadoCents, movimentos: a.movimentos + m.movimentos,
        }),
        { entradasCents: 0, saidasCents: 0, resultadoCents: 0, movimentos: 0 },
      );

      return { meses, totais, porConta, aClassificar: 0 };
    },

    /**
     * RECONCILIAÇÃO BANCÁRIA automática — fecha o "falta identificar" sem
     * ninguém clicar. Ataca as duas causas dos lançamentos sem par, ambas o
     * ponto cego do sync por janela (a mudança sai da janela e nossa cópia
     * congela). Ver `sql-exploracao/2026-07-29-bordero-sem-par-conciliacao.sql`.
     *
     *  A) Movimentos que o Globus CANCELOU depois de sincronizados
     *     (STATUSMOVTOBCO='C'): marca excluído aqui — saem do extrato e do
     *     "sem par". Era o grosso do valor fantasma (R$ 6,5M em estornos).
     *
     *  B) Borderôs que pagaram títulos de CP que a janela de sync não trouxe:
     *     consulta CPGDOCTO por CODMOVTOBCO, puxa os títulos, e eles ligam
     *     sozinhos ao lançamento por cod_movto_bco.
     */
    async reconciliarBanco(usuarioId: string): Promise<{
      status: string; movimentosVerificados: number; cancelados: number;
      titulosPuxados: number; duracaoMs: number;
    }> {
      const t0 = Date.now();
      const empresa = fastify.config.globus.empresaId;
      if (!fastify.oracle?.isAvailable?.()) {
        throw fastify.httpErrors.serviceUnavailable('Globus (Oracle) indisponível — não dá para reconciliar agora.');
      }

      // Alvo: lançamentos SEM PAR (não identificados). São os únicos que podem
      // ter sido cancelados ou estar esperando o título.
      const semPar = await movtoRepo
        .createQueryBuilder('m')
        .select(['m.id AS id', 'm.cod_movto_bco AS cod'])
        .where('m.excluido_em IS NULL')
        .andWhere(`NOT ${IDENTIFICADO_SQL}`)
        .andWhere('m.cod_movto_bco IS NOT NULL')
        .getRawMany<{ id: string; cod: string }>();

      const cods = [...new Set(semPar.map((m) => Number(m.cod)).filter((n) => Number.isInteger(n) && n > 0))];
      if (cods.length === 0) {
        return { status: 'ok', movimentosVerificados: 0, cancelados: 0, titulosPuxados: 0, duracaoMs: Date.now() - t0 };
      }

      const LOTE = 500;
      interface RawStatusRow { COD_MOVTO_BCO: number; STATUS_MOVTO: string | null }
      let cancelados = 0;

      // --- A) Detecta cancelamento no Globus e marca excluído aqui.
      for (let i = 0; i < cods.length; i += LOTE) {
        const fatia = cods.slice(i, i + LOTE);
        const inList = fatia.map((c) => Math.trunc(c)).join(', ');
        const sql = GLOBUS_QUERIES.bcoMovtoPorCodigos.replace('__CODMOVTOS__', inList);
        const r = await fastify.oracle.execute<RawStatusRow>(sql, { empresa }, { queryName: 'bcoMovtoPorCodigos' });
        const canceladosNoGlobus = (r.rows ?? [])
          .filter((row) => String(row.STATUS_MOVTO ?? '').toUpperCase() === 'C')
          .map((row) => String(row.COD_MOVTO_BCO));
        if (canceladosNoGlobus.length > 0) {
          const res = await movtoRepo
            .createQueryBuilder()
            .update()
            .set({ excluidoEm: () => 'NOW()', excluidoMotivo: 'cancelado_no_globus' })
            .where('cod_movto_bco IN (:...cods)', { cods: canceladosNoGlobus })
            .andWhere('excluido_em IS NULL')
            .execute();
          cancelados += res.affected ?? 0;
        }
      }

      // --- B) Puxa os títulos de CP ligados aos borderôs ainda sem par.
      // Reconsulta só os que NÃO foram cancelados (os cancelados já saíram).
      const restantes = cods.filter(Boolean);
      let titulosPuxados = 0;
      const codDoctos: number[] = [];
      for (let i = 0; i < restantes.length; i += LOTE) {
        const fatia = restantes.slice(i, i + LOTE);
        const inList = fatia.map((c) => Math.trunc(c)).join(', ');
        const sql = GLOBUS_QUERIES.contasAPagarPorCodMovto.replace('__CODMOVTOS__', inList);
        const r = await fastify.oracle.execute<{ COD_DOCTO_CPG: number }>(
          sql, { empresa }, { queryName: 'contasAPagarPorCodMovto' },
        );
        for (const row of r.rows ?? []) {
          const cod = Number(row.COD_DOCTO_CPG);
          if (Number.isInteger(cod) && cod > 0) codDoctos.push(cod);
        }
      }
      if (codDoctos.length > 0) {
        const rec = await cpAdapter.reconciliarPorCodigos([...new Set(codDoctos)], empresa);
        if (rec.status !== 'erro') {
          const etlRes = await cpEtl.processarPendentes(rec.jobId);
          titulosPuxados = etlRes.gravados;
        }
      }

      fastify.log.info(
        { usuarioId, movimentos: cods.length, cancelados, titulosPuxados },
        '[conciliacao] reconciliação bancária concluída',
      );
      return {
        status: 'ok',
        movimentosVerificados: cods.length,
        cancelados,
        titulosPuxados,
        duracaoMs: Date.now() - t0,
      };
    },
  };
}

export type ConciliacaoService = ReturnType<typeof buildConciliacaoService>;
