'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, MessageSquare, Paperclip, X } from 'lucide-react';
import type { WorkflowEventoResponse, WorkflowTimelineResponse } from '@pioneira/shared';
import { api } from '@/lib/api';
import { formatarDataHora } from '@/lib/datetime';
import { ACAO_LABEL, getCorEtapa, getIconeEtapa } from '@/lib/workflow';
import { cn } from '@/lib/utils';

interface TimelineProps {
  /** Tipo do documento (ex.: 'conta_pagar', 'conta_receber', 'nota_fiscal_entrada'). */
  documentoTipo: string;
  /** ID do documento (UUID ou string). */
  documentoId: string;
  /** Renderiza versao compacta (sem comentarios). */
  compacto?: boolean;
}

export function Timeline({ documentoTipo, documentoId, compacto = false }: TimelineProps) {
  const { data, isLoading, isError, error } = useQuery<WorkflowTimelineResponse | null>({
    queryKey: ['workflow', documentoTipo, documentoId],
    queryFn: async () => {
      const res = await api.get<WorkflowTimelineResponse>(
        `/api/workflow/by-documento/${encodeURIComponent(documentoTipo)}/${encodeURIComponent(documentoId)}`,
        { validateStatus: (s) => s === 200 || s === 404 },
      );
      if (res.status === 404) return null;
      return res.data;
    },
  });

  const eventosPorEtapa = useMemo(() => {
    const mapa = new Map<string, WorkflowEventoResponse[]>();
    if (!data) return mapa;
    for (const ev of data.eventos) {
      const existing = mapa.get(ev.etapaChave) ?? [];
      existing.push(ev);
      mapa.set(ev.etapaChave, existing);
    }
    return mapa;
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Carregando timeline...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
        <AlertCircle className="h-4 w-4" />
        <span>{(error as Error)?.message ?? 'Falha ao carregar timeline'}</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-gray-50/50 p-4 text-center text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-400">
        Sem workflow associado a este documento.
      </div>
    );
  }

  const { instance, template, eventos } = data;
  const etapas = template.etapas;
  const idxAtual = instance.etapaAtualIdx;
  const concluido = instance.status === 'concluido';
  const cancelado = instance.status === 'cancelado';

  const eventosForaDeEtapa = eventos.filter(
    (e) => e.acao === 'comentou' || e.acao === 'anexou' || e.acao === 'atribuiu' || e.acao === 'cancelou' || e.acao === 'retomou',
  );

  return (
    <div className="space-y-4">
      {/* Cabecalho: status do workflow */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500 dark:text-gray-400">Workflow:</span>
        <span className="font-medium text-gray-900 dark:text-gray-100">{template.nome}</span>
        <StatusBadge status={instance.status} />
      </div>

      {/* Linha do tempo das etapas */}
      <ol className="relative space-y-0">
        {etapas.map((etapa, idx) => {
          const passada = concluido || idx < idxAtual;
          const atual = !concluido && !cancelado && idx === idxAtual;
          const futura = !concluido && idx > idxAtual;
          const cor = passada
            ? getCorEtapa('emerald')
            : atual
              ? getCorEtapa(etapa.cor ?? 'amber')
              : getCorEtapa('gray');
          const Icone = getIconeEtapa(etapa.icone);
          const evs = eventosPorEtapa.get(etapa.chave) ?? [];
          const ultimoEv = evs.length > 0 ? evs[evs.length - 1] : null;
          const ehUltima = idx === etapas.length - 1;

          return (
            <li key={etapa.chave} className="relative flex gap-3 pb-5 last:pb-0">
              {/* Linha vertical (so se nao for o ultimo item) */}
              {!ehUltima && (
                <span
                  className={cn(
                    'absolute left-[15px] top-9 h-[calc(100%-1rem)] w-px',
                    passada ? 'bg-emerald-300 dark:bg-emerald-600' : 'bg-gray-200 dark:bg-gray-700',
                  )}
                  aria-hidden
                />
              )}

              {/* Bullet com icone */}
              <div
                className={cn(
                  'relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2',
                  cor.bg,
                  cor.border,
                  atual && `ring-4 ${cor.ring}`,
                )}
              >
                <Icone className={cn('h-4 w-4', cor.text)} />
              </div>

              {/* Conteudo */}
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={cn('text-sm font-medium', cor.text)}>{etapa.nome}</span>
                  {atual && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                      etapa atual
                    </span>
                  )}
                  {passada && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                      concluida
                    </span>
                  )}
                </div>
                {etapa.descricao && !compacto && (
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{etapa.descricao}</p>
                )}
                {ultimoEv && !compacto && (
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    <span className="font-medium">{ultimoEv.usuario?.nome ?? 'Sistema'}</span>{' '}
                    {ACAO_LABEL[ultimoEv.acao] ?? ultimoEv.acao}{' '}
                    em <span className="font-mono">{formatarDataHora(ultimoEv.criadoEm)}</span>
                  </p>
                )}
                {futura && !compacto && etapa.papelResponsavel && (
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Responsavel: <span className="font-medium">{etapa.papelResponsavel}</span>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Comentarios / anexos / outras acoes (fora da timeline principal) */}
      {!compacto && eventosForaDeEtapa.length > 0 && (
        <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-900/30">
          <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Atividade
          </h4>
          <ul className="space-y-2">
            {eventosForaDeEtapa.map((ev) => (
              <li key={ev.id} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-gray-500 ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700">
                  {ev.acao === 'cancelou' || ev.acao === 'retomou' ? (
                    <X className="h-3 w-3" />
                  ) : ev.anexoUrl ? (
                    <Paperclip className="h-3 w-3" />
                  ) : (
                    <MessageSquare className="h-3 w-3" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-gray-700 dark:text-gray-200">
                    <span className="font-medium">{ev.usuario?.nome ?? 'Sistema'}</span>{' '}
                    <span className="text-gray-500 dark:text-gray-400">
                      {ACAO_LABEL[ev.acao] ?? ev.acao} - {formatarDataHora(ev.criadoEm)}
                    </span>
                  </p>
                  {ev.comentario && (
                    <p className="mt-0.5 whitespace-pre-wrap text-gray-600 dark:text-gray-300">{ev.comentario}</p>
                  )}
                  {ev.anexoUrl && (
                    <a
                      href={ev.anexoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1 text-pioneira-700 hover:underline dark:text-pioneira-300"
                    >
                      <Paperclip className="h-3 w-3" />
                      {ev.anexoNome ?? 'Anexo'}
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; classes: string }> = {
    em_andamento: {
      label: 'Em andamento',
      classes: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    },
    concluido: {
      label: 'Concluido',
      classes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    },
    cancelado: {
      label: 'Cancelado',
      classes: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
    },
    bloqueado: {
      label: 'Bloqueado',
      classes: 'bg-gray-200 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
    },
  };
  const cfg = map[status] ?? map.em_andamento!;
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', cfg.classes)}>
      {cfg.label}
    </span>
  );
}
