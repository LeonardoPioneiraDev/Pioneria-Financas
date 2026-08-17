'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Mail } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { Alert, AlertDescription, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { useAuth } from '@/contexts/AuthContext';
import { extrairMensagemErro } from '@/lib/api';

const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Informe sua senha'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (user && !loading) router.replace('/dashboard');
  }, [user, loading, router]);

  const onSubmit = form.handleSubmit(async (values) => {
    setErro(null);
    try {
      await login(values);
    } catch (err) {
      setErro(extrairMensagemErro(err, 'Não foi possível entrar. Verifique seus dados.'));
    }
  });

  if (loading) {
    return (
      <AuthShell titulo="Carregando" subtitulo="Verificando sua sessão">
        <div className="flex justify-center py-6">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-transparent border-t-[#e6cd4a] dark:border-t-yellow-400" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell titulo="Pioneira Finanças" subtitulo="Faça login para continuar">
      {erro && (
        <Alert className="mb-6 border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20">
          <AlertIcon />
          <div>
            <AlertTitle className="text-red-800 dark:text-red-300">Não foi possível entrar</AlertTitle>
            <AlertDescription className="text-red-700 dark:text-red-400">{erro}</AlertDescription>
          </div>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <div className="relative group">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-[#fbcc2c] dark:group-focus-within:text-yellow-400 transition-colors duration-300" />
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="seu.email@vpioneira.com.br"
              className="pl-11 h-12"
              {...form.register('email')}
            />
          </div>
          {form.formState.errors.email && (
            <p className="text-xs text-red-600 dark:text-red-400">{form.formState.errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <PasswordInput id="password" autoComplete="current-password" placeholder="Sua senha" {...form.register('password')} />
          {form.formState.errors.password && (
            <p className="text-xs text-red-600 dark:text-red-400">{form.formState.errors.password.message}</p>
          )}
        </div>

        <div className="flex items-center justify-end pt-1">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-[#a89642] hover:text-[#c7cd69] dark:text-yellow-400 dark:hover:text-yellow-300 transition-colors duration-300 hover:underline underline-offset-2"
          >
            Esqueci minha senha
          </Link>
        </div>

        <Button type="submit" size="lg" disabled={form.formState.isSubmitting} className="w-full h-12">
          {form.formState.isSubmitting ? (
            <span className="inline-flex items-center gap-3">
              <span className="animate-spin rounded-full h-5 w-5 border-3 border-white/30 border-t-white" />
              <span>Entrando...</span>
            </span>
          ) : (
            'Entrar'
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
