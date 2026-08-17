'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { DreDetalheResponse } from '@pioneira/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface Props {
  /** Linha aberta (null = fechado). */
  linha: { codigo: string; titulo: string } | null;
  competencia: string;
  onClose: () => void;
}

/**
 * Drill-down de uma linha da DRE: as contas do razão (CTBSALDO) que a compõem,
 * com débito/crédito de cada — de onde vem o número.
 */
export function DreLinhaDetalheDialog({ linha, competencia, onClose }: Props) {
  const aberto = linha !== null;
  const detalheQ = useQuery<DreDetalheResponse>({
    queryKey: ['dre', 'detalhe', linha?.codigo, competencia],
    queryFn: async () => {
      const res = await api.get<DreDetalheResponse>('/api/dre/detalhe', {
        params: { linha: linha?.codigo, competencia: competencia || undefined },
      });
      return res.data;
    },
    enabled: aberto,
    staleTime: 10 * 60_000,
  });

  const d = detalheQ.data;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{linha?.titulo ?? 'Detalhe da linha'}</DialogTitle>
          <DialogDescription>
            Contas do razão contábil do Globus (CTBSALDO) que compõem esta linha
            {d?.competenciaLabel ? ` · ${d.competenciaLabel}` : ''}.
          </DialogDescription>
        </DialogHeader>

        {detalheQ.isLoading && (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {d && !detalheQ.isLoading && (
          <div className="space-y-3">
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Valor por conta = <strong>crédito − débito</strong> no mês. Ordenado pelo maior peso.
            </p>

            {d.contas.length === 0 ? (
              <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-gray-900/40">
                Sem contas com movimento nesta linha/competência.
              </p>
            ) : (
              <div className="rounded-md border border-gray-100 px-3 dark:border-gray-800">
                {d.contas.map((c) => {
                  const negativo = c.valorCents < 0;
                  return (
                    <div
                      key={c.classificador}
                      className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-0.5 border-b border-gray-50 py-2 last:border-0 dark:border-gray-800/60"
                    >
                      <div className="min-w-0">
                        <code className="text-[11px] text-gray-500 dark:text-gray-400">{c.classificador}</code>
                        <p className="truncate text-sm text-gray-800 dark:text-gray-200">{c.nomeConta ?? '—'}</p>
                        <p className="text-[10px] text-gray-400">
                          débito {moeda(c.debitoCents)} · crédito {moeda(c.creditoCents)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'whitespace-nowrap text-right text-sm font-medium tabular-nums',
                          negativo ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100',
                        )}
                      >
                        {moeda(c.valorCents)}
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between border-t border-gray-200 py-2 text-sm font-semibold dark:border-gray-700">
                  <span>Total da linha</span>
                  <span className={cn('tabular-nums', d.totalCents < 0 ? 'text-red-600 dark:text-red-400' : '')}>
                    {moeda(d.totalCents)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-[11px] text-gray-400 dark:border-gray-800">
              <Badge variant="muted">Origem: Globus</Badge>
              <Badge variant="muted">Razão contábil (CTBSALDO, plano 1)</Badge>
              <span>Só contas analíticas (folhas).</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
