'use client';

/**
 * DESATIVADO a pedido (30/07/2026, sem uso) — reativável. Visão de COBRANÇA:
 * títulos a receber do Globus (CRCDOCTO + CRCITDOC) — aging, atrasado,
 * status, top clientes devedores.
 *
 * A tela `/contas-receber` foi reposicionada para "Recebíveis" (dinheiro que
 * entrou no extrato, por origem). Esta visão NÃO foi removida — para
 * reativar, descomente o import e a aba "Títulos a receber (clientes)" em
 * `../page.tsx`. Backend `/api/contas-receber` (CRCDOCTO) continua intacto.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
// import Link from 'next/link'; // desativado junto com os atalhos de sub-fluxos (Regua/Boletos/SERASA)
import {
  Receipt, TrendingUp, AlertCircle, Banknote, RefreshCw, DatabaseZap, Search as SearchIcon,
  AlertTriangle, Users2,
} from 'lucide-react';
import type {
  ContaReceberListResponse,
  ContaReceberItem,
  SumarioContasReceberResponse,
  SyncContasReceberResponse,
} from '@pioneira/shared/schemas/contas-receber';
import {
  CONTA_RECEBER_STATUS_LABEL,
  FAIXAS_AGING_LABEL,
  type FaixaAging,
} from '@pioneira/shared/enums/conta-receber-status';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CompliancePill } from '@/components/audit/CompliancePill';
import { AvisoColapsavel } from '@/components/shared/AvisoColapsavel';
import { useAuditView, useTrackPrint } from '@/hooks/useAudit';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatarData, formatarDataHoraCurto } from '@/lib/datetime';
import { api, extrairMensagemErro } from '@/lib/api';
import { ModuleStatusBanner } from '@/components/layout/ModuleStatusBanner';
import { usePodeSincronizar } from '@/hooks/usePodeSincronizar';

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

const STATUS_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'muted'> = {
  aberto: 'warning',
  pago: 'success',
  cancelado: 'danger',
  renegociado: 'default',
  protestado: 'danger',
};

/**
 * `embutido` = renderiza como ABA dentro da página de Recebíveis (sem o banner de
 * status nem o título/CompliancePill próprios, que a página-mãe já mostra). Mantém
 * o botão de sincronizar e todo o conteúdo (cards, aging, tabela com cliente).
 */
export function CobrancaView({ embutido = false }: { embutido?: boolean } = {}) {
  // Sincronizar com o Globus é ação de administrador.
  const podeSincronizar = usePodeSincronizar();
  const [dtIni, setDtIni] = useState<string>(primeiroDiaMes());
  const [dtFim, setDtFim] = useState<string>(ultimoDiaMes());
  // Filtro por DATA DE RECEBIMENTO (o que foi recebido no período) — espelho do
  // filtro de pagamento do Contas a Pagar. Vazio = filtra por vencimento (legado).
  const [dtRecIni, setDtRecIni] = useState<string>('');
  const [dtRecFim, setDtRecFim] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [faixaAtiva, setFaixaAtiva] = useState<FaixaAging | undefined>(undefined);
  const [pagina, setPagina] = useState(1);
  const buscaDebounced = useDebouncedValue(busca, 400);
  const qc = useQueryClient();

  // Quando há filtro por recebimento, o de vencimento é ignorado (backend idem).
  const filtraRecebimento = !!(dtRecIni || dtRecFim);

  useAuditView({
    acao: 'visualizou',
    recurso: 'contas-receber',
    descricao: 'Listagem de contas a receber',
    filtros: { dtIni, dtFim, dtRecIni: dtRecIni || null, dtRecFim: dtRecFim || null, busca: buscaDebounced, faixa: faixaAtiva ?? null },
  });
  useTrackPrint({ recurso: 'contas-receber' });

  const { data: sumario, isLoading: carregandoSumario } = useQuery<SumarioContasReceberResponse>({
    queryKey: ['contas-receber', 'sumario', { dtIni, dtFim }],
    queryFn: async () => {
      const res = await api.get<SumarioContasReceberResponse>('/api/contas-receber/sumario', {
        params: { dtIni, dtFim },
      });
      return res.data;
    },
  });

  const { data: lista, isLoading: carregandoLista } = useQuery<ContaReceberListResponse>({
    queryKey: ['contas-receber', 'lista', { dtIni, dtFim, dtRecIni, dtRecFim, busca: buscaDebounced, faixa: faixaAtiva, pagina }],
    queryFn: async () => {
      const params: Record<string, string | number> = { dtIni, dtFim, pagina, porPagina: 50 };
      if (dtRecIni) params.dtRecIni = dtRecIni;
      if (dtRecFim) params.dtRecFim = dtRecFim;
      if (buscaDebounced.trim()) params.busca = buscaDebounced.trim();
      if (faixaAtiva) params.faixa = faixaAtiva;
      const res = await api.get<ContaReceberListResponse>('/api/contas-receber/', { params });
      return res.data;
    },
  });

  const { data: syncStatus } = useQuery({
    queryKey: ['contas-receber', 'sync-status'],
    queryFn: async () => (await api.get('/api/contas-receber/sync-status')).data as { ultimoSyncEm: string | null; totalLocal: number; totalClientes: number; precisaSincronizar: boolean },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const res = await api.post<SyncContasReceberResponse>('/api/contas-receber/sync', { dtIni, dtFim });
      return res.data;
    },
    onSuccess: (r) => {
      if (r.mensagem) {
        // Ex.: leu do Globus mas nada gravou em finance (erro de ETL) — antes isso
        // aparecia como "sucesso" e a tela ficava vazia sem explicação.
        toast.warning('Sincronização com aviso', { description: r.mensagem });
      } else {
        toast.success('Sincronização concluída', {
          description: `${r.clientesGravados.toLocaleString('pt-BR')} clientes · ${r.titulosGravados.toLocaleString('pt-BR')} títulos · ${(r.duracaoMs / 1000).toFixed(1)}s`,
        });
      }
      void qc.invalidateQueries({ queryKey: ['contas-receber'] });
    },
    onError: (err) => toast.error('Falha ao sincronizar', { description: extrairMensagemErro(err) }),
  });

  const precisaSync = syncStatus?.precisaSincronizar ?? false;

  return (
    <div className="space-y-4 sm:space-y-6">
      {!embutido && <ModuleStatusBanner href="/contas-receber" />}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          {!embutido && (
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent">
                Contas a Receber
              </h1>
              <CompliancePill recurso="contas-receber" />
            </div>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Títulos a receber, aging, status de cobrança e top clientes devedores. Cada título tem o <strong>cliente</strong> (razão social + CNPJ). Sincronizado de <code>CRCDOCTO</code> + <code>CRCITDOC</code> do Globus.
          </p>
        </div>
        {podeSincronizar && (
          <Button variant="outline" size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className={sync.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            {sync.isPending ? 'Sincronizando' : 'Sincronizar do Globus'}
          </Button>
        )}
      </div>

      {/* ATALHOS DESATIVADOS (a pedido): os sub-fluxos abaixo estão em modo MOCK
          (sem integração real) e foram escondidos até haver integração de verdade.
          O backend que fabricava os dados também foi neutralizado (os endpoints
          respondem 501 "não configurado"). Para REATIVAR: descomente este bloco e
          os imports `Link` (next/link), `Bell` e `ShieldAlert` (lucide-react).

        <div className="flex flex-wrap gap-2">
          <Link
            href="/contas-receber/regua-cobranca"
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-md border border-pink-300 bg-pink-50 text-pink-800 hover:bg-pink-100 dark:bg-pink-950/30 dark:text-pink-200 dark:border-pink-900/40"
          >
            <Bell className="h-4 w-4" />
            Régua de Cobrança
          </Link>
          <Link
            href="/contas-receber/boletos-pix"
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-md border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-200 dark:border-emerald-900/40"
          >
            <Receipt className="h-4 w-4" />
            Boletos / PIX
          </Link>
          <Link
            href="/contas-receber/serasa"
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-md border border-red-300 bg-red-50 text-red-800 hover:bg-red-100 dark:bg-red-950/30 dark:text-red-200 dark:border-red-900/40"
          >
            <ShieldAlert className="h-4 w-4" />
            SERASA
          </Link>
        </div>
      */}

      <AvisoColapsavel severidade="info" icone={Receipt} tituloPilula="Sobre contas a receber" delaySegundos={10}>
        <strong>Dados sensíveis comerciais.</strong> Esta tela mostra todos os títulos a receber da Pioneira no banco local
        (sincronizados do Globus/Praxio). Inclui faturas, adiantamentos, vale-transporte corporativo e títulos de
        integração tarifária. Toda visualização e filtro é registrado em <code>audit.acesso_dados</code>.
      </AvisoColapsavel>

      <Card className="p-3 sm:p-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Label htmlFor="dtIni" className="text-xs">Vencimento de{filtraRecebimento ? ' (ignorado)' : ''}</Label>
            <Input id="dtIni" type="date" value={dtIni} onChange={(e) => { setDtIni(e.target.value); setPagina(1); }} className="w-40" disabled={filtraRecebimento} />
          </div>
          <div>
            <Label htmlFor="dtFim" className="text-xs">até{filtraRecebimento ? ' (ignorado)' : ''}</Label>
            <Input id="dtFim" type="date" value={dtFim} onChange={(e) => { setDtFim(e.target.value); setPagina(1); }} className="w-40" disabled={filtraRecebimento} />
          </div>
          <div>
            <Label htmlFor="dtRecIni" className="text-xs">Recebimento de</Label>
            <Input id="dtRecIni" type="date" value={dtRecIni} onChange={(e) => { setDtRecIni(e.target.value); setPagina(1); }} className="w-40" />
          </div>
          <div>
            <Label htmlFor="dtRecFim" className="text-xs">até</Label>
            <Input id="dtRecFim" type="date" value={dtRecFim} onChange={(e) => { setDtRecFim(e.target.value); setPagina(1); }} className="w-40" />
          </div>
          {filtraRecebimento && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setDtRecIni(''); setDtRecFim(''); setPagina(1); }}
              className="text-xs text-gray-500"
            >
              Limpar recebimento
            </Button>
          )}
          <div className="flex-1 min-w-[220px]">
            <Label htmlFor="busca" className="text-xs">Buscar (documento, nosso número, cliente)</Label>
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input id="busca" value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }} className="pl-8" placeholder="Ex.: 123/01 ou Nubank" />
            </div>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {syncStatus?.ultimoSyncEm && <>último sync <strong>{formatarDataHoraCurto(syncStatus.ultimoSyncEm)}</strong></>}
          </span>
        </div>
      </Card>

      {filtraRecebimento && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 -mt-2 px-1">
          Filtrando por <strong>data de recebimento</strong> (o que foi recebido no período). A base local é
          sincronizada por <strong>vencimento</strong> — títulos recebidos cujo vencimento esteja fora da janela já
          sincronizada podem não aparecer. Sincronize o período de vencimento correspondente se faltar algo.
        </p>
      )}

      {precisaSync && (
        <Card className="p-8 sm:p-12 flex flex-col items-center text-center gap-5">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-pioneira-400/30 dark:bg-yellow-400/20 blur-2xl" />
            <div className="relative h-20 w-20 rounded-full bg-gradient-to-br from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center shadow-lg">
              <DatabaseZap className="h-10 w-10 text-pioneira-900 dark:text-gray-900" />
            </div>
          </div>
          <div className="max-w-lg">
            <h2 className="text-xl font-semibold text-pioneira-900 dark:text-yellow-200 mb-2">
              Sem títulos no banco local
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Nenhum título a receber foi sincronizado ainda. Clique para puxar do Globus os títulos com vencimento entre <strong>{dtIni}</strong> e <strong>{dtFim}</strong>.
            </p>
          </div>
          {podeSincronizar && (
            <Button size="lg" onClick={() => sync.mutate()} disabled={sync.isPending} className="min-w-[280px]">
              {sync.isPending ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Sincronizando…</>
              ) : (
                <><DatabaseZap className="h-4 w-4" /> Sincronizar do Globus</>
              )}
            </Button>
          )}
        </Card>
      )}

      {!precisaSync && !carregandoSumario && sumario && (
        <>
          {(() => {
            // Buckets mutuamente exclusivos a partir do aging + status
            const agingAtrasado = sumario.aging.find((a) => a.faixa === 'atrasado') ?? { qtd: 0, valorCents: 0 };
            const agingVenceHoje = sumario.aging.find((a) => a.faixa === 'vence_hoje') ?? { qtd: 0, valorCents: 0 };
            const agingVence7d = sumario.aging.find((a) => a.faixa === 'vence_7d') ?? { qtd: 0, valorCents: 0 };
            const agingVence30d = sumario.aging.find((a) => a.faixa === 'vence_30d') ?? { qtd: 0, valorCents: 0 };
            const agingFuturo = sumario.aging.find((a) => a.faixa === 'futuro') ?? { qtd: 0, valorCents: 0 };

            const vencido = { qtd: agingAtrasado.qtd, valor: agingAtrasado.valorCents };
            const vence7d = { qtd: agingVenceHoje.qtd + agingVence7d.qtd, valor: agingVenceHoje.valorCents + agingVence7d.valorCents };
            const venceMais7 = { qtd: agingVence30d.qtd + agingFuturo.qtd, valor: agingVence30d.valorCents + agingFuturo.valorCents };
            const recebido = { qtd: sumario.totais.qtdRecebido, valor: sumario.totais.valorRecebidoCents };

            const total = sumario.totais.qtd;
            const somaCards = vencido.qtd + vence7d.qtd + venceMais7.qtd + recebido.qtd;
            const pct = (n: number): number => (total > 0 ? Math.round((n / total) * 100) : 0);

            const cards = [
              { titulo: 'Vencido', qtd: vencido.qtd, valor: vencido.valor, cor: 'from-red-500 to-red-400 dark:from-red-600 dark:to-red-500', icone: AlertCircle },
              { titulo: 'Vence em 7 dias', qtd: vence7d.qtd, valor: vence7d.valor, cor: 'from-amber-400 to-amber-300 dark:from-amber-500 dark:to-amber-600', icone: AlertTriangle },
              { titulo: 'Vence em mais de 7 dias', qtd: venceMais7.qtd, valor: venceMais7.valor, cor: 'from-blue-400 to-blue-300 dark:from-blue-500 dark:to-blue-600', icone: TrendingUp },
              { titulo: 'Recebido', qtd: recebido.qtd, valor: recebido.valor, cor: 'from-emerald-400 to-emerald-300 dark:from-emerald-500 dark:to-emerald-600', icone: Banknote },
            ];

            return (
              <>
                {/* Header — Total no período (não clicável) */}
                <Card className="p-4 sm:p-5 bg-gradient-to-r from-pioneira-50/60 to-pioneira-100/30 dark:from-yellow-950/30 dark:to-yellow-900/10 border-pioneira-300 dark:border-yellow-800">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wider text-pioneira-700 dark:text-yellow-400 font-bold">
                        Total no período
                      </p>
                      <p className="text-2xl sm:text-3xl font-bold mt-1 text-pioneira-900 dark:text-yellow-200">
                        {moeda(sumario.totais.valorBrutoCents)}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                        <strong>{total.toLocaleString('pt-BR')}</strong> títulos · vencimento entre <strong>{dtIni}</strong> e <strong>{dtFim}</strong>
                      </p>
                    </div>
                    <div className="shrink-0 h-12 w-12 rounded-xl bg-gradient-to-br from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center shadow-md">
                      <Receipt className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  {/* Barra de composição */}
                  {total > 0 && (
                    <div className="mt-3">
                      <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden flex">
                        {cards.map((c) => {
                          const w = total > 0 ? (c.qtd / total) * 100 : 0;
                          if (w === 0) return null;
                          return (
                            <div
                              key={c.titulo}
                              className={`h-full bg-gradient-to-r ${c.cor} transition-all`}
                              style={{ width: `${w}%` }}
                              title={`${c.titulo}: ${c.qtd.toLocaleString('pt-BR')} (${pct(c.qtd)}%)`}
                            />
                          );
                        })}
                      </div>
                      {somaCards !== total && (
                        <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1">
                          ⚠ soma dos cards ({somaCards}) ≠ total ({total}) — {sumario.totais.qtdCancelado > 0 ? `${sumario.totais.qtdCancelado} cancelado(s) não exibido(s)` : `diferença de ${Math.abs(total - somaCards)}`}
                        </p>
                      )}
                    </div>
                  )}
                </Card>

                {/* 4 cards exclusivos */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  {cards.map((c) => {
                    const Icone = c.icone;
                    return (
                      <Card key={c.titulo} className={`p-4 ${c.titulo === 'Vencido' && c.qtd > 0 ? 'ring-1 ring-red-300 dark:ring-red-700' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold">{c.titulo}</p>
                            <p className="text-xl sm:text-2xl font-bold mt-1 truncate" title={moeda(c.valor)}>{moedaCompacta(c.valor)}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                              <strong>{c.qtd.toLocaleString('pt-BR')}</strong> {c.qtd === 1 ? 'título' : 'títulos'}
                              {total > 0 && <span className="text-gray-400 dark:text-gray-500"> · {pct(c.qtd)}% do total</span>}
                            </p>
                          </div>
                          <div className={`shrink-0 h-10 w-10 rounded-xl bg-gradient-to-br ${c.cor} flex items-center justify-center shadow-md`}>
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

          {sumario.aging.length > 0 && (
            <Card className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300">
                  Aging — Em aberto
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {(['atrasado', 'vence_hoje', 'vence_7d', 'vence_30d', 'futuro'] as FaixaAging[]).map((f) => {
                  const item = sumario.aging.find((a) => a.faixa === f);
                  const valorCents = item?.valorCents ?? 0;
                  const qtd = item?.qtd ?? 0;
                  const ativo = faixaAtiva === f;
                  const isAtrasado = f === 'atrasado' && qtd > 0;
                  return (
                    <button
                      type="button"
                      key={f}
                      onClick={() => { setFaixaAtiva(ativo ? undefined : f); setPagina(1); }}
                      className={`text-left p-2.5 rounded-lg border-l-4 transition-all hover:scale-[1.02] ${
                        ativo
                          ? 'border-l-pioneira-600 bg-pioneira-100/50 dark:bg-yellow-950/30 ring-1 ring-pioneira-400'
                          : isAtrasado
                            ? 'border-l-red-400 bg-red-50/50 dark:bg-red-950/20'
                            : 'border-l-gray-300 dark:border-l-gray-700 bg-gray-50/40 dark:bg-gray-900/30'
                      }`}
                    >
                      <p className="text-[10px] uppercase tracking-wider text-gray-600 dark:text-gray-400 font-semibold">
                        {FAIXAS_AGING_LABEL[f]}
                      </p>
                      <p className={`text-base sm:text-lg font-bold mt-0.5 ${isAtrasado ? 'text-red-700 dark:text-red-400' : 'text-pioneira-900 dark:text-yellow-200'}`}>
                        {moedaCompacta(valorCents)}
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {qtd.toLocaleString('pt-BR')} título{qtd !== 1 ? 's' : ''}
                      </p>
                    </button>
                  );
                })}
              </div>
              {faixaAtiva && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Filtrando por: <strong>{FAIXAS_AGING_LABEL[faixaAtiva]}</strong>.{' '}
                  <button type="button" onClick={() => setFaixaAtiva(undefined)} className="text-pioneira-700 dark:text-yellow-400 hover:underline">Limpar</button>
                </p>
              )}
            </Card>
          )}

          {sumario.topClientes.length > 0 && (
            <Card className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users2 className="h-4 w-4 text-pioneira-700 dark:text-yellow-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300">
                  Top 5 clientes em aberto
                </h2>
              </div>
              <div className="space-y-2">
                {sumario.topClientes.map((c, i) => (
                  <div key={`${c.clienteId ?? i}`} className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-6">#{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{c.razaoSocial}</p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400">
                        {c.qtd.toLocaleString('pt-BR')} título{c.qtd !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span className="font-mono text-sm font-bold whitespace-nowrap">{moeda(c.valorCents)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Vencimento</TableHead>
                    <TableHead className="whitespace-nowrap">Cliente</TableHead>
                    <TableHead className="whitespace-nowrap">Documento</TableHead>
                    <TableHead className="whitespace-nowrap">Tipo</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Valor</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Líquido</TableHead>
                    <TableHead className="whitespace-nowrap">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {carregandoLista && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                        Carregando…
                      </TableCell>
                    </TableRow>
                  )}
                  {!carregandoLista && (lista?.itens?.length ?? 0) === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                        Nenhum título com esses filtros
                      </TableCell>
                    </TableRow>
                  )}
                  {!carregandoLista && lista?.itens?.map((cr) => <LinhaCr key={cr.id} cr={cr} />)}
                </TableBody>
              </Table>
            </div>
            {lista && lista.total > lista.porPagina && (
              <div className="flex items-center justify-between p-3 border-t border-gray-100 dark:border-gray-800">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Página {lista.pagina} de {lista.totalPaginas} · {lista.total.toLocaleString('pt-BR')} títulos
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPagina(pagina - 1)} disabled={pagina <= 1}>Anterior</Button>
                  <Button variant="outline" size="sm" onClick={() => setPagina(pagina + 1)} disabled={pagina >= lista.totalPaginas}>Próxima</Button>
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function LinhaCr({ cr }: { cr: ContaReceberItem }) {
  const variant = STATUS_VARIANTS[cr.status] ?? 'muted';
  const hoje = new Date().toISOString().slice(0, 10);
  const atrasado = cr.dataVencimento < hoje && (cr.status === 'aberto' || cr.status === 'renegociado');
  return (
    <TableRow className={atrasado ? 'bg-red-50/40 dark:bg-red-950/10' : undefined}>
      <TableCell className="whitespace-nowrap font-mono text-xs">
        {formatarData(`${cr.dataVencimento}T00:00:00`)}
        {atrasado && (
          <span className="ml-1 text-[10px] text-red-700 dark:text-red-400 font-semibold">atrasado</span>
        )}
      </TableCell>
      <TableCell className="min-w-[180px] max-w-[300px]">
        <p className="text-sm font-semibold truncate">{cr.cliente?.razaoSocial ?? '—'}</p>
        {cr.cliente?.numeroInscricao && (
          <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">{cr.cliente.numeroInscricao}</p>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">
        {cr.numeroDocumento}
        {cr.numeroParcela ? <span className="text-gray-500"> /{String(cr.numeroParcela).padStart(2, '0')}</span> : null}
        {cr.serieDocumento && <p className="text-[10px] text-gray-500">{cr.serieDocumento}</p>}
      </TableCell>
      <TableCell>
        <Badge variant="muted" className="text-[10px] font-mono">{cr.tipoDocumento ?? '—'}</Badge>
      </TableCell>
      <TableCell className="text-right font-mono text-xs whitespace-nowrap">{moeda(cr.valorBrutoCents)}</TableCell>
      <TableCell className="text-right font-mono text-sm font-bold whitespace-nowrap">{moeda(cr.valorLiquidoCents)}</TableCell>
      <TableCell>
        <Badge variant={variant}>{CONTA_RECEBER_STATUS_LABEL[cr.status]}</Badge>
      </TableCell>
    </TableRow>
  );
}
