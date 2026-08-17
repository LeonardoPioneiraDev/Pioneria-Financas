'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RefreshCw, Loader2, Save, Play, Clock, CalendarClock, CheckCircle2, XCircle } from 'lucide-react';
import type { SyncAgendamentoItem, SyncAgendamentoListaResponse, SyncExecutarResponse, SyncFrequencia } from '@pioneira/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { api, extrairMensagemErro } from '@/lib/api';

function dataHora(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return <span className="text-xs text-gray-400">nunca rodou</span>;
  const ok = status === 'ok';
  const parcial = status === 'parcial';
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', ok ? 'text-emerald-600 dark:text-emerald-400' : parcial ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {status}
    </span>
  );
}

function RecursoRow({ item, onChanged }: { item: SyncAgendamentoItem; onChanged: () => void }) {
  const [habilitado, setHabilitado] = useState(item.habilitado);
  const [frequencia, setFrequencia] = useState<SyncFrequencia>(item.frequencia);
  const [horaDia, setHoraDia] = useState(item.horaDia ?? 6);
  const [minutoDia, setMinutoDia] = useState(item.minutoDia ?? 0);
  const [horas, setHoras] = useState(Math.max(1, Math.round((item.intervaloMin ?? 360) / 60)));

  // Ressincroniza o estado local quando o servidor devolve dados novos.
  useEffect(() => {
    setHabilitado(item.habilitado);
    setFrequencia(item.frequencia);
    setHoraDia(item.horaDia ?? 6);
    setMinutoDia(item.minutoDia ?? 0);
    setHoras(Math.max(1, Math.round((item.intervaloMin ?? 360) / 60)));
  }, [item]);

  const salvar = useMutation({
    mutationFn: async () => {
      const body = {
        habilitado,
        frequencia,
        intervaloMin: frequencia === 'intervalo' ? horas * 60 : null,
        horaDia: frequencia === 'diario' ? horaDia : null,
        minutoDia,
      };
      await api.put(`/api/admin/sync-agendamento/${item.recurso}`, body);
    },
    onSuccess: () => {
      toast.success(`Agendamento de ${item.label} salvo.`);
      onChanged();
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const executar = useMutation({
    mutationFn: async () => {
      const res = await api.post<SyncExecutarResponse>(`/api/admin/sync-agendamento/${item.recurso}/executar`);
      return res.data;
    },
    onSuccess: (r) => {
      if (r.status === 'erro') toast.error(`${item.label}: ${r.mensagem ?? 'falha'}`);
      else toast.success(`${item.label} sincronizado (${r.status}).`);
      onChanged();
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{item.label}</h3>
            {item.habilitado ? <Badge variant="success">automático</Badge> : <Badge variant="muted">manual</Badge>}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> último: {dataHora(item.ultimoRunEm)} <StatusBadge status={item.ultimoStatus} />
            </span>
            {item.habilitado && (
              <span className="flex items-center gap-1">
                <CalendarClock className="h-3 w-3" /> próximo: {dataHora(item.proximoRunEm)}
              </span>
            )}
          </div>
          {item.ultimaMensagem && <p className="mt-1 max-w-xl text-[11px] text-gray-400">{item.ultimaMensagem}</p>}
        </div>
        <Button onClick={() => executar.mutate()} disabled={executar.isPending} variant="ghost" size="sm">
          {executar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          <span className="ml-2">Rodar agora</span>
        </Button>
      </div>

      {/* Configuração */}
      <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3 dark:border-gray-800">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={habilitado} onChange={(e) => setHabilitado(e.target.checked)} className="h-4 w-4" />
          Sincronizar automaticamente
        </label>

        {habilitado && (
          <>
            <select value={frequencia} onChange={(e) => setFrequencia(e.target.value as SyncFrequencia)} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-sm dark:border-gray-700 dark:bg-gray-900">
              <option value="diario">Todo dia às</option>
              <option value="intervalo">A cada</option>
            </select>

            {frequencia === 'diario' ? (
              <div className="flex items-center gap-1 text-sm">
                <input type="number" min={0} max={23} value={horaDia} onChange={(e) => setHoraDia(Math.min(23, Math.max(0, Number(e.target.value))))} className="w-14 rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900" />
                :
                <input type="number" min={0} max={59} value={minutoDia} onChange={(e) => setMinutoDia(Math.min(59, Math.max(0, Number(e.target.value))))} className="w-14 rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900" />
                <span className="text-gray-400">(Brasília)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-sm">
                <input type="number" min={1} max={24} value={horas} onChange={(e) => setHoras(Math.min(24, Math.max(1, Number(e.target.value))))} className="w-16 rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900" />
                <span className="text-gray-400">hora(s)</span>
              </div>
            )}
          </>
        )}

        <Button onClick={() => salvar.mutate()} disabled={salvar.isPending} variant="outline" size="sm" className="ml-auto">
          {salvar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="ml-2">Salvar</span>
        </Button>
      </div>
    </Card>
  );
}

export default function SincronismoPage() {
  const qc = useQueryClient();
  const q = useQuery<SyncAgendamentoListaResponse>({
    queryKey: ['sync-agendamento'],
    queryFn: async () => (await api.get<SyncAgendamentoListaResponse>('/api/admin/sync-agendamento')).data,
    refetchInterval: 30_000,
  });
  const invalidar = () => void qc.invalidateQueries({ queryKey: ['sync-agendamento'] });

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <RefreshCw className="h-6 w-6 text-gray-400" />
            Sincronismo
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Configure o sincronismo automático de cada integração — ligar/desligar e a frequência (diário num horário ou
            a cada N horas). O agendador roda no próprio sistema e respeita o horário de Brasília.
          </p>
        </div>
        <Button onClick={() => q.refetch()} disabled={q.isFetching} variant="outline" size="sm">
          {q.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2 hidden sm:inline">Atualizar</span>
        </Button>
      </div>

      {q.isLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {q.data && (
        <div className="space-y-3">
          {q.data.itens.map((item) => (
            <RecursoRow key={item.recurso} item={item} onChanged={invalidar} />
          ))}
          <p className="text-xs text-gray-400">
            A Folha ainda não está aqui — exige período e entra numa próxima etapa com um padrão de competência. Por ora,
            segue no botão “Sincronizar” da própria tela.
          </p>
        </div>
      )}
    </div>
  );
}
