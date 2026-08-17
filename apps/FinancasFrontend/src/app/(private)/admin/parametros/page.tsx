'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Settings2, Loader2, Save, Upload, Trash2, Building2, ImageIcon, CalendarDays, Plus, Clock } from 'lucide-react';
import type { Configuracao } from '@pioneira/shared/schemas/parametros';
import type { FeriadosListResponse } from '@pioneira/shared/schemas/feriados';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, extrairMensagemErro } from '@/lib/api';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';

const LOGO_MAX_BYTES = 512 * 1024;
const inputCls = 'h-9 text-sm';

export default function ParametrosPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const configQ = useQuery<Configuracao>({
    queryKey: ['parametros'],
    queryFn: async () => (await api.get<Configuracao>('/api/parametros')).data,
    staleTime: 60_000,
  });

  const [form, setForm] = useState({ razaoSocial: '', nomeFantasia: '', cnpj: '', endereco: '', telefone: '', minutosValidacao: '120' });

  // Semeia o form quando a config chega.
  useEffect(() => {
    const c = configQ.data;
    if (!c) return;
    setForm({
      razaoSocial: c.razaoSocial ?? '',
      nomeFantasia: c.nomeFantasia ?? '',
      cnpj: c.cnpj ?? '',
      endereco: c.endereco ?? '',
      telefone: c.telefone ?? '',
      minutosValidacao: String(c.minutosValidacaoFuncionalidade ?? 120),
    });
  }, [configQ.data]);

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['parametros'] });
    void qc.invalidateQueries({ queryKey: ['branding'] }); // atualiza logo/nome no header e login
  };

  const salvarDados = useMutation({
    mutationFn: async () => (await api.put<Configuracao>('/api/parametros', {
      razaoSocial: form.razaoSocial.trim(),
      nomeFantasia: form.nomeFantasia.trim() || null,
      cnpj: form.cnpj.trim() || null,
      endereco: form.endereco.trim() || null,
      telefone: form.telefone.trim() || null,
      minutosValidacaoFuncionalidade: Math.min(10080, Math.max(1, Math.round(Number(form.minutosValidacao) || 120))),
    })).data,
    onSuccess: () => { toast.success('Parâmetros salvos'); invalidar(); },
    onError: (err) => toast.error('Falha ao salvar', { description: extrairMensagemErro(err) }),
  });

  const salvarLogo = useMutation({
    mutationFn: async (logoDataUri: string | null) =>
      (await api.put<Configuracao>('/api/parametros/logo', { logoDataUri })).data,
    onSuccess: (_d, variables) => {
      toast.success(variables === null ? 'Logo removido' : 'Logo atualizado');
      invalidar();
    },
    onError: (err) => toast.error('Falha ao atualizar o logo', { description: extrairMensagemErro(err) }),
  });

  function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) {
      toast.error('Logo acima do limite de 512 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => salvarLogo.mutate(reader.result as string);
    reader.onerror = () => toast.error('Não foi possível ler o arquivo.');
    reader.readAsDataURL(file);
  }

  const c = configQ.data;
  const logoAtual = c?.logoDataUri || '/logo.png';
  const temLogoCustom = !!c?.logoDataUri;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Settings2 className="h-6 w-6 text-gray-400" />
          Parâmetros
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
          Identidade da empresa exibida no sistema (login, menu e cabeçalho). Sistema de empresa única — Viação Pioneira.
        </p>
      </div>

      <ModuleStatusBanner href="/admin/parametros" />

      {configQ.isLoading ? (
        <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : configQ.isError ? (
        <Card className="p-8 text-center">
          <p className="font-medium">Não foi possível carregar os parâmetros.</p>
          <p className="mt-1 text-sm text-gray-500">{extrairMensagemErro(configQ.error)} — acesso restrito a administradores.</p>
        </Card>
      ) : (
        <>
          {/* Logo */}
          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><ImageIcon className="h-4 w-4 text-gray-400" /> Logo</h2>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full ring-1 ring-gray-200 dark:ring-gray-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoAtual} alt="Logo atual" className="h-full w-full object-contain" />
              </div>
              <div className="space-y-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={onArquivo} className="hidden" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={salvarLogo.isPending} onClick={() => fileRef.current?.click()}>
                    {salvarLogo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    <span className="ml-1">Enviar logo</span>
                  </Button>
                  {temLogoCustom && (
                    <Button size="sm" variant="ghost" disabled={salvarLogo.isPending} onClick={() => salvarLogo.mutate(null)}>
                      <Trash2 className="h-4 w-4" /><span className="ml-1">Remover</span>
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">PNG, JPG, SVG ou WebP — até 512 KB. Sem logo, usa o padrão.</p>
              </div>
            </div>
          </Card>

          {/* Dados da empresa */}
          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4 text-gray-400" /> Dados da empresa</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Razão social *">
                <Input className={inputCls} value={form.razaoSocial} onChange={(e) => setForm((f) => ({ ...f, razaoSocial: e.target.value }))} />
              </Campo>
              <Campo label="Nome fantasia">
                <Input className={inputCls} value={form.nomeFantasia} onChange={(e) => setForm((f) => ({ ...f, nomeFantasia: e.target.value }))} placeholder="ex.: Viação Pioneira" />
              </Campo>
              <Campo label="CNPJ">
                <Input className={inputCls} value={form.cnpj} onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))} placeholder="00.000.000/0000-00" />
              </Campo>
              <Campo label="Telefone">
                <Input className={inputCls} value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} />
              </Campo>
              <div className="sm:col-span-2">
                <Campo label="Endereço">
                  <Input className={inputCls} value={form.endereco} onChange={(e) => setForm((f) => ({ ...f, endereco: e.target.value }))} />
                </Campo>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                disabled={salvarDados.isPending || form.razaoSocial.trim().length < 2}
                onClick={() => salvarDados.mutate()}
              >
                {salvarDados.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="ml-1">Salvar</span>
              </Button>
            </div>
          </Card>

          {/* Liberação progressiva */}
          <Card className="p-4">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-gray-400" /> Liberação progressiva</h2>
            <p className="mb-3 text-[11px] text-gray-400">
              Tempo mínimo entre o 1º acesso do usuário a uma funcionalidade e a validação dela. Reduza para testar.
            </p>
            <div className="flex items-end gap-3">
              <Campo label="Tempo mínimo (minutos)">
                <Input
                  type="number"
                  min={1}
                  max={10080}
                  className={`${inputCls} w-32`}
                  value={form.minutosValidacao}
                  onChange={(e) => setForm((f) => ({ ...f, minutosValidacao: e.target.value }))}
                />
              </Campo>
              <Button size="sm" disabled={salvarDados.isPending} onClick={() => salvarDados.mutate()}>
                {salvarDados.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                <span className="ml-1">Salvar</span>
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-gray-400">Ex.: <strong>1</strong> = quase imediato (teste) · <strong>120</strong> = 2 horas (padrão).</p>
          </Card>

          {/* Feriados */}
          <FeriadosCard />

          <p className="text-[11px] text-gray-400">
            Tarifas SEMOB e configuração de e-mail seguem planejados — entram quando houver um consumidor pra eles
            (hoje o e-mail é via variáveis de ambiente e nada lê uma tarifa configurável).
          </p>
        </>
      )}
    </div>
  );
}

function fmtDataFeriado(data: string, recorrente: boolean): string {
  const [ano, mes, dia] = data.split('-');
  return recorrente ? `${dia}/${mes} (todo ano)` : `${dia}/${mes}/${ano}`;
}

function FeriadosCard() {
  const qc = useQueryClient();
  const [novo, setNovo] = useState({ data: '', nome: '', recorrente: false });

  const listQ = useQuery<FeriadosListResponse>({
    queryKey: ['feriados'],
    queryFn: async () => (await api.get<FeriadosListResponse>('/api/feriados')).data,
    staleTime: 60_000,
  });

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ['feriados'] });
    void qc.invalidateQueries({ queryKey: ['fluxo-caixa'] }); // a projeção marca feriados
  };

  const criar = useMutation({
    mutationFn: async () => (await api.post('/api/feriados', {
      data: novo.data,
      nome: novo.nome.trim(),
      recorrente: novo.recorrente,
      tipo: 'empresa',
    })).data,
    onSuccess: () => { toast.success('Feriado adicionado'); setNovo({ data: '', nome: '', recorrente: false }); invalidar(); },
    onError: (err) => toast.error('Falha ao adicionar', { description: extrairMensagemErro(err) }),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/api/feriados/${id}`)).data,
    onSuccess: () => { toast.success('Feriado removido'); invalidar(); },
    onError: (err) => toast.error('Falha ao remover', { description: extrairMensagemErro(err) }),
  });

  const itens = listQ.data?.itens ?? [];

  return (
    <Card className="p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-gray-400" /> Feriados</h2>
      <p className="mb-3 text-[11px] text-gray-400">
        Usados pela projeção do Fluxo de Caixa, que marca os dias de feriado (não altera valores). Recorrente = repete todo ano.
      </p>

      {/* Adicionar */}
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-gray-100 bg-gray-50/60 p-2 dark:border-gray-800 dark:bg-gray-900/40">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">Data</span>
          <Input type="date" className="h-8 w-40 text-sm" value={novo.data} onChange={(e) => setNovo((n) => ({ ...n, data: e.target.value }))} />
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">Nome</span>
          <Input className="h-8 text-sm" value={novo.nome} onChange={(e) => setNovo((n) => ({ ...n, nome: e.target.value }))} placeholder="ex.: Aniversário da cidade" />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={novo.recorrente} onChange={(e) => setNovo((n) => ({ ...n, recorrente: e.target.checked }))} />
          todo ano
        </label>
        <Button size="sm" disabled={criar.isPending || !novo.data || novo.nome.trim().length < 2} onClick={() => criar.mutate()}>
          {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span className="ml-1">Adicionar</span>
        </Button>
      </div>

      {/* Lista */}
      {listQ.isLoading ? (
        <div className="flex items-center justify-center py-6 text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : itens.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">Nenhum feriado cadastrado.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <tbody>
              {itens.map((f) => (
                <tr key={f.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/50">
                  <td className="py-1.5 pr-3 font-mono whitespace-nowrap tabular-nums text-gray-600 dark:text-gray-300">{fmtDataFeriado(f.data, f.recorrente)}</td>
                  <td className="py-1.5 pr-3">{f.nome}</td>
                  <td className="py-1.5 pr-3">
                    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">{f.tipo}</span>
                  </td>
                  <td className="py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => remover.mutate(f.id)}
                      disabled={remover.isPending}
                      title="Remover"
                      className="text-gray-300 hover:text-red-500 disabled:opacity-40 dark:text-gray-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</span>
      {children}
    </label>
  );
}
