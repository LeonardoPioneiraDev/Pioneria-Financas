'use client';

import { useQuery } from '@tanstack/react-query';
import { Bus, Loader2, Car } from 'lucide-react';
import type { FrotaComposicaoResponse } from '@pioneira/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

/** Barrinha proporcional simples. */
function Barra({ valor, max, cor }: { valor: number; max: number; cor: string }) {
  const pct = max > 0 ? Math.max(3, Math.round((valor / max) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
      <div className={cn('h-2 rounded-full', cor)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/**
 * Contexto da frota FÍSICA (quantos veículos), do cadastro vivo FRT_CADVEICULOS.
 * Separado do valor contábil da tela — deixa explícito que é contagem de bens,
 * fonte diferente do razão (não é uma quebra do R$).
 */
export function FrotaFisicaCard() {
  const frotaQ = useQuery<FrotaComposicaoResponse>({
    queryKey: ['depreciacao', 'frota'],
    queryFn: async () => {
      const res = await api.get<FrotaComposicaoResponse>('/api/depreciacao/frota');
      return res.data;
    },
    staleTime: 10 * 60_000,
  });

  const f = frotaQ.data;
  const maxTipo = Math.max(1, ...(f?.porTipo.map((t) => t.qtd) ?? [0]));
  const maxGaragem = Math.max(1, ...(f?.porGaragem.map((g) => g.qtd) ?? [0]));

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Bus className="h-4 w-4 text-gray-400" />
            Frota física
          </h2>
          <p className="text-xs text-gray-400">
            Contagem de veículos ativos — cadastro do Globus (FRT). É quantidade de bens, não o valor contábil.
          </p>
        </div>
        <Badge variant="muted">cadastro FRT · não é o razão</Badge>
      </div>

      {frotaQ.isLoading ? (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !f || f.totalVeiculos === 0 ? (
        <p className="mt-4 rounded-md bg-gray-50 px-3 py-3 text-sm text-gray-500 dark:bg-gray-900/40">
          Sem composição de frota carregada. Clique em <strong>Sincronizar</strong> pra importar do Globus.
        </p>
      ) : (
        <>
          {/* Totais */}
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-md border border-gray-100 p-3 dark:border-gray-800">
              <p className="text-xs text-gray-500">Total de veículos</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{f.totalVeiculos}</p>
            </div>
            <div className="rounded-md border border-gray-100 p-3 dark:border-gray-800">
              <p className="flex items-center gap-1 text-xs text-gray-500">
                <Bus className="h-3 w-3" /> Ônibus
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{f.totalOnibus}</p>
            </div>
            <div className="rounded-md border border-gray-100 p-3 dark:border-gray-800">
              <p className="flex items-center gap-1 text-xs text-gray-500">
                <Car className="h-3 w-3" /> Apoio/auxiliares
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{f.totalAuxiliares}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-6 sm:grid-cols-2">
            {/* Por tipo */}
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Por tipo</h3>
              <div className="space-y-2">
                {f.porTipo.map((t) => (
                  <div key={t.tipoFrota} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                    <span className="truncate text-sm text-gray-700 dark:text-gray-300" title={t.tipoFrota}>
                      {t.tipoFrota}
                    </span>
                    <span className="text-right text-sm font-medium tabular-nums">{t.qtd}</span>
                    <div className="col-span-2">
                      <Barra valor={t.qtd} max={maxTipo} cor={t.ehOnibus ? 'bg-sky-400 dark:bg-sky-500' : 'bg-gray-400 dark:bg-gray-500'} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Por setor (garagem) — com quebra ônibus × apoio */}
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Por setor (garagem)</h3>
              <div className="space-y-2">
                {f.porGaragem.map((g) => {
                  const onibus = g.tipos.filter((t) => t.ehOnibus).reduce((s, t) => s + t.qtd, 0);
                  const apoio = g.qtd - onibus;
                  return (
                    <div key={g.garagemCodigo} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                      <span className="truncate text-sm text-gray-700 dark:text-gray-300">{g.garagemNome}</span>
                      <span className="text-right text-sm font-medium tabular-nums">
                        {g.qtd}
                        <span className="ml-1 text-[11px] font-normal text-gray-400">
                          ({onibus} ônibus{apoio > 0 ? ` · ${apoio} apoio` : ''})
                        </span>
                      </span>
                      <div className="col-span-2">
                        <Barra valor={g.qtd} max={maxGaragem} cor="bg-emerald-400 dark:bg-emerald-500" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {f.atualizadoEm && (
            <p className="mt-4 text-[11px] text-gray-400">
              Fonte: FRT_CADVEICULOS (Globus), veículos ativos. Atualizado em{' '}
              {new Date(f.atualizadoEm).toLocaleString('pt-BR')}.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
