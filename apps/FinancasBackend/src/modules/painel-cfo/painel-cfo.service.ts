import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import type {
  PainelCfoQuery,
  PainelCfoResponse,
  KpiCfo,
  AlertaCfo,
  ComparativoCfo,
  ComparativoDelta,
  ComparativoPonto,
  EstadoDado,
} from '@pioneira/shared';
import { buildDreService } from '@/modules/dre/dre.service.js';
import { buildFluxoCaixaService } from '@/modules/fluxo-caixa/fluxo-caixa.service.js';
import { buildContasPagarService } from '@/modules/contas-pagar/contas-pagar.service.js';
import { buildOrcamentoService } from '@/modules/orcamento/orcamento.service.js';
import { buildRecebiveisGdfService } from '@/modules/recebiveis-gdf/recebiveis-gdf.service.js';
import { dataIsoSp, agoraIso } from '@/shared/utils/datetime.js';

// ============================================================================
// PAINEL CFO — service de CONSOLIDAÇÃO.
// ----------------------------------------------------------------------------
// Não consulta o Globus: reusa os services já prontos (factory functions) +
// poucas queries diretas em finance.* para derivar DPO/DSO/folha. Cada KPI
// carrega seu `estado` explícito (real/calculado/projetado/sem_dado).
// ============================================================================

/** Formato curto de moeda para textos de alerta (ex.: "R$ 1,2 M"). */
function moedaCurta(cents: number): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${s}R$ ${(abs / 1_000_000).toFixed(2)} M`;
  if (abs >= 1_000) return `${s}R$ ${(abs / 1_000).toFixed(0)} K`;
  return `${s}R$ ${abs.toFixed(2)}`;
}

/** Variação percentual sobre a base (denominador em módulo). Null se base = 0. */
function deltaPerc(atual: number, base: number): number | null {
  if (base === 0) return null;
  return Number((((atual - base) / Math.abs(base)) * 100).toFixed(1));
}

/** Limites [ini, fimExclusivo) do mês-calendário de uma competência 'YYYY-MM-01'. */
function mesBounds(competencia: string): { ini: string; fimExcl: string } {
  const d = new Date(`${competencia.slice(0, 10)}T00:00:00Z`);
  const ini = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const fimExcl = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
  return { ini, fimExcl };
}

const ORDEM_NIVEL: Record<AlertaCfo['nivel'], number> = { critico: 0, atencao: 1, info: 2 };

export function buildPainelCfoService(fastify: FastifyInstance) {
  const dre = buildDreService(fastify);
  const fluxo = buildFluxoCaixaService(fastify);
  const cp = buildContasPagarService(fastify);
  const orcamento = buildOrcamentoService(fastify);
  const recebiveisGdf = buildRecebiveisGdfService(fastify);

  /** GDF (eh_repasse_brb) recebido no extrato num mês-calendário. */
  async function gdfDoMes(competencia: string): Promise<number> {
    const { ini, fimExcl } = mesBounds(competencia);
    const rows = await fastify.db.query<Array<{ total: string }>>(
      `SELECT COALESCE(SUM(valor_cents), 0)::text AS total
         FROM finance.banco_movto
        WHERE eh_repasse_brb = TRUE AND excluido_em IS NULL
          AND data_movto >= $1::date AND data_movto < $2::date`,
      [ini, fimExcl],
    );
    return Number(rows[0]?.total ?? 0);
  }

  /** Líquido (proventos - descontos) das últimas 2 competências da folha Mensal (FLP). */
  async function folhaUltimas2(): Promise<Array<{ competencia: string; liquidoCents: number }>> {
    const rows = await fastify.db.query<Array<{ competencia: string; liquido: string }>>(
      `SELECT fe.competencia::text AS competencia,
              COALESCE(SUM(CASE WHEN ev.tipo = 'P' THEN fe.valor_cents
                                WHEN ev.tipo = 'D' THEN -fe.valor_cents ELSE 0 END), 0)::text AS liquido
         FROM finance.ficha_evento fe
         JOIN finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
        WHERE fe.tipo_folha = 1
        GROUP BY fe.competencia
        ORDER BY fe.competencia DESC
        LIMIT 2`,
    );
    return rows.map((r) => ({ competencia: r.competencia, liquidoCents: Number(r.liquido) }));
  }

  /** Insumos de DPO: títulos em aberto e pagamento médio diário (90 dias). */
  async function dpoInsumos(): Promise<{ abertoCents: number; pago90Cents: number }> {
    const rows = await fastify.db.query<Array<{ aberto: string; pago90: string }>>(
      `SELECT
          COALESCE(SUM(CASE WHEN status IN ('pendente','aprovado','em_aprovacao')
                            THEN valor_liquido_cents ELSE 0 END), 0)::text AS aberto,
          COALESCE(SUM(CASE WHEN status = 'pago' AND data_pagamento >= CURRENT_DATE - INTERVAL '90 days'
                            THEN valor_liquido_cents ELSE 0 END), 0)::text AS pago90
         FROM finance.contas_pagar
        WHERE excluido_em IS NULL`,
    );
    return { abertoCents: Number(rows[0]?.aberto ?? 0), pago90Cents: Number(rows[0]?.pago90 ?? 0) };
  }

  /**
   * DSO pela ótica do GDF (a receita real da Pioneira): tempo médio entre o
   * transporte e o resgate na matriz BRB. A receita tradicional (CR) é residual
   * nesta operação, então o ciclo do GDF é o DSO representativo. Retorna null se
   * a matriz não tiver dado no período.
   */
  async function dsoGdfDias(): Promise<number | null> {
    const hoje = dataIsoSp();
    const dtIni = dataIsoSp(new Date(Date.now() - 30 * 86400000));
    try {
      const mapa = await recebiveisGdf.mapaDiario({ dtIni, dtFim: hoje });
      if (mapa.totais.datasTransp <= 0) return null;
      return Number(mapa.totais.tempoMedioDias.toFixed(1));
    } catch (err) {
      fastify.log.warn({ err }, '[painel-cfo] DSO/GDF indisponível (matriz BRB sem dado)');
      return null;
    }
  }

  function montarComparativo(serie: ComparativoPonto[]): ComparativoCfo {
    if (serie.length === 0) return { serie, mom: null, yoy: null };
    const atual = serie[serie.length - 1]!;
    const delta = (base: ComparativoPonto, rotulo: string): ComparativoDelta => ({
      rotulo,
      atualLabel: atual.competenciaLabel,
      baseLabel: base.competenciaLabel,
      receitaAtualCents: atual.receitaLiquidaCents,
      receitaBaseCents: base.receitaLiquidaCents,
      receitaDeltaCents: atual.receitaLiquidaCents - base.receitaLiquidaCents,
      receitaDeltaPerc: deltaPerc(atual.receitaLiquidaCents, base.receitaLiquidaCents),
      resultadoAtualCents: atual.resultadoLiquidoCents,
      resultadoBaseCents: base.resultadoLiquidoCents,
      resultadoDeltaCents: atual.resultadoLiquidoCents - base.resultadoLiquidoCents,
      resultadoDeltaPerc: deltaPerc(atual.resultadoLiquidoCents, base.resultadoLiquidoCents),
    });
    const mom = serie.length >= 2 ? delta(serie[serie.length - 2]!, 'Mês vs. mês anterior') : null;
    const yoy = serie.length >= 13 ? delta(serie[serie.length - 13]!, 'Mês vs. mesmo mês do ano anterior') : null;
    return { serie, mom, yoy };
  }

  async function resumo(query: PainelCfoQuery): Promise<PainelCfoResponse> {
    const horizonteDias = query.horizonteDias ?? 30;

    // Coleta em paralelo — cada fonte é independente das outras.
    const [proj, dreResumo, dreSerie, cpSum, cpPrazo, orc, folha, dpo, dsoDias] = await Promise.all([
      fluxo.projecao({ horizonteDias }),
      dre.resumo({ competencia: query.competencia }),
      dre.serie({ meses: 13 }),
      cp.sumario({}),
      cp.analisePrazo({}),
      orcamento.derivado({ meses: 12 }),
      folhaUltimas2(),
      dpoInsumos(),
      dsoGdfDias(),
    ]);

    const notas: string[] = [];
    const kpis: KpiCfo[] = [];

    // 1. CAIXA HOJE (real se há âncora; senão sem_dado).
    const caixaEstado: EstadoDado = proj.saldoConfiavel ? 'real' : 'sem_dado';
    kpis.push({
      chave: 'caixa_hoje',
      titulo: 'Caixa hoje',
      unidade: 'moeda',
      valorCents: proj.saldoConfiavel ? proj.saldoInicialCents : null,
      valorDias: null,
      estado: caixaEstado,
      direcaoBoa: 'cima',
      comparativo: null,
      detalhe: proj.saldoConfiavel
        ? `Projeção ${horizonteDias}d: ${moedaCurta(proj.resumo.saldoFinalProjetadoCents)}`
        : 'Sem âncora de saldo — configure em Fluxo de Caixa',
      fonte: 'Fluxo de Caixa',
      href: '/fluxo-caixa',
    });

    // 2. GAP DE CAIXA (projetado).
    kpis.push({
      chave: 'gap_caixa',
      titulo: 'Gap de caixa projetado',
      unidade: 'dias',
      valorCents: null,
      valorDias: proj.resumo.diasComGap,
      estado: 'projetado',
      direcaoBoa: 'baixo',
      comparativo: null,
      detalhe: proj.resumo.diasComGap > 0
        ? `1º gap em ${proj.resumo.primeiraDataComGap ?? '—'} · máx ${moedaCurta(proj.resumo.gapMaximoCents)}`
        : `Sem dias negativos no horizonte de ${horizonteDias}d`,
      fonte: 'Fluxo de Caixa',
      href: '/fluxo-caixa',
    });

    // 3. REPASSE GDF DO MÊS (real). Alinhado à competência do resultado.
    const gdfAtualCents = dreResumo.competencia ? await gdfDoMes(dreResumo.competencia) : dreResumo.repasseGdfCents;
    const gdfAnteriorCents = dreResumo.competenciaAnterior ? await gdfDoMes(dreResumo.competenciaAnterior) : 0;
    kpis.push({
      chave: 'gdf_mes',
      titulo: 'Repasse GDF no mês',
      unidade: 'moeda',
      valorCents: gdfAtualCents,
      valorDias: null,
      estado: gdfAtualCents > 0 ? 'real' : 'sem_dado',
      direcaoBoa: 'cima',
      comparativo: dreResumo.competenciaAnterior
        ? {
            baseCents: gdfAnteriorCents,
            deltaCents: gdfAtualCents - gdfAnteriorCents,
            deltaPerc: deltaPerc(gdfAtualCents, gdfAnteriorCents),
            rotulo: `vs. ${dreResumo.competenciaAnteriorLabel ?? 'mês anterior'}`,
          }
        : null,
      detalhe: dreResumo.competenciaLabel ? `Competência ${dreResumo.competenciaLabel} · extrato bancário` : 'Extrato bancário (repasse BRB)',
      fonte: 'Recebíveis GDF',
      href: '/recebiveis-gdf',
    });

    // 4. A PAGAR (vencendo até 7 dias) — real (títulos agendados).
    const aPagar7 = cpSum.proximos7Dias.valorAPagarCents;
    kpis.push({
      chave: 'a_pagar_7d',
      titulo: 'A pagar em 7 dias',
      unidade: 'moeda',
      valorCents: aPagar7,
      valorDias: null,
      estado: 'real',
      direcaoBoa: 'neutro',
      comparativo: null,
      detalhe: `Vencidos em aberto: ${moedaCurta(cpSum.vencidos.valorAPagarCents)} · a vencer +7d: ${moedaCurta(cpSum.vencerMaisDe7.valorAPagarCents)}`,
      fonte: 'Contas a Pagar',
      href: '/contas-pagar',
    });

    // 5. FOLHA (última competência Mensal) — real, com MoM.
    const folhaAtual = folha[0] ?? null;
    const folhaAnterior = folha[1] ?? null;
    kpis.push({
      chave: 'folha_competencia',
      titulo: 'Folha líquida (mês)',
      unidade: 'moeda',
      valorCents: folhaAtual ? folhaAtual.liquidoCents : null,
      valorDias: null,
      estado: folhaAtual ? 'real' : 'sem_dado',
      direcaoBoa: 'baixo',
      comparativo: folhaAtual && folhaAnterior
        ? {
            baseCents: folhaAnterior.liquidoCents,
            deltaCents: folhaAtual.liquidoCents - folhaAnterior.liquidoCents,
            deltaPerc: deltaPerc(folhaAtual.liquidoCents, folhaAnterior.liquidoCents),
            rotulo: `vs. ${folhaAnterior.competencia.slice(5, 7)}/${folhaAnterior.competencia.slice(0, 4)}`,
          }
        : null,
      detalhe: folhaAtual
        ? `Competência ${folhaAtual.competencia.slice(5, 7)}/${folhaAtual.competencia.slice(0, 4)} · líquido (proventos − descontos)`
        : 'Sem folha sincronizada',
      fonte: 'Encargos & Benefícios',
      href: '/folha',
    });

    // 6. RESULTADO LÍQUIDO DO MÊS — real (DRE), com MoM da linha resultado_liquido.
    const linhaResult = dreResumo.linhas.find((l) => l.codigo === 'resultado_liquido');
    kpis.push({
      chave: 'resultado_liquido',
      titulo: 'Resultado líquido (mês)',
      unidade: 'moeda',
      valorCents: dreResumo.competencia ? dreResumo.resultadoLiquidoCents : null,
      valorDias: null,
      estado: dreResumo.competencia ? 'real' : 'sem_dado',
      direcaoBoa: 'cima',
      comparativo: dreResumo.competencia && dreResumo.competenciaAnterior && linhaResult
        ? {
            baseCents: linhaResult.valorAnteriorCents,
            deltaCents: dreResumo.resultadoLiquidoCents - linhaResult.valorAnteriorCents,
            deltaPerc: deltaPerc(dreResumo.resultadoLiquidoCents, linhaResult.valorAnteriorCents),
            rotulo: `vs. ${dreResumo.competenciaAnteriorLabel ?? 'mês anterior'}`,
          }
        : null,
      detalhe: dreResumo.competenciaLabel
        ? `DRE contábil ${dreResumo.competenciaLabel} (receita = bilhetagem; GDF fora)`
        : 'Sem DRE sincronizada',
      fonte: 'DRE',
      href: '/dre',
    });

    // 7. DPO — prazo médio de pagamento (calculado).
    const pagoDiario = dpo.pago90Cents / 90;
    const dpoDias = pagoDiario > 0 ? Number((dpo.abertoCents / pagoDiario).toFixed(1)) : null;
    kpis.push({
      chave: 'dpo',
      titulo: 'DPO (prazo de pagamento)',
      unidade: 'dias',
      valorCents: null,
      valorDias: dpoDias,
      estado: dpoDias !== null ? 'calculado' : 'sem_dado',
      direcaoBoa: 'cima',
      comparativo: null,
      detalhe: dpoDias !== null
        ? `${moedaCurta(dpo.abertoCents)} em aberto ÷ pagamento médio/dia (90d)`
        : 'Sem pagamentos nos últimos 90 dias',
      fonte: 'Contas a Pagar',
      href: '/contas-pagar',
    });

    // 8. DSO — prazo médio de recebimento do GDF (calculado).
    kpis.push({
      chave: 'dso',
      titulo: 'DSO (recebimento GDF)',
      unidade: 'dias',
      valorCents: null,
      valorDias: dsoDias,
      estado: dsoDias !== null ? 'calculado' : 'sem_dado',
      direcaoBoa: 'baixo',
      comparativo: null,
      detalhe: dsoDias !== null
        ? 'Tempo médio transporte → resgate na matriz BRB (30d)'
        : 'Matriz BRB sem dado no período',
      fonte: 'Recebíveis GDF',
      href: '/recebiveis-gdf',
    });

    // ------------------------------------------------------------------ ALERTAS
    const alertas: AlertaCfo[] = [];

    if (proj.resumo.diasComGap > 0) {
      alertas.push({
        nivel: proj.resumo.diasComGap >= 3 ? 'critico' : 'atencao',
        titulo: `${proj.resumo.diasComGap} dia(s) com caixa negativo na projeção`,
        detalhe: `Primeiro gap em ${proj.resumo.primeiraDataComGap ?? '—'}; gap máximo de ${moedaCurta(proj.resumo.gapMaximoCents)} no horizonte de ${horizonteDias} dias.`,
        modulo: 'Fluxo de Caixa',
        href: '/fluxo-caixa',
      });
    }

    if (orc.disponivel && orc.qtdEstouros > 0) {
      const pior = [...orc.porSetor].filter((s) => s.estourou).sort((a, b) => b.variacaoPerc - a.variacaoPerc)[0];
      alertas.push({
        nivel: 'atencao',
        titulo: `${orc.qtdEstouros} setor(es) acima do orçado`,
        detalhe: pior
          ? `Maior estouro: ${pior.nome} a ${Math.round(pior.variacaoPerc)}% da referência (mês ${orc.mesComparadoLabel ?? '—'}).`
          : `Mês comparado: ${orc.mesComparadoLabel ?? '—'}.`,
        modulo: 'Orçamento',
        href: '/orcamento',
      });
    }

    if (cpPrazo.prazoLongoVencidoNaoPago.quantidade > 0) {
      alertas.push({
        nivel: 'atencao',
        titulo: `${cpPrazo.prazoLongoVencidoNaoPago.quantidade} título(s) de prazo longo vencidos e não pagos`,
        detalhe: `${moedaCurta(cpPrazo.prazoLongoVencidoNaoPago.valorAPagarCents)} em aberto — emitidos com mais de 30 dias de prazo e já vencidos.`,
        modulo: 'Contas a Pagar',
        href: '/contas-pagar',
      });
    }

    if (proj.inadimplencia.percentualAplicado >= 5) {
      alertas.push({
        nivel: 'atencao',
        titulo: `Inadimplência histórica em ${proj.inadimplencia.percentualAplicado}%`,
        detalhe: `Calculada dos últimos ${proj.inadimplencia.janelaMeses} meses e aplicada às entradas de recebíveis na projeção de caixa.`,
        modulo: 'Fluxo de Caixa',
        href: '/fluxo-caixa',
      });
    }

    if (!proj.saldoConfiavel) {
      alertas.push({
        nivel: 'info',
        titulo: 'Saldo bancário sem âncora',
        detalhe: 'Nenhuma conta principal tem saldo conferido — o caixa de hoje não pôde ser calculado. Configure em Fluxo de Caixa › Por conta.',
        modulo: 'Fluxo de Caixa',
        href: '/fluxo-caixa',
      });
    }

    if (dreResumo.mesParcial && dreResumo.competenciaLabel) {
      alertas.push({
        nivel: 'info',
        titulo: `Resultado de ${dreResumo.competenciaLabel} em fechamento`,
        detalhe: 'A receita ainda não foi lançada nesta competência — o resultado do mês está incompleto. Selecione um mês fechado na DRE.',
        modulo: 'DRE',
        href: '/dre',
      });
    }

    alertas.sort((a, b) => ORDEM_NIVEL[a.nivel] - ORDEM_NIVEL[b.nivel]);

    // ------------------------------------------------------------- COMPARATIVO
    const comparativo = montarComparativo(dreSerie.serie);

    // ---------------------------------------------------------------- NOTAS
    notas.push(
      'Painel de consolidação: cada KPI vem de um módulo pronto e mantém a rastreabilidade até a fonte (não há cálculo novo de negócio aqui).',
      'Resultado e comparativos usam a DRE contábil — a receita ali é a bilhetagem; o repasse do GDF aparece como KPI e alerta próprios, não somado ao resultado contábil.',
      'DPO = títulos em aberto ÷ pagamento médio diário dos últimos 90 dias. DSO = tempo médio de resgate do GDF na matriz BRB (a receita real da operação; o contas a receber tradicional é residual).',
    );
    if (!proj.saldoConfiavel) notas.push('Caixa e projeção com saldo inicial = 0: nenhuma conta principal tem âncora de saldo preenchida.');
    if (dsoDias === null) notas.push('DSO indisponível: a matriz BRB (Recebíveis GDF) não tem dado sincronizado no período.');

    return {
      geradoEm: agoraIso(),
      periodo: {
        dataReferencia: dataIsoSp(),
        horizonteDias,
        competencia: dreResumo.competencia,
        competenciaLabel: dreResumo.competenciaLabel,
      },
      kpis,
      alertas,
      comparativo,
      saude: {
        caixaConfiavel: proj.saldoConfiavel,
        contasSemAncora: (await fluxo.listarContas()).totalSemAncora,
        mesResultadoParcial: dreResumo.mesParcial,
      },
      notas,
    };
  }

  /** Briefing executivo (1 aba) — KPIs, alertas e comparativo MoM/YoY. */
  async function exportarBriefingXlsx(query: PainelCfoQuery): Promise<{ buffer: Buffer; filename: string }> {
    const r = await resumo(query);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Sistema Financeiro Pioneira';
    const ws = wb.addWorksheet('Briefing CFO', { views: [{ state: 'frozen', ySplit: 3 }] });

    ws.mergeCells('A1:E1');
    ws.getCell('A1').value = `Briefing executivo — Painel CFO${r.periodo.competenciaLabel ? ` · ${r.periodo.competenciaLabel}` : ''}`;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.mergeCells('A2:E2');
    ws.getCell('A2').value = `Gerado em ${r.geradoEm} · horizonte de caixa ${r.periodo.horizonteDias} dias`;
    ws.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };

    const head = ws.addRow(['Indicador', 'Valor', 'vs. mês anterior', 'Estado', 'Fonte']);
    head.font = { bold: true };

    for (const k of r.kpis) {
      const valor = k.unidade === 'moeda'
        ? (k.valorCents === null ? '—' : k.valorCents / 100)
        : (k.valorDias === null ? '—' : k.valorDias);
      const comp = k.comparativo
        ? `${k.comparativo.deltaCents >= 0 ? '+' : ''}${moedaCurta(k.comparativo.deltaCents)}${k.comparativo.deltaPerc !== null ? ` (${k.comparativo.deltaPerc}%)` : ''}`
        : '—';
      const row = ws.addRow([k.titulo, valor, comp, k.estado, k.fonte]);
      if (k.unidade === 'moeda' && k.valorCents !== null) row.getCell(2).numFmt = 'R$ #,##0.00';
      else if (k.unidade === 'dias' && k.valorDias !== null) row.getCell(2).value = `${k.valorDias} d`;
    }

    ws.addRow([]);
    const secAlertas = ws.addRow(['Alertas estratégicos']);
    secAlertas.font = { bold: true, size: 12 };
    if (r.alertas.length === 0) {
      ws.addRow(['Nenhum alerta no momento.']);
    } else {
      for (const a of r.alertas) {
        const row = ws.addRow([`[${a.nivel.toUpperCase()}] ${a.titulo}`, a.detalhe]);
        row.getCell(1).font = { bold: true };
      }
    }

    ws.addRow([]);
    const secComp = ws.addRow(['Comparativo do resultado líquido']);
    secComp.font = { bold: true, size: 12 };
    const compHead = ws.addRow(['Janela', 'Base', 'Atual', 'Base (R$)', 'Atual (R$)', 'Δ (R$)', 'Δ %']);
    compHead.font = { bold: true };
    for (const c of [r.comparativo.mom, r.comparativo.yoy]) {
      if (!c) continue;
      const row = ws.addRow([
        c.rotulo,
        c.baseLabel,
        c.atualLabel,
        c.resultadoBaseCents / 100,
        c.resultadoAtualCents / 100,
        c.resultadoDeltaCents / 100,
        c.resultadoDeltaPerc !== null ? c.resultadoDeltaPerc / 100 : '—',
      ]);
      row.getCell(4).numFmt = 'R$ #,##0.00';
      row.getCell(5).numFmt = 'R$ #,##0.00';
      row.getCell(6).numFmt = 'R$ #,##0.00';
      if (c.resultadoDeltaPerc !== null) row.getCell(7).numFmt = '0.0%';
    }

    ws.columns = [{ width: 34 }, { width: 20 }, { width: 22 }, { width: 16 }, { width: 20 }, { width: 18 }, { width: 10 }];

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const suf = r.periodo.competencia ?? dataIsoSp();
    return { buffer, filename: `briefing-cfo-${suf}.xlsx` };
  }

  return { resumo, exportarBriefingXlsx };
}

export type PainelCfoService = ReturnType<typeof buildPainelCfoService>;
