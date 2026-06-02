'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { Alert, AlertDescription, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, extrairMensagemErro } from '@/lib/api';

const schema = z.object({
  email: z.string().email('E-mail invalido'),
});
type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = form.handleSubmit(async (values) => {
    setErro(null);
    try {
      await api.post('/api/passwords/forgot', values);
      setEnviado(true);
    } catch (err) {
      setErro(extrairMensagemErro(err));
    }
  });

  return (
    <AuthShell
      titulo="Recuperar senha"
      subtitulo={enviado ? 'Verifique seu email' : 'Vamos enviar um link para voce redefinir'}
    >
      {enviado ? (
        <div className="space-y-6">
          <Alert className="border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <AlertTitle className="text-emerald-800 dark:text-emerald-300">Enviado</AlertTitle>
              <AlertDescription className="text-emerald-700 dark:text-emerald-400">
                Se o email existir, voce recebera um link de recuperacao em instantes. O link expira em 1 hora.
              </AlertDescription>
            </div>
          </Alert>
          <Button asChild variant="outline" size="lg" className="w-full h-12">
            <Link href="/login">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao login
            </Link>
          </Button>
        </div>
      ) : (
        <>
          {erro && (
            <Alert className="mb-6 border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20">
              <AlertIcon />
              <div>
                <AlertTitle className="text-red-800 dark:text-red-300">Erro</AlertTitle>
                <AlertDescription className="text-red-700 dark:text-red-400">{erro}</AlertDescription>
              </div>
            </Alert>
          )}
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail cadastrado</Label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-[#fbcc2c] dark:group-focus-within:text-yellow-400 transition-colors duration-300" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="seu.email@vpioneira.com.br"
                  className="pl-11 h-12"
                  {...form.register('email')}
                />
              </div>
              {form.formState.errors.email && (
                <p className="text-xs text-red-600 dark:text-red-400">{form.formState.errors.email.message}</p>
              )}
            </div>

            <Button type="submit" size="lg" disabled={form.formState.isSubmitting} className="w-full h-12">
              {form.formState.isSubmitting ? 'Enviando...' : 'Enviar link de recuperacao'}
            </Button>

            <Link
              href="/login"
              className="flex items-center justify-center gap-2 text-sm font-medium text-[#a89642] hover:text-[#c7cd69] dark:text-yellow-400 dark:hover:text-yellow-300 transition-colors duration-300"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao login
            </Link>
          </form>
        </>
      )}
    </AuthShell>
  );
}
