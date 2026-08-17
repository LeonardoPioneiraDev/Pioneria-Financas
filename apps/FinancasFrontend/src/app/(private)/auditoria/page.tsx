'use client';

import { useState, Fragment } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck, Download, Loader2, Eye, Pencil, ChevronLeft, ChevronRight, ChevronDown, ArrowRight, Users, FileClock, Smartphone, Tablet, Monitor, Bot, HelpCircle } from 'lucide-react';
import type { AuditResumoResponse, AuditAcessosResponse, AuditAtividadeResponse, AuditAlteracaoCampo } from '@pioneira/shared';
import { ACAO_AUDITORIA } from '@pioneira/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api, extrairMensagemErro } from '@/lib/api';
import { cn } from '@/lib/utils';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';

type Aba = 'acessos' | 'atividade';

function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const ACAO_COR: Record<string, string> = {
  editou: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  aprovou: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  rejeitou: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  sincronizou: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  exportou: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300',
  imprimiu: 'bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300',
};
const corAcao = (a: string): string => ACAO_COR[a] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';

/** Ícone por tipo de dispositivo (parseado do user-agent no backend). */
function IconeDispositivo({ tipo }: { tipo: string | null }) {
  const cls = 'h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500';
  switch (tipo) {
    case 'celular': return <Smartphone className={cls} />;
    case 'tablet': return <Tablet className={cls} />;
    case 'desktop': return <Monitor className={cls} />;
    case 'bot': return <Bot className={cls} />;
    default: return <HelpCircle className={cls} />;
  }
}

/** Célula "Dispositivo": ícone (celular/desktop/…) + rótulo do navegador. */
function DispositivoCell({ dispositivo, tipo }: { dispositivo: string | null; tipo: string | null }) {
  return (
    <td className="whitespace-nowrap px-4 py-2 text-[11px] text-gray-500 dark:text-gray-400">
      {dispositivo ? (
        <span className="inline-flex items-center gap-1.5" title={dispositivo}>
          <IconeDispositivo tipo={tipo} />
          {dispositivo}
        </span>
      ) : (
        <span className="text-gray-300 dark:text-gray-600">—</span>
      )}
    </td>
  );
}

/** Célula "IP": IP limpo + selo "local" quando é loopback (dev/mesma máquina). */
function IpCell({ ip }: { ip: string | null }) {
  const local = ip === '127.0.0.1' || ip === '::1' || ip === '0.0.0.0';
  return (
    <td className="whitespace-nowrap px-4 py-2 text-[11px] text-gray-400">
      {ip ? (
        <span className="inline-flex items-center gap-1">
          <span className="tabular-nums">{ip}</span>
          {local && (
            <span className="rounded bg-gray-100 px-1 text-[9px] uppercase tracking-wide text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              local
            </span>
          )}
        </span>
      ) : (
        <span className="text-gray-300 dark:text-gray-600">—</span>
      )}
    </td>
  );
}

const ATIVIDADE_LABEL: Record<string, string> = {
  login: 'Login', login_falha: 'Login (falha)', logout: 'Logout',
  password_change: 'Troca de senha', password_reset: 'Reset de senha', first_access: 'Primeiro acesso',
};

/** Rótulos legíveis pros campos do diff (fallback = nome cru). */
const CAMPO_LABEL: Record<string, string> = {
  saldoAcmCents: 'Saldo', dataSaldoAcm: 'Data do saldo',
  orcadoMensalCents: 'Meta mensal', observacao: 'Observação',
  status: 'Status', resposta: 'Resposta', role: 'Papel', ativo: 'Ativo',
  nomeCompleto: 'Nome', recebidoCents: 'Valor recebido', dataRecebimento: 'Data do recebimento',
};

function rotuloCampo(campo: string): string {
  return CAMPO_LABEL[campo] ?? campo;
}

/** Formata o valor de um campo do diff (moeda p/ *Cents, sim/não p/ boolean). */
function fmtValorCampo(campo: string, v: AuditAlteracaoCampo['de']): string {
  if (v === null) return '—';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'number' && /cents$/i.test(campo)) {
    return (v / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  return String(v);
}

const PAGE_SIZE = 50;

export default function AuditoriaPage() {
  const [aba, setAba] = useState<Aba>('acessos');
  const [usuarioId, setUsuarioId] = useState('');
  const [acao, setAcao] = useState('');
  const [recurso, setRecurso] = useState('');
  const [dtIni, setDtIni] = useState('');
  const [dtFim, setDtFim] = useState('');
  const [busca, setBusca] = useState('');
  const [somenteAlteracoes, setSomenteAlteracoes] = useState(false);
  const [page, setPage] = useState(1);
  const [aberto, setAberto] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setAberto((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const filtros = { usuarioId, acao, recurso, dtIni, dtFim, busca, somenteAlteracoes };
  const params = () => {
    const o: Record<string, string | number | boolean> = { page, pageSize: PAGE_SIZE };
    if (usuarioId) o.usuarioId = usuarioId;
    if (acao) o.acao = acao;
    if (recurso) o.recurso = recurso;
    if (dtIni) o.dtIni = dtIni;
    if (dtFim) o.dtFim = dtFim;
    if (busca) o.busca = busca;
    if (somenteAlteracoes) o.somenteAlteracoes = true;
    return o;
  };

  const resumoQ = useQuery<AuditResumoResponse>({
    queryKey: ['auditoria', 'resumo'],
    queryFn: async () => (await api.get<AuditResumoResponse>('/api/audit/resumo', { params: { dias: 30 } })).data,
    staleTime: 5 * 60_000,
  });

  const acessosQ = useQuery<AuditAcessosResponse>({
    queryKey: ['auditoria', 'acessos', { ...filtros, page }],
    queryFn: async () => (await api.get<AuditAcessosResponse>('/api/audit/acessos', { params: params() })).data,
    enabled: aba === 'acessos',
    placeholderData: keepPreviousData,
  });

  const atividadeQ = useQuery<AuditAtividadeResponse>({
    queryKey: ['auditoria', 'atividade', { usuarioId, dtIni, dtFim, page }],
    queryFn: async () => {
      const o: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
      if (usuarioId) o.usuarioId = usuarioId;
      if (dtIni) o.dtIni = dtIni;
      if (dtFim) o.dtFim = dtFim;
      return (await api.get<AuditAtividadeResponse>('/api/audit/atividade', { params: o })).data;
    },
    enabled: aba === 'atividade',
    placeholderData: keepPreviousData,
  });

  function trocarFiltro(fn: () => void) { fn(); setPage(1); }

  async function exportar() {
    try {
      const res = await api.get('/api/audit/export', { params: params(), responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'auditoria-acessos.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(extrairMensagemErro(err));
    }
  }

  const resumo = resumoQ.data;
  const lista = aba === 'acessos' ? acessosQ.data : atividadeQ.data;
  const carregando = aba === 'acessos' ? acessosQ.isLoading : atividadeQ.isLoading;
  const totalPaginas = lista ? Math.max(1, Math.ceil(lista.total / PAGE_SIZE)) : 1;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <ShieldCheck className="h-6 w-6 text-gray-400" />
            Auditoria
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
            Trilha de quem acessou, alterou, aprovou e exportou dados no sistema. Leitura dos logs que o sistema já grava
            (não altera nada). Restrito a compliance/gestão.
          </p>
        </div>
        <Button onClick={exportar} variant="outline" size="sm">
          <Download className="h-4 w-4" /><span className="ml-1">Exportar (Excel)</span>
        </Button>
      </div>

      <ModuleStatusBanner href="/auditoria" />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Eye className="h-4 w-4" />} label={`Acessos (${resumo?.periodoDias ?? 30}d)`} valor={resumo?.totalAcessos} />
        <Kpi icon={<Pencil className="h-4 w-4" />} label="Alterações" valor={resumo?.totalAlteracoes} tom="amber" />
        <Kpi icon={<FileClock className="h-4 w-4" />} label="Atividade de conta" valor={resumo?.totalAtividade} />
        <Kpi icon={<Users className="h-4 w-4" />} label="Usuários ativos" valor={resumo?.usuariosAtivos} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {(['acessos', 'atividade'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setAba(t); setPage(1); }}
            className={cn(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              aba === t ? 'border-pioneira-500 text-pioneira-800 dark:border-yellow-500 dark:text-yellow-300' : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
            )}
          >
            {t === 'acessos' ? 'Acessos a dados' : 'Atividade de conta'}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <Filtro label="Usuário">
            <select value={usuarioId} onChange={(e) => trocarFiltro(() => setUsuarioId(e.target.value))} className={selectCls}>
              <option value="">todos</option>
              {(resumo?.usuarios ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Filtro>
          {aba === 'acessos' && (
            <>
              <Filtro label="Ação">
                <select value={acao} onChange={(e) => trocarFiltro(() => setAcao(e.target.value))} className={selectCls}>
                  <option value="">todas</option>
                  {ACAO_AUDITORIA.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Filtro>
              <Filtro label="Recurso">
                <select value={recurso} onChange={(e) => trocarFiltro(() => setRecurso(e.target.value))} className={selectCls}>
                  <option value="">todos</option>
                  {(resumo?.recursos ?? []).map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Filtro>
            </>
          )}
          <Filtro label="De">
            <input type="date" value={dtIni} onChange={(e) => trocarFiltro(() => setDtIni(e.target.value))} className={selectCls} />
          </Filtro>
          <Filtro label="Até">
            <input type="date" value={dtFim} onChange={(e) => trocarFiltro(() => setDtFim(e.target.value))} className={selectCls} />
          </Filtro>
          {aba === 'acessos' && (
            <>
              <Filtro label="Busca">
                <input
                  value={busca}
                  onChange={(e) => trocarFiltro(() => setBusca(e.target.value))}
                  placeholder="recurso, descrição, id…"
                  className={cn(selectCls, 'w-44')}
                />
              </Filtro>
              <label className="flex items-center gap-1.5 pb-1.5 text-xs text-gray-600 dark:text-gray-300">
                <input type="checkbox" checked={somenteAlteracoes} onChange={(e) => trocarFiltro(() => setSomenteAlteracoes(e.target.checked))} />
                só alterações
              </label>
            </>
          )}
        </div>
      </Card>

      {/* Tabela */}
      <Card className="overflow-hidden">
        {carregando && !lista ? (
          <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !lista || lista.itens.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-gray-400">Nenhum registro para os filtros.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-800">
                  <th className="px-4 py-2 font-medium">Quando</th>
                  <th className="px-4 py-2 font-medium">Usuário</th>
                  {aba === 'acessos' ? (
                    <>
                      <th className="px-4 py-2 font-medium">Ação</th>
                      <th className="px-4 py-2 font-medium">Recurso</th>
                      <th className="px-4 py-2 font-medium">Descrição</th>
                    </>
                  ) : (
                    <th className="px-4 py-2 font-medium">Evento</th>
                  )}
                  <th className="px-4 py-2 font-medium">IP</th>
                  <th className="px-4 py-2 font-medium">Dispositivo</th>
                </tr>
              </thead>
              <tbody>
                {aba === 'acessos'
                  ? (acessosQ.data?.itens ?? []).map((it) => {
                      const temDiff = (it.alteracoes?.length ?? 0) > 0;
                      const estaAberto = aberto.has(it.id);
                      return (
                        <Fragment key={it.id}>
                          <tr
                            onClick={temDiff ? () => toggle(it.id) : undefined}
                            className={cn(
                              'border-b border-gray-50 last:border-0 dark:border-gray-800/50',
                              temDiff && 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40',
                            )}
                          >
                            <td className="whitespace-nowrap px-4 py-2 text-gray-500 tabular-nums">{dataHora(it.criadoEm)}</td>
                            <td className="px-4 py-2">
                              <div className="font-medium">{it.usuarioNome ?? '—'}</div>
                              {it.usuarioEmail && <div className="text-[11px] text-gray-400">{it.usuarioEmail}</div>}
                            </td>
                            <td className="px-4 py-2">
                              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', corAcao(it.acao))}>{it.acao}</span>
                            </td>
                            <td className="px-4 py-2">
                              <span className="font-medium">{it.recurso}</span>
                              {it.recursoId && <span className="ml-1 text-[11px] text-gray-400">#{it.recursoId}</span>}
                            </td>
                            <td className="max-w-xs px-4 py-2 text-gray-600 dark:text-gray-300">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate" title={it.descricao ?? undefined}>{it.descricao ?? ''}</span>
                                {temDiff && (
                                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                                    {estaAberto ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                                    {it.alteracoes!.length} {it.alteracoes!.length === 1 ? 'alteração' : 'alterações'}
                                  </span>
                                )}
                              </div>
                            </td>
                            <IpCell ip={it.ipAddress} />
                            <DispositivoCell dispositivo={it.dispositivo} tipo={it.dispositivoTipo} />
                          </tr>
                          {temDiff && estaAberto && (
                            <tr className="bg-gray-50/70 dark:bg-gray-900/40">
                              <td colSpan={7} className="px-4 py-3">
                                <div className="overflow-x-auto">
                                  <table className="text-xs">
                                    <thead>
                                      <tr className="text-left text-[10px] uppercase tracking-wide text-gray-400">
                                        <th className="pb-1 pr-6 font-medium">Campo</th>
                                        <th className="pb-1 pr-3 font-medium">Antes</th>
                                        <th className="pb-1 font-medium" />
                                        <th className="pb-1 pl-3 font-medium">Depois</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {it.alteracoes!.map((a) => (
                                        <tr key={a.campo}>
                                          <td className="py-0.5 pr-6 font-medium text-gray-600 dark:text-gray-300">{rotuloCampo(a.campo)}</td>
                                          <td className="py-0.5 pr-3 tabular-nums text-red-600 line-through dark:text-red-400">{fmtValorCampo(a.campo, a.de)}</td>
                                          <td className="py-0.5 text-gray-400"><ArrowRight className="h-3 w-3" /></td>
                                          <td className="py-0.5 pl-3 tabular-nums text-emerald-700 dark:text-emerald-400">{fmtValorCampo(a.campo, a.para)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })
                  : (atividadeQ.data?.itens ?? []).map((it) => (
                      <tr key={it.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/50">
                        <td className="whitespace-nowrap px-4 py-2 text-gray-500 tabular-nums">{dataHora(it.criadoEm)}</td>
                        <td className="px-4 py-2">
                          <div className="font-medium">{it.usuarioNome ?? '—'}</div>
                          {it.usuarioEmail && <div className="text-[11px] text-gray-400">{it.usuarioEmail}</div>}
                        </td>
                        <td className="px-4 py-2">
                          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', it.activityType === 'login_falha' ? corAcao('rejeitou') : corAcao('sincronizou'))}>
                            {ATIVIDADE_LABEL[it.activityType] ?? it.activityType}
                          </span>
                        </td>
                        <IpCell ip={it.ipAddress} />
                        <DispositivoCell dispositivo={it.dispositivo} tipo={it.dispositivoTipo} />
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {lista && lista.total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-2 text-xs text-gray-500 dark:border-gray-800">
            <span>{lista.total.toLocaleString('pt-BR')} registros · página {page} de {totalPaginas}</span>
            <div className="flex gap-1">
              <button type="button" disabled={page <= 1} onClick={() => setPage((x) => x - 1)} className="rounded p-1 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800"><ChevronLeft className="h-4 w-4" /></button>
              <button type="button" disabled={page >= totalPaginas} onClick={() => setPage((x) => x + 1)} className="rounded p-1 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        )}
      </Card>

      <p className="text-[11px] text-gray-400">
        Fontes: <strong>audit.acesso_dados</strong> (acessos/ações) e <strong>audit.user_activity_logs</strong> (login/senha).
        A trilha registra <em>quem fez o quê em qual registro</em> (ação + recurso + id) e, nas alterações sensíveis (âncora de
        saldo, meta de orçamento, conciliação manual, baixa de reembolso, resposta ao financeiro e administração de usuários),
        o <em>diff campo-a-campo</em> (valor antes × depois) — clique numa linha marcada com <span className="font-semibold text-amber-700 dark:text-amber-300">alterações</span> para expandir.
      </p>
    </div>
  );
}

const selectCls = 'rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-900';

function Filtro({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-gray-400">{label}</span>
      {children}
    </label>
  );
}

function Kpi({ icon, label, valor, tom }: { icon: React.ReactNode; label: string; valor: number | undefined; tom?: 'amber' }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">{icon}<span>{label}</span></div>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', tom === 'amber' && 'text-amber-600 dark:text-amber-400')}>
        {valor === undefined ? '—' : valor.toLocaleString('pt-BR')}
      </p>
    </Card>
  );
}
