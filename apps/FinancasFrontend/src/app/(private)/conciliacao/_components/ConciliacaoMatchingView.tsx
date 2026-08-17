'use client';

/**
 * DESATIVADO (reativável) — Motor de conciliação DO NOSSO sistema: auto-match
 * (valor+data), agregação de borderô (subset-sum), sugestões com confirmar/rejeitar
 * e vínculo manual ("Ligar a uma conta").
 *
 * A pedido, a tela `/conciliacao` passou a ser SÓ LEITURA: mostra a conciliação
 * que já vem do Globus (flag `conciliado` + vínculo `cod_movto_bco`), sem o sistema
 * fazer ligação nenhuma. Este motor NÃO foi removido — está preservado aqui, fora
 * da rota. Para reativar, importe `ConciliacaoMatchingView` em `../page.tsx`. Os
 * endpoints de matching (`/api/conciliacao/sugerir`, `/sugerir-agregacao`, `/manual`,
 * `/confirmar`, `/rejeitar`, `/sugestoes`, `/confirmadas`, `/candidatos`) seguem ativos.
 *
 * `ContaCard` é exportado e reutilizado pela nova tela (aba "Contas bancárias").
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertCircle, ArrowLeftRight, Building2, Calendar, CheckCircle2, GitMerge, Info, KeyRound, Landmark,
  Layers, Link2, Loader2, RefreshCw, Search, ShieldCheck, Wallet, XCircle,
} from 'lucide-react';
import type {
  ConciliacaoCandidatosResponse,
  ConciliacaoDashboard,
  ConciliacaoResponse,
  ConciliacoesListResponse,
  ContaBancariaResumo,
  ContasBancariasResponse,
  MovtoBancoResumo,
  SemParResponse,
  SugerirAgregacaoResponse,
  SugerirResponse,
  TituloCandidato,
} from '@pioneira/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';
import { api, extrairMensagemErro } from '@/lib/api';
import { cn } from '@/lib/utils';
import { nomeBanco } from '@/lib/bancos';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function moedaCompacta(cents: number): string {
  const v = Math.abs(cents) / 100;
  const sinal = cents < 0 ? '-' : '';
  if (v >= 1_000_000) return `${sinal}R$ ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${sinal}R$ ${(v / 1_000).toFixed(0)}K`;
  return moeda(cents);
}
function dataFmt(d: string): string {
  if (!d) return '-';
  return format(new Date(`${d}T00:00:00`), 'dd/MM/yyyy');
}

type Aba = 'sugestoes' | 'confirmadas' | 'sem_par' | 'contas';

export function ConciliacaoMatchingView() {
  const qc = useQueryClient();

  const dash = useQuery<ConciliacaoDashboard>({
    queryKey: ['conciliacao', 'dashboard'],
    queryFn: async () => (await api.get<ConciliacaoDashboard>('/api/conciliacao/dashboard')).data,
  });
  const d = dash.data;

  // Movto selecionado pra conciliação manual (abre o modal de busca de título).
  const [movtoManual, setMovtoManual] = useState<MovtoBancoResumo | null>(null);

  // Aba padrão: sem sugestões/confirmadas ainda, abre direto em "Sem par" — onde
  // estão os movimentos que precisam de atenção. Seleção manual sempre vence.
  const [abaSelecionada, setAbaSelecionada] = useState<Aba | null>(null);
  const abaPadrao: Aba =
    d && d.conciliacoesSugeridas === 0 && d.conciliacoesConfirmadas === 0 ? 'sem_par' : 'sugestoes';
  const aba = abaSelecionada ?? abaPadrao;

  const sugestoes = useQuery<ConciliacoesListResponse>({
    queryKey: ['conciliacao', 'sugestoes'],
    queryFn: async () => (await api.get<ConciliacoesListResponse>('/api/conciliacao/sugestoes')).data,
    enabled: aba === 'sugestoes',
  });

  const confirmadas = useQuery<ConciliacoesListResponse>({
    queryKey: ['conciliacao', 'confirmadas'],
    queryFn: async () => (await api.get<ConciliacoesListResponse>('/api/conciliacao/confirmadas')).data,
    enabled: aba === 'confirmadas',
  });

  const semPar = useQuery<SemParResponse>({
    queryKey: ['conciliacao', 'sem-par'],
    queryFn: async () => (await api.get<SemParResponse>('/api/conciliacao/sem-par')).data,
    enabled: aba === 'sem_par',
  });

  const contas = useQuery<ContasBancariasResponse>({
    queryKey: ['conciliacao', 'contas'],
    queryFn: async () => (await api.get<ContasBancariasResponse>('/api/conciliacao/contas')).data,
    enabled: aba === 'contas',
  });

  const sugerir = useMutation<SugerirResponse>({
    mutationFn: async () => (await api.post<SugerirResponse>('/api/conciliacao/sugerir')).data,
    onSuccess: (r) => {
      toast.success(
        `${r.matchesGerados} matches gerados de ${r.movtosAnalisados} movtos (${r.duracaoMs}ms)`,
        { description: r.matchesPulados > 0 ? `${r.matchesPulados} pulados (sem candidato)` : undefined },
      );
      qc.invalidateQueries({ queryKey: ['conciliacao'] });
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const sugerirAgregacao = useMutation<SugerirAgregacaoResponse>({
    mutationFn: async () => (await api.post<SugerirAgregacaoResponse>('/api/conciliacao/sugerir-agregacao')).data,
    onSuccess: (r) => {
      toast.success(
        `${r.borderosResolvidos} borderôs resolvidos · ${r.titulosNoSubset} títulos pareados (${r.duracaoMs}ms)`,
        { description: r.movtosSemSubset > 0 ? `${r.movtosSemSubset} sem subset que bate` : undefined },
      );
      qc.invalidateQueries({ queryKey: ['conciliacao'] });
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const confirmar = useMutation<ConciliacaoResponse, unknown, string>({
    mutationFn: async (id) => (await api.post<ConciliacaoResponse>(`/api/conciliacao/confirmar/${id}`)).data,
    onSuccess: () => {
      toast.success('Conciliação confirmada');
      qc.invalidateQueries({ queryKey: ['conciliacao'] });
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const rejeitar = useMutation<ConciliacaoResponse, unknown, string>({
    mutationFn: async (id) => (await api.post<ConciliacaoResponse>(`/api/conciliacao/rejeitar/${id}`, { motivo: 'Rejeitado manualmente' })).data,
    onSuccess: () => {
      toast.success('Sugestão rejeitada');
      qc.invalidateQueries({ queryKey: ['conciliacao'] });
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const sList = sugestoes.data?.itens ?? [];
  const cList = confirmadas.data?.itens ?? [];
  const semParMovtos = semPar.data?.movimentos ?? [];
  const contasList = contas.data?.itens ?? [];

  return (
    <div className="space-y-6">
      <ModuleStatusBanner href="/conciliacao" />

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent flex items-center gap-3">
            <GitMerge className="h-7 w-7 text-pioneira-700 dark:text-yellow-400" />
            Conciliação Bancária
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Confira se cada valor que entrou ou saiu do banco corresponde a uma conta sua — a pagar ou a receber.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={() => sugerir.mutate()}
            disabled={sugerir.isPending || sugerirAgregacao.isPending}
            variant="outline"
            size="sm"
            title="O sistema tenta ligar automaticamente cada valor do banco a uma conta sua (mesmo valor e data próxima)."
          >
            {sugerir.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
            Procurar correspondências
          </Button>
          <Button
            onClick={() => sugerirAgregacao.mutate()}
            disabled={sugerir.isPending || sugerirAgregacao.isPending}
            size="sm"
            title="Quando um único valor no banco pagou várias contas de uma vez (borderô), o sistema tenta achar o conjunto de contas que soma aquele valor."
          >
            {sugerirAgregacao.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Layers className="h-4 w-4 mr-1" />}
            Pagamentos em lote
          </Button>
        </div>
      </div>

      <Card className="p-4 border-l-4 border-l-amber-400 bg-amber-50/40 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700 dark:text-gray-200">
            <strong className="text-amber-800 dark:text-amber-200">Em validação com o financeiro.</strong>{' '}
            Por enquanto o sistema só liga valores automaticamente quando batem certinho (mesmo valor e data próxima) —
            o que já resolve a maioria dos casos. As outras formas de identificação chegam nas próximas versões.
          </div>
        </div>
      </Card>

      {/* Resumo em linguagem simples — cada card explica o que significa. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Lançamentos do banco</p>
          <p className="text-3xl font-bold mt-1">{d?.movtosTotais ?? 0}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{d?.movtosConciliados ?? 0} já identificados · entradas e saídas da conta</p>
        </Card>
        <Card className="p-4 ring-1 ring-amber-200 dark:ring-amber-900/40">
          <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 font-bold">Falta identificar</p>
          <p className="text-3xl font-bold mt-1 text-amber-700 dark:text-amber-400">{d?.movtosSemPar ?? 0}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{moedaCompacta(d?.valorSemParCents ?? 0)} ainda sem conta vinculada</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Para você conferir</p>
          <p className="text-3xl font-bold mt-1 text-blue-700 dark:text-blue-400">{d?.conciliacoesSugeridas ?? 0}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">o sistema achou um possível par — falta confirmar</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Já conferidos</p>
          <p className="text-3xl font-bold mt-1 text-emerald-700 dark:text-emerald-400">{d?.conciliacoesConfirmadas ?? 0}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">{moedaCompacta(d?.valorTotalConciliadoCents ?? 0)} confirmados por você</p>
        </Card>
      </div>

      <Tabs value={aba} onValueChange={(v) => setAbaSelecionada(v as Aba)}>
        <TabsList>
          <TabsTrigger value="sugestoes" icon={<ArrowLeftRight className="h-3.5 w-3.5" />}>
            Para conferir ({d?.conciliacoesSugeridas ?? 0})
          </TabsTrigger>
          <TabsTrigger value="confirmadas" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            Já conferidos ({d?.conciliacoesConfirmadas ?? 0})
          </TabsTrigger>
          <TabsTrigger value="sem_par" icon={<AlertCircle className="h-3.5 w-3.5" />}>
            Falta identificar ({d?.movtosSemPar ?? 0})
          </TabsTrigger>
          <TabsTrigger value="contas" icon={<Landmark className="h-3.5 w-3.5" />}>
            Contas bancárias
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sugestoes" className="space-y-2">
          {sugestoes.isLoading && <Card className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></Card>}
          {!sugestoes.isLoading && sList.length === 0 && (
            <Card className="p-10 text-center space-y-3">
              <ShieldCheck className="h-10 w-10 mx-auto text-emerald-600" />
              <h3 className="text-lg font-semibold">Nada para conferir agora</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Clique em <strong>&quot;Procurar correspondências&quot;</strong> ou{' '}
                <strong>&quot;Pagamentos em lote&quot;</strong> e o sistema tenta ligar os valores do banco
                às suas contas. O que ele encontrar aparece aqui para você confirmar.
              </p>
            </Card>
          )}
          {sList.map((c) => (
            <ConciliacaoCard
              key={c.id}
              c={c}
              onConfirmar={() => confirmar.mutate(c.id)}
              onRejeitar={() => rejeitar.mutate(c.id)}
              loading={confirmar.isPending || rejeitar.isPending}
            />
          ))}
        </TabsContent>

        <TabsContent value="confirmadas" className="space-y-2">
          {confirmadas.isLoading && <Card className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></Card>}
          {!confirmadas.isLoading && cList.length === 0 && (
            <Card className="p-10 text-center text-sm text-gray-500">Você ainda não confirmou nenhuma identificação.</Card>
          )}
          {cList.map((c) => <ConciliacaoCard key={c.id} c={c} readonly />)}
        </TabsContent>

        <TabsContent value="sem_par" className="space-y-4">
          {semPar.isLoading && <Card className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></Card>}
          {semPar.isError && (
            <Card className="p-4 border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/30">
              <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Falha ao carregar os movimentos sem par: {extrairMensagemErro(semPar.error)}
              </div>
            </Card>
          )}
          {!semPar.isLoading && !semPar.isError && (
            <Card className="p-0 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700 text-sm font-bold flex items-center justify-between">
                <span>Valores do banco que faltam identificar ({semParMovtos.length})</span>
                <span className="text-[11px] font-normal text-gray-500">Clique numa linha para ligar a uma conta</span>
              </div>
              {semParMovtos.length === 0 ? (
                (d?.movtosSemPar ?? 0) > 0 ? (
                  <div className="p-4 text-sm text-amber-700 dark:text-amber-300 text-center">
                    O resumo indica <strong>{d?.movtosSemPar}</strong> valor(es) a identificar ({moedaCompacta(d?.valorSemParCents ?? 0)}),
                    mas a lista veio vazia. Recarregue (Ctrl+F5); se persistir, o backend precisa reiniciar com a última versão.
                  </div>
                ) : (
                  <div className="p-4 text-sm text-gray-500 text-center">Tudo identificado! Nenhum valor pendente.</div>
                )
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-[32rem] overflow-y-auto">
                  {semParMovtos.map((m) => <MovtoLinha key={m.id} m={m} onClick={() => setMovtoManual(m)} />)}
                </div>
              )}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="contas" className="space-y-3">
          {contas.isLoading && <Card className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></Card>}
          {!contas.isLoading && contasList.length === 0 && (
            <Card className="p-10 text-center text-sm text-gray-500">Nenhuma conta bancária cadastrada.</Card>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {contasList.map((conta) => <ContaCard key={conta.id} conta={conta} />)}
          </div>
        </TabsContent>
      </Tabs>

      <ConciliarManualDialog movto={movtoManual} onClose={() => setMovtoManual(null)} />
    </div>
  );
}

function ConciliacaoCard({
  c,
  onConfirmar,
  onRejeitar,
  loading,
  readonly,
}: {
  c: ConciliacaoResponse;
  onConfirmar?: () => void;
  onRejeitar?: () => void;
  loading?: boolean;
  readonly?: boolean;
}) {
  const scoreColor = c.scoreConfianca >= 90 ? 'text-emerald-700' : c.scoreConfianca >= 70 ? 'text-amber-700' : 'text-red-700';
  const m = c.bancoMovto;
  const t = c.titulo;
  return (
    <Card className="p-4">
      <div className="flex items-start gap-4 flex-wrap">
        {/* Movto banco */}
        <div className="flex-1 min-w-[200px] border-l-4 border-l-blue-400 pl-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Veio do banco</div>
          <div className="text-sm font-medium truncate">{m.descHistoBco ?? 'Movimento'}</div>
          <div className="text-[11px] text-gray-500 font-mono">
            {nomeBanco(m.codBanco)} · ag {m.codAgencia}/{m.codContaBco} · {dataFmt(m.dataMovto)}
          </div>
          {m.histMovtoBco && <div className="text-[10px] text-gray-500 italic truncate">{m.histMovtoBco}</div>}
          <div className={cn('text-base font-mono font-bold mt-1', m.debitoCredito === 'D' ? 'text-red-700' : 'text-emerald-700')}>
            {m.debitoCredito === 'D' ? '-' : '+'} {moeda(Math.abs(m.valorCents))}
          </div>
        </div>

        <ArrowLeftRight className="h-4 w-4 text-gray-400 self-center" />

        {/* Titulo */}
        <div className="flex-1 min-w-[200px] border-l-4 border-l-emerald-400 pl-3">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
            {t?.tipo === 'cp' ? 'Conta a Pagar' : t?.tipo === 'cr' ? 'Conta a Receber' : 'Título'}
          </div>
          <div className="text-sm font-medium truncate flex items-center gap-1">
            <Building2 className="h-3 w-3 text-gray-400" />
            {t?.contraparteRazaoSocial ?? <span className="italic text-gray-400">sem contraparte</span>}
          </div>
          <div className="text-[11px] text-gray-500 font-mono">
            {t?.numeroDocumento ?? '-'} · <Calendar className="h-2.5 w-2.5 inline" /> {t ? dataFmt(t.dataReferencia) : '-'}
          </div>
          <div className="text-base font-mono font-bold mt-1">
            {t ? moeda(t.valorCents) : '—'}
          </div>
        </div>

        {/* Score + acoes */}
        <div className="text-right shrink-0">
          <div className="text-[9px] uppercase tracking-wider text-gray-400" title="O quanto o sistema tem certeza de que este valor do banco e esta conta são o mesmo pagamento.">Confiança</div>
          <div className={cn('text-3xl font-bold', scoreColor)}>{c.scoreConfianca}%</div>
          <div className="text-[10px] text-gray-500">{c.diferencaDias} dia{c.diferencaDias === 1 ? '' : 's'} de diferença</div>
          <Badge variant={c.tipo === 'auto' ? 'muted' : 'default'} className="text-[9px] mt-1">{c.tipo === 'auto' ? 'automático' : 'manual'}</Badge>
          {!readonly && (
            <div className="flex gap-1 mt-2">
              <Button size="sm" variant="outline" onClick={onRejeitar} disabled={loading}>
                <XCircle className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" onClick={onConfirmar} disabled={loading}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirmar
              </Button>
            </div>
          )}
        </div>
      </div>
      {c.observacao && <p className="text-[10px] text-gray-500 italic mt-2">{c.observacao}</p>}
    </Card>
  );
}

function MovtoLinha({ m, onClick }: { m: MovtoBancoResumo; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-4 py-2 flex items-center gap-3 text-xs text-left hover:bg-pioneira-50/60 dark:hover:bg-yellow-950/20 transition-colors group"
    >
      <Calendar className="h-3 w-3 text-gray-400 shrink-0" />
      <span className="w-20 text-gray-500">{dataFmt(m.dataMovto)}</span>
      <span className="w-32 truncate font-medium text-pioneira-700 dark:text-yellow-400 shrink-0" title={`${nomeBanco(m.codBanco)} · ag ${m.codAgencia} cc ${m.codContaBco}`}>
        {nomeBanco(m.codBanco)}
      </span>
      <span className="flex-1 truncate">{m.descHistoBco ?? '-'} <span className="text-gray-400 ml-1">{m.docMovtoBco ?? ''}</span></span>
      <span className={cn('font-mono font-bold', m.debitoCredito === 'D' ? 'text-red-700' : 'text-emerald-700')}>
        {m.debitoCredito === 'D' ? '-' : '+'} {moeda(Math.abs(m.valorCents))}
      </span>
      <Link2 className="h-3.5 w-3.5 text-gray-300 group-hover:text-pioneira-600 dark:group-hover:text-yellow-400 shrink-0" />
    </button>
  );
}

/**
 * Modal de conciliação manual: dado um movto sem par, busca candidatos (CP/CR)
 * por proximidade de valor/data ou por texto, e vincula o escolhido. Optimistic:
 * remove o movto da lista sem-par no onMutate (sem spinner bloqueante).
 */
function ConciliarManualDialog({ movto, onClose }: { movto: MovtoBancoResumo | null; onClose: () => void }) {
  // const qc = useQueryClient(); // reativar junto com o vínculo manual (mutation abaixo)
  const [q, setQ] = useState('');
  const [qAtivo, setQAtivo] = useState('');

  // Reseta a busca toda vez que abre num movto novo.
  const movtoId = movto?.id ?? null;
  const [ultimoId, setUltimoId] = useState<string | null>(null);
  if (movtoId !== ultimoId) {
    setUltimoId(movtoId);
    setQ('');
    setQAtivo('');
  }

  const candidatos = useQuery<ConciliacaoCandidatosResponse>({
    queryKey: ['conciliacao', 'candidatos', movtoId, qAtivo],
    queryFn: async () =>
      (await api.get<ConciliacaoCandidatosResponse>(`/api/conciliacao/candidatos/${movtoId}`, {
        params: qAtivo ? { q: qAtivo } : {},
      })).data,
    enabled: !!movtoId,
  });

  const lista = candidatos.data?.candidatos ?? [];

  return (
    <Dialog open={!!movto} onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-pioneira-700 dark:text-yellow-400" />
            Ligar a uma conta
          </DialogTitle>
          <DialogDescription>
            Escolha a conta (a pagar ou a receber) que corresponde a este valor do banco.
            Como o banco não diz se é entrada ou saída, mostramos as duas opções.
          </DialogDescription>
        </DialogHeader>

        {movto && (
          <div className="rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-2 text-sm">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-0.5">Veio do banco</div>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{movto.descHistoBco ?? 'Movto'}</div>
                <div className="text-[11px] text-gray-500 font-mono">
                  {nomeBanco(movto.codBanco)} · ag {movto.codAgencia}/{movto.codContaBco} · {dataFmt(movto.dataMovto)}
                </div>
              </div>
              <div className="font-mono font-bold text-base shrink-0">{moeda(Math.abs(movto.valorCents))}</div>
            </div>
          </div>
        )}

        <form
          onSubmit={(e) => { e.preventDefault(); setQAtivo(q.trim()); }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por fornecedor/cliente ou nº do documento..."
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">Buscar</Button>
          {qAtivo && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { setQ(''); setQAtivo(''); }}>
              Limpar
            </Button>
          )}
        </form>

        <div className="text-[11px] text-gray-500">
          {qAtivo
            ? `Resultados para "${qAtivo}".`
            : 'Mostrando contas com valor e data parecidos. Use a busca para achar uma conta específica.'}
        </div>

        <div className="max-h-[24rem] overflow-y-auto -mx-2 px-2 divide-y divide-gray-100 dark:divide-gray-800">
          {candidatos.isLoading && (
            <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" /></div>
          )}
          {!candidatos.isLoading && lista.length === 0 && (
            <div className="p-8 text-center text-sm text-gray-500">
              Nenhum candidato encontrado. {qAtivo ? 'Tente outro termo.' : 'Tente buscar pelo nome do fornecedor ou nº do documento.'}
            </div>
          )}
          {lista.map((t) => (
            <CandidatoLinha key={`${t.tipo}-${t.id}`} t={t} />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CandidatoLinha({ t }: { t: TituloCandidato }) {
  const bate = t.diferencaValorCents === 0;
  return (
    <div className="py-2 flex items-center gap-3 text-xs">
      <Badge variant={t.tipo === 'cp' ? 'default' : 'muted'} className="text-[9px] shrink-0">
        {t.tipo === 'cp' ? 'A pagar' : 'A receber'}
      </Badge>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate flex items-center gap-1">
          <Building2 className="h-3 w-3 text-gray-400 shrink-0" />
          {t.contraparteRazaoSocial ?? <span className="italic text-gray-400">sem contraparte</span>}
        </div>
        <div className="text-[11px] text-gray-500 font-mono">
          {t.numeroDocumento ?? '-'} · {dataFmt(t.dataReferencia)}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="font-mono font-bold">{moeda(t.valorCents)}</div>
        <div className={cn('text-[10px]', bate ? 'text-emerald-600' : 'text-amber-600')}>
          {bate ? 'valor igual' : `${moeda(t.diferencaValorCents)} de diferença`} · {t.diferencaDias} dia{t.diferencaDias === 1 ? '' : 's'}
        </div>
      </div>
      <span className="text-[10px] text-gray-400 italic shrink-0">em validação</span>
    </div>
  );
}

// Tipos de chave PIX (codificação Globus). Exibido só quando há chave cadastrada.
const TIPOS_PIX: Record<number, string> = {
  1: 'CPF',
  2: 'CNPJ',
  3: 'Telefone',
  4: 'E-mail',
  5: 'Aleatória',
};

export function ContaCard({ conta }: { conta: ContaBancariaResumo }) {
  const taxaConc = conta.movtosTotais > 0 ? Math.round((conta.movtosConciliados / conta.movtosTotais) * 100) : null;
  const tipoPix = conta.tipoChavePix !== null ? TIPOS_PIX[conta.tipoChavePix] : undefined;
  return (
    <Card className="p-4 space-y-3">
      {/* Cabeçalho: nome + identificação + badges */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Landmark className="h-4 w-4 text-pioneira-700 dark:text-yellow-400 shrink-0" />
          <span className="font-semibold truncate">{conta.nome}</span>
          {conta.ehPrincipal && <Badge className="text-[9px]">Principal</Badge>}
          {conta.contaCaixa && <Badge variant="muted" className="text-[9px]">Caixa</Badge>}
        </div>
        <div className="text-[11px] text-gray-500 font-mono mt-0.5">
          {nomeBanco(conta.codBanco)} · Ag {conta.codAgencia} · CC {conta.codContaBco}{conta.digito ? `-${conta.digito}` : ''}
        </div>
      </div>

      {/* Saldo (âncora do tesoureiro) — "sem dado" quando não conferido */}
      <div className="rounded-md bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-bold">
          <Wallet className="h-3 w-3" /> Saldo
        </div>
        {conta.saldoAcmCents === null ? (
          <div className="text-sm text-gray-400 italic mt-0.5">Sem dado — saldo não conferido</div>
        ) : (
          <div className="mt-0.5">
            <span className="text-xl font-bold font-mono">{moeda(conta.saldoAcmCents)}</span>
            {conta.dataSaldoAcm && <span className="text-[10px] text-gray-500 ml-2">em {dataFmt(conta.dataSaldoAcm)}</span>}
          </div>
        )}
      </div>

      {/* Movimentos: total / conciliados / sem par */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-lg font-bold">{conta.movtosTotais}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Movtos</div>
        </div>
        <div>
          <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">{conta.movtosConciliados}</div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Conciliados{taxaConc !== null ? ` ${taxaConc}%` : ''}</div>
        </div>
        <div>
          <div className={cn('text-lg font-bold', conta.movtosSemPar > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-gray-400')}>
            {conta.movtosSemPar}
          </div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Sem par</div>
        </div>
      </div>
      {conta.movtosSemPar > 0 && (
        <div className="text-[11px] text-amber-700 dark:text-amber-400 text-center">
          {moedaCompacta(conta.valorSemParCents)} aguardando conciliação
        </div>
      )}

      {/* PIX — só renderiza com chave cadastrada */}
      {conta.chavePix && (
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 border-t border-gray-100 dark:border-gray-800 pt-2">
          <KeyRound className="h-3 w-3 shrink-0" />
          <span className="font-medium">PIX{tipoPix ? ` (${tipoPix})` : ''}:</span>
          <span className="font-mono truncate">{conta.chavePix}</span>
        </div>
      )}
    </Card>
  );
}
