'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useBranding } from '@/hooks/useBranding';
import { useRessalvasAbertas } from '@/hooks/useRessalvasAbertas';
import { cn } from '@/lib/utils';
import { Notificacoes } from './Notificacoes';
import type { NavigationGroup } from './navigation';

interface AppHeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  isSidebarExpanded: boolean;
  handleLogout: () => void;
  navigationGroups: NavigationGroup[];
}

export function AppHeader({
  sidebarOpen,
  setSidebarOpen,
  isSidebarExpanded,
  handleLogout,
  navigationGroups,
}: AppHeaderProps) {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const { logoSrc, nomeFantasia } = useBranding();
  const ressalvasAbertas = useRessalvasAbertas();

  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sidebarOpen]);

  return (
    <>
      <header className="sticky top-0 z-30 h-14 border-b border-gray-200 dark:border-yellow-400/20 bg-white/90 dark:bg-black/70 px-4 backdrop-blur-md sm:px-6 transition-colors duration-300">
        <div className="h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="custom-md:hidden -ml-1 p-1.5 rounded-lg text-gray-600 dark:text-yellow-300 hover:bg-gray-100 dark:hover:bg-yellow-400/10 transition-colors"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? 'Fechar menu' : 'Abrir menu'}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <Link href="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoSrc}
                alt={nomeFantasia}
                width={28}
                height={28}
                className="h-7 w-7 rounded-full object-cover ring-1 ring-pioneira-300/50 dark:ring-yellow-400/30"
              />
              <span className="hidden sm:block text-sm font-semibold text-pioneira-900 dark:text-yellow-300">
                {nomeFantasia}
              </span>
            </Link>
          </div>

          <h1 className="absolute left-1/2 -translate-x-1/2 text-sm font-bold text-pioneira-900 dark:text-yellow-300 sm:text-base truncate max-w-[200px] sm:max-w-none">
            Pioneira Finanças
          </h1>

          <div className="flex items-center gap-2">
            <Notificacoes />

            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-yellow-400/10 transition-colors"
              aria-label="Alternar tema"
            >
              {theme === 'dark' ? (
                <Sun className="h-[18px] w-[18px] text-yellow-400" />
              ) : (
                <Moon className="h-[18px] w-[18px] text-gray-500" />
              )}
            </button>

            {!isSidebarExpanded && (
              <div className="hidden custom-md:flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-pioneira-100 dark:bg-yellow-400 text-xs font-semibold text-pioneira-800 dark:text-gray-900">
                  {user?.nomeCompleto?.charAt(0)?.toUpperCase()}
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-yellow-400/30 bg-white dark:bg-yellow-400/10 px-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-yellow-300 hover:bg-gray-50 dark:hover:bg-yellow-400/20 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {sidebarOpen && (
        <div
          className="fixed inset-0 top-14 z-40 custom-md:hidden"
          onClick={() => setSidebarOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div
            className="absolute left-0 top-0 bottom-0 w-72 max-w-[80vw] bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-yellow-400/20 shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-thin">
              {navigationGroups.map((group, gi) => (
                <div key={group.label} className={gi > 0 ? 'mt-5' : ''}>
                  <div className="px-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-yellow-400/50">
                      {group.label}
                    </span>
                  </div>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => {
                      const ativo = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      const Icon = item.icon;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setSidebarOpen(false)}
                            className={cn(
                              'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
                              ativo
                                ? 'bg-pioneira-400/20 text-pioneira-900 dark:bg-yellow-400 dark:text-gray-900 shadow-sm'
                                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-yellow-400/10 hover:text-gray-900 dark:hover:text-yellow-200',
                            )}
                          >
                            <Icon
                              className={cn(
                                'h-[18px] w-[18px] shrink-0',
                                ativo
                                  ? 'text-pioneira-800 dark:text-gray-900'
                                  : 'text-gray-400 dark:text-gray-400 group-hover:text-gray-600 dark:group-hover:text-yellow-300',
                              )}
                            />
                            <span className="flex-1">{item.name}</span>
                            {item.href === '/validacoes' && ressalvasAbertas > 0 && (
                              <span className="shrink-0 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                                {ressalvasAbertas}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>

            <div className="border-t border-gray-200 dark:border-yellow-400/20 p-3">
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pioneira-100 dark:bg-yellow-400 text-sm font-semibold text-pioneira-800 dark:text-gray-900">
                  {user?.nomeCompleto?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-pioneira-900 dark:text-yellow-300 truncate">
                    {user?.nomeCompleto}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-yellow-300/60 capitalize">{user?.role}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSidebarOpen(false);
                  handleLogout();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-yellow-400/30 bg-white dark:bg-yellow-400/10 px-3 py-2 text-sm font-medium text-gray-600 dark:text-yellow-300 hover:bg-gray-50 dark:hover:bg-yellow-400/20 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
