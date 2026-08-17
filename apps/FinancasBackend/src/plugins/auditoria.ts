import fp from 'fastify-plugin';
import type { FastifyRequest } from 'fastify';
import type { AcaoAuditoria } from '@/entities/acesso-dados.entity.js';
import { obterIpDoCliente } from '@/shared/utils/client-ip.js';

export interface RegistrarAlteracaoArgs {
  usuarioId: string;
  /** Recurso alterado (ex.: 'orcamento', 'conta-bancaria', 'usuario'). */
  recurso: string;
  recursoId?: string | null;
  descricao?: string | null;
  /** Estado antes da alteracao (objeto simples campo→valor). */
  antes: Record<string, unknown>;
  /** Estado depois da alteracao. */
  depois: Record<string, unknown>;
  /** Acao registrada. Default 'editou'. */
  acao?: AcaoAuditoria;
  /** Campos a ignorar no diff (ex.: timestamps internos). */
  camposIgnorados?: readonly string[];
  /** Request, para capturar IP e user-agent. Opcional. */
  req?: FastifyRequest;
}

export interface AuditoriaDecorator {
  /**
   * Registra uma alteracao com diff campo-a-campo. Compara `antes`/`depois`,
   * guarda SO os campos que mudaram e grava uma linha em audit.acesso_dados.
   * Se nada mudou, nao grava nada. Best-effort: nunca lanca (uma falha de
   * auditoria nao pode derrubar a mutacao de negocio).
   */
  registrarAlteracao(args: RegistrarAlteracaoArgs): Promise<void>;
}

declare module 'fastify' {
  interface FastifyInstance {
    auditoria: AuditoriaDecorator;
  }
}

/** Compara dois valores por conteudo (estavel para objetos/datas via JSON). */
function iguais(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const na = a === undefined ? null : a;
  const nb = b === undefined ? null : b;
  if (na === null || nb === null) return na === nb;
  return JSON.stringify(na) === JSON.stringify(nb);
}

/** Calcula os campos alterados entre dois objetos. */
function calcularDiff(
  antes: Record<string, unknown>,
  depois: Record<string, unknown>,
  ignorar: readonly string[],
): { mudou: boolean; antes: Record<string, unknown>; depois: Record<string, unknown> } {
  const ig = new Set(ignorar);
  const chaves = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  const a: Record<string, unknown> = {};
  const d: Record<string, unknown> = {};
  let mudou = false;
  for (const k of chaves) {
    if (ig.has(k)) continue;
    const va = antes[k] ?? null;
    const vd = depois[k] ?? null;
    if (!iguais(va, vd)) {
      a[k] = va;
      d[k] = vd;
      mudou = true;
    }
  }
  return { mudou, antes: a, depois: d };
}

/**
 * Plugin de auditoria: helper para registrar alteracoes (diff campo-a-campo) na
 * trilha audit.acesso_dados. Usado pelas mutacoes reais de usuario (aprovacao,
 * meta de orcamento, ancora de saldo, conciliacao manual, admin de usuario).
 */
export const auditoriaPlugin = fp(
  async (fastify) => {
    fastify.decorate('auditoria', {
      async registrarAlteracao(args: RegistrarAlteracaoArgs): Promise<void> {
        try {
          const { mudou, antes, depois } = calcularDiff(args.antes, args.depois, args.camposIgnorados ?? []);
          if (!mudou) return;

          const ip = args.req ? obterIpDoCliente(args.req) : null;
          const userAgent = args.req?.headers['user-agent']?.slice(0, 500) ?? null;

          // INSERT parametrizado: as colunas jsonb (valores_antes/depois) sao
          // serializadas por JSON.stringify — o driver as grava direto em jsonb.
          await fastify.db.query(
            `INSERT INTO audit.acesso_dados
               (usuario_id, acao, recurso, recurso_id, descricao, valores_antes, valores_depois, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              args.usuarioId,
              (args.acao ?? 'editou') satisfies AcaoAuditoria,
              args.recurso,
              args.recursoId ?? null,
              args.descricao ?? null,
              JSON.stringify(antes),
              JSON.stringify(depois),
              ip,
              userAgent,
            ],
          );
        } catch (err) {
          fastify.log.warn({ err, recurso: args.recurso, recursoId: args.recursoId }, '[auditoria] falha ao registrar alteracao');
        }
      },
    } satisfies AuditoriaDecorator);
  },
  { name: 'auditoria', dependencies: ['db'] },
);
