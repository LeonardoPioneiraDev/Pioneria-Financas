'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Trash2, MailPlus, Power, PowerOff } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { UserCreatePayload, UserResponse } from '@pioneira/shared/schemas/users';
import { USER_ROLES, USER_ROLE_LABELS, type UserRole } from '@pioneira/shared/enums/user-role';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, extrairMensagemErro } from '@/lib/api';

interface PaginatedUsers {
  data: UserResponse[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const createSchema = z.object({
  email: z.string().email('E-mail invalido'),
  nomeCompleto: z.string().min(3, 'Minimo 3 caracteres'),
  role: z.enum(USER_ROLES),
});
type CreateFormValues = z.infer<typeof createSchema>;

export default function UsuariosPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading, refetch, isFetching } = useQuery<PaginatedUsers>({
    queryKey: ['usuarios', { page, search }],
    queryFn: async () => {
      const res = await api.get<PaginatedUsers>('/api/users', { params: { page, limit: 20, search: search || undefined } });
      return res.data;
    },
    placeholderData: (prev) => prev,
  });

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { email: '', nomeCompleto: '', role: 'operacional' },
  });

  const criarUsuario = useMutation({
    mutationFn: async (payload: UserCreatePayload) => {
      const res = await api.post<UserResponse>('/api/users', payload);
      return res.data;
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ['usuarios'] });
      const previo = qc.getQueryData<PaginatedUsers>(['usuarios', { page, search }]);
      if (previo) {
        const otimista: UserResponse = {
          id: `temp-${Date.now()}`,
          email: payload.email,
          nomeCompleto: payload.nomeCompleto,
          role: payload.role,
          ativo: true,
          ultimoLoginEm: null,
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
        };
        qc.setQueryData<PaginatedUsers>(['usuarios', { page, search }], {
          ...previo,
          data: [otimista, ...previo.data],
          pagination: { ...previo.pagination, total: previo.pagination.total + 1 },
        });
      }
      return { previo };
    },
    onError: (err, _payload, ctx) => {
      if (ctx?.previo) qc.setQueryData(['usuarios', { page, search }], ctx.previo);
      toast.error(extrairMensagemErro(err, 'Falha ao criar usuario'));
    },
    onSuccess: () => {
      toast.success('Usuario criado e convite enviado por email');
      void qc.invalidateQueries({ queryKey: ['usuarios'] });
      setDialogAberto(false);
      form.reset();
    },
  });

  const toggleAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      await api.patch(`/api/users/${id}`, { ativo });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['usuarios'] }),
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const reenviarConvite = useMutation({
    mutationFn: async (id: string) => api.post(`/api/users/${id}/resend-invite`),
    onSuccess: () => toast.success('Convite reenviado'),
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/users/${id}`),
    onSuccess: () => {
      toast.success('Usuario removido');
      void qc.invalidateQueries({ queryKey: ['usuarios'] });
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent">
            Usuarios
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Convide e gerencie quem acessa o sistema.</p>
        </div>

        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button size="lg" className="w-full sm:w-auto shrink-0">
              <Plus className="h-4 w-4" />
              <span>Novo usuario</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="mx-3 w-[calc(100%-1.5rem)] sm:w-full max-w-lg">
            <DialogHeader>
              <DialogTitle>Convidar novo usuario</DialogTitle>
              <DialogDescription>
                O usuario recebera um email com link para definir a senha (valido por 48h).
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((values) => criarUsuario.mutate(values))} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nomeCompleto">Nome completo</Label>
                <Input id="nomeCompleto" {...form.register('nomeCompleto')} />
                {form.formState.errors.nomeCompleto && (
                  <p className="text-xs text-red-600 dark:text-red-400">{form.formState.errors.nomeCompleto.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" {...form.register('email')} />
                {form.formState.errors.email && (
                  <p className="text-xs text-red-600 dark:text-red-400">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Cargo</Label>
                <Select value={form.watch('role')} onValueChange={(v) => form.setValue('role', v as UserRole)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {USER_ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
                <Button type="button" variant="outline" onClick={() => setDialogAberto(false)} disabled={criarUsuario.isPending} className="w-full sm:w-auto">
                  Cancelar
                </Button>
                <Button type="submit" disabled={criarUsuario.isPending} className="w-full sm:w-auto">
                  {criarUsuario.isPending ? 'Enviando...' : 'Enviar convite'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-3 sm:p-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <Input
            placeholder="Buscar por nome..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            className="flex-1 sm:max-w-sm"
          />
          <Button variant="ghost" size="icon" onClick={() => void refetch()} aria-label="Atualizar" className="shrink-0">
            <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
        </div>
      </Card>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuario</TableHead>
            <TableHead className="hidden sm:table-cell">Cargo</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Ultimo login</TableHead>
            <TableHead className="text-right">Acoes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-12 text-gray-500">
                Carregando...
              </TableCell>
            </TableRow>
          )}
          {!isLoading && data?.data.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-12 text-gray-500">
                Nenhum usuario encontrado.
              </TableCell>
            </TableRow>
          )}
          {data?.data.map((u) => (
            <TableRow key={u.id}>
              <TableCell className="font-medium">
                <div className="flex flex-col">
                  <span className="truncate">{u.nomeCompleto}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-normal truncate sm:hidden">
                    {u.email}
                  </span>
                  <span className="hidden sm:block text-xs text-gray-500 dark:text-gray-400 font-normal truncate">
                    {u.email}
                  </span>
                  <span className="sm:hidden mt-1">
                    <Badge variant="muted" className="text-[10px]">{USER_ROLE_LABELS[u.role]}</Badge>
                  </span>
                </div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                <Badge variant="muted">{USER_ROLE_LABELS[u.role]}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={u.ativo ? 'success' : 'danger'}>{u.ativo ? 'Ativo' : 'Inativo'}</Badge>
              </TableCell>
              <TableCell className="hidden lg:table-cell text-sm text-gray-500">
                {u.ultimoLoginEm ? format(new Date(u.ultimoLoginEm), 'dd/MM/yyyy HH:mm') : '-'}
              </TableCell>
              <TableCell className="text-right">
                <div className="inline-flex gap-0.5 sm:gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => reenviarConvite.mutate(u.id)}
                    title="Reenviar convite"
                    disabled={reenviarConvite.isPending}
                    className="h-8 w-8"
                  >
                    <MailPlus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleAtivo.mutate({ id: u.id, ativo: !u.ativo })}
                    disabled={toggleAtivo.isPending}
                    title={u.ativo ? 'Desativar' : 'Ativar'}
                    className="h-8 w-8"
                  >
                    {u.ativo ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4 text-emerald-500" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`Remover ${u.nomeCompleto}? Esta acao nao pode ser desfeita.`)) remover.mutate(u.id);
                    }}
                    disabled={remover.isPending}
                    title="Remover"
                    className="h-8 w-8"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-gray-600 dark:text-gray-400">
          <span className="text-xs sm:text-sm">
            Pag. {data.pagination.page}/{data.pagination.totalPages} - {data.pagination.total} {data.pagination.total === 1 ? 'usuario' : 'usuarios'}
          </span>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= data.pagination.totalPages}>
              Proxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
