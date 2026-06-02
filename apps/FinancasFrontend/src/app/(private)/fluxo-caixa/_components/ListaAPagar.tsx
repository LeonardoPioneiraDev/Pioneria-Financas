'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import Link from 'next/link';
import { Loader2, ArrowDownRight, ExternalLink } from 'lucide-react';
import type { ContaPagarResponse } from '@pioneira/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

interface ListaResponse {
  data: ContaPagarResponse[];
  total: number;
  page: number;
  limit: number;
}

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function moedaCurta(cents: number): string {
  const v = Math.abs(cents) / 100;
  const sinal = cents < 0 ? '-' : '';
  if (v >= 1_000_000) return `${sinal}R$ ${(v / 1_000_000).toFixed(2)} M`;
  if (v >= 1_000) return `${sinal}R$ ${(v / 1_000).toFixed(0)} K`;
  return moeda(cents);
}
function ordemDoOrigem(o: string): number {
  return ({ folha: 1, nf: 2, guia: 3, manual: 4, desconhecido: 5 } as Record<string, number>)[o] ?? 9;
}
const ORIGEM_LABEL: Record<string, { label: string; classe: string }> = {
  folha: { label: 'Folha', classe: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  nf: { label: 'NF', classe: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  guia: { label: 'Guia/Tributo', classe: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  manual: { label: 'Manual', classe: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  desconhecido: { label: '?', classe: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500' },
};

export function ListaAPagar({ horizonteDias }: { horizonteDias: number }) {
  const dtIni = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return format(d, 'yyyy-MM-dd');
  }, []);
  const dtFim = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + horizonteDias);
    return format(d, 'yyyy-MM-dd');
  }, [horizonteDias]);

  const lista = useQuery<ListaResponse>({
    queryKey: ['fluxo-caixa', 'a-pagar', dtIni, dtFim],
    queryFn: async () => {
      const res = await api.get<ListaResponse>('/api/contas-pagar/', {
        params: {
          dtIni,
          dtFim,
          status: 'pendente,aprovado,em_aprovacao',
          ordenarPor: 'dataVencimento:asc',
          limit: 200,
        },
      });
      return res.data;
    },
  });

  if (lista.isLoading) {
    return (
      <Card className="p-10 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-pioneira-600" />
        <p className="mt-2 text-sm text-gray-500">Carregando contas a pagar…</p>
      </Card>
    );
  }

  const itens = lista.data?.data ?? [];
  const total = itens.reduce((acc, c) => acc + c.valorAPagarCents, 0);
  const porOrigem = itens.reduce<Record<string, { qtd: number; valor: number }>>((acc, c) => {
    const k = c.origemDocumento;
    acc[k] = acc[k] ?? { qtd: 0, valor: 0 };
    acc[k].qtd += 1;
    acc[k].valor += c.valorAPagarCents;
    return acc;
  }, {});

  // Agrupa por data
  const porData = itens.reduce<Record<string, ContaPagarResponse[]>>((acc, c) => {
    (acc[c.dataVencimento] ??= []).push(c);
    return acc;
  }, {});
  const datas = Object.keys(porData).sort();

  if (itens.length === 0) {
    return (
      <Card className="p-10 text-center space-y-3">
        <div className="text-4xl">📭</div>
        <h3 className="text-lg font-semibold">Sem contas a pagar no período</h3>
        <p className="text-sm text-gray-500">
          Nenhum CP com vencimento entre <strong>{format(new Date(`${dtIni}T00:00:00`), 'dd/MM/yyyy')}</strong> e{' '}
          <strong>{format(new Date(`${dtFim}T00:00:00`), 'dd/MM/yyyy')}</strong>.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header — totais */}
      <Card className="p-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">
              Total a pagar próximos {horizonteDias} dias
            </p>
            <p className="text-3xl font-bold mt-1 text-red-700 dark:text-red-400">
              {moeda(total)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              <strong>{itens.length}</strong> título{itens.length !== 1 ? 's' : ''} em{' '}
              <strong>{datas.length}</strong> dia{datas.length !== 1 ? 's' : ''} distintos
            </p>
          </div>
          <div className="text-right">
            <ArrowDownRight className="h-8 w-8 text-red-600 inline-block" />
          </div>
        </div>

        {/* Composição por origem */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
          {Object.entries(porOrigem)
            .sort(([a], [b]) => ordemDoOrigem(a) - ordemDoOrigem(b))
            .map(([k, v]) => {
              const meta = ORIGEM_LABEL[k] ?? ORIGEM_LABEL.desconhecido;
              if (!meta) return null;
              return (
                <div key={k} className={`rounded p-2 ${meta.classe}`}>
                  <div className="text-[10px] uppercase font-bold">{meta.label}</div>
                  <div className="text-sm font-bold">{moedaCurta(v.valor)}</div>
                  <div className="text-[10px]">{v.qtd} {v.qtd === 1 ? 'título' : 'títulos'}</div>
                </div>
              );
            })}
        </div>
      </Card>

      {/* Lista agrupada por data */}
      <div className="space-y-3">
        {datas.map((data) => {
          const titulos = porData[data]!;
          const totalDia = titulos.reduce((s, t) => s + t.valorAPagarCents, 0);
          return (
            <Card key={data} className="p-0 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div className="text-sm font-bold">
                  {format(new Date(`${data}T00:00:00`), 'dd/MM/yyyy')}
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    ({titulos.length} {titulos.length === 1 ? 'título' : 'títulos'})
                  </span>
                </div>
                <div className="text-sm font-mono font-bold text-red-700 dark:text-red-400">
                  {moeda(totalDia)}
                </div>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {titulos.map((t) => {
                  const meta = ORIGEM_LABEL[t.origemDocumento] ?? ORIGEM_LABEL.desconhecido;
                  return (
                    <div key={t.id} className="px-4 py-2 flex items-center gap-3 hover:bg-gray-50/40 dark:hover:bg-gray-900/30">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {t.fornecedor?.razaoSocial ?? <span className="text-gray-400 italic">sem fornecedor</span>}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                          {t.numeroDocumento ?? '—'}
                          {t.numeroParcela ? `/${String(t.numeroParcela).padStart(2, '0')}` : ''}
                          {t.observacao ? <span className="ml-2 italic">{t.observacao.slice(0, 60)}</span> : null}
                        </div>
                      </div>
                      {meta && (
                        <Badge className={`text-[9px] font-bold ${meta.classe} border-none`}>
                          {meta.label}
                        </Badge>
                      )}
                      <div className="text-right font-mono">
                        <div className="text-sm font-bold">{moeda(t.valorAPagarCents)}</div>
                        <div className="text-[10px] text-gray-400 uppercase">{t.status}</div>
                      </div>
                      <Link
                        href={`/contas-pagar?busca=${encodeURIComponent(t.numeroDocumento ?? '')}`}
                        className="text-gray-400 hover:text-pioneira-700 dark:hover:text-yellow-400"
                        title="Abrir em Contas a Pagar"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Aviso se atingiu limite */}
      {lista.data && lista.data.total > itens.length && (
        <Card className="p-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30">
          ⚠ Mostrando os primeiros {itens.length} de {lista.data.total} títulos. Veja a lista completa em{' '}
          <Link href="/contas-pagar" className="underline font-semibold">Contas a Pagar</Link>.
        </Card>
      )}
    </div>
  );
}
