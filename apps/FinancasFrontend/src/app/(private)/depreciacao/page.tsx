'use client';

import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  HardDrive,
  RefreshCw,
  Loader2,
  TrendingDown,
  Building2,
  Wallet,
  Layers,
  Info,
  ChevronRight,
  BookOpen,
} from 'lucide-react';
import type {
  ResumoDepreciacaoResponse,
  SerieDepreciacaoResponse,
  SyncDepreciacaoResponse,
} from '@pioneira/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { api, extrairMensagemErro } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';
import { usePodeSincronizar } from '@/hooks/usePodeSincronizar';
import { ClasseDetalheDialog } from './_components/ClasseDetalheDialog';
import { MetodologiaDialog } from './_components/MetodologiaDialog';
import { FrotaFisicaCard } from './_components/FrotaFisicaCard';

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

interface KpiProps {
  icon: ReactNode;
  label: string;
  valor: string;
  hint?: string;
  tom?: 'neutro' | 'despesa' | 'positivo';
  onClick?: () => void;
}
function Kpi({ icon, label, valor, hint, tom = 'neutro', onClick }: KpiProps) {
  const cor =
    tom === 'despesa'
      ? 'text-amber-600 dark:text-amber-400'
      : tom === 'positivo'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-gray-900 dark:text-gray-100';
  return (
    <Card
      onClick={onClick}
      className={cn(
        'p-4',
        onClick && 'cursor-pointer transition-colors hover:border-gray-300 hover:bg-gray-50/60 dark:hover:border-gray-600 dark:hover:bg-gray-800/40',
      )}
    >
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        {icon}
        <span>{label}</span>
      </div>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', cor)}>{valor}</p>
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </Card>
  );
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

/**
 * Evolução mensal da despesa. Trata explicitamente:
 *  - meses ainda não escriturados → "não lançado" (não R$ 0);
 *  - dezembro (estorno de fechamento, valor negativo) → barra de "ajuste".
 */
function EvolucaoMensal({ serie }: { serie: SerieDepreciacaoResponse['serie'] }) {
  if (serie.length === 0) return <p className="mt-3 text-sm text-gray-400">Sem série disponível.</p>;

  // Último mês com lançamento de verdade; depois dele, zeros = não lançado.
  let lastRealIdx = -1;
  serie.forEach((p, i) => {
    if (p.valorCents !== 0) lastRealIdx = i;
  });
  const positivos = serie.filter((p) => p.valorCents > 0).map((p) => p.valorCents);
  const maxSerie = Math.max(1, ...positivos);

  return (
    <div>
      <div className="mt-4 flex h-40 items-end gap-1">
        {serie.map((p, i) => {
          const naoLancado = p.valorCents === 0 && i > lastRealIdx;
          const ajuste = p.valorCents < 0;
          const altura = naoLancado
            ? 6
            : ajuste
              ? 14
              : Math.max(2, Math.round((p.valorCents / maxSerie) * 100));
          const rotulo = naoLancado
            ? `${p.competenciaLabel}: não lançado`
            : ajuste
              ? `${p.competenciaLabel}: ajuste de fechamento (${moeda(p.valorCents)})`
              : `${p.competenciaLabel}: ${moeda(p.valorCents)}`;
          return (
            <div key={p.competencia} className="group relative flex flex-1 flex-col items-center justify-end">
              <div
                className={cn(
                  'w-full rounded-t transition-colors',
                  naoLancado
                    ? 'border border-dashed border-gray-300 bg-transparent dark:border-gray-600'
                    : ajuste
                      ? 'bg-amber-400 group-hover:bg-amber-500 dark:bg-amber-500'
                      : 'bg-sky-400 group-hover:bg-sky-500 dark:bg-sky-500',
                )}
                style={{ height: `${altura}%` }}
              />
              <span className="pointer-events-none absolute -top-7 z-10 whitespace-nowrap rounded bg-gray-900 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                {rotulo}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-sky-400" /> depreciação do mês
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-amber-400" /> ajuste de fechamento (dez)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm border border-dashed border-gray-400" /> não lançado
        </span>
        <span>· passe o mouse nas barras.</span>
      </div>
    </div>
  );
}

export default function DepreciacaoPage() {
  // Sincronizar com o Globus e ação de administrador.
  const podeSincronizar = usePodeSincronizar();
  const qc = useQueryClient();
  const [competencia, setCompetencia] = useState<string>('');
  const [classeDetalhe, setClasseDetalhe] = useState<string | null>(null);
  const [metodologiaAberta, setMetodologiaAberta] = useState(false);

  const resumoQ = useQuery<ResumoDepreciacaoResponse>({
    queryKey: ['depreciacao', 'resumo', competencia],
    queryFn: async () => {
      const res = await api.get<ResumoDepreciacaoResponse>('/api/depreciacao/resumo', {
        params: { competencia: competencia || undefined },
      });
      return res.data;
    },
    staleTime: 10 * 60_000,
  });

  const serieQ = useQuery<SerieDepreciacaoResponse>({
    queryKey: ['depreciacao', 'serie'],
    queryFn: async () => {
      const res = await api.get<SerieDepreciacaoResponse>('/api/depreciacao/serie', { params: { meses: 24 } });
      return res.data;
    },
    staleTime: 10 * 60_000,
  });

  const syncM = useMutation<SyncDepreciacaoResponse>({
    mutationFn: async () => {
      const res = await api.post<SyncDepreciacaoResponse>('/api/depreciacao/sincronizar');
      return res.data;
    },
    onSuccess: (r) => {
      if (r.status === 'erro') {
        toast.error(r.mensagem ?? 'Falha ao sincronizar com o Globus.');
        return;
      }
      toast.success(`Sincronizado: ${r.registrosLidos} linhas lidas, ${r.etlGravados} processadas.`);
      void qc.invalidateQueries({ queryKey: ['depreciacao'] });
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const resumo = resumoQ.data;
  const semDado = resumo && resumo.competencia === null;
  const competenciaFoco = resumo?.competencia ?? '';
  const maxDespesa = Math.max(1, ...(resumo?.despesaPorClasse.map((d) => d.valorCents) ?? [0]));

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <HardDrive className="h-6 w-6 text-gray-400" />
            Depreciação Contábil
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Depreciação lançada na contabilidade do Globus, por classe de ativo. A depreciação é
            calculada pelo financeiro e escriturada mensalmente — o sistema espelha o valor oficial,
            sem recalcular.
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
          {podeSincronizar && (
            <Button onClick={() => syncM.mutate()} disabled={syncM.isPending} variant="outline" size="sm">
              {syncM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Sincronizar</span>
            </Button>
          )}
        </div>
      </div>

      <ModuleStatusBanner href="/depreciacao" />

      {/* Estado vazio */}
      {semDado && (
        <Card className="p-8 text-center">
          <HardDrive className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 font-medium">Nenhum dado de depreciação ainda</p>
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
          {/* KPIs — clicáveis (abrem "Fontes e método") */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              icon={<TrendingDown className="h-4 w-4" />}
              label={`Despesa do mês (${resumo.competenciaLabel})`}
              valor={moeda(resumo.despesaMesCents)}
              hint="só frota própria — não inclui arrendamento"
              tom="despesa"
              onClick={() => setMetodologiaAberta(true)}
            />
            <Kpi
              icon={<Building2 className="h-4 w-4" />}
              label="Imobilizado bruto"
              valor={moedaCurta(resumo.base.brutoCents + resumo.base.direitoUsoCents)}
              hint={`inclui ${moedaCurta(resumo.base.direitoUsoCents)} de arrendamento`}
              onClick={() => setMetodologiaAberta(true)}
            />
            <Kpi
              icon={<Layers className="h-4 w-4" />}
              label="Depreciação acumulada"
              valor={`- ${moedaCurta(resumo.base.acumuladaCents)}`}
              onClick={() => setMetodologiaAberta(true)}
            />
            <Kpi
              icon={<Wallet className="h-4 w-4" />}
              label="Valor líquido"
              valor={moedaCurta(resumo.base.liquidoCents)}
              tom="positivo"
              onClick={() => setMetodologiaAberta(true)}
            />
          </div>

          {/* Contexto (não é defeito): a frota ARRENDADA não é depreciada no razão;
              seu custo é contraprestação (3.1.02.04/05), fora do escopo desta tela. */}
          <Card className="border-sky-200 bg-sky-50 p-4 dark:border-sky-900/50 dark:bg-sky-950/30">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
              <div className="text-sm text-sky-900 dark:text-sky-100">
                <p className="font-semibold">A depreciação cobre só a frota própria — e está correta assim.</p>
                <p className="mt-1 text-xs leading-relaxed text-sky-800 dark:text-sky-200">
                  A <strong>frota arrendada</strong> (os {moedaCurta(resumo.base.direitoUsoCents)} de direito de uso que
                  aparecem na base) <strong>não é depreciada no razão contábil</strong>. O custo mensal dela é escriturado
                  como <strong>contraprestação de arrendamento mercantil</strong> (contas <strong>3.1.02.04</strong> e{' '}
                  <strong>3.1.02.05</strong>), classificada como despesa financeira/operacional — <strong>não como
                  depreciação</strong> — e por isso fica fora desta tela. A frota própria (conta{' '}
                  <strong>3.1.02.07</strong>) já está quase toda depreciada, por isso o valor é baixo. A base
                  (bruto/acumulada/líquido) inclui o direito de uso do arrendamento.
                </p>
                <button
                  type="button"
                  onClick={() => setMetodologiaAberta(true)}
                  className="mt-2 text-xs font-medium text-sky-700 underline-offset-2 hover:underline dark:text-sky-300"
                >
                  Ver fontes e método completo →
                </button>
              </div>
            </div>
          </Card>

          {/* Frota física (contexto: quantos veículos ativos, por setor) — logo no topo
              pra o número de carros ativos ficar visível junto com o valor contábil. */}
          <FrotaFisicaCard />

          {/* Despesa por classe — cada linha abre o detalhe da classe */}
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Despesa de depreciação por classe — {resumo.competenciaLabel}</h2>
              <span className="text-[11px] text-gray-400">clique numa classe pra ver as contas</span>
            </div>
            {resumo.despesaPorClasse.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">Sem despesa lançada nesta competência.</p>
            ) : (
              <div className="mt-4 space-y-1">
                {resumo.despesaPorClasse.map((d) => (
                  <button
                    key={d.classe}
                    type="button"
                    onClick={() => setClasseDetalhe(d.classe)}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-md p-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 sm:grid-cols-[180px_1fr_120px_16px]"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300">{d.label}</span>
                    <div className="col-span-2 sm:col-span-1">
                      <Barra valor={d.valorCents} max={maxDespesa} cor="bg-amber-400 dark:bg-amber-500" />
                    </div>
                    <span className="text-right text-sm font-medium tabular-nums">{moeda(d.valorCents)}</span>
                    <ChevronRight className="hidden h-4 w-4 text-gray-300 sm:block" />
                  </button>
                ))}
              </div>
            )}
          </Card>

          {/* Base de ativos por classe — cada linha abre o detalhe da classe */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between p-4 pb-2">
              <div>
                <h2 className="text-sm font-semibold">Base de ativos por classe</h2>
                <p className="text-xs text-gray-400">Saldo acumulado até {resumo.competenciaLabel}.</p>
              </div>
              <span className="text-[11px] text-gray-400">clique numa classe pra ver as contas</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                    <th className="px-4 py-2 font-medium">Classe</th>
                    <th className="px-4 py-2 text-right font-medium">Bruto</th>
                    <th className="px-4 py-2 text-right font-medium">Depreciação acum.</th>
                    <th className="px-4 py-2 text-right font-medium">Líquido</th>
                    <th className="w-6 px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {resumo.basePorClasse.map((b) => (
                    <tr
                      key={b.classe}
                      onClick={() => setClasseDetalhe(b.classe)}
                      className="cursor-pointer border-b border-gray-50 transition-colors last:border-0 hover:bg-gray-50 dark:border-gray-800/50 dark:hover:bg-gray-800/50"
                    >
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300">{b.label}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{moeda(b.brutoCents)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-500">- {moeda(b.acumuladaCents)}</td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums">{moeda(b.liquidoCents)}</td>
                      <td className="px-2 py-2 text-right">
                        <ChevronRight className="h-4 w-4 text-gray-300" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Evolução mensal */}
          <Card className="p-4">
            <h2 className="text-sm font-semibold">Evolução da despesa mensal (24 meses)</h2>
            {serieQ.data ? (
              <EvolucaoMensal serie={serieQ.data.serie} />
            ) : (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
          </Card>

          {/* Nota de rastreabilidade */}
          <p className="text-xs text-gray-400">
            Fonte: razão contábil do Globus (CTBSALDO). Despesa = conta <strong>3.1.02.07</strong> (frota própria);
            base = <strong>1.3.02.01/02</strong> (bruto + direito de uso) e <strong>1.3.02.50</strong> (acumulada).
            A frota própria está quase toda depreciada; o arrendamento mercantil entra como direito de uso na base, mas
            <strong> não é depreciado no razão</strong> — seu custo é contraprestação (<strong>3.1.02.04/05</strong>),
            não depreciação.{' '}
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
      <ClasseDetalheDialog
        classe={classeDetalhe}
        competencia={competenciaFoco}
        onClose={() => setClasseDetalhe(null)}
      />
      <MetodologiaDialog
        aberto={metodologiaAberta}
        onClose={() => setMetodologiaAberta(false)}
        atualizadoEm={resumo?.atualizadoEm ?? null}
      />
    </div>
  );
}
