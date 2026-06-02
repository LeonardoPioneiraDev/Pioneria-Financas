import type { FastifyInstance } from 'fastify';
import { IsNull } from 'typeorm';
import type {
  ContaBancaria,
  ListarContasResponse,
  ProjecaoDia,
  ProjecaoQuery,
  ProjecaoResponse,
  SaldoDia,
  SaldoDiarioResponse,
  SetAncoraSaldoBody,
  SyncFluxoCaixaResponse,
} from '@pioneira/shared';
import { BancoConta } from '@/entities/banco-conta.entity.js';
import { BancoMovto } from '@/entities/banco-movto.entity.js';
import { ContaPagar } from '@/entities/conta-pagar.entity.js';
import { ContaReceber } from '@/entities/conta-receber.entity.js';
import { RecebivelGdfCelula } from '@/entities/recebivel-gdf-celula.entity.js';
import { buildGlobusBcocontaAdapter } from '@/integrations/globus/globus-bcoconta.adapter.js';
import { buildGlobusBcomovtoAdapter } from '@/integrations/globus/globus-bcomovto.adapter.js';
import { buildBancoContaEtl } from '@/etl/banco-conta.etl.js';
import { buildBancoMovtoEtl } from '@/etl/banco-movto.etl.js';

interface MovtoDiaAgg {
  data: string;
  creditos_cents: string;
  debitos_cents: string;
}

function toContaBancaria(c: BancoConta): ContaBancaria {
  const saldoAcmCents = c.saldoAcmCents === null ? null : Number(c.saldoAcmCents);
  return {
    id: c.id,
    codBanco: c.codBanco,
    codAgencia: c.codAgencia,
    codContaBco: c.codContaBco,
    digito: c.digito,
    nomeContaBco: c.nomeContaBco,
    nomeAmigavel: c.nomeAmigavel,
    ehPrincipal: c.ehPrincipal,
    contaCaixa: c.contaCaixa,
    saldoAcmCents,
    dataSaldoAcm: c.dataSaldoAcm,
    saldoAcmAtualizadoEm: c.saldoAcmAtualizadoEm ? c.saldoAcmAtualizadoEm.toISOString() : null,
    saldoGlobusCents: c.saldoAcmGlobusCents === null ? null : Number(c.saldoAcmGlobusCents),
    dataSaldoGlobus: c.dataSaldoAcmGlobus,
    ancoraPronta: saldoAcmCents !== null && c.dataSaldoAcm !== null,
  };
}

/**
 * Service do Fluxo de Caixa.
 *
 * Conceitos:
 *  - Cadastro (`finance.banco_conta`): sincronizado do Globus. Saldo do
 *    Globus NAO e confiavel (ver memory/globus-saldo-bancario.md).
 *  - Ancora de saldo: preenchida MANUALMENTE pelo tesoureiro (saldoAcmCents +
 *    dataSaldoAcm). Sem ela, saldo dia-a-dia nao calcula.
 *  - Saldo na data X: ancora + soma de banco_movto entre dataSaldoAcm+1 e X
 *    (creditos positivos, debitos negativos). Calculado on-the-fly.
 */
export function buildFluxoCaixaService(fastify: FastifyInstance) {
  const contaRepo = fastify.db.getRepository(BancoConta);
  const movtoRepo = fastify.db.getRepository(BancoMovto);
  const crRepo = fastify.db.getRepository(ContaReceber);
  const cpRepo = fastify.db.getRepository(ContaPagar);
  const gdfCelulaRepo = fastify.db.getRepository(RecebivelGdfCelula);
  const contaAdapter = buildGlobusBcocontaAdapter(fastify);
  const movtoAdapter = buildGlobusBcomovtoAdapter(fastify);
  const contaEtl = buildBancoContaEtl(fastify);
  const movtoEtl = buildBancoMovtoEtl(fastify);

  return {
    async listarContas(): Promise<ListarContasResponse> {
      const contas = await contaRepo.find({
        where: { excluidoEm: IsNull() },
        order: { ehPrincipal: 'DESC', codBanco: 'ASC', codAgencia: 'ASC' },
      });
      const itens = contas.map(toContaBancaria);
      return {
        contas: itens,
        totalPrincipais: itens.filter((c) => c.ehPrincipal).length,
        totalSecundarias: itens.filter((c) => !c.ehPrincipal).length,
        totalSemAncora: itens.filter((c) => !c.ancoraPronta).length,
      };
    },

    async setAncoraSaldo(contaId: string, body: SetAncoraSaldoBody, usuarioId: string): Promise<ContaBancaria> {
      const conta = await contaRepo.findOne({ where: { id: contaId, excluidoEm: IsNull() } });
      if (!conta) throw fastify.httpErrors.notFound('Conta bancaria nao encontrada');

      conta.saldoAcmCents = String(body.saldoCents);
      conta.dataSaldoAcm = body.dataSaldo;
      conta.saldoAcmAtualizadoPorUsuarioId = usuarioId;
      conta.saldoAcmAtualizadoEm = new Date();
      await contaRepo.save(conta);

      fastify.log.info(
        { contaId, saldoCents: body.saldoCents, dataSaldo: body.dataSaldo, usuarioId },
        '[fluxo-caixa] ancora de saldo atualizada',
      );
      return toContaBancaria(conta);
    },

    async setEhPrincipal(contaId: string, ehPrincipal: boolean): Promise<ContaBancaria> {
      const conta = await contaRepo.findOne({ where: { id: contaId, excluidoEm: IsNull() } });
      if (!conta) throw fastify.httpErrors.notFound('Conta bancaria nao encontrada');
      conta.ehPrincipal = ehPrincipal;
      await contaRepo.save(conta);
      return toContaBancaria(conta);
    },

    /**
     * Saldo dia-a-dia entre dtIni e dtFim.
     *
     * Se `contaId` informado: calcula pra aquela conta.
     * Se omitido: consolida todas as contas principais (ou todas se
     * `incluirSecundarias=true`).
     *
     * **Importante:** so retorna serie pra contas com ancora preenchida.
     * Contas sem ancora sao ignoradas e mencionadas em `mensagem`.
     */
    async saldoDiario(args: {
      dtIni: string;
      dtFim: string;
      contaId?: string;
      incluirSecundarias?: boolean;
    }): Promise<SaldoDiarioResponse> {
      // 1. Carrega contas elegiveis
      const contas = args.contaId
        ? await contaRepo.find({ where: { id: args.contaId, excluidoEm: IsNull() } })
        : await contaRepo.find({ where: { excluidoEm: IsNull() } });

      const contasComAncora = contas.filter(
        (c) => c.saldoAcmCents !== null && c.dataSaldoAcm !== null
          && (args.contaId || args.incluirSecundarias || c.ehPrincipal),
      );

      if (contasComAncora.length === 0) {
        const mensagem = args.contaId
          ? 'Esta conta nao tem ancora de saldo configurada. Peca pro tesoureiro digitar o saldo atual.'
          : 'Nenhuma conta principal tem ancora de saldo configurada. Cadastre saldos em "Por conta".';
        return {
          periodo: { dtIni: args.dtIni, dtFim: args.dtFim },
          contaId: args.contaId ?? null,
          ancoraValida: false,
          contasIncluidas: contas.map((c) => ({
            id: c.id,
            nome: c.nomeAmigavel ?? c.nomeContaBco,
            saldoAcmCents: c.saldoAcmCents === null ? null : Number(c.saldoAcmCents),
            dataSaldoAcm: c.dataSaldoAcm,
          })),
          serie: [],
          saldoInicialCents: 0,
          saldoFinalCents: 0,
          mensagem,
        };
      }

      // 2. Pra cada conta, busca os movtos a partir da ancora ate dtFim
      // 3. Gera serie dia-a-dia consolidada
      const serie: SaldoDia[] = [];
      const ini = new Date(`${args.dtIni}T00:00:00Z`);
      const fim = new Date(`${args.dtFim}T00:00:00Z`);
      const diasNoPeriodo = Math.ceil((fim.getTime() - ini.getTime()) / 86400000) + 1;
      const seriePorDia = new Map<string, { saldo: bigint; cred: bigint; deb: bigint }>();

      for (let i = 0; i < diasNoPeriodo; i++) {
        const d = new Date(ini.getTime() + i * 86400000);
        const iso = d.toISOString().slice(0, 10);
        seriePorDia.set(iso, { saldo: 0n, cred: 0n, deb: 0n });
      }

      for (const conta of contasComAncora) {
        const ancoraSaldo = BigInt(conta.saldoAcmCents!);
        const ancoraData = conta.dataSaldoAcm!;

        // Busca movtos entre ancoraData+1 e dtFim, agregados por dia.
        const movtos = await movtoRepo.query<MovtoDiaAgg[]>(
          `SELECT data_movto::text AS data,
                  COALESCE(SUM(CASE WHEN cod_histo_bco IN (908, 901, 902, 903, 905, 909, 910) OR (debito_credito = 'C') THEN valor_cents ELSE 0 END), 0)::text AS creditos_cents,
                  COALESCE(SUM(CASE WHEN cod_histo_bco NOT IN (908, 901, 902, 903, 905, 909, 910) AND (debito_credito IS NULL OR debito_credito = 'D') THEN valor_cents ELSE 0 END), 0)::text AS debitos_cents
             FROM finance.banco_movto
            WHERE cod_banco = $1 AND cod_agencia = $2 AND cod_conta_bco = $3
              AND data_movto > $4::date
              AND data_movto <= $5::date
              AND excluido_em IS NULL
            GROUP BY data_movto
            ORDER BY data_movto`,
          [conta.codBanco, conta.codAgencia, conta.codContaBco, ancoraData, args.dtFim],
        );

        // Calcula saldo cumulativo da ancora ate cada dia do periodo
        let saldoAtual = ancoraSaldo;
        const ancoraTime = new Date(`${ancoraData}T00:00:00Z`).getTime();
        const indexMovtos = new Map(movtos.map((m) => [m.data, m]));

        // Aplica movtos entre ancora+1 e dtIni-1 (sem registrar na serie)
        for (let d = ancoraTime + 86400000; d < ini.getTime(); d += 86400000) {
          const iso = new Date(d).toISOString().slice(0, 10);
          const m = indexMovtos.get(iso);
          if (m) {
            saldoAtual += BigInt(m.creditos_cents) - BigInt(m.debitos_cents);
          }
        }

        // Registra na serie do periodo
        for (let i = 0; i < diasNoPeriodo; i++) {
          const d = new Date(ini.getTime() + i * 86400000);
          const iso = d.toISOString().slice(0, 10);
          const m = indexMovtos.get(iso);
          const cred = m ? BigInt(m.creditos_cents) : 0n;
          const deb = m ? BigInt(m.debitos_cents) : 0n;
          // So aplica o movto se data > ancora (proteje caso dtIni < ancora)
          if (d.getTime() > ancoraTime) {
            saldoAtual += cred - deb;
          }
          const acc = seriePorDia.get(iso)!;
          acc.saldo += saldoAtual;
          acc.cred += cred;
          acc.deb += deb;
        }
      }

      for (const [iso, agg] of seriePorDia.entries()) {
        serie.push({
          data: iso,
          saldoCents: Number(agg.saldo),
          creditosCents: Number(agg.cred),
          debitosCents: Number(agg.deb),
        });
      }
      serie.sort((a, b) => a.data.localeCompare(b.data));

      const saldoInicial = serie.length > 0 ? serie[0]!.saldoCents : 0;
      const saldoFinal = serie.length > 0 ? serie[serie.length - 1]!.saldoCents : 0;
      const contasIgnoradas = contas.length - contasComAncora.length;

      return {
        periodo: { dtIni: args.dtIni, dtFim: args.dtFim },
        contaId: args.contaId ?? null,
        ancoraValida: true,
        contasIncluidas: contasComAncora.map((c) => ({
          id: c.id,
          nome: c.nomeAmigavel ?? c.nomeContaBco,
          saldoAcmCents: Number(c.saldoAcmCents),
          dataSaldoAcm: c.dataSaldoAcm,
        })),
        serie,
        saldoInicialCents: saldoInicial,
        saldoFinalCents: saldoFinal,
        mensagem: contasIgnoradas > 0
          ? `${contasIgnoradas} conta(s) ignorada(s) por falta de ancora de saldo.`
          : undefined,
      };
    },

    /**
     * Projecao de caixa pra 30/60/90 dias.
     *
     * Combina: saldo inicial (calculado das contas com ancora) + entradas
     * previstas (CR vencendo, ajustadas por inadimplencia historica) -
     * saidas previstas (CP vencendo).
     *
     * Inadimplencia: calculada dos ultimos 6 meses (titulos vencidos no
     * periodo, % do valor que ficou em atraso ou foi cancelado). Override
     * via `inadimplenciaPerc` na query.
     */
    async projecao(args: ProjecaoQuery): Promise<ProjecaoResponse> {
      const dataReferencia = args.dataReferencia ?? new Date().toISOString().slice(0, 10);
      const horizonteDias = args.horizonteDias ?? 30;
      const incluirSecundarias = args.incluirSecundarias ?? false;

      const refTime = new Date(`${dataReferencia}T00:00:00Z`).getTime();
      const dtIni = new Date(refTime + 86400000).toISOString().slice(0, 10);
      const dtFim = new Date(refTime + horizonteDias * 86400000).toISOString().slice(0, 10);

      // 1. Saldo inicial = saldo na data de referencia (calculado on-the-fly)
      const saldoInicialResp = await this.saldoDiario({
        dtIni: dataReferencia,
        dtFim: dataReferencia,
        incluirSecundarias,
      });
      const saldoInicial = saldoInicialResp.ancoraValida ? saldoInicialResp.saldoFinalCents : 0;
      const saldoConfiavel = saldoInicialResp.ancoraValida;

      // 2. Inadimplencia historica (6 meses) — apenas se nao foi passado override
      let inadimpFonte: 'historico' | 'override' = 'historico';
      let inadimpPerc = 0;
      let crConsiderado = 0;
      let crAtrasadoOuCancelado = 0;
      let valorTotalCents = 0;
      let valorInadimpCents = 0;
      const janelaMeses = 6;

      if (args.inadimplenciaPerc !== undefined) {
        inadimpPerc = args.inadimplenciaPerc;
        inadimpFonte = 'override';
      } else {
        const inadimpRow = await crRepo.query<Array<{
          total: string; inadimp: string; valor_total: string; valor_inadimp: string;
        }>>(
          `SELECT
              COUNT(*)::text AS total,
              COUNT(*) FILTER (
                WHERE status = 'cancelado'
                   OR (status IN ('aberto','renegociado') AND data_vencimento < CURRENT_DATE - INTERVAL '30 days')
              )::text AS inadimp,
              COALESCE(SUM(
                valor_bruto_cents - desconto_cents + acrescimo_cents
                - vlr_inss_cents - vlr_irrf_cents - vlr_pis_cents
                - vlr_cofins_cents - vlr_csll_cents - vlr_iss_cents
              ), 0)::text AS valor_total,
              COALESCE(SUM(
                CASE WHEN status = 'cancelado'
                       OR (status IN ('aberto','renegociado') AND data_vencimento < CURRENT_DATE - INTERVAL '30 days')
                     THEN valor_bruto_cents - desconto_cents + acrescimo_cents
                          - vlr_inss_cents - vlr_irrf_cents - vlr_pis_cents
                          - vlr_cofins_cents - vlr_csll_cents - vlr_iss_cents
                     ELSE 0
                END
              ), 0)::text AS valor_inadimp
             FROM finance.contas_receber
            WHERE data_vencimento BETWEEN
              CURRENT_DATE - INTERVAL '${janelaMeses} months'
              AND CURRENT_DATE - INTERVAL '30 days'`,
        );
        const r = inadimpRow[0];
        crConsiderado = Number(r?.total ?? 0);
        crAtrasadoOuCancelado = Number(r?.inadimp ?? 0);
        valorTotalCents = Number(r?.valor_total ?? 0);
        valorInadimpCents = Number(r?.valor_inadimp ?? 0);
        inadimpPerc = valorTotalCents > 0
          ? Number(((valorInadimpCents / valorTotalCents) * 100).toFixed(2))
          : 0;
      }

      // 3a. RECEITA GDF (BRB Mobilidade) — fonte principal de receita.
      // Calcula media diaria dos resgates dos ultimos 60 dias e aplica glosa
      // historica como ajuste. Essa media e projetada igual pra cada dia
      // futuro do horizonte.
      const janelaGdfDias = 60;
      const gdfMediaRow = await gdfCelulaRepo.query<Array<{
        media_diaria: string | null; total: string; dias: string;
      }>>(
        `SELECT
            (COALESCE(SUM(valor_cents), 0)::numeric
              / NULLIF(COUNT(DISTINCT data_transporte), 0))::text AS media_diaria,
            COALESCE(SUM(valor_cents), 0)::text AS total,
            COUNT(DISTINCT data_transporte)::text AS dias
           FROM finance.recebivel_gdf_celula
          WHERE data_transporte >= CURRENT_DATE - (${janelaGdfDias} || ' days')::interval
            AND data_transporte < CURRENT_DATE
            AND excluido_em IS NULL`,
      );
      const gdfMediaDiariaCents = Math.round(Number(gdfMediaRow[0]?.media_diaria ?? 0));
      const gdfTotalHistoricoCents = Number(gdfMediaRow[0]?.total ?? 0);
      const gdfDiasAnalisados = Number(gdfMediaRow[0]?.dias ?? 0);
      const gdfHistoricoInsuficiente = gdfDiasAnalisados < 7;

      // 3b. Glosa historica: (esperado - recebido) / esperado nos ultimos 60d.
      const glosaRow = await movtoRepo.query<Array<{ esperado: string; recebido: string }>>(
        `SELECT
            (SELECT COALESCE(SUM(valor_cents), 0)::text FROM finance.recebivel_gdf_celula
              WHERE data_resgate >= CURRENT_DATE - (${janelaGdfDias} || ' days')::interval
                AND data_resgate < CURRENT_DATE
                AND excluido_em IS NULL) AS esperado,
            (SELECT COALESCE(SUM(valor_cents), 0)::text FROM finance.banco_movto
              WHERE data_movto >= CURRENT_DATE - (${janelaGdfDias} || ' days')::interval
                AND data_movto < CURRENT_DATE
                AND eh_repasse_brb = TRUE
                AND excluido_em IS NULL) AS recebido`,
      );
      const espHist = Number(glosaRow[0]?.esperado ?? 0);
      const recHist = Number(glosaRow[0]?.recebido ?? 0);
      // Glosa percentual: positiva quando recebeu MENOS que esperado (perda).
      // Clampada em [0, 100] — se recebeu mais (raro), assumimos 0% glosa.
      const glosaPercHistorica = espHist > 0
        ? Math.max(0, Math.min(100, ((espHist - recHist) / espHist) * 100))
        : 0;
      const gdfPrevistaDiariaCents = gdfHistoricoInsuficiente
        ? 0
        : Math.round(gdfMediaDiariaCents * (1 - glosaPercHistorica / 100));
      const gdfPrevistaHorizonteCents = gdfPrevistaDiariaCents * horizonteDias;

      // 4. CR vencendo por dia
      const crRows = await crRepo.query<Array<{ data: string; valor: string; qtd: string }>>(
        `SELECT data_vencimento::text AS data,
                COALESCE(SUM(
                  valor_bruto_cents - desconto_cents + acrescimo_cents
                  - vlr_inss_cents - vlr_irrf_cents - vlr_pis_cents
                  - vlr_cofins_cents - vlr_csll_cents - vlr_iss_cents
                ), 0)::text AS valor,
                COUNT(*)::text AS qtd
           FROM finance.contas_receber
          WHERE data_vencimento BETWEEN $1::date AND $2::date
            AND status IN ('aberto','renegociado')
            AND excluido_em IS NULL
          GROUP BY data_vencimento
          ORDER BY data_vencimento`,
        [dtIni, dtFim],
      );

      // 4. CP vencendo por dia
      // Status "em aberto": pendente (recebido, aguardando aprovação), aprovado
      // (aprovado mas não pago), em_aprovacao (em workflow). Exclui pago e cancelado.
      // CP não tem acrescimo_cents (diferente de CR) — usa valor_liquido_cents
      // direto, que já vem calculado pelo ETL.
      const cpRows = await cpRepo.query<Array<{ data: string; valor: string; qtd: string }>>(
        `SELECT data_vencimento::text AS data,
                COALESCE(SUM(valor_liquido_cents), 0)::text AS valor,
                COUNT(*)::text AS qtd
           FROM finance.contas_pagar
          WHERE data_vencimento BETWEEN $1::date AND $2::date
            AND status IN ('pendente','aprovado','em_aprovacao')
            AND excluido_em IS NULL
          GROUP BY data_vencimento
          ORDER BY data_vencimento`,
        [dtIni, dtFim],
      );

      // 5. Indexa por data
      const mapaCr = new Map(crRows.map((r) => [r.data, { valor: Number(r.valor), qtd: Number(r.qtd) }]));
      const mapaCp = new Map(cpRows.map((r) => [r.data, { valor: Number(r.valor), qtd: Number(r.qtd) }]));

      // 6. Monta serie dia-a-dia com saldo acumulado
      const serie: ProjecaoDia[] = [];
      const fator = 1 - inadimpPerc / 100;
      let acumulado = saldoInicial;
      let diasComGap = 0;
      let primeiraDataComGap: string | null = null;
      let gapMaximo = 0;
      let totalEntPrev = 0;
      let totalEntAjust = 0;
      let totalSaidPrev = 0;

      const iniTime = new Date(`${dtIni}T00:00:00Z`).getTime();
      for (let i = 0; i < horizonteDias; i++) {
        const d = new Date(iniTime + i * 86400000).toISOString().slice(0, 10);
        const cr = mapaCr.get(d);
        const cp = mapaCp.get(d);
        const crBruto = cr?.valor ?? 0;
        const crAjust = Math.round(crBruto * fator);
        const gdfAjust = gdfPrevistaDiariaCents;
        const entPrev = crBruto + gdfMediaDiariaCents; // CR bruto + GDF bruto (sem ajuste)
        const entAjust = crAjust + gdfAjust; // CR ajustado por inadimp + GDF ajustado por glosa
        const saidPrev = cp?.valor ?? 0;
        const saldoDia = entAjust - saidPrev;
        acumulado += saldoDia;
        totalEntPrev += entPrev;
        totalEntAjust += entAjust;
        totalSaidPrev += saidPrev;

        const temGap = acumulado < 0;
        if (temGap) {
          diasComGap += 1;
          if (!primeiraDataComGap) primeiraDataComGap = d;
          if (acumulado < gapMaximo) gapMaximo = acumulado;
        }

        serie.push({
          data: d,
          entradasPrevistasCents: entPrev,
          entradasAjustadasCents: entAjust,
          entradaCrBrutoCents: crBruto,
          entradaCrAjustadoCents: crAjust,
          entradaGdfAjustadoCents: gdfAjust,
          saidasPrevistasCents: saidPrev,
          saldoDoDiaCents: saldoDia,
          saldoAcumuladoCents: acumulado,
          temGap,
          qtdTitulosCr: cr?.qtd ?? 0,
          qtdTitulosCp: cp?.qtd ?? 0,
        });
      }

      let mensagem: string | undefined;
      if (!saldoConfiavel) {
        mensagem = 'Saldo inicial = 0 porque nenhuma conta principal tem ancora preenchida. ' +
                   'A projecao mostra apenas o delta (entradas - saidas) sem o saldo real.';
      } else if (diasComGap > 0) {
        mensagem = `Atencao: ${diasComGap} dia(s) com saldo negativo. Primeiro gap em ${primeiraDataComGap}.`;
      }

      return {
        periodo: { dataReferencia, dtIni, dtFim },
        horizonteDias,
        saldoInicialCents: saldoInicial,
        saldoConfiavel,
        contasIncluidas: saldoInicialResp.contasIncluidas.map((c) => ({
          id: c.id,
          nome: c.nome,
          saldoAtualCents: c.saldoAcmCents ?? 0,
        })),
        inadimplencia: {
          percentualAplicado: inadimpPerc,
          fonte: inadimpFonte,
          janelaMeses,
          crConsiderado,
          crAtrasadoOuCancelado,
          valorTotalCents,
          valorInadimplenteCents: valorInadimpCents,
        },
        receitaGdf: {
          janelaDias: janelaGdfDias,
          diasAnalisados: gdfDiasAnalisados,
          totalHistoricoCents: gdfTotalHistoricoCents,
          mediaDiariaCents: gdfMediaDiariaCents,
          glosaPercHistorica: Number(glosaPercHistorica.toFixed(2)),
          receitaPrevistaDiariaCents: gdfPrevistaDiariaCents,
          receitaPrevistaHorizonteCents: gdfPrevistaHorizonteCents,
          historicoInsuficiente: gdfHistoricoInsuficiente,
        },
        serie,
        resumo: {
          totalEntradasPrevistasCents: totalEntPrev,
          totalEntradasAjustadasCents: totalEntAjust,
          totalSaidasPrevistasCents: totalSaidPrev,
          saldoFinalProjetadoCents: acumulado,
          diasComGap,
          primeiraDataComGap,
          gapMaximoCents: gapMaximo,
        },
        mensagem,
      };
    },

    /**
     * Sync completo: BCOCONTA (cadastro) + BCOMOVTO (movimentacao mes corrente).
     */
    async sincronizar(args: { usuarioId: string }): Promise<SyncFluxoCaixaResponse> {
      const inicio = Date.now();
      const empresa = fastify.config.globus.empresaId;

      // 1. Cadastro de contas
      const syncConta = await contaAdapter.sincronizar({ empresa, usuarioId: args.usuarioId });
      let contasGravadasEtl = 0;
      let principaisMarcadas = 0;
      if (syncConta.status !== 'erro') {
        const r = await contaEtl.processarPendentes({ limite: 100 });
        contasGravadasEtl = r.gravados;
        principaisMarcadas = r.principaisMarcadas;
      }

      // 2. Movimentacao bancaria (mes corrente)
      const hoje = new Date();
      const dtIni = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
      const dtFimExcl = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 1));

      let movimentosLidos = 0;
      let movimentosGravados = 0;
      let jobIdMovto: string | null = null;
      let statusMovto: 'ok' | 'parcial' | 'erro' = 'ok';

      try {
        const syncMovto = await movtoAdapter.sincronizar({
          empresa,
          dtInicio: dtIni,
          dtFimExclusivo: dtFimExcl,
          usuarioId: args.usuarioId,
        });
        movimentosLidos = syncMovto.registrosLidos;
        jobIdMovto = syncMovto.jobId;
        statusMovto = syncMovto.status;
        if (syncMovto.status !== 'erro') {
          const r = await movtoEtl.processarPendentes({ limite: 10000 });
          movimentosGravados = r.gravados;
        }
      } catch (err) {
        fastify.log.warn({ err }, '[fluxo-caixa:sincronizar] BCOMOVTO falhou (cadastro continua valido)');
      }

      const status: SyncFluxoCaixaResponse['status'] =
        syncConta.status === 'erro' && statusMovto === 'erro'
          ? 'erro'
          : syncConta.status === 'erro' || statusMovto === 'erro' || syncConta.status === 'parcial'
            ? 'parcial'
            : 'ok';

      return {
        jobIdConta: syncConta.jobId,
        jobIdMovto,
        contasLidas: syncConta.registrosLidos,
        contasGravadas: contasGravadasEtl,
        contasPrincipaisMarcadas: principaisMarcadas,
        movimentosLidos,
        movimentosGravados,
        duracaoMs: Date.now() - inicio,
        status,
        mensagem: syncConta.mensagem,
      };
    },
  };
}

export type FluxoCaixaService = ReturnType<typeof buildFluxoCaixaService>;
