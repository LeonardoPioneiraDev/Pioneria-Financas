'use client';

import { useState, type ReactNode } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface HelpModalProps {
  /** Título do modal (ex.: "O que é INSS?"). */
  titulo: string;
  /** Tooltip do ícone — uma frase curta. Aparece ao passar mouse. */
  resumo?: string;
  /** Conteúdo detalhado dentro do modal. */
  children: ReactNode;
  /** Tamanho do ícone — sm (12px) ou md (14px). */
  tamanho?: 'sm' | 'md';
  /** Classe extra no botão. */
  className?: string;
}

/**
 * Botão "?" discreto que abre um modal com explicação.
 * Use para qualquer termo técnico/financeiro/contábil que o usuário possa não conhecer.
 *
 * @example
 *   <HelpModal titulo="O que é INSS?" resumo="Imposto previdenciário federal">
 *     <p>O INSS é uma contribuição obrigatória...</p>
 *   </HelpModal>
 */
export function HelpModal({ titulo, resumo, children, tamanho = 'sm', className }: HelpModalProps) {
  const [aberto, setAberto] = useState(false);
  const sz = tamanho === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3';

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setAberto(true); }}
        title={resumo ?? `Mais informações sobre ${titulo}`}
        aria-label={`Ajuda: ${titulo}`}
        className={cn(
          'inline-flex items-center justify-center align-middle rounded-full text-pioneira-700 dark:text-yellow-400 hover:bg-pioneira-100 dark:hover:bg-yellow-950/40 hover:text-pioneira-900 dark:hover:text-yellow-200 transition-colors p-0.5',
          className,
        )}
      >
        <HelpCircle className={sz} />
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogTitle className="text-pioneira-900 dark:text-yellow-200 pr-8">
            {titulo}
          </DialogTitle>
          <div className="mt-2 text-sm text-gray-700 dark:text-gray-300 leading-relaxed space-y-3">
            {children}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Wrapper conveniente para frases inline tipo "INSS [?]". */
export function TermoComAjuda({
  termo,
  children,
  resumo,
  titulo,
}: {
  termo: string;
  titulo?: string;
  resumo?: string;
  children: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      <span>{termo}</span>
      <HelpModal titulo={titulo ?? `O que é ${termo}?`} resumo={resumo}>
        {children}
      </HelpModal>
    </span>
  );
}
