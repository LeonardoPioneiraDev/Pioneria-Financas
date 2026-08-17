'use client';

import type { ReactNode } from 'react';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';

/**
 * Guard da seção /admin: só administrador do sistema entra. O bloqueio de
 * verdade é no backend (requireRole('admin') em cada rota) — este layout é a
 * camada de UX/defesa (evita a página abrir pra quem digita a URL na mão).
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (user?.role !== 'admin') {
    return (
      <div className="mx-auto max-w-md p-6">
        <Card className="p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-amber-400" />
          <p className="mt-3 font-medium">Acesso restrito</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Esta área é exclusiva do administrador do sistema.
          </p>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
