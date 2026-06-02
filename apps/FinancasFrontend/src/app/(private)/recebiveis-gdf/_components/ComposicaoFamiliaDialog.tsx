'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { ComposicaoFamiliaResponse } from '@pioneira/shared';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function num(n: number): string {
  return n.toLocaleString('pt-BR');
}

export function ComposicaoFamiliaDialog({
  dataTransporte,
  onClose,
}: {
  dataTransporte: string;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useQuery<ComposicaoFamiliaResponse>({
    queryKey: ['recebiveis-gdf', 'composicao', dataTransporte],
    queryFn: async () => {
      const res = await api.get<ComposicaoFamiliaResponse>('/api/recebiveis-gdf/composicao-familia', {
        params: { dataTransporte },
      });
      return res.data;
    },
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="mx-3 w-[calc(100%-1.5rem)] sm:w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Transportado em {format(new Date(`${dataTransporte}T00:00:00`), 'dd/MM/yyyy')}
          </DialogTitle>
          <DialogDescription>Composição por família e cronograma de resgate</DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando…
          </div>
        )}
        {isError && (
          <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle className="h-4 w-4" />
            {(error as Error)?.message ?? 'Falha ao carregar composição'}
          </div>
        )}

        {data && (
          <div className="space-y-4">
            {/* Cards de totais do dia */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                <div className="text-[10px] uppercase tracking-wider text-gray-500">Total</div>
                <div className="text-lg font-bold">{moeda(data.totais.valorCents)}</div>
                <div className="text-xs text-gray-500">{num(data.totais.creditos)} créditos</div>
              </div>
              <div className="rounded-md border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/20 p-3">
                <div className="text-[10px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Pagantes</div>
                <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{num(data.totais.creditosPagantes)}</div>
                <div className="text-xs text-emerald-600 dark:text-emerald-400">{(100 - data.totais.percGratuidades).toFixed(1)}% dos créditos</div>
              </div>
              <div className="rounded-md border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3">
                <div className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300">Gratuidades</div>
                <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{num(data.totais.creditosGratuidades)}</div>
                <div className="text-xs text-amber-600 dark:text-amber-400">{data.totais.percGratuidades.toFixed(1)}% sem receita BRB</div>
              </div>
              <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
                <div className="text-[10px] uppercase tracking-wider text-gray-500">T. Médio</div>
                <div className="text-lg font-bold">{data.totais.tempoMedioDias.toFixed(1)} dias</div>
                <div className="text-xs text-gray-500">transporte → resgate</div>
              </div>
            </div>

            {/* Cronograma de resgate */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-2">
                Quando recebeu
              </h4>
              <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/60">
                    <tr className="text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2 text-left">Resgatado em</th>
                      <th className="px-3 py-2 text-right">Dias após</th>
                      <th className="px-3 py-2 text-right">Créditos</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                      <th className="px-3 py-2 text-right">% do total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.resgatesPorData.map((r) => (
                      <tr key={r.dataResgate} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-2">{format(new Date(`${r.dataResgate}T00:00:00`), 'dd/MM/yyyy')}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={cn(
                            'inline-block px-2 py-0.5 rounded text-xs font-medium',
                            r.diasApos <= 2
                              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
                          )}>
                            +{r.diasApos}d
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{num(r.creditos)}</td>
                        <td className="px-3 py-2 text-right font-mono font-semibold">{moeda(r.valorCents)}</td>
                        <td className="px-3 py-2 text-right">{r.percDoTotal.toFixed(1)}%</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 font-semibold">
                      <td className="px-3 py-2">TOTAL</td>
                      <td className="px-3 py-2 text-right">{data.totais.tempoMedioDias.toFixed(1)} dias</td>
                      <td className="px-3 py-2 text-right font-mono">{num(data.totais.creditos)}</td>
                      <td className="px-3 py-2 text-right font-mono">{moeda(data.totais.valorCents)}</td>
                      <td className="px-3 py-2 text-right">100%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Composição por família */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-2">
                Composição por família
              </h4>
              <div className="rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/60">
                    <tr className="text-xs uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-2 text-left">Família</th>
                      <th className="px-3 py-2 text-center">Tipo</th>
                      <th className="px-3 py-2 text-right">Créditos</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                      <th className="px-3 py-2 text-right">% receita</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.familias.map((f) => (
                      <tr key={f.codigo} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-2">
                          <div className="font-medium">{f.nome}</div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">{f.codigo}</div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {f.tipo === 'pagante' ? (
                            <Badge variant="success">Pagante</Badge>
                          ) : (
                            <Badge variant="warning">
                              Gratuid. {f.fonteSubsidio ? `(${f.fonteSubsidio})` : ''}
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{num(f.creditos)}</td>
                        <td className="px-3 py-2 text-right font-mono">
                          {f.valorCents > 0 ? moeda(f.valorCents) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {f.percReceita > 0 ? (
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-12 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="h-full bg-emerald-500"
                                  style={{ width: `${Math.min(100, f.percReceita)}%` }}
                                />
                              </div>
                              <span className="font-medium text-xs w-12 text-right">{f.percReceita.toFixed(1)}%</span>
                            </div>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Gratuidades geram créditos mas não geram receita BRB direta — o repasse é via subsídio GDF separado.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
