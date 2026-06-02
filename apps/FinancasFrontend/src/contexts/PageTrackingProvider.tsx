'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from './AuthContext';

const SESSION_KEY = 'pioneira:session_id';

function obterSessionId(): string {
  if (typeof window === 'undefined') return 'server';
  let id = window.sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/login': 'Login',
  '/forgot-password': 'Recuperar senha',
  '/admin/usuarios': 'Usuarios',
};

function tituloPara(path: string): string {
  return PAGE_TITLES[path] ?? (document.title || path);
}

export function PageTrackingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const ultimoPath = useRef<string | null>(null);
  const ultimoStart = useRef<number>(Date.now());

  useEffect(() => {
    if (!user || !pathname) return;
    if (ultimoPath.current === pathname) return;

    const agora = Date.now();
    const timeOnPage = ultimoPath.current ? agora - ultimoStart.current : undefined;

    void api
      .post('/api/metrics/page-view', {
        sessionId: obterSessionId(),
        path: pathname,
        pageTitle: tituloPara(pathname),
        referrer: ultimoPath.current ?? document.referrer ?? undefined,
        timeOnPageMs: timeOnPage,
      })
      .catch(() => {
        // fire-and-forget - falha nao afeta navegacao
      });

    ultimoPath.current = pathname;
    ultimoStart.current = agora;
  }, [pathname, user]);

  return <>{children}</>;
}
