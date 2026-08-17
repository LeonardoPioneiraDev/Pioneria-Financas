'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/hooks/useBranding';
import { useRessalvasAbertas } from '@/hooks/useRessalvasAbertas';
import { cn } from '@/lib/utils';
import { statusModulo, STATUS_COR } from '@/lib/module-status';
import type { NavigationGroup } from './navigation';

interface SidebarProps {
  isSidebarExpanded: boolean;
  setIsSidebarExpanded: (expanded: boolean) => void;
  navigationGroups: NavigationGroup[];
  handleLogout: () => void;
}

export function Sidebar({ isSidebarExpanded, setIsSidebarExpanded, navigationGroups, handleLogout }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { logoSrc, nomeFantasia } = useBranding();
  const ressalvasAbertas = useRessalvasAbertas();

  return (
    <aside
      className={cn(
        'hidden custom-md:flex flex-col shrink-0 border-r border-gray-200 dark:border-yellow-400/20 bg-white/80 dark:bg-black/60 backdrop-blur-md transition-all duration-300',
        isSidebarExpanded ? 'custom-md:w-60' : 'custom-md:w-[68px]',
      )}
    >
      <div className="flex h-full flex-col">
        <div
          className={cn(
            'flex h-14 shrink-0 items-center border-b border-gray-200 dark:border-yellow-400/20',
            isSidebarExpanded ? 'px-4 justify-between' : 'justify-center',
          )}
        >
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              alt={nomeFantasia}
              width={28}
              height={28}
              className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-pioneira-400/30"
            />
            {isSidebarExpanded && (
              <span className="text-sm font-bold text-pioneira-900 dark:text-yellow-300 truncate">Finanças</span>
            )}
          </Link>
          <button
            type="button"
            className="p-1 rounded-md text-gray-400 dark:text-yellow-300/60 hover:text-gray-600 dark:hover:text-yellow-200 hover:bg-gray-100 dark:hover:bg-yellow-400/10 transition-colors"
            onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
            aria-label={isSidebarExpanded ? 'Recolher menu' : 'Expandir menu'}
          >
            {isSidebarExpanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-2 scrollbar-thin">
          {navigationGroups.map((group, gi) => (
            <div key={group.label} className={gi > 0 ? 'mt-4' : ''}>
              {isSidebarExpanded ? (
                <div className="px-2 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-yellow-400/50">
                    {group.label}
                  </span>
                </div>
              ) : (
                <div className="flex justify-center mb-1">
                  <div className="w-5 border-t border-gray-200 dark:border-yellow-400/15" />
                </div>
              )}

              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const ativo = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  const modulo = statusModulo(item.href);
                  const corStatus = modulo ? STATUS_COR[modulo.status] : null;
                  const temRessalva = item.href === '/validacoes' && ressalvasAbertas > 0;
                  const tituloComStatus = !isSidebarExpanded
                    ? modulo
                      ? `${item.name} — ${corStatus!.label}`
                      : item.name
                    : undefined;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={tituloComStatus}
                        className={cn(
                          'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-all duration-150',
                          ativo
                            ? 'bg-pioneira-400/20 text-pioneira-900 dark:bg-yellow-400 dark:text-gray-900 shadow-sm'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-yellow-400/10 hover:text-gray-900 dark:hover:text-yellow-200',
                          !isSidebarExpanded && 'justify-center',
                        )}
                      >
                        <span className="relative shrink-0">
                          <Icon
                            className={cn(
                              'h-[18px] w-[18px] shrink-0',
                              ativo
                                ? 'text-pioneira-800 dark:text-gray-900'
                                : 'text-gray-400 dark:text-gray-400 group-hover:text-gray-600 dark:group-hover:text-yellow-300',
                            )}
                          />
                          {/* Com a sidebar recolhida, o contador vira um ponto no ícone. */}
                          {temRessalva && !isSidebarExpanded && (
                            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-black" />
                          )}
                        </span>
                        {isSidebarExpanded && (
                          <>
                            <span className="truncate flex-1">{item.name}</span>
                            {temRessalva && (
                              <span
                                title={`${ressalvasAbertas} ressalva(s) de auditoria sem resposta`}
                                className="shrink-0 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white"
                              >
                                {ressalvasAbertas}
                              </span>
                            )}
                            {corStatus && (
                              <span
                                aria-label={corStatus.label}
                                title={corStatus.label}
                                className={cn(
                                  'h-1.5 w-1.5 rounded-full shrink-0',
                                  corStatus.dot,
                                  modulo!.status === 'pronto' && 'shadow-[0_0_4px_currentColor]',
                                )}
                              />
                            )}
                          </>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Legenda de status — visivel apenas quando expandido */}
        {isSidebarExpanded && (
          <div className="border-t border-gray-200 dark:border-yellow-400/20 px-3 py-2">
            <div className="text-[9px] uppercase tracking-wider text-gray-400 dark:text-yellow-400/40 mb-1.5">
              Status dos módulos
            </div>
            <div className="space-y-0.5 text-[10px]">
              <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span>Em produção</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                <span>Em construção</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-600" />
                <span>Planejado</span>
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-gray-200 dark:border-yellow-400/20 p-3">
          <div className={cn('flex items-center', isSidebarExpanded ? 'gap-2.5' : 'justify-center')}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pioneira-100 dark:bg-yellow-400 text-sm font-semibold text-pioneira-800 dark:text-gray-900">
              {user?.nomeCompleto?.charAt(0)?.toUpperCase()}
            </div>
            {isSidebarExpanded && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-pioneira-900 dark:text-yellow-300 truncate">
                  {user?.nomeCompleto}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-yellow-300/60 capitalize truncate">{user?.role}</p>
              </div>
            )}
          </div>
          {isSidebarExpanded ? (
            <button
              onClick={handleLogout}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-yellow-400/30 bg-white dark:bg-yellow-400/10 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-yellow-300 hover:bg-gray-50 dark:hover:bg-yellow-400/20 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          ) : (
            <button
              onClick={handleLogout}
              title="Sair"
              className="mt-2 flex w-full items-center justify-center p-1.5 rounded-lg text-gray-400 dark:text-yellow-300/60 hover:bg-gray-100 dark:hover:bg-yellow-400/10 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
