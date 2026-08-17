'use client';

/**
 * Conciliação Bancária — VISÃO SÓ LEITURA (espelho do Globus).
 *
 * Mostra a conciliação que JÁ VEM do Globus: a flag `conciliado`
 * (CONCILIADOMOVTOBCO) + o título que o Globus amarrou via `cod_movto_bco`
 * (CPGDOCTO.CODMOVTOBCO → contas_pagar). O sistema NÃO faz matching — só exibe.
 * Onde o Globus não vinculou (ex.: créditos/CR), mostramos como está, sem inventar.
 *
 * O motor de matching antigo (auto-match, borderô, vínculo manual) está preservado
 * e desativado em `./_components/ConciliacaoMatchingView` (reativável por import).
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertCircle, ArrowRight, Building2, CheckCircle2, GitMerge, Info, Landmark, Link2, Loader2,
  FileBarChart, RefreshCw, Search as SearchIcon, Wallet,
} from 'lucide-react';
import type {
  ConciliacaoCandidatosResponse,
  ConciliacaoDashboard,
  ContasBancariasResponse,
  MovimentoConciliado,
  MovimentosResponse,
  TituloCandidato,
} from '@pioneira/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';
import { api, extrairMensagemErro } from '@/lib/api';
import { usePodeSincronizar } from '@/hooks/usePodeSincronizar';
import { cn } from '@/lib/utils';
import { nomeBanco } from '@/lib/bancos';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ContaCard } from './_components/ConciliacaoMatchingView';
import { ExtratoMensal } from './_components/ExtratoMensal';

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

type Aba = 'identificados' | 'nao_identificados' | 'extrato' | 'contas';

export default function ConciliacaoPage() {
  const [aba, setAba] = useState<Aba>('identificados');
  const [contaId, setContaId] = useState('');
  const [busca, setBusca] = useState('');
  const [dtIni, setDtIni] = useState('');
  const [dtFim, setDtFim] = useState('');
  const [pagina, setPagina] = useState(1);
  const buscaDebounced = useDebouncedValue(busca, 400);
  // Movto pendente selecionado pra identificação MANUAL (abre o diálogo de vínculo).
  const [identificar, setIdentificar] = useState<MovimentoConciliado | null>(null);

  const qc = useQueryClient();
  const podeSincronizar = usePodeSincronizar();

  const dash = useQuery<ConciliacaoDashboard>({
    queryKey: ['conciliacao', 'dashboard'],
    queryFn: async () => (await api.get<ConciliacaoDashboard>('/api/conciliacao/dashboard')).data,
  });
  const d = dash.data;

  // Reconciliação AUTOMÁTICA do extrato: baixa cancelados e puxa títulos que
  // faltam — sem pareamento manual. Só admin (é carga do Globus).
  const reconciliar = useMutation({
    mutationFn: async () =>
      (await api.post<{ cancelados: number; titulosPuxados: number; movimentosVerificados: number }>(
        '/api/conciliacao/reconciliar-banco',
      )).data,
    onSuccess: (r) => {
      toast.success('Extrato reconciliado com o Globus', {
        description: `${r.cancelados} cancelado(s) baixado(s) · ${r.titulosPuxados} título(s) puxado(s) de ${r.movimentosVerificados} verificado(s).`,
      });
      void qc.invalidateQueries({ queryKey: ['conciliacao'] });
    },
    onError: (err) => toast.error('Falha ao reconciliar', { description: extrairMensagemErro(err) }),
  });

  const contas = useQuery<ContasBancariasResponse>({
    queryKey: ['conciliacao', 'contas'],
    queryFn: async () => (await api.get<ContasBancariasResponse>('/api/conciliacao/contas')).data,
  });

  const ehListaMovtos = aba === 'identificados' || aba === 'nao_identificados';
  const movtos = useQuery<MovimentosResponse>({
    queryKey: ['conciliacao', 'movimentos', { aba, contaId, busca: buscaDebounced, dtIni, dtFim, pagina }],
    queryFn: async () => {
      const params: Record<string, string | number> = { status: aba, pagina, porPagina: 15 };
      if (contaId) params.contaId = contaId;
      if (buscaDebounced.trim()) params.busca = buscaDebounced.trim();
      if (dtIni) params.dtIni = dtIni;
      if (dtFim) params.dtFim = dtFim;
      return (await api.get<MovimentosResponse>('/api/conciliacao/movimentos', { params })).data;
    },
    enabled: ehListaMovtos,
  });

  function trocaAba(nova: Aba) {
    setAba(nova);
    setPagina(1);
  }

  const lista = movtos.data?.itens ?? [];
  const contasList = contas.data?.itens ?? [];

  return (
    <div className="space-y-6">
      <ModuleStatusBanner href="/conciliacao" />

      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent flex items-center gap-3">
          <GitMerge className="h-7 w-7 text-pioneira-700 dark:text-yellow-400" />
          Conciliação Bancária
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mt-1 text-sm">
          O que entrou e saiu do banco, e a qual conta corresponde — <strong>direto do Globus</strong>.
        </p>
        {podeSincronizar && (
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => reconciliar.mutate()}
            disabled={reconciliar.isPending}
            title="Baixa os lançamentos que o Globus cancelou e puxa os títulos que faltam — resolve o 'falta identificar' automaticamente."
          >
            <RefreshCw className={reconciliar.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            {reconciliar.isPending ? 'Reconciliando…' : 'Reconciliar extrato'}
          </Button>
        )}
      </div>

      {/* Ajuda fixa, linguagem de leigo */}
      <Card className="p-4 border-l-4 border-l-blue-500 bg-blue-50/60 dark:bg-blue-950/20">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-700 dark:text-blue-300 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed text-gray-800 dark:text-gray-100">
            Um lançamento é considerado <strong>identificado</strong> quando sabemos a que conta ele corresponde:
            porque o Globus marcou como conciliado, <strong>ou</strong> porque já temos a conta a pagar ligada pela
            chave do borderô. A identificação é <strong>automática</strong> — o botão
            <strong> &quot;Reconciliar extrato&quot;</strong> baixa os lançamentos que o Globus cancelou e puxa do
            Globus os títulos que ainda faltam, ligando-os sozinho. O que sobrar em
            <strong>&quot;Falta identificar&quot;</strong> é o que nem o Globus nem a chave do borderô resolvem
            (ex.: entradas de clientes) — aí sim cabe ligar manualmente.
          </div>
        </div>
      </Card>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4 border-gray-200 dark:border-gray-700">
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">Lançamentos do banco</p>
          <p className="text-3xl font-bold mt-1 text-gray-900 dark:text-white">{d?.movtosTotais ?? 0}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">entradas e saídas da conta</p>
        </Card>
        <Card className="p-4 border-gray-200 dark:border-gray-700">
          <p className="text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400 font-bold">Identificados</p>
          <p className="text-3xl font-bold mt-1 text-emerald-700 dark:text-emerald-400">{d?.movtosIdentificados ?? 0}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {(d?.movtosConciliados ?? 0).toLocaleString('pt-BR')} pelo Globus
            {(d?.movtosIdentificadosPorTitulo ?? 0) > 0 && (
              <> + {(d?.movtosIdentificadosPorTitulo ?? 0).toLocaleString('pt-BR')} pela conta a pagar ligada</>
            )}
          </p>
        </Card>
        <Card className="p-4 border-gray-200 dark:border-gray-700">
          <p className="text-xs uppercase tracking-wider text-blue-700 dark:text-blue-400 font-bold">Com título detalhado</p>
          <p className="text-3xl font-bold mt-1 text-blue-700 dark:text-blue-400">{d?.movtosComTitulo ?? 0}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">dá pra ver qual conta a pagar</p>
        </Card>
        <Card className="p-4 ring-1 ring-amber-200 dark:ring-amber-900/40 border-amber-200 dark:border-amber-900/40">
          <p className="text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400 font-bold">Falta identificar</p>
          <p className="text-3xl font-bold mt-1 text-amber-700 dark:text-amber-400">{d?.movtosSemPar ?? 0}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{moedaCompacta(d?.valorSemParCents ?? 0)} sem conta vinculada</p>
        </Card>
      </div>

      <Tabs value={aba} onValueChange={(v) => trocaAba(v as Aba)}>
        <TabsList>
          <TabsTrigger value="identificados" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            Identificados ({d?.movtosIdentificados ?? 0})
          </TabsTrigger>
          <TabsTrigger value="nao_identificados" icon={<AlertCircle className="h-3.5 w-3.5" />}>
            Falta identificar ({d?.movtosSemPar ?? 0})
          </TabsTrigger>
          <TabsTrigger value="extrato" icon={<FileBarChart className="h-3.5 w-3.5" />}>
            Extrato mensal
          </TabsTrigger>
          <TabsTrigger value="contas" icon={<Landmark className="h-3.5 w-3.5" />}>
            Contas bancárias
          </TabsTrigger>
        </TabsList>

        {/* Listas de lançamentos (identificados / não identificados) */}
        {ehListaMovtos && (
          <TabsContent value={aba} className="space-y-3">
            {/* Filtros */}
            <Card className="p-3">
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <Label htmlFor="conta" className="text-xs">Conta</Label>
                  <select
                    id="conta"
                    value={contaId}
                    onChange={(e) => { setContaId(e.target.value); setPagina(1); }}
                    className="flex h-9 w-56 rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="">Todas as contas</option>
                    {contasList.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome} ({nomeBanco(c.codBanco)})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="dtIni" className="text-xs">De</Label>
                  <Input id="dtIni" type="date" value={dtIni} onChange={(e) => { setDtIni(e.target.value); setPagina(1); }} className="h-9 w-40" />
                </div>
                <div>
                  <Label htmlFor="dtFim" className="text-xs">Até</Label>
                  <Input id="dtFim" type="date" value={dtFim} onChange={(e) => { setDtFim(e.target.value); setPagina(1); }} className="h-9 w-40" />
                </div>
                {(dtIni || dtFim) && (
                  <button
                    type="button"
                    onClick={() => { setDtIni(''); setDtFim(''); setPagina(1); }}
                    className="h-9 px-1 text-xs text-gray-500 underline-offset-2 hover:text-gray-700 hover:underline dark:hover:text-gray-300"
                  >
                    limpar datas
                  </button>
                )}
                <div className="flex-1 min-w-[220px]">
                  <Label htmlFor="busca" className="text-xs">Buscar (histórico, documento)</Label>
                  <div className="relative">
                    <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                    <Input id="busca" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} className="pl-8" placeholder="Ex.: BORDERO, TED, BO-0102" />
                  </div>
                </div>
              </div>
            </Card>

            {movtos.isLoading && <Card className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></Card>}

            {!movtos.isLoading && lista.length === 0 && (
              <Card className="p-10 text-center text-sm text-gray-500">
                {aba === 'identificados' ? 'Nenhum lançamento identificado com esses filtros.' : 'Nenhum lançamento pendente — tudo identificado!'}
              </Card>
            )}

            {!movtos.isLoading && lista.map((m) => (
              <MovimentoLinha key={m.id} m={m} onIdentificar={() => setIdentificar(m)} />
            ))}

            {movtos.data && movtos.data.total > movtos.data.porPagina && (
              <div className="flex items-center justify-between p-2">
                <span className="text-xs text-gray-500">
                  Página {movtos.data.pagina} de {movtos.data.totalPaginas} · {movtos.data.total.toLocaleString('pt-BR')} lançamentos
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPagina(pagina - 1)} disabled={pagina <= 1}>Anterior</Button>
                  <Button variant="outline" size="sm" onClick={() => setPagina(pagina + 1)} disabled={pagina >= movtos.data.totalPaginas}>Próxima</Button>
                </div>
              </div>
            )}
          </TabsContent>
        )}

        <TabsContent value="extrato" className="space-y-3">
          <ExtratoMensal />
        </TabsContent>

        <TabsContent value="contas" className="space-y-3">
          {/* Explicação da aba — o que cada número do cartão de conta significa. */}
          <Card className="p-4 border-l-4 border-l-blue-500 bg-blue-50/60 dark:bg-blue-950/20">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-700 dark:text-blue-300 shrink-0 mt-0.5" />
              <div className="text-sm leading-relaxed text-gray-800 dark:text-gray-100 space-y-1.5">
                <p>
                  As contas bancárias vêm do <strong>cadastro do Globus</strong> (BCOCONTA). Cada cartão mostra, pra aquela conta:
                </p>
                <ul className="list-disc list-inside space-y-0.5 text-[13px] text-gray-700 dark:text-gray-200">
                  <li><strong>Saldo</strong> — o valor que o tesoureiro conferiu no banco e digitou (âncora). O Globus não mantém saldo confiável, então quando ninguém conferiu aparece <strong>&quot;sem dado&quot;</strong> — nunca zeramos em silêncio.</li>
                  <li><strong>Movtos</strong> — quantos lançamentos (entradas e saídas) essa conta tem no extrato sincronizado.</li>
                  <li><strong>Conciliados</strong> — quantos o Globus já ligou a um título (o % é a fatia identificada).</li>
                  <li><strong>Sem par</strong> — quantos ainda faltam identificar, e quanto somam. É o que você resolve na aba <strong>&quot;Falta identificar&quot;</strong>.</li>
                  <li><strong>PIX</strong> — a chave cadastrada, quando houver.</li>
                </ul>
              </div>
            </div>
          </Card>

          {contas.isLoading && <Card className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></Card>}
          {!contas.isLoading && contasList.length === 0 && (
            <Card className="p-10 text-center text-sm text-gray-500">Nenhuma conta bancária cadastrada.</Card>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {contasList.map((conta) => <ContaCard key={conta.id} conta={conta} />)}
          </div>
        </TabsContent>
      </Tabs>

      <IdentificarDialog movto={identificar} onClose={() => setIdentificar(null)} />
    </div>
  );
}

function MovimentoLinha({ m, onIdentificar }: { m: MovimentoConciliado; onIdentificar?: () => void }) {
  const ehDebito = m.debitoCredito === 'D';
  return (
    <Card className="p-3 sm:p-4">
      <div className="flex items-start gap-3 flex-wrap">
        {/* Lançamento do banco */}
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-mono">{dataFmt(m.dataMovto)}</span>
            <Wallet className="h-3 w-3 text-gray-400" />
            <span className="text-xs font-medium text-pioneira-700 dark:text-yellow-400 truncate" title={`${nomeBanco(m.codBanco)} · ag ${m.codAgencia} cc ${m.codContaBco}`}>
              {m.contaNome ?? nomeBanco(m.codBanco)}
            </span>
          </div>
          <p className="text-sm font-medium mt-0.5 truncate" title={m.histMovtoBco ?? m.descHistoBco ?? ''}>
            {m.descHistoBco ?? m.histMovtoBco ?? '—'}
            {m.docMovtoBco && <span className="text-gray-400 font-mono text-xs ml-1">{m.docMovtoBco}</span>}
          </p>
          <p className={cn('text-base font-mono font-bold mt-0.5', ehDebito ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400')}>
            {ehDebito ? '-' : '+'} {moeda(Math.abs(m.valorCents))}
          </p>
        </div>

        {/* Título(s) ligados: pelo Globus (cod_movto_bco) e/ou pela identificação manual */}
        <div className="flex-1 min-w-[220px] border-l-2 border-gray-100 dark:border-gray-800 pl-3">
          {m.titulos.length > 0 ? (
            <>
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1 flex items-center gap-1 flex-wrap">
                <ArrowRight className="h-3 w-3" />
                {(() => {
                  const soReceber = m.titulos.every((t) => t.tipo === 'cr');
                  const soPagar = m.titulos.every((t) => t.tipo === 'cp');
                  const rotulo = soReceber ? 'a receber' : soPagar ? 'a pagar' : '(a pagar/receber)';
                  return m.titulos.length > 1 ? `${m.titulos.length} contas ${rotulo}` : `Conta ${rotulo}`;
                })()}
                {m.vinculoManual && (
                  <Badge variant="muted" className="text-[8px] ml-1 inline-flex items-center gap-0.5">
                    <Link2 className="h-2.5 w-2.5" /> ligado por você
                  </Badge>
                )}
              </div>
              <div className="space-y-1">
                {m.titulos.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1 min-w-0">
                      <Building2 className="h-3 w-3 text-gray-400 shrink-0" />
                      <span className="truncate">{t.fornecedorRazaoSocial ?? <span className="italic text-gray-400">sem fornecedor</span>}</span>
                      {t.numeroDocumento && <span className="text-gray-400 font-mono shrink-0">· {t.numeroDocumento}</span>}
                    </span>
                    <span className="font-mono shrink-0">{moeda(t.valorCents)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : m.conciliadoGlobus ? (
            <div className="text-xs text-gray-500 italic flex items-center gap-1.5 h-full">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              Identificado no Globus (sem detalhe do título)
            </div>
          ) : (
            <div className="flex flex-col items-start gap-1.5 h-full justify-center">
              <span className="text-xs text-amber-700 dark:text-amber-400 italic flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Não identificado pelo Globus
              </span>
              {onIdentificar && (
                <Button size="sm" variant="outline" onClick={onIdentificar} className="h-7">
                  <Link2 className="h-3.5 w-3.5 mr-1" /> Identificar manualmente
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Diálogo de identificação MANUAL: dado um lançamento que o Globus não
 * conciliou, busca candidatos (CP/CR) por valor/data próximos ou por texto, e
 * vincula o que o operador escolher. A ligação entra como conciliação confirmada
 * (decisão humana, registrada em auditoria). Optimistic não — invalida no sucesso
 * (a lista precisa remover o item e o dashboard recontar).
 */
function IdentificarDialog({ movto, onClose }: { movto: MovimentoConciliado | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [qAtivo, setQAtivo] = useState('');

  // Reseta a busca quando abre num movto novo.
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

  const vincular = useMutation<unknown, unknown, TituloCandidato>({
    mutationFn: async (t) =>
      (await api.post('/api/conciliacao/manual', {
        bancoMovtoId: movtoId,
        tipo: t.tipo,
        tituloId: t.id,
      })).data,
    onSuccess: (_data, t) => {
      toast.success('Lançamento identificado', {
        description: `Ligado a ${t.tipo === 'cp' ? 'conta a pagar' : 'conta a receber'} ${t.numeroDocumento ?? ''}`.trim(),
      });
      qc.invalidateQueries({ queryKey: ['conciliacao'] });
      onClose();
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const lista = candidatos.data?.candidatos ?? [];

  return (
    <Dialog open={!!movto} onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-pioneira-700 dark:text-yellow-400" />
            Identificar lançamento
          </DialogTitle>
          <DialogDescription>
            Escolha a conta (a pagar ou a receber) que corresponde a este valor do banco. Como o extrato do Globus
            não diz se é entrada ou saída, mostramos os dois lados — você julga.
          </DialogDescription>
        </DialogHeader>

        {movto && (
          <div className="rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-2 text-sm">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-0.5">Veio do banco</div>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{movto.descHistoBco ?? movto.histMovtoBco ?? 'Lançamento'}</div>
                <div className="text-[11px] text-gray-500 font-mono">
                  {movto.contaNome ?? nomeBanco(movto.codBanco)} · ag {movto.codAgencia}/{movto.codContaBco} · {dataFmt(movto.dataMovto)}
                </div>
              </div>
              <div className="font-mono font-bold text-base shrink-0">{moeda(Math.abs(movto.valorCents))}</div>
            </div>
          </div>
        )}

        <form onSubmit={(e) => { e.preventDefault(); setQAtivo(q.trim()); }} className="flex gap-2">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por fornecedor/cliente ou nº do documento..."
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="outline" size="sm">Buscar</Button>
          {qAtivo && (
            <Button type="button" variant="ghost" size="sm" onClick={() => { setQ(''); setQAtivo(''); }}>Limpar</Button>
          )}
        </form>

        <div className="text-[11px] text-gray-500">
          {qAtivo
            ? `Resultados para "${qAtivo}".`
            : 'Mostrando contas com valor (±10%) e data (±30d) parecidos. Use a busca para achar uma conta específica.'}
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
            <CandidatoLinha
              key={`${t.tipo}-${t.id}`}
              t={t}
              onVincular={() => vincular.mutate(t)}
              loading={vincular.isPending}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CandidatoLinha({ t, onVincular, loading }: { t: TituloCandidato; onVincular: () => void; loading: boolean }) {
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
      <Button size="sm" variant="outline" onClick={onVincular} disabled={loading} className="h-7 shrink-0">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Link2 className="h-3.5 w-3.5 mr-1" /> Ligar</>}
      </Button>
    </div>
  );
}
