'use client';

import { useQuery } from '@tanstack/react-query';
import type { WorkflowTemplateResponse } from '@pioneira/shared';
import { api } from '@/lib/api';

/**
 * Busca o template de workflow padrao para um tipo de documento.
 * Convencao: primeiro template ativo retornado pelo backend (ordenado por nome).
 */
export function useTemplatePadrao(documentoTipo: string): string | undefined {
  const { data } = useQuery<WorkflowTemplateResponse[]>({
    queryKey: ['workflow-templates', documentoTipo],
    queryFn: async () => {
      const res = await api.get<WorkflowTemplateResponse[]>('/api/workflow/templates', {
        params: { documentoTipo, ativo: true },
      });
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
  return data?.[0]?.id;
}
