'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertOctagon, AlertTriangle, ArrowLeft, Calendar, CheckCircle2, Info, Loader2, Search, ShieldAlert, Undo2,
} from 'lucide-react';
import type {
  CandidatoNegativacao,
  CandidatosResponse,
  ConsultasListResponse,
  NegativacoesListResponse,
  NegativarBody,
  SerasaConsultaResponse,
  SerasaNegativacaoResponse,
} from '@pioneira/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, extrairMensagemErro } from '@/lib/api';
import { cn } from '@/lib/utils';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function dataFmt(d: string | null): string {
  if (!d) return '-';
  return format(new Date(`${d}T00:00:00`), 'dd/MM/yyyy');
}
function dataHoraFmt(d: string): string {
  return format(new Date(d), 'dd/MM/yyyy HH:mm');
}

const CLASSIF_BADGE: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'muted' }> = {
  baixo_risco: { label: 'Baixo risco', variant: 'success' },
  medio_risco: { label: 'Medio risco', variant: 'warning' },
  alto_risco: { label: 'Alto risco', variant: 'danger' },
  sem_dados: { label: 'Sem dados', variant: 'muted' },
};

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'muted' }> = {
  enviado: { label: 'Enviado', variant: 'warning' },
  efetivado: { label: 'Efetivado', variant: 'danger' },
  baixado: { label: 'Baixado', variant: 'success' },
  recusado: { label: 'Recusado', variant: 'muted' },
};

export default function SerasaPage() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<'candidatos' | 'negativacoes' | 'consultas'>('candidatos');
  const [negativando, setNegativando] = useState<CandidatoNegativacao | null>(null);
  const [motivo, setMotivo] = useState('');

  const candidatos = useQuery<CandidatosResponse>({
    queryKey: ['serasa', 'candidatos'],
    queryFn: async () => (await api.get<CandidatosResponse>('/api/serasa/candidatos')).data,
  });

  const negativacoes = useQuery<NegativacoesListResponse>({
    queryKey: ['serasa', 'negativacoes'],
    queryFn: async () => (await api.get<NegativacoesListResponse>('/api/serasa/negativacoes')).data,
  });

  const consultas = useQuery<ConsultasListResponse>({
    queryKey: ['serasa', 'consultas'],
    queryFn: async () => (await api.get<ConsultasListResponse>('/api/serasa/consultas')).data,
  });

  const negativar = useMutation<SerasaNegativacaoResponse, unknown, NegativarBody>({
    mutationFn: async (body) => (await api.post<SerasaNegativacaoResponse>('/api/serasa/negativar', body)).data,
    onSuccess: () => {
      toast.success('Negativacao registrada (MOCK)');
      qc.invalidateQueries({ queryKey: ['serasa'] });
      setNegativando(null);
      setMotivo('');
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const baixar = useMutation<SerasaNegativacaoResponse, unknown, string>({
    mutationFn: async (id) => (await api.post<SerasaNegativacaoResponse>(`/api/serasa/baixar/${id}`)).data,
    onSuccess: () => {
      toast.success('Negativacao baixada');
      qc.invalidateQueries({ queryKey: ['serasa', 'negativacoes'] });
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const consultarCliente = useMutation<SerasaConsultaResponse, unknown, string>({
    mutationFn: async (clienteId) =>
      (await api.post<SerasaConsultaResponse>('/api/serasa/consultar', { clienteId })).data,
    onSuccess: (r) => {
      toast.success(
        `Score: ${r.score ?? '-'} (${CLASSIF_BADGE[r.classificacao]?.label ?? r.classificacao})`,
        { description: r.temRestricao ? `${r.qtdRestricoes} restricao(oes) — ${moeda(r.valorRestricoesCents)}` : 'Sem restricoes' },
      );
      qc.invalidateQueries({ queryKey: ['serasa', 'consultas'] });
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  function confirmarNegativar() {
    if (!negativando) return;
    if (motivo.trim().length < 5) {
      toast.error('Justifique a negativacao (min 5 caracteres)');
      return;
    }
    negativar.mutate({ contaReceberId: negativando.contaReceberId, motivo: motivo.trim() });
  }

  const candList = candidatos.data?.itens ?? [];
  const negList = negativacoes.data?.itens ?? [];
  const consList = consultas.data?.itens ?? [];

  return (
    <div className="space-y-6">
      <Link href="/contas-receber" className="text-pioneira-700 dark:text-yellow-400 hover:underline inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="h-3 w-3" /> Voltar pra Contas a Receber
      </Link>

      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent flex items-center gap-3">
          <ShieldAlert className="h-7 w-7 text-pioneira-700 dark:text-yellow-400" />
          SERASA
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Negativacao de inadimplentes + consulta de score.
        </p>
      </div>

      <Card className="p-4 border-l-4 border-l-amber-400 bg-amber-50/40 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700 dark:text-gray-200">
            <strong className="text-amber-800 dark:text-amber-200">Versao em validacao com financeiro:</strong>{' '}
            modo MOCK — consultas geram score deterministico por CNPJ (mesmo CNPJ = mesma resposta sempre).
            Negativacoes sao apenas registradas no banco; NENHUMA chamada feita ao SERASA real.
            Quando contrato + credenciais forem confirmados, substituimos por adapter real.
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Candidatos</p>
          <p className="text-3xl font-bold mt-1">{candList.length}</p>
          <p className="text-[10px] text-gray-500 mt-1">vencidos &gt;30d sem negativacao</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Ativas</p>
          <p className="text-3xl font-bold mt-1 text-red-700 dark:text-red-400">
            {negList.filter((n) => n.status === 'enviado' || n.status === 'efetivado').length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Baixadas</p>
          <p className="text-3xl font-bold mt-1 text-emerald-700 dark:text-emerald-400">
            {negList.filter((n) => n.status === 'baixado').length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Consultas</p>
          <p className="text-3xl font-bold mt-1">{consList.length}</p>
        </Card>
      </div>

      <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)}>
        <TabsList>
          <TabsTrigger value="candidatos" icon={<AlertOctagon className="h-3.5 w-3.5" />}>
            Candidatos ({candList.length})
          </TabsTrigger>
          <TabsTrigger value="negativacoes" icon={<ShieldAlert className="h-3.5 w-3.5" />}>
            Negativacoes ({negList.length})
          </TabsTrigger>
          <TabsTrigger value="consultas" icon={<Search className="h-3.5 w-3.5" />}>
            Consultas ({consList.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="candidatos" className="space-y-2">
          {candidatos.isLoading && <Card className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></Card>}
          {!candidatos.isLoading && candList.length === 0 && (
            <Card className="p-10 text-center space-y-3">
              <CheckCircle2 className="h-10 w-10 mx-auto text-emerald-600" />
              <h3 className="text-lg font-semibold">Sem candidatos a negativacao</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Nenhum CR aberto/renegociado venceu ha mais de 30 dias sem negativacao ativa.
              </p>
            </Card>
          )}
          {candList.map((c: CandidatoNegativacao) => (
            <Card key={c.contaReceberId} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1 space-y-1">
                  <strong className="text-sm">
                    {c.cliente?.razaoSocial ?? <span className="italic text-gray-400">sem cliente</span>}
                  </strong>
                  <div className="text-[11px] text-gray-500 font-mono">
                    {c.numeroDocumento ?? '-'}
                    {c.cliente?.cnpjCpf ? ` · ${c.cliente.cnpjCpf}` : ''}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Venc. {dataFmt(c.dataVencimento)}
                    </span>
                    <span className="font-bold text-red-700 dark:text-red-400">{c.diasVencidos}d vencido(s)</span>
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <div className="text-xl font-bold font-mono text-red-700 dark:text-red-400">
                    {moeda(c.valorCents)}
                  </div>
                  <div className="flex gap-2 justify-end">
                    {c.cliente && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => consultarCliente.mutate(c.cliente!.id)}
                        disabled={consultarCliente.isPending}
                      >
                        <Search className="h-3.5 w-3.5 mr-1" /> Consultar score
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => setNegativando(c)}
                      className="bg-red-700 hover:bg-red-800 text-white"
                    >
                      <ShieldAlert className="h-3.5 w-3.5 mr-1" /> Negativar
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="negativacoes" className="space-y-2">
          {negList.length === 0 && !negativacoes.isLoading && (
            <Card className="p-10 text-center text-sm text-gray-500">Nenhuma negativacao registrada.</Card>
          )}
          {negList.map((n: SerasaNegativacaoResponse) => (
            <Card key={n.id} className="p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <strong className="text-sm">{n.clienteRazaoSocial ?? '-'}</strong>
                    <Badge variant={STATUS_BADGE[n.status]?.variant ?? 'muted'} className="text-[9px]">
                      {STATUS_BADGE[n.status]?.label ?? n.status}
                    </Badge>
                    <Badge variant="warning" className="text-[9px]">{n.modo}</Badge>
                  </div>
                  <div className="text-[11px] text-gray-500 font-mono">
                    CR {n.numeroDocumentoCr ?? '-'} · protocolo {n.protocoloSerasa}
                  </div>
                  <p className="text-xs mt-1 italic text-gray-600 dark:text-gray-300">&quot;{n.motivo}&quot;</p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Enviado {dataHoraFmt(n.enviadoEm)}
                    {n.baixadoEm && ` · baixado ${dataHoraFmt(n.baixadoEm)}`}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold font-mono">{moeda(n.valorCents)}</div>
                  {n.status !== 'baixado' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => baixar.mutate(n.id)}
                      disabled={baixar.isPending}
                      className="mt-1"
                    >
                      <Undo2 className="h-3.5 w-3.5 mr-1" /> Baixar
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="consultas" className="space-y-2">
          {consList.length === 0 && !consultas.isLoading && (
            <Card className="p-10 text-center text-sm text-gray-500">
              Nenhuma consulta feita ainda. Clique em &quot;Consultar score&quot; em um candidato.
            </Card>
          )}
          {consList.map((c: SerasaConsultaResponse) => {
            const classif = CLASSIF_BADGE[c.classificacao];
            return (
              <Card key={c.id} className="p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <strong className="text-sm">{c.clienteRazaoSocial ?? '-'}</strong>
                      {classif && <Badge variant={classif.variant} className="text-[9px]">{classif.label}</Badge>}
                      {c.temRestricao && <Badge variant="danger" className="text-[9px]">RESTRICAO</Badge>}
                    </div>
                    <div className="text-[11px] text-gray-500 font-mono">{c.cnpjCpf ?? '-'}</div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">{c.observacao}</p>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      'text-2xl font-bold',
                      c.classificacao === 'baixo_risco' ? 'text-emerald-700' :
                      c.classificacao === 'medio_risco' ? 'text-amber-700' :
                      c.classificacao === 'alto_risco' ? 'text-red-700' : 'text-gray-500',
                    )}>
                      {c.score ?? '-'}
                    </div>
                    <p className="text-[10px] text-gray-500">{dataHoraFmt(c.consultadoEm)}</p>
                  </div>
                </div>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      {/* Modal negativar */}
      {negativando && (
        <Dialog open onOpenChange={(o) => !o && setNegativando(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                Negativar no SERASA
              </DialogTitle>
              <DialogDescription>
                {negativando.cliente?.razaoSocial ?? '-'} · {moeda(negativando.valorCents)} ·{' '}
                {negativando.diasVencidos}d vencidos
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                Esta acao registrara a intencao de negativacao no SERASA. Em modo MOCK nenhuma chamada externa
                eh feita — apenas log auditavel no banco.
              </p>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1 block">
                  Motivo (obrigatorio) <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="w-full text-sm rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-2"
                  placeholder="Ex: inadimplencia ha 45 dias, 3 cobrancas sem resposta, contato perdido..."
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" size="sm" onClick={() => setNegativando(null)} disabled={negativar.isPending}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={confirmarNegativar}
                disabled={negativar.isPending}
                className="bg-red-700 hover:bg-red-800 text-white"
              >
                {negativar.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Confirmar negativacao
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
