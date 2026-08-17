'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import type { ValidateTokenResponse } from '@pioneira/shared/schemas/passwords';
import { AuthShell } from '@/components/auth/AuthShell';
import { Alert, AlertDescription, AlertIcon, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { api, extrairMensagemErro } from '@/lib/api';

const schema = z
  .object({
    novaSenha: z
      .string()
      .min(8, 'Senha precisa ter 8+ caracteres')
      .regex(/[a-z]/, 'Senha precisa ter letra minúscula')
      .regex(/[A-Z]/, 'Senha precisa ter letra maiúscula')
      .regex(/\d/, 'Senha precisa ter um número'),
    confirmar: z.string(),
  })
  .refine((data) => data.novaSenha === data.confirmar, {
    path: ['confirmar'],
    message: 'As senhas não coincidem',
  });

type FormValues = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const [validacao, setValidacao] = useState<ValidateTokenResponse | null>(null);
  const [verificando, setVerificando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { novaSenha: '', confirmar: '' } });

  useEffect(() => {
    api
      .get<ValidateTokenResponse>('/api/passwords/validate', { params: { token } })
      .then((res) => setValidacao(res.data))
      .catch(() => setValidacao({ valido: false }))
      .finally(() => setVerificando(false));
  }, [token]);

  const onSubmit = form.handleSubmit(async (values) => {
    setErro(null);
    try {
      await api.post('/api/passwords/reset', { token, novaSenha: values.novaSenha });
      setSucesso(true);
      setTimeout(() => router.replace('/login'), 2500);
    } catch (err) {
      setErro(extrairMensagemErro(err));
    }
  });

  if (verificando) {
    return (
      <AuthShell titulo="Verificando" subtitulo="Validando seu link de recuperação">
        <div className="flex justify-center py-6">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-transparent border-t-[#e6cd4a] dark:border-t-yellow-400" />
        </div>
      </AuthShell>
    );
  }

  if (!validacao?.valido) {
    return (
      <AuthShell titulo="Link inválido" subtitulo="Este link expirou ou já foi utilizado">
        <Alert className="mb-6 border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20">
          <AlertIcon />
          <div>
            <AlertTitle className="text-red-800 dark:text-red-300">Link não pode ser usado</AlertTitle>
            <AlertDescription className="text-red-700 dark:text-red-400">
              Solicite uma nova recuperação para receber um link válido.
            </AlertDescription>
          </div>
        </Alert>
        <div className="space-y-3">
          <Button asChild size="lg" className="w-full h-12">
            <Link href="/forgot-password">Solicitar novo link</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full h-12">
            <Link href="/login">
              <ArrowLeft className="h-4 w-4" />
              Voltar ao login
            </Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (sucesso) {
    return (
      <AuthShell titulo="Senha redefinida" subtitulo="Redirecionando para o login">
        <Alert className="border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <AlertTitle className="text-emerald-800 dark:text-emerald-300">Tudo certo</AlertTitle>
            <AlertDescription className="text-emerald-700 dark:text-emerald-400">
              Sua senha foi atualizada. Você já pode entrar com a nova credencial.
            </AlertDescription>
          </div>
        </Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell titulo="Redefinir senha" subtitulo={validacao.email ? `Para a conta ${validacao.email}` : undefined}>
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
          <Label htmlFor="novaSenha">Nova senha</Label>
          <PasswordInput id="novaSenha" autoComplete="new-password" placeholder="Mínimo 8 caracteres, com letra e número" {...form.register('novaSenha')} />
          {form.formState.errors.novaSenha && (
            <p className="text-xs text-red-600 dark:text-red-400">{form.formState.errors.novaSenha.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmar">Confirmar senha</Label>
          <PasswordInput id="confirmar" autoComplete="new-password" placeholder="Repita a nova senha" {...form.register('confirmar')} />
          {form.formState.errors.confirmar && (
            <p className="text-xs text-red-600 dark:text-red-400">{form.formState.errors.confirmar.message}</p>
          )}
        </div>

        <Button type="submit" size="lg" disabled={form.formState.isSubmitting} className="w-full h-12">
          {form.formState.isSubmitting ? 'Salvando...' : 'Redefinir senha'}
        </Button>
      </form>
    </AuthShell>
  );
}
