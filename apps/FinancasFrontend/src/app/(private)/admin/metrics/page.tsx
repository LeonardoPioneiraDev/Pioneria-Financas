'use client';

import { useState } from 'react';
import {
  Activity,
  Clock,
  AlertTriangle,
  LogIn,
  Users,
  RefreshCw,
  Loader2,
  Gauge,
  TrendingUp,
  CheckCircle2,
  CalendarClock,
} from 'lucide-react';
import type { MetricsTimeRange, MetricsDashboardResponse, MetricsPonto } from '@pioneira/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMetrics } from '@/hooks/useMetrics';

const nf = new Intl.NumberFormat('pt-BR');
const num = (v: number) => nf.format(v);
const ms = (v: number) => `${nf.format(v)} ms`;

const RANGES: { valor: MetricsTimeRange; label: string; tipo: 'hora' | 'dia' }[] = [
  { valor: 'last_hour', label: 'Última hora', tipo: 'hora' },
  { valor: 'last_3h', label: 'Últimas 3h', tipo: 'hora' },
  { valor: 'last_6h', label: 'Últimas 6h', tipo: 'hora' },
  { valor: 'last_24h', label: 'Últimas 24h', tipo: 'hora' },
  { valor: 'last_7d', label: 'Últimos 7 dias', tipo: 'dia' },
  { valor: 'last_30d', label: 'Últimos 30 dias', tipo: 'dia' },
];

function fmtBucket(ts: string, tipo: 'hora' | 'dia', comData = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(ts);
  if (!m) return ts;
  const [, , mes, dia, hh, mm] = m;
  if (tipo === 'dia') return `${dia}/${mes}`;
  return comData ? `${dia}/${mes} ${hh}:${mm}` : `${hh}:${mm}`;
}

const STATUS_HEX: Record<string, string> = { '2xx': '#10b981', '3xx': '#0ea5e9', '4xx': '#f59e0b', '5xx': '#ef4444', outro: '#9ca3af' };

// ---- KPI ----
function Kpi({ icon, tint, label, valor, sub }: { icon: React.ReactNode; tint: string; label: string; valor: string; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tint)}>{icon}</span>
        <div className="min-w-0">
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-100">{valor}</p>
        </div>
      </div>
      {sub && <p className="mt-2 text-[11px] text-gray-400">{sub}</p>}
    </Card>
  );
}

// ---- Barras (requisições) ----
function BarrasReq({ dados, tipo }: { dados: MetricsPonto[]; tipo: 'hora' | 'dia' }) {
  if (dados.length === 0) return <p className="mt-3 text-sm text-gray-400">Sem dados no período.</p>;
  const max = Math.max(1, ...dados.map((d) => d.requestCount));
  return (
    <div>
      <div className="mt-4 flex h-40 items-end gap-0.5">
        {dados.map((d) => (
          <div key={d.timestamp} className="group relative flex flex-1 flex-col items-center justify-end">
            <div className="w-full rounded-t bg-sky-400 transition-colors group-hover:bg-sky-500 dark:bg-sky-500" style={{ height: `${Math.max(2, Math.round((d.requestCount / max) * 100))}%` }} />
            <span className="pointer-events-none absolute -top-11 z-10 whitespace-nowrap rounded bg-gray-900 px-1.5 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
              {fmtBucket(d.timestamp, tipo, true)}
              <br />
              {num(d.requestCount)} req · avg {ms(d.avgLatencyMs)} · p95 {ms(d.p95LatencyMs)}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-gray-400">
        <span>{dados[0] && fmtBucket(dados[0].timestamp, tipo, true)}</span>
        <span>{dados[dados.length - 1] && fmtBucket(dados[dados.length - 1]!.timestamp, tipo, true)}</span>
      </div>
    </div>
  );
}

// ---- Linhas de latência (avg x p95) ----
function LatenciaChart({ dados }: { dados: MetricsPonto[] }) {
  if (dados.length < 2) return <p className="mt-3 text-sm text-gray-400">Poucos pontos pra série de latência.</p>;
  const max = Math.max(1, ...dados.flatMap((p) => [p.avgLatencyMs, p.p95LatencyMs]));
  const n = dados.length;
  const px = (i: number) => (i / (n - 1)) * 100;
  const py = (v: number) => 100 - (v / max) * 100;
  const linha = (key: 'avgLatencyMs' | 'p95LatencyMs') => dados.map((p, i) => `${i ? 'L' : 'M'}${px(i)},${py(p[key])}`).join(' ');
  const area = (key: 'avgLatencyMs' | 'p95LatencyMs') => `${linha(key)} L100,100 L0,100 Z`;
  return (
    <div>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-4 h-40 w-full">
        <path d={area('p95LatencyMs')} fill="rgba(249,115,22,0.08)" />
        <path d={area('avgLatencyMs')} fill="rgba(16,185,129,0.12)" />
        <path d={linha('p95LatencyMs')} fill="none" stroke="#f97316" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        <path d={linha('avgLatencyMs')} fill="none" stroke="#10b981" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> latência média</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-orange-500" /> P95</span>
        <span className="ml-auto">pico {ms(max)}</span>
      </div>
    </div>
  );
}

// ---- Donut de status ----
function Donut({ segmentos, total }: { segmentos: { label: string; value: number; cor: string }[]; total: number }) {
  let acc = 0;
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <circle cx="18" cy="18" r="15.9155" fill="none" className="stroke-gray-100 dark:stroke-gray-800" strokeWidth="3.5" />
        {segmentos.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          const el = (
            <circle key={s.label} cx="18" cy="18" r="15.9155" fill="none" stroke={s.cor} strokeWidth="3.5" strokeLinecap="butt" strokeDasharray={`${pct} ${100 - pct}`} strokeDashoffset={-acc} />
          );
          acc += pct;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold tabular-nums">{num(total)}</span>
        <span className="text-[10px] text-gray-400">requisições</span>
      </div>
    </div>
  );
}

export default function MetricsPage() {
  const [timeRange, setTimeRange] = useState<MetricsTimeRange>('last_24h');
  const q = useMetrics(timeRange);
  const d = q.data;
  const tipoBucket = RANGES.find((r) => r.valor === timeRange)?.tipo ?? 'hora';
  const semPermissao = (q.error as { response?: { status?: number } } | null)?.response?.status === 403;

  // Derivados
  const totalErros = d ? d.statusDetails.filter((s) => s.statusCode >= 400).reduce((s, x) => s + x.count, 0) : 0;
  const mediaDia = d && d.dailyPeaks.length > 0 ? Math.round(d.summary.totalRequests / d.dailyPeaks.length) : 0;
  const diaPico = d && d.dailyPeaks.length > 0 ? d.dailyPeaks.reduce((a, b) => (b.totalRequests > a.totalRequests ? b : a)) : null;
  const maxMetodo = d ? Math.max(1, ...d.methodDistribution.map((m) => m.count)) : 1;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Activity className="h-6 w-6 text-gray-400" />
            Métricas de Sistema
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Volume, latência e status das requisições, e atividade de usuários. Janela em horário de Brasília. Atualiza
            sozinho a cada 60s.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={timeRange} onChange={(e) => setTimeRange(e.target.value as MetricsTimeRange)} className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900">
            {RANGES.map((r) => (
              <option key={r.valor} value={r.valor}>{r.label}</option>
            ))}
          </select>
          <Button onClick={() => q.refetch()} disabled={q.isFetching} variant="outline" size="sm">
            {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2 hidden sm:inline">Atualizar</span>
          </Button>
        </div>
      </div>

      {semPermissao && (
        <Card className="p-8 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-400" />
          <p className="mt-3 font-medium">Sem permissão</p>
          <p className="mt-1 text-sm text-gray-500">Este painel é restrito a administradores.</p>
        </Card>
      )}

      {q.isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      )}

      {q.isError && !semPermissao && (
        <Card className="p-6 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">Falha ao carregar as métricas.</p>
          <Button onClick={() => q.refetch()} variant="outline" size="sm" className="mt-3">Tentar novamente</Button>
        </Card>
      )}

      {d && !semPermissao && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Kpi icon={<Activity className="h-4 w-4 text-sky-600 dark:text-sky-300" />} tint="bg-sky-100 dark:bg-sky-500/20" label="Requisições" valor={num(d.summary.totalRequests)} sub={mediaDia ? `~${num(mediaDia)}/dia` : undefined} />
            <Kpi icon={<Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />} tint="bg-indigo-100 dark:bg-indigo-500/20" label="Latência média" valor={ms(d.summary.avgLatencyMs)} />
            <Kpi icon={<Gauge className="h-4 w-4 text-violet-600 dark:text-violet-300" />} tint="bg-violet-100 dark:bg-violet-500/20" label="Latência P95" valor={ms(d.summary.p95LatencyMs)} />
            <Kpi
              icon={d.summary.errorRate >= 5 ? <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-300" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />}
              tint={d.summary.errorRate >= 5 ? 'bg-red-100 dark:bg-red-500/20' : 'bg-emerald-100 dark:bg-emerald-500/20'}
              label="Taxa de erro"
              valor={`${d.summary.errorRate.toLocaleString('pt-BR')}%`}
              sub={`${num(totalErros)} erro(s) 4xx/5xx`}
            />
            <Kpi icon={<Users className="h-4 w-4 text-teal-600 dark:text-teal-300" />} tint="bg-teal-100 dark:bg-teal-500/20" label="Usuários únicos" valor={num(d.summary.uniqueUsers)} />
            <Kpi icon={<LogIn className="h-4 w-4 text-amber-600 dark:text-amber-300" />} tint="bg-amber-100 dark:bg-amber-500/20" label="Logins únicos" valor={num(d.summary.uniqueLoggedInUsers)} />
          </div>

          {/* Séries: requisições + latência */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-gray-400" /> Requisições ao longo do tempo</h2>
              <BarrasReq dados={d.requestsOverTime} tipo={tipoBucket} />
            </Card>
            <Card className="p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><Gauge className="h-4 w-4 text-gray-400" /> Latência (média × P95)</h2>
              <LatenciaChart dados={d.requestsOverTime} />
            </Card>
          </div>

          {/* Status donut + métodos */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="text-sm font-semibold">Distribuição de status</h2>
              {d.statusDistribution.length === 0 ? (
                <p className="mt-3 text-sm text-gray-400">Sem dados.</p>
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <Donut total={d.summary.totalRequests} segmentos={d.statusDistribution.map((s) => ({ label: s.grupo, value: s.count, cor: STATUS_HEX[s.grupo] ?? '#9ca3af' }))} />
                  <div className="min-w-0 flex-1">
                    <div className="space-y-1">
                      {d.statusDistribution.map((s) => (
                        <div key={s.grupo} className="flex items-center gap-2 text-sm">
                          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_HEX[s.grupo] ?? '#9ca3af' }} />
                          <span className="text-gray-600 dark:text-gray-300">{s.grupo}</span>
                          <span className="ml-auto tabular-nums">{num(s.count)}</span>
                          <span className="w-12 text-right text-[11px] tabular-nums text-gray-400">{d.summary.totalRequests > 0 ? Math.round((s.count / d.summary.totalRequests) * 100) : 0}%</span>
                        </div>
                      ))}
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[11px] text-gray-400 hover:text-gray-600">detalhe por código</summary>
                      <div className="mt-2 max-h-40 overflow-y-auto">
                        {d.statusDetails.map((s) => (
                          <div key={s.statusCode} className={cn('flex items-center justify-between border-t border-gray-50 py-1 text-xs dark:border-gray-800/50', s.statusCode >= 400 && 'text-red-600 dark:text-red-400')}>
                            <span className="tabular-nums">{s.statusCode} <span className="text-[10px] text-gray-400">{s.grupo}</span></span>
                            <span className="tabular-nums">{num(s.count)} · {s.percent.toLocaleString('pt-BR')}%</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <h2 className="text-sm font-semibold">Requisições por método</h2>
              {d.methodDistribution.length === 0 ? (
                <p className="mt-3 text-sm text-gray-400">Sem dados.</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {d.methodDistribution.map((m) => (
                    <div key={m.method} className="grid grid-cols-[64px_1fr_auto] items-center gap-3">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-center text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">{m.method}</span>
                      <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                        <div className="h-2 rounded-full bg-sky-400 dark:bg-sky-500" style={{ width: `${Math.max(3, Math.round((m.count / maxMetodo) * 100))}%` }} />
                      </div>
                      <span className="text-right text-sm tabular-nums">{num(m.count)}</span>
                    </div>
                  ))}
                </div>
              )}
              {diaPico && (
                <p className="mt-4 flex items-center gap-1 border-t border-gray-100 pt-3 text-[11px] text-gray-400 dark:border-gray-800">
                  <CalendarClock className="h-3 w-3" /> dia de pico: {fmtBucket(diaPico.date, 'dia')} ({num(diaPico.totalRequests)} req, pico às {String(diaPico.peakHour).padStart(2, '0')}h)
                </p>
              )}
            </Card>
          </div>

          {/* Picos por dia */}
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Picos por dia</h2>
            {d.dailyPeaks.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">Sem dados.</p>
            ) : (
              <div className="mt-4 flex h-36 items-end gap-1">
                {d.dailyPeaks.map((p) => {
                  const max = Math.max(1, ...d.dailyPeaks.map((x) => x.totalRequests));
                  return (
                    <div key={p.date} className="group relative flex flex-1 flex-col items-center justify-end">
                      <div className="w-full rounded-t bg-indigo-400 transition-colors group-hover:bg-indigo-500 dark:bg-indigo-500" style={{ height: `${Math.max(2, Math.round((p.totalRequests / max) * 100))}%` }} />
                      <span className="pointer-events-none absolute -top-11 z-10 whitespace-nowrap rounded bg-gray-900 px-1.5 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                        {fmtBucket(p.date, 'dia')}: {num(p.totalRequests)} req<br />pico {String(p.peakHour).padStart(2, '0')}h ({num(p.peakHourRequests)})
                      </span>
                      <span className="mt-1 text-[9px] text-gray-400">{p.date.slice(8, 10)}/{p.date.slice(5, 7)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Top usuários + endpoints lentos */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <div className="p-4 pb-2"><h2 className="text-sm font-semibold">Usuários mais ativos</h2></div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                      <th className="px-4 py-2 font-medium">Usuário</th>
                      <th className="px-4 py-2 text-right font-medium">Requisições</th>
                      <th className="px-4 py-2 text-right font-medium">Dias</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.topUsers.length === 0 ? (
                      <tr><td colSpan={3} className="px-4 py-3 text-gray-400">Sem atividade no período.</td></tr>
                    ) : d.topUsers.map((u) => (
                      <tr key={u.userId} className="border-b border-gray-50 last:border-0 dark:border-gray-800/50">
                        <td className="px-4 py-2">
                          <div className="text-gray-800 dark:text-gray-200">{u.fullName}</div>
                          <div className="flex items-center gap-2 text-[11px] text-gray-400">{u.username}<Badge variant="muted">{u.role}</Badge></div>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{num(u.totalRequests)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-gray-500">{num(u.activeDays)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="p-4 pb-2">
                <h2 className="text-sm font-semibold">Endpoints mais lentos</h2>
                <p className="text-xs text-gray-400">mín. 5 requisições · ordenado por latência média</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                      <th className="px-4 py-2 font-medium">Endpoint</th>
                      <th className="px-3 py-2 text-right font-medium">Qtd</th>
                      <th className="px-3 py-2 text-right font-medium">Média</th>
                      <th className="px-4 py-2 text-right font-medium">P95</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.slowestEndpoints.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-3 text-gray-400">Sem endpoints com ≥ 5 requisições.</td></tr>
                    ) : d.slowestEndpoints.map((e) => {
                      const alto = e.avgLatencyMs >= 5000 ? 'text-red-600 dark:text-red-400' : e.avgLatencyMs >= 1000 ? 'text-amber-600 dark:text-amber-400' : '';
                      return (
                        <tr key={`${e.method} ${e.endpoint}`} className="border-b border-gray-50 last:border-0 dark:border-gray-800/50">
                          <td className="px-4 py-2">
                            <span className="mr-1 rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">{e.method}</span>
                            <code className="text-[11px] text-gray-700 dark:text-gray-300">{e.endpoint}</code>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500">{num(e.count)}</td>
                          <td className={cn('px-3 py-2 text-right tabular-nums font-medium', alto)}>{num(e.avgLatencyMs)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-gray-500">{num(e.p95LatencyMs)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <p className="text-xs text-gray-400">
            Fonte: <code>audit.request_logs</code> + <code>audit.user_activity_logs</code> (capturados pelo plugin de
            métricas). Janelas e buckets em America/Sao_Paulo. Gerado em {new Date(d.geradoEm).toLocaleString('pt-BR')}.
          </p>
        </>
      )}
    </div>
  );
}
