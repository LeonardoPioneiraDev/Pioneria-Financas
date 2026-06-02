'use client';

import { ShieldCheck, Eye } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Indicador discreto mas sempre visível de que o acesso está sendo auditado.
 * Aparece em páginas sensíveis (folha, contas-pagar, etc).
 */
export function CompliancePill({ recurso }: { recurso?: string }) {
  const { user } = useAuth();
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full border border-emerald-300 dark:border-emerald-700 bg-emerald-50/80 dark:bg-emerald-950/30 px-2.5 py-1 text-[11px] font-medium text-emerald-800 dark:text-emerald-200"
      title={`Sessão auditada · usuário ${user?.nomeCompleto ?? '?'} · ${recurso ? `recurso ${recurso}` : 'sistema financeiro'} · todas as ações são registradas`}
    >
      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
      <span>Acesso registrado</span>
      <span className="hidden sm:inline-flex items-center gap-1 pl-2 ml-0.5 border-l border-emerald-300 dark:border-emerald-700">
        <Eye className="h-3 w-3" />
        <span className="font-semibold">{user?.nomeCompleto?.split(' ')[0]}</span>
      </span>
    </div>
  );
}
