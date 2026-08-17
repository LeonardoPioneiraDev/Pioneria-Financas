'use client';

import { useState, Fragment } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileBarChart, RefreshCw, Loader2, Info, BookOpen, ChevronRight, ArrowUp, ArrowDown, Download, Landmark } from 'lucide-react';
import type { DreResumoResponse, DreSyncResponse, DreLinha } from '@pioneira/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, extrairMensagemErro } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';
import { usePodeSincronizar } from '@/hooks/usePodeSincronizar';
import { DreLinhaDetalheDialog } from './_components/DreLinhaDetalheDialog';
import { MetodologiaDreDialog } from './_components/MetodologiaDreDialog';
import { EvolucaoDre } from './_components/EvolucaoDre';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function moedaCurta(cents: number): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${s}R$ ${(abs / 1_000_000).toFixed(2)} M`;
  if (abs >= 1_000) return `${s}R$ ${(abs / 1_000).toFixed(0)} K`;
  return moeda(cents);
}

/** Seções visuais inseridas antes de certas linhas. */
const SECAO_ANTES: Record<string, string> = {
  receita_bruta: 'Receita',
  pessoal: 'Custos e despesas operacionais',
  rec_financeiras: 'Resultado não operacional',
};

/** Variação (Δ) com seta. valorCents é sempre crédito−débito, então subir = melhor. */
function Delta({ atual, anterior, mostrar }: { atual: number; anterior: number; mostrar: boolean }) {
  if (!mostrar) return <span className="text-gray-300">—</span>;
  const d = atual - anterior;
  if (Math.abs(d) < 100) return <span className="text-gray-400">≈</span>;
  const bom = d > 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 tabular-nums', bom ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
      {bom ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {moedaCurta(Math.abs(d))}
    </span>
  );
}

function Kpi({ label, valorCents, anteriorCents, temAnterior }: { label: string; valorCents: number; anteriorCents: number; temAnterior: boolean }) {
  const cor = valorCents >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
  return (
    <Card className="p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', cor)}>{moedaCurta(valorCents)}</p>
      <p className="mt-1 flex items-center gap-1 text-[11px]">
        <span className="text-gray-400">vs. mês anterior:</span>
        <Delta atual={valorCents} anterior={anteriorCents} mostrar={temAnterior} />
      </p>
    </Card>
  );
}

export default function DrePage() {
  // Sincronizar com o Globus e ação de administrador.
  const podeSincronizar = usePodeSincronizar();
  const qc = useQueryClient();
  const [competencia, setCompetencia] = useState<string>('');
  const [modo, setModo] = useState<'mes' | 'ytd'>('mes');
  const [linhaDetalhe, setLinhaDetalhe] = useState<{ codigo: string; titulo: string } | null>(null);
  const [metodologiaAberta, setMetodologiaAberta] = useState(false);

  const resumoQ = useQuery<DreResumoResponse>({
    queryKey: ['dre', 'resumo', competencia],
    queryFn: async () => {
      const res = await api.get<DreResumoResponse>('/api/dre/resumo', { params: { competencia: competencia || undefined } });
      return res.data;
    },
    staleTime: 10 * 60_000,
  });

  const syncM = useMutation<DreSyncResponse>({
    mutationFn: async () => {
      const res = await api.post<DreSyncResponse>('/api/dre/sincronizar');
      return res.data;
    },
    onSuccess: (r) => {
      if (r.status === 'erro') {
        toast.error(r.mensagem ?? 'Falha ao sincronizar com o Globus.');
        return;
      }
      toast.success(`Sincronizado: ${r.registrosGravados} contas de resultado.`);
      void qc.invalidateQueries({ queryKey: ['dre'] });
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const exportM = useMutation({
    mutationFn: async (comp: string) => {
      const res = await api.get('/api/dre/export', { params: { competencia: comp || undefined }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dre-${comp || 'atual'}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const resumo = resumoQ.data;
  const semDado = resumo && resumo.competencia === null;
  const ehYtd = modo === 'ytd';
  const temAnterior = !ehYtd && !!resumo?.competenciaAnterior;
  const baseAV = resumo ? Math.abs(ehYtd ? resumo.receitaLiquidaYtdCents : resumo.receitaLiquidaCents) : 0;

  const clicavel = (l: DreLinha) => !l.ehSubtotal;
  const valorLinha = (l: DreLinha) => (ehYtd ? l.valorYtdCents : l.valorCents);
  const avPct = (valorCents: number) => (baseAV > 0 ? `${Math.round((valorCents / baseAV) * 100)}%` : '—');
  const linhaDe = (cod: string): DreLinha | undefined => resumo?.linhas.find((l) => l.codigo === cod);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <FileBarChart className="h-6 w-6 text-gray-400" />
            DRE — Demonstração de Resultado
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Resultado contábil do mês, direto do razão do Globus (CTBSALDO). O sistema espelha o razão — não recalcula.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {resumo && resumo.mesesDisponiveis.length > 0 && (
            <select
              value={resumo.competencia ?? ''}
              onChange={(e) => setCompetencia(e.target.value)}
              className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              {resumo.mesesDisponiveis.map((m) => (
                <option key={m} value={m}>
                  {m.slice(5, 7)}/{m.slice(0, 4)}
                </option>
              ))}
            </select>
          )}
          <Button onClick={() => setMetodologiaAberta(true)} variant="ghost" size="sm">
            <BookOpen className="h-4 w-4" />
            <span className="ml-2 hidden sm:inline">Fontes e método</span>
          </Button>
          {resumo && !semDado && (
            <Button onClick={() => exportM.mutate(resumo.competencia ?? '')} disabled={exportM.isPending} variant="ghost" size="sm">
              {exportM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              <span className="ml-2 hidden sm:inline">Excel</span>
            </Button>
          )}
          {podeSincronizar && (
            <Button onClick={() => syncM.mutate()} disabled={syncM.isPending} variant="outline" size="sm">
              {syncM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Sincronizar</span>
            </Button>
          )}
        </div>
      </div>

      <ModuleStatusBanner href="/dre" />

      {semDado && (
        <Card className="p-8 text-center">
          <FileBarChart className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 font-medium">Nenhum dado de DRE ainda</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {resumo?.mensagem ?? 'Clique em Sincronizar para importar do Globus.'}
          </p>
          {podeSincronizar && (
            <Button onClick={() => syncM.mutate()} disabled={syncM.isPending} className="mt-4">
              {syncM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Sincronizar agora</span>
            </Button>
          )}
        </Card>
      )}

      {resumoQ.isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {resumo && !semDado && (
        <>
          {/* KPIs com comparativo */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Kpi
              label={`Receita líquida (${resumo.competenciaLabel})`}
              valorCents={resumo.receitaLiquidaCents}
              anteriorCents={linhaDe('receita_liquida')?.valorAnteriorCents ?? 0}
              temAnterior={temAnterior}
            />
            <Kpi
              label="Resultado operacional"
              valorCents={resumo.resultadoOperacionalCents}
              anteriorCents={linhaDe('resultado_operacional')?.valorAnteriorCents ?? 0}
              temAnterior={temAnterior}
            />
            <Kpi
              label="Resultado líquido"
              valorCents={resumo.resultadoLiquidoCents}
              anteriorCents={linhaDe('resultado_liquido')?.valorAnteriorCents ?? 0}
              temAnterior={temAnterior}
            />
          </div>

          {/* Aviso de mês em fechamento (receita ainda não lançada) */}
          {resumo.mesParcial && (
            <Card className="border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                <p className="text-xs leading-relaxed text-red-800 dark:text-red-200">
                  <strong>{resumo.competenciaLabel} ainda está em fechamento.</strong> A receita não foi lançada nesta
                  competência (só parte dos custos entrou), então os valores estão <strong>incompletos</strong>. Selecione
                  um mês fechado no seletor para a DRE completa.
                </p>
              </div>
            </Card>
          )}

          {/* Caveat GDF */}
          <Card className="border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
                <p>
                  Esta é a <strong>DRE contábil</strong>, fiel ao razão. A receita operacional aqui é a{' '}
                  <strong>bilhetagem</strong> (VT/PLE/PNE); o <strong>repasse/subsídio do GDF não entra como receita
                  operacional neste plano de contas</strong> — por isso o resultado operacional pode aparecer negativo. A
                  reconciliação com o repasse do GDF virá na <strong>visão gerencial</strong> (próxima fase).
                </p>
                <button
                  type="button"
                  onClick={() => setMetodologiaAberta(true)}
                  className="mt-1.5 font-medium text-amber-700 underline-offset-2 hover:underline dark:text-amber-300"
                >
                  Ver fontes e método →
                </button>
              </div>
            </div>
          </Card>

          {/* DRE */}
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-2">
              <h2 className="text-sm font-semibold">
                Demonstração de Resultado — {ehYtd ? `acumulado ${resumo.ytdLabel ?? resumo.competenciaLabel}` : resumo.competenciaLabel}
              </h2>
              <div className="flex items-center gap-2">
                {/* Toggle Mês / YTD */}
                <div className="inline-flex overflow-hidden rounded-md border border-gray-200 text-xs dark:border-gray-700">
                  {(['mes', 'ytd'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setModo(m)}
                      className={cn(
                        'px-2.5 py-1 transition-colors',
                        modo === m ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900' : 'text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800',
                      )}
                    >
                      {m === 'mes' ? 'Mês' : 'Acumulado (YTD)'}
                    </button>
                  ))}
                </div>
                <span className="hidden text-[11px] text-gray-400 sm:inline">clique numa linha pra ver as contas</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-gray-100 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                    <th className="px-4 py-2 text-left font-medium">Linha</th>
                    <th className="px-2 py-2 text-right font-medium">% RL</th>
                    <th className="px-4 py-2 text-right font-medium">
                      {ehYtd ? resumo.ytdLabel ?? 'YTD' : resumo.competenciaLabel}
                    </th>
                    {!ehYtd && (
                      <>
                        <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">{resumo.competenciaAnteriorLabel ?? '—'}</th>
                        <th className="px-4 py-2 text-right font-medium">Δ</th>
                      </>
                    )}
                    <th className="w-6 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {resumo.linhas.map((l) => {
                    const valor = valorLinha(l);
                    const negativo = valor < 0;
                    const podeClicar = clicavel(l);
                    return (
                      <Fragment key={l.codigo}>
                        {SECAO_ANTES[l.codigo] && (
                          <tr className="bg-gray-50/60 dark:bg-gray-900/40">
                            <td colSpan={ehYtd ? 4 : 6} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                              {SECAO_ANTES[l.codigo]}
                            </td>
                          </tr>
                        )}
                        <tr
                          onClick={podeClicar ? () => setLinhaDetalhe({ codigo: l.codigo, titulo: l.titulo }) : undefined}
                          className={cn(
                            'border-b border-gray-50 dark:border-gray-800/50',
                            podeClicar && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50',
                            l.ehSubtotal &&
                              'border-t border-gray-200 bg-gray-50/60 font-semibold dark:border-gray-700 dark:bg-gray-900/40',
                          )}
                        >
                          <td className={cn('px-4 py-2', !l.ehSubtotal && 'pl-6 text-gray-700 dark:text-gray-300')}>{l.titulo}</td>
                          <td className="px-2 py-2 text-right text-[11px] tabular-nums text-gray-400">{avPct(valor)}</td>
                          <td className={cn('whitespace-nowrap px-4 py-2 text-right tabular-nums', negativo ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100', l.ehSubtotal && 'font-semibold')}>
                            {moeda(valor)}
                          </td>
                          {!ehYtd && (
                            <>
                              <td className="hidden whitespace-nowrap px-4 py-2 text-right tabular-nums text-gray-400 sm:table-cell">
                                {temAnterior ? moeda(l.valorAnteriorCents) : '—'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-2 text-right text-[11px]">
                                <Delta atual={l.valorCents} anterior={l.valorAnteriorCents} mostrar={temAnterior} />
                              </td>
                            </>
                          )}
                          <td className="px-2 py-2 text-right">
                            {podeClicar && <ChevronRight className="h-4 w-4 text-gray-300" />}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Visão gerencial — reconciliação com o repasse do GDF */}
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4 text-gray-400" />
              <h2 className="text-sm font-semibold">Visão gerencial — reconciliação com o repasse do GDF</h2>
            </div>
            {resumo.repasseGdfCents > 0 ? (
              <>
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">Resultado operacional contábil</span>
                    <span className={cn('tabular-nums', resumo.resultadoOperacionalCents < 0 ? 'text-red-600 dark:text-red-400' : '')}>
                      {moeda(resumo.resultadoOperacionalCents)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">(+) Repasse GDF recebido no mês (extrato)</span>
                    <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{moeda(resumo.repasseGdfCents)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-gray-200 pt-1.5 text-sm font-semibold dark:border-gray-700">
                    <span>= Resultado operacional gerencial (indicativo)</span>
                    {(() => {
                      const g = resumo.resultadoOperacionalCents + resumo.repasseGdfCents;
                      return <span className={cn('tabular-nums', g < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400')}>{moeda(g)}</span>;
                    })()}
                  </div>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
                  <strong>Indicativo, não oficial.</strong> A bilhetagem contábil (VT/PLE/PNE) e o repasse-caixa do GDF são
                  lentes diferentes e podem se sobrepor parcialmente — serve pra dimensionar que o prejuízo operacional
                  contábil é coberto pelo repasse, não pra fechar um número exato. Fonte do repasse: extrato bancário
                  (banco_movto, marcado como repasse BRB).
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                Sem repasse GDF identificado no extrato para {resumo.competenciaLabel}. Sincronize o extrato bancário
                (em Recebíveis / Conciliação) para reconciliar.
              </p>
            )}
          </Card>

          {/* Evolução mensal do resultado */}
          <EvolucaoDre />

          {/* Rastreabilidade */}
          <p className="text-xs text-gray-400">
            Fonte: razão contábil do Globus (CTBSALDO, plano 1), contas de resultado (classe 3 despesa / 4 receita),
            somente contas analíticas (folhas). Valores = crédito − débito por conta, agrupados por linha conforme a
            hierarquia do plano de contas. <strong>% RL</strong> = participação na receita líquida.{' '}
            <button
              type="button"
              onClick={() => setMetodologiaAberta(true)}
              className="font-medium text-gray-500 underline-offset-2 hover:underline dark:text-gray-300"
            >
              Fontes e método
            </button>
            .{resumo.atualizadoEm && ` Última sincronização: ${new Date(resumo.atualizadoEm).toLocaleString('pt-BR')}.`}
          </p>
        </>
      )}

      {/* Diálogos */}
      <DreLinhaDetalheDialog
        linha={linhaDetalhe}
        competencia={resumo?.competencia ?? ''}
        onClose={() => setLinhaDetalhe(null)}
      />
      <MetodologiaDreDialog aberto={metodologiaAberta} onClose={() => setMetodologiaAberta(false)} atualizadoEm={resumo?.atualizadoEm ?? null} />
    </div>
  );
}
