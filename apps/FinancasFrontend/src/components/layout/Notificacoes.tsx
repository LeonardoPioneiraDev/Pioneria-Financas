'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, CheckCircle2, AlertTriangle, MessageSquareReply, Stamp } from 'lucide-react';
import type { Notificacao, NotificacoesListResponse } from '@pioneira/shared/schemas/notificacoes';
import { NOTIFICACAO_TOM, type NotificacaoTipo } from '@pioneira/shared/enums/notificacao';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const ICONE: Record<NotificacaoTipo, typeof Bell> = {
  validacao_registrada: CheckCircle2,
  ressalva_registrada: AlertTriangle,
  ressalva_respondida: MessageSquareReply,
  aval_registrado: Stamp,
  aval_devolvido: AlertTriangle,
};

const COR_TOM: Record<'sucesso' | 'alerta' | 'info', string> = {
  sucesso: 'text-emerald-500',
  alerta: 'text-amber-500',
  info: 'text-sky-500',
};

/** "agora", "há 5 min", "há 3 h", "22/07 13:50". */
function quando(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  if (min < 24 * 60) return `há ${Math.floor(min / 60)} h`;
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/**
 * Sininho do cabeçalho: eventos do ciclo de conferência (validação, ressalva,
 * resposta, aval). Refaz a busca a cada 60s e ao focar a janela.
 */
export function Notificacoes() {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const qc = useQueryClient();

  const { data } = useQuery<NotificacoesListResponse>({
    queryKey: ['notificacoes'],
    queryFn: async () => (await api.get<NotificacoesListResponse>('/api/notificacoes', { params: { limit: 30 } })).data,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const marcarLidas = useMutation({
    mutationFn: async (ids?: string[]) => (await api.post('/api/notificacoes/ler', { ids })).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notificacoes'] });
      void qc.invalidateQueries({ queryKey: ['validacoes'] });
    },
  });

  // Fecha ao clicar fora ou apertar Esc.
  useEffect(() => {
    if (!aberto) return;
    const clique = (e: MouseEvent): void => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent): void => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', clique);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', clique);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  const itens = data?.itens ?? [];
  const naoLidas = data?.naoLidas ?? 0;

  const abrir = (n: Notificacao): void => {
    if (!n.lidaEm) marcarLidas.mutate([n.id]);
    setAberto(false);
    if (n.link) router.push(n.link);
  };

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="relative rounded-lg p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-yellow-400/10"
        aria-label={naoLidas > 0 ? `Notificações (${naoLidas} não lidas)` : 'Notificações'}
      >
        <Bell className="h-[18px] w-[18px] text-gray-500 dark:text-yellow-300" />
        {naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white dark:ring-black">
            {naoLidas > 99 ? '99+' : naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2 dark:border-gray-800">
            <p className="text-sm font-semibold">Notificações</p>
            {naoLidas > 0 && (
              <button
                type="button"
                onClick={() => marcarLidas.mutate(undefined)}
                disabled={marcarLidas.isPending}
                className="flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-yellow-300"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-[26rem] overflow-y-auto">
            {itens.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-gray-400">Nenhuma notificação por aqui.</p>
            )}
            {itens.map((n) => {
              const Icone = ICONE[n.tipo] ?? Bell;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => abrir(n)}
                  className={cn(
                    'flex w-full items-start gap-2.5 border-b border-gray-50 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-gray-800/50',
                    !n.lidaEm && 'bg-pioneira-50/40 dark:bg-yellow-950/10',
                  )}
                >
                  <Icone className={cn('mt-0.5 h-4 w-4 shrink-0', COR_TOM[NOTIFICACAO_TOM[n.tipo] ?? 'info'])} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className={cn('truncate text-[13px]', !n.lidaEm ? 'font-semibold' : 'font-medium')}>
                        {n.titulo}
                      </span>
                      {!n.lidaEm && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-gray-600 dark:text-gray-300">
                      {n.mensagem}
                    </span>
                    <span className="mt-1 block text-[10px] text-gray-400">
                      {n.atorEmail ? `${n.atorEmail} · ` : ''}{quando(n.criadoEm)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
