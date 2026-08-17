import { Type, type Static } from '@sinclair/typebox';

// ============================================================================
// SYSTEM METRICS DASHBOARD — agregacoes de request_logs + user_activity_logs.
// Fonte ja capturada pelo plugin request-metrics. Todas as janelas em
// America/Sao_Paulo. Endpoint admin-only.
// ============================================================================

export const METRICS_TIME_RANGES = ['last_hour', 'last_3h', 'last_6h', 'last_24h', 'last_7d', 'last_30d'] as const;
export type MetricsTimeRange = (typeof METRICS_TIME_RANGES)[number];

export const MetricsTimeRangeSchema = Type.Union([
  Type.Literal('last_hour'),
  Type.Literal('last_3h'),
  Type.Literal('last_6h'),
  Type.Literal('last_24h'),
  Type.Literal('last_7d'),
  Type.Literal('last_30d'),
]);

export const MetricsDashboardQuerySchema = Type.Object({
  timeRange: Type.Optional(MetricsTimeRangeSchema),
});
export type MetricsDashboardQuery = Static<typeof MetricsDashboardQuerySchema>;

export const MetricsSummarySchema = Type.Object({
  totalRequests: Type.Integer(),
  avgLatencyMs: Type.Integer(),
  p95LatencyMs: Type.Integer(),
  /** Percentual (0-100) de respostas com status >= 400. */
  errorRate: Type.Number(),
  uniqueUsers: Type.Integer(),
  uniqueLoggedInUsers: Type.Integer(),
});
export type MetricsSummary = Static<typeof MetricsSummarySchema>;

export const MetricsPontoSchema = Type.Object({
  /** Bucket de tempo (wall-clock America/Sao_Paulo, ISO). */
  timestamp: Type.String(),
  requestCount: Type.Integer(),
  avgLatencyMs: Type.Integer(),
  p95LatencyMs: Type.Integer(),
});
export type MetricsPonto = Static<typeof MetricsPontoSchema>;

export const MetricsStatusGrupoSchema = Type.Object({
  grupo: Type.String(), // '2xx' | '3xx' | '4xx' | '5xx' | 'outro'
  count: Type.Integer(),
});
export type MetricsStatusGrupo = Static<typeof MetricsStatusGrupoSchema>;

export const MetricsStatusDetalheSchema = Type.Object({
  statusCode: Type.Integer(),
  grupo: Type.String(),
  count: Type.Integer(),
  percent: Type.Number(),
});
export type MetricsStatusDetalhe = Static<typeof MetricsStatusDetalheSchema>;

export const MetricsTopUserSchema = Type.Object({
  userId: Type.String(),
  username: Type.String(), // email
  fullName: Type.String(),
  role: Type.String(),
  totalRequests: Type.Integer(),
  activeDays: Type.Integer(),
});
export type MetricsTopUser = Static<typeof MetricsTopUserSchema>;

export const MetricsSlowEndpointSchema = Type.Object({
  endpoint: Type.String(),
  method: Type.String(),
  count: Type.Integer(),
  avgLatencyMs: Type.Integer(),
  p95LatencyMs: Type.Integer(),
  maxLatencyMs: Type.Integer(),
});
export type MetricsSlowEndpoint = Static<typeof MetricsSlowEndpointSchema>;

export const MetricsMethodSchema = Type.Object({
  method: Type.String(),
  count: Type.Integer(),
});
export type MetricsMethod = Static<typeof MetricsMethodSchema>;

export const MetricsDailyPeakSchema = Type.Object({
  date: Type.String(),
  totalRequests: Type.Integer(),
  peakHour: Type.Integer(),
  peakHourRequests: Type.Integer(),
});
export type MetricsDailyPeak = Static<typeof MetricsDailyPeakSchema>;

export const MetricsDashboardResponseSchema = Type.Object({
  timeRange: MetricsTimeRangeSchema,
  geradoEm: Type.String(),
  summary: MetricsSummarySchema,
  requestsOverTime: Type.Array(MetricsPontoSchema),
  statusDistribution: Type.Array(MetricsStatusGrupoSchema),
  statusDetails: Type.Array(MetricsStatusDetalheSchema),
  methodDistribution: Type.Array(MetricsMethodSchema),
  topUsers: Type.Array(MetricsTopUserSchema),
  slowestEndpoints: Type.Array(MetricsSlowEndpointSchema),
  dailyPeaks: Type.Array(MetricsDailyPeakSchema),
});
export type MetricsDashboardResponse = Static<typeof MetricsDashboardResponseSchema>;
