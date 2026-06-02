'use client';

import { Moon, Sun } from 'lucide-react';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

interface AuthShellProps {
  titulo: string;
  subtitulo?: string;
  children: ReactNode;
}

export function AuthShell({ titulo, subtitulo, children }: AuthShellProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col text-gray-900 dark:text-gray-100 transition-colors duration-500">
      <div className="flex-1 flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <div className="relative group">
            <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-[#fbcc2c]/45 via-[#e6cd4a]/40 to-[#ecd43c]/45 dark:from-yellow-500/20 dark:via-amber-500/15 dark:to-yellow-400/20 opacity-60 dark:opacity-40 blur-2xl group-hover:opacity-80 dark:group-hover:opacity-50 transition-opacity duration-500" />

            <div className="relative border-2 border-white/20 dark:border-yellow-500/20 shadow-2xl shadow-yellow-600/10 dark:shadow-[0_8px_24px_-8px_rgba(251,191,36,0.15)] bg-white/80 dark:bg-gray-900/95 backdrop-blur-lg transition-all duration-500 rounded-3xl overflow-hidden">
              <div className="text-center pt-8 pb-6 px-6">
                <div className="flex flex-col items-center mb-4">
                  <div className="relative mb-4">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#fbcc2c]/45 to-[#ecd43c]/35 dark:bg-yellow-400/30 blur-3xl animate-pulse" />
                    <div className="absolute inset-0 rounded-full bg-[#e6cd4a]/28 dark:bg-amber-400/15 blur-xl" />
                    <div className="relative p-1.5 rounded-full bg-gradient-to-br from-[#fbcc2c]/22 via-[#d4cc54]/18 to-[#ecd43c]/22 dark:from-yellow-400/10 dark:to-amber-400/10 shadow-inner">
                      <div className="relative mx-auto h-20 w-20 sm:h-24 sm:w-24 rounded-full ring-2 ring-white/50 ring-offset-2 ring-offset-white/80 dark:ring-yellow-400/40 dark:ring-offset-gray-900/50 shadow-lg overflow-hidden">
                        <Image src="/logo.png" alt="Viacao Pioneira" fill sizes="96px" className="object-contain" priority />
                      </div>
                    </div>
                  </div>
                  <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">
                    Viacao Pioneira Ltda
                  </div>
                </div>

                <h1 className="text-3xl sm:text-4xl font-bold bg-gradient-to-r from-[#6b5d1a] via-[#7d6b1e] to-[#6b5d1a] dark:from-gray-100 dark:via-white dark:to-gray-100 bg-clip-text text-transparent mb-2">
                  {titulo}
                </h1>
                {subtitulo && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{subtitulo}</p>
                )}
              </div>

              <button
                type="button"
                onClick={toggleTheme}
                className="absolute top-5 right-5 p-3 rounded-full bg-gray-100/50 hover:bg-gray-100/80 dark:bg-yellow-500/15 dark:hover:bg-yellow-500/25 border border-gray-200/50 dark:border-yellow-400/20 shadow-sm hover:shadow-md transition-all duration-500 group hover:scale-110"
                aria-label={`Alternar para tema ${theme === 'dark' ? 'claro' : 'escuro'}`}
              >
                {theme === 'dark' ? (
                  <Sun className="h-5 w-5 text-[#c7cd69] dark:text-yellow-300 group-hover:rotate-180 transition-transform duration-500" />
                ) : (
                  <Moon className="h-5 w-5 text-[#c7cd69] dark:text-yellow-300 group-hover:-rotate-[30deg] transition-transform duration-500" />
                )}
              </button>

              <div className="px-8 pb-8">{children}</div>
            </div>
          </div>
        </div>
      </div>

      <footer className="w-full py-6 text-center text-sm text-gray-500 dark:text-gray-500 font-medium">
        Â© {new Date().getFullYear()} Viacao Pioneira Ltda. Todos os direitos reservados.
      </footer>
    </div>
  );
}
