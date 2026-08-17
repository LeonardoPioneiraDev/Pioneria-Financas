'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Trash2, MailPlus, Power, PowerOff, ShieldCheck, Pencil, KeyRound, Copy, Check, ListChecks } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { format } from 'date-fns';
import type { UserCreatePayload, UserCreateResponse, UserResponse, RedefinirSenhaResponse } from '@pioneira/shared/schemas/users';
import { USER_ROLES, USER_ROLE_LABELS, type UserRole } from '@pioneira/shared/enums/user-role';
import { PERMISSOES, PERMISSAO_LABELS, PERMISSAO_DESCRICOES, type Permissao } from '@pioneira/shared/enums/permissao';
import { FUNCIONALIDADES } from '@pioneira/shared/enums/funcionalidades';
import type { ValidacoesResumoResponse } from '@pioneira/shared/schemas/validacoes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBranding } from '@/hooks/useBranding';
import { api, extrairMensagemErro } from '@/lib/api';

interface PaginatedUsers {
  data: UserResponse[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const createSchema = z.object({
  email: z.string().email('E-mail inválido'),
  nomeCompleto: z.string().min(3, 'Mínimo 3 caracteres'),
  role: z.enum(USER_ROLES),
  permissoes: z.array(z.enum(PERMISSOES)).default([]),
});
type CreateFormValues = z.infer<typeof createSchema>;

/** Info da senha gerada, exibida uma vez (criação ou redefinição). */
interface SenhaInfo { titulo: string; email: string; senha: string }

export default function UsuariosPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [senhaInfo, setSenhaInfo] = useState<SenhaInfo | null>(null);
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
    defaultValues: { email: '', nomeCompleto: '', role: 'operacional', permissoes: [] },
  });

  const criarUsuario = useMutation({
    mutationFn: async (payload: UserCreatePayload) => {
      const res = await api.post<UserCreateResponse>('/api/users', payload);
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
          permissoes: payload.permissoes ?? [],
          liberacaoProgressiva: false,
          funcionalidadesAtribuidas: [],
          funcionalidadesValidadas: [],
          progressoFuncionalidades: {},
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
      toast.error(extrairMensagemErro(err, 'Falha ao criar usuário'));
    },
    onSuccess: (r) => {
      setSenhaInfo({ titulo: 'Usuário criado', email: r.email, senha: r.senhaGerada });
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
      toast.success('Usuário removido');
      void qc.invalidateQueries({ queryKey: ['usuarios'] });
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent">
            Usuários
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Convide e gerencie quem acessa o sistema.</p>
        </div>

        <Dialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <DialogTrigger asChild>
            <Button size="lg" className="w-full sm:w-auto shrink-0">
              <Plus className="h-4 w-4" />
              <span>Novo usuário</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="mx-3 w-[calc(100%-1.5rem)] sm:w-full max-w-lg">
            <DialogHeader>
              <DialogTitle>Convidar novo usuário</DialogTitle>
              <DialogDescription>
                Uma senha aleatória será gerada e exibida uma vez (sem envio de e-mail) para você repassar ao usuário.
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
              <div className="space-y-2">
                <Label>Permissões de funcionalidade</Label>
                {form.watch('role') === 'admin' ? (
                  <p className="text-xs text-gray-500 dark:text-gray-400">Administrador tem todas as permissões.</p>
                ) : (
                  <div className="space-y-1.5 rounded-md border border-gray-100 dark:border-gray-800 p-2">
                    {PERMISSOES.map((p) => {
                      const marcado = form.watch('permissoes').includes(p);
                      return (
                        <label key={p} className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={marcado}
                            onChange={(e) => {
                              const cur = form.getValues('permissoes');
                              form.setValue('permissoes', e.target.checked ? [...cur, p] : cur.filter((x) => x !== p));
                            }}
                          />
                          <span>
                            <span className="font-medium">{PERMISSAO_LABELS[p]}</span>
                            <span className="block text-[11px] text-gray-500 dark:text-gray-400">{PERMISSAO_DESCRICOES[p]}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
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
            <TableHead>Usuário</TableHead>
            <TableHead className="hidden sm:table-cell">Cargo</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Último login</TableHead>
            <TableHead className="text-right">Ações</TableHead>
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
                Nenhum usuário encontrado.
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
                  <EditarUsuario user={u} onSenhaGerada={setSenhaInfo} />
                  <FuncionalidadesUsuario user={u} />
                  <PermissoesUsuario user={u} />
                  {/* "Reenviar convite" só existe para quem ainda não definiu senha.
                      No fluxo atual (senha gerada e exibida na hora) isso nunca acontece —
                      o botão ficava sempre em 409. Redefinir senha faz o papel dele. */}
                  {u.ativo && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => reenviarConvite.mutate(u.id)}
                      title="Reenviar convite de primeiro acesso"
                      disabled={reenviarConvite.isPending}
                      className="hidden h-8 w-8"
                    >
                      <MailPlus className="h-4 w-4" />
                    </Button>
                  )}
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
                      if (confirm(`Remover ${u.nomeCompleto}? Esta ação não pode ser desfeita.`)) remover.mutate(u.id);
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
            Pag. {data.pagination.page}/{data.pagination.totalPages} - {data.pagination.total} {data.pagination.total === 1 ? 'usuário' : 'usuários'}
          </span>
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= data.pagination.totalPages}>
              Próxima
            </Button>
          </div>
        </div>
      )}

      <SenhaGeradaDialog info={senhaInfo} onClose={() => setSenhaInfo(null)} />
    </div>
  );
}

/** Editar dados do usuário (nome, e-mail) + redefinir senha (gera nova, sem e-mail). */
function EditarUsuario({ user, onSenhaGerada }: { user: UserResponse; onSenhaGerada: (info: SenhaInfo) => void }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(user.nomeCompleto);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState<UserRole>(user.role);

  const salvar = useMutation({
    mutationFn: async () => (await api.patch<UserResponse>(`/api/users/${user.id}`, { nomeCompleto: nome.trim(), email: email.trim(), role })).data,
    onSuccess: () => { toast.success('Usuário atualizado'); void qc.invalidateQueries({ queryKey: ['usuarios'] }); setAberto(false); },
    onError: (err) => toast.error(extrairMensagemErro(err, 'Falha ao atualizar')),
  });

  const redefinir = useMutation({
    mutationFn: async () => (await api.post<RedefinirSenhaResponse>(`/api/users/${user.id}/redefinir-senha`)).data,
    onSuccess: (r) => { onSenhaGerada({ titulo: 'Senha redefinida', email: user.email, senha: r.senhaGerada }); setAberto(false); },
    onError: (err) => toast.error(extrairMensagemErro(err, 'Falha ao redefinir senha')),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => { setAberto(v); if (v) { setNome(user.nomeCompleto); setEmail(user.email); setRole(user.role); } }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Editar" className="h-8 w-8">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="mx-3 w-[calc(100%-1.5rem)] sm:w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar usuário</DialogTitle>
          <DialogDescription>Nome, e-mail e cargo. A senha é redefinida gerando uma nova (sem envio de e-mail).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`nome-${user.id}`}>Nome completo</Label>
            <Input id={`nome-${user.id}`} value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`email-${user.id}`}>E-mail</Label>
            <Input id={`email-${user.id}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Cargo</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {USER_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{USER_ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border border-gray-100 dark:border-gray-800 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Senha</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Gera uma nova senha aleatória e encerra as sessões abertas.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => redefinir.mutate()} disabled={redefinir.isPending}>
                <KeyRound className="h-4 w-4" /><span className="ml-1">{redefinir.isPending ? 'Gerando…' : 'Redefinir senha'}</span>
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={salvar.isPending} className="w-full sm:w-auto">Cancelar</Button>
          <Button type="button" onClick={() => salvar.mutate()} disabled={salvar.isPending || nome.trim().length < 3 || email.trim().length < 3} className="w-full sm:w-auto">
            {salvar.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Mostra a senha gerada UMA vez (criação ou redefinição), com copiar. */
function SenhaGeradaDialog({ info, onClose }: { info: SenhaInfo | null; onClose: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => {
    if (!info) return;
    void navigator.clipboard.writeText(info.senha).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  };
  return (
    <Dialog open={!!info} onOpenChange={(v) => { if (!v) { onClose(); setCopiado(false); } }}>
      <DialogContent className="mx-3 w-[calc(100%-1.5rem)] sm:w-full max-w-md">
        <DialogHeader>
          <DialogTitle>{info?.titulo}</DialogTitle>
          <DialogDescription>
            Anote e repasse a senha agora — ela <strong>não será exibida de novo</strong>. O usuário faz login com o e-mail e esta senha.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">{info?.email}</div>
          <div className="flex items-center gap-2">
            <code className="flex-1 select-all rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-2 font-mono text-sm break-all">
              {info?.senha}
            </code>
            <Button type="button" variant="outline" size="icon" onClick={copiar} title="Copiar" className="h-9 w-9 shrink-0">
              {copiado ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose} className="w-full sm:w-auto">Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Atribuir funcionalidades + ligar liberação progressiva de um usuário (admin). */
function FuncionalidadesUsuario({ user }: { user: UserResponse }) {
  const qc = useQueryClient();
  const { minutosValidacao } = useBranding();
  const [aberto, setAberto] = useState(false);
  const [progressivo, setProgressivo] = useState(user.liberacaoProgressiva);
  const [sel, setSel] = useState<string[]>(user.funcionalidadesAtribuidas);
  const [tempo, setTempo] = useState(String(minutosValidacao));
  const ehAdmin = user.role === 'admin';
  const validadas = new Set(user.funcionalidadesValidadas);

  // Ressalvas que ESTE usuário apontou — o admin precisa vê-las onde gerencia a
  // trilha dele, não só na tela de Validações.
  const { data: validacoes } = useQuery<ValidacoesResumoResponse>({
    queryKey: ['validacoes'],
    queryFn: async () => (await api.get<ValidacoesResumoResponse>('/api/validacoes')).data,
    enabled: aberto && !ehAdmin,
    staleTime: 60_000,
  });
  const ressalvasDoUsuario = new Map(
    (validacoes?.funcionalidades ?? []).flatMap((f) =>
      f.conferencias
        .filter((c) => c.usuarioId === user.id && c.status === 'reprovado')
        .map((c) => [f.chave, c] as const),
    ),
  );

  const tempoNum = Number(tempo);
  const tempoValido = Number.isInteger(tempoNum) && tempoNum >= 1 && tempoNum <= 10080;
  const tempoMudou = tempoValido && tempoNum !== minutosValidacao;

  // UM botão só. O tempo mínimo é GLOBAL (vale pra todos), mas é salvo junto com
  // as funcionalidades — dois botões de salvar no mesmo diálogo faziam o admin
  // achar que tinha gravado o tempo quando só tinha gravado a atribuição.
  const salvar = useMutation({
    mutationFn: async () => {
      if (tempoMudou) {
        await api.put('/api/parametros', { minutosValidacaoFuncionalidade: tempoNum });
      }
      return (await api.patch<UserResponse>(`/api/users/${user.id}`, {
        liberacaoProgressiva: progressivo,
        funcionalidadesAtribuidas: sel,
      })).data;
    },
    onSuccess: () => {
      toast.success(tempoMudou
        ? `Funcionalidades atualizadas · tempo mínimo agora é ${tempoNum} min (para todos)`
        : 'Funcionalidades atualizadas');
      void qc.invalidateQueries({ queryKey: ['usuarios'] });
      void qc.invalidateQueries({ queryKey: ['branding'] });
      setAberto(false);
    },
    onError: (err) => toast.error(extrairMensagemErro(err, 'Falha ao salvar')),
  });

  const resetar = useMutation({
    mutationFn: async () => (await api.post<UserResponse>(`/api/users/${user.id}/resetar-funcionalidades`)).data,
    onSuccess: () => {
      toast.success('Validações apagadas', {
        description: 'As conferências deste usuário, os avais que ficaram sem validação e as notificações do ciclo foram removidos.',
      });
      // O reset mexe na trilha inteira: recarrega Validações e o sininho também.
      void qc.invalidateQueries({ queryKey: ['usuarios'] });
      void qc.invalidateQueries({ queryKey: ['validacoes'] });
      void qc.invalidateQueries({ queryKey: ['notificacoes'] });
      setAberto(false);
    },
    onError: (err) => toast.error(extrairMensagemErro(err, 'Falha ao resetar')),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => { setAberto(v); if (v) { setProgressivo(user.liberacaoProgressiva); setSel(user.funcionalidadesAtribuidas); setTempo(String(minutosValidacao)); } }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Funcionalidades / liberação progressiva" className="h-8 w-8">
          <ListChecks className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="mx-3 w-[calc(100%-1.5rem)] sm:w-full max-w-lg">
        <DialogHeader>
          <DialogTitle>Funcionalidades — {user.nomeCompleto}</DialogTitle>
          <DialogDescription>
            Escolha o que o usuário pode ver. No modo progressivo, ele valida uma a uma (na ordem da lista) e cada validação libera a próxima.
          </DialogDescription>
        </DialogHeader>
        {ehAdmin ? (
          <p className="py-2 text-sm text-gray-500 dark:text-gray-400">Administrador enxerga tudo — não se aplica.</p>
        ) : (
          <>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5" checked={progressivo} onChange={(e) => setProgressivo(e.target.checked)} />
              <span>
                <span className="font-medium">Liberação progressiva</span>
                <span className="block text-[11px] text-gray-500 dark:text-gray-400">Ligado: menu mostra só as validadas + a próxima a validar. Desligado: menu normal pelo papel.</span>
              </span>
            </label>
            {/* Tempo mínimo de validação — configuração GLOBAL (vale pra todos),
                gravada junto com o botão "Salvar" do rodapé. */}
            <div className="rounded-md border border-gray-100 dark:border-gray-800 p-3">
              <p className="text-sm font-medium">Tempo mínimo de validação</p>
              <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
                Minutos que o usuário precisa usar a tela (desde o 1º acesso) antes de poder validar. Vale para <strong>todos</strong> os usuários.
              </p>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={10080}
                  value={tempo}
                  onChange={(e) => setTempo(e.target.value)}
                  className="w-28"
                />
                <span className="text-sm text-gray-500 dark:text-gray-400">min</span>
                {tempoMudou && (
                  <span className="text-[11px] text-amber-600 dark:text-amber-400">
                    alterado de {minutosValidacao} — clique em Salvar
                  </span>
                )}
                {!tempoValido && (
                  <span className="text-[11px] text-red-600 dark:text-red-400">informe de 1 a 10080</span>
                )}
              </div>
            </div>
            {ressalvasDoUsuario.size > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  {ressalvasDoUsuario.size} funcionalidade(s) com problema apontado por este usuário
                </p>
                <p className="mt-0.5 text-[11px] text-amber-800 dark:text-amber-300">
                  A trilha dele está parada até você corrigir e ele revalidar.{' '}
                  <Link href="/validacoes" className="font-medium underline">Ver e responder em Validações</Link>
                </p>
              </div>
            )}
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-gray-100 dark:border-gray-800 p-2">
              {FUNCIONALIDADES.map((f) => {
                const marcado = sel.includes(f.chave);
                const prog = user.progressoFuncionalidades[f.chave];
                const ressalva = ressalvasDoUsuario.get(f.chave);
                return (
                  <div key={f.chave} className="text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={(e) => setSel((cur) => (e.target.checked ? [...cur, f.chave] : cur.filter((x) => x !== f.chave)))}
                      />
                      <span className="flex-1">{f.nome}</span>
                      <span className="text-[10px] text-gray-400">{f.grupo}</span>
                      {validadas.has(f.chave) && (
                        <span className="whitespace-nowrap text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          ✓ validada{prog?.validadoEm ? ` em ${new Date(prog.validadoEm).toLocaleDateString('pt-BR')}` : ''}
                        </span>
                      )}
                      {ressalva && (
                        <span className="whitespace-nowrap text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          ⚠ {ressalva.respostaAdmin ? 'respondida' : 'não validada'}
                        </span>
                      )}
                    </label>
                    {ressalva && (
                      <p className="ml-6 mt-0.5 rounded bg-amber-50 px-2 py-1 text-[11px] italic text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                        “{ressalva.observacoes}”
                      </p>
                    )}
                    {!ressalva && prog?.justificativa && (
                      <p className="ml-6 mt-0.5 rounded bg-gray-50 px-2 py-1 text-[11px] italic text-gray-600 dark:bg-gray-900/50 dark:text-gray-300">
                        Observações na validação: “{prog.justificativa}”
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-gray-400">
              A ordem de validação é fixa (a da lista). Desmarcar uma já validada zera a validação e o relógio dela. O usuário
              confere cada uma em “Minhas funcionalidades” — e pode <strong>não validar</strong>, descrevendo o problema.
              As ressalvas, as respostas e o aval do CFO ficam em <Link href="/validacoes" className="underline">Validações</Link>.
            </p>
            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  if (confirm(
                    `APAGAR as validações de ${user.nomeCompleto}?\n\n`
                    + 'Isto remove em definitivo:\n'
                    + '• as conferências e ressalvas registradas por ele\n'
                    + '• os avais do CFO que ficarem sem nenhuma validação\n'
                    + '• as notificações do ciclo relacionadas a ele\n\n'
                    + 'A trilha volta ao início. Não há como desfazer.',
                  )) resetar.mutate();
                }}
                disabled={resetar.isPending || salvar.isPending}
                className="w-full text-red-600 hover:text-red-700 dark:text-red-400 sm:w-auto"
              >
                {resetar.isPending ? 'Apagando…' : 'Apagar validações'}
              </Button>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-2">
                <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={salvar.isPending} className="w-full sm:w-auto">Cancelar</Button>
                <Button type="button" onClick={() => salvar.mutate()} disabled={salvar.isPending || !tempoValido} className="w-full sm:w-auto">
                  {salvar.isPending ? 'Salvando…' : 'Salvar'}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Botão + diálogo pra editar as permissões de funcionalidade de um usuário. */
function PermissoesUsuario({ user }: { user: UserResponse }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [sel, setSel] = useState<Permissao[]>(user.permissoes);
  const ehAdmin = user.role === 'admin';

  const salvar = useMutation({
    mutationFn: async () => (await api.patch(`/api/users/${user.id}`, { permissoes: sel })).data,
    onSuccess: () => {
      toast.success('Permissões atualizadas');
      void qc.invalidateQueries({ queryKey: ['usuarios'] });
      setAberto(false);
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => { setAberto(v); if (v) setSel(user.permissoes); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title="Permissões de funcionalidade" className="h-8 w-8">
          <ShieldCheck className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="mx-3 w-[calc(100%-1.5rem)] sm:w-full max-w-md">
        <DialogHeader>
          <DialogTitle>Permissões — {user.nomeCompleto}</DialogTitle>
          <DialogDescription>Funcionalidades sensíveis que este usuário pode acessar.</DialogDescription>
        </DialogHeader>
        {ehAdmin ? (
          <p className="py-2 text-sm text-gray-500 dark:text-gray-400">Administrador tem todas as permissões — nada a configurar.</p>
        ) : (
          <>
            <div className="space-y-2 py-1">
              {PERMISSOES.map((p) => {
                const marcado = sel.includes(p);
                return (
                  <label key={p} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={marcado}
                      onChange={(e) => setSel((cur) => (e.target.checked ? [...cur, p] : cur.filter((x) => x !== p)))}
                    />
                    <span>
                      <span className="font-medium">{PERMISSAO_LABELS[p]}</span>
                      <span className="block text-[11px] text-gray-500 dark:text-gray-400">{PERMISSAO_DESCRICOES[p]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setAberto(false)} disabled={salvar.isPending} className="w-full sm:w-auto">
                Cancelar
              </Button>
              <Button type="button" onClick={() => salvar.mutate()} disabled={salvar.isPending} className="w-full sm:w-auto">
                {salvar.isPending ? 'Salvando…' : 'Salvar'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
