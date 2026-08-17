'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ChevronDown, ChevronRight, Clock, CalendarPlus } from 'lucide-react';
import type { AnalisePrazoResponse } from '@pioneira/shared/schemas/contas-pagar';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';

/** Parâmetros da análise de prazo — mesmos filtros de escopo da listagem/sumário. */
export type AnalisePrazoParams = {
  dtIni: string;
  dtFim: string;
  search?: string;
  status?: string;
  origem?: string;
  setores?: string;
  valorMinCents?: number;
  valorMaxCents?: number;
};

/** Faixa de prazo selecionável (bate com o filtro `prazoFaixa` da lista). */
export type PrazoFaixaId = 'ate30' | 'de31a60' | 'de61a90' | 'mais90' | 'semData';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function moedaCompacta(cents: number): string {
  const reais = cents / 100;
  if (Math.abs(reais) >= 1_000_000) return `R$ ${(reais / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (Math.abs(reais) >= 1_000) return `R$ ${(reais / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}k`;
  return moeda(cents);
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
/** 'YYYY-MM' -> 'jul/26'. */
function rotuloMes(mes: string): string {
  const [ano, m] = mes.split('-');
  const idx = Number(m) - 1;
  return `${MESES_ABREV[idx] ?? m}/${(ano ?? '').slice(2)}`;
}

/** Uma faixa da barra de distribuição de prazo — clicável (drill-down na lista). */
function FaixaBar({
  rotulo,
  quantidade,
  valorCents,
  maxQtd,
  destaque,
  ativa,
  onClick,
}: {
  rotulo: string;
  quantidade: number;
  valorCents: number;
  maxQtd: number;
  destaque?: boolean;
  ativa: boolean;
  onClick: () => void;
}) {
  const pct = maxQtd > 0 ? Math.round((quantidade / maxQtd) * 100) : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Clique para ver os títulos desta faixa na lista abaixo"
      className={`w-full flex items-center gap-2 text-xs rounded px-1.5 py-1 transition-colors ${
        ativa
          ? 'bg-pioneira-100 dark:bg-yellow-900/30 ring-1 ring-pioneira-400 dark:ring-yellow-600'
          : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'
      }`}
    >
      <span className="w-28 shrink-0 text-left text-gray-600 dark:text-gray-300">{rotulo}</span>
      <div className="flex-1 h-4 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div
          className={`h-full rounded ${destaque ? 'bg-amber-400 dark:bg-amber-500' : 'bg-pioneira-300 dark:bg-yellow-600/70'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right font-semibold tabular-nums">{quantidade.toLocaleString('pt-BR')}</span>
      <span className="w-20 shrink-0 text-right font-mono text-[11px] text-gray-500 dark:text-gray-400">
        {moedaCompacta(valorCents)}
      </span>
    </button>
  );
}

/**
 * Painel de ANÁLISE DE PRAZO dos títulos de contas a pagar.
 *  1. quantos títulos entram por mês (últimos N meses por data de inclusão — 3/6/12);
 *  2. quantos têm prazo > 30 dias entre emissão e vencimento (faixas clicáveis);
 *  3. quantos desses já venceram e NÃO foram pagos (alerta clicável).
 * Clicar numa faixa ou no alerta filtra a LISTA de títulos abaixo (drill-down).
 */
export function AnalisePrazoPanel({
  params,
  ativo,
  prazoFaixaAtiva,
  prazoLongoVencidoAtivo,
  onSelecionarFaixa,
  onSelecionarAlerta,
}: {
  params: AnalisePrazoParams | null;
  ativo: boolean;
  prazoFaixaAtiva: '' | PrazoFaixaId;
  prazoLongoVencidoAtivo: boolean;
  onSelecionarFaixa: (faixa: PrazoFaixaId) => void;
  onSelecionarAlerta: () => void;
}) {
  // Janela da série "incluídos por mês" — últimos N meses por data de inclusão.
  const [meses, setMeses] = useState<3 | 6 | 12>(3);
  // Recolhido por padrão — o financeiro pediu pra tirar o bloco da frente dos
  // olhos e só mostrar o detalhe quando clicar no cabeçalho.
  const [aberto, setAberto] = useState(false);

  const query = useQuery<AnalisePrazoResponse>({
    queryKey: ['contas-pagar', 'analise-prazo', params, meses],
    queryFn: async () => {
      const res = await api.get<AnalisePrazoResponse>('/api/contas-pagar/analise-prazo', {
        params: { ...(params ?? {}), mesesInclusao: meses },
      });
      return res.data;
    },
    enabled: ativo && params !== null,
  });

  if (!ativo) return null;

  if (query.isLoading) {
    return (
      <Card className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
        <div className="animate-spin rounded-full h-6 w-6 border-4 border-transparent border-t-[#e6cd4a] dark:border-t-yellow-400 mx-auto mb-2" />
        Analisando prazos dos títulos...
      </Card>
    );
  }

  const d = query.data;
  if (!d) return null;

  const dist = d.distribuicaoPrazo;
  const maxQtd = Math.max(
    dist.ate30.quantidade,
    dist.de31a60.quantidade,
    dist.de61a90.quantidade,
    dist.mais90.quantidade,
    dist.semData.quantidade,
    1,
  );
  const maxMes = Math.max(1, ...d.inclusoesPorMes.map((m) => m.quantidade));
  const alerta = d.prazoLongoVencidoNaoPago;

  return (
    <Card className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="w-full flex flex-wrap items-center gap-2 p-4 sm:p-5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
      >
        <Clock className="h-4 w-4 text-pioneira-700 dark:text-yellow-400 shrink-0" />
        <h2 className="text-sm font-bold">Análise de prazo dos títulos</h2>
        <span className="text-[11px] text-gray-400 dark:text-gray-500">prazo = vencimento − emissão</span>
        {alerta.quantidade > 0 && !aberto && (
          <span className="text-[11px] font-semibold text-red-600 dark:text-red-400">
            · {alerta.quantidade.toLocaleString('pt-BR')} vencido(s) com prazo longo
          </span>
        )}
        {aberto ? <ChevronDown className="h-4 w-4 text-gray-400 ml-auto shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 ml-auto shrink-0" />}
      </button>

      {aberto && (
      <div className="p-4 sm:p-5 space-y-4 border-t border-gray-100 dark:border-gray-800">
      {/* ALERTA CRÍTICO — clicável: filtra a lista pros títulos com prazo > 30 dias
          que venceram e não foram pagos */}
      {alerta.quantidade > 0 ? (
        <button
          type="button"
          onClick={onSelecionarAlerta}
          title="Clique para ver estes títulos na lista abaixo"
          className={`w-full text-left flex flex-wrap items-start gap-3 rounded-lg border p-3 transition-colors ${
            prazoLongoVencidoAtivo
              ? 'border-red-500 bg-red-100 dark:border-red-500 dark:bg-red-950/50 ring-1 ring-red-500'
              : 'border-red-300 bg-red-50 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:hover:bg-red-950/50'
          }`}
        >
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-[220px]">
            <p className="text-sm font-semibold text-red-800 dark:text-red-200">
              {alerta.quantidade.toLocaleString('pt-BR')} {alerta.quantidade === 1 ? 'título venceu' : 'títulos venceram'} em aberto com prazo longo
            </p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-0.5">
              Comprados com prazo &gt; 30 dias, o vencimento já passou e ainda não foram pagos — {moeda(alerta.valorAPagarCents)} a pagar.
            </p>
            <p className="text-[11px] font-semibold text-red-700 dark:text-red-300 mt-1">
              {prazoLongoVencidoAtivo ? '✓ mostrando na lista — clique de novo para tirar o filtro' : 'Clique para ver quais são →'}
            </p>
          </div>
        </button>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/20 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          Nenhum título com prazo &gt; 30 dias venceu em aberto neste período. 👍
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {/* Distribuição por faixa de prazo — cada faixa clicável */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Distribuição por prazo
            </h3>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              <strong className="text-gray-700 dark:text-gray-200">{d.prazoLongo.quantidade.toLocaleString('pt-BR')}</strong> com &gt; 30 dias · {moedaCompacta(d.prazoLongo.valorLiquidoCents)}
            </span>
          </div>
          <div className="space-y-0.5">
            <FaixaBar rotulo="até 30 dias" quantidade={dist.ate30.quantidade} valorCents={dist.ate30.valorLiquidoCents} maxQtd={maxQtd} ativa={prazoFaixaAtiva === 'ate30'} onClick={() => onSelecionarFaixa('ate30')} />
            <FaixaBar rotulo="31 a 60 dias" quantidade={dist.de31a60.quantidade} valorCents={dist.de31a60.valorLiquidoCents} maxQtd={maxQtd} destaque ativa={prazoFaixaAtiva === 'de31a60'} onClick={() => onSelecionarFaixa('de31a60')} />
            <FaixaBar rotulo="61 a 90 dias" quantidade={dist.de61a90.quantidade} valorCents={dist.de61a90.valorLiquidoCents} maxQtd={maxQtd} destaque ativa={prazoFaixaAtiva === 'de61a90'} onClick={() => onSelecionarFaixa('de61a90')} />
            <FaixaBar rotulo="mais de 90 dias" quantidade={dist.mais90.quantidade} valorCents={dist.mais90.valorLiquidoCents} maxQtd={maxQtd} destaque ativa={prazoFaixaAtiva === 'mais90'} onClick={() => onSelecionarFaixa('mais90')} />
            {dist.semData.quantidade > 0 && (
              <FaixaBar rotulo="sem emissão" quantidade={dist.semData.quantidade} valorCents={dist.semData.valorLiquidoCents} maxQtd={maxQtd} ativa={prazoFaixaAtiva === 'semData'} onClick={() => onSelecionarFaixa('semData')} />
            )}
          </div>
        </div>

        {/* Títulos incluídos por mês — seletor 3/6/12 meses */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <CalendarPlus className="h-3.5 w-3.5 text-gray-400" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Títulos incluídos por mês
              </h3>
            </div>
            <div className="flex gap-1">
              {([3, 6, 12] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMeses(n)}
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded border transition-colors ${
                    meses === n
                      ? 'bg-pioneira-500 text-white border-pioneira-500 dark:bg-yellow-500 dark:text-gray-900 dark:border-yellow-500'
                      : 'border-gray-300 text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  {n} meses
                </button>
              ))}
            </div>
          </div>
          {d.inclusoesPorMes.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum título incluído nos últimos {meses} meses.</p>
          ) : (
            <div className="space-y-1.5">
              {d.inclusoesPorMes.map((m) => {
                const pct = Math.round((m.quantidade / maxMes) * 100);
                return (
                  <div key={m.mes} className="flex items-center gap-2 text-xs">
                    <span className="w-14 shrink-0 text-gray-600 dark:text-gray-300">{rotuloMes(m.mes)}</span>
                    <div className="flex-1 h-4 rounded bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div className="h-full rounded bg-sky-300 dark:bg-sky-700/70" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-12 shrink-0 text-right font-semibold tabular-nums">{m.quantidade.toLocaleString('pt-BR')}</span>
                    <span className="w-20 shrink-0 text-right font-mono text-[11px] text-gray-500 dark:text-gray-400">
                      {moedaCompacta(m.valorLiquidoCents)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[10px] text-gray-400 dark:text-gray-500 pt-1">
            Por data de inclusão no Globus — últimos {meses} meses, independente do vencimento.
          </p>
        </div>
      </div>
      </div>
      )}
    </Card>
  );
}
