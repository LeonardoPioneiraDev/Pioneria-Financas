'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Calendar, RefreshCw, Loader2, TrendingUp, TrendingDown, AlertTriangle, Wallet,
  Lightbulb, LayoutDashboard, LineChart, Layers, Info, ArrowUpRight, ArrowDownRight,
  Scale, ListChecks, Banknote, ExternalLink,
} from 'lucide-react';
import type { ProjecaoResponse } from '@pioneira/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TermoTecnico } from '@/components/shared/TermoTecnico';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';
import { api, extrairMensagemErro } from '@/lib/api';
import { cn } from '@/lib/utils';
import { GraficoProjecao } from './_components/GraficoProjecao';
import { ListaAPagar } from './_components/ListaAPagar';
import { ListaAReceber } from './_components/ListaAReceber';
import { FontesDosDados } from './_components/FontesDosDados';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function moedaCurta(cents: number): string {
  const v = Math.abs(cents) / 100;
  const sinal = cents < 0 ? '-' : '';
  if (v >= 1_000_000) return `${sinal}R$ ${(v / 1_000_000).toFixed(2)} M`;
  if (v >= 1_000) return `${sinal}R$ ${(v / 1_000).toFixed(0)} K`;
  return moeda(cents);
}
function hojeIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

type Aba = 'resumo' | 'projecao' | 'a-pagar' | 'a-receber' | 'cenarios';
type Horizonte = 7 | 30 | 60 | 90;

interface SyncCrCpResult {
  cr: { titulosGravados: number; clientesGravados: number; status: string };
  cp: { titulosGravados: number; status: string };
}

export default function FluxoCaixaPage() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>('resumo');
  const [horizonte, setHorizonte] = useState<Horizonte>(30);
  const dataRef = hojeIso();

  const projecaoQ = useQuery<ProjecaoResponse>({
    queryKey: ['fluxo-caixa', 'projecao', horizonte],
    queryFn: async () => {
      const res = await api.get<ProjecaoResponse>('/api/fluxo-caixa/projecao', {
        params: { horizonteDias: horizonte },
      });
      return res.data;
    },
  });

  /**
   * Sync de CR + CP em paralelo. Não chama mais BCOCONTA — saldo bancário foi
   * descartado do escopo (ver Leia/sprints/sprint-atual.md).
   *
   * Janela ampliada: pega mês anterior (pra cobrir atrasados) até 4 meses à
   * frente (pra cobrir projeção 90d). Sem essa ampliação, o sync default
   * (mês corrente) deixa a projeção vazia porque títulos já venceram.
   */
  const sync = useMutation<SyncCrCpResult>({
    mutationFn: async () => {
      const hoje = new Date();
      const dtIni = format(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1), 'yyyy-MM-dd');
      const dtFim = format(new Date(hoje.getFullYear(), hoje.getMonth() + 4, 1), 'yyyy-MM-dd');
      const [crRes, cpRes] = await Promise.all([
        api.post('/api/contas-receber/sync', { dtIni, dtFim }),
        api.post('/api/contas-pagar/sync', { dtIni, dtFim }),
      ]);
      return { cr: crRes.data, cp: cpRes.data };
    },
    onSuccess: (r) => {
      toast.success(
        `Sync ok: ${r.cr.titulosGravados ?? 0} CR + ${r.cp.titulosGravados ?? 0} CP atualizados`,
      );
      qc.invalidateQueries({ queryKey: ['fluxo-caixa'] });
      qc.invalidateQueries({ queryKey: ['contas-receber'] });
      qc.invalidateQueries({ queryKey: ['contas-pagar'] });
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const projecao = projecaoQ.data;

  return (
    <div className="space-y-6">
      <ModuleStatusBanner href="/fluxo-caixa" />

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent flex items-center gap-3">
            <TrendingUp className="h-7 w-7 text-pioneira-700 dark:text-yellow-400" />
            Fluxo de Caixa
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            O que vai entrar × o que vai sair nos próximos dias.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => sync.mutate()} disabled={sync.isPending} variant="outline" size="sm">
            {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sincronizar CR + CP
          </Button>
        </div>
      </div>

      <Card className="p-4 border-l-4 border-l-pioneira-400 dark:border-l-yellow-500 bg-pioneira-50/40 dark:bg-yellow-950/10">
        <div className="flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-pioneira-700 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            <strong className="text-pioneira-900 dark:text-yellow-200">Como funciona:</strong>{' '}
            o sistema soma 3 coisas pra projetar o caixa: (1)&nbsp;<strong>repasse BRB</strong>{' '}
            previsto pela média histórica diária do GDF, (2)&nbsp;<strong>títulos a receber</strong>{' '}
            (CR) vencendo, ajustados pela inadimplência histórica, (3)&nbsp;menos os{' '}
            <strong>títulos a pagar</strong> (CP). Se a saída supera a entrada acumulada em algum dia,
            o sistema marca como <em>dia de gap</em> — sinal de atenção.{' '}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Esta tela <strong>não</strong> mostra saldo bancário absoluto — só a previsão de variação.
            </span>
          </div>
        </div>
      </Card>

      {/* Card colapsável "De onde vem cada número?" — só renderiza quando projecao tem dado */}
      {projecao && (
        <FontesDosDados
          glosaPerc={projecao.receitaGdf.glosaPercHistorica}
          inadimplenciaPerc={projecao.inadimplencia.percentualAplicado}
          gdfMediaDiariaCents={projecao.receitaGdf.mediaDiariaCents}
          gdfDiasAnalisados={projecao.receitaGdf.diasAnalisados}
          horizonteDias={horizonte}
        />
      )}

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Calendar className="h-4 w-4" />
            Referência: <strong className="text-gray-700 dark:text-gray-200">{format(new Date(`${dataRef}T00:00:00`), 'dd/MM/yyyy')}</strong>
          </div>

          <div className="ml-auto flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 text-sm">
              <TermoTecnico
                termo={<span className="text-gray-500 dark:text-gray-400">Horizonte:</span>}
                explicacao="Quantos dias à frente projetar. 7d serve pra acompanhamento semanal. 30d é padrão pra fechamento do mês. 90d serve pra planejamento trimestral."
              />
              <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-700 overflow-hidden">
                {([7, 30, 60, 90] as Horizonte[]).map((h, i) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHorizonte(h)}
                    className={cn(
                      'px-3 py-1 text-xs font-medium transition-colors',
                      horizonte === h
                        ? 'bg-pioneira-700 dark:bg-yellow-400 text-white dark:text-gray-900'
                        : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
                      i > 0 && 'border-l border-gray-300 dark:border-gray-700',
                    )}
                  >
                    {h}d
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {projecaoQ.isLoading && (
        <Card className="p-10 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-pioneira-600" />
          <p className="mt-2 text-sm text-gray-500">Calculando projeção…</p>
        </Card>
      )}

      {projecao && (
        <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
          <TabsList>
            <TabsTrigger value="resumo" icon={<LayoutDashboard className="h-3.5 w-3.5" />}>
              Resumo
            </TabsTrigger>
            <TabsTrigger value="projecao" icon={<LineChart className="h-3.5 w-3.5" />}>
              Projeção
            </TabsTrigger>
            <TabsTrigger value="a-pagar" icon={<ListChecks className="h-3.5 w-3.5" />}>
              A pagar
            </TabsTrigger>
            <TabsTrigger value="a-receber" icon={<Banknote className="h-3.5 w-3.5" />}>
              A receber
            </TabsTrigger>
            <TabsTrigger value="cenarios" icon={<Layers className="h-3.5 w-3.5" />}>
              Cenários
            </TabsTrigger>
          </TabsList>

          {/* ============================= RESUMO ============================= */}
          <TabsContent value="resumo" className="space-y-4">
            <ExplicacaoSecao
              titulo="Visão geral"
              corpo={
                <>
                  Mostra o que vai entrar (clientes pagando), o que vai sair (fornecedores,
                  folha, tributos) e a <strong>diferença prevista</strong> nos próximos {horizonte} dias.{' '}
                  Se a soma fica negativa em algum dia, o sistema sinaliza como <strong>gap de caixa</strong>{' '}
                  (atenção operacional).
                </>
              }
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                label={
                  <TermoTecnico
                    termo={`A receber ${horizonte}d`}
                    explicacao={`Soma de: (1) repasse BRB previsto pela média histórica diária ajustada pela glosa, e (2) títulos de CR vencendo no período ajustados pela inadimplência histórica. Em geral o BRB é a parte muito maior.`}
                  />
                }
                valor={moedaCurta(projecao.resumo.totalEntradasAjustadasCents)}
                detalhe={
                  projecao.receitaGdf.historicoInsuficiente
                    ? `só CR — sem histórico GDF suficiente`
                    : `GDF ${moedaCurta(projecao.receitaGdf.receitaPrevistaHorizonteCents)} + CR ${moedaCurta(projecao.resumo.totalEntradasAjustadasCents - projecao.receitaGdf.receitaPrevistaHorizonteCents)}`
                }
                fonte="BRB Mobilidade + CR Globus"
                icon={<ArrowUpRight className="h-4 w-4 text-emerald-600" />}
              />
              <KpiCard
                label={
                  <TermoTecnico
                    termo={`A pagar ${horizonte}d`}
                    explicacao={`Soma dos títulos a pagar que vencem nos próximos ${horizonte} dias (fornecedores, folha, tributos, etc.).`}
                  />
                }
                valor={moedaCurta(projecao.resumo.totalSaidasPrevistasCents)}
                detalhe="folha · NF · guias · manuais"
                fonte="CP Globus (vencimentos futuros)"
                icon={<ArrowDownRight className="h-4 w-4 text-red-600" />}
              />
              <KpiCard
                label={
                  <TermoTecnico
                    termo="Diferença prevista"
                    explicacao="Entradas (ajustadas) menos saídas. Positivo = vai sobrar dinheiro. Negativo = vai faltar."
                  />
                }
                valor={moedaCurta(
                  projecao.resumo.totalEntradasAjustadasCents - projecao.resumo.totalSaidasPrevistasCents,
                )}
                detalhe={`em ${horizonte} dias`}
                fonte="cálculo: a receber − a pagar"
                icon={<Scale className="h-4 w-4 text-blue-600" />}
                cor={
                  projecao.resumo.totalEntradasAjustadasCents - projecao.resumo.totalSaidasPrevistasCents < 0
                    ? 'alerta'
                    : 'normal'
                }
              />
              <KpiCard
                label={
                  <TermoTecnico
                    termo="Dias com gap"
                    explicacao="Quantos dias no período a saída acumulada supera a entrada acumulada. Indica momentos em que pode faltar caixa pra honrar os pagamentos."
                  />
                }
                valor={`${projecao.resumo.diasComGap} ${projecao.resumo.diasComGap === 1 ? 'dia' : 'dias'}`}
                detalhe={projecao.resumo.primeiraDataComGap
                  ? `1º em ${format(new Date(`${projecao.resumo.primeiraDataComGap}T00:00:00`), 'dd/MM')}`
                  : 'sem gap'}
                fonte="dias em que saída acumulada > entrada"
                icon={<AlertTriangle className={cn(
                  'h-4 w-4',
                  projecao.resumo.diasComGap > 0 ? 'text-red-600' : 'text-emerald-600',
                )} />}
                cor={projecao.resumo.diasComGap > 0 ? 'alerta' : 'normal'}
              />
            </div>

            <StatusGeralCard projecao={projecao} />

            {/* Bloco GDF — receita principal */}
            <Card className="p-4 border-l-4 border-l-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/10">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 mb-2 flex items-center gap-2">
                <TermoTecnico
                  termo="Receita GDF prevista (BRB Mobilidade)"
                  explicacao="Fonte principal da receita da Pioneira. Cálculo: média diária dos resgates BRB nos últimos 60 dias × (1 − glosa%). A glosa é a diferença histórica entre o que a BRB diz que vai pagar e o que efetivamente caiu no banco."
                />
              </h3>
              {projecao.receitaGdf.historicoInsuficiente ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  ⚠️ Sem histórico GDF suficiente ({projecao.receitaGdf.diasAnalisados} dias analisados,
                  precisa ≥7). Sincronize Recebíveis GDF pra alimentar a base.
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Média diária</p>
                    <p className="text-lg font-bold mt-0.5">{moedaCurta(projecao.receitaGdf.mediaDiariaCents)}</p>
                    <p className="text-[10px] text-gray-500">
                      média de {projecao.receitaGdf.diasAnalisados} dias
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Glosa histórica</p>
                    <p className="text-lg font-bold mt-0.5">{projecao.receitaGdf.glosaPercHistorica.toFixed(2)}%</p>
                    <p className="text-[10px] text-gray-500">esperado − recebido</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Previsão diária ajustada</p>
                    <p className="text-lg font-bold mt-0.5 text-emerald-700 dark:text-emerald-400">
                      {moedaCurta(projecao.receitaGdf.receitaPrevistaDiariaCents)}
                    </p>
                    <p className="text-[10px] text-gray-500">após desconto da glosa</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Total {horizonte}d</p>
                    <p className="text-lg font-bold mt-0.5 text-emerald-700 dark:text-emerald-400">
                      {moedaCurta(projecao.receitaGdf.receitaPrevistaHorizonteCents)}
                    </p>
                    <p className="text-[10px] text-gray-500">
                      janela analisada: {projecao.receitaGdf.janelaDias}d
                    </p>
                  </div>
                </div>
              )}
            </Card>

            {/* Bloco CR — receita complementar */}
            <Card className="p-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-2 flex items-center gap-2">
                <TermoTecnico
                  termo="CR (receita complementar) + inadimplência"
                  explicacao="Receita por título a receber tradicional (VT corporativo, integração tarifária, etc.). Ajustada pelo % de inadimplência histórica dos últimos 6 meses do próprio CR."
                />
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">% inadimplência</p>
                  <p className="text-lg font-bold mt-0.5">{projecao.inadimplencia.percentualAplicado.toFixed(2)}%</p>
                  <p className="text-[10px] text-gray-500">fonte: {projecao.inadimplencia.fonte}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Janela analisada</p>
                  <p className="text-lg font-bold mt-0.5">{projecao.inadimplencia.janelaMeses} meses</p>
                  <p className="text-[10px] text-gray-500">CR vencidos</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Títulos analisados</p>
                  <p className="text-lg font-bold mt-0.5">{projecao.inadimplencia.crConsiderado.toLocaleString('pt-BR')}</p>
                  <p className="text-[10px] text-gray-500">
                    {projecao.inadimplencia.crAtrasadoOuCancelado.toLocaleString('pt-BR')} inadimplentes
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Valor inadimplente</p>
                  <p className="text-lg font-bold mt-0.5">{moedaCurta(projecao.inadimplencia.valorInadimplenteCents)}</p>
                  <p className="text-[10px] text-gray-500">de {moedaCurta(projecao.inadimplencia.valorTotalCents)} total</p>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* ============================= PROJECAO ============================= */}
          <TabsContent value="projecao" className="space-y-4">
            <ExplicacaoSecao
              titulo="Saldo previsto dia-a-dia"
              corpo={
                <>
                  Mostra como o caixa <strong>cresce ou diminui dia após dia</strong> no horizonte que
                  você escolheu. <strong className="text-emerald-700 dark:text-emerald-400">Verde</strong> = está
                  sobrando dinheiro.{' '}
                  <strong className="text-red-700 dark:text-red-400">Vermelho</strong> = caixa ficou
                  negativo (precisa de aporte / antecipação).
                  <br />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Os ajustes de inadimplência/glosa já estão aplicados — veja detalhes em{' '}
                    <em>"De onde vem cada número?"</em> no topo da página.
                  </span>
                </>
              }
            />

            <GraficoProjecao projecao={projecao} />
          </TabsContent>

          {/* ============================= A PAGAR ============================= */}
          <TabsContent value="a-pagar" className="space-y-4">
            <ExplicacaoSecao
              titulo="Detalhe dos títulos a pagar"
              corpo={
                <>
                  Lista de <strong>todos os títulos a pagar</strong> que vencem nos próximos {horizonte} dias,
                  agrupados por data de vencimento. Use pra ver QUAIS contas compõem o R$ X do KPI
                  "A pagar" no Resumo. Clique no ícone <ExternalLink className="inline h-3 w-3" /> pra ir
                  ao módulo Contas a Pagar e fazer ações (aprovar, baixar, etc.).
                </>
              }
            />
            <ListaAPagar horizonteDias={horizonte} />
          </TabsContent>

          {/* ============================= A RECEBER ============================= */}
          <TabsContent value="a-receber" className="space-y-4">
            <ExplicacaoSecao
              titulo="Detalhe dos títulos a receber"
              corpo={
                <>
                  Lista de <strong>todos os títulos a receber</strong> que vencem nos próximos {horizonte} dias.
                  Geralmente fica vazio porque a Pioneira <em>não emite CR com antecedência</em> — a maior
                  parte da receita vem do <strong>repasse BRB</strong> (módulo Recebíveis GDF), que entra
                  direto no banco sem passar por CR tradicional.
                </>
              }
            />
            <ListaAReceber horizonteDias={horizonte} />
          </TabsContent>

          {/* ============================= CENARIOS (placeholder) ============================= */}
          <TabsContent value="cenarios" className="space-y-4">
            <Card className="p-10 text-center space-y-3 border-dashed">
              <Layers className="h-10 w-10 mx-auto text-gray-400" />
              <h3 className="text-lg font-semibold">Cenários — em construção</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Em breve: comparação <strong>otimista</strong> (sem inadimplência) ×{' '}
                <strong>realista</strong> (histórica de {projecao.inadimplencia.janelaMeses} meses) ×{' '}
                <strong>pessimista</strong> (10% acima do histórico). Será priorizado depois que
                o financeiro usar a Projeção por algumas semanas e der feedback.
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// =========================================================================
// Componentes auxiliares
// =========================================================================

function ExplicacaoSecao({ titulo, corpo }: { titulo: React.ReactNode; corpo: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/30 p-4">
      <h2 className="text-sm font-bold text-pioneira-900 dark:text-yellow-200 mb-1 flex items-center gap-1.5">
        <Lightbulb className="h-4 w-4 text-pioneira-600 dark:text-yellow-400" />
        {titulo}
      </h2>
      <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{corpo}</div>
    </div>
  );
}

function KpiCard({
  label,
  valor,
  detalhe,
  fonte,
  icon,
  cor = 'normal',
}: {
  label: React.ReactNode;
  valor: string;
  detalhe?: string;
  /** Selo de origem dos dados em linguagem leiga (ex: "BRB + CR Globus"). */
  fonte?: string;
  icon?: React.ReactNode;
  cor?: 'normal' | 'atencao' | 'alerta';
}) {
  const corValor =
    cor === 'alerta'
      ? 'text-red-700 dark:text-red-400'
      : cor === 'atencao'
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-gray-900 dark:text-gray-100';
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {label}
        </span>
        {icon}
      </div>
      <div className={cn('mt-2 text-2xl font-bold', corValor)}>{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detalhe}</div>}
      {fonte && (
        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 italic">
          📊 {fonte}
        </div>
      )}
    </Card>
  );
}

function StatusGeralCard({ projecao }: { projecao: ProjecaoResponse }) {
  const diferenca = projecao.resumo.totalEntradasAjustadasCents - projecao.resumo.totalSaidasPrevistasCents;
  const gap = projecao.resumo.diasComGap > 0;

  let tom: 'ok' | 'atencao' | 'alerta';
  let texto: React.ReactNode;
  let emoji: string;

  if (gap) {
    tom = 'alerta';
    emoji = '🚨';
    texto = (
      <>
        <strong>Atenção:</strong> em <strong>{projecao.resumo.diasComGap} dia(s)</strong> o caixa
        fica negativo. Primeiro gap em{' '}
        <strong>{format(new Date(`${projecao.resumo.primeiraDataComGap}T00:00:00`), 'dd/MM/yyyy')}</strong>.
        Maior gap acumulado: <strong>{moedaCurta(projecao.resumo.gapMaximoCents)}</strong>.
        Sem saldo bancário no sistema, isso significa que a sequência de pagamentos pode estourar antes das entradas chegarem.
      </>
    );
  } else if (diferenca > 0) {
    tom = 'ok';
    emoji = '✅';
    texto = (
      <>
        <strong>Cobertura positiva.</strong> Vai sobrar{' '}
        <strong>{moedaCurta(diferenca)}</strong> em {projecao.horizonteDias} dias —
        entradas previstas {moedaCurta(projecao.resumo.totalEntradasAjustadasCents)} vs saídas{' '}
        {moedaCurta(projecao.resumo.totalSaidasPrevistasCents)}.
      </>
    );
  } else if (diferenca < 0) {
    tom = 'atencao';
    emoji = '⚠️';
    texto = (
      <>
        <strong>Cobertura negativa.</strong> Vai faltar{' '}
        <strong>{moedaCurta(Math.abs(diferenca))}</strong> no consolidado de {projecao.horizonteDias} dias.
        Sem detectar gap diário, mas o saldo do período é negativo — vale rever.
      </>
    );
  } else {
    tom = 'atencao';
    emoji = '⚖️';
    texto = (
      <>
        <strong>Equilibrado.</strong> Entradas e saídas praticamente empatam no período. Sem folga, mas sem gap.
      </>
    );
  }

  const corBorda =
    tom === 'ok'
      ? 'border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
      : tom === 'atencao'
        ? 'border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20'
        : 'border-l-red-500 bg-red-50/40 dark:bg-red-950/20';

  return (
    <Card className={cn('p-4 border-l-4', corBorda)}>
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">{emoji}</span>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1">
            Status geral
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-200">{texto}</p>
        </div>
      </div>
    </Card>
  );
}
