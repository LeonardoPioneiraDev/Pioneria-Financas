'use client';

import { DatabaseZap, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePodeSincronizar } from '@/hooks/usePodeSincronizar';

interface EmptyStateSyncProps {
  titulo: string;
  descricao: string;
  onSync: () => void;
  sincronizando: boolean;
  textoBotao?: string;
}

export function EmptyStateSync({ titulo, descricao, onSync, sincronizando, textoBotao }: EmptyStateSyncProps) {
  // Sem dado e sem permissão de sincronizar: o usuário precisa saber POR QUE está
  // vazio e o que fazer — mandá-lo clicar num botão que não existe é pior que nada.
  const podeSincronizar = usePodeSincronizar();
  return (
    <Card className="p-10 flex flex-col items-center text-center gap-5">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-pioneira-400/30 dark:bg-yellow-400/20 blur-2xl" />
        <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center shadow-lg">
          <DatabaseZap className="h-10 w-10 text-pioneira-900 dark:text-gray-900" />
        </div>
      </div>
      <div className="max-w-md">
        <h2 className="text-xl font-semibold text-pioneira-900 dark:text-yellow-200 mb-2">{titulo}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{descricao}</p>
      </div>
      {podeSincronizar ? (
        <Button size="lg" onClick={onSync} disabled={sincronizando} className="min-w-[220px]">
          {sincronizando ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span>Sincronizando...</span>
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4" />
              <span>{textoBotao ?? 'Sincronizar do Globus'}</span>
            </>
          )}
        </Button>
      ) : (
        <p className="max-w-md rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-600 dark:bg-gray-900/50 dark:text-gray-300">
          A carga de dados do Globus é feita pelo <strong>administrador</strong>.
          Peça a atualização desta tela para quem administra o sistema.
        </p>
      )}
    </Card>
  );
}
