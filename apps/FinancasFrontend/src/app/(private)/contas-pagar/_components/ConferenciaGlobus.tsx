'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, Scale, WifiOff } from 'lucide-react';
import type { CpConferenciaResponse } from '@pioneira/shared/schemas/cp-conferencia';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Confere os totais do período contra o Globus, somando os dois lados de forma
 * independente.
 *
 * É a defesa contra a classe de erro em que cada linha está certa e só o TOTAL
 * está errado — duplicidade que o ERP não sinaliza. Em 23/07/2026 um caso desses
 * (título cancelado somando junto com o reemitido) só apareceu porque o
 * financeiro trouxe uma planilha. Agora o próprio sistema avisa.
 */
export function ConferenciaGlobus({ dtIni, dtFim }: { dtIni: string; dtFim: string }) {
  // Recolhido por padrão — o detalhe só aparece se o financeiro clicar no cabeçalho.
  const [aberto, setAberto] = useState(false);
  const { data, isLoading } = useQuery<CpConferenciaResponse>({
    queryKey: ['contas-pagar', 'conferencia', dtIni, dtFim],
    queryFn: async () =>
      (await api.get<CpConferenciaResponse>('/api/contas-pagar/conferencia', { params: { dtIni, dtFim } })).data,
    enabled: !!dtIni && !!dtFim,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <Card className="flex items-center gap-2 p-3 text-[12px] text-gray-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Conferindo com o Globus…
      </Card>
    );
  }
  if (!data) return null;

  if (data.indisponivel) {
    return (
      <Card className="flex items-start gap-2 p-3 text-[12px] text-gray-500 dark:text-gray-400">
        <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          <strong>Conferência com o Globus indisponível.</strong> {data.indisponivel}{' '}
          Os números abaixo vêm só do banco local — sem contraprova do ERP no momento.
        </span>
      </Card>
    );
  }

  const t = data.totalSomavel;
  const divergentes = data.porStatus.filter((l) => !l.ok);

  return (
    <Card
      className={cn(
        'p-0 overflow-hidden',
        data.conferido
          ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20'
          : 'border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20',
      )}
    >
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="w-full flex flex-wrap items-center gap-2 p-3 text-left hover:brightness-95 dark:hover:brightness-110 transition-[filter]"
      >
        {data.conferido
          ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          : <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />}
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          <Scale className="h-3.5 w-3.5" /> Conferência com o Globus
        </span>
        <span className={cn('text-[13px] font-medium', data.conferido
          ? 'text-emerald-700 dark:text-emerald-300'
          : 'text-red-700 dark:text-red-300')}
        >
          {data.resumo}
        </span>
        {aberto ? <ChevronDown className="h-4 w-4 text-gray-400 ml-auto shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 ml-auto shrink-0" />}
      </button>

      {aberto && (
      <div className="px-3 pb-3 border-t border-gray-200/60 dark:border-gray-800/60 pt-2">
      <div className="grid gap-2 text-[12px] sm:grid-cols-3">
        <div>
          <span className="block text-[10px] uppercase tracking-wide text-gray-400">Neste sistema</span>
          <span className="font-mono font-semibold">{moeda(t.sistemaCents)}</span>
          <span className="ml-1 text-gray-400">({t.sistemaQuantidade} tít.)</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wide text-gray-400">No Globus</span>
          <span className="font-mono font-semibold">{moeda(t.globusCents)}</span>
          <span className="ml-1 text-gray-400">({t.globusQuantidade} tít.)</span>
        </div>
        <div>
          <span className="block text-[10px] uppercase tracking-wide text-gray-400">Diferença</span>
          <span className={cn('font-mono font-semibold', t.difCents === 0
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-red-600 dark:text-red-400')}
          >
            {moeda(t.difCents)}
          </span>
        </div>
      </div>

      {divergentes.length > 0 && (
        <div className="mt-2 border-t border-red-200 pt-2 dark:border-red-900">
          <p className="mb-1 text-[11px] font-medium text-red-800 dark:text-red-200">Onde diverge:</p>
          <ul className="space-y-0.5">
            {divergentes.map((l) => (
              <li key={l.statusGlobus} className="text-[11px] text-red-700 dark:text-red-300">
                {l.rotulo}: nós {moeda(l.sistemaCents)} ({l.sistemaQuantidade}) ·
                {' '}Globus {moeda(l.globusCents)} ({l.globusQuantidade}) ·
                {' '}<strong>{moeda(l.difCents)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-2 text-[10px] italic leading-snug text-gray-400">
        Os dois lados são somados de forma independente — nós no banco local, o Globus no Oracle.
        Substituídos e cancelados ficam fora dos dois, pela mesma regra.
        Diferença aqui significa dado desatualizado (sincronize) ou um padrão de duplicidade ainda não tratado.
      </p>
      </div>
      )}
    </Card>
  );
}
