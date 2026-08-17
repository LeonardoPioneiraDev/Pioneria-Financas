'use client';

import { useQuery } from '@tanstack/react-query';
import type { MetricsDashboardResponse, MetricsTimeRange } from '@pioneira/shared';
import { api } from '@/lib/api';

/** Dashboard de métricas de sistema. Auto-refresh a cada 60s. */
export function useMetrics(timeRange: MetricsTimeRange) {
  return useQuery<MetricsDashboardResponse>({
    queryKey: ['metrics', 'dashboard', timeRange],
    queryFn: async () => {
      const res = await api.get<MetricsDashboardResponse>('/api/metrics/dashboard', { params: { timeRange } });
      return res.data;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
