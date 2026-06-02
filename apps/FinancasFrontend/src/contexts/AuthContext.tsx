'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { AuthenticatedUser, LoginPayload, LoginResponse } from '@pioneira/shared/schemas/auth';
import { api, tokenStorage } from '@/lib/api';

interface AuthContextValue {
  user: AuthenticatedUser | null;
  loading: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const carregar = useCallback(async () => {
    if (!tokenStorage.getAccess()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get<AuthenticatedUser>('/api/auth/me');
      setUser(data);
    } catch {
      tokenStorage.clear();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      const { data } = await api.post<LoginResponse>('/api/auth/login', payload);
      tokenStorage.set(data.accessToken, data.refreshToken);
      setUser(data.user);
      router.replace('/dashboard');
    },
    [router],
  );

  const logout = useCallback(async () => {
    try {
      const refreshToken = tokenStorage.getRefresh();
      await api.post('/api/auth/logout', refreshToken ? { refreshToken } : undefined);
    } catch {
      // ignora - vamos limpar local de qualquer forma
    }
    tokenStorage.clear();
    setUser(null);
    router.replace('/login');
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout, refresh: carregar }),
    [user, loading, login, logout, carregar],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
