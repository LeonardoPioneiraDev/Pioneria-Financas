'use client';

import { format } from 'date-fns';
import { Flag } from 'lucide-react';
import type { ProjecaoResponse } from '@pioneira/shared';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function moedaCurta(cents: number): string {
  const v = Math.abs(cents) / 100;
  const sinal = cents < 0 ? '-' : '';
  if (v >= 1_000_000) return `${sinal}R$ ${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${sinal}R$ ${(v / 1_000).toFixed(0)}K`;
  return moeda(cents);
}

/**
 * Visualização da projeção em 2 partes:
 *   1. Gráfico de área (saldo acumulado dia-a-dia, verde positivo / vermelho negativo)
 *   2. Tabela simplificada com colunas em linguagem leiga
 */
export function GraficoProjecao({ projecao }: { projecao: ProjecaoResponse }) {
  const { serie } = projecao;
  if (serie.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-gray-500">
        Sem dados de projeção. Verifique se há CR ou CP no período.
      </Card>
    );
  }

  const saldos = serie.map((s) => s.saldoAcumuladoCents);
  const maxSaldo = Math.max(0, ...saldos);
  const minSaldo = Math.min(0, ...saldos);
  const range = maxSaldo - minSaldo || 1;
  const yZero = (maxSaldo / range) * 100;

  return (
    <>
      {/* === Card grande: saldo final em destaque === */}
      <Card className="p-4 sm:p-5 bg-gradient-to-r from-pioneira-50/60 to-pioneira-100/30 dark:from-yellow-950/30 dark:to-yellow-900/10 border-pioneira-300 dark:border-yellow-800">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-pioneira-700 dark:text-yellow-400 font-bold">
              Como o caixa vai estar no fim do período
            </p>
            <p className={cn(
              'text-3xl font-bold mt-1',
              projecao.resumo.saldoFinalProjetadoCents < 0
                ? 'text-red-700 dark:text-red-400'
                : 'text-emerald-700 dark:text-emerald-400',
            )}>
              {projecao.resumo.saldoFinalProjetadoCents >= 0 ? 'Sobra de ' : 'Falta de '}
              {moeda(Math.abs(projecao.resumo.saldoFinalProjetadoCents))}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              em <strong>{projecao.horizonteDias} dias</strong> (a partir de{' '}
              {format(new Date(`${serie[0]!.data}T00:00:00`), 'dd/MM')})
            </p>
          </div>
          {projecao.resumo.diasComGap > 0 && (
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-red-700 dark:text-red-400 font-bold">
                Atenção: gap de caixa
              </p>
              <p className="text-lg font-bold text-red-700 dark:text-red-400 mt-0.5">
                {projecao.resumo.diasComGap} {projecao.resumo.diasComGap === 1 ? 'dia' : 'dias'}
              </p>
              <p className="text-[11px] text-gray-600 dark:text-gray-400">
                pior momento: {moedaCurta(projecao.resumo.gapMaximoCents)}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* === Gráfico de área === */}
      <Card className="p-4">
        <h3 className="text-sm font-bold text-pioneira-800 dark:text-yellow-300 mb-1">
          Quanto vai sobrar ou faltar — dia a dia
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Área <span className="text-emerald-700 dark:text-emerald-400 font-semibold">verde</span> = caixa positivo.
          Área <span className="text-red-700 dark:text-red-400 font-semibold">vermelha</span> = caixa negativo (gap).
          Quanto mais alto/baixo, mais dinheiro sobrando/faltando.
        </p>

        {/* SVG do gráfico */}
        <div className="relative pl-14 pr-2 pt-2">
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="w-full h-48 overflow-visible"
          >
            {/* Linha de zero */}
            <line
              x1="0"
              y1={yZero}
              x2="100"
              y2={yZero}
              stroke="currentColor"
              strokeWidth="0.3"
              strokeDasharray="1 1"
              className="text-gray-400 dark:text-gray-600"
            />

            {/* Área positiva (verde, acima do zero) */}
            <path
              d={construirArea(serie, maxSaldo, minSaldo, range, 'positivo')}
              fill="rgb(16 185 129)"
              fillOpacity="0.2"
              stroke="rgb(16 185 129)"
              strokeWidth="0.4"
            />

            {/* Área negativa (vermelha, abaixo do zero) */}
            <path
              d={construirArea(serie, maxSaldo, minSaldo, range, 'negativo')}
              fill="rgb(239 68 68)"
              fillOpacity="0.25"
              stroke="rgb(239 68 68)"
              strokeWidth="0.4"
            />
          </svg>

          {/* Labels Y */}
          <div className="absolute left-0 top-2 h-48 w-12 text-[10px] text-gray-500 dark:text-gray-400 flex flex-col justify-between text-right pr-1 pointer-events-none">
            <span>{moedaCurta(maxSaldo)}</span>
            {minSaldo < 0 && maxSaldo > 0 && (
              <span style={{ position: 'absolute', top: `${yZero}%`, right: '0.25rem', transform: 'translateY(-50%)' }}>
                R$ 0
              </span>
            )}
            <span>{moedaCurta(minSaldo)}</span>
          </div>
        </div>

        {/* Labels X */}
        <div className="flex justify-between mt-1 pl-14 pr-2 text-[10px] text-gray-500 dark:text-gray-400">
          <span>{format(new Date(`${serie[0]!.data}T00:00:00`), 'dd/MM')}</span>
          {serie.length > 6 && (
            <span>{format(new Date(`${serie[Math.floor(serie.length / 2)]!.data}T00:00:00`), 'dd/MM')}</span>
          )}
          <span>{format(new Date(`${serie[serie.length - 1]!.data}T00:00:00`), 'dd/MM')}</span>
        </div>

        {/* Legenda inferior */}
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-emerald-500/30 border border-emerald-500" />
            <span className="text-gray-600 dark:text-gray-300">Sobra</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-red-500/30 border border-red-500" />
            <span className="text-gray-600 dark:text-gray-300">Falta (gap)</span>
          </div>
          <div className="flex items-center gap-2 text-gray-500 col-span-2 md:col-span-2 italic">
            Cada ponto = saldo acumulado do dia
          </div>
        </div>
      </Card>

      {/* === Tabela detalhada simplificada === */}
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Detalhe dia a dia
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Cada linha é 1 dia. Linhas em <strong className="text-red-600 dark:text-red-400">vermelho</strong> têm caixa negativo acumulado.
          </p>
        </div>
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/80 backdrop-blur z-10">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Dia</th>
                <th className="px-3 py-2 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                  Entra
                </th>
                <th className="px-3 py-2 text-right font-semibold text-red-700 dark:text-red-400">
                  Sai
                </th>
                <th className="px-3 py-2 text-right font-semibold">Saldo do dia</th>
                <th className="px-3 py-2 text-right font-semibold">Saldo acumulado</th>
              </tr>
            </thead>
            <tbody>
              {serie.map((d) => (
                <tr
                  key={d.data}
                  className={cn(
                    'border-t border-gray-100 dark:border-gray-800',
                    d.temGap && 'bg-red-50/40 dark:bg-red-950/20',
                  )}
                >
                  <td className="px-3 py-1.5 font-mono whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      {format(new Date(`${d.data}T00:00:00`), 'dd/MM (EEE)')}
                      {d.feriadoNome && (
                        <span
                          title={d.feriadoNome}
                          className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
                        >
                          <Flag className="h-2.5 w-2.5" /> feriado
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-emerald-700 dark:text-emerald-400">
                    {d.entradasAjustadasCents > 0 ? `+${moedaCurta(d.entradasAjustadasCents)}` : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-red-700 dark:text-red-400">
                    {d.saidasPrevistasCents > 0 ? `-${moedaCurta(d.saidasPrevistasCents)}` : '—'}
                  </td>
                  <td className={cn(
                    'px-3 py-1.5 text-right font-mono font-semibold',
                    d.saldoDoDiaCents > 0 && 'text-emerald-700 dark:text-emerald-400',
                    d.saldoDoDiaCents < 0 && 'text-red-700 dark:text-red-400',
                  )}>
                    {d.saldoDoDiaCents !== 0
                      ? `${d.saldoDoDiaCents > 0 ? '+' : ''}${moedaCurta(d.saldoDoDiaCents)}`
                      : '—'}
                  </td>
                  <td className={cn(
                    'px-3 py-1.5 text-right font-mono font-bold',
                    d.temGap && 'text-red-700 dark:text-red-400',
                  )}>
                    {moedaCurta(d.saldoAcumuladoCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

/**
 * Constrói o path SVG da área (verde ou vermelha) baseado no sinal do saldo.
 * Para a área positiva: tudo abaixo do zero vira zero (clamp).
 * Para a área negativa: tudo acima do zero vira zero.
 */
function construirArea(
  serie: ProjecaoResponse['serie'],
  maxSaldo: number,
  minSaldo: number,
  range: number,
  lado: 'positivo' | 'negativo',
): string {
  if (serie.length === 0) return '';
  const yZero = (maxSaldo / range) * 100;
  const stepX = 100 / Math.max(1, serie.length - 1);

  const pontos = serie.map((s, i) => {
    const x = i * stepX;
    const valor = lado === 'positivo'
      ? Math.max(0, s.saldoAcumuladoCents)
      : Math.min(0, s.saldoAcumuladoCents);
    const y = ((maxSaldo - valor) / range) * 100;
    return { x, y };
  });

  // Linha de cima
  let path = `M ${pontos[0]!.x} ${yZero} `;
  for (const p of pontos) path += `L ${p.x} ${p.y} `;
  // Fecha pela linha de zero
  path += `L ${pontos[pontos.length - 1]!.x} ${yZero} Z`;
  return path;
}
