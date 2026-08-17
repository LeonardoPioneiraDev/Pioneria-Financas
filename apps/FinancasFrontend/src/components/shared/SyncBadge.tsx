'use client';

import { useMemo } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePodeSincronizar } from '@/hooks/usePodeSincronizar';

interface SyncBadgeProps {
  ultimoSyncEm: string | null;
  status?: string | null;
  totalLocal: number;
  onSync: () => void;
  sincronizando: boolean;
}

function formatarRelativo(iso: string | null): string {
  if (!iso) return 'nunca';
  const data = new Date(iso);
  const diff = Date.now() - data.getTime();
  const segundos = Math.floor(diff / 1000);
  if (segundos < 60) return 'agora';
  const minutos = Math.floor(segundos / 60);
  if (minutos < 60) return `ha ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `ha ${horas}h`;
  const dias = Math.floor(horas / 24);
  if (dias < 7) return `ha ${dias}d`;
  return data.toLocaleDateString('pt-BR');
}

export function SyncBadge({ ultimoSyncEm, status, totalLocal, onSync, sincronizando }: SyncBadgeProps) {
  // A informação (quantos registros, de quando) fica para todos — é transparência
  // sobre a idade do dado. Só o BOTÃO é de administrador.
  const podeSincronizar = usePodeSincronizar();
  const relativo = useMemo(() => formatarRelativo(ultimoSyncEm), [ultimoSyncEm]);
  const corStatus = status === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : status === 'erro' ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400';

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
        <Clock className="h-3.5 w-3.5" />
        <span>
          <span className="font-medium">{totalLocal.toLocaleString('pt-BR')}</span> registros - sincronizado <span className={corStatus}>{relativo}</span>
        </span>
      </div>
      {podeSincronizar && (
        <Button variant="ghost" size="sm" onClick={onSync} disabled={sincronizando} className="h-7 text-xs">
          {sincronizando ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          <span>{sincronizando ? 'Sincronizando' : 'Sincronizar'}</span>
        </Button>
      )}
    </div>
  );
}
