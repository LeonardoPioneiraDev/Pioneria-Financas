'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Crown,
  Loader2,
  Download,
  ArrowUp,
  ArrowDown,
  ArrowRight,
  AlertTriangle,
  AlertOctagon,
  Info,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import type { PainelCfoResponse, KpiCfo, AlertaCfo, ComparativoDelta } from '@pioneira/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, extrairMensagemErro } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function moedaCurta(cents: number): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${s}R$ ${(abs / 1_000_000).toFixed(2)} M`;
  if (abs >= 1_000) return `${s}R$ ${(abs / 1_000).toFixed(0)} K`;
  return `${s}R$ ${abs.toFixed(0)}`;
}

const HORIZONTES: ReadonlyArray<{ dias: number; label: string }> = [
  { dias: 7, label: 'Semana' },
  { dias: 30, label: 'Mês' },
  { dias: 90, label: 'Trimestre' },
];

const ESTADO_BADGE: Record<KpiCfo['estado'], { texto: string; classe: string }> = {
  real: { texto: 'real', classe: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  calculado: { texto: 'calculado', classe: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
  projetado: { texto: 'projetado', classe: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
  sem_dado: { texto: 'sem dado', classe: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
};

function valorKpi(k: KpiCfo): string {
  if (k.unidade === 'moeda') return k.valorCents === null ? '—' : moeda(k.valorCents);
  return k.valorDias === null ? '—' : `${k.valorDias} d`;
}

/** Delta do comparativo, colorido conforme se subir é bom/ruim/neutro pro KPI. */
function DeltaComparativo({ kpi }: { kpi: KpiCfo }) {
  const c = kpi.comparativo;
  if (!c) return null;
  const subiu = c.deltaCents > 0;
  const bom = kpi.direcaoBoa === 'neutro' ? null : (subiu ? kpi.direcaoBoa === 'cima' : kpi.direcaoBoa === 'baixo');
  const cor = bom === null ? 'text-gray-400' : bom ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px]">
      <span className={cn('inline-flex items-center gap-0.5 tabular-nums font-medium', cor)}>
        {subiu ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {moedaCurta(Math.abs(c.deltaCents))}
        {c.deltaPerc !== null && <span className="text-gray-400 dark:text-gray-500">({c.deltaPerc}%)</span>}
      </span>
      <span className="text-gray-400 dark:text-gray-500">{c.rotulo}</span>
    </p>
  );
}

function KpiTile({ kpi }: { kpi: KpiCfo }) {
  const badge = ESTADO_BADGE[kpi.estado];
  const semDado = kpi.estado === 'sem_dado';
  return (
    <Link href={kpi.href} className="group">
      <Card className="h-full p-4 transition-colors hover:border-pioneira-300 dark:hover:border-yellow-800">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">{kpi.titulo}</p>
          <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', badge.classe)}>{badge.texto}</span>
        </div>
        <p className={cn('mt-2 text-2xl font-semibold tabular-nums', semDado ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100')}>
          {valorKpi(kpi)}
        </p>
        <DeltaComparativo kpi={kpi} />
        {kpi.detalhe && <p className="mt-1.5 text-[11px] leading-snug text-gray-400 dark:text-gray-500">{kpi.detalhe}</p>}
        <p className="mt-2 flex items-center gap-1 text-[10px] text-gray-400 opacity-0 transition-opacity group-hover:opacity-100">
          {kpi.fonte} <ArrowRight className="h-3 w-3" />
        </p>
      </Card>
    </Link>
  );
}

const ALERTA_ESTILO: Record<AlertaCfo['nivel'], { icone: typeof Info; classe: string }> = {
  critico: { icone: AlertOctagon, classe: 'border-l-red-500 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-200' },
  atencao: { icone: AlertTriangle, classe: 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-200' },
  info: { icone: Info, classe: 'border-l-sky-400 bg-sky-50 dark:bg-sky-950/20 text-sky-800 dark:text-sky-200' },
};

function AlertaItem({ alerta }: { alerta: AlertaCfo }) {
  const est = ALERTA_ESTILO[alerta.nivel];
  const Icone = est.icone;
  return (
    <Link href={alerta.href} className={cn('block rounded-md border-l-4 p-3 transition-opacity hover:opacity-90', est.classe)}>
      <div className="flex items-start gap-2.5">
        <Icone className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{alerta.titulo}</p>
          <p className="mt-0.5 text-xs leading-relaxed opacity-90">{alerta.detalhe}</p>
          <p className="mt-1 text-[10px] uppercase tracking-wide opacity-60">{alerta.modulo}</p>
        </div>
        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />
      </div>
    </Link>
  );
}

function ComparativoCard({ titulo, delta }: { titulo: string; delta: ComparativoDelta | null }) {
  if (!delta) {
    return (
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
        <p className="mt-3 text-sm text-gray-400">Sem base de comparação disponível.</p>
      </Card>
    );
  }
  const bom = delta.resultadoDeltaCents >= 0;
  return (
    <Card className="p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
      <p className="mt-1 text-[11px] text-gray-400">{delta.baseLabel} → {delta.atualLabel}</p>
      <div className="mt-3 space-y-2">
        <div>
          <p className="text-[11px] text-gray-400">Resultado líquido</p>
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tabular-nums">{moedaCurta(delta.resultadoAtualCents)}</span>
            <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', bom ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
              {bom ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {moedaCurta(Math.abs(delta.resultadoDeltaCents))}
              {delta.resultadoDeltaPerc !== null && ` (${delta.resultadoDeltaPerc}%)`}
            </span>
          </div>
        </div>
        <div>
          <p className="text-[11px] text-gray-400">Receita líquida</p>
          <div className="flex items-baseline gap-2">
            <span className="text-sm tabular-nums text-gray-700 dark:text-gray-300">{moedaCurta(delta.receitaAtualCents)}</span>
            {delta.receitaDeltaPerc !== null && (
              <span className={cn('text-xs', delta.receitaDeltaCents >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                {delta.receitaDeltaCents >= 0 ? '+' : ''}{delta.receitaDeltaPerc}%
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function GraficoResultado({ serie }: { serie: PainelCfoResponse['comparativo']['serie'] }) {
  if (serie.length === 0) return null;
  const max = Math.max(1, ...serie.map((p) => Math.abs(p.resultadoLiquidoCents)));
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <TrendingUp className="h-4 w-4 text-gray-400" /> Evolução do resultado líquido ({serie.length} meses)
      </h2>
      <div className="mt-4 flex h-40 items-stretch gap-1">
        {serie.map((p) => {
          const v = p.resultadoLiquidoCents;
          const h = Math.max(2, Math.round((Math.abs(v) / max) * 100));
          return (
            <div key={p.competencia} className="group relative flex flex-1 flex-col">
              <div className="flex flex-1 flex-col justify-end">
                {v >= 0 && <div className="rounded-t bg-emerald-400 dark:bg-emerald-500" style={{ height: `${h}%` }} />}
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700" />
              <div className="flex flex-1 flex-col justify-start">
                {v < 0 && <div className="rounded-b bg-red-400 dark:bg-red-500" style={{ height: `${h}%` }} />}
              </div>
              <span className="pointer-events-none absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-1.5 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                {p.competenciaLabel}
                <br />
                Resultado {moedaCurta(v)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-gray-400">
        <span>{serie[0]?.competenciaLabel}</span>
        <span>{serie[serie.length - 1]?.competenciaLabel}</span>
      </div>
    </Card>
  );
}

export default function PainelCfoPage() {
  const [horizonte, setHorizonte] = useState(30);

  const resumoQ = useQuery<PainelCfoResponse>({
    queryKey: ['painel-cfo', 'resumo', horizonte],
    queryFn: async () => {
      const res = await api.get<PainelCfoResponse>('/api/painel-cfo/resumo', { params: { horizonteDias: horizonte } });
      return res.data;
    },
    staleTime: 5 * 60_000,
  });

  const exportM = useMutation({
    mutationFn: async () => {
      const res = await api.get('/api/painel-cfo/export', { params: { horizonteDias: horizonte }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'briefing-cfo.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const r = resumoQ.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent">
            <Crown className="h-6 w-6 text-pioneira-700 dark:text-yellow-400" />
            Painel CFO
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Visão executiva consolidada — caixa, resultado, folha e GDF num só lugar. Cada número aponta pro módulo de
            origem e diz o estado do dado (real, calculado, projetado ou sem dado).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-gray-200 text-xs dark:border-gray-700">
            {HORIZONTES.map((h) => (
              <button
                key={h.dias}
                type="button"
                onClick={() => setHorizonte(h.dias)}
                className={cn(
                  'px-2.5 py-1 transition-colors',
                  horizonte === h.dias
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800',
                )}
              >
                {h.label}
              </button>
            ))}
          </div>
          <Button onClick={() => exportM.mutate()} disabled={exportM.isPending || !r} variant="outline" size="sm">
            {exportM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Briefing</span>
          </Button>
        </div>
      </div>

      <ModuleStatusBanner href="/painel-cfo" />

      {resumoQ.isLoading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {resumoQ.isError && (
        <Card className="p-8 text-center">
          <p className="font-medium">Não foi possível carregar o painel.</p>
          <p className="mt-1 text-sm text-gray-500">{extrairMensagemErro(resumoQ.error)}</p>
        </Card>
      )}

      {r && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {r.kpis.map((k) => (
              <KpiTile key={k.chave} kpi={k} />
            ))}
          </div>

          {/* Alertas */}
          <div>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300">
              Alertas estratégicos
            </h2>
            {r.alertas.length === 0 ? (
              <Card className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhum alerta no momento — caixa, orçamento e prazos dentro do esperado.
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {r.alertas.map((a, i) => (
                  <AlertaItem key={i} alerta={a} />
                ))}
              </div>
            )}
          </div>

          {/* Comparativo MoM / YoY */}
          <div>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300">
              Comparativo do resultado
            </h2>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ComparativoCard titulo="Mês vs. mês anterior (MoM)" delta={r.comparativo.mom} />
              <ComparativoCard titulo="Ano vs. ano anterior (YoY)" delta={r.comparativo.yoy} />
            </div>
          </div>

          {/* Gráfico de evolução */}
          <GraficoResultado serie={r.comparativo.serie} />

          {/* Fontes e método */}
          <details className="rounded-lg border border-gray-200 bg-gray-50/60 p-4 text-sm dark:border-gray-800 dark:bg-gray-900/40">
            <summary className="cursor-pointer font-medium text-gray-600 dark:text-gray-300">Fontes e método</summary>
            <ul className="mt-3 space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
              {r.notas.map((n, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gray-400" />
                  <span>{n}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-gray-400">
              Gerado em {new Date(r.geradoEm).toLocaleString('pt-BR')} · competência do resultado:{' '}
              {r.periodo.competenciaLabel ?? '—'} · horizonte de caixa: {r.periodo.horizonteDias} dias
              {!r.saude.caixaConfiavel && ` · ${r.saude.contasSemAncora} conta(s) sem âncora de saldo`}.
            </p>
          </details>
        </>
      )}
    </div>
  );
}
