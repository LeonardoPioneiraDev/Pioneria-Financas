'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import Link from 'next/link';
import { Loader2, ArrowUpRight, ExternalLink, Info } from 'lucide-react';
import type { ContaReceberItem, ContaReceberListResponse } from '@pioneira/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ListaAReceber({ horizonteDias }: { horizonteDias: number }) {
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

  const lista = useQuery<ContaReceberListResponse>({
    queryKey: ['fluxo-caixa', 'a-receber', dtIni, dtFim],
    queryFn: async () => {
      const res = await api.get<ContaReceberListResponse>('/api/contas-receber/', {
        params: {
          dtIni,
          dtFim,
          status: 'aberto,renegociado',
          ordenacao: 'vencimento_asc',
          porPagina: 200,
        },
      });
      return res.data;
    },
  });

  if (lista.isLoading) {
    return (
      <Card className="p-10 text-center">
        <Loader2 className="h-6 w-6 animate-spin mx-auto text-pioneira-600" />
        <p className="mt-2 text-sm text-gray-500">Carregando contas a receber…</p>
      </Card>
    );
  }

  const itens = lista.data?.itens ?? [];
  const total = itens.reduce((s, c) => s + c.valorLiquidoCents, 0);

  // Agrupa por data
  const porData = itens.reduce<Record<string, ContaReceberItem[]>>((acc, c) => {
    (acc[c.dataVencimento] ??= []).push(c);
    return acc;
  }, {});
  const datas = Object.keys(porData).sort();

  if (itens.length === 0) {
    return (
      <div className="space-y-4">
        <Card className="p-6 border-l-4 border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/20">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div className="text-sm leading-relaxed">
              <h3 className="font-bold text-blue-900 dark:text-blue-200 mb-1">
                Sem contas a receber no período
              </h3>
              <p className="text-gray-700 dark:text-gray-200">
                A Pioneira <strong>não emite títulos de CR com antecedência</strong> — a maior parte
                da receita vem do <strong>repasse BRB Mobilidade</strong>, que entra direto no
                banco sem passar por CR tradicional.
              </p>
              <p className="text-gray-700 dark:text-gray-200 mt-2">
                Pra acompanhar a receita real (não-CR), use o módulo{' '}
                <Link href="/recebiveis-gdf" className="font-semibold underline text-pioneira-700 dark:text-yellow-400">
                  Recebíveis GDF
                </Link>.
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
            O que entra em CR (raro)
          </h4>
          <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1 list-disc list-inside">
            <li>Faturas de vale-transporte corporativo (empresas pagadoras)</li>
            <li>Integração tarifária com outros operadores</li>
            <li>Adiantamentos diversos</li>
            <li>Acertos de glosa BRB (quando há ajuste)</li>
          </ul>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Período consultado: <strong>{format(new Date(`${dtIni}T00:00:00`), 'dd/MM/yyyy')}</strong> a{' '}
            <strong>{format(new Date(`${dtFim}T00:00:00`), 'dd/MM/yyyy')}</strong>
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header — totais */}
      <Card className="p-4">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">
              Total a receber próximos {horizonteDias} dias
            </p>
            <p className="text-3xl font-bold mt-1 text-emerald-700 dark:text-emerald-400">
              {moeda(total)}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              <strong>{itens.length}</strong> título{itens.length !== 1 ? 's' : ''} em{' '}
              <strong>{datas.length}</strong> dia{datas.length !== 1 ? 's' : ''} distintos
            </p>
          </div>
          <ArrowUpRight className="h-8 w-8 text-emerald-600" />
        </div>
        <div className="mt-3 text-[11px] text-gray-500 dark:text-gray-400 italic">
          Nota: a receita principal da Pioneira (repasse BRB) NÃO aparece aqui — é capturada no{' '}
          <Link href="/recebiveis-gdf" className="underline text-pioneira-700 dark:text-yellow-400">
            Recebíveis GDF
          </Link>.
        </div>
      </Card>

      {/* Lista agrupada por data */}
      <div className="space-y-3">
        {datas.map((data) => {
          const titulos = porData[data]!;
          const totalDia = titulos.reduce((s, t) => s + t.valorLiquidoCents, 0);
          return (
            <Card key={data} className="p-0 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div className="text-sm font-bold">
                  {format(new Date(`${data}T00:00:00`), 'dd/MM/yyyy')}
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    ({titulos.length} {titulos.length === 1 ? 'título' : 'títulos'})
                  </span>
                </div>
                <div className="text-sm font-mono font-bold text-emerald-700 dark:text-emerald-400">
                  {moeda(totalDia)}
                </div>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {titulos.map((t) => (
                  <div key={t.id} className="px-4 py-2 flex items-center gap-3 hover:bg-gray-50/40 dark:hover:bg-gray-900/30">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">
                        {t.cliente?.razaoSocial ?? <span className="text-gray-400 italic">sem cliente</span>}
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                        {t.numeroDocumento ?? '—'}
                        {t.numeroParcela ? `/${String(t.numeroParcela).padStart(2, '0')}` : ''}
                        {t.nossoNumero ? ` · NN ${t.nossoNumero}` : ''}
                      </div>
                    </div>
                    {t.protestado && (
                      <Badge variant="danger" className="text-[9px]">PROTESTADO</Badge>
                    )}
                    <div className="text-right font-mono">
                      <div className="text-sm font-bold">{moeda(t.valorLiquidoCents)}</div>
                      <div className="text-[10px] text-gray-400 uppercase">{t.status}</div>
                    </div>
                    <Link
                      href={`/contas-receber?busca=${encodeURIComponent(t.numeroDocumento ?? '')}`}
                      className="text-gray-400 hover:text-pioneira-700 dark:hover:text-yellow-400"
                      title="Abrir em Contas a Receber"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {lista.data && lista.data.total > itens.length && (
        <Card className="p-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30">
          ⚠ Mostrando os primeiros {itens.length} de {lista.data.total} títulos. Veja a lista completa em{' '}
          <Link href="/contas-receber" className="underline font-semibold">Contas a Receber</Link>.
        </Card>
      )}
    </div>
  );
}
