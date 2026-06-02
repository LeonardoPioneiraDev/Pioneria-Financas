'use client';

import type { LucideIcon } from 'lucide-react';
import { AlertCircle, Ban, CalendarClock, CalendarDays, CheckCircle2, FileText } from 'lucide-react';
import { format } from 'date-fns';
import type { SumarioContasPagarResponse } from '@pioneira/shared/schemas/contas-pagar';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/** 5 cards mutuamente exclusivos que SOMAM o total no período. */
export type CardFiltroId = 'todos' | 'pago' | 'vencer_mais_7' | 'proximos7' | 'vencidos' | 'cancelado';

interface SumarioCardsProps {
  sumario: SumarioContasPagarResponse;
  carregando: boolean;
  filtroAtivo: CardFiltroId;
  onClickCard: (id: CardFiltroId) => void;
  /** Período base que está na barra de filtros (YYYY-MM-DD). */
  periodoBase: { dtIni: string; dtFim: string };
}

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function moedaCompacta(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} K`;
  return moeda(cents);
}
function dataBr(iso: string): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'dd/MM/yyyy');
}
function periodoTexto(dtIni: string, dtFim: string): string {
  if (!dtFim) return dataBr(dtIni);
  const fimDt = new Date(`${dtFim}T00:00:00`);
  if (Number.isNaN(fimDt.getTime())) return dataBr(dtIni);
  fimDt.setDate(fimDt.getDate() - 1);
  return `${dataBr(dtIni)} a ${format(fimDt, 'dd/MM/yyyy')}`;
}
function hoje(): Date { return new Date(); }
function emNDias(n: number): Date {
  const d = hoje();
  d.setDate(d.getDate() + n);
  return d;
}

interface CardData {
  id: CardFiltroId;
  icone: LucideIcon;
  titulo: string;
  quantidade: number;
  valor: number;
  cor: string;
  periodo: string;
  destaque?: string;
  pctTotal?: number;
}

export function SumarioCards({ sumario, carregando, filtroAtivo, onClickCard, periodoBase }: SumarioCardsProps) {
  if (carregando) {
    return (
      <div className="space-y-3">
        <div className="h-20 animate-pulse bg-gray-100 dark:bg-gray-900 rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4 h-[140px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const periodoBaseTexto = periodoTexto(periodoBase.dtIni, periodoBase.dtFim);
  const periodo7dTexto = `Vence entre ${format(hoje(), 'dd/MM')} e ${format(emNDias(7), 'dd/MM')}`;
  const periodoVencidosTexto = `Vencimento antes de ${format(hoje(), 'dd/MM/yyyy')}`;
  const periodoMaisDe7Texto = `Vence após ${format(emNDias(7), 'dd/MM/yyyy')}`;

  const total = sumario.total.quantidade;
  const pct = (n: number): number => (total > 0 ? Math.round((n / total) * 100) : 0);

  const cards: CardData[] = [
    {
      id: 'vencidos',
      icone: AlertCircle,
      titulo: 'Vencido',
      quantidade: sumario.vencidos.quantidade,
      valor: sumario.vencidos.valorAPagarCents,
      cor: 'from-red-500 to-red-400 dark:from-red-600 dark:to-red-500',
      periodo: periodoVencidosTexto,
      destaque: sumario.vencidos.quantidade > 0 ? 'ring-1 ring-red-300 dark:ring-red-700' : undefined,
      pctTotal: pct(sumario.vencidos.quantidade),
    },
    {
      id: 'proximos7',
      icone: CalendarClock,
      titulo: 'Vence em 7 dias',
      quantidade: sumario.proximos7Dias.quantidade,
      valor: sumario.proximos7Dias.valorAPagarCents,
      cor: 'from-amber-400 to-amber-300 dark:from-amber-500 dark:to-amber-600',
      periodo: periodo7dTexto,
      pctTotal: pct(sumario.proximos7Dias.quantidade),
    },
    {
      id: 'vencer_mais_7',
      icone: CalendarDays,
      titulo: 'Vence em mais de 7 dias',
      quantidade: sumario.vencerMaisDe7.quantidade,
      valor: sumario.vencerMaisDe7.valorAPagarCents,
      cor: 'from-blue-400 to-blue-300 dark:from-blue-500 dark:to-blue-600',
      periodo: periodoMaisDe7Texto,
      pctTotal: pct(sumario.vencerMaisDe7.quantidade),
    },
    {
      id: 'pago',
      icone: CheckCircle2,
      titulo: 'Pago',
      quantidade: sumario.pago.quantidade,
      valor: sumario.pago.valorAPagarCents,
      cor: 'from-emerald-400 to-emerald-300 dark:from-emerald-500 dark:to-emerald-600',
      periodo: periodoBaseTexto,
      pctTotal: pct(sumario.pago.quantidade),
    },
    {
      id: 'cancelado',
      icone: Ban,
      titulo: 'Cancelado',
      quantidade: sumario.cancelados.quantidade,
      valor: sumario.cancelados.valorAPagarCents,
      cor: 'from-gray-400 to-gray-300 dark:from-gray-600 dark:to-gray-500',
      periodo: 'Cancelados em aberto no período',
      pctTotal: pct(sumario.cancelados.quantidade),
    },
  ];

  const somaCards = cards.reduce((acc, c) => acc + c.quantidade, 0);
  const consistente = somaCards === total;

  return (
    <div className="space-y-3">
      {/* Header KPI — Total no período (não clicável) */}
      <Card className="p-4 sm:p-5 bg-gradient-to-r from-pioneira-50/60 to-pioneira-100/30 dark:from-yellow-950/30 dark:to-yellow-900/10 border-pioneira-300 dark:border-yellow-800">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-pioneira-700 dark:text-yellow-400 font-bold">
              Total no período
            </p>
            <p className="text-2xl sm:text-3xl font-bold mt-1 text-pioneira-900 dark:text-yellow-200">
              {moeda(sumario.total.valorAPagarCents)}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
              <strong>{total.toLocaleString('pt-BR')}</strong> títulos · {periodoBaseTexto}
            </p>
          </div>
          <div className="shrink-0 h-12 w-12 rounded-xl bg-gradient-to-br from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center shadow-md">
            <FileText className="h-6 w-6 text-white" />
          </div>
        </div>
        {/* Barra de composição empilhada */}
        {total > 0 && (
          <div className="mt-3">
            <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
              {cards.map((c) => {
                const w = total > 0 ? (c.quantidade / total) * 100 : 0;
                if (w === 0) return null;
                return (
                  <div
                    key={c.id}
                    className={`h-full bg-gradient-to-r ${c.cor} transition-all`}
                    style={{ width: `${w}%` }}
                    title={`${c.titulo}: ${c.quantidade.toLocaleString('pt-BR')} (${c.pctTotal}%)`}
                  />
                );
              })}
            </div>
            {!consistente && (
              <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1">
                ⚠ soma dos cards ({somaCards}) ≠ total ({total}) — diferença de {Math.abs(total - somaCards)} título(s)
              </p>
            )}
          </div>
        )}
      </Card>

      {/* 5 cards mutuamente exclusivos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {cards.map((c) => {
          const Icone = c.icone;
          const ativo = filtroAtivo === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onClickCard(c.id)}
              className={cn(
                'group text-left transition-transform duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-pioneira-400 rounded-3xl',
                ativo ? 'scale-[1.02]' : 'hover:scale-[1.01]',
              )}
            >
              <Card
                className={cn(
                  'p-4 transition-all cursor-pointer h-full',
                  c.destaque,
                  ativo && 'ring-2 ring-pioneira-400 dark:ring-yellow-400 shadow-xl',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                      {c.titulo}
                    </p>
                    <p className="text-xl sm:text-2xl font-bold mt-1 truncate" title={moeda(c.valor)}>
                      {moedaCompacta(c.valor)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <strong>{c.quantidade.toLocaleString('pt-BR')}</strong> {c.quantidade === 1 ? 'título' : 'títulos'}
                      {c.pctTotal !== undefined && total > 0 && (
                        <span className="text-gray-400 dark:text-gray-500"> · {c.pctTotal}% do total</span>
                      )}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 truncate" title={c.periodo}>
                      {c.periodo}
                    </p>
                  </div>
                  <div className={`shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br ${c.cor} flex items-center justify-center shadow-md`}>
                    <Icone className="h-5 w-5 text-white" />
                  </div>
                </div>
                {ativo && (
                  <div className="mt-3 pt-2 border-t border-pioneira-400/30 dark:border-yellow-400/30">
                    <p className="text-[10px] text-pioneira-700 dark:text-yellow-300 font-medium uppercase tracking-wider">
                      ↓ Filtrando a tabela por este card
                    </p>
                  </div>
                )}
              </Card>
            </button>
          );
        })}
      </div>
    </div>
  );
}
