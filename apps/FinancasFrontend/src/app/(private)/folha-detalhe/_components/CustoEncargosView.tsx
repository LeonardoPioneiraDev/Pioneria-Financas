'use client';

import { useQuery } from '@tanstack/react-query';
import { Wallet, ShieldAlert, Building2, Info } from 'lucide-react';
import type { CustoEncargosResponse } from '@pioneira/shared/schemas/folha-detalhe';
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

export function CustoEncargosView({ competencia, tipoFolha }: { competencia: string; tipoFolha?: number }) {
  useAuditView({
    acao: 'visualizou',
    recurso: 'folha-detalhe-custo-encargos',
    descricao: 'Custo total com encargos por setor',
    filtros: { competencia, tipoFolha: tipoFolha ?? null },
  });

  const { data, isLoading } = useQuery<CustoEncargosResponse>({
    queryKey: ['folha-detalhe', 'custo-encargos', { competencia, tipoFolha }],
    queryFn: async () => {
      const params: Record<string, string | number> = { competencia };
      if (tipoFolha) params.tipoFolha = tipoFolha;
      const res = await api.get<CustoEncargosResponse>('/api/folha-detalhe/custo-encargos', { params });
      return res.data;
    },
  });

  if (isLoading || !data) {
    return (
      <Card className="p-12 text-center text-gray-500 dark:text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-transparent border-t-[#e6cd4a] dark:border-t-yellow-400 mx-auto mb-3" />
        Calculando custo com encargos…
      </Card>
    );
  }

  const t = data.totais;
  const pctPatronal = (data.aliquotaPatronalEstimada * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const real = data.patronalFonte === 'real';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ResumoCard titulo="Bruto (proventos)" valor={t.brutoCents} sub="real" icone={Wallet} cor="from-emerald-400 to-emerald-300 dark:from-emerald-500 dark:to-emerald-600" />
        <ResumoCard titulo="FGTS" valor={t.fgtsCents} sub="real · depósito 8%" icone={Building2} cor="from-purple-400 to-purple-300 dark:from-purple-500 dark:to-purple-600" />
        <ResumoCard
          titulo="INSS patronal"
          valor={t.inssPatronalCents}
          sub={real ? 'real · GPS (desonerado)' : `estimado · ${pctPatronal}%`}
          icone={ShieldAlert}
          cor={real ? 'from-emerald-400 to-emerald-300 dark:from-emerald-500 dark:to-emerald-600' : 'from-amber-400 to-amber-300 dark:from-amber-500 dark:to-amber-600'}
          estimativa={!real}
        />
        <ResumoCard titulo="Custo empresa" valor={t.custoEmpresaCents} sub="bruto + FGTS + INSS pat." icone={Wallet} cor="from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600" destaque />
      </div>

      <Card className={`p-3 ${real ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20' : 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20'}`}>
        <div className={`flex items-start gap-2 text-xs leading-relaxed ${real ? 'text-emerald-900 dark:text-emerald-200' : 'text-amber-900 dark:text-amber-200'}`}>
          <Info className={`h-4 w-4 shrink-0 mt-0.5 ${real ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
          <span>{data.observacao}</span>
        </div>
      </Card>

      <div>
        <h3 className="text-sm font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-2">
          Custo empresa por setor
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left font-semibold py-2 pr-2">Setor</th>
                <th className="text-right font-semibold py-2 px-2">Func.</th>
                <th className="text-right font-semibold py-2 px-2">Bruto</th>
                <th className="text-right font-semibold py-2 px-2">FGTS</th>
                <th className="text-right font-semibold py-2 px-2">INSS pat.<span className="text-amber-500">*</span></th>
                <th className="text-right font-semibold py-2 pl-2">Custo empresa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.setores.map((s) => (
                <tr key={`${s.codArea ?? 'null'}-${s.descArea ?? ''}`} className="hover:bg-gray-50/60 dark:hover:bg-gray-900/40">
                  <td className="py-2 pr-2">
                    <span className="font-medium text-pioneira-900 dark:text-yellow-200">{s.descArea ?? `Setor ${s.codArea ?? '—'}`}</span>
                    {s.bucket === 'a_classificar' && (
                      <Badge variant="muted" className="ml-1.5 text-[9px] align-middle text-amber-700 dark:text-amber-400">a classificar</Badge>
                    )}
                    {s.bucket === 'nao_operacional' && (
                      <Badge variant="muted" className="ml-1.5 text-[9px] align-middle text-gray-500 dark:text-gray-400">não-operacional</Badge>
                    )}
                    {s.codUnidade && (
                      <span className="ml-1.5 font-mono text-[9px] text-gray-400 dark:text-gray-500" title="Unidade do Contas a Pagar">unid. {s.codUnidade}</span>
                    )}
                  </td>
                  <td className="text-right py-2 px-2 tabular-nums text-gray-500 dark:text-gray-400">{s.qtdFuncionarios.toLocaleString('pt-BR')}</td>
                  <td className="text-right py-2 px-2 font-mono text-emerald-700 dark:text-emerald-400">{moedaCompacta(s.brutoCents)}</td>
                  <td className="text-right py-2 px-2 font-mono text-purple-700 dark:text-purple-400">{moedaCompacta(s.fgtsCents)}</td>
                  <td className="text-right py-2 px-2 font-mono text-amber-700 dark:text-amber-400">{moedaCompacta(s.inssPatronalCents)}</td>
                  <td className="text-right py-2 pl-2 font-mono font-bold text-pioneira-900 dark:text-yellow-200">{moedaCompacta(s.custoEmpresaCents)}</td>
                </tr>
              ))}
              {data.setores.length === 0 && (
                <tr><td colSpan={6} className="py-8 text-center text-gray-500 dark:text-gray-400">Sem dados nesta competência.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {real ? (
          <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1 flex-wrap">
            <span className="text-emerald-500">*</span> INSS patronal é o <strong>real da GPS do Globus</strong> (com desoneração/CPRB), rateado por base INSS.
            <Badge variant="muted" className="text-[10px]">GPS sincronizada</Badge>
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400 inline-flex items-center gap-1 flex-wrap">
            <span className="text-amber-500">*</span> INSS patronal é estimativa ({pctPatronal}% sobre a base) — o real (GPS, desonerado) é menor. <Badge variant="muted" className="text-[10px]">sincronize a GPS no Tributos</Badge>
          </p>
        )}
      </div>
    </div>
  );
}

function ResumoCard({ titulo, valor, sub, icone: Icone, cor, destaque, estimativa }: {
  titulo: string; valor: number; sub: string;
  icone: React.ComponentType<{ className?: string }>; cor: string; destaque?: boolean; estimativa?: boolean;
}) {
  return (
    <Card className={`p-3 ${destaque ? 'border-pioneira-400 dark:border-yellow-500/40' : estimativa ? 'border-amber-300 dark:border-amber-700' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold truncate">{titulo}</p>
          <p className="text-lg font-bold mt-0.5 truncate text-pioneira-900 dark:text-yellow-200">{moedaCompacta(valor)}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{sub}</p>
        </div>
        <div className={`shrink-0 h-8 w-8 rounded-lg bg-gradient-to-br ${cor} flex items-center justify-center shadow-md`}>
          <Icone className="h-4 w-4 text-white" />
        </div>
      </div>
    </Card>
  );
}
