'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2, Users, AlertCircle, ArrowLeft, Database, ShieldAlert, RefreshCw,
  DatabaseZap, TrendingUp, TrendingDown, ChevronDown, ChevronRight, Briefcase,
} from 'lucide-react';
import type { SetorFolhaResponse, SetorItem, DiagnosticoFlpResponse } from '@pioneira/shared/schemas/folha-detalhe';
import { TIPO_FOLHA_FLP_LABEL } from '@pioneira/shared/enums/tipo-folha-flp';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CompliancePill } from '@/components/audit/CompliancePill';
import { AvisoColapsavel } from '@/components/shared/AvisoColapsavel';
import { useAuditView, useTrackPrint } from '@/hooks/useAudit';
import { formatarDataHoraCurto } from '@/lib/datetime';
import { api, extrairMensagemErro } from '@/lib/api';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';
import {
  AjudaComoLerFolhaDetalhe,
  AjudaProventosDescontos,
  AjudaSetorFuncao,
  AjudaTipoFolhaFlp,
  AjudaCompetencia,
  AjudaINSS,
  AjudaFGTS,
  AjudaSalarioBase,
  AjudaHoraExtra,
  AjudaAdicionalNoturno,
  AjudaInsalubridadePericulosidade,
  AjudaVTVA,
} from './_components/ExplicacoesFolhaDetalhe';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function moedaCompacta(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} K`;
  return moeda(cents);
}
function competenciaAtual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function FolhaDetalhePage() {
  const [competencia, setCompetencia] = useState<string>(competenciaAtual());
  const [tipoFolha, setTipoFolha] = useState<number | ''>('');
  const qc = useQueryClient();

  useAuditView({
    acao: 'visualizou',
    recurso: 'folha-detalhe',
    descricao: 'Folha detalhada por setor (FLP)',
    filtros: { competencia, tipoFolha: tipoFolha || null },
  });
  useTrackPrint({ recurso: 'folha-detalhe' });

  const { data, isLoading } = useQuery<SetorFolhaResponse>({
    queryKey: ['folha-detalhe', 'setores', { competencia, tipoFolha }],
    queryFn: async () => {
      const params: Record<string, string | number> = { competencia };
      if (tipoFolha) params.tipoFolha = tipoFolha;
      const res = await api.get<SetorFolhaResponse>('/api/folha-detalhe/setores', { params });
      return res.data;
    },
  });

  const semDadosNaCompetencia = !isLoading && data && data.setores.length === 0;

  const { data: diagnostico } = useQuery<DiagnosticoFlpResponse>({
    queryKey: ['folha-detalhe', 'diagnostico'],
    queryFn: async () => {
      const res = await api.get<DiagnosticoFlpResponse>('/api/folha-detalhe/diagnostico');
      return res.data;
    },
    enabled: !!semDadosNaCompetencia,
  });

  const sync = useMutation({
    mutationFn: async () => {
      const body: Record<string, string | number> = { competencia };
      if (tipoFolha) body.tipoFolha = tipoFolha;
      const res = await api.post('/api/folha-detalhe/sync', body);
      return res.data;
    },
    onSuccess: (r: { fichasGravadas: number; funcionariosGravados: number; duracaoMs: number; status: string }) => {
      toast.success('Sincronização concluída', {
        description: `${r.funcionariosGravados.toLocaleString('pt-BR')} funcionários · ${r.fichasGravadas.toLocaleString('pt-BR')} lançamentos · ${(r.duracaoMs / 1000).toFixed(1)}s`,
      });
      void qc.invalidateQueries({ queryKey: ['folha-detalhe'] });
    },
    onError: (err) => toast.error('Falha na sincronização', { description: extrairMensagemErro(err) }),
  });

  const totais = data?.totais;
  const setores = data?.setores ?? [];
  const semDados = !isLoading && data?.syncInfo.precisaSincronizar;
  const mostrarDiagnostico = semDadosNaCompetencia && !semDados;

  return (
    <div className="space-y-4 sm:space-y-6">
      <ModuleStatusBanner href="/folha-detalhe" />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent">
              Folha por Setor
            </h1>
            <CompliancePill recurso="folha-detalhe" />
            <AjudaComoLerFolhaDetalhe />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            <span className="inline-flex items-center gap-0.5">Proventos<AjudaProventosDescontos /></span>,{' '}
            <span className="inline-flex items-center gap-0.5">descontos<AjudaProventosDescontos /></span>,{' '}
            <span className="inline-flex items-center gap-0.5">FGTS<AjudaFGTS /></span> e{' '}
            <span className="inline-flex items-center gap-0.5">INSS<AjudaINSS /></span>{' '}
            quebrados por <span className="inline-flex items-center gap-0.5">setor / função<AjudaSetorFuncao /></span>{' '}
            — folha completa dos funcionários.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/folha">
            <ArrowLeft className="h-4 w-4" />
            Voltar para Folha (encargos)
          </Link>
        </Button>
      </div>

      <AvisoColapsavel severidade="critico" icone={ShieldAlert} tituloPilula="Dados sensíveis · LGPD" delaySegundos={10}>
        <strong>Dados altamente sensíveis — LGPD.</strong> Esta tela acessa informações pessoais e
        salariais individualizadas de funcionários. <strong>Toda navegação, filtro, abertura de contra-cheque,
        impressão ou exportação é registrada com seu usuário, IP, data/hora (fuso de Brasília) e parâmetros utilizados.</strong>{' '}
        Compartilhamento não autorizado de dados implica responsabilização civil e criminal (Lei 13.709/2018).
      </AvisoColapsavel>

      <Card className="p-3 sm:p-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Label htmlFor="competencia" className="text-xs flex items-center gap-1">
              Competência da folha <AjudaCompetencia />
            </Label>
            <Input
              id="competencia"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className="w-44"
            />
          </div>
          <div>
            <Label htmlFor="tipo-folha" className="text-xs flex items-center gap-1">
              Tipo de folha <AjudaTipoFolhaFlp />
            </Label>
            <select
              id="tipo-folha"
              value={tipoFolha}
              onChange={(e) => setTipoFolha(e.target.value === '' ? '' : Number(e.target.value))}
              className="block w-44 h-9 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 text-sm"
            >
              <option value="">Todas</option>
              {Object.entries(TIPO_FOLHA_FLP_LABEL).map(([cod, lab]) => (
                <option key={cod} value={cod}>{cod} — {lab}</option>
              ))}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={() => setCompetencia(competenciaAtual())}>
            Mês atual
          </Button>
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
            {data?.syncInfo?.ultimoSyncEm && <>último sync <strong>{formatarDataHoraCurto(data.syncInfo.ultimoSyncEm)}</strong></>}
          </span>
        </div>
      </Card>

      {isLoading && (
        <Card className="p-12 text-center text-gray-500 dark:text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-transparent border-t-[#e6cd4a] dark:border-t-yellow-400 mx-auto mb-3" />
          Carregando folha detalhada…
        </Card>
      )}

      {mostrarDiagnostico && diagnostico && (
        <Card className="p-4 border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20">
          <div className="flex items-start gap-3 mb-3">
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">
              <strong>Sincronização rodou, mas a competência selecionada ({competencia}) não tem lançamentos no banco local.</strong>{' '}
              Veja abaixo o que realmente foi sincronizado. Provavelmente o Globus armazena esta folha com data diferente do mês selecionado
              (ex.: folha de Maio fica como <code>COMPETFICHA=30/04</code>, e o filtro semi-aberto já cobre isso — mas talvez o sync não tenha trazido dados para esta competência).
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
            <DiagBox titulo="Funcionários (canonical)" valor={diagnostico.canonical.funcionarios.toLocaleString('pt-BR')} />
            <DiagBox titulo="Eventos (canonical)" valor={diagnostico.canonical.eventos.toLocaleString('pt-BR')} />
            <DiagBox titulo="Fichas (canonical)" valor={diagnostico.canonical.fichas.toLocaleString('pt-BR')} destaque />
            <DiagBox titulo="Stage pendente" valor={diagnostico.stage.fichasPendentes.toLocaleString('pt-BR')} alerta={diagnostico.stage.fichasPendentes > 0} />
          </div>

          {diagnostico.ultimoJob && (
            <div className="mb-3 text-xs text-amber-800 dark:text-amber-300 bg-white/50 dark:bg-gray-900/30 rounded p-2 border border-amber-200 dark:border-amber-800">
              <strong>Último sync:</strong> status <code>{diagnostico.ultimoJob.status}</code>
              {' · '}{diagnostico.ultimoJob.registrosGravados.toLocaleString('pt-BR')} de {diagnostico.ultimoJob.registrosLidos.toLocaleString('pt-BR')} gravados
              {diagnostico.ultimoJob.registrosComErro > 0 && <> · <span className="text-red-700 dark:text-red-300">{diagnostico.ultimoJob.registrosComErro} erros</span></>}
              {diagnostico.ultimoJob.erroMensagem && <><br /><span className="text-red-700 dark:text-red-300">⚠ {diagnostico.ultimoJob.erroMensagem}</span></>}
              {diagnostico.ultimoJob.parametros && (
                <><br />Parâmetros: <code>{JSON.stringify(diagnostico.ultimoJob.parametros)}</code></>
              )}
            </div>
          )}

          {diagnostico.competenciasDisponiveis.length > 0 ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-1">
                Competências disponíveis no banco local
              </p>
              <div className="flex flex-wrap gap-1.5">
                {diagnostico.competenciasDisponiveis.map((c) => {
                  const yyyyMm = c.competencia.slice(0, 7);
                  return (
                    <button
                      key={`${c.competencia}-${c.tipoFolha}`}
                      type="button"
                      onClick={() => { setCompetencia(yyyyMm); setTipoFolha(c.tipoFolha); }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
                    >
                      <span className="font-mono">{c.competencia}</span>
                      <Badge variant="muted" className="text-[10px]">{TIPO_FOLHA_FLP_LABEL[c.tipoFolha] ?? `tipo ${c.tipoFolha}`}</Badge>
                      <span className="text-gray-500 dark:text-gray-400">{c.qtdFuncionarios.toLocaleString('pt-BR')} func · {c.qtdLancamentos.toLocaleString('pt-BR')} lançamentos</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">Clique em uma competência para abri-la.</p>
            </div>
          ) : (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              <strong>Nada na tabela canonical.</strong> O sync pode ter retornado zero linhas do Oracle para este filtro de competência/tipo. Verifique no log do backend a mensagem
              <code className="mx-1">[sync:globus:flp] ZERO fichas no range…</code>
            </p>
          )}
        </Card>
      )}

      {semDados && (
        <Card className="p-8 sm:p-12 flex flex-col items-center text-center gap-5">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-pioneira-400/30 dark:bg-yellow-400/20 blur-2xl" />
            <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center shadow-lg">
              <DatabaseZap className="h-10 w-10 text-pioneira-900 dark:text-gray-900" />
            </div>
          </div>
          <div className="max-w-lg">
            <h2 className="text-xl font-semibold text-pioneira-900 dark:text-yellow-200 mb-2">
              Sem dados de FLP para {competencia}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Nenhum lançamento de folha foi sincronizado para esta competência. Clique abaixo para puxar
              <strong> VW_FUNCIONARIOS</strong>, <strong>FLP_EVENTOS</strong> e <strong>FLP_FICHAEVENTOS</strong> do Globus.
              Pode levar 30 s a 3 min dependendo do volume.
            </p>
          </div>
          <Button size="lg" onClick={() => sync.mutate()} disabled={sync.isPending} className="min-w-[280px]">
            {sync.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Sincronizando {competencia}…
              </>
            ) : (
              <>
                <Database className="h-4 w-4" />
                Sincronizar folha de {competencia}
              </>
            )}
          </Button>
        </Card>
      )}

      {!isLoading && !semDados && totais && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            <ResumoCard titulo="Funcionários" valor={`${totais.qtdFuncionarios.toLocaleString('pt-BR')}`} sub={`em ${totais.qtdSetores} setor${totais.qtdSetores !== 1 ? 'es' : ''}`} icone={Users} cor="from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600" ajuda={<AjudaSetorFuncao />} />
            <ResumoCard titulo="Proventos" valor={moedaCompacta(totais.proventosCents)} sub="Tudo que soma (bruto)" icone={TrendingUp} cor="from-emerald-400 to-emerald-300 dark:from-emerald-500 dark:to-emerald-600" ajuda={<AjudaProventosDescontos />} />
            <ResumoCard titulo="Descontos" valor={moedaCompacta(totais.descontosCents)} sub="Tudo que subtrai" icone={TrendingDown} cor="from-red-400 to-red-300 dark:from-red-500 dark:to-red-600" ajuda={<AjudaProventosDescontos />} />
            <ResumoCard titulo="Líquido" valor={moedaCompacta(totais.liquidoCents)} sub="Cai na conta do funcionário" icone={TrendingUp} cor="from-blue-400 to-blue-300 dark:from-blue-500 dark:to-blue-600" destaque ajuda={<AjudaProventosDescontos />} />
            <ResumoCard titulo="INSS" valor={moedaCompacta(totais.inssCents)} sub="Descontado do funcionário" icone={AlertCircle} cor="from-amber-400 to-amber-300 dark:from-amber-500 dark:to-amber-600" ajuda={<AjudaINSS />} />
            <ResumoCard titulo="FGTS" valor={moedaCompacta(totais.fgtsCents)} sub="8% pago pela empresa" icone={AlertCircle} cor="from-purple-400 to-purple-300 dark:from-purple-500 dark:to-purple-600" ajuda={<AjudaFGTS />} />
          </div>

          {/* Bloco explicativo das categorias — visíveis sem precisar abrir modais */}
          <Card className="p-3 sm:p-4 bg-gradient-to-br from-pioneira-50/40 to-transparent dark:from-yellow-950/20 dark:to-transparent border-pioneira-200 dark:border-yellow-900">
            <div className="flex items-start gap-3">
              <div className="shrink-0 h-9 w-9 rounded-lg bg-pioneira-400/30 dark:bg-yellow-500/20 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-pioneira-800 dark:text-yellow-300" />
              </div>
              <div className="text-xs leading-relaxed text-gray-700 dark:text-gray-300 space-y-1">
                <p className="font-semibold text-pioneira-900 dark:text-yellow-200">Categorias que aparecem na quebra por função</p>
                <p>
                  <strong>Proventos</strong> incluem:{' '}
                  <span className="inline-flex items-center gap-0.5">Salário base<AjudaSalarioBase /></span>,{' '}
                  <span className="inline-flex items-center gap-0.5">hora extra<AjudaHoraExtra /></span>,{' '}
                  <span className="inline-flex items-center gap-0.5">adicional noturno<AjudaAdicionalNoturno /></span>,{' '}
                  <span className="inline-flex items-center gap-0.5">insalubridade / periculosidade<AjudaInsalubridadePericulosidade /></span>,
                  prêmios, gratificações, 13º, férias.
                </p>
                <p>
                  <strong>Descontos</strong> incluem: INSS funcionário, IRRF, faltas,{' '}
                  <span className="inline-flex items-center gap-0.5">vale-transporte (6%) / vale-alimentação<AjudaVTVA /></span>,
                  pensão alimentícia, plano de saúde, sindical.
                </p>
              </div>
            </div>
          </Card>

          <div>
            <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
              <h2 className="text-lg font-bold text-pioneira-900 dark:text-yellow-200">
                Por setor ({setores.length})
              </h2>
              <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
                <RefreshCw className={sync.isPending ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
                {sync.isPending ? 'Sincronizando' : 'Re-sincronizar'}
              </Button>
            </div>
            <div className="space-y-2">
              {setores.map((s) => (
                <SetorCard key={`${s.codArea ?? 'null'}-${s.descArea ?? 'sem-area'}`} setor={s} totalLiquido={totais.liquidoCents} />
              ))}
            </div>
          </div>

          <Card className="p-3 sm:p-4 bg-gray-50/50 dark:bg-gray-900/30">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400 mt-0.5" />
              <div className="text-xs leading-relaxed text-gray-600 dark:text-gray-400">
                <strong>Trilha de auditoria desta visita:</strong> {data.syncInfo.totalFuncionarios.toLocaleString('pt-BR')} funcionários
                cadastrados · {data.syncInfo.totalFichas.toLocaleString('pt-BR')} lançamentos no banco local.
                Sua interação aqui está registrada na tabela <code>audit.acesso_dados</code>.
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

interface ResumoCardProps {
  titulo: string;
  valor: string;
  sub: string;
  icone: React.ComponentType<{ className?: string }>;
  cor: string;
  destaque?: boolean;
  ajuda?: React.ReactNode;
}
function ResumoCard({ titulo, valor, sub, icone: Icone, cor, destaque, ajuda }: ResumoCardProps) {
  return (
    <Card className={`p-3 sm:p-4 ${destaque ? 'border-pioneira-400 dark:border-yellow-500/40' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold inline-flex items-center gap-0.5">
            {titulo}
            {ajuda}
          </p>
          <p className={`text-lg sm:text-xl font-bold mt-0.5 truncate ${destaque ? 'text-pioneira-900 dark:text-yellow-200' : ''}`}>{valor}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{sub}</p>
        </div>
        <div className={`shrink-0 h-8 w-8 rounded-lg bg-gradient-to-br ${cor} flex items-center justify-center shadow-md`}>
          <Icone className="h-4 w-4 text-white" />
        </div>
      </div>
    </Card>
  );
}

function SetorCard({ setor, totalLiquido }: { setor: SetorItem; totalLiquido: number }) {
  const [expandido, setExpandido] = useState(false);
  const pctTotal = totalLiquido > 0 ? (setor.liquidoCents / totalLiquido) * 100 : 0;

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setExpandido(!expandido)}
        className="w-full p-3 sm:p-4 flex items-center gap-3 hover:bg-gray-50/60 dark:hover:bg-gray-900/40 transition-colors text-left"
      >
        <div className="shrink-0 h-10 w-10 rounded-lg bg-gradient-to-br from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center">
          <Building2 className="h-5 w-5 text-pioneira-900 dark:text-gray-900" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-pioneira-900 dark:text-yellow-200 truncate">
              {setor.descArea ?? `Setor ${setor.codArea ?? '—'}`}
            </p>
            <Badge variant="muted" className="font-mono text-[10px]">
              {setor.codArea ?? '—'}
            </Badge>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {setor.qtdFuncionarios.toLocaleString('pt-BR')} funcionário{setor.qtdFuncionarios !== 1 ? 's' : ''}
            {' · '}
            {pctTotal.toFixed(1)}% do líquido total
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Líquido</p>
          <p className="text-base sm:text-lg font-bold text-pioneira-900 dark:text-yellow-200 whitespace-nowrap">
            {moedaCompacta(setor.liquidoCents)}
          </p>
        </div>
        {expandido ? <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
      </button>

      {expandido && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-3 sm:p-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
            <MetricaLinha titulo="Proventos" valor={setor.proventosCents} cor="text-emerald-700 dark:text-emerald-400" />
            <MetricaLinha titulo="Descontos" valor={setor.descontosCents} cor="text-red-700 dark:text-red-400" />
            <MetricaLinha titulo="INSS" valor={setor.inssCents} cor="text-amber-700 dark:text-amber-400" />
            <MetricaLinha titulo="FGTS" valor={setor.fgtsCents} cor="text-purple-700 dark:text-purple-400" />
            <MetricaLinha titulo="IRRF" valor={setor.irrfCents} cor="text-blue-700 dark:text-blue-400" />
            <MetricaLinha titulo="VT + VA" valor={setor.vtCents + setor.vaCents} cor="text-pink-700 dark:text-pink-400" />
          </div>

          {setor.porFuncao.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-2 flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5" />
                Quebra por função
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {setor.porFuncao.map((fn, i) => (
                  <div
                    key={`${fn.descFuncao}-${i}`}
                    className="flex items-center justify-between gap-3 p-2 rounded-lg bg-gray-50/60 dark:bg-gray-900/30 border-l-4 border-l-pioneira-400 dark:border-l-yellow-500"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{fn.descFuncao ?? '—'}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">
                        {fn.qtdFuncionarios} funcionário{fn.qtdFuncionarios !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold whitespace-nowrap">{moeda(fn.liquidoCents)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function MetricaLinha({ titulo, valor, cor }: { titulo: string; valor: number; cor: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{titulo}</p>
      <p className={`font-mono text-sm font-bold ${cor}`}>{moedaCompacta(valor)}</p>
    </div>
  );
}

function DiagBox({ titulo, valor, destaque, alerta }: { titulo: string; valor: string; destaque?: boolean; alerta?: boolean }) {
  return (
    <div className={`rounded-md p-2 border ${alerta ? 'border-red-300 bg-red-50/70 dark:border-red-700 dark:bg-red-950/30' : 'border-amber-200 bg-white/60 dark:border-amber-800 dark:bg-gray-900/30'}`}>
      <p className="text-[10px] uppercase tracking-wider text-gray-600 dark:text-gray-400 truncate">{titulo}</p>
      <p className={`font-mono text-sm font-bold ${destaque ? 'text-pioneira-900 dark:text-yellow-200' : alerta ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-gray-100'}`}>{valor}</p>
    </div>
  );
}
