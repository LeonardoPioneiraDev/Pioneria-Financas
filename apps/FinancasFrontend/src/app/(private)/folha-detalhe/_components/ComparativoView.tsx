'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus, Users } from 'lucide-react';
import type { ComparativoResponse } from '@pioneira/shared/schemas/folha-detalhe';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

/** Custo que sobe = vermelho (mais despesa); custo que cai = verde (economia). */
function Delta({ cents, pct }: { cents: number; pct: number | null }) {
  const Icon = cents > 0 ? TrendingUp : cents < 0 ? TrendingDown : Minus;
  const cor = cents > 0 ? 'text-red-600 dark:text-red-400' : cents < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500';
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-sm font-semibold ${cor}`}>
      <Icon className="h-3.5 w-3.5" />
      {cents > 0 ? '+' : ''}{moedaCompacta(cents)}
      {pct !== null && <span className="text-[11px] font-normal">({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)</span>}
    </span>
  );
}

export function ComparativoView({ competencia, tipoFolha }: { competencia: string; tipoFolha?: number }) {
  useAuditView({
    acao: 'visualizou',
    recurso: 'folha-detalhe-comparativo',
    descricao: 'Comparativo da folha vs mês anterior',
    filtros: { competencia, tipoFolha: tipoFolha ?? null },
  });

  const { data, isLoading } = useQuery<ComparativoResponse>({
    queryKey: ['folha-detalhe', 'comparativo', { competencia, tipoFolha }],
    queryFn: async () => {
      const params: Record<string, string | number> = { competencia };
      if (tipoFolha) params.tipoFolha = tipoFolha;
      const res = await api.get<ComparativoResponse>('/api/folha-detalhe/comparativo', { params });
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <Card className="p-12 text-center text-gray-500 dark:text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-transparent border-t-[#e6cd4a] dark:border-t-yellow-400 mx-auto mb-3" />
        Comparando competências…
      </Card>
    );
  }
  if (!data) return null;

  const deltaTotal = data.totaisAtual.liquidoCents - data.totaisAnterior.liquidoCents;
  const pctTotal = data.totaisAnterior.liquidoCents !== 0
    ? (deltaTotal / Math.abs(data.totaisAnterior.liquidoCents)) * 100
    : null;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div className="text-sm text-gray-600 dark:text-gray-300">
            Comparando <strong>{competencia}</strong> com <strong>{data.competenciaAnterior}</strong> (mês anterior)
          </div>
          <Delta cents={deltaTotal} pct={pctTotal} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <ComparaCard titulo="Líquido" atual={data.totaisAtual.liquidoCents} anterior={data.totaisAnterior.liquidoCents} destaque />
          <ComparaCard titulo="Proventos" atual={data.totaisAtual.proventosCents} anterior={data.totaisAnterior.proventosCents} />
          <ComparaCard titulo="Descontos" atual={data.totaisAtual.descontosCents} anterior={data.totaisAnterior.descontosCents} />
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <Users className="h-3.5 w-3.5" />
          {data.totaisAtual.qtdFuncionarios.toLocaleString('pt-BR')} funcionários (setor×mês)
          {' · anterior: '}{data.totaisAnterior.qtdFuncionarios.toLocaleString('pt-BR')}
        </div>
      </Card>

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-2">
          Variação por setor (maior impacto primeiro)
        </h3>
        <div className="space-y-1.5">
          {data.setores.map((s) => (
            <Card key={`${s.codArea ?? 'null'}-${s.descArea ?? ''}`} className="p-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate text-pioneira-900 dark:text-yellow-200">
                    {s.descArea ?? `Setor ${s.codArea ?? '—'}`}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                    {moedaCompacta(s.anteriorLiquidoCents)} → {moedaCompacta(s.atualLiquidoCents)}
                    {s.atualQtd !== s.anteriorQtd && (
                      <Badge variant="muted" className="ml-2 text-[10px]">
                        {s.anteriorQtd} → {s.atualQtd} func
                      </Badge>
                    )}
                  </p>
                </div>
                <Delta cents={s.deltaLiquidoCents} pct={s.deltaLiquidoPct} />
              </div>
            </Card>
          ))}
          {data.setores.length === 0 && (
            <Card className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Sem dados para comparar nesta competência.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ComparaCard({ titulo, atual, anterior, destaque }: { titulo: string; atual: number; anterior: number; destaque?: boolean }) {
  const delta = atual - anterior;
  return (
    <div className={`rounded-lg border p-3 ${destaque ? 'border-pioneira-400 dark:border-yellow-500/40 bg-pioneira-50/40 dark:bg-yellow-950/10' : 'border-gray-100 dark:border-gray-800'}`}>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">{titulo}</p>
      <p className="text-lg font-bold mt-0.5 text-pioneira-900 dark:text-yellow-200">{moedaCompacta(atual)}</p>
      <p className="text-[11px] text-gray-400 dark:text-gray-500">anterior {moedaCompacta(anterior)}</p>
      <div className="mt-1">
        <Delta cents={delta} pct={anterior !== 0 ? (delta / Math.abs(anterior)) * 100 : null} />
      </div>
    </div>
  );
}
