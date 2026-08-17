'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { TermoStatusResponse } from '@pioneira/shared/schemas/audit';
import { FUNCIONALIDADES } from '@pioneira/shared/enums/funcionalidades';
import { useAuth } from '@/contexts/AuthContext';
import { AppShell } from '@/components/layout/AppShell';
import { restricaoDoUsuario } from '@/components/layout/navigation';
import { TermoCompromisso } from '@/components/audit/TermoCompromisso';
import { api } from '@/lib/api';

export default function PrivateLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [aceitouAgora, setAceitouAgora] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  // Bloqueia acesso direto a rota fora da restrição (o menu já esconde; isto cobre
  // quem digita a URL). Vale para o auditor em trilha e para o espelho do CFO.
  useEffect(() => {
    if (!user) return;
    const restricao = restricaoDoUsuario(user);
    if (!restricao) return;
    const permitidas = [
      ...restricao.chaves,
      '/dashboard',
      ...(restricao.modo === 'trilha' ? ['/minhas-funcionalidades'] : []),
      ...(user.role === 'cfo' || user.role === 'admin' ? ['/validacoes'] : []),
    ];
    const ok = permitidas.some((h) => pathname === h || pathname.startsWith(`${h}/`));
    if (!ok) router.replace(restricao.modo === 'trilha' ? '/minhas-funcionalidades' : '/validacoes');
  }, [user, pathname, router]);

  // Registra o 1º acesso do usuário à funcionalidade que ele abriu (inicia o
  // relógio das horas para poder validar). Idempotente no backend.
  useEffect(() => {
    if (!user?.liberacaoProgressiva) return;
    const chave = FUNCIONALIDADES.find((f) => pathname === f.chave || pathname.startsWith(`${f.chave}/`))?.chave;
    if (chave && user.funcionalidadesAtribuidas.includes(chave)) {
      void api.post('/api/users/me/registrar-acesso', { chave }).catch(() => {});
    }
  }, [user, pathname]);

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
