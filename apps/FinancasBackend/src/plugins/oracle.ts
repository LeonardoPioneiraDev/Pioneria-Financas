import fp from 'fastify-plugin';
import oracledb, { type Pool, type BindParameters, type ExecuteOptions, type Result } from 'oracledb';
import { inClauseInteirosPositivos } from '@/shared/utils/sql.js';
import { hashSha256 } from '@/shared/utils/crypto.js';

/** Opcoes de execucao que estendem o ExecuteOptions do oracledb com telemetria. */
export interface OracleExecuteOpts extends ExecuteOptions {
  /**
   * Nome logico da query para telemetria. Default 'sem_nome'.
   * Recomendado: usar a chave do GLOBUS_QUERIES (ex: 'contasAPagar').
   */
  queryName?: string;
  /** ID do sync_job — correlaciona a query com o sync que a disparou. */
  syncJobId?: string;
}

export interface OracleClient {
  isAvailable: () => boolean;
  /**
   * Executa uma query SOMENTE LEITURA. Levanta erro se Oracle nao estiver
   * disponivel - o caller deve checar `fastify.oracle.isAvailable()` antes,
   * ou capturar a excecao.
   *
   * O SQL pode conter placeholders __PLACEHOLDER__ (com underscores) que sao
   * substituidos antes da execucao — uso atual:
   *   __FILIAIS__ — lista de filiais do env (validada como inteiros positivos)
   *
   * Bind parametros (NAMED ou POSITIONAL) seguem o padrao oracledb.
   *
   * Telemetria: toda execucao gera 1 linha em `integration.oracle_query_logs`
   * (best effort — falha na gravacao do log NAO afeta a query original).
   */
  execute: <T = Record<string, unknown>>(sql: string, binds?: BindParameters, options?: OracleExecuteOpts) => Promise<Result<T>>;
}

declare module 'fastify' {
  interface FastifyInstance {
    oracle: OracleClient;
  }
}

/**
 * Plugin Oracle (Globus). Modo Thick por padrao - exige Instant Client.
 *
 * Comportamento tolerante a falha:
 * - Se ORACLE_ENABLED=false → registra `isAvailable()=false`, log info, segue.
 * - Se initOracleClient falhar (Instant Client nao encontrado) → log warn, segue.
 * - Se createPool falhar (Globus down/credencial errada) → log error, segue.
 *
 * Nenhum desses cenarios derruba a API - apenas o adapter que depender do
 * Oracle vai falhar quando rodar. Isso e intencional: o financeiro funciona
 * mesmo se o Globus estiver em manutencao.
 */
export const oraclePlugin = fp(
  async (fastify) => {
    const cfg = fastify.config.oracle;

    if (!cfg.enabled) {
      fastify.log.info('Oracle (Globus) desabilitado via ORACLE_ENABLED=false');
      fastify.decorate('oracle', {
        isAvailable: () => false,
        execute: () => {
          throw new Error('Oracle (Globus) esta desabilitado. Defina ORACLE_ENABLED=true para usar.');
        },
      });
      return;
    }

    // Inicializa o Instant Client (Modo Thick). Idempotente, mas se falhar
    // nao da pra criar pool. Vamos seguir sem oracle.
    try {
      if (cfg.clientPath) {
        oracledb.initOracleClient({ libDir: cfg.clientPath });
      } else {
        oracledb.initOracleClient();
      }
      fastify.log.info({ clientPath: cfg.clientPath || '(default)' }, 'Oracle Instant Client carregado (Modo Thick)');
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      // DPI-1047 = libra nao encontrada; outras chamadas duplicadas ignoram.
      if (message.includes('DPI-1047') || message.includes('NJS-')) {
        fastify.log.warn({ err: message }, 'Falha ao carregar Oracle Instant Client - Globus indisponivel nesta instancia');
        fastify.decorate('oracle', {
          isAvailable: () => false,
          execute: () => {
            throw new Error(`Oracle Instant Client indisponivel: ${message}`);
          },
        });
        return;
      }
      // Erro nao fatal (ex: ja inicializado antes em outro processo) - segue.
      fastify.log.debug({ err: message }, 'initOracleClient retornou erro nao fatal');
    }

    // Defaults globais do oracledb
    oracledb.fetchArraySize = cfg.fetchArraySize;
    oracledb.prefetchRows = cfg.prefetchRows;
    oracledb.autoCommit = false; // somos read-only, mas explicitamos

    let pool: Pool | null = null;
    try {
      pool = await oracledb.createPool({
        user: cfg.user,
        password: cfg.password,
        connectString: `//${cfg.host}:${cfg.port}/${cfg.serviceName}`,
        poolMin: cfg.poolMin,
        poolMax: cfg.poolMax,
        poolIncrement: cfg.poolIncrement,
        poolTimeout: Math.max(1, Math.floor(cfg.poolTimeoutMs / 1000)),
        queueTimeout: cfg.connectTimeoutMs,
        stmtCacheSize: 100,
      });
      fastify.log.info({ host: cfg.host, port: cfg.port, service: cfg.serviceName }, 'Pool Oracle (Globus) iniciado');
    } catch (err) {
      fastify.log.error({ err }, 'Falha ao criar pool Oracle - API segue, mas Globus nao estara disponivel');
      fastify.decorate('oracle', {
        isAvailable: () => false,
        execute: () => {
          throw new Error('Pool Oracle nao iniciou. Verifique ORACLE_HOST/credenciais e connectividade.');
        },
      });
      return;
    }

    /**
     * Expande placeholders __NOME__ no SQL antes de mandar pro Oracle.
     * Hoje suporta:
     *   __FILIAIS__ — lista CSV de inteiros positivos vinda do env (filiais da Pioneira)
     *
     * Lanca erro se o SQL conter um placeholder desconhecido — evita silenciosamente
     * mandar `__FOO__` literal pro Oracle (que causa ORA-00911 ou similar).
     */
    const filiaisInClause = inClauseInteirosPositivos(fastify.config.globus.filiais);
    function expandirPlaceholders(sql: string): string {
      const saida = sql.replace(/__FILIAIS__/g, filiaisInClause);
      const restante = saida.match(/__[A-Z_]+__/);
      if (restante) {
        throw new Error(`Placeholder desconhecido no SQL: ${restante[0]}`);
      }
      return saida;
    }

    /**
     * Persiste telemetria da query (best effort). Falhas nao propagam — soh
     * loga warn. Usa fastify.db diretamente porque o log NAO esta na transacao
     * do caller (queremos gravar mesmo se a transacao do ETL rollback depois).
     */
    async function gravarLog(args: {
      queryName: string;
      syncJobId: string | null;
      sqlExpandido: string;
      duracaoMs: number;
      linhas: number | null;
      erroMensagem: string | null;
      bindsCount: number;
    }): Promise<void> {
      try {
        await fastify.db.query(
          `INSERT INTO integration.oracle_query_logs
             (sync_job_id, query_name, sql_hash, duracao_ms, linhas, erro_mensagem, binds_count)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            args.syncJobId,
            args.queryName,
            hashSha256(args.sqlExpandido),
            args.duracaoMs,
            args.linhas,
            args.erroMensagem,
            args.bindsCount,
          ],
        );
      } catch (err) {
        fastify.log.warn({ err, queryName: args.queryName }, '[oracle] falha ao gravar telemetria (nao critico)');
      }
    }

    const client: OracleClient = {
      isAvailable: () => pool !== null,
      async execute<T = Record<string, unknown>>(sql: string, binds: BindParameters = [], options: OracleExecuteOpts = {}): Promise<Result<T>> {
        if (!pool) throw new Error('Pool Oracle nao iniciou');
        // Read-only enforcement: rejeita qualquer DML obvio.
        const dmlMatch = sql.trimStart().match(/^(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/i);
        if (dmlMatch) {
          throw new Error(`Oracle (Globus) e read-only. Operacao bloqueada: ${dmlMatch[1]}`);
        }

        const sqlExpandido = expandirPlaceholders(sql);
        // Separa opcoes de telemetria das que vao pro oracledb
        const { queryName = 'sem_nome', syncJobId = null, ...oracleOpts } = options;
        const bindsCount = Array.isArray(binds)
          ? binds.length
          : binds && typeof binds === 'object'
            ? Object.keys(binds).length
            : 0;

        const inicio = Date.now();
        let linhas: number | null = null;
        let erroMensagem: string | null = null;
        let resultado: Result<T> | null = null;

        const connection = await pool.getConnection();
        try {
          resultado = await connection.execute<T>(sqlExpandido, binds, {
            outFormat: oracledb.OUT_FORMAT_OBJECT,
            autoCommit: false,
            ...oracleOpts,
          });
          linhas = resultado.rows?.length ?? 0;
          return resultado;
        } catch (err) {
          erroMensagem = (err as Error).message;
          throw err;
        } finally {
          await connection.close();
          const duracaoMs = Date.now() - inicio;
          // Fire-and-forget: nao bloqueia o caller.
          void gravarLog({ queryName, syncJobId, sqlExpandido, duracaoMs, linhas, erroMensagem, bindsCount });
        }
      },
    };

    fastify.decorate('oracle', client);

    fastify.addHook('onClose', async () => {
      if (pool) {
        try {
          await pool.close(10);
          fastify.log.info('Pool Oracle encerrado');
        } catch (err) {
          fastify.log.warn({ err }, 'Erro ao fechar pool Oracle');
        }
      }
    });
  },
  { name: 'oracle', dependencies: ['config', 'db'] },
);
