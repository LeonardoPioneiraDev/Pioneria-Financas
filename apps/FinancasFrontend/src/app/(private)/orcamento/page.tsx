'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardList, RefreshCw, Loader2, Info, TrendingUp, TrendingDown, CalendarRange, Building2, ArrowRight, HelpCircle, Pencil, Check, X, Download } from 'lucide-react';
import type { OrcamentoBaselineResponse, OrcamentoDerivadoResponse, OrcamentoDerivadoSetor, OrcamentoSyncResponse } from '@pioneira/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, extrairMensagemErro } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';
import { usePodeSincronizar } from '@/hooks/usePodeSincronizar';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function moedaCurta(cents: number): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2)} M`;
  if (abs >= 1_000) return `R$ ${(v / 1_000).toFixed(0)} K`;
  return moeda(cents);
}
function dataBr(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** Barra horizontal simples (sem lib de gráfico). */
function Barra({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((valor / max) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
      <div className={cn('h-2 rounded-full', cor)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Ordem e aparência de cada categoria de setor (a central fica por último, destacada). */
const CATEGORIA_ORDEM = ['receita', 'apoio', 'central', 'indefinido'] as const;
const CATEGORIA_META: Record<string, { label: string; badge: string; barra: string }> = {
  receita: {
    label: 'Geram receita (garagens operacionais)',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    barra: 'bg-emerald-400 dark:bg-emerald-500',
  },
  apoio: {
    label: 'Apoio / custo (não geram receita)',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
    barra: 'bg-sky-400 dark:bg-sky-500',
  },
  central: {
    label: 'Central — concentra o pagamento das dívidas dos setores',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    barra: 'bg-amber-400 dark:bg-amber-500',
  },
  indefinido: {
    label: 'Não classificado',
    badge: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
    barra: 'bg-gray-400 dark:bg-gray-500',
  },
};

export default function OrcamentoPage() {
  // Sincronizar com o Globus e ação de administrador.
  const podeSincronizar = usePodeSincronizar();
  const qc = useQueryClient();

  const derivadoQ = useQuery<OrcamentoDerivadoResponse>({
    queryKey: ['orcamento', 'derivado'],
    queryFn: async () => (await api.get<OrcamentoDerivadoResponse>('/api/orcamento/derivado', { params: { meses: 12 } })).data,
    staleTime: 10 * 60_000,
  });

  const baselineQ = useQuery<OrcamentoBaselineResponse>({
    queryKey: ['orcamento', 'baseline'],
    queryFn: async () => (await api.get<OrcamentoBaselineResponse>('/api/orcamento/baseline')).data,
    staleTime: 10 * 60_000,
  });

  const syncM = useMutation<OrcamentoSyncResponse>({
    mutationFn: async () => (await api.post<OrcamentoSyncResponse>('/api/orcamento/sincronizar')).data,
    onSuccess: (r) => {
      if (r.status === 'erro') {
        toast.error(r.mensagem ?? 'Falha ao sincronizar com o Globus.');
        return;
      }
      toast.success(`Baseline sincronizado: ${r.registrosLidos} linhas lidas, ${r.etlGravados} processadas.`);
      void qc.invalidateQueries({ queryKey: ['orcamento'] });
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const data = baselineQ.data;
  const disponivel = !!data?.disponivel;
  const maxAno = Math.max(1, ...(data?.anos.map((a) => a.totalCents) ?? [0]));
  const maxCentro = Math.max(1, ...(data?.porCentroCusto.map((c) => c.valorCents) ?? [0]));

  const der = derivadoQ.data;
  const derDisponivel = !!der?.disponivel;

  // --- Adotar/ajustar o orçado de referência (meta) ---
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState<Record<string, string>>({}); // codSetor -> valor em reais
  const [fator, setFator] = useState('');

  const setoresEditaveis = (der?.porSetor ?? []).filter((s): s is OrcamentoDerivadoSetor & { codSetor: string } => s.codSetor !== null);
  const orcadoRef = (s: OrcamentoDerivadoSetor): number => s.metaMensalCents ?? s.mensalSugeridoCents;
  const orcadoRefTotalCents = (der?.porSetor ?? []).reduce((a, s) => a + orcadoRef(s), 0);

  function iniciarEdicao() {
    const inicial: Record<string, string> = {};
    for (const s of setoresEditaveis) inicial[s.codSetor] = (orcadoRef(s) / 100).toFixed(2);
    setRascunho(inicial);
    setFator('');
    setEditando(true);
  }
  function aplicarFator() {
    const f = Number(fator.replace(',', '.'));
    if (!Number.isFinite(f)) return;
    const novo: Record<string, string> = {};
    for (const s of setoresEditaveis) novo[s.codSetor] = ((s.mensalSugeridoCents / 100) * (1 + f / 100)).toFixed(2);
    setRascunho(novo);
  }

  const adotarM = useMutation({
    mutationFn: async () => {
      const itens = setoresEditaveis.map((s) => ({
        codCustoFin: Number(s.codSetor),
        nome: s.nome,
        categoria: s.categoria,
        orcadoMensalCents: Math.round(Number((rascunho[s.codSetor] ?? '0').replace(',', '.')) * 100),
        baseSugeridoCents: s.mensalSugeridoCents,
      }));
      return (await api.post('/api/orcamento/meta', { itens })).data;
    },
    onSuccess: () => {
      toast.success('Orçado de referência adotado. O comparativo agora usa a sua meta.');
      void qc.invalidateQueries({ queryKey: ['orcamento'] });
      setEditando(false);
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  async function exportar() {
    try {
      const res = await api.get('/api/orcamento/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orcamento-${der?.mesComparado?.slice(0, 7) ?? 'atual'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(extrairMensagemErro(err));
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ClipboardList className="h-6 w-6 text-gray-400" />
            Orçamento
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Baseline histórico — o único orçamento que a Pioneira lançou no Globus (2018–2020). Serve de
            referência e de ponto de partida para o financeiro confirmar o eixo e o formato do orçamento atual.
          </p>
        </div>
        {podeSincronizar && (
          <Button onClick={() => syncM.mutate()} disabled={syncM.isPending} variant="outline" size="sm">
            {syncM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-2">Sincronizar baseline</span>
          </Button>
        )}
      </div>

      <ModuleStatusBanner href="/orcamento" />

      {/* ORÇADO SUGERIDO (base técnica derivada do realizado) — a parte útil hoje,
          funciona do Contas a Pagar sem depender de sync do Globus. */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {der?.metaAdotada ? 'Orçado de referência' : 'Orçado sugerido — base técnica'}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${der?.metaAdotada ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300'}`}>
                {der?.metaAdotada ? 'adotado' : 'projetado'}
              </span>
            </h2>
            <p className="mt-1 max-w-2xl text-xs text-gray-500 dark:text-gray-400">
              {der?.metaAdotada ? (
                <>
                  Orçado adotado pelo financeiro (partiu da base técnica e foi ajustado). O comparativo usa esta meta.{' '}
                  {der?.metaAdotadaEm ? `Adotado em ${new Date(der.metaAdotadaEm).toLocaleDateString('pt-BR')}.` : ''}
                </>
              ) : (
                <>
                  Média mensal do que cada setor gastou de fato nos últimos {der?.baseMeses ?? 12} meses (Contas a Pagar por
                  centro de custo). <strong>Não é o orçamento oficial</strong> — é uma sugestão para o financeiro partir dela e
                  ajustar (aí vira a sua meta).
                </>
              )}
            </p>
          </div>

          {derDisponivel && (
            <div className="flex items-center gap-2">
              {editando ? (
                <>
                  <div className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 dark:border-gray-700">
                    <span className="text-[11px] text-gray-500">fator</span>
                    <input
                      type="number"
                      value={fator}
                      onChange={(e) => setFator(e.target.value)}
                      placeholder="±%"
                      className="w-14 bg-transparent text-xs outline-none"
                    />
                    <button type="button" onClick={aplicarFator} className="text-[11px] font-semibold text-pioneira-700 dark:text-yellow-400">aplicar</button>
                  </div>
                  <Button onClick={() => adotarM.mutate()} disabled={adotarM.isPending} size="sm">
                    {adotarM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    <span className="ml-1">Salvar</span>
                  </Button>
                  <Button onClick={() => setEditando(false)} variant="outline" size="sm"><X className="h-4 w-4" /></Button>
                </>
              ) : (
                <>
                  <Button onClick={iniciarEdicao} variant="outline" size="sm">
                    <Pencil className="h-4 w-4" /><span className="ml-1">{der?.metaAdotada ? 'Ajustar' : 'Adotar/ajustar'}</span>
                  </Button>
                  <Button onClick={exportar} variant="outline" size="sm">
                    <Download className="h-4 w-4" /><span className="ml-1">Exportar</span>
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {derivadoQ.isLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : !derDisponivel ? (
          <p className="mt-3 text-sm text-gray-400">
            {der?.observacoes[0] ?? 'Sem realizado por centro de custo para derivar um orçado.'}
          </p>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
              <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900/40 dark:bg-sky-950/20">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{der!.metaAdotada ? 'Orçado mensal (adotado)' : 'Orçado mensal sugerido'}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-sky-700 dark:text-sky-300">{moeda(orcadoRefTotalCents)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Orçado anual</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{moedaCurta(orcadoRefTotalCents * 12)}</p>
              </div>
              <div className="col-span-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700 lg:col-span-1">
                <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">Janela do cálculo</p>
                <p className="mt-1 text-sm font-medium">{dataBr(der!.mesInicio)} — {dataBr(der!.mesFim)}</p>
                <p className="text-[11px] text-gray-400">{der!.porSetor.length} setores · realizado {moedaCurta(der!.totalRealizadoCents)}</p>
              </div>
            </div>

            {der!.mesComparado && (
              <div className="mt-4 rounded-lg border border-gray-200 p-3 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm">
                    <strong>Realizado × orçado sugerido</strong> — {der!.mesComparadoLabel} (último mês completo):{' '}
                    <span className="font-semibold tabular-nums">{moedaCurta(der!.realizadoMesTotalCents)}</span> realizado ·{' '}
                    <span className="font-semibold tabular-nums">{moedaCurta(orcadoRefTotalCents)}</span> orçado
                  </p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${der!.qtdEstouros > 0 ? 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'}`}>
                    {der!.qtdEstouros > 0 ? `${der!.qtdEstouros} setor(es) acima de 110%` : 'nenhum estouro'}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                  Estouro = o setor gastou mais de 110% da própria média mensal nesse mês. Não é orçamento oficial — é o ritmo do próprio setor.
                </p>
              </div>
            )}

            <div className="mt-4 space-y-5">
              {CATEGORIA_ORDEM.filter((cat) => der!.porSetor.some((s) => s.categoria === cat)).map((cat) => {
                const setores = der!.porSetor.filter((s) => s.categoria === cat);
                const subtotal = setores.reduce((acc, s) => acc + orcadoRef(s), 0);
                const maxGrupo = Math.max(1, ...setores.map((s) => orcadoRef(s)));
                const meta = CATEGORIA_META[cat]!;
                return (
                  <div key={cat}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.badge}`}>
                        {meta.label}
                      </span>
                      <span className="text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                        subtotal {moeda(subtotal)}/mês
                      </span>
                    </div>

                    {cat === 'central' && (
                      <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                        ⚠️ Este valor <strong>não é o custo próprio da administração</strong>. É o centro de custo por onde a
                        empresa <strong>paga as dívidas dos outros setores</strong> — por isso aparece muito maior. Um custo
                        por garagem de verdade depende do financeiro definir o rateio.
                      </p>
                    )}

                    <div className="space-y-3">
                      {setores.map((s, i) => (
                        <div key={`${s.codSetor ?? 'sem'}-${i}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[220px_1fr_160px]">
                          <span className="truncate text-sm text-gray-700 dark:text-gray-300" title={s.nome ?? undefined}>
                            {s.nome ?? (s.codSetor !== null ? `Centro ${s.codSetor}` : 'Sem centro de custo')}
                          </span>
                          <div className="col-span-2 sm:col-span-1">
                            <Barra valor={orcadoRef(s)} max={maxGrupo} cor={meta.barra} />
                          </div>
                          <div className="text-right" title={`Realizado ${der!.baseMeses}m: ${moeda(s.realizadoCents)} · ${s.mesesComGasto} meses com gasto`}>
                            {editando && s.codSetor !== null ? (
                              <div className="flex items-center justify-end gap-1">
                                <span className="text-[11px] text-gray-400">R$</span>
                                <input
                                  type="number"
                                  value={rascunho[s.codSetor] ?? ''}
                                  onChange={(e) => { const cod = s.codSetor!; setRascunho((r) => ({ ...r, [cod]: e.target.value })); }}
                                  className="w-24 rounded border border-gray-200 bg-transparent px-1.5 py-0.5 text-right text-sm tabular-nums outline-none focus:border-pioneira-400 dark:border-gray-700"
                                />
                                <span className="text-[11px] text-gray-400">/mês</span>
                              </div>
                            ) : (
                              <>
                                <span className="text-sm font-medium tabular-nums">
                                  {moeda(orcadoRef(s))}<span className="text-gray-400">/mês</span>
                                  {der!.metaAdotada && s.metaMensalCents !== null && (
                                    <span className="ml-1 text-[10px] font-normal text-emerald-600 dark:text-emerald-400">meta</span>
                                  )}
                                </span>
                                {der!.mesComparado && (
                                  <p className={`text-[11px] tabular-nums ${s.estourou ? 'font-semibold text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                    {der!.mesComparadoLabel}: {moedaCurta(s.realizadoMesCents)}
                                    {orcadoRef(s) > 0 && s.realizadoMesCents > 0 ? ` · ${s.variacaoPerc.toFixed(0)}%` : ''}
                                    {s.estourou ? ' ⚠️' : ''}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <ul className="mt-4 space-y-1 border-t border-gray-100 pt-3 text-[11px] text-gray-500 dark:border-gray-800 dark:text-gray-400">
              {der!.observacoes.map((o, i) => <li key={i}>· {o}</li>)}
            </ul>
          </>
        )}
      </Card>

      {/* Referência histórica — o orçado legado do Globus (2018-2020). */}
      <div className="flex items-center gap-2 pt-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Referência histórica (Globus)</span>
        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
      </div>

      {baselineQ.isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {/* Estado vazio */}
      {data && !disponivel && (
        <Card className="p-8 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 font-medium">Baseline ainda não sincronizado</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {data.observacoes[0] ?? 'Clique em Sincronizar para importar o orçado legado (2018–2020) do Globus.'}
          </p>
          {podeSincronizar && (
            <Button onClick={() => syncM.mutate()} disabled={syncM.isPending} className="mt-4">
              {syncM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Sincronizar agora</span>
            </Button>
          )}
        </Card>
      )}

      {data && disponivel && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <CalendarRange className="h-4 w-4" />
                <span>Período do baseline</span>
              </div>
              <p className="mt-2 text-lg font-semibold">{dataBr(data.dataMin)} — {dataBr(data.dataMax)}</p>
              <p className="mt-1 text-[11px] text-gray-400">{data.qtdLinhas.toLocaleString('pt-BR')} lançamentos · {data.qtdCentrosCusto} centros de custo</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <TrendingUp className="h-4 w-4" />
                <span>Receita orçada</span>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{moedaCurta(data.totalReceitaCents)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <TrendingDown className="h-4 w-4" />
                <span>Despesa orçada</span>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-amber-600 dark:text-amber-400">{moedaCurta(data.totalDespesaCents)}</p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <ClipboardList className="h-4 w-4" />
                <span>Total movimentado</span>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{moedaCurta(data.totalCents)}</p>
            </Card>
          </div>

          {/* Isca pro financeiro — o coração deste módulo enquanto o orçado atual não chega */}
          <Card className="border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-sm text-amber-900 dark:text-amber-100">
                <p className="font-semibold">Isto é um baseline legado — precisamos da sua confirmação para seguir.</p>
                <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-amber-800 dark:text-amber-200 list-disc pl-4">
                  {data.observacoes.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ul>
                <Link
                  href="/perguntas?modulo=/orcamento"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-200/70 px-3 py-1.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-300/70 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-800/50"
                >
                  Responder na aba “Perguntas ao Financeiro” <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </Card>

          {/* Orçado por ano */}
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Orçado por ano (VALOR movimentado — receita + despesa)</h2>
            <div className="mt-4 space-y-3">
              {data.anos.map((a) => (
                <div key={a.ano} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[64px_1fr_140px]">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{a.ano}</span>
                  <div className="col-span-2 sm:col-span-1">
                    <Barra valor={a.totalCents} max={maxAno} cor="bg-pioneira-400 dark:bg-yellow-500" />
                  </div>
                  <span className="text-right text-sm font-medium tabular-nums" title={`${a.qtdLinhas} lançamentos`}>{moeda(a.totalCents)}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-gray-400">
              Receita e despesa vêm em colunas separadas no Globus (TIPORECEITA/TIPODESPESA); o valor mora em VALOR.
            </p>
          </Card>

          {/* Orçado por centro de custo (ano de detalhe) */}
          <Card className="overflow-hidden">
            <div className="p-4 pb-2">
              <h2 className="text-sm font-semibold">
                Orçado por centro de custo{data.anoDetalhe ? ` — ${data.anoDetalhe}` : ''}
              </h2>
              <p className="text-xs text-gray-400">
                Eixo CCUSTOFINANC — o mesmo “setor” do Contas a Pagar, onde o realizado já está pronto.
              </p>
            </div>
            {data.porCentroCusto.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-gray-400">Sem centro de custo no ano de detalhe.</p>
            ) : (
              <div className="space-y-3 p-4 pt-2">
                {data.porCentroCusto.map((c, i) => (
                  <div key={`${c.codCustoFin ?? 'sem'}-${i}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[220px_1fr_140px]">
                    <span className="truncate text-sm text-gray-700 dark:text-gray-300" title={c.descricao ?? undefined}>
                      {c.descricao ?? (c.codCustoFin !== null ? `Centro ${c.codCustoFin}` : 'Sem centro de custo')}
                    </span>
                    <div className="col-span-2 sm:col-span-1">
                      <Barra valor={c.valorCents} max={maxCentro} cor="bg-sky-400 dark:bg-sky-500" />
                    </div>
                    <span className="text-right text-sm font-medium tabular-nums">{moeda(c.valorCents)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Rastreabilidade */}
          <p className="text-xs text-gray-400">
            Fonte: <strong>CPGORCPREVISOES</strong> do Globus (empresa {data.empresaId}) — o subsistema novo
            (CPG_CAD_ORCAMENTO_*) está vazio. Dado legado, sem lançamento de 2021 em diante.
            {data.ultimoSyncEm && ` Última sincronização: ${new Date(data.ultimoSyncEm).toLocaleString('pt-BR')}.`}
          </p>
        </>
      )}
    </div>
  );
}
