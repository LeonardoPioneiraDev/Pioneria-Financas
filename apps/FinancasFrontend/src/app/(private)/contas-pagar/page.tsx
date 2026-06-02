'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import Link from 'next/link';
import { Filter, RefreshCw, Search as SearchIcon, Receipt } from 'lucide-react';
import type {
  ContaPagarListResponse,
  ContaPagarResponse,
  SumarioContasPagarResponse,
  SyncContasPagarRequest,
  SyncResponse,
  SetorCp,
} from '@pioneira/shared/schemas/contas-pagar';
import {
  TIPO_DOCUMENTO_LABEL,
  MODALIDADE_PAGAMENTO_LABEL,
  rotularCompacto,
} from '@pioneira/shared/enums/globus-codigos';
import { ORIGEM_DOCUMENTO_CP_LABELS, CONTA_PAGAR_STATUS_DESCRICOES, type ContaPagarStatus } from '@pioneira/shared/enums/conta-pagar-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SyncBadge } from '@/components/shared/SyncBadge';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';
import { api, extrairMensagemErro } from '@/lib/api';
import type { SyncResultLike } from '@/hooks/useDataOrSync';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { SumarioCards, type CardFiltroId } from './_components/SumarioCards';
import { DetalheCpDialog, SetorPill } from './_components/DetalheCpDialog';
import { FiltrosCp, type FiltrosCpValues } from './_components/FiltrosCp';

function inicioDoMes(): string {
  const hoje = new Date();
  return format(new Date(hoje.getFullYear(), hoje.getMonth(), 1), 'yyyy-MM-dd');
}
function inicioProximoMes(): string {
  const hoje = new Date();
  return format(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1), 'yyyy-MM-dd');
}

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function brlToCents(brl: string): number | undefined {
  if (!brl.trim()) return undefined;
  const n = Number.parseFloat(brl.replace(',', '.'));
  if (Number.isNaN(n)) return undefined;
  return Math.round(n * 100);
}

/**
 * Formata data ISO (YYYY-MM-DD) com seguranca. Input nativo type="date" emite
 * "" enquanto a data esta incompleta — sem esse guard, `format(new Date(""))`
 * lanca "Invalid time value" e derruba a pagina inteira.
 */
function fmtDataSegura(iso: string, fallback = '—'): string {
  if (!iso) return fallback;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? fallback : format(d, 'dd/MM/yyyy');
}

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'muted' }> = {
  pendente: { label: 'Pendente', variant: 'warning' },
  em_aprovacao: { label: 'Em aprov.', variant: 'warning' },
  aprovado: { label: 'Aprovado', variant: 'default' },
  pago: { label: 'Pago', variant: 'success' },
  cancelado: { label: 'Cancelado', variant: 'danger' },
};

const FILTROS_PADRAO: FiltrosCpValues = {
  dtIni: inicioDoMes(),
  dtFim: inicioProximoMes(),
  dtPagIni: '',
  dtPagFim: '',
  search: '',
  status: [],
  origem: [],
  setores: [],
  valorMinBrl: '',
  valorMaxBrl: '',
  somenteVencidos: false,
};

const ORIGEM_BADGE_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'muted'> = {
  folha: 'default',
  nf: 'muted',
  guia: 'warning',
  manual: 'muted',
  desconhecido: 'muted',
};

function detectarCardAtivo(f: FiltrosCpValues): CardFiltroId {
  if (f.somenteVencidos) return 'vencidos';
  // pago: status contém somente 'pago'
  if (f.status.length === 1 && f.status[0] === 'pago') return 'pago';
  // cancelado: status contém somente 'cancelado'
  if (f.status.length === 1 && f.status[0] === 'cancelado') return 'cancelado';

  const hoje = new Date();
  const hojeIso = hoje.toISOString().slice(0, 10);
  const em7 = new Date(hoje);
  em7.setDate(em7.getDate() + 7);
  const em7Iso = em7.toISOString().slice(0, 10);
  const em8 = new Date(hoje);
  em8.setDate(em8.getDate() + 8);
  const em8Iso = em8.toISOString().slice(0, 10);

  // proximos7: dtIni=hoje E dtFim=hoje+7
  if (f.dtIni === hojeIso && f.dtFim === em7Iso) return 'proximos7';

  // vencer_mais_7: dtIni=hoje+8 (sinal único; dtFim mantém período base do user)
  if (f.dtIni === em8Iso) return 'vencer_mais_7';

  return 'todos';
}

function aplicarCardFiltro(id: CardFiltroId, base: FiltrosCpValues): FiltrosCpValues {
  const padraoBase = { ...FILTROS_PADRAO, dtIni: base.dtIni, dtFim: base.dtFim };
  switch (id) {
    case 'todos':
      return padraoBase;
    case 'pago':
      return { ...padraoBase, status: ['pago'] };
    case 'proximos7': {
      const hoje = new Date();
      const em7 = new Date(hoje);
      em7.setDate(em7.getDate() + 7);
      return {
        ...padraoBase,
        dtIni: hoje.toISOString().slice(0, 10),
        dtFim: em7.toISOString().slice(0, 10),
        status: ['pendente', 'em_aprovacao', 'aprovado'],
      };
    }
    case 'vencer_mais_7': {
      const em8 = new Date();
      em8.setDate(em8.getDate() + 8);
      return {
        ...padraoBase,
        dtIni: em8.toISOString().slice(0, 10),
        dtFim: base.dtFim,
        status: ['pendente', 'em_aprovacao', 'aprovado'],
      };
    }
    case 'vencidos':
      return { ...padraoBase, somenteVencidos: true };
    case 'cancelado':
      return { ...padraoBase, status: ['cancelado'] };
  }
}

export default function ContasPagarPage() {
  // Filtros: estado unico, controlado pelo formulario.
  // `ativo` controla se a API ja foi chamada pela primeira vez (apos primeiro Aplicar).
  // Apos ativacao, qualquer mudanca de filtro re-aplica automaticamente (com
  // debounce no campo de busca para nao floodar requests).
  const [filtros, setFiltros] = useState<FiltrosCpValues>(FILTROS_PADRAO);
  // periodoBase = snapshot do dtIni/dtFim definido pelo header (botão Aplicar).
  // Os cards filtram a TABELA mexendo em filtros.dtIni/dtFim, mas o SUMÁRIO
  // continua calculado contra o periodoBase — assim os 4 cards somam o total
  // independentemente de qual card está ativo.
  const [periodoBase, setPeriodoBase] = useState<{ dtIni: string; dtFim: string }>({
    dtIni: FILTROS_PADRAO.dtIni,
    dtFim: FILTROS_PADRAO.dtFim,
  });
  const [ativo, setAtivo] = useState(false);
  const [page, setPage] = useState(1);
  const [detalhe, setDetalhe] = useState<ContaPagarResponse | null>(null);
  const qc = useQueryClient();

  // Debounce na busca livre para nao disparar request a cada keypress.
  const searchDebounced = useDebouncedValue(filtros.search, 400);

  const cardAtivo = useMemo(() => (ativo ? detectarCardAtivo(filtros) : 'todos'), [ativo, filtros]);

  // Sempre que algum filtro relevante muda, volta para pagina 1.
  useEffect(() => {
    if (ativo) setPage(1);
  }, [filtros.dtIni, filtros.dtFim, filtros.dtPagIni, filtros.dtPagFim, searchDebounced, filtros.status, filtros.origem, filtros.setores, filtros.valorMinBrl, filtros.valorMaxBrl, filtros.somenteVencidos, ativo]);

  const apiParams = useMemo(() => {
    if (!ativo) return null;
    return {
      dtIni: filtros.dtIni,
      dtFim: filtros.dtFim,
      dtPagIni: filtros.dtPagIni || undefined,
      dtPagFim: filtros.dtPagFim || undefined,
      search: searchDebounced.trim() || undefined,
      status: filtros.status.length > 0 ? filtros.status.join(',') : undefined,
      origem: filtros.origem.length > 0 ? filtros.origem.join(',') : undefined,
      setores: filtros.setores.length > 0 ? filtros.setores.join(',') : undefined,
      valorMinCents: brlToCents(filtros.valorMinBrl),
      valorMaxCents: brlToCents(filtros.valorMaxBrl),
      somenteVencidos: filtros.somenteVencidos || undefined,
      page,
      limit: 50,
    };
  }, [ativo, filtros, searchDebounced, page]);

  const listaQuery = useQuery<ContaPagarListResponse>({
    queryKey: ['contas-pagar', 'lista', apiParams],
    queryFn: async () => {
      const res = await api.get<ContaPagarListResponse>('/api/contas-pagar', { params: apiParams });
      return res.data;
    },
    enabled: apiParams !== null,
  });

  const sumarioQuery = useQuery<SumarioContasPagarResponse>({
    queryKey: ['contas-pagar', 'sumario', ativo ? periodoBase : null],
    queryFn: async () => {
      const res = await api.get<SumarioContasPagarResponse>('/api/contas-pagar/sumario', {
        params: { dtIni: periodoBase.dtIni, dtFim: periodoBase.dtFim },
      });
      return res.data;
    },
    enabled: ativo,
  });

  const syncStatus = useQuery({
    queryKey: ['contas-pagar', 'sync-status'],
    queryFn: async () => {
      const res = await api.get<ContaPagarListResponse['syncInfo']>('/api/contas-pagar/sync-status');
      return res.data;
    },
  });

  // Setores disponiveis no banco local — usado pra popular o filtro.
  // Atualiza junto com a lista (invalidacao em ['contas-pagar']).
  const setoresQuery = useQuery<SetorCp[]>({
    queryKey: ['contas-pagar', 'setores'],
    queryFn: async () => {
      const res = await api.get<SetorCp[]>('/api/contas-pagar/setores');
      return res.data;
    },
  });

  const sync = useMutation<SyncResultLike, unknown, SyncContasPagarRequest>({
    mutationFn: async (payload) => {
      const res = await api.post<SyncResponse>('/api/contas-pagar/sync', payload);
      return res.data;
    },
    onSuccess: (result) => {
      const tempo = result.duracaoMs < 1000 ? `${result.duracaoMs}ms` : `${(result.duracaoMs / 1000).toFixed(1)}s`;
      const desc = `${result.registrosGravados.toLocaleString('pt-BR')} de ${result.registrosLidos.toLocaleString('pt-BR')} gravados em ${tempo}`;
      if (result.status === 'ok') toast.success('Contas a Pagar sincronizadas do Globus', { description: desc });
      else if (result.status === 'parcial') toast.warning('Sincronizacao parcial', { description: desc });
      else toast.error('Falha na sincronizacao', { description: result.mensagem ?? desc });
      void qc.invalidateQueries({ queryKey: ['contas-pagar'] });
    },
    onError: (err) => toast.error('Falha ao sincronizar', { description: extrairMensagemErro(err) }),
  });

  const dispararSync = (): void => {
    sync.mutate({ dtIni: filtros.dtIni, dtFim: filtros.dtFim });
    setPeriodoBase({ dtIni: filtros.dtIni, dtFim: filtros.dtFim });
    setPage(1);
    setAtivo(true);
  };

  const aplicar = (): void => {
    // Aplicar fixa o período base — os cards do sumário sempre rodam contra ele.
    setPeriodoBase({ dtIni: filtros.dtIni, dtFim: filtros.dtFim });
    setPage(1);
    setAtivo(true);
  };

  const linhas = listaQuery.data?.data ?? [];
  const pagination = listaQuery.data?.pagination;
  const syncInfo = listaQuery.data?.syncInfo ?? syncStatus.data ?? null;

  const periodoLabel = `${fmtDataSegura(filtros.dtIni)} a ${fmtDataSegura(filtros.dtFim)}`;

  return (
    <div className="space-y-4 sm:space-y-6">
      <ModuleStatusBanner href="/contas-pagar" />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent">
            Contas a Pagar
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Escolha um periodo e clique em <strong>Aplicar</strong> para carregar do banco local, ou <strong>Sincronizar</strong> para puxar do Globus.
          </p>
        </div>
        {syncInfo && ativo && linhas.length > 0 && (
          <SyncBadge
            ultimoSyncEm={syncInfo.ultimoSyncEm}
            status={syncInfo.ultimoSyncStatus}
            totalLocal={syncInfo.totalLocal}
            onSync={dispararSync}
            sincronizando={sync.isPending}
          />
        )}
      </div>

      {/* Atalho para a conferencia de retencoes (analise read-only sobre o espelho do Globus). */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/contas-pagar/divergencias"
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-md border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900/40"
        >
          <Receipt className="h-4 w-4" />
          Divergências de Retenção
        </Link>
      </div>

      <FiltrosCp
        valores={filtros}
        onChange={(novos) => setFiltros(novos)}
        onLimpar={() => setFiltros(FILTROS_PADRAO)}
        setoresDisponiveis={setoresQuery.data ?? []}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" onClick={aplicar} disabled={listaQuery.isFetching && !ativo} className="flex-1 sm:flex-none">
          {listaQuery.isFetching && ativo ? (
            <>
              <SearchIcon className="h-4 w-4 animate-pulse" />
              Atualizando...
            </>
          ) : (
            <>
              <Filter className="h-4 w-4" />
              {ativo ? 'Recarregar dados' : 'Aplicar filtros / Carregar dados'}
            </>
          )}
        </Button>
        <Button size="lg" variant="outline" onClick={dispararSync} disabled={sync.isPending} className="flex-1 sm:flex-none">
          <RefreshCw className={sync.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          {sync.isPending ? 'Sincronizando...' : 'Sincronizar do Globus'}
        </Button>
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
          Periodo selecionado: <strong>{periodoLabel}</strong>
        </span>
      </div>

      {!ativo && (
        <Card className="p-10 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center shadow-lg mb-4">
            <SearchIcon className="h-8 w-8 text-pioneira-900 dark:text-gray-900" />
          </div>
          <h2 className="text-lg font-semibold text-pioneira-900 dark:text-yellow-200 mb-1">Selecione um periodo</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Defina o intervalo de vencimento e clique em <strong>Aplicar</strong>. Voce tambem pode sincronizar do Globus
            para garantir que os dados estao atualizados antes de consultar.
          </p>
          {syncInfo && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
              {syncInfo.totalLocal.toLocaleString('pt-BR')} titulos atualmente no banco local.
              {syncInfo.ultimoSyncEm && ` Ultimo sync: ${format(new Date(syncInfo.ultimoSyncEm), 'dd/MM/yyyy HH:mm')}.`}
            </p>
          )}
        </Card>
      )}

      {ativo && sumarioQuery.data && (
        <SumarioCards
          sumario={sumarioQuery.data}
          carregando={sumarioQuery.isLoading}
          filtroAtivo={cardAtivo}
          periodoBase={periodoBase}
          onClickCard={(id) => {
            // base usada pelo aplicarCardFiltro = periodoBase (não filtros atuais),
            // pra que clicar um card e depois outro não acumule restrições residuais.
            const baseFiltros = { ...FILTROS_PADRAO, dtIni: periodoBase.dtIni, dtFim: periodoBase.dtFim };
            const novos = id === cardAtivo ? baseFiltros : aplicarCardFiltro(id, baseFiltros);
            setFiltros(novos);
          }}
        />
      )}

      {/* Totais do RESULTADO filtrado (todas as paginas), incluindo o filtro de
          data de pagamento — diferente dos cards de aging, que rodam sobre o
          periodo-base de vencimento. Responde "quanto foi pago no filtro". */}
      {ativo && listaQuery.data?.totais && (
        <Card className="p-4 flex flex-wrap items-center gap-x-8 gap-y-3 justify-between">
          <div className="min-w-[120px]">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Resultado do filtro</span>
            <p className="text-sm font-semibold">
              {listaQuery.data.totais.quantidade.toLocaleString('pt-BR')} {listaQuery.data.totais.quantidade === 1 ? 'titulo' : 'titulos'}
              {(filtros.dtPagIni || filtros.dtPagFim) && (
                <span className="ml-1 text-[11px] font-normal text-gray-500 dark:text-gray-400">
                  · pagto {fmtDataSegura(filtros.dtPagIni)}–{fmtDataSegura(filtros.dtPagFim)}
                </span>
              )}
            </p>
          </div>
          <div className="min-w-[120px]">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Total a pagar</span>
            <p className="font-mono font-semibold">{moeda(listaQuery.data.totais.valorAPagarCents)}</p>
          </div>
          <div className="min-w-[120px]">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Total pago</span>
            <p className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
              {moeda(listaQuery.data.totais.pagoCents)}
              <span className="ml-1 text-[11px] font-normal text-gray-500 dark:text-gray-400">
                ({listaQuery.data.totais.pagoQuantidade.toLocaleString('pt-BR')})
              </span>
            </p>
          </div>
        </Card>
      )}

      {ativo && listaQuery.isLoading && (
        <Card className="p-12 text-center text-gray-500 dark:text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-transparent border-t-[#e6cd4a] dark:border-t-yellow-400 mx-auto mb-3" />
          Carregando contas a pagar do banco local...
        </Card>
      )}

      {ativo && !listaQuery.isLoading && linhas.length === 0 && (
        <Card className="p-10 text-center text-gray-500 dark:text-gray-400">
          <p className="font-medium">Nenhum titulo encontrado com os filtros aplicados.</p>
          <p className="text-xs mt-1">
            {syncInfo?.totalLocal === 0
              ? 'Banco local vazio - clique em "Sincronizar do Globus".'
              : 'Tente ampliar o periodo, limpar filtros ou sincronizar do Globus.'}
          </p>
        </Card>
      )}

      {ativo && linhas.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor / Documento</TableHead>
                <TableHead className="hidden md:table-cell">Tipo</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor a pagar</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Retencoes</TableHead>
                <TableHead className="hidden lg:table-cell">Status</TableHead>
                <TableHead className="hidden xl:table-cell">Modalidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((cp) => {
                const statusCfg = STATUS_LABEL[cp.status] ?? { label: cp.status, variant: 'muted' as const };
                const statusDescricao = CONTA_PAGAR_STATUS_DESCRICOES[cp.status as ContaPagarStatus] ?? '';
                const vencido =
                  !cp.quitado &&
                  !cp.dataPagamento &&
                  cp.status !== 'cancelado' &&
                  cp.status !== 'pago' &&
                  new Date(cp.dataVencimento) < new Date();
                return (
                  <TableRow key={cp.id} className="cursor-pointer" onClick={() => setDetalhe(cp)}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-0.5">
                        <span className="truncate max-w-[260px]">{cp.fornecedor?.razaoSocial ?? '-'}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-normal truncate">
                          {rotularCompacto(TIPO_DOCUMENTO_LABEL, cp.tipoDocumento) || 'DOC'} {cp.numeroDocumento ?? '-'}
                          {cp.serieDocumento && `/${cp.serieDocumento}`}
                          {cp.numeroParcela !== null && ` · p${cp.numeroParcela}`}
                          {cp.fornecedor?.cnpjCpf && ` · ${cp.fornecedor.cnpjCpf}`}
                        </span>
                        {cp.setorNome && (
                          <span className="mt-1">
                            <SetorPill nome={cp.setorNome} codigo={cp.codSetor} rateado={cp.setorRateado} />
                          </span>
                        )}
                        <div className="flex gap-1 mt-1 lg:hidden">
                          <Badge variant={statusCfg.variant} className="text-[10px]" title={statusDescricao}>{statusCfg.label}</Badge>
                          {vencido && <Badge variant="danger" className="text-[10px]" title="Vencimento ultrapassou hoje e a conta ainda nao foi paga.">VENCIDO</Badge>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs">
                      <div className="flex flex-col gap-1">
                        <span className="text-gray-600 dark:text-gray-300">{rotularCompacto(TIPO_DOCUMENTO_LABEL, cp.tipoDocumento)}</span>
                        <Badge variant={ORIGEM_BADGE_VARIANT[cp.origemDocumento] ?? 'muted'} className="text-[10px] w-fit">
                          {ORIGEM_DOCUMENTO_CP_LABELS[cp.origemDocumento] ?? cp.origemDocumento}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div className="flex flex-col">
                        <span className={vencido ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
                          {format(new Date(`${cp.dataVencimento}T00:00:00`), 'dd/MM/yyyy')}
                        </span>
                        {cp.dataPagamento && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                            pago em {format(new Date(`${cp.dataPagamento}T00:00:00`), 'dd/MM')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <div className="flex flex-col">
                        <span className="font-semibold">{moeda(cp.valorAPagarCents)}</span>
                        {cp.retencoes.totalCents > 0 && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 font-normal">
                            bruto {moeda(cp.valorLiquidoCents)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-right text-sm">
                      {cp.retencoes.totalCents > 0 ? (
                        <span className="font-mono text-red-600 dark:text-red-400">- {moeda(cp.retencoes.totalCents)}</span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-col gap-1">
                        <Badge variant={statusCfg.variant} title={statusDescricao}>{statusCfg.label}</Badge>
                        {vencido && <Badge variant="danger" className="text-[10px]" title="Vencimento ultrapassou hoje e a conta ainda nao foi paga.">VENCIDO</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-xs text-gray-600 dark:text-gray-300">
                      {rotularCompacto(MODALIDADE_PAGAMENTO_LABEL, cp.modalidadePagamento)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-gray-600 dark:text-gray-400">
              <span className="text-xs sm:text-sm">
                Pag. {pagination.page}/{pagination.totalPages} - {pagination.total} {pagination.total === 1 ? 'titulo' : 'titulos'}
              </span>
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.totalPages}>
                  Proxima
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <DetalheCpDialog cp={detalhe} onClose={() => setDetalhe(null)} />
    </div>
  );
}
