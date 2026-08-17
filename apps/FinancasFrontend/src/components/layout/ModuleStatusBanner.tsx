'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Info } from 'lucide-react';
import { statusModulo, STATUS_COR } from '@/lib/module-status';
import { cn } from '@/lib/utils';

/**
 * Banner discreto no topo de páginas reais/parciais, mostrando o status do
 * módulo e o que ainda não foi implementado. Expansível via accordion.
 *
 * Quando `status === 'pronto'`, exibe só se houver features pendentes (default
 * recolhido). Quando `status === 'parcial'`, banner mais destacado (amarelo).
 */
export function ModuleStatusBanner({ href }: { href: string }) {
  const modulo = statusModulo(href);
  const [aberto, setAberto] = useState(false);

  if (!modulo) return null;
  if (modulo.status === 'planejado') return null; // usar PlaceholderModule pra esses

  const cor = STATUS_COR[modulo.status];
  const pendentes = modulo.features.filter((f) => !f.ok);
  if (pendentes.length === 0) return null; // sem pendentes, não polui

  // Desativado por decisão (a pedido, sem uso etc.) != trabalho ainda não feito.
  const emDesenvolvimento = pendentes.filter((f) => !f.desativado);
  const desativados = pendentes.filter((f) => f.desativado);

  const total = modulo.features.length;
  const prontas = total - pendentes.length;

  return (
    <div
      className={cn(
        'rounded-md border text-xs',
        cor.border,
        modulo.status === 'parcial' ? cor.bg : 'bg-gray-50/40 dark:bg-gray-900/30',
      )}
    >
      <button
        type="button"
        onClick={() => setAberto(!aberto)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors"
      >
        <Info className={cn('h-3.5 w-3.5 shrink-0', cor.text)} />
        <div className="flex items-center gap-2 flex-1 min-w-0 text-left">
          <span className={cn('font-medium', cor.text)}>{cor.label}</span>
          <span className="text-gray-500 dark:text-gray-400">·</span>
          <span className="text-gray-600 dark:text-gray-300">
            <span className="font-medium text-emerald-700 dark:text-emerald-400">{prontas}</span>
            <span className="mx-0.5">/</span>
            <span className="font-medium">{total}</span>
            <span className="ml-1">funcionalidades prontas</span>
          </span>
          {emDesenvolvimento.length > 0 && (
            <span className="text-gray-500 dark:text-gray-400 hidden sm:inline">
              · {emDesenvolvimento.length} ainda em desenvolvimento
            </span>
          )}
          {desativados.length > 0 && (
            <span className="text-gray-500 dark:text-gray-400 hidden sm:inline">
              · {desativados.length} desativada{desativados.length > 1 ? 's' : ''} a pedido
            </span>
          )}
        </div>
        {aberto ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
      </button>
      {aberto && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-800 space-y-2">
          {emDesenvolvimento.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                Ainda em desenvolvimento
              </p>
              <ul className="space-y-1">
                {emDesenvolvimento.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                    <span className="text-gray-300 dark:text-gray-600 shrink-0">○</span>
                    <span>{f.texto}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {desativados.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">
                Desativadas a pedido
              </p>
              <ul className="space-y-1">
                {desativados.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                    <span className="text-gray-300 dark:text-gray-600 shrink-0">⊘</span>
                    <span>{f.texto}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
