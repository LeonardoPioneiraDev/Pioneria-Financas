'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import Link from 'next/link';
import { Filter, RefreshCw, Search as SearchIcon, Receipt, AlertTriangle, Download, ChevronDown, ChevronRight } from 'lucide-react';
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
import { usePodeSincronizar } from '@/hooks/usePodeSincronizar';
import { SumarioCards, type CardFiltroId } from './_components/SumarioCards';
import { AnalisePrazoPanel, type AnalisePrazoParams } from './_components/AnalisePrazoPanel';
import { DetalheCpDialog, SetorPill } from './_components/DetalheCpDialog';
import { MovimentoBancoDialog } from './_components/MovimentoBancoDialog';
import { FiltrosCp, type FiltrosCpValues } from './_components/FiltrosCp';
import { ConferenciaGlobus } from './_components/ConferenciaGlobus';

function inicioDoMes(): string {
  const hoje = new Date();
  return format(new Date(hoje.getFullYear(), hoje.getMonth(), 1), 'yyyy-MM-dd');
}
/**
 * Último dia do mês corrente (INCLUSIVO) — o backend trata "Vencimento até"
 * sempre como a última data que deve entrar no filtro (soma +1 dia internamente
 * antes do WHERE semi-aberto; ver `expandirSeMesmaData`). Usar o 1º dia do
 * próximo mês aqui faria o período padrão vazar um dia pro mês seguinte.
 */
function ultimoDiaDoMes(): string {
  const hoje = new Date();
  return format(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0), 'yyyy-MM-dd');
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
 * Formata data ISO (YYYY-MM-DD) com segurança. Input nativo type="date" emite
 * "" enquanto a data está incompleta — sem esse guard, `format(new Date(""))`
 * lança "Invalid time value" e derruba a página inteira.
 */
function fmtDataSegura(iso: string, fallback = '—'): string {
  if (!iso) return fallback;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? fallback : format(d, 'dd/MM/yyyy');
}

/** Dias inteiros entre duas datas ISO (YYYY-MM-DD): bIso − aIso. Negativo se bIso < aIso. */
function diasEntreIso(aIso: string, bIso: string): number | null {
  if (!aIso || !bIso) return null;
  const a = new Date(`${aIso}T00:00:00`);
  const b = new Date(`${bIso}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Data de hoje em ISO local (YYYY-MM-DD) — pra contar dias de atraso. */
function hojeIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
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
  dtFim: ultimoDiaDoMes(),
  dtPagIni: '',
  dtPagFim: '',
  search: '',
  status: [],
  origem: [],
  setores: [],
  valorMinBrl: '',
  valorMaxBrl: '',
  remessa: '',
  somenteVencidos: false,
  substituido: 'todos',
  prazoFaixa: '',
  prazoLongoVencido: false,
};

const PRAZO_FAIXA_LABEL: Record<string, string> = {
  ate30: 'prazo até 30 dias',
  de31a60: 'prazo de 31 a 60 dias',
  de61a90: 'prazo de 61 a 90 dias',
  mais90: 'prazo acima de 90 dias',
  semData: 'sem data de emissão',
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
  // Sincronizar com o Globus é ação de administrador.
  const podeSincronizar = usePodeSincronizar();
  // Filtros: estado único, controlado pelo formulário.
  // `ativo` controla se a API já foi chamada pela primeira vez (após primeiro Aplicar).
  // Após ativação, qualquer mudança de filtro re-aplica automaticamente (com
  // debounce no campo de busca para não floodar requests).
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
  const [movimentoModalAberto, setMovimentoModalAberto] = useState(false);
  // Bloco "No filtro" recolhido por padrão — só mostra o detalhe se clicar.
  const [noFiltroAberto, setNoFiltroAberto] = useState(false);
  const qc = useQueryClient();

  // Debounce na busca livre para não disparar request a cada keypress.
  const searchDebounced = useDebouncedValue(filtros.search, 400);

  const cardAtivo = useMemo(() => (ativo ? detectarCardAtivo(filtros) : 'todos'), [ativo, filtros]);

  // Sempre que algum filtro relevante muda, volta para página 1.
  useEffect(() => {
    if (ativo) setPage(1);
  }, [filtros.dtIni, filtros.dtFim, filtros.dtPagIni, filtros.dtPagFim, searchDebounced, filtros.status, filtros.origem, filtros.setores, filtros.valorMinBrl, filtros.valorMaxBrl, filtros.remessa, filtros.somenteVencidos, filtros.substituido, filtros.prazoFaixa, filtros.prazoLongoVencido, ativo]);

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
      remessa: filtros.remessa.trim() || undefined,
      somenteVencidos: filtros.somenteVencidos || undefined,
      substituido: filtros.substituido !== 'todos' ? filtros.substituido : undefined,
      prazoFaixa: filtros.prazoFaixa || undefined,
      prazoLongoVencido: filtros.prazoLongoVencido || undefined,
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

  // Escopo do sumário (cards de cima):
  //  - SEM filtro de pagamento: roda contra o periodoBase (vencimento) e os 5
  //    cards de aging particionam o total (comportamento padrão).
  //  - COM filtro de pagamento: reflete o MESMO escopo da listagem (só o que foi
  //    pago no período + demais filtros do formulário), pra os cards mostrarem
  //    "apenas deste filtro/data". Aging-card e filtro de pagamento são mutuamente
  //    exclusivos (clicar num card limpa o filtro de pagamento).
  const filtraPagamento = !!(filtros.dtPagIni || filtros.dtPagFim);
  // Filtro que estreita por ATRIBUTO do CP (setor, busca, status, valor, origem,
  // vencidos). Quando ativo, os números vindos do banco (Perna B / "Saiu da conta")
  // não fazem sentido — são caixa bruto, sem setor/fornecedor — então os escondemos
  // e o "Total pago" passa a refletir só a lista filtrada (puro CP).
  const temFiltroCp = !!(
    searchDebounced.trim() ||
    filtros.status.length ||
    filtros.setores.length ||
    filtros.origem.length ||
    filtros.valorMinBrl ||
    filtros.valorMaxBrl ||
    filtros.remessa.trim() ||
    filtros.somenteVencidos
  );

  const sumarioParams = useMemo(() => {
    if (!ativo) return null;
    if (!filtraPagamento) {
      return { dtIni: periodoBase.dtIni, dtFim: periodoBase.dtFim };
    }
    return {
      dtIni: periodoBase.dtIni,
      dtFim: periodoBase.dtFim,
      dtPagIni: filtros.dtPagIni || undefined,
      dtPagFim: filtros.dtPagFim || undefined,
      search: searchDebounced.trim() || undefined,
      status: filtros.status.length > 0 ? filtros.status.join(',') : undefined,
      origem: filtros.origem.length > 0 ? filtros.origem.join(',') : undefined,
      setores: filtros.setores.length > 0 ? filtros.setores.join(',') : undefined,
      valorMinCents: brlToCents(filtros.valorMinBrl),
      valorMaxCents: brlToCents(filtros.valorMaxBrl),
    };
  }, [ativo, filtraPagamento, periodoBase, filtros.dtPagIni, filtros.dtPagFim, searchDebounced, filtros.status, filtros.origem, filtros.setores, filtros.valorMinBrl, filtros.valorMaxBrl]);

  // Escopo da análise de prazo: SEMPRE por vencimento (periodoBase) + filtros de
  // atributo do CP (setor, status, origem, busca, valor). Ignora o filtro de
  // pagamento — prazo se mede por emissão/vencimento, não por quando pagou.
  const analiseParams = useMemo<AnalisePrazoParams | null>(() => {
    if (!ativo) return null;
    return {
      dtIni: periodoBase.dtIni,
      dtFim: periodoBase.dtFim,
      search: searchDebounced.trim() || undefined,
      status: filtros.status.length > 0 ? filtros.status.join(',') : undefined,
      origem: filtros.origem.length > 0 ? filtros.origem.join(',') : undefined,
      setores: filtros.setores.length > 0 ? filtros.setores.join(',') : undefined,
      valorMinCents: brlToCents(filtros.valorMinBrl),
      valorMaxCents: brlToCents(filtros.valorMaxBrl),
    };
  }, [ativo, periodoBase, searchDebounced, filtros.status, filtros.origem, filtros.setores, filtros.valorMinBrl, filtros.valorMaxBrl]);

  const sumarioQuery = useQuery<SumarioContasPagarResponse>({
    queryKey: ['contas-pagar', 'sumario', sumarioParams],
    queryFn: async () => {
      const res = await api.get<SumarioContasPagarResponse>('/api/contas-pagar/sumario', { params: sumarioParams });
      return res.data;
    },
    enabled: ativo && sumarioParams !== null,
  });

  const syncStatus = useQuery({
    queryKey: ['contas-pagar', 'sync-status'],
    queryFn: async () => {
      const res = await api.get<ContaPagarListResponse['syncInfo']>('/api/contas-pagar/sync-status');
      return res.data;
    },
  });

  // Setores disponíveis no banco local — usado pra popular o filtro.
  // Atualiza junto com a lista (invalidação em ['contas-pagar']).
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

  // Reconcilia os títulos EM ABERTO por chave — pega prorrogação/cancelamento
  // que saiu da janela de vencimento e ficou congelado na cópia local.
  const reconciliar = useMutation({
    mutationFn: async () =>
      (await api.post<{ verificados: number; atualizados: number; sumiram: number; sucessoresBuscados: number }>('/api/contas-pagar/reconciliar')).data,
    onSuccess: (r) => {
      toast.success('Títulos em aberto reconciliados com o Globus', {
        description: `${r.atualizados} atualizado(s) de ${r.verificados} verificado(s)`
          + `${r.sucessoresBuscados > 0 ? ` · ${r.sucessoresBuscados} sucessor(es) de substituído(s) buscado(s)` : ''}`
          + `${r.sumiram > 0 ? ` · ${r.sumiram} sumiram do Globus` : ''}.`,
      });
      void qc.invalidateQueries({ queryKey: ['contas-pagar'] });
    },
    onError: (err) => toast.error('Falha ao reconciliar', { description: extrairMensagemErro(err) }),
  });

  // Sincroniza puxando do Globus por DATA DE PAGAMENTO (modo='pagamento'), pra
  // que "o que foi pago no período" venha completo independente do vencimento.
  // O sync não mexe no periodoBase (que governa os cards de aging por vencimento).
  const dispararSyncPagamento = (): void => {
    const ini = filtros.dtPagIni || filtros.dtPagFim;
    const fimIncl = filtros.dtPagFim || filtros.dtPagIni;
    if (!ini || !fimIncl) {
      toast.error('Informe a data de pagamento (de e até) para sincronizar por pagamento.');
      return;
    }
    // dtFim vai INCLUSIVO (fimIncl) — o backend soma +1 dia internamente
    // (expandirSeMesmaData) antes do WHERE semi-aberto. Não converter aqui.
    sync.mutate({ dtIni: ini, dtFim: fimIncl, modo: 'pagamento' });
    setPage(1);
    setAtivo(true);
  };

  const aplicar = (): void => {
    // Aplicar fixa o período base — os cards do sumário sempre rodam contra ele.
    setPeriodoBase({ dtIni: filtros.dtIni, dtFim: filtros.dtFim });
    setPage(1);
    setAtivo(true);
  };

  const [exportando, setExportando] = useState(false);
  // Exporta a listagem FILTRADA (sem paginacao) pra .xlsx formatado. Usa os mesmos
  // filtros do apiParams, menos page/limit. Download via blob.
  const exportarExcel = async (): Promise<void> => {
    if (!ativo) return;
    setExportando(true);
    try {
      const params = {
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
        remessa: filtros.remessa.trim() || undefined,
        somenteVencidos: filtros.somenteVencidos || undefined,
        substituido: filtros.substituido !== 'todos' ? filtros.substituido : undefined,
        prazoFaixa: filtros.prazoFaixa || undefined,
        prazoLongoVencido: filtros.prazoLongoVencido || undefined,
      };
      const res = await api.get('/api/contas-pagar/export', { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `contas-pagar-${filtros.dtIni}_a_${filtros.dtFim}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error('Falha ao exportar', { description: extrairMensagemErro(err) });
    } finally {
      setExportando(false);
    }
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
            Escolha um período e clique em <strong>Aplicar</strong> para carregar do banco local
            {podeSincronizar ? <>, ou <strong>Sincronizar</strong> para puxar do Globus.</> : '.'}
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

      {/* Atalho para a conferência de retenções (análise read-only sobre o espelho do Globus). */}
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
        {podeSincronizar && (
          <Button size="lg" variant="outline" onClick={dispararSync} disabled={sync.isPending} className="flex-1 sm:flex-none">
            <RefreshCw className={sync.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            {sync.isPending ? 'Sincronizando...' : 'Sincronizar do Globus'}
          </Button>
        )}
        {podeSincronizar && (
          <Button
            size="lg"
            variant="outline"
            onClick={() => reconciliar.mutate()}
            disabled={reconciliar.isPending}
            className="flex-1 sm:flex-none"
            title="Reconsulta os títulos em aberto por chave no Globus — pega vencimento prorrogado, cancelamento ou pagamento que saiu da janela."
          >
            <RefreshCw className={reconciliar.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            {reconciliar.isPending ? 'Reconciliando...' : 'Reconciliar abertos'}
          </Button>
        )}
        <Button
          size="lg"
          variant="outline"
          onClick={exportarExcel}
          disabled={!ativo || exportando || linhas.length === 0}
          className="flex-1 sm:flex-none"
        >
          <Download className={exportando ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
          {exportando ? 'Exportando...' : 'Exportar Excel'}
        </Button>
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
          Período selecionado: <strong>{periodoLabel}</strong>
        </span>
      </div>

      {!ativo && (
        <Card className="p-10 text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-gradient-to-br from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center shadow-lg mb-4">
            <SearchIcon className="h-8 w-8 text-pioneira-900 dark:text-gray-900" />
          </div>
          <h2 className="text-lg font-semibold text-pioneira-900 dark:text-yellow-200 mb-1">Selecione um período</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md mx-auto">
            Defina o intervalo de vencimento e clique em <strong>Aplicar</strong>. Você também pode sincronizar do Globus
            para garantir que os dados estão atualizados antes de consultar.
          </p>
          {syncInfo && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
              {syncInfo.totalLocal.toLocaleString('pt-BR')} títulos atualmente no banco local.
              {syncInfo.ultimoSyncEm && ` Último sync: ${format(new Date(syncInfo.ultimoSyncEm), 'dd/MM/yyyy HH:mm')}.`}
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
          tituloTotalOverride={filtraPagamento ? 'Total pago no filtro' : undefined}
          periodoTextoOverride={
            filtraPagamento ? `Pago ${fmtDataSegura(filtros.dtPagIni)}–${fmtDataSegura(filtros.dtPagFim)}` : undefined
          }
          // "Saiu da conta" + diferença (investimento/devolução) ao lado do "Total pago",
          // só no modo pagamento. null quando a lista ainda não carregou.
          movimentoDiaCents={filtraPagamento && !temFiltroCp ? listaQuery.data?.totais.movimentoDiaCents ?? null : null}
          movimentoFinanceiroCents={listaQuery.data?.totais.movimentoFinanceiroCents}
          movimentoDevolucaoCents={listaQuery.data?.totais.movimentoDevolucaoCents}
          onVerMovimento={() => setMovimentoModalAberto(true)}
          onClickCard={(id) => {
            // base usada pelo aplicarCardFiltro = periodoBase (não filtros atuais),
            // pra que clicar um card e depois outro não acumule restrições residuais.
            const baseFiltros = { ...FILTROS_PADRAO, dtIni: periodoBase.dtIni, dtFim: periodoBase.dtFim };
            const novos = id === cardAtivo ? baseFiltros : aplicarCardFiltro(id, baseFiltros);
            setFiltros(novos);
          }}
        />
      )}

      {/* Análise de prazo: incluídos por mês, prazo > 30 dias, vencidos não pagos.
          Roda por VENCIMENTO (periodoBase) + filtros de atributo. Clicar numa faixa
          ou no alerta filtra a LISTA abaixo (drill-down) — toggle liga/desliga. */}
      <AnalisePrazoPanel
        params={analiseParams}
        ativo={ativo}
        prazoFaixaAtiva={filtros.prazoFaixa}
        prazoLongoVencidoAtivo={filtros.prazoLongoVencido}
        onSelecionarFaixa={(faixa) =>
          setFiltros((f) => ({
            ...f,
            prazoFaixa: f.prazoFaixa === faixa ? '' : faixa,
            prazoLongoVencido: false,
          }))
        }
        onSelecionarAlerta={() =>
          setFiltros((f) => ({
            ...f,
            prazoLongoVencido: !f.prazoLongoVencido,
            prazoFaixa: '',
          }))
        }
      />

      {/* Aviso de base potencialmente incompleta (SFN-47). A base local é
          sincronizada por VENCIMENTO; ao filtrar por DATA DE PAGAMENTO, títulos
          pagos no período mas que vencem fora da janela sincronizada podem não
          estar no banco local. Honra o princípio "quando não tem dado, o sistema
          diz que não tem" — e oferece sincronizar por pagamento pra fechar com o Globus. */}
      {ativo && (filtros.dtPagIni || filtros.dtPagFim) && (
        <Card className="p-4 border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/40">
          <div className="flex flex-wrap items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                Filtro por data de pagamento ativo — o total pode estar incompleto
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                A base local é sincronizada por <strong>vencimento</strong>. Pagamentos de títulos que
                vencem fora do período sincronizado podem não aparecer aqui. Para conferir com o Globus,
                sincronize puxando por <strong>data de pagamento</strong>.
              </p>
            </div>
            {podeSincronizar && (
              <Button
                size="sm"
                variant="outline"
                onClick={dispararSyncPagamento}
                disabled={sync.isPending || !(filtros.dtPagIni && filtros.dtPagFim)}
                className="border-amber-400 text-amber-800 hover:bg-amber-100 dark:text-amber-200 dark:hover:bg-amber-900/40"
              >
                <RefreshCw className={sync.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
                {sync.isPending
                  ? 'Sincronizando...'
                  : filtros.dtPagIni && filtros.dtPagFim
                    ? `Sincronizar pagamentos ${fmtDataSegura(filtros.dtPagIni)}–${fmtDataSegura(filtros.dtPagFim)}`
                    : 'Preencha pagamento de/até'}
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Totais do RESULTADO filtrado (todas as páginas), incluindo o filtro de
          data de pagamento — diferente dos cards de aging, que rodam sobre o
          período-base de vencimento. Responde "quanto foi pago no filtro". */}
      {/* Contraprova independente: soma daqui x soma do Globus. Só no modo de
          vencimento — no modo pagamento o recorte é outro e não compara. */}
      {ativo && !filtraPagamento && (
        <ConferenciaGlobus dtIni={filtros.dtIni} dtFim={filtros.dtFim} />
      )}

      {ativo && listaQuery.data?.totais && (
        <Card className="p-0 overflow-hidden">
          <button
            type="button"
            onClick={() => setNoFiltroAberto((a) => !a)}
            className="w-full flex flex-wrap items-center gap-2 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
          >
            <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">No filtro</span>
            <span className="text-sm font-semibold">
              {listaQuery.data.totais.quantidade.toLocaleString('pt-BR')} {listaQuery.data.totais.quantidade === 1 ? 'conta' : 'contas'}
            </span>
            {!filtraPagamento && (
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                · {moeda(listaQuery.data.totais.valorAPagarCents)}
              </span>
            )}
            {noFiltroAberto ? <ChevronDown className="h-4 w-4 text-gray-400 ml-auto shrink-0" /> : <ChevronRight className="h-4 w-4 text-gray-400 ml-auto shrink-0" />}
          </button>

          {noFiltroAberto && (
          <div className="p-4 pt-0 flex flex-wrap items-start gap-x-8 gap-y-4 justify-between border-t border-gray-100 dark:border-gray-800">
          {/* Contexto: quantas contas e qual filtro */}
          <div className="min-w-[120px] pt-4">
            <p className="text-sm font-semibold">
              {filtraPagamento && (
                <span className="block text-[11px] font-normal text-gray-500 dark:text-gray-400">
                  pagas em {fmtDataSegura(filtros.dtPagIni)}–{fmtDataSegura(filtros.dtPagFim)}
                </span>
              )}
              {listaQuery.data.totais.substituidosQuantidade > 0 && (
                <span className="block text-[11px] font-normal text-amber-600 dark:text-amber-400">
                  {listaQuery.data.totais.substituidosQuantidade.toLocaleString('pt-BR')} substituído(s) — fora dos totais
                </span>
              )}
              {listaQuery.data.totais.substituidosPendentesQuantidade > 0 && (
                <span
                  className="block text-[11px] font-normal text-orange-600 dark:text-orange-400"
                  title="Substituído no Globus, mas o sucessor ainda não foi sincronizado. Por segurança, continuam somando até o sucessor chegar — senão a obrigação some. Clique em 'Reconciliar abertos'."
                >
                  {listaQuery.data.totais.substituidosPendentesQuantidade.toLocaleString('pt-BR')} substituído(s) com sucessor pendente — contando por segurança
                </span>
              )}
              {listaQuery.data.totais.devolvidosQuantidade > 0 && (
                <span className="block text-[11px] font-normal text-sky-600 dark:text-sky-400">
                  {listaQuery.data.totais.devolvidosQuantidade.toLocaleString('pt-BR')} devolvido(s) pelo banco — refeito(s), fora do &quot;Foi pago&quot;
                </span>
              )}
              {listaQuery.data.totais.canceladosQuantidade > 0 && (
                <span
                  className="block text-[11px] font-normal text-red-600 dark:text-red-400"
                  title="Cancelados no Globus (STATUSDOCTOCPG='C'). Continuam na lista para consulta, mas não somam — a obrigação, quando existe, foi reemitida em outro documento."
                >
                  ✕ {listaQuery.data.totais.canceladosQuantidade.toLocaleString('pt-BR')} cancelado(s)
                  {' '}({moeda(listaQuery.data.totais.canceladosCents)}) — fora dos totais
                </span>
              )}
              {/* Diferente de substituído/devolvido: o refeito CONTA nos totais.
                  O aviso existe para o número não parecer errado quando o
                  financeiro vê o cancelamento no histórico do ERP. */}
              {listaQuery.data.totais.refeitosQuantidade > 0 && (
                <span
                  className="block text-[11px] font-normal text-amber-600 dark:text-amber-400"
                  title="No Globus o pagamento foi cancelado e lançado de novo. Cada título conta UMA vez nos totais — o valor não é somado duas vezes."
                >
                  ↻ {listaQuery.data.totais.refeitosQuantidade.toLocaleString('pt-BR')} com pagamento cancelado e refeito — contam <strong>uma vez</strong> nos totais
                </span>
              )}
            </p>
          </div>

          {/* Valor das contas — escondido no modo pagamento (la vira igual a "contas do sistema") */}
          {!filtraPagamento && (
            <div className="min-w-[120px]">
              <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Valor das contas</span>
              <p className="font-mono font-semibold">{moeda(listaQuery.data.totais.valorAPagarCents)}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">soma das contas no filtro</p>
            </div>
          )}

          {/* "Foi pago" — só no modo SEM filtro de pagamento. No modo pagamento, o
              "Total pago no filtro" + "Saiu da conta" + diferença já aparecem juntos
              no header (SumarioCards), então aqui ele seria duplicata. */}
          {!filtraPagamento && (
            <div className="min-w-[200px]">
              <span className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Foi pago</span>
              <p className="font-mono font-bold text-lg text-emerald-600 dark:text-emerald-400">
                {moeda(listaQuery.data.totais.pagoCents)}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">o que você pagou de obrigações</p>
            </div>
          )}
          </div>
          )}
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
          <p className="font-medium">Nenhum título encontrado com os filtros aplicados.</p>
          <p className="text-xs mt-1">
            {syncInfo?.totalLocal === 0
              ? 'Banco local vazio - clique em "Sincronizar do Globus".'
              : 'Tente ampliar o período, limpar filtros ou sincronizar do Globus.'}
          </p>
        </Card>
      )}

      {ativo && linhas.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
            <span className="font-medium">Legenda:</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> pago (confirmado)</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> substituído — relançado, não conta</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-500" /> devolvido pelo banco — refeito, não conta</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> vencido em aberto</span>
          </div>
          {(filtros.prazoFaixa || filtros.prazoLongoVencido) && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-pioneira-300 bg-pioneira-50/70 dark:border-yellow-800 dark:bg-yellow-950/20 px-3 py-1.5 text-xs">
              <span className="font-semibold text-pioneira-800 dark:text-yellow-300">Filtrando pela análise de prazo:</span>
              <span className="text-gray-700 dark:text-gray-200">
                {filtros.prazoLongoVencido
                  ? 'prazo > 30 dias, vencido e não pago'
                  : PRAZO_FAIXA_LABEL[filtros.prazoFaixa] ?? filtros.prazoFaixa}
              </span>
              <button
                type="button"
                onClick={() => setFiltros((f) => ({ ...f, prazoFaixa: '', prazoLongoVencido: false }))}
                className="ml-auto font-semibold text-pioneira-700 dark:text-yellow-400 hover:underline"
              >
                limpar filtro de prazo
              </button>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor / Documento</TableHead>
                <TableHead className="hidden md:table-cell">Tipo</TableHead>
                <TableHead>Emissão / Vencimento / Pagamento</TableHead>
                <TableHead className="text-right">Valor (pago / a pagar)</TableHead>
                <TableHead className="hidden lg:table-cell text-right">Retencoes</TableHead>
                <TableHead className="hidden lg:table-cell">Status</TableHead>
                <TableHead className="hidden xl:table-cell">Modalidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map((cp) => {
                const statusCfg = STATUS_LABEL[cp.status] ?? { label: cp.status, variant: 'muted' as const };
                const statusDescricao = CONTA_PAGAR_STATUS_DESCRICOES[cp.status as ContaPagarStatus] ?? '';
                // Comparação por STRING de data (YYYY-MM-DD), não Date/instante: cp.dataVencimento
                // é data pura (sem hora). `new Date(cp.dataVencimento) < new Date()` parseia a
                // primeira como UTC-meia-noite e compara contra o instante atual — como o Brasil
                // é UTC-3, isso marca "VENCIDO" um título que vence HOJE (e às vezes até o dia
                // anterior, a partir das 21h) horas antes de vencer de verdade. Mesma regra do
                // card "Vencido" e do backend (`data_vencimento < CURRENT_DATE`): vencido é só o
                // que venceu ANTES de hoje.
                const vencido =
                  !cp.quitado &&
                  !cp.dataPagamento &&
                  cp.status !== 'cancelado' &&
                  cp.status !== 'pago' &&
                  cp.dataVencimento < hojeIso();
                const pago = cp.quitado || cp.status === 'pago' || !!cp.dataPagamento;
                // Boleto/pagamento eletrônico já enviado ao banco mas o Globus ainda
                // não confirmou a compensação (STATUSPE != 'PG'). Deixa isso visível
                // em vez de só "Pendente" seco — evita a leitura de "nada foi feito".
                const emTransito = !pago && cp.status !== 'cancelado' && !!cp.pagamento.numeroRemessa && cp.pagamento.statusPe !== 'PG';
                const reparc = /reparcelamento/i.test(cp.observacao ?? '');
                // Prazo do título (vencimento − emissão) e atrasos, pra destacar na coluna
                // de datas — o financeiro quer enxergar "pagou com X dias de atraso".
                const prazoDias = cp.dataEmissao ? diasEntreIso(cp.dataEmissao, cp.dataVencimento) : null;
                const diasAtraso = vencido ? diasEntreIso(cp.dataVencimento, hojeIso()) : null;
                const atrasoPagamento = cp.dataPagamento ? diasEntreIso(cp.dataVencimento, cp.dataPagamento) : null;
                const pagoComAtraso = atrasoPagamento !== null && atrasoPagamento > 0;
                return (
                  <TableRow
                    key={cp.id}
                    className={`cursor-pointer ${cp.substituido ? 'opacity-75' : ''}`}
                    onClick={() => setDetalhe(cp)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-0.5">
                        <span className="truncate max-w-[260px]">{cp.fornecedor?.razaoSocial ?? '-'}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 font-normal truncate">
                          {rotularCompacto(TIPO_DOCUMENTO_LABEL, cp.tipoDocumento) || 'DOC'} {cp.numeroDocumento ?? '-'}
                          {cp.serieDocumento && `/${cp.serieDocumento}`}
                          {cp.numeroParcela !== null && ` · p${cp.numeroParcela}`}
                          {cp.fornecedor?.cnpjCpf && ` · ${cp.fornecedor.cnpjCpf}`}
                        </span>
                        {/* Remessa enviada ao banco (lote de pagamento eletrônico) —
                            deixa claro a qual remessa o título pertence. Só pagamento
                            eletrônico tem; borderô/cheque ficam sem. */}
                        {cp.pagamento.numeroRemessa && (
                          <span
                            className="inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-900/40 mt-0.5"
                            title={`Enviado ao banco na remessa Nº ${cp.pagamento.numeroRemessa}${cp.pagamento.dataRemessa ? ` em ${format(new Date(cp.pagamento.dataRemessa), 'dd/MM/yyyy HH:mm')}` : ''}.`}
                          >
                            📤 Remessa {cp.pagamento.numeroRemessa}
                          </span>
                        )}
                        {reparc && (
                          <Badge variant="warning" className="text-[10px] w-fit mt-0.5" title="Reparcelamento — o valor original foi redistribuído entre as parcelas deste documento.">
                            Reparcelado
                          </Badge>
                        )}
                        {cp.substituido && cp.substituidoPorDoc && (
                          <span
                            className="inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-amber-500 text-white dark:bg-amber-600 mt-0.5"
                            title={`Título substituído/relançado no Globus — vale o documento ${cp.substituidoPorDoc}. Aparece para histórico, mas fica fora dos totais.`}
                          >
                            ⚠ Substituído · fora dos totais
                          </span>
                        )}
                        {cp.substituido && !cp.substituidoPorDoc && (
                          <span
                            className="inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-orange-600 text-white dark:bg-orange-700 mt-0.5"
                            title="Título substituído/relançado no Globus, mas o documento sucessor ainda não foi sincronizado. Por segurança, ESTE título continua contando nos totais até o sucessor chegar (clique em 'Reconciliar abertos')."
                          >
                            ⚠ Substituído · sucessor pendente — contando
                          </span>
                        )}
                        {cp.pagamentoDevolvido && (
                          <span
                            className="inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-sky-500 text-white dark:bg-sky-600 mt-0.5"
                            title="Pagamento aceito pelo banco mas DEVOLVIDO (não liquidou) e refeito por outro borderô. Fica fora do 'Foi pago'."
                          >
                            ↩ Devolvido · refeito
                          </span>
                        )}
                        {/* Pagamento cancelado e refeito no Globus. NÃO é dupla
                            contagem — o título entra UMA vez nos totais. O selo
                            existe porque quem abre o histórico no ERP vê o
                            cancelamento e precisa reconhecer o caso aqui. */}
                        {cp.vezesPagoGlobus > 1 && (
                          <span
                            className="mt-0.5 inline-flex w-fit items-center gap-1 rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white dark:bg-amber-600"
                            title={`No Globus este título foi pago, cancelado e pago de novo (${cp.vezesPagoGlobus} lançamentos de pagamento). Conta UMA vez nos totais — o valor não é somado duas vezes. Abra o detalhe para ver a trilha completa.`}
                          >
                            ↻ Pago {cp.vezesPagoGlobus}× · cancelado e refeito
                          </span>
                        )}
                        {cp.vezesPagoGlobus <= 1 && cp.teveCancelamentoPagamento && (
                          <span
                            className="mt-0.5 inline-flex w-fit items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-900/50 dark:text-amber-200"
                            title="Houve cancelamento de pagamento na trilha do Globus. Abra o detalhe para ver o que aconteceu."
                          >
                            ↩ Pagamento cancelado
                          </span>
                        )}
                        {cp.setorNome && (
                          <span className="mt-1">
                            <SetorPill nome={cp.setorNome} codigo={cp.codSetor} rateado={cp.setorRateado} unidades={cp.rateioSetores?.length} />
                          </span>
                        )}
                        {cp.rateioContas && cp.rateioContas.length > 0 && (() => {
                          // Tipo de despesa = natureza / conta contabil DOMINANTE do titulo
                          // (maior valor). Quando ha rateio, marca "+N". Mesmo dado do export.
                          const dom = cp.rateioContas.reduce((a, b) => (b.valorCents > a.valorCents ? b : a));
                          const extra = cp.rateioContas.length - 1;
                          const nome = dom.nome ?? dom.classificador;
                          return (
                            <span
                              className="inline-flex w-fit items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium bg-gray-100 text-gray-600 border border-gray-200 dark:bg-gray-800/50 dark:text-gray-300 dark:border-gray-700 mt-1"
                              title={`Tipo de despesa (natureza / conta contábil)${extra > 0 ? ` — dominante; +${extra} outra(s) conta(s) no título` : ''}.`}
                            >
                              🏷 {nome}{extra > 0 ? ` (+${extra})` : ''}
                            </span>
                          );
                        })()}
                        <div className="flex gap-1 mt-1 lg:hidden">
                          <Badge variant={statusCfg.variant} className="text-[10px]" title={statusDescricao}>{statusCfg.label}</Badge>
                          {vencido && <Badge variant="danger" className="text-[10px]" title="Vencimento ultrapassou hoje e a conta ainda não foi paga.">VENCIDO</Badge>}
                          {emTransito && (
                            <Badge variant="default" className="text-[10px] bg-sky-500 text-white dark:bg-sky-600" title={`Boleto/pagamento eletrônico enviado ao banco (remessa Nº ${cp.pagamento.numeroRemessa}) — aguardando confirmação de compensação no Globus.`}>
                              📤 boleto enviado
                            </Badge>
                          )}
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
                      <div className="flex flex-col gap-0.5">
                        {/* Emissão — quando o título entrou (data do documento) + prazo */}
                        {cp.dataEmissao && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            emitido {format(new Date(`${cp.dataEmissao}T00:00:00`), 'dd/MM/yyyy')}
                            {prazoDias !== null && (
                              <span
                                className={prazoDias > 30 ? 'text-amber-600 dark:text-amber-400 font-semibold' : ''}
                                title="Prazo entre a emissão e o vencimento do título."
                              >
                                {' '}· prazo {prazoDias}d
                              </span>
                            )}
                          </span>
                        )}
                        {/* Vencimento — em vermelho quando venceu em aberto */}
                        <span className={vencido ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>
                          vence {format(new Date(`${cp.dataVencimento}T00:00:00`), 'dd/MM/yyyy')}
                        </span>
                        {/* Prorrogação: mostra o de/para toda vez que a data mudou no Globus. */}
                        {cp.vencimentoAnterior && (
                          <span
                            className="inline-flex w-fit items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 dark:bg-violet-900/40 dark:text-violet-200"
                            title={`A data de vencimento foi alterada no Globus${cp.vencimentoAlteradoEm ? ` em ${format(new Date(cp.vencimentoAlteradoEm), 'dd/MM/yyyy')}` : ''}.`}
                          >
                            ↪ vencia {format(new Date(`${cp.vencimentoAnterior}T00:00:00`), 'dd/MM/yyyy')} · prorrogado
                          </span>
                        )}
                        {vencido && diasAtraso !== null && diasAtraso > 0 && (
                          <span className="text-[10px] font-semibold text-red-600 dark:text-red-400">
                            {diasAtraso} {diasAtraso === 1 ? 'dia' : 'dias'} em atraso
                          </span>
                        )}
                        {/* Pagamento — verde no prazo, vermelho quando pagou atrasado */}
                        {cp.dataPagamento && (
                          <span
                            className={`text-[10px] font-semibold ${
                              pagoComAtraso ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                            }`}
                            title={
                              pagoComAtraso
                                ? `Pago ${atrasoPagamento} dia(s) DEPOIS do vencimento.`
                                : 'Pago dentro do prazo.'
                            }
                          >
                            pago em {format(new Date(`${cp.dataPagamento}T00:00:00`), 'dd/MM/yyyy')}
                            {pagoComAtraso
                              ? ` · ${atrasoPagamento}d de atraso`
                              : atrasoPagamento !== null
                                ? ' · no prazo'
                                : ''}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      <div className="flex flex-col">
                        <span className="font-semibold">{moeda(cp.valorAPagarCents)}</span>
                        <span
                          className={`text-[10px] font-semibold ${
                            cp.pagamentoDevolvido
                              ? 'text-sky-600 dark:text-sky-400'
                              : pago
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {cp.pagamentoDevolvido ? 'devolvido · refeito' : pago ? 'pago' : 'a pagar'}
                        </span>
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
                        {vencido && <Badge variant="danger" className="text-[10px]" title="Vencimento ultrapassou hoje e a conta ainda não foi paga.">VENCIDO</Badge>}
                        {emTransito && (
                          <Badge variant="default" className="text-[10px] bg-sky-500 text-white dark:bg-sky-600" title={`Boleto/pagamento eletrônico enviado ao banco (remessa Nº ${cp.pagamento.numeroRemessa}) — aguardando confirmação de compensação no Globus.`}>
                            📤 boleto enviado
                          </Badge>
                        )}
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
                Pag. {pagination.page}/{pagination.totalPages} - {pagination.total} {pagination.total === 1 ? 'título' : 'títulos'}
              </span>
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                  Anterior
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= pagination.totalPages}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <DetalheCpDialog
        cp={detalhe}
        onClose={() => setDetalhe(null)}
        onFiltrarSetor={(codigo, nome) => {
          // Filtra pela unidade clicada (CODCUSTOFIN) e LIMPA a busca — senão, vindo
          // do detalhe de um título, a busca textual deixaria só aquele título (que
          // pertence a todas as suas unidades) e pareceria "não mudou nada". Mantém o
          // período/datas. O service acha o título em QUALQUER unidade (setores_codigos).
          setFiltros((f) => ({ ...f, setores: [codigo], search: '' }));
          setDetalhe(null);
          toast.success(`Filtrando Contas a Pagar pela unidade ${nome ?? codigo}`, {
            description: 'Mostrando os títulos desta unidade no período. Limpe o filtro de Setor para voltar.',
          });
        }}
      />
      <MovimentoBancoDialog
        aberto={movimentoModalAberto}
        onClose={() => setMovimentoModalAberto(false)}
        dtPagIni={filtros.dtPagIni || undefined}
        dtPagFim={filtros.dtPagFim || undefined}
        pagoCents={listaQuery.data?.totais.pagoCents}
        pagoSemMovimentoCents={listaQuery.data?.totais.pagoSemMovimentoCents}
      />
    </div>
  );
}
