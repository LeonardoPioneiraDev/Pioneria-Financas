'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#6b5d1a] via-[#7d6b1e] to-[#6b5d1a] dark:from-gray-100 dark:via-white dark:to-gray-100 bg-clip-text text-transparent">
          Bem-vindo(a), {user?.nomeCompleto.split(' ')[0]}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Painel inicial - mais modulos chegam nas proximas fases do roadmap.</p>
      </div>

      <Card className="p-6">
        <CardHeader className="p-0 mb-4">
          <CardTitle>Em construcao</CardTitle>
          <CardDescription>
            Esta tela e um placeholder. As fases F1 a F5 do roadmap em Leia/06_ROADMAP.md trazem caixa, recebiveis GDF, folha, DRE,
            orcamento e painel CFO.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <li>- Login e cadastro de usuarios funcionando (admin pode convidar pelo menu Usuarios)</li>
            <li>- Email de convite e recuperacao via Mailhog em desenvolvimento (porta 8025)</li>
            <li>- Metricas de request e atividade sendo capturadas em audit.request_logs / audit.user_activity_logs</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
