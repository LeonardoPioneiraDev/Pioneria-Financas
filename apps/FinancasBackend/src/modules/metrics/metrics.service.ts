import type { FastifyInstance } from 'fastify';
import type {
  MetricsTimeRange,
  MetricsDashboardResponse,
  MetricsSummary,
  MetricsPonto,
  MetricsStatusGrupo,
  MetricsStatusDetalhe,
  MetricsTopUser,
  MetricsSlowEndpoint,
  MetricsDailyPeak,
  MetricsMethod,
} from '@pioneira/shared';
import { RequestLog } from '@/entities/request-log.entity.js';

const TZ = 'America/Sao_Paulo';

/** Janela + granularidade de bucket por TimeRange. */
const RANGES: Record<MetricsTimeRange, { intervalo: string; bucket: 'minute' | 'hour' | 'day' }> = {
  last_hour: { intervalo: '1 hour', bucket: 'minute' },
  last_3h: { intervalo: '3 hours', bucket: 'hour' },
  last_6h: { intervalo: '6 hours', bucket: 'hour' },
  last_24h: { intervalo: '24 hours', bucket: 'hour' },
  last_7d: { intervalo: '7 days', bucket: 'day' },
  last_30d: { intervalo: '30 days', bucket: 'day' },
};

function grupoStatus(code: number): string {
  if (code >= 200 && code < 300) return '2xx';
  if (code >= 300 && code < 400) return '3xx';
  if (code >= 400 && code < 500) return '4xx';
  if (code >= 500) return '5xx';
  return 'outro';
}
const round = (v: unknown): number => Math.round(Number(v ?? 0));

export function buildMetricsService(fastify: FastifyInstance) {
  const repo = fastify.db.getRepository(RequestLog);

  /**
   * Dashboard consolidado de um TimeRange. Roda todas as queries em paralelo.
   * `intervalo`/`bucket` vem de um whitelist fixo (RANGES), seguro pra interpolar.
   */
  async function dashboard(timeRange: MetricsTimeRange): Promise<MetricsDashboardResponse> {
    const { intervalo, bucket } = RANGES[timeRange];
    const desde = `NOW() - INTERVAL '${intervalo}'`;

    const [resumoRows, loginsRows, serieRows, statusRows, metodoRows, topRows, slowRows, peakRows] = await Promise.all([
      // (1) Summary dos requests.
      repo.query<Array<{ total: string; avg_lat: string; p95: string; err_rate: string; uniq_users: string }>>(
        `SELECT COUNT(*)::int AS total,
                COALESCE(AVG(latency_ms), 0) AS avg_lat,
                COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) AS p95,
                COALESCE(SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) * 100, 0) AS err_rate,
                COUNT(DISTINCT usuario_id)::int AS uniq_users
           FROM audit.request_logs
          WHERE criado_em >= ${desde}`,
      ),
      // (1b) Logins únicos.
      repo.query<Array<{ uniq_logins: string }>>(
        `SELECT COUNT(DISTINCT usuario_id)::int AS uniq_logins
           FROM audit.user_activity_logs
          WHERE activity_type = 'login' AND criado_em >= ${desde}`,
      ),
      // (2) Requests + latência ao longo do tempo (bucket na timezone SP).
      repo.query<Array<{ ts: string; c: string; avg_lat: string; p95: string }>>(
        `SELECT date_trunc('${bucket}', criado_em AT TIME ZONE '${TZ}')::text AS ts,
                COUNT(*)::int AS c,
                COALESCE(AVG(latency_ms), 0) AS avg_lat,
                COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) AS p95
           FROM audit.request_logs
          WHERE criado_em >= ${desde}
          GROUP BY ts ORDER BY ts`,
      ),
      // (3) Distribuição por status code.
      repo.query<Array<{ code: string; c: string }>>(
        `SELECT status_code::int AS code, COUNT(*)::int AS c
           FROM audit.request_logs
          WHERE criado_em >= ${desde}
          GROUP BY status_code ORDER BY c DESC`,
      ),
      // (3b) Distribuição por método HTTP.
      repo.query<Array<{ method: string; c: string }>>(
        `SELECT method, COUNT(*)::int AS c
           FROM audit.request_logs
          WHERE criado_em >= ${desde}
          GROUP BY method ORDER BY c DESC`,
      ),
      // (4) Top usuários por atividade.
      repo.query<Array<{ id: string; email: string; nome: string; role: string; total: string; dias: string }>>(
        `SELECT r.usuario_id AS id, u.email, u.nome_completo AS nome, u.role,
                COUNT(*)::int AS total,
                COUNT(DISTINCT date_trunc('day', r.criado_em AT TIME ZONE '${TZ}'))::int AS dias
           FROM audit.request_logs r
           JOIN identity.usuarios u ON u.id = r.usuario_id
          WHERE r.criado_em >= ${desde} AND r.usuario_id IS NOT NULL
          GROUP BY r.usuario_id, u.email, u.nome_completo, u.role
          ORDER BY total DESC LIMIT 10`,
      ),
      // (5) Endpoints mais lentos (min 5 requests).
      repo.query<Array<{ method: string; path: string; c: string; avg_lat: string; p95: string; max_lat: string }>>(
        `SELECT method, path, COUNT(*)::int AS c,
                COALESCE(AVG(latency_ms), 0) AS avg_lat,
                COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) AS p95,
                COALESCE(MAX(latency_ms), 0)::int AS max_lat
           FROM audit.request_logs
          WHERE criado_em >= ${desde}
          GROUP BY method, path
         HAVING COUNT(*) >= 5
          ORDER BY avg_lat DESC LIMIT 10`,
      ),
      // (6) Picos diários (dia, total, hora de pico).
      repo.query<Array<{ dia: string; total: string; peak_hora: string; peak_c: string }>>(
        `WITH por_hora AS (
           SELECT date_trunc('day', criado_em AT TIME ZONE '${TZ}')::date AS dia,
                  EXTRACT(hour FROM criado_em AT TIME ZONE '${TZ}')::int AS hora,
                  COUNT(*)::int AS c
             FROM audit.request_logs
            WHERE criado_em >= ${desde}
            GROUP BY dia, hora
         )
         SELECT dia::text AS dia, SUM(c)::int AS total,
                (array_agg(hora ORDER BY c DESC))[1] AS peak_hora,
                MAX(c)::int AS peak_c
           FROM por_hora GROUP BY dia ORDER BY dia`,
      ),
    ]);

    const r0 = resumoRows[0];
    const totalReq = Number(r0?.total ?? 0);
    const summary: MetricsSummary = {
      totalRequests: totalReq,
      avgLatencyMs: round(r0?.avg_lat),
      p95LatencyMs: round(r0?.p95),
      errorRate: Math.round(Number(r0?.err_rate ?? 0) * 100) / 100,
      uniqueUsers: Number(r0?.uniq_users ?? 0),
      uniqueLoggedInUsers: Number(loginsRows[0]?.uniq_logins ?? 0),
    };

    const requestsOverTime: MetricsPonto[] = serieRows.map((p) => ({
      timestamp: p.ts,
      requestCount: Number(p.c),
      avgLatencyMs: round(p.avg_lat),
      p95LatencyMs: round(p.p95),
    }));

    // Distribuição agrupada por faixa + detalhe por status code.
    const grupos = new Map<string, number>();
    const statusDetails: MetricsStatusDetalhe[] = statusRows.map((s) => {
      const code = Number(s.code);
      const count = Number(s.c);
      const grupo = grupoStatus(code);
      grupos.set(grupo, (grupos.get(grupo) ?? 0) + count);
      return { statusCode: code, grupo, count, percent: totalReq > 0 ? Math.round((count / totalReq) * 10000) / 100 : 0 };
    });
    const statusDistribution: MetricsStatusGrupo[] = [...grupos.entries()]
      .map(([grupo, count]) => ({ grupo, count }))
      .sort((a, b) => a.grupo.localeCompare(b.grupo));

    const methodDistribution: MetricsMethod[] = metodoRows.map((m) => ({ method: m.method, count: Number(m.c) }));

    const topUsers: MetricsTopUser[] = topRows.map((u) => ({
      userId: u.id,
      username: u.email,
      fullName: u.nome,
      role: u.role,
      totalRequests: Number(u.total),
      activeDays: Number(u.dias),
    }));

    const slowestEndpoints: MetricsSlowEndpoint[] = slowRows.map((e) => ({
      endpoint: e.path,
      method: e.method,
      count: Number(e.c),
      avgLatencyMs: round(e.avg_lat),
      p95LatencyMs: round(e.p95),
      maxLatencyMs: Number(e.max_lat),
    }));

    const dailyPeaks: MetricsDailyPeak[] = peakRows.map((d) => ({
      date: d.dia,
      totalRequests: Number(d.total),
      peakHour: Number(d.peak_hora ?? 0),
      peakHourRequests: Number(d.peak_c ?? 0),
    }));

    return {
      timeRange,
      geradoEm: new Date().toISOString(),
      summary,
      requestsOverTime,
      statusDistribution,
      statusDetails,
      methodDistribution,
      topUsers,
      slowestEndpoints,
      dailyPeaks,
    };
  }

  return { dashboard };
}

export type MetricsService = ReturnType<typeof buildMetricsService>;
