'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Info, Loader2, Receipt,
} from 'lucide-react';
import type {
  AliquotasUsadasResponse,
  ConferenciaDivergenciasResponse,
  ConferenciaRetencao,
  RetencaoComparacao,
} from '@pioneira/shared';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const TIPO_LABEL: Record<string, string> = {
  pis: 'PIS',
  cofins: 'COFINS',
  csll: 'CSLL',
  irrf: 'IRRF',
  inss: 'INSS',
  iss: 'ISS',
};

function classeDivergencia(diff: number): string {
  if (diff === 0) return 'text-gray-500';
  if (diff < 0) return 'text-red-700 dark:text-red-400 font-bold';  // pagou menos que devia
  return 'text-amber-700 dark:text-amber-400 font-bold';            // pagou mais que devia
}

function rotuloDivergencia(diff: number): string {
  if (diff === 0) return 'ok';
  if (diff < 0) return `falta ${moeda(Math.abs(diff))}`;
  return `excedente ${moeda(diff)}`;
}

export default function DivergenciasRetencaoPage() {
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const div = useQuery<ConferenciaDivergenciasResponse>({
    queryKey: ['retencoes', 'divergencias'],
    queryFn: async () => {
      const res = await api.get<ConferenciaDivergenciasResponse>('/api/retencoes/divergencias');
      return res.data;
    },
  });

  const aliquotas = useQuery<AliquotasUsadasResponse>({
    queryKey: ['retencoes', 'aliquotas'],
    queryFn: async () => {
      const res = await api.get<AliquotasUsadasResponse>('/api/retencoes/aliquotas');
      return res.data;
    },
  });

  function toggle(id: string) {
    setExpandidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const itens = div.data?.itens ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm">
        <Link href="/contas-pagar" className="text-pioneira-700 dark:text-yellow-400 hover:underline inline-flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Voltar pra Contas a Pagar
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent flex items-center gap-3">
          <Receipt className="h-7 w-7 text-pioneira-700 dark:text-yellow-400" />
          Divergências de Retenção
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Conferência automática entre valor retido (Globus) e esperado pela legislação.
        </p>
      </div>

      {/* Aviso MVP */}
      <Card className="p-4 border-l-4 border-l-amber-400 bg-amber-50/40 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed text-gray-700 dark:text-gray-200 space-y-1">
            <p>
              <strong className="text-amber-800 dark:text-amber-200">Versão em validação com financeiro:</strong>{' '}
              heurística Lucro Real genérica pra NF de serviço PJ. Casos especiais (Simples Nacional,
              MEI, exterior, serviços específicos) precisam tratamento dedicado.
            </p>
            {aliquotas.data && (
              <p className="text-xs">
                <strong>Alíquotas aplicadas:</strong> PIS {aliquotas.data.perc.pis}% ·
                COFINS {aliquotas.data.perc.cofins}% ·
                CSLL {aliquotas.data.perc.csll}% ·
                IRRF {aliquotas.data.perc.irrf}% (acima de {moeda(aliquotas.data.valorMinimoIrrfCents)})
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Títulos com divergência</p>
          <p className="text-3xl font-bold mt-1">{div.data?.total ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Total divergências (módulo)</p>
          <p className="text-3xl font-bold mt-1 text-amber-700 dark:text-amber-400">
            {moeda(div.data?.totalDivergenciaCents ?? 0)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Base analisada</p>
          <p className="text-3xl font-bold mt-1">NFs</p>
          <p className="text-[11px] text-gray-500 mt-1">tipos NF/NFE/NFV/NFS (excl. folha/guia)</p>
        </Card>
      </div>

      {div.isLoading && (
        <Card className="p-10 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-pioneira-600" />
          <p className="mt-2 text-sm text-gray-500">Calculando divergências (pode demorar uns segundos)...</p>
        </Card>
      )}

      {!div.isLoading && itens.length === 0 && (
        <Card className="p-10 text-center space-y-3">
          <Receipt className="h-10 w-10 mx-auto text-emerald-600" />
          <h3 className="text-lg font-semibold">Sem divergências detectadas</h3>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Todas as NFs analisadas têm retenções batendo com a alíquota esperada
            (tolerância 1 centavo).
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {itens.map((cp: ConferenciaRetencao) => {
          const expandido = expandidos.has(cp.contaPagarId);
          return (
            <Card key={cp.contaPagarId} className="p-0 overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(cp.contaPagarId)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50/40 dark:hover:bg-gray-900/30 flex items-center gap-3"
              >
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate flex items-center gap-2">
                    {cp.fornecedorRazaoSocial ?? <span className="italic text-gray-400">sem fornecedor</span>}
                    {cp.fornecedorSimplesNacional === true && (
                      <Badge variant="muted" className="text-[9px]">Simples Nacional</Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 font-mono">
                    {cp.numeroDocumento ?? '-'}
                    {cp.cnpjCpf ? ` · ${cp.cnpjCpf}` : ''}
                    {(cp.fornecedorMunicipio || cp.fornecedorUf) && (
                      <span className="not-italic"> · {[cp.fornecedorMunicipio, cp.fornecedorUf].filter(Boolean).join('/')}</span>
                    )}
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <div className="text-xs text-gray-500">Bruto</div>
                  <div className="text-sm font-mono">{moeda(cp.valorBrutoCents)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-500">Divergência</div>
                  <div className={cn('text-sm font-mono', classeDivergencia(cp.divergenciaTotalCents))}>
                    {moeda(Math.abs(cp.divergenciaTotalCents))}
                  </div>
                </div>
                {expandido ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
              </button>

              {expandido && (
                <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-900/20 px-4 py-3">
                  {cp.alertas.length > 0 && (
                    <div className="mb-3 text-xs text-amber-800 dark:text-amber-300 italic space-y-1">
                      {cp.alertas.map((a, i) => (
                        <p key={i}>⚠ {a}</p>
                      ))}
                    </div>
                  )}
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 dark:text-gray-400 uppercase">
                        <th className="text-left py-1 pr-2">Tributo</th>
                        <th className="text-right py-1 pr-2">Alíquota</th>
                        <th className="text-right py-1 pr-2">Esperado</th>
                        <th className="text-right py-1 pr-2">Retido (Globus)</th>
                        <th className="text-right py-1 pr-2">Diferença</th>
                        <th className="text-left py-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cp.retencoes.map((r: RetencaoComparacao) => (
                        <tr
                          key={r.tipo}
                          className={cn(
                            'border-t border-gray-200/60 dark:border-gray-700/60',
                            r.divergente && 'bg-red-50/30 dark:bg-red-950/20',
                            !r.aplicavel && 'opacity-60',
                          )}
                        >
                          <td className="py-1.5 pr-2 font-medium">{TIPO_LABEL[r.tipo]}</td>
                          <td className="py-1.5 pr-2 text-right font-mono">
                            {r.aplicavel ? `${r.aliquotaPerc}%` : '—'}
                          </td>
                          <td className="py-1.5 pr-2 text-right font-mono">
                            {r.aplicavel ? moeda(r.esperadoCents) : '—'}
                          </td>
                          <td className="py-1.5 pr-2 text-right font-mono">{moeda(r.retidoCents)}</td>
                          <td className={cn('py-1.5 pr-2 text-right font-mono', classeDivergencia(r.divergenciaCents))}>
                            {r.aplicavel ? rotuloDivergencia(r.divergenciaCents) : '—'}
                          </td>
                          <td className="py-1.5">
                            {r.divergente ? (
                              <Badge variant="warning" className="text-[9px]">divergente</Badge>
                            ) : r.aplicavel ? (
                              <Badge variant="success" className="text-[9px]">ok</Badge>
                            ) : (
                              <Badge variant="muted" className="text-[9px]">n/a</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-bold">
                        <td className="py-1.5 pr-2">Total</td>
                        <td></td>
                        <td className="py-1.5 pr-2 text-right font-mono">{moeda(cp.totalEsperadoCents)}</td>
                        <td className="py-1.5 pr-2 text-right font-mono">{moeda(cp.totalRetidoCents)}</td>
                        <td className={cn('py-1.5 pr-2 text-right font-mono', classeDivergencia(cp.divergenciaTotalCents))}>
                          {rotuloDivergencia(cp.divergenciaTotalCents)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
