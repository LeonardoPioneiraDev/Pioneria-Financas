'use client';

import { useQuery } from '@tanstack/react-query';
import type { ConfiguracaoBranding } from '@pioneira/shared/schemas/parametros';
import { api } from '@/lib/api';

const PADRAO = {
  logoSrc: '/logo.png',
  razaoSocial: 'Viação Pioneira Ltda',
  nomeFantasia: 'Viação Pioneira',
};

/**
 * Branding da empresa (logo + nome) vindo de /api/parametros/branding — endpoint
 * PÚBLICO, funciona deslogado (login). Cai no padrão enquanto carrega ou se o
 * backend não responder, então a UI nunca fica sem logo.
 */
export function useBranding() {
  const { data } = useQuery<ConfiguracaoBranding>({
    queryKey: ['branding'],
    queryFn: async () => (await api.get<ConfiguracaoBranding>('/api/parametros/branding')).data,
    // Curto de propósito: `minutosValidacaoFuncionalidade` vem junto, e o auditor
    // precisa enxergar a mudança do admin sem esperar (com 10 min ele continuava
    // vendo o tempo antigo na trilha). O endpoint é leve e público.
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return {
    logoSrc: data?.logoDataUri || PADRAO.logoSrc,
    razaoSocial: data?.razaoSocial || PADRAO.razaoSocial,
    nomeFantasia: data?.nomeFantasia || PADRAO.nomeFantasia,
    /** Tempo mínimo de validação (minutos) — configurável pelo admin em Parâmetros. */
    minutosValidacao: data?.minutosValidacaoFuncionalidade ?? 120,
  };
}
