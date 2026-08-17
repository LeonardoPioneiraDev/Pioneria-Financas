'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowDownCircle, ArrowUpCircle, Info, Landmark, Layers, Loader2, TrendingDown, TrendingUp, Wallet,
} from 'lucide-react';
import type { ExtratoConta, ExtratoMensalResponse, ExtratoMes } from '@pioneira/shared';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { nomeBanco } from '@/lib/bancos';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const corSaldo = (cents: number): string =>
  cents >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400';

/** Tabela mês a mês, com saldo rolando. */
function TabelaMeses({ meses }: { meses: ExtratoMes[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left dark:border-gray-800 dark:bg-gray-900/50">
          <tr className="text-[11px] uppercase tracking-wide text-gray-500">
            <th className="px-3 py-2 font-medium">Mês</th>
            <th className="px-3 py-2 text-right font-medium">Movtos</th>
            <th className="px-3 py-2 text-right font-medium">Saldo inicial</th>
            <th className="px-3 py-2 text-right font-medium">Entrou</th>
            <th className="px-3 py-2 text-right font-medium">Saiu</th>
            <th className="px-3 py-2 text-right font-medium">Saldo final</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m) => (
            <tr key={m.mes} className="border-b border-gray-100 last:border-0 dark:border-gray-800/60">
              <td className="px-3 py-2 font-medium capitalize">{m.rotulo}</td>
              <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400">{m.movimentos}</td>
              <td className={cn('px-3 py-2 text-right font-mono', corSaldo(m.saldoInicialCents))}>{moeda(m.saldoInicialCents)}</td>
              <td className="px-3 py-2 text-right font-mono text-emerald-700 dark:text-emerald-400">{moeda(m.entradasCents)}</td>
              <td className="px-3 py-2 text-right font-mono text-red-700 dark:text-red-400">{moeda(m.saidasCents)}</td>
              <td className={cn('px-3 py-2 text-right font-mono font-semibold', corSaldo(m.saldoFinalCents))}>{moeda(m.saldoFinalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Bloco de uma conta: cabeçalho + saldo atual + tabela mensal. */
function BlocoConta({ conta }: { conta: ExtratoConta }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50/60 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/40">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-pioneira-700 dark:text-yellow-400" />
          <div>
            <p className="text-sm font-semibold">{nomeBanco(conta.codBanco)}</p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">Ag {conta.codAgencia} · CC {conta.codContaBco}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-1 text-[10px] uppercase tracking-wide text-gray-400">
            <Wallet className="h-3 w-3" /> Saldo atual
          </p>
          <p className={cn('font-mono text-sm font-bold', corSaldo(conta.saldoAtualCents))}>{moeda(conta.saldoAtualCents)}</p>
        </div>
      </div>
      <div className="p-3">
        <TabelaMeses meses={conta.meses} />
        {conta.saldoRelativo && (
          <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            <span>
              Saldo <strong>relativo</strong>: parte de zero no 1º movimento sincronizado, porque esta conta não tem
              saldo conferido. Mostra a <strong>variação</strong>, não o valor real no banco — um saldo negativo aqui só
              indica que já havia saldo antes do período. Para o saldo real, informe o saldo conferido da conta.
            </span>
          </p>
        )}
      </div>
    </Card>
  );
}

type Visao = 'por_conta' | 'consolidado';

/**
 * Extrato mensal com SALDO ACUMULADO por mês. Por conta (padrão, com filtro) ou
 * consolidado. O saldo vem do valor sinalizado de cada movimento (+ entrou, −
 * saiu); sem saldo conferido (âncora), é relativo — sinalizado.
 */
export function ExtratoMensal() {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState<number | ''>('');
  const [visao, setVisao] = useState<Visao>('por_conta');
  const [contaFiltro, setContaFiltro] = useState(''); // chave codBanco|codAgencia|codContaBco

  const { data, isLoading } = useQuery<ExtratoMensalResponse>({
    queryKey: ['conciliacao', 'extrato', { ano }],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (ano) params.ano = ano;
      return (await api.get<ExtratoMensalResponse>('/api/conciliacao/extrato-mensal', { params })).data;
    },
  });

  const contasFiltradas = (data?.porConta ?? []).filter(
    (c) => !contaFiltro || `${c.codBanco}|${c.codAgencia}|${c.codContaBco}` === contaFiltro,
  );

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <span className="text-sm font-medium">Período</span>
        <select
          value={ano}
          onChange={(e) => setAno(e.target.value ? Number(e.target.value) : '')}
          className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        >
          <option value="">Últimos 12 meses</option>
          {[anoAtual, anoAtual - 1, anoAtual - 2].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>

        {visao === 'por_conta' && (
          <>
            <span className="text-sm font-medium">Conta</span>
            <select
              value={contaFiltro}
              onChange={(e) => setContaFiltro(e.target.value)}
              className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="">Todas as contas</option>
              {(data?.porConta ?? []).map((c) => (
                <option key={`${c.codBanco}|${c.codAgencia}|${c.codContaBco}`} value={`${c.codBanco}|${c.codAgencia}|${c.codContaBco}`}>
                  {nomeBanco(c.codBanco)} · CC {c.codContaBco}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="ml-auto flex items-center gap-1 rounded-md border border-gray-200 p-0.5 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setVisao('por_conta')}
            className={cn('flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium',
              visao === 'por_conta' ? 'bg-pioneira-100 text-pioneira-900 dark:bg-yellow-500/20 dark:text-yellow-300' : 'text-gray-500')}
          >
            <Landmark className="h-3.5 w-3.5" /> Por conta
          </button>
          <button
            type="button"
            onClick={() => setVisao('consolidado')}
            className={cn('flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium',
              visao === 'consolidado' ? 'bg-pioneira-100 text-pioneira-900 dark:bg-yellow-500/20 dark:text-yellow-300' : 'text-gray-500')}
          >
            <Layers className="h-3.5 w-3.5" /> Consolidado
          </button>
        </div>
      </Card>

      {isLoading && (
        <Card className="p-8 text-center text-sm text-gray-500">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Carregando…
        </Card>
      )}

      {data && !isLoading && data.totais.movimentos === 0 && (
        <Card className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum movimento no período.</Card>
      )}

      {data && !isLoading && data.totais.movimentos > 0 && (
        <>
          {visao === 'consolidado' ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Card className="p-3">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    <ArrowDownCircle className="h-3 w-3" /> Entrou (período)
                  </p>
                  <p className="mt-0.5 text-base font-bold text-emerald-700 dark:text-emerald-400">{moeda(data.totais.entradasCents)}</p>
                </Card>
                <Card className="p-3">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-red-700 dark:text-red-400">
                    <ArrowUpCircle className="h-3 w-3" /> Saiu (período)
                  </p>
                  <p className="mt-0.5 text-base font-bold text-red-700 dark:text-red-400">{moeda(data.totais.saidasCents)}</p>
                </Card>
                <Card className="p-3">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {data.totais.resultadoCents >= 0 ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : <TrendingDown className="h-3 w-3 text-red-600" />}
                    Resultado
                  </p>
                  <p className={cn('mt-0.5 text-base font-bold', corSaldo(data.totais.resultadoCents))}>{moeda(data.totais.resultadoCents)}</p>
                </Card>
              </div>
              <Card className="p-0"><TabelaMeses meses={data.meses} /></Card>
              <p className="text-[11px] text-gray-400">
                O saldo consolidado soma o saldo de todas as contas. Contas sem saldo conferido entram com saldo relativo.
              </p>
            </>
          ) : (
            <div className="space-y-4">
              {contasFiltradas.map((c) => (
                <BlocoConta key={`${c.codBanco}-${c.codAgencia}-${c.codContaBco}`} conta={c} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
