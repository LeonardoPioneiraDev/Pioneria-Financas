import Link from 'next/link';
import { Construction, ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="max-w-md w-full p-10 flex flex-col items-center text-center gap-5">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-pioneira-400/30 dark:bg-yellow-400/20 blur-2xl" />
          <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center shadow-lg">
            <Construction className="h-10 w-10 text-pioneira-900 dark:text-gray-900" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent mb-2">
            Pagina em construcao
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            Esta rota ainda nao foi implementada. Os modulos previstos estao em{' '}
            <code className="text-xs px-1.5 py-0.5 rounded bg-pioneira-100 dark:bg-yellow-500/20 text-pioneira-800 dark:text-yellow-300">
              Leia/06_ROADMAP.md
            </code>
            .
          </p>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            Voltar ao dashboard
          </Link>
        </Button>
      </Card>
    </div>
  );
}
