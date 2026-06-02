'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { TermoStatusResponse } from '@pioneira/shared/schemas/audit';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { TermoCompromisso } from '@/components/audit/TermoCompromisso';
import { api } from '@/lib/api';

export default function PrivateLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [aceitouAgora, setAceitouAgora] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const { data: termo, isLoading: carregandoTermo } = useQuery<TermoStatusResponse>({
    queryKey: ['audit', 'termo-status'],
    queryFn: async () => {
      const res = await api.get<TermoStatusResponse>('/api/audit/termo/status');
      return res.data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-transparent border-t-[#e6cd4a] dark:border-t-yellow-400" />
      </div>
    );
  }

  // Aguarda o status do termo antes de mostrar o conteudo sensivel.
  if (carregandoTermo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-transparent border-t-[#e6cd4a] dark:border-t-yellow-400 mx-auto" />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">Verificando termo de comprometimento…</p>
        </div>
      </div>
    );
  }

  const precisaAceitarTermo = termo && !termo.aceito && !aceitouAgora;

  return (
    <>
      <AppShell>{children}</AppShell>
      {precisaAceitarTermo && (
        <TermoCompromisso
          versaoAtual={termo.versaoAtual}
          onAceito={() => setAceitouAgora(true)}
        />
      )}
    </>
  );
}
