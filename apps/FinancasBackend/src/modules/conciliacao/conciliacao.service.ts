import type { FastifyInstance } from 'fastify';
import type {
  ConciliacaoCandidatosResponse,
  ConciliacaoDashboard,
  ConciliacaoResponse,
  ConciliacoesListResponse,
  ContasBancariasResponse,
  MovtoBancoResumo,
  SemParResponse,
  SugerirAgregacaoResponse,
  SugerirResponse,
  TituloCandidato,
  TituloResumo,
} from '@pioneira/shared';
import { BancoConta } from '@/entities/banco-conta.entity.js';
import { BancoMovto } from '@/entities/banco-movto.entity.js';
import { ContaPagar } from '@/entities/conta-pagar.entity.js';
import { ContaReceber } from '@/entities/conta-receber.entity.js';
import { Conciliacao, type ConciliacaoStatus } from '@/entities/conciliacao.entity.js';

const TOLERANCIA_DIAS = 3;

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

/** Enriquece um titulo com a diferenca (valor/dias) em relacao ao movto-alvo. */
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
 * Min 2 items (1-only ja eh coberto pelo match individual).
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
        sugeridas,
        confirmadas,
        rejeitadas,
      ] = await Promise.all([
        movtoRepo.createQueryBuilder('m').where('m.excluido_em IS NULL').getCount(),
        movtoRepo.createQueryBuilder('m').where('m.excluido_em IS NULL').andWhere('m.conciliado = true').getCount(),
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

      const valorSemPar = await movtoRepo
        .createQueryBuilder('m')
        .where('m.excluido_em IS NULL')
        .andWhere('m.conciliado = false')
        .select('COALESCE(SUM(ABS(m.valor_cents)), 0)', 'total')
        .getRawOne<{ total: string }>();

      return {
        movtosTotais,
        movtosConciliados,
        movtosSemPar: movtosTotais - movtosConciliados,
        conciliacoesSugeridas: sugeridas,
        conciliacoesConfirmadas: confirmadas,
        conciliacoesRejeitadas: rejeitadas,
        valorTotalConciliadoCents: Number(valoresConciliados?.total ?? 0),
        valorSemParCents: Number(valorSemPar?.total ?? 0),
      };
    },

    /**
     * Contas bancarias com saldo (ancora preenchida pelo tesoureiro) + agregados
     * de movimentos (total / conciliados / sem par). Saldo null = sem dado, exibido
     * como tal no front (nunca zerar em silencio). Ordena: principais primeiro,
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
        .addSelect('COUNT(*) FILTER (WHERE m.conciliado)', 'conc')
        .addSelect('COUNT(*) FILTER (WHERE NOT m.conciliado)', 'sp')
        .addSelect('COALESCE(SUM(ABS(m.valor_cents)) FILTER (WHERE NOT m.conciliado), 0)', 'vsp')
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
     * Auto-match: para cada movto banco não conciliado e sem sugestao ativa,
     * procura CP (debito) ou CR (credito) com data +/- N dias e valor exato.
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

      // IDs ja com sugestao ativa
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
        // PROPERTY name no orderBy (nao coluna do banco): leftJoinAndSelect + limit
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
        // PROPERTY name no orderBy (nao coluna do banco): leftJoinAndSelect + limit
        // cai no caminho combined-select do TypeORM, que resolve por property.
        .orderBy('c.confirmadoEm', 'DESC')
        .limit(100)
        .getMany();
      return { itens: confirmadas.map(toConciliacaoResponse) };
    },

    async semPar(): Promise<SemParResponse> {
      // Movtos sem par: nao conciliado E sem sugestao/confirmacao ativa.
      // Sem janela de data (o card do dashboard conta all-time; a lista tambem).
      // `conciliado IS NOT TRUE` cobre false E null (mesma semantica do dashboard,
      // que faz total - conciliados=true). NOT EXISTS em vez de leftJoin com a
      // classe-entidade — mais robusto e bate com a query de candidatos.
      const semParMovtos = await movtoRepo
        .createQueryBuilder('m')
        .where('m.excluido_em IS NULL')
        .andWhere('m.conciliado IS NOT TRUE')
        .andWhere(
          "NOT EXISTS (SELECT 1 FROM finance.conciliacoes cc WHERE cc.banco_movto_id = m.id AND cc.status IN ('sugerido','confirmado'))",
        )
        .orderBy('m.data_movto', 'DESC')
        .limit(500)
        .getMany();

      // "CPs pagos sem extrato" removido por ora: listava 100 de milhares de CPs
      // pagos sem relacao real com os movimentos (a maioria anterior ao sync banco).
      // Volta quando houver match CP<->movto que selecione so os CPs relevantes.
      return {
        movimentos: semParMovtos.map(toMovtoResumo),
        titulos: [],
      };
    },

    /**
     * Candidatos a conciliacao manual de UM movto banco. Como o Globus guarda
     * valor sempre positivo (debito/credito implicito no historico, nao lido),
     * nao da pra saber se o movto e CP ou CR — devolve OS DOIS lados e o operador
     * julga. Estrategia:
     *   - sem busca textual: titulos com valor ±10% e data ±30d do movto;
     *   - com busca (q >= 2 chars): casa por nº do documento OU razao social,
     *     ignorando valor/data (pra achar aquele titulo especifico).
     * Exclui titulos ja conciliados (status=confirmado) pra nao duplicar baixa.
     * Ordena por proximidade de valor, depois de data — em JS, pra evitar o
     * caminho orderBy+leftJoinAndSelect+limit do TypeORM (quebra com coluna crua).
     */
    async buscarCandidatos(args: { movtoId: string; q?: string }): Promise<ConciliacaoCandidatosResponse> {
      const movto = await movtoRepo.findOne({ where: { id: args.movtoId } });
      if (!movto) throw fastify.httpErrors.notFound('Movimento bancario nao encontrado');

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
     * Conciliacao manual: o operador vincula UM movto banco a UM titulo (CP/CR).
     * Diferente do auto-match, ja entra como 'confirmado' (decisao humana, score 100)
     * e marca o movto como conciliado. Bloqueia se o movto ja tem conciliacao ativa.
     */
    async conciliarManual(args: {
      bancoMovtoId: string;
      tipo: 'cp' | 'cr';
      tituloId: string;
      usuarioId: string;
      observacao?: string;
    }): Promise<ConciliacaoResponse> {
      const movto = await movtoRepo.findOne({ where: { id: args.bancoMovtoId } });
      if (!movto) throw fastify.httpErrors.notFound('Movimento bancario nao encontrado');
      if (movto.excluidoEm) throw fastify.httpErrors.conflict('Movimento bancario excluido');
      if (movto.conciliado) throw fastify.httpErrors.conflict('Movimento bancario ja conciliado');

      const ativa = await conciliacaoRepo
        .createQueryBuilder('c')
        .where('c.banco_movto_id = :id', { id: args.bancoMovtoId })
        .andWhere("c.status IN ('sugerido','confirmado')")
        .getCount();
      if (ativa > 0) {
        throw fastify.httpErrors.conflict('Movimento ja possui conciliacao ativa (sugerida ou confirmada)');
      }

      let contaPagarId: string | null = null;
      let contaReceberId: string | null = null;
      let dataTitulo: string;

      if (args.tipo === 'cp') {
        const cp = await cpRepo.findOne({ where: { id: args.tituloId } });
        if (!cp || cp.excluidoEm) throw fastify.httpErrors.notFound('Conta a pagar nao encontrada');
        contaPagarId = cp.id;
        dataTitulo = cp.dataPagamento ?? cp.dataVencimento;
      } else {
        const cr = await crRepo.findOne({ where: { id: args.tituloId } });
        if (!cr || cr.excluidoEm) throw fastify.httpErrors.notFound('Conta a receber nao encontrada');
        contaReceberId = cr.id;
        dataTitulo = cr.dataRecebimento ?? cr.dataVencimento;
      }

      const diff = diasEntre(movto.dataMovto, dataTitulo);

      const nova = conciliacaoRepo.create({
        bancoMovtoId: movto.id,
        contaPagarId,
        contaReceberId,
        tipo: 'manual',
        scoreConfianca: 100, // decisao humana
        diferencaDias: diff,
        status: 'confirmado',
        observacao: args.observacao?.trim() || 'Conciliacao manual',
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
      if (!c) throw fastify.httpErrors.notFound('Conciliacao nao encontrada');
      if (c.status !== 'sugerido') {
        throw fastify.httpErrors.conflict(`Conciliacao com status ${c.status} nao pode ser confirmada`);
      }
      c.status = 'confirmado';
      c.confirmadoEm = new Date();
      c.confirmadoPorId = args.usuarioId;
      await conciliacaoRepo.save(c);

      if (c.bancoMovto) {
        c.bancoMovto.conciliado = true;
        await movtoRepo.save(c.bancoMovto);
      }

      return toConciliacaoResponse(c);
    },

    /**
     * Conciliacao por AGREGACAO (borderô): para cada movto banco sem par,
     * busca subconjunto de CPs/CRs cuja SOMA bate com o valor do movto
     * (data ±3d). Limita combinações pra evitar explosão.
     *
     * Exemplo: borderô #010315 R$ 36.354,97 → acha que sao 3 fornecedores
     * pagos juntos (R$ 10k + R$ 15k + R$ 11.354,97).
     *
     * Cria 1 conciliacao 'sugerido' por CP/CR do subset, todas referenciando
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

        // Busca candidatos (CR se credito, CP se debito)
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

        // Cria 1 conciliacao por item do subset
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
            observacao: `Agregacao: ${subset.length} titulos somando R$ ${(valorAlvo / 100).toFixed(2)} (borderô)`,
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
      if (!c) throw fastify.httpErrors.notFound('Conciliacao nao encontrada');
      c.status = 'rejeitado';
      c.observacao = args.motivo ?? c.observacao;
      await conciliacaoRepo.save(c);
      return toConciliacaoResponse(c);
    },
  };
}

export type ConciliacaoService = ReturnType<typeof buildConciliacaoService>;
