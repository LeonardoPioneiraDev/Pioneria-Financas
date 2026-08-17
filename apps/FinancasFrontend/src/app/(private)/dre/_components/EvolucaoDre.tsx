'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { DreSerieResponse } from '@pioneira/shared';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

function moedaCurta(cents: number): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  const s = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${s}R$ ${(abs / 1_000_000).toFixed(2)} M`;
  if (abs >= 1_000) return `${s}R$ ${(abs / 1_000).toFixed(0)} K`;
  return `${s}R$ ${abs.toFixed(0)}`;
}

/** Evolução do resultado líquido por mês — barras divergentes (verde acima / vermelho abaixo). */
export function EvolucaoDre() {
  const serieQ = useQuery<DreSerieResponse>({
    queryKey: ['dre', 'serie'],
    queryFn: async () => {
      const res = await api.get<DreSerieResponse>('/api/dre/serie', { params: { meses: 12 } });
      return res.data;
    },
    staleTime: 10 * 60_000,
  });

  const serie = serieQ.data?.serie ?? [];
  const max = Math.max(1, ...serie.map((p) => Math.abs(p.resultadoLiquidoCents)));

  return (
    <Card className="p-4">
      <h2 className="text-sm font-semibold">Evolução do resultado líquido (12 meses)</h2>
      {serieQ.isLoading ? (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : serie.length === 0 ? (
        <p className="mt-3 text-sm text-gray-400">Sem série disponível.</p>
      ) : (
        <>
          <div className="mt-4 flex h-44 items-stretch gap-1">
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
                  <span className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-1.5 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                    {p.competenciaLabel}
                    <br />
                    RL {moedaCurta(p.receitaLiquidaCents)} · Op {moedaCurta(p.resultadoOperacionalCents)}
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
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-emerald-400" /> resultado positivo
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-sm bg-red-400" /> resultado negativo
            </span>
            <span>· passe o mouse pra ver receita líquida e resultado operacional.</span>
          </div>
        </>
      )}
    </Card>
  );
}
