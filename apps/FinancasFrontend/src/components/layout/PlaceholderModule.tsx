'use client';

import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, Circle, Clock, Database, HelpCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { statusModulo, STATUS_COR } from '@/lib/module-status';
import { cn } from '@/lib/utils';

interface PlaceholderModuleProps {
  /** Use o href da rota (ex: '/conciliacao') pra puxar tudo do MODULOS. */
  href?: string;
  /** Override (legado) — se nao passar `href`, usa esses props soltos. */
  titulo?: string;
  descricao?: string;
  fase?: string;
  icon?: LucideIcon;
}

export function PlaceholderModule(props: PlaceholderModuleProps) {
  const modulo = props.href ? statusModulo(props.href) : undefined;

  const titulo = modulo?.nome ?? props.titulo ?? 'Módulo';
  const descricao = modulo?.descricao ?? props.descricao ?? '';
  const fase = modulo?.fase ?? props.fase ?? '';
  const Icon = props.icon ?? Circle;
  const status = modulo?.status ?? 'planejado';
  const cor = STATUS_COR[status];

  return (
    <div className="space-y-4">
      {/* Cabecalho */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent flex items-center gap-3">
            <Icon className="h-7 w-7 text-pioneira-700 dark:text-yellow-400" />
            {titulo}
          </h1>
          {descricao && <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">{descricao}</p>}
        </div>
        <div className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium', cor.bg, cor.border, cor.text)}>
          <span className={cn('h-1.5 w-1.5 rounded-full', cor.dot)} />
          {cor.label}
          {fase && <span className="text-[10px] opacity-60">· {fase}</span>}
        </div>
      </div>

      {/* Resumo de progresso */}
      {modulo?.features && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300">
              Funcionalidades
            </h3>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                {modulo.features.filter((f) => f.ok).length}
              </span>
              <span className="mx-1">de</span>
              <span className="font-medium">{modulo.features.length}</span>
              <span className="ml-1">prontas</span>
            </div>
          </div>

          {/* Barra de progresso */}
          <div className="h-1.5 w-full bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all"
              style={{
                width: `${(modulo.features.filter((f) => f.ok).length / modulo.features.length) * 100}%`,
              }}
            />
          </div>

          {/* Lista */}
          <ul className="space-y-1.5">
            {modulo.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {f.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <Circle className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0 mt-0.5" />
                )}
                <span className={cn('flex-1', f.ok ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400')}>
                  {f.texto}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Fontes de dados */}
        {modulo?.fontesDados && modulo.fontesDados.length > 0 && (
          <Card className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-2 flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5" />
              Fontes de dados
            </h3>
            <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
              {modulo.fontesDados.map((f, i) => (
                <li key={i} className="font-mono text-xs">• {f}</li>
              ))}
            </ul>
          </Card>
        )}

        {/* Estimativa */}
        {modulo?.estimativaSemanas !== undefined && (
          <Card className="p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-2 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Estimativa
            </h3>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {modulo.estimativaSemanas} <span className="text-sm font-normal text-gray-500">{modulo.estimativaSemanas === 1 ? 'semana' : 'semanas'}</span>
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Após priorização e definição de escopo com o financeiro.
            </p>
          </Card>
        )}
      </div>

      {/* Perguntas para o financeiro */}
      {modulo?.perguntasFinanceiro && modulo.perguntasFinanceiro.length > 0 && (
        <Card className={cn('p-4 border-l-4', 'border-l-amber-400 dark:border-l-amber-600')}>
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-2 flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" />
            Perguntas para o financeiro (responder antes de construir)
          </h3>
          <ul className="space-y-2">
            {modulo.perguntasFinanceiro.map((p, i) => (
              <li key={i} className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2">
                <span className="text-amber-600 dark:text-amber-400 font-bold shrink-0">{i + 1}.</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 italic">
            Respondendo essas perguntas, conseguimos definir escopo, dados necessários e priorizar com clareza.
          </p>
        </Card>
      )}

      {/* Rodape com roadmap */}
      <div className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
        Cronograma completo em{' '}
        <code className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
          Leia/06_ROADMAP.md
        </code>
      </div>
    </div>
  );
}
