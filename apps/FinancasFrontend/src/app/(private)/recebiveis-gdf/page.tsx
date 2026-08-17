'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Calendar, Landmark, RefreshCw, TrendingUp, Users, Clock, AlertCircle, Loader2,
  LayoutDashboard, Gauge, Map as MapIcon, Lightbulb,
} from 'lucide-react';
import type {
  AgingResponse,
  MapaDiarioResponse,
  SyncHorariosResponse,
} from '@pioneira/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { TermoTecnico } from '@/components/shared/TermoTecnico';
import { api, extrairMensagemErro } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';
import { usePodeSincronizar } from '@/hooks/usePodeSincronizar';
import { ComposicaoFamiliaDialog } from './_components/ComposicaoFamiliaDialog';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function moedaCurta(cents: number): string {
  const v = cents / 100;
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2)} M`;
  if (v >= 1_000) return `R$ ${(v / 1_000).toFixed(0)} K`;
  return moeda(cents);
}
function num(n: number): string {
  return n.toLocaleString('pt-BR');
}
function dataPtBr(iso: string): string {
  if (iso === 'anteriores') return 'Anteriores';
  return format(new Date(`${iso}T00:00:00`), 'dd/MM');
}
function inicioDoMes(): string {
  const hoje = new Date();
  return format(new Date(hoje.getFullYear(), hoje.getMonth(), 1), 'yyyy-MM-dd');
}
function hojeIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

const BUCKET_COR: Record<string, string> = {
  '0-2d': 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  '3-5d': 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  '6-10d': 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  '10+d': 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
};

interface FamiliaItemLista {
  codigo: string;
  nome: string;
  tipo: 'pagante' | 'gratuidade';
  fonteSubsidio: string | null;
  ordem: number;
}

type Metrica = 'valor' | 'creditos';
type Aba = 'resumo' | 'velocidade' | 'mapa';

export default function RecebiveisGdfPage() {
  // Sincronizar com o Globus é ação de administrador.
  const podeSincronizar = usePodeSincronizar();
  const qc = useQueryClient();
  const [dtIni, setDtIni] = useState(inicioDoMes());
  const [dtFim, setDtFim] = useState(hojeIso());
  const [familia, setFamilia] = useState<string>('');
  const [metrica, setMetrica] = useState<Metrica>('valor');
  const [dataDetalhe, setDataDetalhe] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('resumo');

  const familiasQ = useQuery<FamiliaItemLista[]>({
    queryKey: ['recebiveis-gdf', 'familias'],
    queryFn: async () => {
      const res = await api.get<FamiliaItemLista[]>('/api/recebiveis-gdf/familias');
      return res.data;
    },
    staleTime: 60 * 60_000,
  });

  const mapaQ = useQuery<MapaDiarioResponse>({
    queryKey: ['recebiveis-gdf', 'mapa', dtIni, dtFim, familia],
    queryFn: async () => {
      const res = await api.get<MapaDiarioResponse>('/api/recebiveis-gdf/mapa-diario', {
        params: { dtIni, dtFim, familia: familia || undefined },
      });
      return res.data;
    },
  });

  const agingQ = useQuery<AgingResponse>({
    queryKey: ['recebiveis-gdf', 'aging', dtIni, dtFim, familia],
    queryFn: async () => {
      const res = await api.get<AgingResponse>('/api/recebiveis-gdf/aging', {
        params: { dtIni, dtFim, familia: familia || undefined },
      });
      return res.data;
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const res = await api.post<SyncHorariosResponse>('/api/recebiveis-gdf/sincronizar');
      return res.data;
    },
    onSuccess: (r) => {
      toast.success(
        `Sync ${r.status}: ${r.relatoriosLidos} relatórios, ${r.etlGravadasCelulas ?? 0} células gravadas`,
      );
      qc.invalidateQueries({ queryKey: ['recebiveis-gdf'] });
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const mapa = mapaQ.data;
  const aging = agingQ.data;

  return (
    <div className="space-y-6">
      <ModuleStatusBanner href="/recebiveis-gdf" />

      {/* Cabeçalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent flex items-center gap-3">
            <Landmark className="h-7 w-7 text-pioneira-700 dark:text-yellow-400" />
            Recebíveis GDF
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Acompanhe o que a Pioneira deve receber da BRB Mobilidade e o que efetivamente caiu no banco.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {podeSincronizar && (
            <Button onClick={() => sync.mutate()} disabled={sync.isPending} variant="outline" size="sm">
              {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Sincronizar BRB
            </Button>
          )}
        </div>
      </div>

      {/* Glossário inicial */}
      <Card className="p-4 border-l-4 border-l-pioneira-400 dark:border-l-yellow-500 bg-pioneira-50/40 dark:bg-yellow-950/10">
        <div className="flex items-start gap-3">
          <Lightbulb className="h-5 w-5 text-pioneira-700 dark:text-yellow-400 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            <strong className="text-pioneira-900 dark:text-yellow-200">Como funciona o pagamento da BRB:</strong>{' '}
            cada vez que um passageiro entra no ônibus usando cartão (BRB Mobilidade), o sistema registra
            a passagem. Alguns dias depois, a BRB transfere o dinheiro pra Pioneira. Esta tela mostra
            quanto a gente <em>devia</em> receber × quanto <em>caiu</em> efetivamente no banco.{' '}
            <span className="text-xs text-gray-500 dark:text-gray-400">Passe o mouse sobre os ícones <Info /> pra entender cada termo.</span>
          </div>
        </div>
      </Card>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <Calendar className="h-4 w-4" />
            <TermoTecnico
              termo="Data de transporte"
              explicacao="É o dia em que o passageiro pegou o ônibus. Importante: o dinheiro desse dia não cai no banco no mesmo dia — geralmente leva 1 a 2 dias úteis pra ser repassado."
            />:
          </div>
          <input
            type="date"
            value={dtIni}
            onChange={(e) => setDtIni(e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
          <span className="text-gray-500">até</span>
          <input
            type="date"
            value={dtFim}
            onChange={(e) => setDtFim(e.target.value)}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
          />

          <div className="ml-auto flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 text-sm">
              <TermoTecnico
                termo={<span className="text-gray-500 dark:text-gray-400">Métrica:</span>}
                explicacao="Escolha o que olhar: 'R$' mostra os valores em dinheiro (o que a Pioneira recebe). 'Créditos' mostra a quantidade de passageiros que andaram."
              />
              <div className="inline-flex rounded-md border border-gray-300 dark:border-gray-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMetrica('valor')}
                  className={cn(
                    'px-3 py-1 text-xs font-medium transition-colors',
                    metrica === 'valor'
                      ? 'bg-pioneira-700 dark:bg-yellow-400 text-white dark:text-gray-900'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
                  )}
                >
                  R$
                </button>
                <button
                  type="button"
                  onClick={() => setMetrica('creditos')}
                  className={cn(
                    'px-3 py-1 text-xs font-medium border-l border-gray-300 dark:border-gray-700 transition-colors',
                    metrica === 'creditos'
                      ? 'bg-pioneira-700 dark:bg-yellow-400 text-white dark:text-gray-900'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800',
                  )}
                >
                  Créditos
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1 text-sm">
              <TermoTecnico
                termo={<span className="text-gray-500 dark:text-gray-400">Família:</span>}
                explicacao="Tipo de passageiro. 'Pagantes' são quem paga a tarifa (cidadão, vale-transporte, etc.). 'Gratuidades' são quem não paga mas a gente transporta (idoso, estudante, deficiente — o governo subsidia)."
              />
              <select
                value={familia}
                onChange={(e) => setFamilia(e.target.value)}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900"
              >
                <option value="">Todas</option>
                <optgroup label="Pagantes (R$)">
                  {familiasQ.data?.filter((f) => f.tipo === 'pagante').map((f) => (
                    <option key={f.codigo} value={f.codigo}>{f.nome}</option>
                  ))}
                </optgroup>
                <optgroup label="Gratuidades">
                  {familiasQ.data?.filter((f) => f.tipo === 'gratuidade').map((f) => (
                    <option key={f.codigo} value={f.codigo}>{f.nome}</option>
                  ))}
                </optgroup>
              </select>
              {familia && (
                <button
                  type="button"
                  onClick={() => setFamilia('')}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 underline"
                >
                  limpar
                </button>
              )}
            </div>
          </div>
        </div>

        {familia && familiasQ.data?.find((f) => f.codigo === familia)?.tipo === 'gratuidade' && metrica === 'valor' && (
          <div className="mt-3 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded px-2 py-1.5 inline-flex items-center gap-1.5">
            <Users className="h-3 w-3" />
            Esta família é gratuidade — receita BRB é R$ 0,00. Mude pra "Créditos" pra ver os passageiros transportados.
          </div>
        )}
      </Card>

      {/* Estado de carregamento global */}
      {mapaQ.isLoading && (
        <Card className="p-10 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-pioneira-600" />
          <p className="mt-2 text-sm text-gray-500">Carregando dados…</p>
        </Card>
      )}

      {mapaQ.isError && (
        <Card className="p-4 border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300 text-sm">
            <AlertCircle className="h-4 w-4" />
            {(mapaQ.error as Error)?.message ?? 'Falha ao carregar mapa diário'}
          </div>
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            Verifique se o backend está rodando e se você já clicou em <strong>Sincronizar BRB</strong> ao menos uma vez.
          </p>
        </Card>
      )}

      {mapa && mapa.linhas.length === 0 && (
        <Card className="p-10 text-center space-y-3">
          <div className="text-4xl">📭</div>
          <h3 className="text-lg font-semibold">Sem dados no período</h3>
          <p className="text-sm text-gray-500">
            Clique em <strong>Sincronizar BRB</strong> pra buscar os relatórios da API horários.
          </p>
        </Card>
      )}

      {mapa && mapa.linhas.length > 0 && (
        <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
          <TabsList>
            <TabsTrigger value="resumo" icon={<LayoutDashboard className="h-3.5 w-3.5" />}>
              Resumo
            </TabsTrigger>
            <TabsTrigger value="velocidade" icon={<Gauge className="h-3.5 w-3.5" />}>
              Velocidade
            </TabsTrigger>
            <TabsTrigger value="mapa" icon={<MapIcon className="h-3.5 w-3.5" />}>
              Mapa detalhado
            </TabsTrigger>
          </TabsList>

          {/* ============================ RESUMO ============================ */}
          <TabsContent value="resumo" className="space-y-4">
            <ExplicacaoSecao
              titulo="O que esta aba mostra"
              corpo={
                <>
                  Visão geral do período selecionado. Em uma olhada você vê <strong>quanto resgatou</strong>{' '}
                  (dinheiro que a BRB processou), <strong>quantos passageiros</strong> andaram,{' '}
                  <strong>quanto tempo</strong> a BRB demora pra repassar e se está tudo OK.
                </>
              }
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {metrica === 'valor' ? (
                <>
                  <KpiCard
                    label={
                      <TermoTecnico
                        termo="Total resgatado"
                        explicacao="Soma de tudo que a BRB processou no período. É o que a Pioneira tem direito a receber pelos giros transportados."
                      />
                    }
                    valor={moedaCurta(mapa.totais.valorCents)}
                    detalhe={moeda(mapa.totais.valorCents)}
                    icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
                  />
                  <KpiCard
                    label={
                      <TermoTecnico
                        termo="Total créditos"
                        explicacao="Quantos passageiros andaram no período. Inclui quem pagou (pagantes) e quem foi gratuito (idoso, estudante, etc.)."
                      />
                    }
                    valor={num(mapa.totais.creditos)}
                    detalhe="passageiros (pagantes + gratuidades)"
                    icon={<Users className="h-4 w-4 text-blue-600" />}
                  />
                </>
              ) : (
                <>
                  <KpiCard
                    label={
                      <TermoTecnico
                        termo="Total créditos"
                        explicacao="Quantos passageiros andaram no período. Inclui quem pagou (pagantes) e quem foi gratuito (idoso, estudante, etc.)."
                      />
                    }
                    valor={num(mapa.totais.creditos)}
                    detalhe={`${num(Math.round(mapa.totais.creditos / Math.max(1, mapa.totais.datasTransp)))} passageiros/dia médio`}
                    icon={<Users className="h-4 w-4 text-blue-600" />}
                  />
                  <KpiCard
                    label={
                      <TermoTecnico
                        termo="Valor resgatado"
                        explicacao="Soma de tudo que a BRB processou no período. É o que a Pioneira tem direito a receber pelos giros transportados."
                      />
                    }
                    valor={moedaCurta(mapa.totais.valorCents)}
                    detalhe="receita financeira BRB"
                    icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
                  />
                </>
              )}
              <KpiCard
                label={
                  <TermoTecnico
                    termo="Tempo médio"
                    explicacao="Quantos dias a BRB demora, em média, entre o passageiro andar e a Pioneira receber o dinheiro. Quanto menor, melhor pro fluxo de caixa."
                  />
                }
                valor={`${mapa.totais.tempoMedioDias.toFixed(1)} dias`}
                detalhe="entre transporte e resgate"
                icon={<Clock className="h-4 w-4 text-amber-600" />}
              />
              <KpiCard
                label={
                  <TermoTecnico
                    termo="Cobertura"
                    explicacao="Quantos dias diferentes têm dados no período. Se for menor que o esperado, pode faltar relatório."
                  />
                }
                valor={`${mapa.totais.datasTransp} transp.`}
                detalhe={`${mapa.totais.datasResgate} datas de resgate`}
                icon={<Calendar className="h-4 w-4 text-purple-600" />}
              />
            </div>
          </TabsContent>

          {/* ============================ VELOCIDADE ============================ */}
          <TabsContent value="velocidade" className="space-y-4">
            <ExplicacaoSecao
              titulo={
                <TermoTecnico
                  termo="Velocidade de pagamento (aging)"
                  explicacao="Aging é uma forma de classificar pagamentos pelo tempo que demoraram. Aqui mostra: dos resgates do período, quantos saíram rápido (≤2 dias), médios (3-5d), lentos (6-10d) ou muito lentos (10+d)."
                />
              }
              corpo={
                <>
                  Mostra quanto tempo a BRB leva, em média, pra transferir o dinheiro depois que o passageiro
                  anda. <strong>Rápido (verde)</strong> é o ideal — significa fluxo de caixa saudável.{' '}
                  <strong>Lento (vermelho)</strong> chama atenção, pode ser um sinal de problema operacional.
                </>
              }
            />

            {aging && (
              <Card className="p-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-3">
                  Distribuição por velocidade de resgate
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {aging.buckets.map((b) => (
                    <div key={b.chave} className={cn('rounded-lg p-3', BUCKET_COR[b.chave])}>
                      <div className="text-xs font-medium uppercase tracking-wide">{b.rotulo}</div>
                      <div className="mt-1 text-lg font-bold">
                        {metrica === 'valor' ? moedaCurta(b.valorCents) : num(b.creditos)}
                      </div>
                      <div className="text-xs">
                        {b.perc.toFixed(1)}% ·{' '}
                        {metrica === 'valor' ? `${num(b.creditos)} créditos` : moedaCurta(b.valorCents)}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
                  <strong>Como interpretar:</strong> idealmente quase tudo deveria estar em "0 a 2 dias"
                  (verde). Se você ver muito amarelo/vermelho, significa que a BRB está demorando pra
                  repassar — vale conversar com eles.
                </div>
              </Card>
            )}
          </TabsContent>

          {/* ============================ MAPA DETALHADO ============================ */}
          <TabsContent value="mapa" className="space-y-4">
            <ExplicacaoSecao
              titulo="Visão detalhada (avançado)"
              corpo={
                <>
                  Tabela completa mostrando, para <strong>cada dia em que os passageiros andaram</strong>{' '}
                  (linhas), <strong>em que dia o dinheiro foi resgatado pela BRB</strong> (colunas).
                  Use pra investigar um dia específico. Clique numa linha pra ver a composição por família
                  (cidadão, idoso, etc.).
                  <br />
                  <span className="text-xs text-gray-500 dark:text-gray-400 mt-1 inline-block">
                    A linha <strong>"Anteriores"</strong> mostra resgates de dias de transporte antes do
                    período filtrado — geralmente é o "atraso" caindo no período.
                  </span>
                </>
              }
            />

            <Card className="p-0 overflow-hidden">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Mapa Diário — Recebimento por Data de Transporte
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Clique numa linha para ver detalhes (composição por família)
                  </p>
                </div>
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide">
                  <LegendaPonto cor="bg-emerald-500" texto="T.médio ≤ 2d" />
                  <LegendaPonto cor="bg-amber-500" texto="T.médio > 2d" />
                  <LegendaPonto cor="bg-gray-400" texto="Anteriores" />
                  <span className="flex items-center gap-1">
                    <span className="text-emerald-500">✓</span>
                    <span className="text-gray-500 dark:text-gray-400">Completo</span>
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/80 backdrop-blur z-10">
                    <tr>
                      <th className="px-3 py-2 text-left sticky left-0 bg-gray-50 dark:bg-gray-900/80 z-20 font-semibold">
                        Data Transp.
                      </th>
                      <th className="px-3 py-2 text-right whitespace-nowrap font-semibold">Total</th>
                      <th className="px-3 py-2 text-right whitespace-nowrap font-semibold">T.Médio</th>
                      <th className="px-3 py-2 text-center font-semibold">Status</th>
                      {mapa.colunasResgate.map((col) => (
                        <th key={col} className="px-2 py-2 text-right whitespace-nowrap font-medium text-gray-600 dark:text-gray-400">
                          <div className="text-[9px] uppercase">Resgatado em</div>
                          <div>{dataPtBr(col)}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mapa.linhas.map((linha) => {
                      const ehAnteriores = linha.status === 'anteriores';
                      const ehLento = linha.tempoMedioDias > 2 && !ehAnteriores;
                      // Indice da ultima coluna de resgate com valor. Depois dela,
                      // se o dia ja foi 'recolhido', as celulas mostram ✓ (Completo).
                      const idxComValor = mapa.colunasResgate
                        .map((c, i) => (linha.resgates[c] ? i : -1))
                        .filter((i) => i >= 0);
                      const ultimoResgIdx = idxComValor.length ? Math.max(...idxComValor) : -1;
                      return (
                        <tr
                          key={linha.dataTransporte}
                          onClick={() => !ehAnteriores && setDataDetalhe(linha.dataTransporte)}
                          className={cn(
                            'border-t border-gray-100 dark:border-gray-800 transition-colors',
                            ehAnteriores
                              ? 'bg-gray-50/50 dark:bg-gray-900/30 italic text-gray-600 dark:text-gray-400'
                              : 'hover:bg-pioneira-50/50 dark:hover:bg-pioneira-900/10 cursor-pointer',
                          )}
                        >
                          <td className="px-3 py-2 sticky left-0 bg-white dark:bg-gray-950 z-10 font-medium border-r border-gray-100 dark:border-gray-800">
                            {ehAnteriores ? 'Anteriores' : format(new Date(`${linha.dataTransporte}T00:00:00`), 'dd/MM/yyyy')}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold">
                            {metrica === 'valor' ? moedaCurta(linha.totalCents) : num(linha.totalCreditos)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {ehAnteriores ? (
                              '-'
                            ) : (
                              <span className={cn('font-medium', ehLento && 'text-amber-700 dark:text-amber-400')}>
                                {linha.tempoMedioDias.toFixed(1)}d
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {ehAnteriores ? (
                              <Badge variant="muted">—</Badge>
                            ) : linha.status === 'recolhido' ? (
                              <Badge variant="success">✓ Recolhido</Badge>
                            ) : (
                              <Badge variant="warning">Pendente</Badge>
                            )}
                          </td>
                          {mapa.colunasResgate.map((col, i) => {
                            const cel = linha.resgates[col];
                            const completo = !cel && !ehAnteriores && linha.status === 'recolhido' && i > ultimoResgIdx;
                            return (
                              <td key={col} className="px-2 py-2 text-right font-mono text-[11px]">
                                {cel ? (
                                  <span className={ehAnteriores ? 'text-gray-500' : ''}>
                                    {metrica === 'valor' ? moedaCurta(cel.valorCents) : num(cel.creditos)}
                                  </span>
                                ) : completo ? (
                                  <span className="text-emerald-500" title="Completo — dia já resgatado">✓</span>
                                ) : (
                                  <span className="text-gray-300 dark:text-gray-700">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                  <MapaTotalRow mapa={mapa} metrica={metrica} />
                </table>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {dataDetalhe && (
        <ComposicaoFamiliaDialog dataTransporte={dataDetalhe} onClose={() => setDataDetalhe(null)} />
      )}
    </div>
  );
}

// =========================================================================
// Componentes auxiliares
// =========================================================================

function Info() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline h-3 w-3 align-middle">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function ExplicacaoSecao({
  titulo,
  corpo,
}: {
  titulo: React.ReactNode;
  corpo: React.ReactNode;
}) {
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
  icon,
}: {
  label: React.ReactNode;
  valor: string;
  detalhe?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {label}
        </span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-900 dark:text-gray-100">{valor}</div>
      {detalhe && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detalhe}</div>}
    </Card>
  );
}

/** Linha TOTAL do mapa (tfoot): soma por coluna de resgate + grand total. */
function MapaTotalRow({ mapa, metrica }: { mapa: MapaDiarioResponse; metrica: Metrica }) {
  const col: Record<string, { valor: number; creditos: number }> = {};
  let grandValor = 0;
  let grandCreditos = 0;
  for (const l of mapa.linhas) {
    grandValor += l.totalCents;
    grandCreditos += l.totalCreditos;
    for (const [c, v] of Object.entries(l.resgates)) {
      if (!col[c]) col[c] = { valor: 0, creditos: 0 };
      col[c]!.valor += v.valorCents;
      col[c]!.creditos += v.creditos;
    }
  }
  return (
    <tfoot className="sticky bottom-0">
      <tr className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-900 font-bold">
        <td className="px-3 py-2 sticky left-0 bg-gray-100 dark:bg-gray-900 z-10 border-r border-gray-200 dark:border-gray-700">TOTAL</td>
        <td className="px-3 py-2 text-right font-mono">{metrica === 'valor' ? moedaCurta(grandValor) : num(grandCreditos)}</td>
        <td className="px-3 py-2" />
        <td className="px-3 py-2" />
        {mapa.colunasResgate.map((c) => {
          const v = col[c];
          return (
            <td key={c} className="px-2 py-2 text-right font-mono text-[11px]">
              {v ? (metrica === 'valor' ? moedaCurta(v.valor) : num(v.creditos)) : '—'}
            </td>
          );
        })}
      </tr>
    </tfoot>
  );
}

function LegendaPonto({ cor, texto }: { cor: string; texto: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className={cn('h-2 w-2 rounded-full', cor)} />
      <span className="text-gray-500 dark:text-gray-400">{texto}</span>
    </div>
  );
}

