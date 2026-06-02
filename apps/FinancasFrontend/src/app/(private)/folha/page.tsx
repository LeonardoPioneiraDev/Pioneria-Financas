'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Users2, AlertCircle, DollarSign, TrendingDown, ArrowRight, RefreshCw, DatabaseZap, Info, Building2 } from 'lucide-react';
import type { FolhaCompetenciasResponse, CompetenciaFolhaItem } from '@pioneira/shared/schemas/folha';
import { TIPO_FOLHA_LABEL, TIPO_FOLHA_GRUPO } from '@pioneira/shared/enums/tipo-folha';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CompliancePill } from '@/components/audit/CompliancePill';
import { AvisoColapsavel } from '@/components/shared/AvisoColapsavel';
import { useAuditView, useTrackPrint } from '@/hooks/useAudit';
import { formatarDataHoraCurto, formatarData } from '@/lib/datetime';
import { api, extrairMensagemErro } from '@/lib/api';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';
import {
  AjudaComoLerEstaTela,
  AjudaINSS,
  AjudaFGTS,
  AjudaIRRF,
  AjudaFolhaCpgVsFlp,
  AjudaCompetencia,
  AjudaRetencao,
  AjudaAging,
  AjudaTiposFolha,
} from './_components/ExplicacoesFolha';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function moedaCompacta(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}K`;
  return moeda(cents);
}

function competenciaAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
}

function primeiroDiaCompetencia(competencia: string): string {
  return `${competencia}-01`;
}

function primeiroDiaMesSeguinte(competencia: string): string {
  const [ano, mes] = competencia.split('-').map(Number);
  const d = new Date(Date.UTC(ano!, mes!, 1));
  return d.toISOString().slice(0, 10);
}

type FiltrarPor = 'vencimento' | 'competencia';

export default function FolhaPage() {
  const [competencia, setCompetencia] = useState<string>(competenciaAtual());
  const [filtrarPor, setFiltrarPor] = useState<FiltrarPor>('vencimento');
  const qc = useQueryClient();

  useAuditView({
    acao: 'visualizou',
    recurso: 'folha',
    descricao: 'Folha consolidada (encargos + benefícios CPG)',
    filtros: { competencia, filtrarPor },
  });
  useTrackPrint({ recurso: 'folha' });

  const { data, isLoading } = useQuery<FolhaCompetenciasResponse>({
    queryKey: ['folha', 'competencias', { competencia, filtrarPor }],
    queryFn: async () => {
      const res = await api.get<FolhaCompetenciasResponse>('/api/folha/competencias', {
        params: { competencia, filtrarPor },
      });
      return res.data;
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const dtIni = primeiroDiaCompetencia(competencia);
      const dtFim = primeiroDiaMesSeguinte(competencia);
      const res = await api.post('/api/contas-pagar/sync', { dtIni, dtFim });
      return res.data;
    },
    onSuccess: () => {
      toast.success(`Folha de ${competencia} sincronizada do Globus`);
      void qc.invalidateQueries({ queryKey: ['folha'] });
      void qc.invalidateQueries({ queryKey: ['contas-pagar'] });
    },
    onError: (err) => toast.error('Falha ao sincronizar', { description: extrairMensagemErro(err) }),
  });

  const competencias = data?.competencias ?? [];
  const totais = data?.totais;

  return (
    <div className="space-y-4 sm:space-y-6">
      <ModuleStatusBanner href="/folha" />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent">
              Folha de Pagamento — Encargos e Benefícios
            </h1>
            <CompliancePill recurso="folha" />
            <AjudaComoLerEstaTela />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            O que a Pioneira paga em impostos e benefícios da folha:{' '}
            <span className="inline-flex items-center gap-0.5">INSS<AjudaINSS /></span>,{' '}
            <span className="inline-flex items-center gap-0.5">FGTS<AjudaFGTS /></span>,{' '}
            <span className="inline-flex items-center gap-0.5">IRRF<AjudaIRRF /></span>,
            vale-transporte, vale-alimentação e contribuição sindical.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button asChild variant="default" size="sm">
            <Link href="/folha-detalhe">
              <Building2 className="h-4 w-4" />
              Folha por setor (completa)
            </Link>
          </Button>
          {totais && totais.qtdCompetencias > 0 && (
            <Button asChild variant="outline" size="sm">
              <Link href={`/contas-pagar?origem=folha`}>
                Ver títulos individuais
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      <AvisoColapsavel
        severidade="aviso"
        icone={Info}
        tituloPilula="O que esta tela mostra"
        delaySegundos={10}
      >
        <strong>Esta tela mostra só os encargos e benefícios</strong> da folha (INSS, FGTS, IRRF, vale-transporte, vale-alimentação, sindicato).{' '}
        <strong>NÃO inclui o salário líquido</strong> dos ~3.000 funcionários, que é depositado direto na conta de cada um sem passar pela
        aprovação financeira. Para ver a folha completa com cada funcionário, salário, setor e contra-cheque, acesse{' '}
        <Link href="/folha-detalhe" className="underline font-semibold hover:text-amber-700 dark:hover:text-amber-100">
          Folha por setor
        </Link>.{' '}
        <span className="inline-flex items-center gap-0.5"><AjudaFolhaCpgVsFlp /></span>
      </AvisoColapsavel>

      <Card className="p-3 sm:p-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Label htmlFor="competencia" className="text-xs flex items-center gap-1">
              {filtrarPor === 'vencimento' ? 'Mês de pagamento' : 'Competência (mês de trabalho)'}
              <AjudaCompetencia />
            </Label>
            <Input
              id="competencia"
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className="w-44"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setCompetencia(competenciaAtual())}>
            Mês atual
          </Button>
          <div className="flex items-center gap-1 ml-2">
            <Label className="text-xs text-gray-500 dark:text-gray-400 mr-1">Filtrar por:</Label>
            <Button
              variant={filtrarPor === 'vencimento' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltrarPor('vencimento')}
              className="h-8"
            >
              Pagamento
            </Button>
            <Button
              variant={filtrarPor === 'competencia' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFiltrarPor('competencia')}
              className="h-8"
            >
              Competência
            </Button>
          </div>
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
            {filtrarPor === 'vencimento'
              ? <>Títulos pagos/vencendo em <strong>{competencia}</strong></>
              : <>Folha referente a <strong>{competencia}</strong></>}
          </span>
        </div>
      </Card>

      {isLoading && (
        <Card className="p-12 text-center text-gray-500 dark:text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-transparent border-t-[#e6cd4a] dark:border-t-yellow-400 mx-auto mb-3" />
          Carregando competência da folha…
        </Card>
      )}

      {!isLoading && competencias.length === 0 && (
        <Card className="p-10 flex flex-col items-center text-center gap-5">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-pioneira-400/30 dark:bg-yellow-400/20 blur-2xl" />
            <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center shadow-lg">
              <DatabaseZap className="h-10 w-10 text-pioneira-900 dark:text-gray-900" />
            </div>
          </div>
          <div className="max-w-md">
            <h2 className="text-xl font-semibold text-pioneira-900 dark:text-yellow-200 mb-2">
              Sem dados de folha para {competencia}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Nenhum título de folha foi sincronizado para essa competência. Clique abaixo para puxar do Globus.
            </p>
          </div>
          <Button size="lg" onClick={() => sync.mutate()} disabled={sync.isPending} className="min-w-[260px]">
            {sync.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Sincronizando {competencia}…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Sincronizar folha de {competencia}
              </>
            )}
          </Button>
        </Card>
      )}

      {!isLoading && competencias.length > 0 && totais && (
        <>
          {(() => {
            const total = totais.qtdTitulos;
            const pct = (n: number): number => (total > 0 ? Math.round((n / total) * 100) : 0);
            const buckets = [
              { titulo: 'Vencido', qtd: totais.vencidos.qtd, valor: totais.vencidos.valorCents, cor: 'from-red-500 to-red-400 dark:from-red-600 dark:to-red-500', icone: AlertCircle, alerta: totais.vencidos.qtd > 0 },
              { titulo: 'Vence em 7 dias', qtd: totais.venceEm7d.qtd, valor: totais.venceEm7d.valorCents, cor: 'from-amber-400 to-amber-300 dark:from-amber-500 dark:to-amber-600', icone: Users2, alerta: false },
              { titulo: 'Vence em mais de 7 dias', qtd: totais.venceMaisDe7.qtd, valor: totais.venceMaisDe7.valorCents, cor: 'from-blue-400 to-blue-300 dark:from-blue-500 dark:to-blue-600', icone: DollarSign, alerta: false },
              { titulo: 'Pago', qtd: totais.pago.qtd, valor: totais.pago.valorCents, cor: 'from-emerald-400 to-emerald-300 dark:from-emerald-500 dark:to-emerald-600', icone: TrendingDown, alerta: false },
            ];
            const somaCards = buckets.reduce((acc, b) => acc + b.qtd, 0);
            return (
              <>
                {/* Header — Total no período + barra de composição */}
                <Card className="p-4 sm:p-5 bg-gradient-to-r from-pioneira-50/60 to-pioneira-100/30 dark:from-yellow-950/30 dark:to-yellow-900/10 border-pioneira-300 dark:border-yellow-800">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wider text-pioneira-700 dark:text-yellow-400 font-bold flex items-center gap-1">
                        Total no período · folha
                        <AjudaAging />
                      </p>
                      <p className="text-2xl sm:text-3xl font-bold mt-1 text-pioneira-900 dark:text-yellow-200">
                        {moeda(totais.valorLiquidoCents)}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                        <strong>{total.toLocaleString('pt-BR')}</strong> títulos ·{' '}
                        <span className="inline-flex items-center gap-0.5">
                          <strong>{totais.qtdCompetencias}</strong> competência{totais.qtdCompetencias !== 1 ? 's' : ''}
                          <AjudaCompetencia />
                        </span>
                        {totais.retencoesCents > 0 && (
                          <>
                            {' · '}
                            <span className="inline-flex items-center gap-0.5">
                              retenções <strong>{moedaCompacta(totais.retencoesCents)}</strong>
                              <AjudaRetencao />
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 h-12 w-12 rounded-xl bg-gradient-to-br from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center shadow-md">
                      <Users2 className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  {total > 0 && (
                    <div className="mt-3">
                      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
                        {buckets.map((b) => {
                          const w = (b.qtd / total) * 100;
                          if (w === 0) return null;
                          return (
                            <div
                              key={b.titulo}
                              className={`h-full bg-gradient-to-r ${b.cor} transition-all`}
                              style={{ width: `${w}%` }}
                              title={`${b.titulo}: ${b.qtd} (${pct(b.qtd)}%)`}
                            />
                          );
                        })}
                      </div>
                      {somaCards !== total && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1">
                          ⚠ soma dos cards ({somaCards}) ≠ total ({total}) — diferença de {Math.abs(total - somaCards)} (provavelmente cancelados)
                        </p>
                      )}
                    </div>
                  )}
                </Card>

                {/* 4 cards exclusivos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  {buckets.map((b) => {
                    const Icone = b.icone;
                    return (
                      <Card key={b.titulo} className={`p-4 ${b.alerta ? 'ring-1 ring-red-300 dark:ring-red-700' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">{b.titulo}</p>
                            <p className="text-xl sm:text-2xl font-bold mt-1 truncate" title={moeda(b.valor)}>{moedaCompacta(b.valor)}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              <strong>{b.qtd.toLocaleString('pt-BR')}</strong> {b.qtd === 1 ? 'título' : 'títulos'}
                              {total > 0 && <span className="text-gray-400 dark:text-gray-500"> · {pct(b.qtd)}% do total</span>}
                            </p>
                          </div>
                          <div className={`shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br ${b.cor} flex items-center justify-center shadow-md`}>
                            <Icone className="h-5 w-5 text-white" />
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </>
            );
          })()}

          {/* Quebra por tipo AGREGADA do período inteiro */}
          {data?.porTipoGeral && data.porTipoGeral.length > 0 && (
            <Card className="p-3 sm:p-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-3 flex items-center gap-1.5">
                Quebra por tipo · período inteiro ({totais.qtdTitulos.toLocaleString('pt-BR')} títulos)
                <AjudaTiposFolha />
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {data.porTipoGeral.map((t) => {
                  const grupo = TIPO_FOLHA_GRUPO[t.tipo];
                  const corGrupo: Record<string, string> = {
                    funcionario: 'border-l-pioneira-400 dark:border-l-yellow-500',
                    encargo: 'border-l-red-400 dark:border-l-red-500',
                    beneficio: 'border-l-emerald-400 dark:border-l-emerald-500',
                    desconto: 'border-l-amber-400 dark:border-l-amber-500',
                    outros: 'border-l-gray-300 dark:border-l-gray-600',
                  };
                  const percPago = t.valorLiquidoCents > 0 ? (t.valorPagoCents / t.valorLiquidoCents) * 100 : 0;
                  return (
                    <div
                      key={t.tipo}
                      className={`flex items-center justify-between gap-3 p-2 rounded-lg bg-gray-50/50 dark:bg-gray-900/30 border-l-4 ${corGrupo[grupo]}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{TIPO_FOLHA_LABEL[t.tipo]}</p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                          {t.qtdTitulos.toLocaleString('pt-BR')} título{t.qtdTitulos !== 1 ? 's' : ''} · {percPago.toFixed(0)}% pago
                        </p>
                      </div>
                      <span className="font-mono text-sm font-bold whitespace-nowrap" title={moeda(t.valorLiquidoCents)}>
                        {moedaCompacta(t.valorLiquidoCents)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* TODAS as competências (não só [0]) */}
          {competencias.map((c) => <CompetenciaCard key={c.competencia || 'sem'} competencia={c} />)}

          <Card className="p-3 sm:p-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <strong>{data?.syncInfo?.totalLocal.toLocaleString('pt-BR')}</strong> títulos de folha no banco local
              {data?.syncInfo?.ultimoSyncEm && ` · último sync ${formatarDataHoraCurto(data.syncInfo.ultimoSyncEm)}`}
            </div>
            <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
              <RefreshCw className={sync.isPending ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
              {sync.isPending ? 'Sincronizando' : 'Re-sincronizar este mês'}
            </Button>
          </Card>
        </>
      )}

    </div>
  );
}

function CompetenciaCard({ competencia }: { competencia: CompetenciaFolhaItem }) {
  const percentualPago = competencia.valorLiquidoCents > 0
    ? (competencia.valorPagoCents / competencia.valorLiquidoCents) * 100
    : 0;
  const corBarra = percentualPago >= 100 ? 'bg-emerald-500' : percentualPago >= 50 ? 'bg-amber-500' : 'bg-red-400';

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div className="min-w-0">
          <h3 className="text-lg font-bold text-pioneira-900 dark:text-yellow-200">{competencia.competenciaLabel}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {competencia.qtdTitulos} títulos · {competencia.qtdFornecedores} fornecedor{competencia.qtdFornecedores !== 1 ? 'es' : ''}
            {competencia.primeiroVencimento && competencia.ultimoVencimento && (
              <>
                {' · vencimentos '}
                {formatarData(`${competencia.primeiroVencimento}T00:00:00`).slice(0, 5)}
                {' a '}
                {formatarData(`${competencia.ultimoVencimento}T00:00:00`).slice(0, 5)}
              </>
            )}
          </p>
        </div>
        <Badge variant={percentualPago >= 100 ? 'success' : percentualPago > 0 ? 'warning' : 'muted'}>
          {percentualPago.toFixed(0)}% pago
        </Badge>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <Metrica titulo="Bruto" valor={competencia.valorBrutoCents} />
        <Metrica titulo="Retenções" valor={-competencia.retencoes.totalCents} negativo />
        <Metrica titulo="Líquido" valor={competencia.valorLiquidoCents} destaque />
        <Metrica titulo="Em aberto" valor={competencia.valorEmAbertoCents} alerta={competencia.valorEmAbertoCents > 0} />
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span>Pago: {moedaCompacta(competencia.valorPagoCents)}</span>
          <span>Total: {moedaCompacta(competencia.valorLiquidoCents)}</span>
        </div>
        <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full ${corBarra} transition-all duration-500`} style={{ width: `${Math.min(100, percentualPago)}%` }} />
        </div>
      </div>

      {competencia.porTipo.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-2">
            Quebra por tipo
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {competencia.porTipo.map((t) => {
              const grupo = TIPO_FOLHA_GRUPO[t.tipo];
              const corGrupo: Record<string, string> = {
                funcionario: 'border-l-pioneira-400 dark:border-l-yellow-500',
                encargo: 'border-l-red-400 dark:border-l-red-500',
                beneficio: 'border-l-emerald-400 dark:border-l-emerald-500',
                desconto: 'border-l-amber-400 dark:border-l-amber-500',
                outros: 'border-l-gray-300 dark:border-l-gray-600',
              };
              const percPago = t.valorLiquidoCents > 0 ? (t.valorPagoCents / t.valorLiquidoCents) * 100 : 0;
              return (
                <div
                  key={t.tipo}
                  className={`flex items-center justify-between gap-3 p-2 rounded-lg bg-gray-50/50 dark:bg-gray-900/30 border-l-4 ${corGrupo[grupo]}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{TIPO_FOLHA_LABEL[t.tipo]}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                      {t.qtdTitulos} título{t.qtdTitulos > 1 ? 's' : ''} · {percPago.toFixed(0)}% pago
                    </p>
                  </div>
                  <span className="font-mono text-sm font-bold whitespace-nowrap">{moeda(t.valorLiquidoCents)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {competencia.retencoes.totalCents > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-pioneira-700 dark:text-yellow-400 hover:underline font-medium inline-flex items-center gap-1">
            Detalhamento das retenções na fonte <AjudaRetencao />
          </summary>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 pl-4 text-gray-600 dark:text-gray-300">
            {competencia.retencoes.inssCents > 0 && <div>INSS: <strong>{moeda(competencia.retencoes.inssCents)}</strong></div>}
            {competencia.retencoes.irrfCents > 0 && <div>IRRF: <strong>{moeda(competencia.retencoes.irrfCents)}</strong></div>}
            {competencia.retencoes.pisCents > 0 && <div>PIS: <strong>{moeda(competencia.retencoes.pisCents)}</strong></div>}
            {competencia.retencoes.cofinsCents > 0 && <div>COFINS: <strong>{moeda(competencia.retencoes.cofinsCents)}</strong></div>}
            {competencia.retencoes.csllCents > 0 && <div>CSLL: <strong>{moeda(competencia.retencoes.csllCents)}</strong></div>}
            {competencia.retencoes.issCents > 0 && <div>ISS: <strong>{moeda(competencia.retencoes.issCents)}</strong></div>}
          </div>
        </details>
      )}

      <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-end">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/contas-pagar?origem=folha&dtIni=${competencia.primeiroVencimento ?? ''}&dtFim=${competencia.ultimoVencimento ?? ''}`}>
            Ver títulos da competência
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

function Metrica({ titulo, valor, destaque, negativo, alerta }: { titulo: string; valor: number; destaque?: boolean; negativo?: boolean; alerta?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">{titulo}</p>
      <p
        className={`font-mono text-sm sm:text-base ${
          destaque ? 'font-bold text-pioneira-900 dark:text-yellow-200' : ''
        } ${negativo ? 'text-red-600 dark:text-red-400' : ''} ${alerta ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}`}
      >
        {moeda(Math.abs(valor))}
        {negativo && valor !== 0 && <span className="text-[10px] ml-1">(-)</span>}
      </p>
    </div>
  );
}
