'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertCircle, ChevronDown, ChevronUp, Info, Loader2, User } from 'lucide-react';
import type { WorkflowInferenciaResponse, WorkflowInferenciaEstado } from '@pioneira/shared';
import { api } from '@/lib/api';
import { getCorEtapa, getIconeEtapa } from '@/lib/workflow';
import { cn } from '@/lib/utils';

function dataHoraFmt(d: string | null): string {
  if (!d) return '';
  return format(new Date(d), 'dd/MM/yyyy HH:mm');
}

/**
 * Timeline read-only do workflow inferido a partir do estado do documento.
 *
 * NAO permite avancar etapa — o estado e derivado dos campos do documento
 * (quitado, dataPagamento, status etc.) e atualiza automaticamente quando
 * a fonte (Globus) muda.
 *
 * Renderiza cada etapa do template com um estado:
 *  - passada (verde) — concluida segundo os dados
 *  - atual (cor da etapa, com anel) — onde o documento esta agora
 *  - pulada (cinza claro) — etapa sem registro no Globus (não prova que não ocorreu;
 *    pode ter acontecido no APROVE-ME e não ter sido espelhado de volta)
 *  - futura (cinza) — ainda nao alcancada
 */
interface WorkflowInferidoProps {
  documentoTipo: string;
  documentoId: string;
  /** Se true, oculta o accordion de sinais detectados (visao compacta). */
  compacto?: boolean;
}

export function WorkflowInferido({ documentoTipo, documentoId, compacto = false }: WorkflowInferidoProps) {
  const [sinaisAbertos, setSinaisAbertos] = useState(false);

  const { data, isLoading, isError, error } = useQuery<WorkflowInferenciaResponse>({
    queryKey: ['workflow-inferir', documentoTipo, documentoId],
    queryFn: async () => {
      const res = await api.get<WorkflowInferenciaResponse>('/api/workflow/inferir', {
        params: { documentoTipo, documentoId },
      });
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Inferindo etapa do documento...</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
        <AlertCircle className="h-4 w-4" />
        <span>{(error as Error)?.message ?? 'Falha ao inferir workflow'}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cabecalho: template + status */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500 dark:text-gray-400">Workflow:</span>
        <span className="font-medium text-gray-900 dark:text-gray-100">{data.template.nome}</span>
        <StatusBadge status={data.status} />
        <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
          inferido automaticamente
        </span>
      </div>

      {/* Linha do tempo das etapas */}
      <ol className="relative space-y-0">
        {data.etapas.map((etapa, idx) => {
          const ehUltima = idx === data.etapas.length - 1;
          const cor = corPorEstado(etapa.estado, etapa.cor);
          const Icone = getIconeEtapa(etapa.icone);

          return (
            <li key={etapa.chave} className="relative flex gap-3 pb-5 last:pb-0">
              {/* Linha vertical */}
              {!ehUltima && (
                <span
                  className={cn(
                    'absolute left-[15px] top-9 h-[calc(100%-1rem)] w-px',
                    etapa.estado === 'passada'
                      ? 'bg-emerald-300 dark:bg-emerald-600'
                      : 'bg-gray-200 dark:bg-gray-700',
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
                  etapa.estado === 'atual' && `ring-4 ${cor.ring}`,
                )}
              >
                <Icone className={cn('h-4 w-4', cor.text)} />
              </div>

              {/* Conteudo */}
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className={cn('text-sm font-medium', cor.text)}>{etapa.nome}</span>
                  <EstadoBadge estado={etapa.estado} />
                </div>
                {etapa.descricao && (
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{etapa.descricao}</p>
                )}
                {etapa.auditoria ? (
                  etapa.auditoria.usuario ? (
                    <>
                      <p className="mt-1 text-xs flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
                        <User className="h-3 w-3" />
                        por <span className="font-mono font-semibold">{etapa.auditoria.usuario}</span>
                        {etapa.auditoria.data && (
                          <span className="text-gray-500 dark:text-gray-400 ml-1 font-normal">
                            em {dataHoraFmt(etapa.auditoria.data)}
                          </span>
                        )}
                      </p>
                      {etapa.auditoria.usuariosSecundarios && etapa.auditoria.usuariosSecundarios.length > 0 && (
                        <p className="mt-0.5 ml-4 text-[11px] text-emerald-700 dark:text-emerald-400">
                          + tambem:{' '}
                          {etapa.auditoria.usuariosSecundarios.map((u, i) => (
                            <span key={u}>
                              {i > 0 && ', '}
                              <span className="font-mono font-semibold">{u}</span>
                            </span>
                          ))}
                        </p>
                      )}
                    </>
                  ) : etapa.auditoria.nota ? (
                    // Sem usuario rastreavel, mas com algo honesto a dizer (ex: baixa
                    // com data mas sem executor no Globus). NUNCA exibir um nome chutado.
                    <p className="mt-1 text-xs flex items-start gap-1.5 text-gray-500 dark:text-gray-400">
                      <Info className="h-3 w-3 mt-0.5 shrink-0" />
                      <span>{etapa.auditoria.nota}</span>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                      <User className="h-3 w-3" />
                      <span className="italic">usuario nao registrado</span>
                      {etapa.auditoria.data && (
                        <span className="ml-1 font-normal">em {dataHoraFmt(etapa.auditoria.data)}</span>
                      )}
                    </p>
                  )
                ) : (etapa.estado === 'passada' || etapa.estado === 'pulada') ? (
                  <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500 italic">
                    {etapa.estado === 'pulada'
                      ? 'sem registro desta etapa no Globus — pode ter ocorrido no APROVE-ME e nao ter sido espelhado'
                      : 'sem rastro do Globus (inferido pelo estado)'}
                  </p>
                ) : null}
                {etapa.papelResponsavel && (etapa.estado === 'atual' || etapa.estado === 'futura') && (
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    Responsavel: <span className="font-medium">{etapa.papelResponsavel}</span>
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Resumo "proxima etapa" */}
      {data.proximaEtapa && data.status === 'em_andamento' && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs dark:border-blue-900/40 dark:bg-blue-950/30">
          <span className="font-medium text-blue-800 dark:text-blue-200">Proxima etapa:</span>{' '}
          <span className="text-blue-700 dark:text-blue-300">{data.proximaEtapa.nome}</span>
          <span className="ml-2 text-blue-500 dark:text-blue-400">
            (vai mudar automaticamente quando o documento avancar no Globus)
          </span>
        </div>
      )}

      {/* Sinais detectados — accordion */}
      {!compacto && Object.keys(data.sinais).length > 0 && (
        <details
          open={sinaisAbertos}
          className="rounded-md border border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/30"
        >
          <summary
            className="cursor-pointer select-none px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            onClick={(e) => {
              e.preventDefault();
              setSinaisAbertos(!sinaisAbertos);
            }}
          >
            <span className="inline-flex items-center gap-1">
              {sinaisAbertos ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Sinais detectados ({Object.keys(data.sinais).length})
            </span>
          </summary>
          {sinaisAbertos && (
            <dl className="grid grid-cols-1 gap-1 px-3 pb-3 text-xs sm:grid-cols-2">
              {Object.entries(data.sinais).map(([chave, valor]) => (
                <div key={chave} className="flex items-baseline gap-2 border-t border-gray-200 pt-1 dark:border-gray-700">
                  <dt className="font-mono text-gray-500 dark:text-gray-400">{chave}:</dt>
                  <dd className="text-gray-700 dark:text-gray-200">{formatarSinal(valor)}</dd>
                </div>
              ))}
            </dl>
          )}
        </details>
      )}
    </div>
  );
}

function formatarSinal(valor: unknown): string {
  if (valor === null || valor === undefined) return '—';
  if (typeof valor === 'boolean') return valor ? 'sim' : 'nao';
  if (typeof valor === 'string') return valor.length > 0 ? valor : '—';
  if (typeof valor === 'number') return String(valor);
  return JSON.stringify(valor);
}

function corPorEstado(
  estado: WorkflowInferenciaEstado,
  corOriginalEtapa: string | null,
): ReturnType<typeof getCorEtapa> {
  switch (estado) {
    case 'passada':
      return getCorEtapa('emerald');
    case 'atual':
      return getCorEtapa(corOriginalEtapa ?? 'amber');
    case 'pulada':
      return getCorEtapa('gray');
    case 'futura':
    default:
      return getCorEtapa('gray');
  }
}

function EstadoBadge({ estado }: { estado: WorkflowInferenciaEstado }) {
  const map: Record<WorkflowInferenciaEstado, { label: string; classes: string }> = {
    passada: {
      label: 'concluida',
      classes: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
    },
    atual: {
      label: 'etapa atual',
      classes: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    },
    pulada: {
      label: 'sem registro no Globus',
      classes: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    },
    futura: {
      label: 'pendente',
      classes: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
    },
  };
  const cfg = map[estado];
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', cfg.classes)}>
      {cfg.label}
    </span>
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
      classes: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
    },
  };
  const cfg = map[status] ?? map.em_andamento!;
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide', cfg.classes)}>
      {cfg.label}
    </span>
  );
}
