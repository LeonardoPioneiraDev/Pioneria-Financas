'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Download, FileText, Loader2, RotateCcw } from 'lucide-react';
import type { RelatorioValidacoesResponse } from '@pioneira/shared/schemas/validacoes';
import { VALIDACAO_STATUS_LABELS, VALIDACAO_TIPO_LABELS } from '@pioneira/shared/enums/validacao';
import { FUNCIONALIDADES } from '@pioneira/shared/enums/funcionalidades';
import { USER_ROLE_LABELS } from '@pioneira/shared/enums/user-role';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AnexosPreview } from '@/components/shared/AnexosPreview';
import { api, extrairMensagemErro } from '@/lib/api';

interface Filtros {
  funcionalidade: string;
  usuarioId: string;
  tipo: string;
  status: string;
  de: string;
  ate: string;
}

const VAZIO: Filtros = { funcionalidade: '', usuarioId: '', tipo: '', status: '', de: '', ate: '' };

/** Só os campos preenchidos viram querystring. */
function paraParams(f: Filtros): Record<string, string> {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
}

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-900';

/**
 * Relatório da trilha de conferência: uma linha por evento, com quem, e-mail,
 * data/hora, funcionalidade e o que foi escrito. Exporta em XLSX.
 */
export function RelatorioValidacoes() {
  const [filtros, setFiltros] = useState<Filtros>(VAZIO);
  const [exportando, setExportando] = useState(false);

  const { data, isLoading, isFetching } = useQuery<RelatorioValidacoesResponse>({
    queryKey: ['validacoes', 'relatorio', filtros],
    queryFn: async () =>
      (await api.get<RelatorioValidacoesResponse>('/api/validacoes/relatorio', { params: paraParams(filtros) })).data,
    placeholderData: (prev) => prev,
  });

  const set = <K extends keyof Filtros>(k: K, v: string): void => setFiltros((f) => ({ ...f, [k]: v }));

  const exportar = async (): Promise<void> => {
    setExportando(true);
    try {
      const res = await api.get('/api/validacoes/relatorio/export', {
        params: paraParams(filtros),
        responseType: 'blob',
      });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-validacoes-${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Relatório exportado');
    } catch (err) {
      toast.error('Falha ao exportar', { description: extrairMensagemErro(err) });
    } finally {
      setExportando(false);
    }
  };

  const temFiltro = Object.values(filtros).some((v) => v !== '');

  return (
    <div className="space-y-4">
      <Card className="p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="f-func" className="text-[11px] uppercase tracking-wide text-gray-500">Funcionalidade</Label>
            <select id="f-func" value={filtros.funcionalidade} onChange={(e) => set('funcionalidade', e.target.value)} className={SELECT_CLASS}>
              <option value="">Todas</option>
              {FUNCIONALIDADES.map((f) => <option key={f.chave} value={f.chave}>{f.nome}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-user" className="text-[11px] uppercase tracking-wide text-gray-500">Usuário</Label>
            <select id="f-user" value={filtros.usuarioId} onChange={(e) => set('usuarioId', e.target.value)} className={SELECT_CLASS}>
              <option value="">Todos</option>
              {(data?.usuarios ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-tipo" className="text-[11px] uppercase tracking-wide text-gray-500">Etapa</Label>
            <select id="f-tipo" value={filtros.tipo} onChange={(e) => set('tipo', e.target.value)} className={SELECT_CLASS}>
              <option value="">Todas</option>
              <option value="conferencia">Conferência (auditor)</option>
              <option value="aval">Aval do CFO</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-status" className="text-[11px] uppercase tracking-wide text-gray-500">Resultado</Label>
            <select id="f-status" value={filtros.status} onChange={(e) => set('status', e.target.value)} className={SELECT_CLASS}>
              <option value="">Todos</option>
              <option value="validado">Validado</option>
              <option value="reprovado">Com ressalva</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-de" className="text-[11px] uppercase tracking-wide text-gray-500">De</Label>
            <Input id="f-de" type="date" value={filtros.de} onChange={(e) => set('de', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="f-ate" className="text-[11px] uppercase tracking-wide text-gray-500">Até</Label>
            <Input id="f-ate" type="date" value={filtros.ate} onChange={(e) => set('ate', e.target.value)} />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => void exportar()} disabled={exportando || (data?.itens.length ?? 0) === 0}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="ml-1">Exportar Excel</span>
          </Button>
          {temFiltro && (
            <Button size="sm" variant="ghost" onClick={() => setFiltros(VAZIO)}>
              <RotateCcw className="h-3.5 w-3.5" /><span className="ml-1">Limpar filtros</span>
            </Button>
          )}
          {isFetching && <span className="text-[11px] text-gray-400">atualizando…</span>}
        </div>
      </Card>

      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="p-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Eventos</p>
            <p className="text-2xl font-semibold">{data.totais.eventos}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Validações</p>
            <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{data.totais.validacoes}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Ressalvas</p>
            <p className="text-2xl font-semibold text-amber-600 dark:text-amber-400">{data.totais.ressalvas}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Avais do CFO</p>
            <p className="text-2xl font-semibold text-pioneira-700 dark:text-yellow-400">{data.totais.avais}</p>
          </Card>
        </div>
      )}

      {isLoading && (
        <Card className="p-8 text-center text-sm text-gray-500">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Carregando…
        </Card>
      )}

      {data && data.itens.length === 0 && !isLoading && (
        <Card className="p-8 text-center">
          <FileText className="mx-auto h-9 w-9 text-gray-300" />
          <p className="mt-2 font-medium">Nenhum evento no recorte escolhido</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Ajuste os filtros ou limpe-os para ver a trilha completa.</p>
        </Card>
      )}

      {data && data.itens.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left dark:border-gray-800 dark:bg-gray-900/50">
              <tr className="text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-3 py-2 font-medium">Data/hora</th>
                <th className="px-3 py-2 font-medium">Usuário</th>
                <th className="px-3 py-2 font-medium">Funcionalidade</th>
                <th className="px-3 py-2 font-medium">Etapa</th>
                <th className="px-3 py-2 font-medium">Resultado</th>
                <th className="px-3 py-2 font-medium">Observações / resposta</th>
              </tr>
            </thead>
            <tbody>
              {data.itens.map((it) => (
                <tr key={it.id} className="border-b border-gray-100 align-top last:border-0 dark:border-gray-800/60">
                  <td className="whitespace-nowrap px-3 py-2 text-[12px] text-gray-600 dark:text-gray-300">
                    {format(new Date(it.criadoEm), 'dd/MM/yyyy HH:mm')}
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{it.usuarioNome}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{it.usuarioEmail}</p>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">{USER_ROLE_LABELS[it.usuarioRole]}</p>
                  </td>
                  <td className="px-3 py-2 text-[13px]">
                    {FUNCIONALIDADES.find((f) => f.chave === it.funcionalidade)?.nome ?? it.funcionalidade}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-gray-600 dark:text-gray-300">{VALIDACAO_TIPO_LABELS[it.tipo]}</td>
                  <td className="px-3 py-2">
                    <Badge variant={it.status === 'validado' ? 'success' : 'warning'}>
                      {VALIDACAO_STATUS_LABELS[it.status]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-[12px]">
                    {it.observacoes && <p className="italic text-gray-700 dark:text-gray-200">“{it.observacoes}”</p>}
                    {it.anexosDataUri.length > 0 && (
                      <div className="mt-1">
                        <AnexosPreview anexos={it.anexosDataUri} thumbSizeClass="h-10" />
                      </div>
                    )}
                    {it.respostaAdmin && (
                      <p className="mt-1 rounded bg-gray-50 px-2 py-1 text-gray-600 dark:bg-gray-900/50 dark:text-gray-300">
                        <span className="font-medium">{it.respondidoPorNome ?? 'Admin'}:</span> {it.respostaAdmin}
                      </p>
                    )}
                    {!it.observacoes && !it.respostaAdmin && <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
