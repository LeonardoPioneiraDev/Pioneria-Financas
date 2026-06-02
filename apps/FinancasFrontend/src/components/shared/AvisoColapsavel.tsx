'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, X, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

type Severidade = 'info' | 'aviso' | 'critico';

interface AvisoColapsavelProps {
  /** Tom visual do aviso. */
  severidade: Severidade;
  /** Ícone que aparece no aviso completo e na pílula colapsada. */
  icone: LucideIcon;
  /** Título curto exibido na pílula quando colapsado (e usado como tooltip). */
  tituloPilula: string;
  /** Segundos até auto-colapsar. Padrão: 10. Use 0 para nunca auto-colapsar. */
  delaySegundos?: number;
  /** Conteúdo do aviso completo (parágrafo, lista, etc). */
  children: ReactNode;
}

const ESTILOS: Record<Severidade, {
  borda: string;
  bg: string;
  texto: string;
  iconeCor: string;
  barraBg: string;
  pilulaBg: string;
  pilulaHover: string;
  pulso: string;
}> = {
  info: {
    borda: 'border-blue-300 dark:border-blue-700',
    bg: 'bg-blue-50/60 dark:bg-blue-950/30',
    texto: 'text-blue-900 dark:text-blue-200',
    iconeCor: 'text-blue-600 dark:text-blue-400',
    barraBg: 'bg-blue-500 dark:bg-blue-400',
    pilulaBg: 'bg-blue-100/80 dark:bg-blue-950/40',
    pilulaHover: 'hover:bg-blue-200/80 dark:hover:bg-blue-900/40',
    pulso: 'bg-blue-400/40',
  },
  aviso: {
    borda: 'border-amber-300 dark:border-amber-700',
    bg: 'bg-amber-50/60 dark:bg-amber-950/30',
    texto: 'text-amber-900 dark:text-amber-200',
    iconeCor: 'text-amber-600 dark:text-amber-400',
    barraBg: 'bg-amber-500 dark:bg-amber-400',
    pilulaBg: 'bg-amber-100/80 dark:bg-amber-950/40',
    pilulaHover: 'hover:bg-amber-200/80 dark:hover:bg-amber-900/40',
    pulso: 'bg-amber-400/40',
  },
  critico: {
    borda: 'border-red-300 dark:border-red-700',
    bg: 'bg-red-50/60 dark:bg-red-950/20',
    texto: 'text-red-900 dark:text-red-200',
    iconeCor: 'text-red-600 dark:text-red-400',
    barraBg: 'bg-red-500 dark:bg-red-400',
    pilulaBg: 'bg-red-100/80 dark:bg-red-950/30',
    pilulaHover: 'hover:bg-red-200/80 dark:hover:bg-red-900/30',
    pulso: 'bg-red-400/40',
  },
};

export function AvisoColapsavel({
  severidade,
  icone: Icone,
  tituloPilula,
  delaySegundos = 10,
  children,
}: AvisoColapsavelProps) {
  const [expandido, setExpandido] = useState(true);
  const [mostrouCompleto, setMostrouCompleto] = useState(false);
  const cores = ESTILOS[severidade];

  useEffect(() => {
    if (delaySegundos <= 0) return;
    const t = window.setTimeout(() => {
      setExpandido(false);
      setMostrouCompleto(true);
    }, delaySegundos * 1000);
    return () => window.clearTimeout(t);
  }, [delaySegundos]);

  if (!expandido) {
    return (
      <div className="flex">
        <button
          type="button"
          onClick={() => setExpandido(true)}
          title={`${tituloPilula} · clique para reabrir o aviso completo`}
          aria-label={`Reabrir aviso: ${tituloPilula}`}
          className={`group inline-flex items-center gap-1.5 rounded-full border ${cores.borda} ${cores.pilulaBg} ${cores.pilulaHover} px-2.5 py-1 text-[11px] font-medium ${cores.texto} transition-all relative`}
        >
          {mostrouCompleto && (
            <span className={`absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ${cores.pulso}`} />
          )}
          <Icone className={`h-3.5 w-3.5 ${cores.iconeCor}`} />
          <span>{tituloPilula}</span>
          <ChevronDown className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>
    );
  }

  return (
    <Card className={`p-3 sm:p-4 ${cores.borda} ${cores.bg} relative animate-in fade-in slide-in-from-top-2 duration-300`}>
      <button
        type="button"
        onClick={() => {
          setExpandido(false);
          setMostrouCompleto(true);
        }}
        title="Recolher aviso"
        aria-label="Recolher aviso"
        className={`absolute right-2 top-2 p-1 rounded-full ${cores.texto} opacity-50 hover:opacity-100 transition-opacity`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-start gap-3 pr-7">
        <Icone className={`h-5 w-5 shrink-0 ${cores.iconeCor} mt-0.5`} />
        <div className={`text-xs sm:text-sm leading-relaxed ${cores.texto}`}>
          {children}
        </div>
      </div>
      {delaySegundos > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden rounded-b-xl">
          <div
            className={`h-full ${cores.barraBg} opacity-40 origin-left animate-[aviso-barra_var(--aviso-dur)_linear_forwards]`}
            style={{ ['--aviso-dur' as string]: `${delaySegundos}s` }}
          />
        </div>
      )}
    </Card>
  );
}
