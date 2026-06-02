'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, Calculator, CheckCircle2, Circle, FileWarning, HelpCircle, Info, Loader2, Receipt } from 'lucide-react';
import type { AliquotasUsadasResponse, ConferenciaDivergenciasResponse } from '@pioneira/shared';
import type { CalendarioTributarioResponse, CoberturaTributariaResponse } from '@pioneira/shared/schemas/tributos';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { statusModulo, STATUS_COR } from '@/lib/module-status';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function TributosPage() {
  const info = statusModulo('/tributos');

  const div = useQuery<ConferenciaDivergenciasResponse>({
    queryKey: ['retencoes', 'divergencias'],
    queryFn: async () => (await api.get<ConferenciaDivergenciasResponse>('/api/retencoes/divergencias')).data,
  });
  const aliquotas = useQuery<AliquotasUsadasResponse>({
    queryKey: ['retencoes', 'aliquotas'],
    queryFn: async () => (await api.get<AliquotasUsadasResponse>('/api/retencoes/aliquotas')).data,
  });

  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  const calendario = useQuery<CalendarioTributarioResponse>({
    queryKey: ['tributos', 'calendario', ano, mes],
    queryFn: async () => (await api.get<CalendarioTributarioResponse>('/api/tributos/calendario', { params: { ano, mes } })).data,
  });
  const nomeMes = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(hoje);

  const cobertura = useQuery<CoberturaTributariaResponse>({
    queryKey: ['tributos', 'cobertura'],
    queryFn: async () => (await api.get<CoberturaTributariaResponse>('/api/tributos/cobertura')).data,
  });

  const ESTADO_FONTE: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' }> = {
    preenchido: { label: 'preenchido no Globus', variant: 'success' },
    vazio_globus: { label: 'vazio no Globus', variant: 'warning' },
    fora_globus: { label: 'feito fora do Globus', variant: 'muted' },
  };

  const cor = STATUS_COR.parcial;

  const ESFERA_LABEL: Record<string, { label: string; variant: 'default' | 'muted' | 'warning' }> = {
    federal: { label: 'Federal', variant: 'default' },
    municipal: { label: 'Municipal', variant: 'warning' },
    fgts: { label: 'FGTS', variant: 'muted' },
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent flex items-center gap-3">
            <Calculator className="h-7 w-7 text-pioneira-700 dark:text-yellow-400" />
            Tributos
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Apuração de PIS, COFINS, ISS, INSS, IRRF e geração de guias.
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cor.bg} ${cor.text} border ${cor.border}`}>
          <span className={`h-2 w-2 rounded-full ${cor.dot}`} />
          {info?.fase ?? 'Em construção'}
        </span>
      </div>

      {/* Funcionalidade no ar: conferência de retenções */}
      <Link href="/contas-pagar/divergencias" className="block group">
        <Card className="p-5 hover:border-pioneira-300 dark:hover:border-yellow-700 transition-colors">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-pioneira-700 dark:text-yellow-400" />
                <h2 className="text-lg font-bold">Conferência de retenções na fonte</h2>
                <Badge variant="success" className="text-[10px]">no ar · em validação</Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
                Compara o valor retido (Globus) com o esperado pela legislação (heurística Lucro Real,
                base = líquido + retenções, ciente de fornecedores do Simples Nacional).
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-pioneira-700 dark:text-yellow-400 group-hover:gap-2 transition-all shrink-0">
              Abrir conferência <ArrowRight className="h-4 w-4" />
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/50 dark:bg-gray-900/30">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Títulos com divergência</p>
              <p className="text-2xl font-bold mt-1">
                {div.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : (div.data?.total ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/50 dark:bg-gray-900/30">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Total divergência (módulo)</p>
              <p className="text-2xl font-bold mt-1 text-amber-700 dark:text-amber-400">
                {div.isLoading ? '—' : moeda(div.data?.totalDivergenciaCents ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/50 dark:bg-gray-900/30 col-span-2 md:col-span-1">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Alíquotas (Lucro Real)</p>
              <p className="text-xs mt-1.5 text-gray-600 dark:text-gray-300 leading-relaxed">
                {aliquotas.data
                  ? `PIS ${aliquotas.data.perc.pis}% · COFINS ${aliquotas.data.perc.cofins}% · CSLL ${aliquotas.data.perc.csll}% · IRRF ${aliquotas.data.perc.irrf}%`
                  : '—'}
              </p>
            </div>
          </div>
        </Card>
      </Link>

      {/* Transparência das fontes tributárias */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-5 w-5 text-pioneira-700 dark:text-yellow-400" />
          <h2 className="text-lg font-bold">Transparência: o que o sistema tem e o que falta</h2>
        </div>
        <Card className="p-4 border-l-4 border-l-blue-400 bg-blue-50/30 dark:bg-blue-950/10">
          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            Este sistema <strong>reflete o Globus</strong>: onde o Globus tem o dado, mostramos; onde não tem,
            dizemos "vazio" — <strong>nunca inventamos</strong>. Se a equipe passar a preencher esses campos no
            Globus, eles aparecem aqui automaticamente, sem mexer no sistema.
          </p>
          {cobertura.data && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Prova ao vivo do seu banco: INSS retido total ={' '}
              <strong>{moeda(cobertura.data.retencoes.inssCentsTotal)}</strong> · ISS retido total ={' '}
              <strong>{moeda(cobertura.data.retencoes.issCentsTotal)}</strong> ·{' '}
              {cobertura.data.retencoes.comAlgumaRetencao}/{cobertura.data.retencoes.notasServico} NF de serviço com
              retenção · {cobertura.data.guias.total} guias no banco.
            </p>
          )}
        </Card>

        <div className="mt-3 space-y-2">
          {(cobertura.data?.fontes ?? []).map((f) => {
            const est = ESTADO_FONTE[f.estado] ?? { label: f.estado, variant: 'muted' as const };
            return (
              <Card key={f.item} className="p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{f.item}</span>
                      <Badge variant={est.variant} className="text-[10px]">{est.label}</Badge>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{f.descricao}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{f.orientacao}</p>
                  </div>
                  <code className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 max-w-[45%] text-right break-all">
                    {f.fonteGlobus}
                  </code>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Calendário tributário */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CalendarClock className="h-5 w-5 text-pioneira-700 dark:text-yellow-400" />
          <h2 className="text-lg font-bold">Calendário tributário — {nomeMes}/{ano}</h2>
          <Badge variant="warning" className="text-[10px]">referência</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Obrigações de referência */}
          <Card className="p-4 lg:col-span-2">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Prazos federais padrão. <strong>Confirme as datas exatas com a contabilidade</strong> — e o ISS depende do município.
            </p>
            <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
              {(calendario.data?.obrigacoes ?? []).map((o) => {
                const esf = ESFERA_LABEL[o.esfera] ?? { label: o.esfera, variant: 'muted' as const };
                return (
                  <div key={o.codigo} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{o.tributo}</span>
                        <Badge variant={esf.variant} className="text-[9px]">{esf.label}</Badge>
                        {o.tipo === 'declaracao' && <Badge variant="muted" className="text-[9px]">declaração</Badge>}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{o.descricao}</p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 italic">{o.obs}</p>
                    </div>
                    <div className="text-right shrink-0 max-w-[45%]">
                      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Vencimento</p>
                      <p className="text-xs text-gray-700 dark:text-gray-300">{o.regraVencimento}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Guias reais do mês */}
          <Card className="p-4">
            <div className="flex items-center gap-2">
              <FileWarning className="h-4 w-4 text-pioneira-700 dark:text-yellow-400" />
              <h3 className="text-sm font-bold">Guias no sistema (mês)</h3>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 mb-3">
              Títulos com origem <strong>Guia / Imposto</strong> vencendo em {nomeMes}. Dado real do banco.
            </p>
            {calendario.isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-500">Lançadas</span>
                  <span className="text-sm font-semibold">
                    {calendario.data?.guias.quantidade ?? 0} · {moeda(calendario.data?.guias.valorAPagarCents ?? 0)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-500">Pagas</span>
                  <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                    {calendario.data?.guias.pagasQuantidade ?? 0} · {moeda(calendario.data?.guias.pagasValorCents ?? 0)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-500">Vencidas em aberto</span>
                  <span className={`text-sm font-semibold ${(calendario.data?.guias.vencidasEmAbertoQuantidade ?? 0) > 0 ? 'text-red-700 dark:text-red-400' : 'text-gray-500'}`}>
                    {calendario.data?.guias.vencidasEmAbertoQuantidade ?? 0} · {moeda(calendario.data?.guias.vencidasEmAbertoValorCents ?? 0)}
                  </span>
                </div>
                <Link href="/contas-pagar" className="inline-flex items-center gap-1 text-xs font-semibold text-pioneira-700 dark:text-yellow-400 hover:gap-2 transition-all mt-1">
                  Ver guias em Contas a Pagar <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Roadmap */}
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
          Roadmap do módulo — {info?.fase}
          {info?.estimativaSemanas ? ` · est. ${info.estimativaSemanas} semanas` : ''}
        </h2>
        <Card className="p-4">
          <ul className="space-y-2">
            {(info?.features ?? []).map((f) => (
              <li key={f.texto} className="flex items-start gap-2 text-sm">
                {f.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Circle className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0 mt-0.5" />
                )}
                <span className={f.ok ? '' : 'text-gray-500 dark:text-gray-400'}>{f.texto}</span>
              </li>
            ))}
          </ul>

          {info?.fontesDados && info.fontesDados.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">Fontes de dados</p>
              <div className="flex flex-wrap gap-1.5">
                {info.fontesDados.map((fd) => (
                  <Badge key={fd} variant="muted" className="text-[10px]">{fd}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Perguntas pro financeiro (destravam as 5 funcionalidades maiores) */}
      {info?.perguntasFinanceiro && info.perguntasFinanceiro.length > 0 && (
        <Card className="p-4 border-l-4 border-l-amber-400 bg-amber-50/40 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <HelpCircle className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
            <div className="text-sm text-gray-700 dark:text-gray-200">
              <p className="font-semibold text-amber-800 dark:text-amber-200">
                Pendente com o financeiro (destrava apuração própria, DARF/GPS, ISS, calendário e SPED):
              </p>
              <ol className="list-decimal ml-5 mt-1.5 space-y-1">
                {info.perguntasFinanceiro.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
