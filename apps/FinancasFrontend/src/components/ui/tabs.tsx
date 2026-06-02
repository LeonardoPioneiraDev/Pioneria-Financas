'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TabsCtx {
  value: string;
  onChange: (v: string) => void;
}
const Ctx = createContext<TabsCtx | null>(null);

function useTabs(): TabsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('Tabs.* deve ser usado dentro de <Tabs>');
  return ctx;
}

export function Tabs({
  value,
  onValueChange,
  children,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Ctx.Provider value={{ value, onChange: onValueChange }}>
      <div className={cn('w-full', className)}>{children}</div>
    </Ctx.Provider>
  );
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex items-center rounded-lg bg-gray-100 dark:bg-gray-900/60 p-1 gap-0.5 border border-gray-200 dark:border-gray-800',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  icon,
}: {
  value: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  const ctx = useTabs();
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={() => ctx.onChange(value)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
        active
          ? 'bg-white dark:bg-gray-950 text-pioneira-900 dark:text-yellow-300 shadow-sm ring-1 ring-pioneira-200 dark:ring-yellow-900/40'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-white/50 dark:hover:bg-gray-900/40',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useTabs();
  if (ctx.value !== value) return null;
  return (
    <div role="tabpanel" className={cn('mt-4', className)}>
      {children}
    </div>
  );
}
