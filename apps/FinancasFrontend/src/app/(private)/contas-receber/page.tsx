'use client';

/**
 * RECEBÍVEIS — dinheiro que ENTROU no extrato bancário (`banco_movto`, créditos),
 * classificado por origem (GDF · Clientes · Outras). Lê /api/recebiveis.
 *
 * A pedido (30/07/2026, sem uso real), as abas "Títulos a receber (clientes)"
 * (`./_components/CobrancaView`) e "A receber (reembolsos)"
 * (`./_components/ReembolsosView`) foram desativadas — só "Entradas no
 * extrato" fica visível. Os componentes e os backends (`/api/contas-receber`,
 * `/api/reembolsos`) NÃO foram removidos. Para reativar, descomente os
 * imports, o bloco de abas e os `{aba === ...}` mais abaixo.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  Banknote, Landmark, Users2, Layers, RefreshCw, DatabaseZap, Search as SearchIcon,
  ArrowUpRight, ArrowLeftRight, Info,
} from 'lucide-react';
import type {
  DetalheOrigemResponse,
  RecebiveisContasResponse,
  RecebiveisListResponse,
  RecebivelDetalheResponse,
  RecebivelItem,
  RecebivelOrigem,
  SumarioRecebiveisResponse,
  SyncExtratoResponse,
} from '@pioneira/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CompliancePill } from '@/components/audit/CompliancePill';
import { useAuditView, useTrackPrint } from '@/hooks/useAudit';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatarData, formatarDataHoraCurto } from '@/lib/datetime';
import { nomeBanco } from '@/lib/bancos';
import { api, extrairMensagemErro } from '@/lib/api';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';
import { usePodeSincronizar } from '@/hooks/usePodeSincronizar';
// Abas "Títulos a receber" e "A receber (reembolsos)" desativadas (sem uso) — ver comentário no topo do arquivo.
// import { ReembolsosView } from './_components/ReembolsosView';
// import { CobrancaView } from './_components/CobrancaView';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function moedaCompacta(cents: number): string {
  const v = cents / 100;
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} M`;
  if (Math.abs(v) >= 1_000) return `R$ ${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} K`;
  return moeda(cents);
}
function primeiroDiaMes(): string {
  const h = new Date();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-01`;
}
function ultimoDiaMes(): string {
  const h = new Date();
  const ult = new Date(h.getFullYear(), h.getMonth() + 1, 0).getDate();
  return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(ult).padStart(2, '0')}`;
}

const ORIGEM_META: Record<RecebivelOrigem, { label: string; variant: 'default' | 'success' | 'warning' | 'muted' }> = {
  gdf: { label: 'Repasse do GDF', variant: 'default' },
  clientes: { label: 'Cliente', variant: 'success' },
  outras: { label: 'Outra entrada', variant: 'warning' },
  transferencias: { label: 'Não é receita', variant: 'muted' },
};

// Explicação em linguagem de leigo de cada origem (mostrada no modal de detalhe).
const ORIGEM_EXPLICACAO: Record<RecebivelOrigem, { titulo: string; texto: string; receita: boolean }> = {
  gdf: {
    titulo: 'Repasse do GDF',
    texto: 'Dinheiro que o governo (GDF) repassa pela operação do transporte público, via BRB Mobilidade. É a TARIFA TÉCNICA (o valor cheio da passagem que o GDF paga, não só o que o passageiro pagou no cartão). Este número é o que JÁ CAIU no banco no período — o governo paga aos poucos, às vezes referente a meses anteriores, e o complemento das gratuidades (estudante/especial) costuma chegar com ~2 meses de atraso.',
    receita: true,
  },
  clientes: {
    titulo: 'Clientes',
    texto: 'Pagamentos de clientes que o sistema já conseguiu casar com uma cobrança (conciliação bancária): o crédito que caiu no banco bate com um título a receber.',
    receita: true,
  },
  outras: {
    titulo: 'Outras entradas',
    texto: 'Dinheiro que entrou e ainda não foi identificado como repasse do GDF nem como pagamento de cliente. Ex.: recuperação de despesas, depósitos avulsos. Vale conferir cada tipo abaixo.',
    receita: true,
  },
  transferencias: {
    titulo: 'Não é receita (entre contas, aplicações, empréstimos e devoluções)',
    texto: 'Dinheiro que entrou mas NÃO é faturamento da operação: transferência entre contas da própria Pioneira (mesma titularidade), resgate de aplicação, empréstimo/capital de giro (é dívida, tem que devolver), recuperação de despesa / estorno (ex.: estorno de cartão corporativo) e devolução de pagamento que voltou (saiu, o banco devolveu e foi refeito — liga ao Contas a Pagar). Por isso fica de fora do total recebido.',
    receita: false,
  },
};

// Históricos que ainda caem em "Outras entradas" mas cujo sentido é ambíguo —
// sinalização interina no detalhe até o financeiro definir. (780 = recuperação
// de despesa já é classificado como "não é receita" no backend.)
const HISTORICOS_SUSPEITOS: Record<number, string> = {
  523: 'depósito conf. recibo',
};

export default function RecebiveisPage() {
  // Sincronizar com o Globus é ação de administrador.
  const podeSincronizar = usePodeSincronizar();
  const [dtIni, setDtIni] = useState<string>(primeiroDiaMes());
  const [dtFim, setDtFim] = useState<string>(ultimoDiaMes());
  const [contaId, setContaId] = useState<string>('');
  const [origem, setOrigem] = useState<RecebivelOrigem | ''>('');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [modalOrigem, setModalOrigem] = useState<RecebivelOrigem | null>(null);
  const [movtoId, setMovtoId] = useState<string | null>(null);
  const buscaDebounced = useDebouncedValue(busca, 400);
  // Abas: créditos do extrato (visão atual) × títulos a receber (CRCDOCTO, com
  // cliente) × "A receber" (reembolsos — elo CP→recebível).
  const [aba, setAba] = useState<'extrato' | 'titulos' | 'reembolsos'>('extrato');
  const qc = useQueryClient();

  useAuditView({
    acao: 'visualizou',
    recurso: 'contas-receber',
    descricao: 'Recebíveis — créditos do extrato por origem',
    filtros: { dtIni, dtFim, contaId: contaId || null, origem: origem || null, busca: buscaDebounced },
  });
  useTrackPrint({ recurso: 'contas-receber' });

  const { data: contas } = useQuery<RecebiveisContasResponse>({
    queryKey: ['recebiveis', 'contas'],
    queryFn: async () => (await api.get<RecebiveisContasResponse>('/api/recebiveis/contas')).data,
  });

  const { data: sumario, isLoading: carregandoSumario } = useQuery<SumarioRecebiveisResponse>({
    queryKey: ['recebiveis', 'sumario', { dtIni, dtFim, contaId }],
    queryFn: async () => {
      const params: Record<string, string> = { dtIni, dtFim };
      if (contaId) params.contaId = contaId;
      return (await api.get<SumarioRecebiveisResponse>('/api/recebiveis/sumario', { params })).data;
    },
  });

  const { data: lista, isLoading: carregandoLista } = useQuery<RecebiveisListResponse>({
    queryKey: ['recebiveis', 'lista', { dtIni, dtFim, contaId, origem, busca: buscaDebounced, pagina }],
    queryFn: async () => {
      const params: Record<string, string | number> = { dtIni, dtFim, pagina, porPagina: 15 };
      if (contaId) params.contaId = contaId;
      if (origem) params.origem = origem;
      if (buscaDebounced.trim()) params.busca = buscaDebounced.trim();
      return (await api.get<RecebiveisListResponse>('/api/recebiveis/', { params })).data;
    },
  });

  const sync = useMutation({
    mutationFn: async () => (await api.post<SyncExtratoResponse>('/api/recebiveis/sincronizar-extrato', { dtIni, dtFim })).data,
    onSuccess: (r) => {
      toast.success('Extrato atualizado', {
        description: `${r.gravados.toLocaleString('pt-BR')} lançamentos · ${r.repassesBrb.toLocaleString('pt-BR')} repasses BRB · ${(r.duracaoMs / 1000).toFixed(1)}s`,
      });
      void qc.invalidateQueries({ queryKey: ['recebiveis'] });
    },
    onError: (err) => toast.error('Falha ao atualizar extrato', { description: extrairMensagemErro(err) }),
  });

  const byOrigem = (o: RecebivelOrigem): { qtd: number; valorCents: number } =>
    sumario?.porOrigem.find((x) => x.origem === o) ?? { qtd: 0, valorCents: 0 };

  const total = sumario?.totalRecebidoCents ?? 0;
  const pct = (n: number): number => (total > 0 ? Math.round((n / total) * 100) : 0);
  const transf = byOrigem('transferencias');

  // Só as 3 origens que SÃO receita de verdade (transferências entre contas
  // próprias ficam num card à parte, fora do total).
  const cards: { origem: RecebivelOrigem; titulo: string; sub: string; cor: string; icone: typeof Landmark; href?: string }[] = [
    { origem: 'gdf', titulo: 'Repasse do GDF', sub: 'Dinheiro do governo pelo transporte público (BRB)', cor: 'from-blue-500 to-blue-400 dark:from-blue-600 dark:to-blue-500', icone: Landmark, href: '/recebiveis-gdf' },
    { origem: 'clientes', titulo: 'Clientes', sub: 'Pagamentos de clientes já identificados', cor: 'from-emerald-500 to-emerald-400 dark:from-emerald-500 dark:to-emerald-600', icone: Users2 },
    { origem: 'outras', titulo: 'Outras entradas', sub: 'Ainda a identificar — hoje quase tudo recuperação de despesa / reembolso', cor: 'from-amber-500 to-amber-400 dark:from-amber-500 dark:to-amber-600', icone: Layers },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <ModuleStatusBanner href="/contas-receber" />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent">
              Recebíveis
            </h1>
            <CompliancePill recurso="contas-receber" />
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Quanto dinheiro <strong>entrou de verdade</strong> na conta da Pioneira no período, e de onde veio.
          </p>
        </div>
        {aba === 'extrato' && podeSincronizar && (
          <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className={sync.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            {sync.isPending ? 'Atualizando' : 'Atualizar extrato'}
          </Button>
        )}
      </div>

      {/* Abas "Títulos a receber (clientes)" e "A receber (reembolsos)" desativadas
          (sem uso) — ver comentário no topo do arquivo. Só "Entradas no extrato"
          fica visível; por isso o bloco de abas some e o conteúdo abaixo não
          depende mais de `aba` (que segue sempre 'extrato').
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-800">
        {([['extrato', 'Entradas no extrato'], ['titulos', 'Títulos a receber (clientes)'], ['reembolsos', 'A receber (reembolsos)']] as Array<[typeof aba, string]>).map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => setAba(v)}
            className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${
              aba === v
                ? 'border-pioneira-500 dark:border-yellow-400 text-pioneira-800 dark:text-yellow-300'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {aba === 'titulos' && <CobrancaView embutido />}

      {aba === 'reembolsos' && <ReembolsosView />}
      */}

      {aba === 'extrato' && (
      <>
      {/* Ajuda — legenda enxuta (amarrada às cores dos cards) + régua receita × não-receita */}
      <Card className="p-4 border-l-4 border-l-blue-500 bg-blue-50/60 dark:bg-blue-950/20">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-700 dark:text-blue-300 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed text-gray-800 dark:text-gray-100 space-y-2">
            <p>
              Esta tela lê o <strong>extrato do banco</strong> e separa todo dinheiro que <strong>caiu na conta</strong> por{' '}
              <strong>de onde veio</strong>. Nem tudo que entra é faturamento — o que é só <strong>caixa girando</strong> fica
              separado, lá embaixo.
            </p>

            {/* Legenda: o ponto colorido bate com a cor do card correspondente */}
            <ul className="space-y-1 text-gray-700 dark:text-gray-200">
              <li className="flex gap-2">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />
                <span><strong>Repasse do GDF</strong> — o governo pagando a <strong>tarifa técnica</strong> do transporte (o valor cheio da passagem, não só o que o passageiro pagou). Pode incluir meses anteriores.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" />
                <span><strong>Clientes</strong> — pagamento de cliente que o sistema já casou com uma cobrança.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />
                <span><strong>Outras entradas</strong> — o que entrou e ainda não foi identificado; hoje quase tudo é <strong>recuperação de despesa / reembolso</strong>.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-gray-400 dark:bg-gray-500" />
                <span><strong>Não é receita</strong> — transferência entre contas próprias, resgate de aplicação, <strong>empréstimo/capital de giro</strong> (é dívida) e <strong>devolução</strong> de pagamento que voltou. Não é dinheiro novo.</span>
              </li>
            </ul>

            {/* Régua dinâmica: quanto do que entrou é receita de verdade */}
            {sumario && total + transf.valorCents > 0 && (
              <p className="rounded-md bg-blue-100/60 dark:bg-blue-900/30 px-3 py-2 text-gray-800 dark:text-gray-100">
                No período, de cada <strong>R$ 100</strong> que entraram no banco,{' '}
                <strong>R$ {Math.round((total / (total + transf.valorCents)) * 100)}</strong> são receita de verdade —
                o resto é dinheiro andando entre contas próprias e resgate de aplicação.
              </p>
            )}

            {/* Nota longa (GDF aqui × Recebíveis GDF) vira expansível pra não pesar */}
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-1 font-semibold text-blue-800 dark:text-blue-300 hover:underline">
                <span className="transition-transform group-open:rotate-90">▸</span>
                Por que o "Repasse do GDF" aqui não bate com a tela "Recebíveis GDF"?
              </summary>
              <p className="mt-1.5 pl-4 text-gray-700 dark:text-gray-200">
                São <strong>réguas diferentes</strong>: aqui é o <strong>repasse que caiu no banco</strong> (tarifa técnica,
                por data de pagamento, podendo incluir meses anteriores); lá é a <strong>bilhetagem</strong> (o que o passageiro
                pagou no cartão, por data de viagem). O <strong>complemento</strong> das gratuidades (estudante/especial) ainda
                chega com ~2 meses de atraso. Por isso os números não se comparam diretamente.
              </p>
            </details>

            <p className="text-xs text-gray-500 dark:text-gray-400">
              Classificação automática <strong>em validação com o financeiro</strong>. Quando não dá pra saber a origem, o
              sistema diz — não inventa.
            </p>
          </div>
        </div>
      </Card>

      {/* Card de filtros TINTADO (cinza) com campos BRANCOS + borda forte: campo branco
          sobre fundo cinza = contraste claro (antes os selects eram bg-transparent e
          sumiam no card branco). */}
      <Card className="p-3 sm:p-4 bg-gray-100/80 dark:bg-gray-900/50 border-gray-300 dark:border-gray-700">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Label htmlFor="dtIni" className="text-xs font-medium text-gray-700 dark:text-gray-300">Recebido de</Label>
            <Input id="dtIni" type="date" value={dtIni} onChange={(e) => { setDtIni(e.target.value); setPagina(1); }} className="w-40 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <Label htmlFor="dtFim" className="text-xs font-medium text-gray-700 dark:text-gray-300">até</Label>
            <Input id="dtFim" type="date" value={dtFim} onChange={(e) => { setDtFim(e.target.value); setPagina(1); }} className="w-40 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100" />
          </div>
          <div>
            <Label htmlFor="conta" className="text-xs font-medium text-gray-700 dark:text-gray-300">Conta</Label>
            <select
              id="conta"
              value={contaId}
              onChange={(e) => { setContaId(e.target.value); setPagina(1); }}
              className="flex h-9 w-52 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-1 text-sm shadow-sm focus:outline-none focus:border-pioneira-400 dark:focus:border-yellow-400 focus:ring-2 focus:ring-pioneira-400/20"
            >
              <option value="">Todas as contas</option>
              {contas?.itens.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} ({nomeBanco(c.codBanco)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="origem" className="text-xs font-medium text-gray-700 dark:text-gray-300">Origem</Label>
            <select
              id="origem"
              value={origem}
              onChange={(e) => { setOrigem(e.target.value as RecebivelOrigem | ''); setPagina(1); }}
              className="flex h-9 w-40 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-1 text-sm shadow-sm focus:outline-none focus:border-pioneira-400 dark:focus:border-yellow-400 focus:ring-2 focus:ring-pioneira-400/20"
            >
              <option value="">Todas as origens</option>
              <option value="gdf">Repasse do GDF</option>
              <option value="clientes">Clientes</option>
              <option value="outras">Outras entradas</option>
              <option value="transferencias">Não é receita (contas/aplicação/empréstimo/devolução)</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="busca" className="text-xs font-medium text-gray-700 dark:text-gray-300">Buscar (histórico, documento)</Label>
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input id="busca" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} className="pl-8 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100" placeholder="Ex.: TED, rendimento, BO-0102" />
            </div>
          </div>
        </div>
      </Card>

      {!carregandoSumario && sumario && (
        <>
          {/* Total no período */}
          <Card className="p-4 sm:p-5 bg-gradient-to-r from-pioneira-50/60 to-pioneira-100/30 dark:from-yellow-950/30 dark:to-yellow-900/10 border-pioneira-300 dark:border-yellow-800">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 font-bold">
                  Entrou no caixa (dinheiro novo)
                </p>
                <p className="text-2xl sm:text-4xl font-bold mt-1 text-pioneira-900 dark:text-yellow-200">
                  {moeda(sumario.totalRecebidoCents)}
                </p>
                <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">
                  <strong>{sumario.qtd.toLocaleString('pt-BR')}</strong> entradas · de <strong>{formatarData(`${dtIni}T00:00:00`)}</strong> a <strong>{formatarData(`${dtFim}T00:00:00`)}</strong>
                </p>
                {sumario.extratoAteData && (
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                    Extrato até <strong>{formatarData(`${sumario.extratoAteData}T00:00:00`)}</strong>
                    {sumario.ultimoSyncEm && <> · sincronizado em {formatarDataHoraCurto(sumario.ultimoSyncEm)}</>}
                  </p>
                )}
              </div>
              <div className="shrink-0 h-12 w-12 rounded-xl bg-gradient-to-br from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center shadow-md">
                <Banknote className="h-6 w-6 text-white" />
              </div>
            </div>
            {total > 0 && (
              <div className="mt-3 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
                {cards.map((c) => {
                  const w = pct(byOrigem(c.origem).valorCents);
                  if (w === 0) return null;
                  return (
                    <div
                      key={c.origem}
                      className={`h-full bg-gradient-to-r ${c.cor}`}
                      style={{ width: `${w}%` }}
                      title={`${c.titulo}: ${w}%`}
                    />
                  );
                })}
              </div>
            )}
            {sumario.semSentidoQtd > 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">
                ⚠ {sumario.semSentidoQtd.toLocaleString('pt-BR')} lançamento(s) sem sentido débito/crédito definido no Globus
                ({moeda(sumario.semSentidoCents)}) — não entram no total acima.
              </p>
            )}
            {sumario.extratoAteData && sumario.extratoAteData < dtFim && (
              <p className="mt-2 rounded-md bg-amber-100/80 dark:bg-amber-900/30 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300">
                ⚠ O extrato só está sincronizado até <strong>{formatarData(`${sumario.extratoAteData}T00:00:00`)}</strong>,
                mas o período consultado vai até <strong>{formatarData(`${dtFim}T00:00:00`)}</strong>. O total pode estar{' '}
                <strong>incompleto</strong> — clique em <strong>Atualizar extrato</strong> pra puxar o restante.
              </p>
            )}
          </Card>

          {/* Cards por origem */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {cards.map((c) => {
              const Icone = c.icone;
              const v = byOrigem(c.origem);
              // Origem sem nenhum lançamento (ex.: Clientes, enquanto não houver
              // conciliação confirmada) mostra estado vazio explícito em vez de R$0,00,
              // pra não passar impressão de bug.
              const vazio = v.qtd === 0;
              return (
                <button key={c.origem} type="button" onClick={() => setModalOrigem(c.origem)} className="text-left">
                  <Card className="p-4 h-full border-gray-200 dark:border-gray-700 hover:ring-2 hover:ring-pioneira-400 dark:hover:ring-yellow-600 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-gray-800 dark:text-gray-100">{c.titulo}</p>
                        {vazio ? (
                          <>
                            <p className="text-lg font-bold mt-1 text-gray-400 dark:text-gray-500">Nenhum ainda</p>
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">Nada identificado nesta origem no período.</p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 leading-snug">{c.sub}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-2xl sm:text-3xl font-bold mt-1 truncate text-gray-900 dark:text-white" title={moeda(v.valorCents)}>{moedaCompacta(v.valorCents)}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                              <strong>{v.qtd.toLocaleString('pt-BR')}</strong> {v.qtd === 1 ? 'entrada' : 'entradas'}
                              {total > 0 && <span className="text-gray-500 dark:text-gray-400"> · {pct(v.valorCents)}% do total</span>}
                            </p>
                            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5 leading-snug">{c.sub}</p>
                          </>
                        )}
                        <p className="text-[11px] font-semibold text-pioneira-700 dark:text-yellow-400 mt-2 inline-flex items-center gap-1">
                          Ver detalhes <ArrowUpRight className="h-3 w-3" />
                        </p>
                      </div>
                      <div className={`shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br ${c.cor} flex items-center justify-center shadow-md`}>
                        <Icone className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  </Card>
                </button>
              );
            })}
          </div>

          {/* Movimentação entre contas próprias — NÃO é receita */}
          {transf.valorCents > 0 && (
            <button type="button" onClick={() => setModalOrigem('transferencias')} className="text-left w-full">
              <Card className="p-4 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/60 dark:bg-gray-900/30 hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-600 transition-all">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 h-10 w-10 rounded-xl bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
                    <ArrowLeftRight className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-200">
                      Entre contas, aplicações, empréstimos e devoluções — <span className="text-gray-500 dark:text-gray-400">não é receita</span>
                    </p>
                    <p className="text-xl sm:text-2xl font-bold mt-0.5 text-gray-700 dark:text-gray-200">{moeda(transf.valorCents)}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-snug">
                      {transf.qtd.toLocaleString('pt-BR')} lançamento(s): transferência entre contas próprias, resgate de aplicação,
                      empréstimo/capital de giro (dívida) ou devolução de pagamento que voltou. <strong>Não é faturamento — fica fora do total acima.</strong>
                      {' '}Clique pra ver a quebra por tipo.
                    </p>
                    <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300 mt-2 inline-flex items-center gap-1">
                      Ver detalhes <ArrowUpRight className="h-3 w-3" />
                    </p>
                  </div>
                </div>
              </Card>
            </button>
          )}
        </>
      )}

      {/* Tabela de créditos */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Data</TableHead>
                <TableHead className="whitespace-nowrap">Conta</TableHead>
                <TableHead className="whitespace-nowrap">Histórico / Documento</TableHead>
                <TableHead className="whitespace-nowrap">Origem</TableHead>
                <TableHead className="text-right whitespace-nowrap">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {carregandoLista && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500 dark:text-gray-400">Carregando…</TableCell>
                </TableRow>
              )}
              {!carregandoLista && (lista?.itens?.length ?? 0) === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-gray-500 dark:text-gray-400">
                    Nenhum crédito no período. Atualize o extrato se faltar dado.
                  </TableCell>
                </TableRow>
              )}
              {!carregandoLista && lista?.itens?.map((r) => <LinhaRecebivel key={r.id} r={r} onSelect={setMovtoId} />)}
            </TableBody>
          </Table>
        </div>
        {lista && lista.total > lista.porPagina && (
          <div className="flex items-center justify-between p-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Página {lista.pagina} de {lista.totalPaginas} · {lista.total.toLocaleString('pt-BR')} créditos
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPagina(pagina - 1)} disabled={pagina <= 1}>Anterior</Button>
              <Button variant="outline" size="sm" onClick={() => setPagina(pagina + 1)} disabled={pagina >= lista.totalPaginas}>Próxima</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Vazio inicial: nenhum extrato sincronizado */}
      {!carregandoLista && !carregandoSumario && (lista?.total ?? 0) === 0 && (sumario?.qtd ?? 0) === 0 && (
        <Card className="p-8 sm:p-12 flex flex-col items-center text-center gap-5">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-pioneira-400/30 dark:bg-yellow-400/20 blur-2xl" />
            <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center shadow-lg">
              <DatabaseZap className="h-10 w-10 text-pioneira-900 dark:text-gray-900" />
            </div>
          </div>
          <div className="max-w-lg">
            <h2 className="text-xl font-semibold text-pioneira-900 dark:text-yellow-200 mb-2">Sem créditos no período</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Nenhum crédito no extrato entre <strong>{dtIni}</strong> e <strong>{dtFim}</strong>. Atualize o extrato do Globus
              ou ajuste o período.
            </p>
          </div>
          {podeSincronizar && (
            <Button size="lg" onClick={() => sync.mutate()} disabled={sync.isPending} className="min-w-[280px]">
              {sync.isPending ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Atualizando…</>
              ) : (
                <><DatabaseZap className="h-4 w-4" /> Atualizar extrato</>
              )}
            </Button>
          )}
        </Card>
      )}

      <DetalheOrigemModal
        origem={modalOrigem}
        dtIni={dtIni}
        dtFim={dtFim}
        contaId={contaId}
        onClose={() => setModalOrigem(null)}
      />

      <LancamentoDetalheModal id={movtoId} onClose={() => setMovtoId(null)} />
      </>
      )}
    </div>
  );
}

function LancamentoDetalheModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery<RecebivelDetalheResponse>({
    queryKey: ['recebiveis', 'lancamento', id],
    queryFn: async () => (await api.get<RecebivelDetalheResponse>(`/api/recebiveis/${id}`)).data,
    enabled: id !== null,
  });

  if (id === null) return null;
  const meta = data ? ORIGEM_META[data.origem] : null;

  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="mx-3 w-[calc(100%-1.5rem)] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            Lançamento do extrato
            {meta && <Badge variant={meta.variant} className="text-[10px]">{meta.label}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {data ? `${data.descHistoBco ?? 'Crédito'} — entrada de ${moeda(data.valorCents)}` : 'Carregando…'}
          </DialogDescription>
        </DialogHeader>

        {isLoading && <p className="text-sm text-gray-500 py-6 text-center">Carregando…</p>}

        {!isLoading && data && (
          <div className="mt-2 space-y-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1 bg-gray-50/50 dark:bg-gray-900/30">
              <DetLinha label="Valor" valor={<strong className="text-emerald-700 dark:text-emerald-400">{moeda(data.valorCents)}</strong>} mono />
              <DetLinha label="Data do movimento" valor={formatarData(`${data.dataMovto}T00:00:00`)} />
              {data.dataEfetiva && <DetLinha label="Efetivação" valor={formatarData(`${data.dataEfetiva}T00:00:00`)} />}
              {data.dataCredito && <DetLinha label="Crédito" valor={formatarData(`${data.dataCredito}T00:00:00`)} />}
              <DetLinha
                label="Confirmado pelo banco"
                valor={
                  data.confirmado
                    ? <span className="text-emerald-700 dark:text-emerald-400 font-medium">Sim</span>
                    : <span className="text-amber-700 dark:text-amber-400 font-medium">Não (pendente/provisório)</span>
                }
              />
              <DetLinha
                label="Conciliado"
                valor={
                  data.conciliado
                    ? <span className="text-emerald-700 dark:text-emerald-400 font-medium">Sim</span>
                    : <span className="text-gray-500">Não</span>
                }
              />
              {data.statusMovto && <DetLinha label="Status do movimento" valor={data.statusMovto} mono />}
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1 bg-gray-50/50 dark:bg-gray-900/30">
              <DetLinha label="Conta" valor={data.contaNome ?? nomeBanco(data.codBanco)} />
              <DetLinha label="Banco / Agência / Conta" valor={`${nomeBanco(data.codBanco)} · ${data.codAgencia} · ${data.codContaBco}`} mono />
              <DetLinha label="Documento" valor={data.docMovtoBco ?? '—'} mono />
              {data.codTpReceita && <DetLinha label="Tipo de receita (Globus)" valor={data.codTpReceita} mono />}
            </div>

            {/* Histórico completo do banco (não truncado) */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-1">Histórico do banco</p>
              <p className="text-sm whitespace-pre-wrap rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 bg-gray-50/50 dark:bg-gray-900/30">
                {data.histMovtoBco?.trim() || data.descHistoBco || <span className="italic text-gray-400">sem histórico</span>}
                {data.codHistoBco != null && <span className="block text-[11px] text-gray-500 mt-1">código histórico {data.codHistoBco}</span>}
              </p>
            </div>

            {/* Composição do repasse por tipo de receita (só GDF): tarifa × gratuidade */}
            {data.composicao.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-1">
                  Composição deste repasse
                </p>
                <div className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-1">
                  {data.composicao.map((c) => (
                    <DetLinha
                      key={c.codTpReceita ?? 'sem'}
                      label={c.descricao ?? `Tipo ${c.codTpReceita ?? '—'}`}
                      valor={<strong className="text-blue-800 dark:text-blue-300">{moeda(c.valorCents)}</strong>}
                      mono
                    />
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  Quebra do título <strong>AD</strong> casado no Contas a Receber — separa a tarifa paga pelo usuário do
                  complemento de gratuidade (estudante/especial) que o GDF paga.
                </p>
              </div>
            )}

            {/* Repasse GDF SEM composição na base: em vez de esconder, explica DE ONDE
                viria a quebra e o que falta pra vê-la ("quando não tem dado, o sistema diz"). */}
            {data.composicao.length === 0 && data.repasseAd && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-1">
                  Composição deste repasse
                </p>
                <div className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-2 text-[12px] leading-relaxed text-gray-700 dark:text-gray-200">
                  Este repasse casa com o título <strong className="font-mono">{data.repasseAd}</strong> no Contas a Receber.
                  A quebra por tipo de receita (tarifa do usuário × complemento de gratuidade estudante/PLE e especial/PNE)
                  aparece aqui <strong>depois de sincronizar o Contas a Receber</strong> cobrindo o vencimento desse título
                  — na aba <strong>&quot;Títulos a receber (clientes)&quot;</strong>. Enquanto o título não está na base local,
                  o sistema não inventa a quebra.
                </div>
              </div>
            )}

            {/* A que dias de TRANSPORTE este repasse se refere (cruza a matriz BRB
                pela data de resgate). Responde "esses R$ X são de quais dias de rodagem". */}
            {data.distribuicaoTransporte.length > 0 && data.resgateEm && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-1">
                  A que dias de transporte se refere
                </p>
                <div className="rounded-lg border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 divide-y divide-indigo-100 dark:divide-indigo-900/40">
                  {data.distribuicaoTransporte.map((d) => {
                    const ehAnteriores = d.dataTransporte === 'anteriores';
                    return (
                      <div key={d.dataTransporte} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <span className="text-sm font-medium">
                            {ehAnteriores ? 'Dias anteriores' : formatarData(`${d.dataTransporte}T00:00:00`)}
                          </span>
                          {!ehAnteriores && d.diasDefasagem != null && (
                            <span className="ml-2 text-[10px] font-mono text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/40 rounded px-1.5 py-0.5">
                              {d.diasDefasagem === 0 ? 'mesmo dia' : `T+${d.diasDefasagem}`}
                            </span>
                          )}
                          <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                            {d.creditos.toLocaleString('pt-BR')} passagens
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-bold text-indigo-800 dark:text-indigo-300 tabular-nums">
                            {d.percDoResgate.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                          </span>
                          <span className="block text-[11px] text-gray-500 dark:text-gray-400 font-mono">{moeda(d.valorCents)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  Este repasse quita o que foi <strong>resgatado em {formatarData(`${data.resgateEm}T00:00:00`)}</strong> — que é
                  rodagem de dias anteriores (o GDF paga em ~T+1). O <strong>%</strong> vem da matriz BRB (bilhetagem) e mostra
                  o <strong>peso de cada dia</strong>; o valor ao lado é a bilhetagem daquele dia (referência, não bate ao
                  centavo com o repasse, que é tarifa técnica).{' '}
                  <Link href="/recebiveis-gdf" className="font-semibold text-pioneira-700 dark:text-yellow-400 hover:underline">
                    Ver matriz completa
                  </Link>
                </p>
              </div>
            )}

            {/* Por que esta classificação — transparência ("rastreável até a fonte") */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-1">
                Por que esta classificação
              </p>
              <p className="text-sm rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 bg-gray-50/50 dark:bg-gray-900/30 text-gray-700 dark:text-gray-200">
                {ORIGEM_EXPLICACAO[data.origem].texto}
              </p>
              {data.origem === 'outras' && data.codHistoBco != null && HISTORICOS_SUSPEITOS[data.codHistoBco] && (
                <p className="mt-2 rounded-md bg-amber-100/80 dark:bg-amber-900/30 px-3 py-2 text-[12px] text-amber-800 dark:text-amber-300">
                  ⚠ Histórico {data.codHistoBco} — <strong>{HISTORICOS_SUSPEITOS[data.codHistoBco]}</strong> — tem sentido{' '}
                  <strong>ainda não confirmado</strong>: pode não ser receita nova. Hoje está contando no total, mas fica{' '}
                  <strong>em validação com o financeiro</strong>.
                </p>
              )}
            </div>

            {/* Cliente/título casado (origem clientes) */}
            {data.cliente && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-1">Cliente que pagou</p>
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 px-3 py-1 bg-emerald-50/50 dark:bg-emerald-950/20">
                  <DetLinha label="Cliente" valor={<strong>{data.cliente.razaoSocial}</strong>} />
                  {data.cliente.numeroInscricao && <DetLinha label="CNPJ/CPF" valor={data.cliente.numeroInscricao} mono />}
                  {data.tituloNumeroDocumento && <DetLinha label="Título casado" valor={data.tituloNumeroDocumento} mono />}
                </div>
              </div>
            )}

            <p className="text-[11px] text-gray-400 dark:text-gray-500">
              Origem no Globus: COD_MOVTO_BCO <span className="font-mono">{data.origemIdExterno}</span>
              {data.ultimoSyncEm && <> · sincronizado em {formatarData(data.ultimoSyncEm)}</>}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetLinha({ label, valor, mono }: { label: string; valor: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-3 py-1.5 border-b border-gray-100 dark:border-gray-800/50 last:border-0">
      <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</span>
      <span className={`text-sm text-right ${mono ? 'font-mono' : ''}`}>{valor}</span>
    </div>
  );
}

function DetalheOrigemModal({
  origem, dtIni, dtFim, contaId, onClose,
}: {
  origem: RecebivelOrigem | null;
  dtIni: string;
  dtFim: string;
  contaId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<DetalheOrigemResponse>({
    queryKey: ['recebiveis', 'detalhe', { origem, dtIni, dtFim, contaId }],
    queryFn: async () => {
      const params: Record<string, string> = { dtIni, dtFim, origem: origem as string };
      if (contaId) params.contaId = contaId;
      return (await api.get<DetalheOrigemResponse>('/api/recebiveis/detalhe-origem', { params })).data;
    },
    enabled: origem !== null,
  });

  if (origem === null) return null;
  const exp = ORIGEM_EXPLICACAO[origem];

  return (
    <Dialog open={origem !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="mx-3 w-[calc(100%-1.5rem)] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {exp.titulo}
            {!exp.receita && (
              <Badge variant="muted" className="text-[10px]">não é receita</Badge>
            )}
          </DialogTitle>
          <DialogDescription>{exp.texto}</DialogDescription>
        </DialogHeader>

        <div className="mt-2">
          {isLoading && <p className="text-sm text-gray-500 py-6 text-center">Carregando detalhes…</p>}

          {!isLoading && data && (
            <>
              <div className="flex items-baseline justify-between gap-3 pb-2 mb-2 border-b border-gray-200 dark:border-gray-700">
                <span className="text-xs uppercase tracking-wider text-gray-500 font-bold">
                  {exp.receita ? 'Total que entrou' : 'Total movimentado'}
                </span>
                <span className="text-lg font-bold font-mono">{moeda(data.totalCents)}</span>
              </div>

              <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
                Tipos de lançamento (do maior valor pro menor):
              </p>
              <div className="space-y-1.5">
                {data.fontes.length === 0 && (
                  <p className="text-sm text-gray-500 py-4 text-center">Sem lançamentos no período.</p>
                )}
                {data.fontes.map((f, i) => (
                  <div key={`${f.descricao ?? 'sem'}-${i}`} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 dark:border-gray-800/60 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                        {f.descricao ?? <span className="italic text-gray-400">sem histórico</span>}
                      </p>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">{f.qtd.toLocaleString('pt-BR')} lançamento{f.qtd !== 1 ? 's' : ''}</p>
                    </div>
                    <span className="font-mono text-sm font-bold whitespace-nowrap">{moeda(f.valorCents)}</span>
                  </div>
                ))}
              </div>

              {origem === 'gdf' && (
                <div className="mt-4 space-y-2">
                  <p className="rounded-md bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-[11px] leading-snug text-gray-700 dark:text-gray-200">
                    <strong>Este valor</strong> é o repasse (tarifa técnica) que <strong>caiu no banco</strong> no período.
                    A tela <strong>Recebíveis GDF</strong> mostra a <strong>bilhetagem</strong> (o que o passageiro pagou no
                    cartão, por data de viagem) — régua diferente, por isso os totais não batem direto.
                  </p>
                  <Link
                    href="/recebiveis-gdf"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-pioneira-700 dark:text-yellow-400 hover:underline"
                  >
                    Ver detalhe completo do GDF (transporte × resgate) <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LinhaRecebivel({ r, onSelect }: { r: RecebivelItem; onSelect: (id: string) => void }) {
  const meta = ORIGEM_META[r.origem];
  return (
    <TableRow onClick={() => onSelect(r.id)} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40">
      <TableCell className="whitespace-nowrap font-mono text-xs">{formatarData(`${r.dataMovto}T00:00:00`)}</TableCell>
      <TableCell className="min-w-[150px] max-w-[220px]">
        <p className="text-sm font-medium truncate">{r.contaNome ?? nomeBanco(r.codBanco)}</p>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">{nomeBanco(r.codBanco)} · ag {r.codAgencia} · cc {r.codContaBco}</p>
      </TableCell>
      <TableCell className="min-w-[200px] max-w-[360px]">
        <p className="text-sm truncate" title={r.histMovtoBco ?? r.descHistoBco ?? ''}>{r.descHistoBco ?? r.histMovtoBco ?? '—'}</p>
        {r.docMovtoBco && <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">{r.docMovtoBco}</p>}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-0.5">
          <Badge variant={meta.variant} className="text-[10px]">{meta.label}</Badge>
          {r.conciliado && (
            <span className="text-[9px] font-semibold text-emerald-600 dark:text-emerald-400" title="Crédito casado com um título/cobrança no Globus.">
              ✓ conciliado
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right font-mono text-sm font-bold whitespace-nowrap text-emerald-700 dark:text-emerald-400">
        {moeda(r.valorCents)}
      </TableCell>
    </TableRow>
  );
}
