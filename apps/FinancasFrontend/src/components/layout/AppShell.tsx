'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { AppHeader } from './AppHeader';
import { Sidebar } from './Sidebar';
import { buildNavigationGroups } from './navigation';
import { useAuth } from '@/contexts/AuthContext';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);

  const navigationGroups = useMemo(() => {
    if (!user) return [];
    return buildNavigationGroups(user.role);
  }, [user]);

  const handleLogout = (): void => {
    void logout();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        isSidebarExpanded={isSidebarExpanded}
        handleLogout={handleLogout}
        navigationGroups={navigationGroups}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          isSidebarExpanded={isSidebarExpanded}
          setIsSidebarExpanded={setIsSidebarExpanded}
          navigationGroups={navigationGroups}
          handleLogout={handleLogout}
        />

        <main className="flex-1 overflow-y-auto transition-all duration-300">
          <div className="mx-auto max-w-[1800px] w-full px-3 py-4 sm:px-6 sm:py-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
