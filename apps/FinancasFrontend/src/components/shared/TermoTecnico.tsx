'use client';

import { useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Termo técnico com ícone (i) que ao passar o mouse mostra uma explicação
 * em linguagem leiga. Pra leitor não-financeiro entender sem sair da página.
 */
export function TermoTecnico({
  termo,
  explicacao,
  className,
}: {
  termo: ReactNode;
  explicacao: ReactNode;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <span className={cn('inline-flex items-center gap-1 relative', className)}>
      <span>{termo}</span>
      <button
        type="button"
        onMouseEnter={() => setAberto(true)}
        onMouseLeave={() => setAberto(false)}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onClick={() => setAberto((v) => !v)}
        aria-label={`O que significa ${typeof termo === 'string' ? termo : 'este termo'}`}
        className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full text-gray-400 hover:text-pioneira-700 dark:hover:text-yellow-400 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-pioneira-400 cursor-help"
      >
        <Info className="h-3 w-3" />
      </button>
      {aberto && (
        <span
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50 w-72 max-w-[90vw] rounded-lg bg-gray-900 text-gray-100 dark:bg-gray-100 dark:text-gray-900 px-3 py-2 text-xs leading-relaxed shadow-xl pointer-events-none normal-case font-normal"
        >
          {explicacao}
          <span
            aria-hidden
            className="absolute left-1/2 -top-1 -translate-x-1/2 h-2 w-2 rotate-45 bg-gray-900 dark:bg-gray-100"
          />
        </span>
      )}
    </span>
  );
}
