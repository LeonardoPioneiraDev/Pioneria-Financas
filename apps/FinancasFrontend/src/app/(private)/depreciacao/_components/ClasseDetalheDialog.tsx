'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2, TrendingDown, Building2, Layers } from 'lucide-react';
import type { DetalheClasseResponse, DepreciacaoConta } from '@pioneira/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const GRUPO_LABEL: Record<string, string> = {
  imobilizado_bruto: 'Imobilizado bruto (bens próprios)',
  direito_uso: 'Direito de uso — arrendamento mercantil',
  deprec_acumulada: '(−) Depreciação acumulada (redutora)',
};

/** Linha de uma conta contábil, com classificador, nome e valores. */
function ContaRow({ c }: { c: DepreciacaoConta }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-0.5 border-b border-gray-50 py-2 last:border-0 dark:border-gray-800/60">
      <div className="min-w-0">
        <code className="text-[11px] text-gray-500 dark:text-gray-400">{c.classificador}</code>
        <p className="truncate text-sm text-gray-800 dark:text-gray-200">{c.nomeConta ?? '—'}</p>
        <p className="text-[10px] text-gray-400">
          débito {moeda(c.debitoCents)} · crédito {moeda(c.creditoCents)}
        </p>
      </div>
      <span className="whitespace-nowrap text-right text-sm font-medium tabular-nums">{moeda(c.valorCents)}</span>
    </div>
  );
}

interface Props {
  /** Classe aberta (null = fechado). */
  classe: string | null;
  /** Competência AAAA-MM-01 em foco. */
  competencia: string;
  onClose: () => void;
}

/**
 * Drill-down de proveniência: ao clicar numa classe, mostra as contas do razão
 * (CTBSALDO) que compõem a despesa do mês e a base acumulada — de onde vem cada
 * número e como é calculado.
 */
export function ClasseDetalheDialog({ classe, competencia, onClose }: Props) {
  const aberto = classe !== null;

  const detalheQ = useQuery<DetalheClasseResponse>({
    queryKey: ['depreciacao', 'detalhe', classe, competencia],
    queryFn: async () => {
      const res = await api.get<DetalheClasseResponse>('/api/depreciacao/detalhe', {
        params: { classe, competencia: competencia || undefined },
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
          <DialogTitle>{d?.label ?? 'Detalhe da classe'}</DialogTitle>
          <DialogDescription>
            De onde vem o número — contas do razão contábil do Globus (CTBSALDO)
            {d?.competenciaLabel ? ` · competência ${d.competenciaLabel}` : ''}.
          </DialogDescription>
        </DialogHeader>

        {detalheQ.isLoading && (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {d && !detalheQ.isLoading && (
          <div className="space-y-6">
            {/* Despesa do mês */}
            <section>
              <div className="mb-1 flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold">Despesa de depreciação no mês</h3>
              </div>
              <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
                Valor lançado no mês = <strong>débito − crédito</strong> de cada conta{' '}
                <code>3.1.02.07.*</code> (depreciação da frota própria) na competência.
              </p>
              {d.despesaContas.length === 0 ? (
                <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-gray-900/40">
                  Sem despesa de depreciação lançada nesta classe/competência.
                </p>
              ) : (
                <div className="rounded-md border border-gray-100 px-3 dark:border-gray-800">
                  {d.despesaContas.map((c) => (
                    <ContaRow key={c.codContaCtb} c={c} />
                  ))}
                  <div className="flex items-center justify-between border-t border-gray-200 py-2 text-sm font-semibold dark:border-gray-700">
                    <span>Total da despesa do mês</span>
                    <span className="tabular-nums text-amber-600 dark:text-amber-400">{moeda(d.despesaTotalCents)}</span>
                  </div>
                </div>
              )}
            </section>

            {/* Base acumulada */}
            <section>
              <div className="mb-1 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-sky-500" />
                <h3 className="text-sm font-semibold">
                  Base patrimonial {d.competenciaLabel ? `(saldo acumulado até ${d.competenciaLabel})` : ''}
                </h3>
              </div>
              <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
                Saldo = soma de <strong>todos os lançamentos</strong> da conta desde o início até a competência
                (bruto/direito de uso = débito − crédito; a acumulada é redutora = crédito − débito).
              </p>
              {d.baseContas.length === 0 ? (
                <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-500 dark:bg-gray-900/40">
                  Sem base patrimonial nesta classe.
                </p>
              ) : (
                <div className="space-y-3">
                  {(['imobilizado_bruto', 'direito_uso', 'deprec_acumulada'] as const).map((grupo) => {
                    const contas = d.baseContas.filter((c) => c.grupo === grupo);
                    if (contas.length === 0) return null;
                    return (
                      <div key={grupo} className="rounded-md border border-gray-100 px-3 dark:border-gray-800">
                        <p className="border-b border-gray-100 py-1.5 text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:border-gray-800 dark:text-gray-400">
                          {GRUPO_LABEL[grupo]}
                        </p>
                        {contas.map((c) => (
                          <ContaRow key={c.codContaCtb} c={c} />
                        ))}
                      </div>
                    );
                  })}

                  <div className="rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-gray-900/40">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-300">Imobilizado bruto (próprio + direito de uso)</span>
                      <span className="tabular-nums">{moeda(d.brutoCents + d.direitoUsoCents)}</span>
                    </div>
                    {d.direitoUsoCents !== 0 && (
                      <div className="flex items-center justify-between text-[11px] text-gray-400">
                        <span className="flex items-center gap-1">
                          <Layers className="h-3 w-3" /> dos quais direito de uso (arrendamento)
                        </span>
                        <span className="tabular-nums">{moeda(d.direitoUsoCents)}</span>
                      </div>
                    )}
                    <div className="mt-1 flex items-center justify-between text-gray-500">
                      <span>(−) Depreciação acumulada</span>
                      <span className="tabular-nums">- {moeda(d.acumuladaCents)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between border-t border-gray-200 pt-1 font-semibold dark:border-gray-700">
                      <span>Valor líquido</span>
                      <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{moeda(d.liquidoCents)}</span>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Proveniência */}
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 text-[11px] text-gray-400 dark:border-gray-800">
              <Badge variant="muted">Origem: Globus</Badge>
              <Badge variant="muted">Razão contábil (CTBSALDO)</Badge>
              <span>O sistema espelha o valor oficial — não recalcula.</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
