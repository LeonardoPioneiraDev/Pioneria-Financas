'use client';

import { Loader2, ArrowUpRight, ArrowDownRight, Scale } from 'lucide-react';
import type { FluxoRealizadoResponse } from '@pioneira/shared';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function moedaCurta(cents: number): string {
  const v = Math.abs(cents) / 100;
  const s = cents < 0 ? '-' : '';
  if (v >= 1_000_000) return `${s}R$ ${(v / 1_000_000).toFixed(2)} M`;
  if (v >= 1_000) return `${s}R$ ${(v / 1_000).toFixed(0)} K`;
  return moeda(cents);
}
function ddMM(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** Painel do fluxo REALIZADO de um período (entrou × saiu de fato no extrato). */
export function RealizadoPanel({ data, loading }: { data: FluxoRealizadoResponse | undefined; loading: boolean }) {
  if (loading) {
    return (
      <Card className="p-10 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-pioneira-600" />
        <p className="mt-2 text-sm text-gray-500">Carregando o realizado…</p>
      </Card>
    );
  }
  if (!data) return null;

  if (data.mensagem && data.totalEntrouCents === 0 && data.totalSaiuCents === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">{data.mensagem}</p>
      </Card>
    );
  }

  const max = Math.max(1, ...data.serie.map((d) => Math.max(d.entrouCents, d.saiuCents)));

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <ArrowUpRight className="h-4 w-4 text-emerald-600" /> Entrou (créditos)
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{moedaCurta(data.totalEntrouCents)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <ArrowDownRight className="h-4 w-4 text-red-600" /> Saiu (débitos)
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-red-600 dark:text-red-400">{moedaCurta(data.totalSaiuCents)}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Scale className="h-4 w-4 text-gray-500" /> Variação líquida
          </div>
          <p className={cn('mt-2 text-2xl font-semibold tabular-nums', data.variacaoCents >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
            {moedaCurta(data.variacaoCents)}
          </p>
          <p className="mt-1 text-[11px] text-gray-400">entrou − saiu no período</p>
        </Card>
      </div>

      {/* Gráfico diário (entrou acima / saiu abaixo) */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold">Entrou × saiu por dia</h2>
        {data.serie.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">Sem movimento.</p>
        ) : (
          <>
            <div className="mt-4 flex h-48 items-stretch gap-0.5">
              {data.serie.map((d) => {
                const hIn = Math.round((d.entrouCents / max) * 100);
                const hOut = Math.round((d.saiuCents / max) * 100);
                return (
                  <div key={d.data} className="group relative flex flex-1 flex-col">
                    <div className="flex flex-1 flex-col justify-end">
                      {d.entrouCents > 0 && <div className="rounded-t bg-emerald-400 dark:bg-emerald-500" style={{ height: `${hIn}%` }} />}
                    </div>
                    <div className="border-t border-gray-200 dark:border-gray-700" />
                    <div className="flex flex-1 flex-col justify-start">
                      {d.saiuCents > 0 && <div className="rounded-b bg-red-400 dark:bg-red-500" style={{ height: `${hOut}%` }} />}
                    </div>
                    <span className="pointer-events-none absolute -top-12 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-1.5 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {ddMM(d.data)}
                      <br />
                      entrou {moedaCurta(d.entrouCents)} · saiu {moedaCurta(d.saiuCents)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-[10px] text-gray-400">
              <span>{data.serie[0] && ddMM(data.serie[0].data)}</span>
              <span>{data.serie[data.serie.length - 1] && ddMM(data.serie[data.serie.length - 1]!.data)}</span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-400" /> entrou</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-red-400" /> saiu</span>
              {data.diasComSaidaMaior > 0 && <span>· {data.diasComSaidaMaior} dia(s) com saída &gt; entrada</span>}
            </div>
          </>
        )}
        <p className="mt-4 border-t border-gray-100 pt-3 text-[11px] text-gray-400 dark:border-gray-800">
          Dados <strong>reais</strong> do extrato bancário (banco_movto): entrou = créditos, saiu = débitos. Não é
          projeção — é o que de fato aconteceu no período.
        </p>
      </Card>
    </div>
  );
}
