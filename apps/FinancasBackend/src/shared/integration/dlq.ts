import type { FastifyInstance } from 'fastify';
import { SyncError, type SyncErrorFase } from '@/entities/sync-error.entity.js';

/**
 * Argumentos para registrar uma falha na DLQ.
 *
 * `chaveNatural` e o que diferencia 1 registro do outro dentro do mesmo
 * recurso — usado para detectar retentativas (o mesmo `(sistema, recurso,
 * chave_natural)` no mesmo dia incrementa `tentativas` em vez de criar nova
 * linha).
 */
export interface RegistrarErroSyncArgs {
  fastify: FastifyInstance;
  sistema: string;
  recurso: string;
  fase: SyncErrorFase;
  syncJobId?: string | null;
  chaveNatural?: Record<string, unknown> | null;
  rawPayload?: Record<string, unknown> | null;
  erro: unknown;
}

/**
 * Trunca um stack trace para no maximo 200 linhas (evita TEXT gigante).
 */
function truncarStack(stack: string | undefined, maxLinhas = 200): string | null {
  if (!stack) return null;
  const linhas = stack.split('\n');
  if (linhas.length <= maxLinhas) return stack;
  return [...linhas.slice(0, maxLinhas), `... (+${linhas.length - maxLinhas} linhas omitidas)`].join('\n');
}

/**
 * Registra uma falha na DLQ (`integration.sync_errors`).
 *
 * - Se ja existe linha com mesma `(sistema, recurso, chave_natural)` e
 *   `resolvido_em IS NULL`, incrementa `tentativas` e atualiza `atualizado_em`.
 * - Caso contrario, cria nova linha.
 *
 * Falhas dentro deste helper sao logadas como warn e NAO propagam — DLQ nao
 * pode causar cascade failure. Vale a aposta: melhor perder um registro de
 * erro do que derrubar o sync inteiro por causa de log.
 */
export async function registrarErroSync(args: RegistrarErroSyncArgs): Promise<void> {
  const { fastify, sistema, recurso, fase, syncJobId, chaveNatural, rawPayload, erro } = args;
  const err = erro as Error & { code?: string };
  const erroMensagem = err?.message ?? String(erro);
  const erroCodigo = err?.code ?? null;
  const erroStack = truncarStack(err?.stack);

  try {
    const repo = fastify.db.getRepository(SyncError);

    // Tenta encontrar entrada pendente com a mesma chave natural pra incrementar tentativas.
    // Comparamos via JSONB equality - ::jsonb cast garante normalizacao.
    const chaveJson = chaveNatural ? JSON.stringify(chaveNatural) : null;
    const existente = chaveJson
      ? await repo.query<Array<{ id: string; tentativas: number }>>(
          `SELECT id, tentativas
             FROM integration.sync_errors
            WHERE sistema = $1 AND recurso = $2
              AND chave_natural = $3::jsonb
              AND resolvido_em IS NULL
            ORDER BY criado_em DESC
            LIMIT 1`,
          [sistema, recurso, chaveJson],
        )
      : [];

    if (existente.length > 0) {
      const id = existente[0]!.id;
      await repo.query(
        `UPDATE integration.sync_errors
            SET tentativas = tentativas + 1,
                erro_mensagem = $2,
                erro_codigo = $3,
                erro_stack = $4,
                fase = $5,
                sync_job_id = $6,
                raw_payload = COALESCE($7::jsonb, raw_payload),
                atualizado_em = NOW()
          WHERE id = $1`,
        [id, erroMensagem, erroCodigo, erroStack, fase, syncJobId ?? null, rawPayload ? JSON.stringify(rawPayload) : null],
      );
      return;
    }

    await repo.query(
      `INSERT INTO integration.sync_errors
         (sync_job_id, sistema, recurso, fase, chave_natural, raw_payload,
          erro_mensagem, erro_codigo, erro_stack, tentativas)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, 1)`,
      [
        syncJobId ?? null,
        sistema,
        recurso,
        fase,
        chaveJson,
        rawPayload ? JSON.stringify(rawPayload) : null,
        erroMensagem,
        erroCodigo,
        erroStack,
      ],
    );
  } catch (logErr) {
    fastify.log.warn(
      { err: logErr, sistema, recurso, fase, erroOriginal: erroMensagem },
      '[dlq] falha ao gravar sync_error (nao critico — erro original preservado no log)',
    );
  }
}

/**
 * Marca como resolvidos automaticamente todos os erros de uma chave que foram
 * resolvidos com sucesso no sync atual.
 *
 * Use ao processar uma linha que estava no DLQ: se chegou sem erro, marca como
 * resolved. Idempotente — pode chamar mesmo se nao havia erro.
 */
export async function resolverErrosSyncAutomatico(args: {
  fastify: FastifyInstance;
  sistema: string;
  recurso: string;
  chaveNatural: Record<string, unknown>;
}): Promise<void> {
  const { fastify, sistema, recurso, chaveNatural } = args;
  try {
    await fastify.db.query(
      `UPDATE integration.sync_errors
          SET resolvido_em = NOW(),
              resolvido_por = 'automatico',
              atualizado_em = NOW()
        WHERE sistema = $1
          AND recurso = $2
          AND chave_natural = $3::jsonb
          AND resolvido_em IS NULL`,
      [sistema, recurso, JSON.stringify(chaveNatural)],
    );
  } catch (err) {
    fastify.log.warn({ err, sistema, recurso }, '[dlq] falha ao marcar erro como resolvido (nao critico)');
  }
}
