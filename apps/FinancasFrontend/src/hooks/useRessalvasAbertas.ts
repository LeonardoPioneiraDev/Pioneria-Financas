'use client';

import { useQuery } from '@tanstack/react-query';
import type { ValidacoesResumoResponse } from '@pioneira/shared/schemas/validacoes';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

/**
 * Quantas ressalvas de auditor seguem sem resposta. Alimenta o contador no item
 * "Validações" do menu — sem isso o admin não fica sabendo que alguém apontou um
 * problema (foi exatamente o que aconteceu na 1ª rodada de conferência).
 *
 * Compartilha a queryKey ['validacoes'] com a tela, então já é invalidado pelas
 * mutações de conferência/aval/resposta.
 */
export function useRessalvasAbertas(): number {
  const { user } = useAuth();
  const habilitado = user?.role === 'admin' || user?.role === 'cfo';

  const { data } = useQuery<ValidacoesResumoResponse>({
    queryKey: ['validacoes'],
    queryFn: async () => (await api.get<ValidacoesResumoResponse>('/api/validacoes')).data,
    enabled: habilitado,
    staleTime: 60_000,
  });

  return data?.totais.ressalvasAbertas ?? 0;
}
