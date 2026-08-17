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
  CenariosQuery,
  CenariosResponse,
  CenarioFluxo,
  RealizadoEntradasQuery,
  RealizadoEntradasResponse,
  FluxoRealizadoQuery,
  FluxoRealizadoResponse,
} from '@pioneira/shared';
import { BancoConta } from '@/entities/banco-conta.entity.js';
import { BancoMovto } from '@/entities/banco-movto.entity.js';
import { ContaPagar } from '@/entities/conta-pagar.entity.js';
import { ContaReceber } from '@/entities/conta-receber.entity.js';
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
 *    Globus NÃO é confiável (ver memory/globus-saldo-bancario.md).
 *  - Âncora de saldo: preenchida MANUALMENTE pelo tesoureiro (saldoAcmCents +
 *    dataSaldoAcm). Sem ela, saldo dia-a-dia não calcula.
 *  - Saldo na data X: âncora + soma de banco_movto entre dataSaldoAcm+1 e X
 *    (créditos positivos, débitos negativos). Calculado on-the-fly.
 */
export function buildFluxoCaixaService(fastify: FastifyInstance) {
  const contaRepo = fastify.db.getRepository(BancoConta);
  const movtoRepo = fastify.db.getRepository(BancoMovto);
  const crRepo = fastify.db.getRepository(ContaReceber);
  const cpRepo = fastify.db.getRepository(ContaPagar);
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
      if (!conta) throw fastify.httpErrors.notFound('Conta bancária não encontrada');

      const antes = {
        saldoAcmCents: conta.saldoAcmCents === null ? null : Number(conta.saldoAcmCents),
        dataSaldoAcm: conta.dataSaldoAcm,
      };
      conta.saldoAcmCents = String(body.saldoCents);
      conta.dataSaldoAcm = body.dataSaldo;
      conta.saldoAcmAtualizadoPorUsuarioId = usuarioId;
      conta.saldoAcmAtualizadoEm = new Date();
      await contaRepo.save(conta);

      await fastify.auditoria.registrarAlteracao({
        usuarioId,
        recurso: 'conta-bancaria',
        recursoId: conta.id,
        descricao: `Âncora de saldo — ${conta.nomeAmigavel ?? conta.nomeContaBco}`,
        antes,
        depois: { saldoAcmCents: body.saldoCents, dataSaldoAcm: body.dataSaldo },
      });

      fastify.log.info(
        { contaId, saldoCents: body.saldoCents, dataSaldo: body.dataSaldo, usuarioId },
        '[fluxo-caixa] ancora de saldo atualizada',
      );
      return toContaBancaria(conta);
    },

    async setEhPrincipal(contaId: string, ehPrincipal: boolean): Promise<ContaBancaria> {
      const conta = await contaRepo.findOne({ where: { id: contaId, excluidoEm: IsNull() } });
      if (!conta) throw fastify.httpErrors.notFound('Conta bancária não encontrada');
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
     * **Importante:** só retorna série pra contas com âncora preenchida.
     * Contas sem âncora são ignoradas e mencionadas em `mensagem`.
     */
    async saldoDiario(args: {
      dtIni: string;
      dtFim: string;
      contaId?: string;
      incluirSecundarias?: boolean;
    }): Promise<SaldoDiarioResponse> {
      // 1. Carrega contas elegíveis
      const contas = args.contaId
        ? await contaRepo.find({ where: { id: args.contaId, excluidoEm: IsNull() } })
        : await contaRepo.find({ where: { excluidoEm: IsNull() } });

      const contasComAncora = contas.filter(
        (c) => c.saldoAcmCents !== null && c.dataSaldoAcm !== null
          && (args.contaId || args.incluirSecundarias || c.ehPrincipal),
      );

      if (contasComAncora.length === 0) {
        const mensagem = args.contaId
          ? 'Esta conta não tem âncora de saldo configurada. Peça pro tesoureiro digitar o saldo atual.'
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

      // 2. Pra cada conta, busca os movtos a partir da âncora até dtFim
      // 3. Gera série dia-a-dia consolidada
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

        // Calcula saldo cumulativo da âncora até cada dia do período
        let saldoAtual = ancoraSaldo;
        const ancoraTime = new Date(`${ancoraData}T00:00:00Z`).getTime();
        const indexMovtos = new Map(movtos.map((m) => [m.data, m]));

        // Aplica movtos entre âncora+1 e dtIni-1 (sem registrar na série)
        for (let d = ancoraTime + 86400000; d < ini.getTime(); d += 86400000) {
          const iso = new Date(d).toISOString().slice(0, 10);
          const m = indexMovtos.get(iso);
          if (m) {
            saldoAtual += BigInt(m.creditos_cents) - BigInt(m.debitos_cents);
          }
        }

        // Registra na série do período
        for (let i = 0; i < diasNoPeriodo; i++) {
          const d = new Date(ini.getTime() + i * 86400000);
          const iso = d.toISOString().slice(0, 10);
          const m = indexMovtos.get(iso);
          const cred = m ? BigInt(m.creditos_cents) : 0n;
          const deb = m ? BigInt(m.debitos_cents) : 0n;
          // Só aplica o movto se data > âncora (protege caso dtIni < âncora)
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
          ? `${contasIgnoradas} conta(s) ignorada(s) por falta de âncora de saldo.`
          : undefined,
      };
    },

    /**
     * Fluxo REALIZADO de um período: entrou (créditos) x saiu (débitos) de fato
     * no extrato (banco_movto), dia a dia. Não é projeção — é o que já aconteceu.
     * Mesma classificação crédito/débito do saldoDiario. Não depende de âncora
     * (é fluxo, não saldo). Consolida todas as contas (o extrato inteiro).
     */
    async fluxoRealizado(args: FluxoRealizadoQuery): Promise<FluxoRealizadoResponse> {
      const rows = await movtoRepo.query<Array<{ data: string; entrou: string; saiu: string }>>(
        `SELECT data_movto::text AS data,
                COALESCE(SUM(CASE WHEN cod_histo_bco IN (908, 901, 902, 903, 905, 909, 910) OR debito_credito = 'C' THEN valor_cents ELSE 0 END), 0)::text AS entrou,
                COALESCE(SUM(CASE WHEN NOT (cod_histo_bco IN (908, 901, 902, 903, 905, 909, 910)) AND (debito_credito IS NULL OR debito_credito = 'D') THEN valor_cents ELSE 0 END), 0)::text AS saiu
           FROM finance.banco_movto
          WHERE data_movto >= $1::date AND data_movto <= $2::date AND excluido_em IS NULL
          GROUP BY data_movto
          ORDER BY data_movto`,
        [args.dataInicio, args.dataFim],
      );

      const porDia = new Map(rows.map((r) => [r.data, { entrou: Number(r.entrou), saiu: Number(r.saiu) }]));
      const ini = new Date(`${args.dataInicio}T00:00:00Z`);
      const fim = new Date(`${args.dataFim}T00:00:00Z`);
      const dias = Math.max(1, Math.ceil((fim.getTime() - ini.getTime()) / 86400000) + 1);

      const serie: FluxoRealizadoResponse['serie'] = [];
      let totalEntrou = 0;
      let totalSaiu = 0;
      let diasComSaidaMaior = 0;
      for (let i = 0; i < dias; i++) {
        const iso = new Date(ini.getTime() + i * 86400000).toISOString().slice(0, 10);
        const m = porDia.get(iso) ?? { entrou: 0, saiu: 0 };
        serie.push({ data: iso, entrouCents: m.entrou, saiuCents: m.saiu });
        totalEntrou += m.entrou;
        totalSaiu += m.saiu;
        if (m.saiu > m.entrou) diasComSaidaMaior += 1;
      }

      const semMovimento = totalEntrou === 0 && totalSaiu === 0;
      return {
        periodo: { dataInicio: args.dataInicio, dataFim: args.dataFim },
        serie,
        totalEntrouCents: totalEntrou,
        totalSaiuCents: totalSaiu,
        variacaoCents: totalEntrou - totalSaiu,
        diasComSaidaMaior,
        mensagem: semMovimento
          ? 'Sem movimento no extrato para este período. Sincronize o extrato (Fluxo de Caixa) ou escolha outro período.'
          : undefined,
      };
    },

    /**
     * Projeção de caixa pra 30/60/90 dias.
     *
     * Combina: saldo inicial (calculado das contas com âncora) + entradas
     * previstas (CR vencendo, ajustadas por inadimplência histórica) -
     * saídas previstas (CP vencendo).
     *
     * Inadimplência: calculada dos últimos 6 meses (títulos vencidos no
     * período, % do valor que ficou em atraso ou foi cancelado). Override
     * via `inadimplenciaPerc` na query.
     */
    async projecao(args: ProjecaoQuery): Promise<ProjecaoResponse> {
      const dataReferencia = args.dataReferencia ?? new Date().toISOString().slice(0, 10);
      const horizonteDias = args.horizonteDias ?? 30;
      const incluirSecundarias = args.incluirSecundarias ?? false;

      const refTime = new Date(`${dataReferencia}T00:00:00Z`).getTime();
      const dtIni = new Date(refTime + 86400000).toISOString().slice(0, 10);
      const dtFim = new Date(refTime + horizonteDias * 86400000).toISOString().slice(0, 10);

      // 1. Saldo inicial = saldo na data de referência (calculado on-the-fly)
      const saldoInicialResp = await this.saldoDiario({
        dtIni: dataReferencia,
        dtFim: dataReferencia,
        incluirSecundarias,
      });
      const saldoInicial = saldoInicialResp.ancoraValida ? saldoInicialResp.saldoFinalCents : 0;
      const saldoConfiavel = saldoInicialResp.ancoraValida;

      // 2. Inadimplência histórica (6 meses) — apenas se não foi passado override
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

      // 3. RECEITA GDF (repasse BRB Mobilidade) — fonte PRINCIPAL de receita.
      // Base = repasses REAIS que caíram no extrato (banco_movto, eh_repasse_brb),
      // NÃO a matriz de bilhetagem (recebivel_gdf_celula). A matriz é só o que o
      // passageiro pagou no cartão (~6x menor); o dinheiro que de fato entra é a
      // TARIFA TÉCNICA + o complemento das gratuidades, que chega depois e maior,
      // às vezes referente a meses anteriores. Como o extrato já é o realizado,
      // não há "glosa" a aplicar — é o dinheiro que efetivamente entrou.
      // Janela de 60 dias. O repasse do GDF é irregular e cíclico — às vezes vem
      // um complemento gordo de meses anteriores num período e pouco em outro.
      // 30 dias undershootava (pegava um vale e projetava caixa baixo demais);
      // 60 dias atravessa o ciclo de pagamento e cai no ~mensal real (~R$30M).
      // NOVO (ver receita-tdmax): a receita da API TD Max é NOMINAL (passageiros ×
      // tarifa técnica cheia). O GDF paga um EFETIVO menor (gratuidade/meia/integração)
      // => fator de realização ~0,64. Projetamos: repasse diário = média diária GERADA
      // (TD Max, estável) × fator (janela longa, auto-recalibrado). Usar a tarifa cheia
      // superprojeta ~56%. Fallback: se não há TD Max sincronizado, média dos repasses 908.
      const janelaGdfDias = 60;
      const gdfRow = await movtoRepo.query<Array<{ total60: string; dias60: string; repasse7: string }>>(
        `SELECT COALESCE(SUM(CASE WHEN data_movto >= CURRENT_DATE - 60 THEN valor_cents ELSE 0 END), 0)::text AS total60,
                COUNT(DISTINCT CASE WHEN data_movto >= CURRENT_DATE - 60 THEN data_movto END)::text AS dias60,
                COALESCE(SUM(CASE WHEN data_movto >= CURRENT_DATE - 7 THEN valor_cents ELSE 0 END), 0)::text AS repasse7
           FROM finance.banco_movto
          WHERE data_movto >= CURRENT_DATE - 90 AND data_movto < CURRENT_DATE
            AND eh_repasse_brb = TRUE AND excluido_em IS NULL`,
      );
      const gdfTotalHistoricoCents = Number(gdfRow[0]?.total60 ?? 0);
      const gdfDiasComRepasse = Number(gdfRow[0]?.dias60 ?? 0);
      const repasse7Cents = Number(gdfRow[0]?.repasse7 ?? 0);

      // Fator de realização = repasse / gerado na MESMA janela alinhada. CRÍTICO:
      // o extrato (banco_movto) costuma ter cobertura menor que o TD Max; se dividir
      // 89d de gerado por uma janela de repasse que começa antes do extrato existir,
      // o fator despenca (0,47 falso). Ancoramos o piso da janela no início da
      // cobertura do extrato (limitado a 90d) e somamos as DUAS séries nesse intervalo.
      // Base diária nominal: soma 30d / dias efetivamente sincronizados (não /30 fixo,
      // pois os últimos ~2 dias do TD Max costumam faltar). A receber (cauda do lag):
      // gerado 7d × fator - repasse 7d.
      const tdmaxRow = await movtoRepo.query<
        Array<{ janela_lo: string; repasse_fator: string; gerado_fator: string; gerado30: string; dias30: string; gerado7: string }>
      >(
        `WITH lim AS (
           SELECT GREATEST(
             COALESCE((SELECT MIN(data_movto) FROM finance.banco_movto WHERE eh_repasse_brb = TRUE AND excluido_em IS NULL), CURRENT_DATE - 90),
             CURRENT_DATE - 90
           ) AS lo
         )
         SELECT
           (SELECT lo FROM lim)::text AS janela_lo,
           COALESCE((SELECT SUM(b.valor_cents) FROM finance.banco_movto b, lim
                      WHERE b.data_movto >= lim.lo AND b.data_movto < CURRENT_DATE
                        AND b.eh_repasse_brb = TRUE AND b.excluido_em IS NULL), 0)::text AS repasse_fator,
           COALESCE((SELECT SUM(t.receita_total_cents) FROM finance.receita_tdmax t, lim
                      WHERE t.data >= lim.lo AND t.data < CURRENT_DATE), 0)::text AS gerado_fator,
           COALESCE((SELECT SUM(receita_total_cents) FROM finance.receita_tdmax WHERE data >= CURRENT_DATE - 30 AND data < CURRENT_DATE), 0)::text AS gerado30,
           COALESCE((SELECT COUNT(*) FROM finance.receita_tdmax WHERE data >= CURRENT_DATE - 30 AND data < CURRENT_DATE), 0)::text AS dias30,
           COALESCE((SELECT SUM(receita_total_cents) FROM finance.receita_tdmax WHERE data >= CURRENT_DATE - 7 AND data < CURRENT_DATE), 0)::text AS gerado7`,
      );
      const repasseFatorCents = Number(tdmaxRow[0]?.repasse_fator ?? 0);
      const geradoFatorCents = Number(tdmaxRow[0]?.gerado_fator ?? 0);
      const gerado30Cents = Number(tdmaxRow[0]?.gerado30 ?? 0);
      const dias30Tdmax = Number(tdmaxRow[0]?.dias30 ?? 0);
      const gerado7Cents = Number(tdmaxRow[0]?.gerado7 ?? 0);

      const temTdmax = geradoFatorCents > 0 && repasseFatorCents > 0;
      const fatorRealizacao = temTdmax ? repasseFatorCents / geradoFatorCents : 0;
      // Média diária NOMINAL (tarifa cheia) da geração TD Max, por dia sincronizado.
      const receitaNominalDiariaCents = dias30Tdmax > 0 ? Math.round(gerado30Cents / dias30Tdmax) : 0;
      // A receber já gerado (cauda do lag ~poucos dias): gerado 7d × fator - repasse 7d.
      const aReceberGeradoCents = temTdmax ? Math.max(0, Math.round(gerado7Cents * fatorRealizacao) - repasse7Cents) : 0;

      const gdfMediaDiariaCents = Math.round(gdfTotalHistoricoCents / janelaGdfDias); // média 908 (fallback/referência)
      const gdfHistoricoInsuficiente = temTdmax ? false : gdfTotalHistoricoCents <= 0;
      const fonteGdf: 'tdmax' | 'extrato' = temTdmax ? 'tdmax' : 'extrato';
      // Diária prevista: TD Max (nominal × fator) OU fallback 908. Override = cenários.
      const gdfDiariaBaseCents = temTdmax ? Math.round(receitaNominalDiariaCents * fatorRealizacao) : gdfMediaDiariaCents;
      const gdfPrevistaDiariaCents = args.gdfMediaDiariaOverrideCents !== undefined
        ? args.gdfMediaDiariaOverrideCents
        : (gdfHistoricoInsuficiente ? 0 : gdfDiariaBaseCents);
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

      // FOLHA (salários líquidos) — a maior saída da empresa, hoje ausente do CP
      // (só a pensão entra no CP como origem=folha). Pega o líquido da folha
      // Mensal mais recente (proventos − descontos) e projeta a média diária.
      // Encargos/guias e pensão NÃO entram aqui (ficam no CP) pra não duplicar.
      const folhaRow = await movtoRepo.query<Array<{ competencia: string | null; liquido: string }>>(
        `SELECT TO_CHAR(fe.competencia, 'YYYY-MM') AS competencia,
                COALESCE(SUM(CASE WHEN ev.tipo = 'P' THEN fe.valor_cents
                                  WHEN ev.tipo = 'D' THEN -fe.valor_cents ELSE 0 END), 0)::text AS liquido
           FROM finance.ficha_evento fe
           JOIN finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
          WHERE fe.tipo_folha = 1
            AND fe.competencia = (SELECT MAX(competencia) FROM finance.ficha_evento WHERE tipo_folha = 1)
          GROUP BY fe.competencia`,
      );
      const folhaCompetencia = folhaRow[0]?.competencia ?? null;
      const folhaLiquidoMensalCents = Number(folhaRow[0]?.liquido ?? 0);
      const folhaDisponivel = folhaLiquidoMensalCents > 0;
      // Média por dia corrido (folha é ~mensal; distribui no horizonte). Timing
      // exato (5º dia útil / adiantamento dia 20) fica pra uma v2.
      const folhaMediaDiariaCents = folhaDisponivel ? Math.round(folhaLiquidoMensalCents / 30) : 0;
      const folhaHorizonteCents = folhaMediaDiariaCents * horizonteDias;

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

      // Feriados no horizonte — SÓ marcam o dia, não alteram valores. Recorrentes
      // casam por mês/dia. Best-effort: se a tabela não existir (migration não
      // rodada) ou a query falhar, segue sem marcar (não quebra a projeção).
      const feriadoExato = new Map<string, string>();
      const feriadoRecorrente = new Map<string, string>();
      try {
        const feriadoRows = await movtoRepo.query<Array<{ data: string; nome: string; recorrente: boolean }>>(
          `SELECT data::text AS data, nome, recorrente
             FROM identity.feriado
            WHERE recorrente = true OR (data >= $1::date AND data <= $2::date)`,
          [dtIni, dtFim],
        );
        for (const f of feriadoRows) {
          if (f.recorrente) feriadoRecorrente.set(f.data.slice(5), f.nome);
          else feriadoExato.set(f.data, f.nome);
        }
      } catch (err) {
        fastify.log.warn({ err }, '[fluxo-caixa] feriados indisponíveis (projeção segue sem marcar)');
      }

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
        const saidaCp = cp?.valor ?? 0;
        const saidaFolha = folhaMediaDiariaCents;
        const saidPrev = saidaCp + saidaFolha;
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
          saidaCpCents: saidaCp,
          saidaFolhaCents: saidaFolha,
          saldoDoDiaCents: saldoDia,
          saldoAcumuladoCents: acumulado,
          temGap,
          qtdTitulosCr: cr?.qtd ?? 0,
          qtdTitulosCp: cp?.qtd ?? 0,
          feriadoNome: feriadoExato.get(d) ?? feriadoRecorrente.get(d.slice(5)) ?? null,
        });
      }

      let mensagem: string | undefined;
      if (!saldoConfiavel) {
        mensagem = 'Saldo inicial = 0 porque nenhuma conta principal tem âncora preenchida. ' +
                   'A projeção mostra apenas o delta (entradas - saídas) sem o saldo real.';
      } else if (diasComGap > 0) {
        mensagem = `Atenção: ${diasComGap} dia(s) com saldo negativo. Primeiro gap em ${primeiraDataComGap}.`;
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
          fonte: fonteGdf,
          janelaDias: janelaGdfDias,
          diasComRepasse: gdfDiasComRepasse,
          totalHistoricoCents: gdfTotalHistoricoCents,
          mediaDiariaCents: gdfMediaDiariaCents,
          receitaPrevistaDiariaCents: gdfPrevistaDiariaCents,
          receitaPrevistaHorizonteCents: gdfPrevistaHorizonteCents,
          historicoInsuficiente: gdfHistoricoInsuficiente,
          fatorRealizacao: Math.round(fatorRealizacao * 10000) / 10000,
          receitaNominalDiariaCents,
          aReceberGeradoCents,
        },
        folha: {
          disponivel: folhaDisponivel,
          competenciaBase: folhaCompetencia,
          liquidoMensalCents: folhaLiquidoMensalCents,
          mediaDiariaCents: folhaMediaDiariaCents,
          horizonteCents: folhaHorizonteCents,
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
     * Cenários otimista / realista / pessimista. Mesmo motor da projeção, rodado
     * 3x variando os DOIS parâmetros que de fato oscilam no caixa: a inadimplência
     * do CR e o repasse GDF (irregular). As premissas de otimista/pessimista vêm da
     * variação MENSAL REAL (min/max dos últimos meses) — nada de fator inventado.
     * CR/CP/folha vencendo são os mesmos nos 3 (títulos já agendados).
     */
    async cenarios(args: CenariosQuery): Promise<CenariosResponse> {
      const dataReferencia = args.dataReferencia ?? new Date().toISOString().slice(0, 10);
      const horizonteDias = args.horizonteDias ?? 30;
      const incluirSecundarias = args.incluirSecundarias ?? false;
      const janelaMeses = 6;

      const valorLiquidoCr =
        `valor_bruto_cents - desconto_cents + acrescimo_cents ` +
        `- vlr_inss_cents - vlr_irrf_cents - vlr_pis_cents - vlr_cofins_cents - vlr_csll_cents - vlr_iss_cents`;

      // 1. Inadimplência por MÊS (últimos 6 meses) -> menor (otimista) / maior (pessimista).
      const inadimpMesRows = await crRepo.query<Array<{ total: string; inadimp: string }>>(
        `SELECT COALESCE(SUM(${valorLiquidoCr}), 0)::text AS total,
                COALESCE(SUM(CASE WHEN status = 'cancelado'
                                    OR (status IN ('aberto','renegociado') AND data_vencimento < CURRENT_DATE - INTERVAL '30 days')
                                  THEN ${valorLiquidoCr} ELSE 0 END), 0)::text AS inadimp
           FROM finance.contas_receber
          WHERE data_vencimento BETWEEN CURRENT_DATE - INTERVAL '${janelaMeses} months' AND CURRENT_DATE - INTERVAL '30 days'
            AND excluido_em IS NULL
          GROUP BY date_trunc('month', data_vencimento)
         HAVING SUM(${valorLiquidoCr}) > 0`,
      );
      const percsInadimp = inadimpMesRows
        .map((r) => (Number(r.total) > 0 ? (Number(r.inadimp) / Number(r.total)) * 100 : null))
        .filter((x): x is number => x !== null);
      const temInadimpMensal = percsInadimp.length > 0;
      const inadimpMin = temInadimpMensal ? Number(Math.min(...percsInadimp).toFixed(2)) : undefined;
      const inadimpMax = temInadimpMensal ? Number(Math.max(...percsInadimp).toFixed(2)) : undefined;

      // 2. Repasse GDF por MÊS cheio (últimos 6 meses) -> maior (otimista) / menor
      // (pessimista) diária. Divide por 30 (consistente com o resto da projeção).
      const gdfMesRows = await movtoRepo.query<Array<{ total: string }>>(
        `SELECT SUM(valor_cents)::text AS total
           FROM finance.banco_movto
          WHERE eh_repasse_brb = TRUE AND excluido_em IS NULL
            AND data_movto >= date_trunc('month', CURRENT_DATE) - INTERVAL '${janelaMeses} months'
            AND data_movto < date_trunc('month', CURRENT_DATE)
          GROUP BY date_trunc('month', data_movto)`,
      );
      const diariasGdf = gdfMesRows
        .map((r) => Math.round(Number(r.total) / 30))
        .filter((x) => x > 0);
      const temGdfMensal = diariasGdf.length > 0;
      const gdfMelhorDiaria = temGdfMensal ? Math.max(...diariasGdf) : undefined;
      const gdfPiorDiaria = temGdfMensal ? Math.min(...diariasGdf) : undefined;

      // 3. Roda o MESMO motor 3x com as premissas de cada cenario.
      const base = { dataReferencia, horizonteDias, incluirSecundarias };
      const [oti, rea, pes] = await Promise.all([
        this.projecao({ ...base, inadimplenciaPerc: inadimpMin, gdfMediaDiariaOverrideCents: gdfMelhorDiaria }),
        this.projecao({ ...base }),
        this.projecao({ ...base, inadimplenciaPerc: inadimpMax, gdfMediaDiariaOverrideCents: gdfPiorDiaria }),
      ]);

      const montar = (
        chave: CenarioFluxo['chave'],
        nome: string,
        p: ProjecaoResponse,
      ): CenarioFluxo => {
        const entra = p.resumo.totalEntradasAjustadasCents;
        const sai = p.resumo.totalSaidasPrevistasCents;
        return {
          chave,
          nome,
          inadimplenciaPerc: p.inadimplencia.percentualAplicado,
          gdfMediaDiariaCents: p.receitaGdf.receitaPrevistaDiariaCents,
          totalEntradasAjustadasCents: entra,
          totalSaidasCents: sai,
          sobraCents: entra - sai,
          coberturaPerc: sai > 0 ? Number(((entra / sai) * 100).toFixed(1)) : entra > 0 ? 999.9 : 0,
          saldoFinalProjetadoCents: p.resumo.saldoFinalProjetadoCents,
          diasComGap: p.resumo.diasComGap,
          gapMaximoCents: p.resumo.gapMaximoCents,
        };
      };

      const observacoes = [
        'Os 3 cenários usam o MESMO motor da projeção — mudam só 2 premissas que de fato oscilam: a inadimplência do CR e o repasse GDF (irregular).',
        temGdfMensal
          ? 'Repasse GDF: otimista usa o MELHOR mês observado; pessimista o PIOR (últimos 6 meses do extrato). Realista = média 60d.'
          : 'Sem histórico mensal de repasse GDF — os 3 cenários usam a mesma média do realista nesse componente.',
        temInadimpMensal
          ? 'Inadimplência: otimista usa o mês de MENOR inadimplência; pessimista o de MAIOR (últimos 6 meses). Realista = média do período.'
          : 'Sem histórico mensal de inadimplência — os 3 cenários usam a inadimplência média nesse componente.',
        'CR, CP e folha vencendo são os mesmos nos 3 — são títulos já agendados; o que muda é quanto do previsto realmente entra.',
      ];

      return {
        periodo: rea.periodo,
        horizonteDias,
        saldoInicialCents: rea.saldoInicialCents,
        saldoConfiavel: rea.saldoConfiavel,
        cenarios: [montar('otimista', 'Otimista', oti), montar('realista', 'Realista', rea), montar('pessimista', 'Pessimista', pes)],
        premissas: {
          inadimplencia: {
            fonte: temInadimpMensal ? 'melhor/pior mês observado' : 'média histórica (sem variação mensal)',
            janelaMeses,
            otimistaPerc: oti.inadimplencia.percentualAplicado,
            realistaPerc: rea.inadimplencia.percentualAplicado,
            pessimistaPerc: pes.inadimplencia.percentualAplicado,
          },
          gdf: {
            fonte: temGdfMensal ? 'melhor/pior mês do extrato' : 'média 60d (sem variação mensal)',
            janelaMeses,
            otimistaDiariaCents: oti.receitaGdf.receitaPrevistaDiariaCents,
            realistaDiariaCents: rea.receitaGdf.receitaPrevistaDiariaCents,
            pessimistaDiariaCents: pes.receitaGdf.receitaPrevistaDiariaCents,
          },
        },
        observacoes,
        mensagem: rea.saldoConfiavel
          ? undefined
          : 'Saldo inicial = 0 (nenhuma conta com âncora). Os cenários comparam só o delta entra − sai.',
      };
    },

    /**
     * "O que JÁ entrou" — créditos reais do extrato nos últimos N dias, separando
     * o repasse GDF (mesma fonte da projeção) do resto. Ponte pro Recebíveis, que
     * tem o detalhe completo por origem.
     */
    async realizadoEntradas(args: RealizadoEntradasQuery): Promise<RealizadoEntradasResponse> {
      const dias = args.dias ?? 30;
      // Créditos = mesma definição usada no saldo diário (cod_histo de crédito OU
      // debito_credito='C'). GDF = subconjunto marcado eh_repasse_brb.
      const rows = await movtoRepo.query<Array<{ total: string; gdf: string; dmax: string | null }>>(
        `SELECT COALESCE(SUM(CASE WHEN cod_histo_bco IN (908, 901, 902, 903, 905, 909, 910) OR debito_credito = 'C'
                                  THEN valor_cents ELSE 0 END), 0)::text AS total,
                COALESCE(SUM(CASE WHEN eh_repasse_brb = TRUE THEN valor_cents ELSE 0 END), 0)::text AS gdf,
                MAX(data_movto)::text AS dmax
           FROM finance.banco_movto
          WHERE data_movto >= CURRENT_DATE - ($1 || ' days')::interval
            AND data_movto < CURRENT_DATE
            AND excluido_em IS NULL`,
        [dias],
      );
      const total = Number(rows[0]?.total ?? 0);
      const gdf = Number(rows[0]?.gdf ?? 0);
      const dtFim = new Date().toISOString().slice(0, 10);
      const dtIni = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);

      return {
        dias,
        dtIni,
        dtFim,
        totalCreditosCents: total,
        gdfCents: gdf,
        outrosCents: Math.max(0, total - gdf),
        atualizadoEm: rows[0]?.dmax ?? null,
      };
    },

    /**
     * Sync completo: BCOCONTA (cadastro) + BCOMOVTO (movimentação mês corrente).
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

      // 2. Movimentação bancária (mês corrente)
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
        fastify.log.warn({ err }, '[fluxo-caixa:sincronizar] BCOMOVTO falhou (cadastro continua válido)');
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
