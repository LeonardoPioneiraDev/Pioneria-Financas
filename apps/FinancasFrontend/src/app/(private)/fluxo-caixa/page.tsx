'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Calendar, RefreshCw, Loader2, TrendingUp, TrendingDown, AlertTriangle, Wallet,
  Lightbulb, LayoutDashboard, LineChart, Layers, Info, ArrowUpRight, ArrowDownRight,
  Scale, ListChecks, Banknote, ExternalLink, History,
} from 'lucide-react';
import Link from 'next/link';
import type { ProjecaoResponse, CenariosResponse, RealizadoEntradasResponse, FluxoRealizadoResponse } from '@pioneira/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TermoTecnico } from '@/components/shared/TermoTecnico';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';
import { api, extrairMensagemErro } from '@/lib/api';
import { cn } from '@/lib/utils';
import { usePodeSincronizar } from '@/hooks/usePodeSincronizar';
import { GraficoProjecao } from './_components/GraficoProjecao';
import { ListaAPagar } from './_components/ListaAPagar';
import { ListaAReceber } from './_components/ListaAReceber';
import { FontesDosDados } from './_components/FontesDosDados';
import { RealizadoPanel } from './_components/RealizadoPanel';

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
type Modo = 'projecao' | 'realizado';

/** Presets de período realizado (passado), calculados de hoje. */
function presetsRealizado() {
  const h = new Date();
  const iso = (d: Date) => format(d, 'yyyy-MM-dd');
  return {
    mes_passado: { label: 'Mês passado', ini: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1)), fim: iso(new Date(h.getFullYear(), h.getMonth(), 0)) },
    este_mes: { label: 'Este mês', ini: iso(new Date(h.getFullYear(), h.getMonth(), 1)), fim: iso(h) },
    este_ano: { label: 'Este ano', ini: iso(new Date(h.getFullYear(), 0, 1)), fim: iso(h) },
    ano_passado: { label: 'Ano passado', ini: iso(new Date(h.getFullYear() - 1, 0, 1)), fim: iso(new Date(h.getFullYear() - 1, 11, 31)) },
  } as const;
}

interface SyncCrCpResult {
  cr: { titulosGravados: number; clientesGravados: number; status: string };
  cp: { titulosGravados: number; status: string };
}

export default function FluxoCaixaPage() {
  // Sincronizar com o Globus é ação de administrador.
  const podeSincronizar = usePodeSincronizar();
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>('resumo');
  const [horizonte, setHorizonte] = useState<Horizonte>(30);
  const [modo, setModo] = useState<Modo>('projecao');
  const presets = presetsRealizado();
  const [realIni, setRealIni] = useState<string>(presets.mes_passado.ini);
  const [realFim, setRealFim] = useState<string>(presets.mes_passado.fim);
  const dataRef = hojeIso();

  const projecaoQ = useQuery<ProjecaoResponse>({
    queryKey: ['fluxo-caixa', 'projecao', horizonte],
    queryFn: async () => {
      const res = await api.get<ProjecaoResponse>('/api/fluxo-caixa/projecao', {
        params: { horizonteDias: horizonte },
      });
      return res.data;
    },
    enabled: modo === 'projecao',
  });

  // Fluxo REALIZADO do período escolhido (só no modo realizado).
  const realizadoPeriodoQ = useQuery<FluxoRealizadoResponse>({
    queryKey: ['fluxo-caixa', 'realizado-periodo', realIni, realFim],
    queryFn: async () =>
      (await api.get<FluxoRealizadoResponse>('/api/fluxo-caixa/fluxo-realizado', { params: { dataInicio: realIni, dataFim: realFim } })).data,
    enabled: modo === 'realizado',
  });

  // Só busca cenários quando a aba está aberta (roda a projeção 3x no backend).
  const cenariosQ = useQuery<CenariosResponse>({
    queryKey: ['fluxo-caixa', 'cenarios', horizonte],
    queryFn: async () => {
      const res = await api.get<CenariosResponse>('/api/fluxo-caixa/cenarios', {
        params: { horizonteDias: horizonte },
      });
      return res.data;
    },
    enabled: aba === 'cenarios',
  });

  // "O que JÁ entrou" (real do extrato, últimos N dias) — ponte com o previsto.
  const realizadoQ = useQuery<RealizadoEntradasResponse>({
    queryKey: ['fluxo-caixa', 'realizado', horizonte],
    queryFn: async () => (await api.get<RealizadoEntradasResponse>('/api/fluxo-caixa/realizado', { params: { dias: horizonte } })).data,
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
          {podeSincronizar && (
            <Button onClick={() => sync.mutate()} disabled={sync.isPending} variant="outline" size="sm">
              {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sincronizar CR + CP
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4 border-l-4 border-l-pioneira-400 dark:border-l-yellow-500 bg-pioneira-50/40 dark:bg-yellow-950/10">
        <div className="flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-pioneira-700 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            <strong className="text-pioneira-900 dark:text-yellow-200">Como funciona:</strong>{' '}
            o sistema soma 3 coisas pra projetar o caixa: (1)&nbsp;<strong>repasse BRB</strong>{' '}
            previsto pela média dos repasses <strong>reais que caem no banco</strong> (tarifa técnica),
            (2)&nbsp;<strong>títulos a receber</strong>{' '}
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
          inadimplenciaPerc={projecao.inadimplencia.percentualAplicado}
          gdfMediaDiariaCents={projecao.receitaGdf.mediaDiariaCents}
          gdfDiasComRepasse={projecao.receitaGdf.diasComRepasse}
          gdfJanelaDias={projecao.receitaGdf.janelaDias}
          horizonteDias={horizonte}
        />
      )}

      {/* Período: Projeção (futuro) × Realizado (passado) */}
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
              <LineChart className="h-3.5 w-3.5" /> Projeção pra frente:
            </span>
            <div className="inline-flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-700">
              {([7, 30, 60, 90] as Horizonte[]).map((h, i) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => { setModo('projecao'); setHorizonte(h); }}
                  className={cn(
                    'px-3 py-1 text-xs font-medium transition-colors',
                    modo === 'projecao' && horizonte === h
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

          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
            <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
              <History className="h-3.5 w-3.5" /> Realizado (passado):
            </span>
            <div className="inline-flex flex-wrap overflow-hidden rounded-md border border-gray-300 dark:border-gray-700">
              {Object.entries(presets).map(([k, p], i) => {
                const ativo = modo === 'realizado' && realIni === p.ini && realFim === p.fim;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => { setModo('realizado'); setRealIni(p.ini); setRealFim(p.fim); }}
                    className={cn(
                      'px-3 py-1 text-xs font-medium transition-colors',
                      ativo ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
                      i > 0 && 'border-l border-gray-300 dark:border-gray-700',
                    )}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <input type="date" value={realIni} max={hojeIso()} onChange={(e) => { setModo('realizado'); setRealIni(e.target.value); }} className="rounded border border-gray-300 bg-white px-1.5 py-0.5 dark:border-gray-700 dark:bg-gray-900" />
              <span>até</span>
              <input type="date" value={realFim} max={hojeIso()} onChange={(e) => { setModo('realizado'); setRealFim(e.target.value); }} className="rounded border border-gray-300 bg-white px-1.5 py-0.5 dark:border-gray-700 dark:bg-gray-900" />
            </div>
          </div>
        </div>
      </Card>

      {/* Banner de modo — deixa explícito o que é o quê */}
      {modo === 'projecao' ? (
        <Card className="border-l-4 border-l-amber-400 bg-amber-50/50 p-3 dark:border-l-amber-500 dark:bg-amber-950/10">
          <p className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
            <LineChart className="h-4 w-4 shrink-0" />
            <span><strong>Projeção</strong> — estimativa dos próximos {horizonte} dias (repasse por média, CR/CP por vencimento). <strong>Não é o que já aconteceu.</strong></span>
          </p>
        </Card>
      ) : (
        <Card className="border-l-4 border-l-emerald-400 bg-emerald-50/50 p-3 dark:border-l-emerald-500 dark:bg-emerald-950/10">
          <p className="flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-200">
            <History className="h-4 w-4 shrink-0" />
            <span><strong>Realizado</strong> — o que de fato entrou e saiu no extrato entre {format(new Date(`${realIni}T00:00:00`), 'dd/MM/yyyy')} e {format(new Date(`${realFim}T00:00:00`), 'dd/MM/yyyy')}. Dados reais, não projeção.</span>
          </p>
        </Card>
      )}

      {/* Conteúdo do modo realizado */}
      {modo === 'realizado' && <RealizadoPanel data={realizadoPeriodoQ.data} loading={realizadoPeriodoQ.isLoading} />}

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
            <CoberturaDespesasCard projecao={projecao} />
            <JaEntrouVaiEntrar realizado={realizadoQ.data} projecao={projecao} horizonte={horizonte} />
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
                    explicacao={`Soma de: (1) repasse BRB previsto pela média dos repasses reais que caem no banco (tarifa técnica), e (2) títulos de CR vencendo no período ajustados pela inadimplência histórica. Em geral o BRB é a parte muito maior.`}
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
                    explicacao={`Soma da FOLHA real (salários líquidos, do FLP) + os títulos a pagar que vencem nos próximos ${horizonte} dias (fornecedores/NF, guias de tributo, pensão). A folha é a maior saída e antes ficava de fora — agora entra pelo dado real. Encargos/guias continuam nos títulos do CP (não conta duas vezes).`}
                  />
                }
                valor={moedaCurta(projecao.resumo.totalSaidasPrevistasCents)}
                detalhe={
                  projecao.folha.disponivel
                    ? `Folha ${moedaCurta(projecao.folha.horizonteCents)} + CP ${moedaCurta(projecao.resumo.totalSaidasPrevistasCents - projecao.folha.horizonteCents)}`
                    : `CP · folha indisponível (sincronize a folha)`
                }
                fonte="FLP (folha) + CP Globus"
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
                  termo="Receita GDF prevista (repasse BRB)"
                  explicacao="Fonte principal da receita. Quando a bilhetagem TD Max está sincronizada, a base é a RECEITA GERADA no validador (passageiros × tarifa técnica) — que é um valor NOMINAL — multiplicada pelo FATOR DE REALIZAÇÃO (~64%): o quanto o GDF de fato paga do nominal (gratuidade/meia/integração pagam menos). O fator é recalibrado sozinho (repasse real ÷ gerado, janela de 90 dias). Sem TD Max, cai pra média dos repasses do extrato. Não é a matriz de bilhetagem do cartão."
                />
              </h3>
              {projecao.receitaGdf.fonte === 'tdmax' ? (
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 px-2 py-1 text-[11px] text-emerald-800 dark:text-emerald-200">
                  <Banknote className="h-3 w-3" />
                  Fonte: <strong>bilhetagem TD Max</strong> × fator de realização — o GDF paga ~{Math.round(projecao.receitaGdf.fatorRealizacao * 100)}% do valor nominal
                </div>
              ) : (
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/40 px-2 py-1 text-[11px] text-emerald-800 dark:text-emerald-200">
                  <Banknote className="h-3 w-3" />
                  Fonte: <strong>extrato bancário</strong> — repasse real (tarifa técnica), não a bilhetagem do cartão
                </div>
              )}
              {projecao.receitaGdf.historicoInsuficiente ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  ⚠️ Nenhum repasse do GDF identificado no extrato nos últimos {projecao.receitaGdf.janelaDias} dias.
                  Use <strong>Sincronizar CR + CP</strong> pra atualizar o extrato e alimentar a base.
                </p>
              ) : projecao.receitaGdf.fonte === 'tdmax' ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Gerado/dia (nominal)</p>
                    <p className="text-lg font-bold mt-0.5">{moedaCurta(projecao.receitaGdf.receitaNominalDiariaCents)}</p>
                    <p className="text-[10px] text-gray-500">tarifa técnica cheia (TD Max)</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Fator de realização</p>
                    <p className="text-lg font-bold mt-0.5 text-amber-600 dark:text-amber-400">{Math.round(projecao.receitaGdf.fatorRealizacao * 100)}%</p>
                    <p className="text-[10px] text-gray-500">quanto o GDF paga do nominal</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Previsto {horizonte}d (efetivo)</p>
                    <p className="text-lg font-bold mt-0.5 text-emerald-700 dark:text-emerald-400">
                      {moedaCurta(projecao.receitaGdf.receitaPrevistaHorizonteCents)}
                    </p>
                    <p className="text-[10px] text-gray-500">nominal × fator × {horizonte} dias</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">A receber já gerado</p>
                    <p className="text-lg font-bold mt-0.5 text-emerald-700 dark:text-emerald-400">{moedaCurta(projecao.receitaGdf.aReceberGeradoCents)}</p>
                    <p className="text-[10px] text-gray-500">gerado × fator ainda não pago (cauda do lag)</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Média diária</p>
                    <p className="text-lg font-bold mt-0.5 text-emerald-700 dark:text-emerald-400">{moedaCurta(projecao.receitaGdf.mediaDiariaCents)}</p>
                    <p className="text-[10px] text-gray-500">
                      repasses reais em {projecao.receitaGdf.diasComRepasse} de {projecao.receitaGdf.janelaDias} dias
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Total no extrato ({projecao.receitaGdf.janelaDias}d)</p>
                    <p className="text-lg font-bold mt-0.5">{moedaCurta(projecao.receitaGdf.totalHistoricoCents)}</p>
                    <p className="text-[10px] text-gray-500">o que já caiu no banco</p>
                  </div>
                  <div>
                    <p className="text-gray-500 dark:text-gray-400">Previsto {horizonte}d</p>
                    <p className="text-lg font-bold mt-0.5 text-emerald-700 dark:text-emerald-400">
                      {moedaCurta(projecao.receitaGdf.receitaPrevistaHorizonteCents)}
                    </p>
                    <p className="text-[10px] text-gray-500">média × {horizonte} dias</p>
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

          {/* ============================= CENARIOS ============================= */}
          <TabsContent value="cenarios" className="space-y-4">
            <CenariosView data={cenariosQ.data} isLoading={cenariosQ.isLoading} horizonte={horizonte} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// =========================================================================
// Componentes auxiliares
// =========================================================================

function JaEntrouVaiEntrar({
  realizado,
  projecao,
  horizonte,
}: {
  realizado: RealizadoEntradasResponse | undefined;
  projecao: ProjecaoResponse;
  horizonte: number;
}) {
  const gdfPrev = projecao.receitaGdf.receitaPrevistaHorizonteCents;
  const crPrev = projecao.resumo.totalEntradasAjustadasCents - gdfPrev;

  return (
    <Card className="p-4">
      <div className="grid gap-4 md:grid-cols-2">
        {/* JÁ ENTROU — real do extrato */}
        <div className="rounded-lg border-l-4 border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/15 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">
            <ArrowUpRight className="h-3.5 w-3.5" /> Já entrou
            <span className="font-normal normal-case tracking-normal text-gray-500 dark:text-gray-400">· últimos {horizonte}d · real do extrato</span>
          </div>
          {realizado ? (
            <>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{moedaCurta(realizado.totalCreditosCents)}</p>
              <div className="mt-2 space-y-1 text-xs">
                <CenarioLinha rotulo="Repasse GDF (BRB)" valor={moedaCurta(realizado.gdfCents)} />
                <CenarioLinha rotulo="Outros créditos" valor={moedaCurta(realizado.outrosCents)} />
              </div>
              <p className="mt-1.5 text-[10px] text-gray-500">Dinheiro que de fato caiu no banco. "Outros" nem tudo é receita (titularidade / resgate / reembolso).</p>
              <Link href="/contas-receber" className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 transition-all hover:gap-1.5 dark:text-emerald-400">
                Ver detalhe por origem em Recebíveis <ExternalLink className="h-3 w-3" />
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm text-gray-400">carregando…</p>
          )}
        </div>

        {/* VAI ENTRAR — previsto */}
        <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/15 p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-blue-800 dark:text-blue-300">
            <TrendingUp className="h-3.5 w-3.5" /> Vai entrar
            <span className="font-normal normal-case tracking-normal text-gray-500 dark:text-gray-400">· próximos {horizonte}d · previsto</span>
          </div>
          <p className="mt-1 text-2xl font-bold tabular-nums text-blue-700 dark:text-blue-400">{moedaCurta(projecao.resumo.totalEntradasAjustadasCents)}</p>
          <div className="mt-2 space-y-1 text-xs">
            <CenarioLinha rotulo="Repasse GDF (média)" valor={moedaCurta(gdfPrev)} />
            <CenarioLinha rotulo="Contas a Receber" valor={moedaCurta(crPrev)} />
          </div>
          <p className="mt-1.5 text-[10px] text-gray-500">Previsão: GDF pela média do extrato + CR vencendo (ajustado por inadimplência). Detalhe dos títulos na aba "A receber".</p>
        </div>
      </div>
    </Card>
  );
}

function CenarioLinha({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{rotulo}</span>
      <span className={cn('font-medium tabular-nums', alerta && 'text-red-600 dark:text-red-400')}>{valor}</span>
    </div>
  );
}

function CenariosView({
  data,
  isLoading,
  horizonte,
}: {
  data: CenariosResponse | undefined;
  isLoading: boolean;
  horizonte: number;
}) {
  if (isLoading || !data) {
    return (
      <Card className="p-10 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </Card>
    );
  }

  const META: Record<string, { cor: string; borda: string; icone: React.ReactNode; hint: string }> = {
    otimista: { cor: 'text-emerald-700 dark:text-emerald-400', borda: 'border-l-emerald-400 dark:border-l-emerald-500', icone: <TrendingUp className="h-4 w-4" />, hint: 'menor inadimplência + melhor repasse GDF' },
    realista: { cor: 'text-pioneira-800 dark:text-yellow-300', borda: 'border-l-pioneira-400 dark:border-l-yellow-500', icone: <Scale className="h-4 w-4" />, hint: 'inadimplência e repasse na média histórica' },
    pessimista: { cor: 'text-red-700 dark:text-red-400', borda: 'border-l-red-400 dark:border-l-red-500', icone: <TrendingDown className="h-4 w-4" />, hint: 'maior inadimplência + pior repasse GDF' },
  };

  return (
    <div className="space-y-4">
      <ExplicacaoSecao
        titulo={`Como os cenários são montados · próximos ${horizonte} dias`}
        corpo={
          <>
            Mesmo motor da projeção, rodado 3× mudando só o que de fato oscila: a <strong>inadimplência</strong> do CR e o{' '}
            <strong>repasse GDF</strong>. As premissas de otimista/pessimista vêm da <strong>variação mensal real</strong>{' '}
            (melhor/pior mês dos últimos {data.premissas.gdf.janelaMeses} meses) — não de fator inventado. CR, CP e folha
            vencendo são os mesmos nos 3.
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {data.cenarios.map((c) => {
          const m = META[c.chave]!;
          const cobre = c.coberturaPerc >= 100;
          return (
            <Card key={c.chave} className={cn('p-4 border-l-4', m.borda)}>
              <div className="flex items-center justify-between">
                <div className={cn('flex items-center gap-1.5 font-semibold', m.cor)}>{m.icone}{c.nome}</div>
                <span className={cn('text-xs font-bold', cobre ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                  {cobre ? 'cobre' : 'não cobre'}
                </span>
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">{m.hint}</p>

              <p className="text-[11px] uppercase tracking-wide text-gray-500 mt-3">Sobra prevista</p>
              <p className={cn('text-2xl font-bold tabular-nums', c.sobraCents >= 0 ? m.cor : 'text-red-600 dark:text-red-400')}>{moedaCurta(c.sobraCents)}</p>
              <p className="text-[11px] text-gray-500">cobertura {c.coberturaPerc.toFixed(0)}%</p>

              <div className="mt-3 space-y-1 text-xs border-t border-gray-100 dark:border-gray-800 pt-2">
                <CenarioLinha rotulo="Entra" valor={moedaCurta(c.totalEntradasAjustadasCents)} />
                <CenarioLinha rotulo="Sai" valor={moedaCurta(c.totalSaidasCents)} />
                <CenarioLinha rotulo="Dias de gap" valor={c.diasComGap > 0 ? `${c.diasComGap} dia(s)` : 'nenhum'} alerta={c.diasComGap > 0} />
              </div>

              <div className="mt-2 text-[10px] text-gray-400 space-y-0.5">
                <p>inadimplência {c.inadimplenciaPerc.toFixed(1)}%</p>
                <p>GDF/dia {moedaCurta(c.gdfMediaDiariaCents)}</p>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="p-4 bg-gray-50/60 dark:bg-gray-900/30">
        <p className="text-[11px] uppercase tracking-wide text-gray-500 font-bold mb-1.5">Premissas (de onde vêm os números)</p>
        <ul className="text-xs text-gray-600 dark:text-gray-300 space-y-1 list-disc pl-4">
          {data.observacoes.map((o, i) => <li key={i}>{o}</li>)}
        </ul>
      </Card>

      {data.mensagem && (
        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5"><Info className="h-3.5 w-3.5" /> {data.mensagem}</p>
      )}
    </div>
  );
}

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

/**
 * Card-veredito no topo do Resumo: responde direto "o que entra cobre as despesas?".
 * Trata 3 estados honestos:
 *  - FALTA DADO: receita GDF (principal) sem histórico -> não conclui, cobertura subestimada.
 *  - COBRE: entradas >= saídas (e avisa se ainda há gap de datas no meio).
 *  - NÃO COBRE: entradas < saídas no consolidado do período.
 */
function CoberturaDespesasCard({ projecao }: { projecao: ProjecaoResponse }) {
  const entradas = projecao.resumo.totalEntradasAjustadasCents;
  const saidas = projecao.resumo.totalSaidasPrevistasCents;
  const diferenca = entradas - saidas;
  const incompleto = projecao.receitaGdf.historicoInsuficiente;
  const semDespesas = saidas <= 0;
  const cobre = entradas >= saidas;
  const coberturaPct = semDespesas ? null : Math.round((entradas / saidas) * 100);
  const barra = semDespesas ? 100 : Math.max(0, Math.min(100, (entradas / saidas) * 100));

  const cfg = incompleto
    ? { badge: 'FALTA DADO', badgeCls: 'bg-amber-500', borda: 'border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/20', barCls: 'bg-amber-400', emoji: '⚠️' }
    : cobre
      ? { badge: 'SIM, COBRE', badgeCls: 'bg-emerald-600', borda: 'border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20', barCls: 'bg-emerald-500', emoji: '✅' }
      : { badge: 'NÃO COBRE', badgeCls: 'bg-red-600', borda: 'border-l-red-500 bg-red-50/40 dark:bg-red-950/20', barCls: 'bg-red-500', emoji: '🔴' };

  return (
    <Card className={cn('p-5 border-l-4', cfg.borda)}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300 flex items-center gap-2">
            <Wallet className="h-4 w-4" /> O que entra cobre as despesas? · próximos {projecao.horizonteDias} dias
          </h2>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold text-white', cfg.badgeCls)}>
              {cfg.emoji} {cfg.badge}
            </span>
            {!incompleto && coberturaPct !== null && (
              <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">cobertura {coberturaPct}%</span>
            )}
          </div>
        </div>
        {!incompleto && !semDespesas && (
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">{cobre ? 'Sobra prevista' : 'Falta prevista'}</p>
            <p className={cn('text-2xl font-bold', cobre ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
              {moedaCurta(Math.abs(diferenca))}
            </p>
          </div>
        )}
      </div>

      {/* Barra: fundo = despesas (100%); preenchimento = quanto as entradas cobrem. */}
      <div className="mt-4">
        <div
          className="h-3 w-full rounded-full bg-red-200 dark:bg-red-950/40 overflow-hidden"
          title="Barra cheia = despesas do período. O preenchimento = quanto as entradas cobrem."
        >
          <div className={cn('h-full rounded-full transition-all', cfg.barCls)} style={{ width: `${barra}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-xs font-semibold">
          <span className="text-emerald-700 dark:text-emerald-400">Entra {moedaCurta(entradas)}</span>
          <span className="text-red-700 dark:text-red-400">Sai {moedaCurta(saidas)}</span>
        </div>
      </div>

      <p className="mt-3 text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
        {incompleto ? (
          <>⚠️ A <strong>receita principal (repasse GDF/BRB)</strong> ainda não entra nesta conta por falta de
          histórico suficiente — então <strong>não dá pra concluir</strong> se cobre. Sincronize{' '}
          <strong>Recebíveis GDF</strong> pra alimentar a base; a cobertura real é <strong>maior</strong> do que a barra mostra.</>
        ) : semDespesas ? (
          <>Não há despesas previstas nos próximos {projecao.horizonteDias} dias.</>
        ) : cobre ? (
          <>Nos próximos <strong>{projecao.horizonteDias} dias</strong>, o previsto a <strong>entrar</strong>{' '}
          ({moedaCurta(entradas)}) <strong className="text-emerald-700 dark:text-emerald-400">cobre</strong> o previsto
          a <strong>sair</strong> ({moedaCurta(saidas)}) e ainda <strong>sobra {moedaCurta(diferenca)}</strong>.
          {projecao.resumo.diasComGap > 0 && (
            <> Atenção: há <strong>{projecao.resumo.diasComGap} dia(s) de gap</strong> no meio do período
            (descompasso de datas) — o total cobre, mas em alguns dias o caixa aperta.</>
          )}</>
        ) : (
          <>Nos próximos <strong>{projecao.horizonteDias} dias</strong>, o previsto a <strong>entrar</strong>{' '}
          ({moedaCurta(entradas)}) <strong className="text-red-700 dark:text-red-400">não cobre</strong> o previsto
          a <strong>sair</strong> ({moedaCurta(saidas)}): <strong>faltam {moedaCurta(Math.abs(diferenca))}</strong>.</>
        )}
      </p>
    </Card>
  );
}
