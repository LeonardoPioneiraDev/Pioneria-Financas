'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Palmtree, Gift, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import type { FeriasDecimoResponse, CategoriaRealizado } from '@pioneira/shared/schemas/folha-detalhe';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useAuditView } from '@/hooks/useAudit';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function moedaCompacta(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} K`;
  return moeda(cents);
}
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function FeriasDecimoView({ anoInicial }: { anoInicial: string }) {
  const [ano, setAno] = useState<string>(anoInicial);

  useAuditView({
    acao: 'visualizou',
    recurso: 'folha-detalhe-ferias-decimo',
    descricao: 'Férias e 13º realizado no ano',
    filtros: { ano },
  });

  const { data, isLoading } = useQuery<FeriasDecimoResponse>({
    queryKey: ['folha-detalhe', 'ferias-decimo', { ano }],
    queryFn: async () => {
      const res = await api.get<FeriasDecimoResponse>('/api/folha-detalhe/ferias-decimo', { params: { ano } });
      return res.data;
    },
  });

  const anoNum = Number(ano);

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAno(String(anoNum - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" /> {anoNum - 1}
            </Button>
            <span className="text-lg font-bold text-pioneira-900 dark:text-yellow-200 tabular-nums px-2">{ano}</span>
            <Button variant="outline" size="sm" onClick={() => setAno(String(anoNum + 1))}>
              {anoNum + 1} <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">realizado (pago) no ano</span>
        </div>
      </Card>

      {isLoading || !data ? (
        <Card className="p-12 text-center text-gray-500 dark:text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-transparent border-t-[#e6cd4a] dark:border-t-yellow-400 mx-auto mb-3" />
          Carregando férias e 13º…
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CategoriaCard titulo="Férias" icone={Palmtree} cor="from-teal-400 to-teal-300 dark:from-teal-500 dark:to-teal-600" cat={data.ferias} />
            <CategoriaCard titulo="13º Salário" icone={Gift} cor="from-rose-400 to-rose-300 dark:from-rose-500 dark:to-rose-600" cat={data.decimoTerceiro} />
          </div>

          <Card className="p-3 bg-gray-50/50 dark:bg-gray-900/30">
            <div className="flex items-start gap-2 text-xs leading-relaxed text-gray-600 dark:text-gray-400">
              <Info className="h-4 w-4 shrink-0 text-gray-400 mt-0.5" />
              <span>{data.observacao}</span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function CategoriaCard({ titulo, icone: Icone, cor, cat }: { titulo: string; icone: React.ComponentType<{ className?: string }>; cor: string; cat: CategoriaRealizado }) {
  const maxMes = Math.max(1, ...cat.porMes.map((m) => m.valorCents));
  const porMesMap = new Map(cat.porMes.map((m) => [m.competencia.slice(5, 7), m]));

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className={`shrink-0 h-10 w-10 rounded-lg bg-gradient-to-br ${cor} flex items-center justify-center`}>
          <Icone className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">{titulo} — total no ano</p>
          <p className="text-2xl font-bold text-pioneira-900 dark:text-yellow-200">{moeda(cat.totalCents)}</p>
        </div>
      </div>

      {/* Distribuição mensal (barras) */}
      <div className="mb-4">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">Por mês</p>
        <div className="space-y-1">
          {MESES.map((nome, i) => {
            const chave = String(i + 1).padStart(2, '0');
            const m = porMesMap.get(chave);
            const val = m?.valorCents ?? 0;
            const pct = (val / maxMes) * 100;
            return (
              <div key={chave} className="flex items-center gap-2">
                <span className="w-7 text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{nome}</span>
                <div className="flex-1 h-4 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className={`h-full bg-gradient-to-r ${cor}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-16 text-right text-[10px] font-mono text-gray-600 dark:text-gray-300 shrink-0">
                  {val > 0 ? moedaCompacta(val) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Composição por verba — a rastreabilidade */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
          Composição por verba (de onde vem o número)
        </p>
        <div className="rounded-lg border border-gray-100 dark:border-gray-800 divide-y divide-gray-50 dark:divide-gray-800/60 max-h-56 overflow-y-auto">
          {cat.porVerba.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-gray-400">Sem lançamentos no ano.</p>
          ) : (
            cat.porVerba.map((v) => (
              <div key={v.codEvento} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[11px]">
                <span className="truncate text-gray-600 dark:text-gray-300">
                  <span className="font-mono text-gray-400 dark:text-gray-500">{v.codEvento}</span> {v.descricao}
                </span>
                <span className="font-mono whitespace-nowrap text-gray-700 dark:text-gray-200">{moeda(v.valorCents)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}
