'use client';

import { useQuery } from '@tanstack/react-query';
import type { MovimentoBancoItem, MovimentoBancoResponse } from '@pioneira/shared/schemas/contas-pagar';
import { api } from '@/lib/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataBr(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

const CATEGORIA: Record<MovimentoBancoItem['categoria'], { label: string; className: string }> = {
  pagamento_cp: { label: 'Pagamento de título', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' },
  despesa: { label: 'Despesa direta', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  financeiro: { label: 'Aplicação / Investimento', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  // Devolução de pagamento (DOC/CHEQUE DEVOLVIDO): crédito que reverte uma saída. Azul.
  devolucao: { label: '↩ Devolvido (estorno)', className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
};

interface Props {
  aberto: boolean;
  onClose: () => void;
  dtPagIni?: string;
  dtPagFim?: string;
  /** Total pago (obrigações) do filtro — pra montar a ponte com o extrato. */
  pagoCents?: number;
  /** Parte do "pago" quitada SEM movimento bancário (NF abatida por adiantamento). */
  pagoSemMovimentoCents?: number;
}

export function MovimentoBancoDialog({ aberto, onClose, dtPagIni, dtPagFim, pagoCents, pagoSemMovimentoCents }: Props) {
  const { data, isLoading, isError } = useQuery<MovimentoBancoResponse>({
    queryKey: ['contas-pagar', 'movimento-banco', { dtPagIni, dtPagFim }],
    queryFn: async () => {
      const res = await api.get<MovimentoBancoResponse>('/api/contas-pagar/movimento-banco', {
        params: { dtPagIni, dtPagFim },
      });
      return res.data;
    },
    enabled: aberto && !!(dtPagIni || dtPagFim),
  });

  const t = data?.totais;

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Movimento bancário do período</DialogTitle>
          <DialogDescription>
            Tudo que saiu da conta no período de pagamento — pagamentos de títulos, despesas diretas e
            movimentos financeiros (aplicações/investimentos). Os financeiros entram no <strong>Total
            movimento</strong>, mas <strong>não</strong> no <strong>Total pago</strong>. Pagamentos que o
            banco <strong>devolveu</strong> aparecem em azul e já são descontados do total.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="py-8 text-center text-sm text-gray-500">Carregando movimentos...</p>}
        {isError && <p className="py-8 text-center text-sm text-red-600">Falha ao carregar os movimentos.</p>}

        {data && data.itens.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">Nenhum movimento bancário no período.</p>
        )}

        {data && data.itens.length > 0 && (
          <div className="space-y-3">
            <div className="max-h-[55vh] overflow-auto rounded-md border border-gray-200 dark:border-gray-800">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 text-[11px] uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Histórico</th>
                    <th className="px-3 py-2 text-left">Categoria</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {data.itens.map((i) => {
                    const cat = CATEGORIA[i.categoria];
                    return (
                      <tr key={i.codMovtoBco} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">{dataBr(i.dataMovto)}</td>
                        <td className="px-3 py-2">
                          <span className="block">{i.descricao ?? '(sem histórico)'}</span>
                          <span className="text-[11px] text-gray-400">
                            {i.documento ? `doc ${i.documento} · ` : ''}{i.codTpDespesa ? `desp ${i.codTpDespesa}` : ''}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${cat.className}`}>
                            {cat.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{moeda(i.valorCents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {t && (
              <div className="rounded-md bg-gray-50 dark:bg-gray-900 p-3 text-sm space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>Total movimento ({t.quantidade})</span>
                  <span className="font-mono text-sky-600 dark:text-sky-400">{moeda(t.movimentoCents)}</span>
                </div>
                <div className="flex justify-between text-[12px] text-gray-500">
                  <span>· Pagamento de títulos</span>
                  <span className="font-mono">{moeda(t.pagamentoCpCents)}</span>
                </div>
                <div className="flex justify-between text-[12px] text-gray-500">
                  <span>· Despesa direta (conta no Total pago)</span>
                  <span className="font-mono">{moeda(t.despesaCents)}</span>
                </div>
                <div className="flex justify-between text-[12px] text-amber-600 dark:text-amber-400">
                  <span>· Aplicação/investimento (fora do Total pago)</span>
                  <span className="font-mono">{moeda(t.financeiroCents)}</span>
                </div>
                {t.devolucaoCents !== 0 && (
                  <div className="flex justify-between text-[12px] text-sky-600 dark:text-sky-400">
                    <span>↩ Devoluções (pagamento que saiu e voltou — já descontado do total)</span>
                    <span className="font-mono">{moeda(t.devolucaoCents)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Ponte com o "Total pago": o extrato (acima) mostra só o que SAIU do
                banco. O Total pago inclui ainda títulos quitados SEM movimento
                (NF abatida por adiantamento) — que não aparecem no extrato. */}
            {t && pagoCents !== undefined && (
              <div className="rounded-md border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-3 text-sm space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>Total pago (obrigações)</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">{moeda(pagoCents)}</span>
                </div>
                <div className="flex justify-between text-[12px] text-gray-500">
                  <span>· Pagamento de títulos (saiu do banco)</span>
                  <span className="font-mono">{moeda(t.pagamentoCpCents)}</span>
                </div>
                <div className="flex justify-between text-[12px] text-gray-500">
                  <span>· Despesa direta</span>
                  <span className="font-mono">{moeda(t.despesaCents)}</span>
                </div>
                {pagoSemMovimentoCents !== undefined && pagoSemMovimentoCents > 0 && (
                  <div className="flex justify-between text-[12px] text-amber-600 dark:text-amber-400">
                    <span>+ Quitado SEM movimento (NF abatida por adiantamento — não saiu do caixa, não está na lista)</span>
                    <span className="font-mono">{moeda(pagoSemMovimentoCents)}</span>
                  </div>
                )}
                <p className="text-[11px] text-gray-400 pt-1 border-t border-emerald-200/60 dark:border-emerald-900/30">
                  O extrato acima ({moeda(t.movimentoCents)}) inclui aplicações/investimentos (que não são pagamento) e
                  exclui o que foi quitado sem mover o banco. Por isso difere do Total pago.
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
