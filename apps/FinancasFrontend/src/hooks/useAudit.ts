'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import type { AcaoAuditoria } from '@pioneira/shared/schemas/audit';

interface RegistrarParams {
  acao: AcaoAuditoria;
  recurso: string;
  recursoId?: string;
  descricao?: string;
  filtros?: Record<string, unknown>;
}

/** Dispara um registro de acesso na trilha de auditoria. Fire-and-forget. */
export async function registrarAcesso(params: RegistrarParams): Promise<void> {
  try {
    await api.post('/api/audit/acessou', params);
  } catch {
    // fire-and-forget - falha de log nao afeta o usuario
  }
}

/**
 * Registra `visualizou` automaticamente quando o componente monta com `enabled=true`.
 * Util para paginas e dialogs de detalhe.
 */
export function useAuditView(params: RegistrarParams & { enabled?: boolean }) {
  const jaRegistrado = useRef(false);

  useEffect(() => {
    if (params.enabled === false) return;
    if (jaRegistrado.current) return;
    jaRegistrado.current = true;
    void registrarAcesso({
      acao: params.acao,
      recurso: params.recurso,
      recursoId: params.recursoId,
      descricao: params.descricao,
      filtros: params.filtros,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.recurso, params.recursoId, params.enabled]);
}

/**
 * Intercepta Ctrl+P, Cmd+P e window.print() registrando `imprimiu` antes do dialogo nativo.
 */
export function useTrackPrint(params: { recurso: string; recursoId?: string }) {
  useEffect(() => {
    const handler = (ev: KeyboardEvent): void => {
      const isPrintShortcut = (ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'p';
      if (isPrintShortcut) {
        void registrarAcesso({
          acao: 'imprimiu',
          recurso: params.recurso,
          recursoId: params.recursoId,
          descricao: `Atalho Ctrl+P em ${params.recurso}`,
        });
      }
    };
    const beforePrint = (): void => {
      void registrarAcesso({
        acao: 'imprimiu',
        recurso: params.recurso,
        recursoId: params.recursoId,
        descricao: `window.print em ${params.recurso}`,
      });
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('beforeprint', beforePrint);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('beforeprint', beforePrint);
    };
  }, [params.recurso, params.recursoId]);
}
