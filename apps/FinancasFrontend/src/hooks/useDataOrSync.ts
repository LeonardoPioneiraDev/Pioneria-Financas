'use client';

import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import { extrairMensagemErro } from '@/lib/api';

interface SyncInfoLike {
  ultimoSyncEm: string | null;
  ultimoSyncStatus: string | null;
  ultimoSyncMensagem: string | null;
  totalLocal: number;
  precisaSincronizar: boolean;
}

interface PaginatedLike<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  syncInfo: SyncInfoLike;
}

export interface SyncResultLike {
  jobId: string;
  status: 'ok' | 'parcial' | 'erro';
  registrosLidos: number;
  registrosGravados: number;
  registrosComErro: number;
  duracaoMs: number;
  mensagem?: string;
}

interface UseDataOrSyncOptions<T, S> {
  /** Chave do React Query (deve mudar quando filtros mudam). */
  queryKey: unknown[];
  /** Fetcher dos dados locais (Postgres). Retorna {data, pagination, syncInfo}. */
  fetchData: () => Promise<PaginatedLike<T>>;
  /** Disparador do sync com Globus. Retorna detalhe do job pra log/toast. */
  triggerSync: (payload: S) => Promise<SyncResultLike>;
  /** Texto do recurso para o toast (ex: "Contas a Pagar"). */
  recurso?: string;
  /** Opcoes adicionais para o useQuery (staleTime, refetchOnWindowFocus, etc.). */
  queryOptions?: Omit<UseQueryOptions<PaginatedLike<T>>, 'queryKey' | 'queryFn'>;
}

function formatDuracao(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Padrao reusavel: tenta ler do banco local. Quando vazio, mostra que
 * precisa sincronizar. O componente decide se renderiza dados ou empty state.
 * O sync e exposto como mutation - inclui invalidacao automatica.
 */
export function useDataOrSync<T, S = void>(opts: UseDataOrSyncOptions<T, S>) {
  const qc = useQueryClient();

  const query = useQuery<PaginatedLike<T>>({
    queryKey: opts.queryKey,
    queryFn: opts.fetchData,
    staleTime: 30_000,
    ...opts.queryOptions,
  });

  const sync = useMutation({
    mutationFn: opts.triggerSync,
    onSuccess: (result) => {
      const recurso = opts.recurso ?? 'Dados';
      const tempo = formatDuracao(result.duracaoMs);
      const descricao = `${result.registrosGravados.toLocaleString('pt-BR')} de ${result.registrosLidos.toLocaleString('pt-BR')} gravados em ${tempo}${result.registrosComErro > 0 ? ` - ${result.registrosComErro} erro(s)` : ''}`;

      if (result.status === 'ok') {
        toast.success(`${recurso} sincronizadas do Globus`, { description: descricao });
      } else if (result.status === 'parcial') {
        toast.warning(`${recurso}: sincronizacao parcial`, { description: descricao });
      } else {
        toast.error(`${recurso}: falha na sincronizacao`, { description: result.mensagem ?? descricao });
      }
      void qc.invalidateQueries({ queryKey: opts.queryKey });
    },
    onError: (err) => {
      const recurso = opts.recurso ?? 'Dados';
      toast.error(`${recurso}: falha ao sincronizar`, { description: extrairMensagemErro(err) });
    },
  });

  const precisaSincronizar = query.data?.syncInfo.precisaSincronizar ?? false;
  const totalLocal = query.data?.syncInfo.totalLocal ?? 0;

  return {
    ...query,
    sync,
    precisaSincronizar,
    totalLocal,
    syncInfo: query.data?.syncInfo,
  };
}
