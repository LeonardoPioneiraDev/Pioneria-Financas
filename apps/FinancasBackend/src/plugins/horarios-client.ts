import fp from 'fastify-plugin';
import { hashSha256 } from '@/shared/utils/crypto.js';

/**
 * Cliente HTTP da API horarios.vpioneira.com.br (vide memoria horarios-api).
 *
 * Autenticacao: header X-API-Key no formato tp_<prefix>.<secret>.
 * Tolerante a falha: se HORARIOS_ENABLED=false ou API_KEY vazia, decorate
 * com `isAvailable()=false` e segue (igual ao oraclePlugin). Modulos que
 * dependem devem checar `fastify.horarios.isAvailable()` antes de chamar.
 *
 * Telemetria: cada requisicao grava 1 linha em integration.oracle_query_logs
 * com query_name = `horarios:${path}` (best effort, falha silenciosa).
 */

export interface HorariosResponse<T> {
  success: boolean;
  data: T;
  total?: number;
  page?: number;
  pageSize?: number;
  note?: string;
}

export interface HorariosClient {
  isAvailable(): boolean;
  /**
   * GET autenticado. Lanca erro em status >= 400.
   *
   * `opts.queryName` para telemetria (default = path).
   * `opts.syncJobId` correlaciona com sync_job.
   */
  get<T = unknown>(
    path: string,
    query?: Record<string, string | number | boolean | undefined>,
    opts?: { queryName?: string; syncJobId?: string | null },
  ): Promise<HorariosResponse<T>>;
}

declare module 'fastify' {
  interface FastifyInstance {
    horarios: HorariosClient;
  }
}

export const horariosClientPlugin = fp(
  async (fastify) => {
    const cfg = fastify.config.horarios;

    if (!cfg.enabled || !cfg.apiKey) {
      fastify.log.info(
        { enabled: cfg.enabled, hasKey: Boolean(cfg.apiKey) },
        '[horarios] cliente HTTP desabilitado (HORARIOS_ENABLED=false ou sem HORARIOS_API_KEY)',
      );
      fastify.decorate('horarios', {
        isAvailable: () => false,
        get: () => {
          throw new Error('Cliente horarios desabilitado. Defina HORARIOS_ENABLED=true + HORARIOS_API_KEY.');
        },
      });
      return;
    }

    fastify.log.info({ baseUrl: cfg.baseUrl }, '[horarios] cliente HTTP iniciado');

    async function gravarLog(args: {
      queryName: string;
      syncJobId: string | null;
      url: string;
      duracaoMs: number;
      status: number | null;
      linhas: number | null;
      erroMensagem: string | null;
    }): Promise<void> {
      try {
        await fastify.db.query(
          `INSERT INTO integration.oracle_query_logs
             (sync_job_id, query_name, sql_hash, duracao_ms, linhas, erro_mensagem, binds_count)
           VALUES ($1, $2, $3, $4, $5, $6, 0)`,
          [
            args.syncJobId,
            args.queryName,
            hashSha256(args.url),
            args.duracaoMs,
            args.linhas,
            args.erroMensagem ?? (args.status && args.status >= 400 ? `HTTP ${args.status}` : null),
          ],
        );
      } catch (err) {
        fastify.log.warn({ err, queryName: args.queryName }, '[horarios] falha ao gravar telemetria (nao critico)');
      }
    }

    function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
      const url = new URL(path.startsWith('/') ? path : `/${path}`, cfg.baseUrl);
      if (query) {
        for (const [k, v] of Object.entries(query)) {
          if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
        }
      }
      return url.toString();
    }

    const client: HorariosClient = {
      isAvailable: () => true,
      async get<T = unknown>(
        path: string,
        query?: Record<string, string | number | boolean | undefined>,
        opts?: { queryName?: string; syncJobId?: string | null },
      ): Promise<HorariosResponse<T>> {
        const url = buildUrl(path, query);
        const queryName = opts?.queryName ?? `horarios:${path.split('?')[0]}`;
        const syncJobId = opts?.syncJobId ?? null;

        let lastErr: unknown = null;
        for (let tentativa = 1; tentativa <= cfg.maxRetries; tentativa++) {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
          const inicio = Date.now();
          try {
            const res = await fetch(url, {
              headers: {
                'X-API-Key': cfg.apiKey,
                Accept: 'application/json',
              },
              signal: ctrl.signal,
            });
            const duracaoMs = Date.now() - inicio;

            if (!res.ok) {
              const body = await res.text().catch(() => '');
              const err = new Error(`HTTP ${res.status} em ${path}: ${body.slice(0, 300)}`);
              void gravarLog({ queryName, syncJobId, url, duracaoMs, status: res.status, linhas: null, erroMensagem: err.message });
              // 4xx (exceto 429) nao adianta retentar
              if (res.status >= 400 && res.status < 500 && res.status !== 429) {
                throw err;
              }
              lastErr = err;
              continue;
            }

            const json = (await res.json()) as HorariosResponse<T>;
            const linhas = Array.isArray(json.data) ? json.data.length : 1;
            void gravarLog({ queryName, syncJobId, url, duracaoMs, status: res.status, linhas, erroMensagem: null });
            return json;
          } catch (err) {
            const duracaoMs = Date.now() - inicio;
            const msg = (err as Error).message;
            void gravarLog({ queryName, syncJobId, url, duracaoMs, status: null, linhas: null, erroMensagem: msg });
            lastErr = err;
            // backoff exponencial: 2s, 4s, 8s...
            if (tentativa < cfg.maxRetries) {
              const delay = cfg.retryDelayMs * Math.pow(2, tentativa - 1);
              await new Promise((r) => setTimeout(r, delay));
            }
          } finally {
            clearTimeout(timer);
          }
        }
        throw lastErr ?? new Error(`[horarios] ${path} falhou apos ${cfg.maxRetries} tentativas`);
      },
    };

    fastify.decorate('horarios', client);
  },
  { name: 'horarios', dependencies: ['config', 'db'] },
);
