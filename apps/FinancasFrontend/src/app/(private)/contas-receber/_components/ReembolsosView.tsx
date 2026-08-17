'use client';

/**
 * DESATIVADO a pedido (30/07/2026, sem uso) — reativável. A RECEBER
 * (reembolsos / ressarcimentos) — valores que a empresa PAGOU (título no
 * Contas a Pagar) e tem a receber de um terceiro (ex.: multa de trânsito do
 * motorista). Liga Contas a Pagar → Recebíveis. Lê/escreve /api/reembolsos.
 *
 * Duas visões: "Reembolsos" (os já criados, com baixa) e "Candidatos" (títulos do CP
 * que parecem ressarcíveis — o usuário confirma ou descarta).
 *
 * Para reativar, descomente o import e a aba "A receber (reembolsos)" em
 * `../page.tsx`. Backend `/api/reembolsos` continua intacto.
 */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HandCoins, Search as SearchIcon, Link2, Check, X, Sparkles } from 'lucide-react';
import type {
  ReembolsoCandidatosResponse,
  ReembolsoCreditosCandidatosResponse,
  ReembolsoListResponse,
  ReembolsoResponse,
  ReembolsoStatus,
} from '@pioneira/shared';
import { REEMBOLSO_STATUS_LABEL } from '@pioneira/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatarData } from '@/lib/datetime';
import { api, extrairMensagemErro } from '@/lib/api';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function brlParaCents(brl: string): number | undefined {
  if (!brl.trim()) return undefined;
  const n = Number.parseFloat(brl.replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(n) ? undefined : Math.round(n * 100);
}
function dataFmt(d: string | null): string {
  return d ? formatarData(`${d}T00:00:00`) : '—';
}

const STATUS_VARIANT: Record<ReembolsoStatus, 'default' | 'success' | 'warning' | 'muted'> = {
  pendente: 'warning',
  cobrado: 'default',
  recebido: 'success',
  descartado: 'muted',
};

const CONFIANCA_META: Record<'alta' | 'media' | 'baixa', { label: string; variant: 'success' | 'warning' | 'muted' }> = {
  alta: { label: 'provável', variant: 'success' },
  media: { label: 'possível', variant: 'warning' },
  baixa: { label: 'só o valor', variant: 'muted' },
};

export function ReembolsosView() {
  const [sub, setSub] = useState<'lista' | 'candidatos'>('lista');

  return (
    <div className="space-y-4">
      <Card className="p-4 border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20">
        <div className="flex items-start gap-3">
          <HandCoins className="h-5 w-5 text-emerald-700 dark:text-emerald-300 shrink-0 mt-0.5" />
          <div className="text-sm leading-relaxed text-gray-800 dark:text-gray-100 space-y-1">
            <p>
              <strong>A receber de terceiros.</strong> Quando a empresa paga algo que é responsabilidade de um
              funcionário (ex.: <strong>multa de trânsito do motorista</strong>) ou de outro terceiro, esse título do{' '}
              <strong>Contas a Pagar</strong> vira aqui um <strong>valor a receber</strong>. Quando a pessoa devolve o
              dinheiro, dá-se a <strong>baixa</strong> — podendo amarrar ao crédito real do extrato pra comprovar.
            </p>
          </div>
        </div>
      </Card>

      <div className="flex gap-2">
        {([['lista', 'Reembolsos'], ['candidatos', 'Candidatos']] as Array<[typeof sub, string]>).map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => setSub(v)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium border-2 transition-colors ${
              sub === v
                ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-400 dark:border-emerald-500 text-emerald-800 dark:text-emerald-200'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-emerald-300'
            }`}
          >
            {l}
            {v === 'candidatos' && <Sparkles className="inline h-3.5 w-3.5 ml-1" />}
          </button>
        ))}
      </div>

      {sub === 'lista' ? <ListaReembolsos /> : <ListaCandidatos onCriado={() => setSub('lista')} />}
    </div>
  );
}

/* ============================ LISTA DE REEMBOLSOS ============================ */

function ListaReembolsos() {
  const [status, setStatus] = useState<ReembolsoStatus | ''>('');
  const [busca, setBusca] = useState('');
  const buscaDeb = useDebouncedValue(busca, 400);
  const [receber, setReceber] = useState<ReembolsoResponse | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<ReembolsoListResponse>({
    queryKey: ['reembolsos', 'lista', { status, busca: buscaDeb }],
    queryFn: async () => {
      const params: Record<string, string | number> = { porPagina: 100 };
      if (status) params.status = status;
      if (buscaDeb.trim()) params.busca = buscaDeb.trim();
      return (await api.get<ReembolsoListResponse>('/api/reembolsos', { params })).data;
    },
  });

  const cobrar = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/api/reembolsos/${id}`, { status: 'cobrado' })).data,
    onSuccess: () => {
      toast.success('Marcado como cobrado');
      void qc.invalidateQueries({ queryKey: ['reembolsos'] });
    },
    onError: (err) => toast.error('Falha', { description: extrairMensagemErro(err) }),
  });

  return (
    <div className="space-y-3">
      {/* Totais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">A receber</p>
          <p className="text-2xl font-bold mt-1 text-amber-700 dark:text-amber-400">{moeda(data?.totais.aReceberCents ?? 0)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{(data?.totais.aReceberQtd ?? 0).toLocaleString('pt-BR')} em aberto (pendente + cobrado)</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">Recebido</p>
          <p className="text-2xl font-bold mt-1 text-emerald-700 dark:text-emerald-400">{moeda(data?.totais.recebidoCents ?? 0)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{(data?.totais.recebidoQtd ?? 0).toLocaleString('pt-BR')} já devolvido(s)</p>
        </Card>
      </div>

      {/* Filtros */}
      <Card className="p-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <Label htmlFor="rb-status" className="text-xs">Status</Label>
            <select
              id="rb-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ReembolsoStatus | '')}
              className="flex h-9 w-44 rounded-md border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-1 text-sm shadow-sm"
            >
              <option value="">Em aberto + recebidos</option>
              <option value="pendente">A cobrar</option>
              <option value="cobrado">Cobrado</option>
              <option value="recebido">Recebido</option>
              <option value="descartado">Descartado</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label htmlFor="rb-busca" className="text-xs">Buscar (devedor, motivo, documento)</Label>
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input id="rb-busca" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8" placeholder="Ex.: João, multa, 0000123" />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Devedor / Motivo</TableHead>
                <TableHead>Título (CP)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Recebimento</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-500">Carregando…</TableCell></TableRow>
              )}
              {!isLoading && (data?.itens.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-gray-500">
                  Nenhum reembolso. Veja a aba <strong>Candidatos</strong> pra criar a partir de títulos do Contas a Pagar.
                </TableCell></TableRow>
              )}
              {data?.itens.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium">{r.devedorNome ?? <span className="italic text-gray-400">sem devedor</span>}</p>
                    {r.motivo && <p className="text-[11px] text-gray-500 dark:text-gray-400">{r.motivo}</p>}
                    {r.devedorDocumento && <p className="text-[10px] text-gray-400 font-mono">{r.devedorDocumento}</p>}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.contaPagar ? (
                      <>
                        <p className="font-medium">{r.contaPagar.fornecedorNome ?? '—'}</p>
                        <p className="text-gray-500 dark:text-gray-400">
                          {r.contaPagar.numeroDocumento ?? '—'} · pago {dataFmt(r.contaPagar.dataPagamento)}
                        </p>
                      </>
                    ) : <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[r.status]} className="text-[10px]">{REEMBOLSO_STATUS_LABEL[r.status]}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">{moeda(r.valorCents)}</TableCell>
                  <TableCell className="text-xs">
                    {r.status === 'recebido' ? (
                      <>
                        <p className="text-emerald-700 dark:text-emerald-400 font-medium">{dataFmt(r.dataRecebimento)}</p>
                        {r.credito ? (
                          <p className="text-[10px] text-gray-500 inline-flex items-center gap-1">
                            <Link2 className="h-3 w-3" /> extrato {r.credito.docMovtoBco ?? dataFmt(r.credito.dataMovto)}
                          </p>
                        ) : (
                          <p className="text-[10px] text-amber-600">sem amarração no extrato</p>
                        )}
                      </>
                    ) : <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {r.status === 'pendente' && (
                        <Button size="sm" variant="outline" onClick={() => cobrar.mutate(r.id)} disabled={cobrar.isPending}>
                          Cobrar
                        </Button>
                      )}
                      {r.status !== 'recebido' && r.status !== 'descartado' && (
                        <Button size="sm" onClick={() => setReceber(r)}>Receber</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ReceberDialog reembolso={receber} onClose={() => setReceber(null)} />
    </div>
  );
}

/* ============================ BAIXA (RECEBER) ============================ */

function ReceberDialog({ reembolso, onClose }: { reembolso: ReembolsoResponse | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [data, setData] = useState('');
  const [valorBrl, setValorBrl] = useState('');
  const [bancoMovtoId, setBancoMovtoId] = useState<string | null>(null);

  // Reseta ao abrir um reembolso novo.
  const abertoId = reembolso?.id ?? null;
  const [prevId, setPrevId] = useState<string | null>(null);
  const [autoFeito, setAutoFeito] = useState(false);
  if (abertoId !== prevId) {
    setPrevId(abertoId);
    setData(new Date().toISOString().slice(0, 10));
    setValorBrl(reembolso ? (reembolso.valorCents / 100).toFixed(2).replace('.', ',') : '');
    setBancoMovtoId(null);
    setAutoFeito(false);
  }

  const { data: creditos } = useQuery<ReembolsoCreditosCandidatosResponse>({
    queryKey: ['reembolsos', 'creditos', abertoId],
    queryFn: async () => (await api.get<ReembolsoCreditosCandidatosResponse>(`/api/reembolsos/${abertoId}/creditos-candidatos`)).data,
    enabled: abertoId !== null,
  });

  // Pré-seleciona o crédito de ALTA confiança (sugestão), uma vez por reembolso. O
  // usuário ainda confirma — e pode trocar pra "sem amarração" ou outro lançamento.
  useEffect(() => {
    if (autoFeito || !creditos) return;
    const provavel = creditos.itens.find((c) => c.confianca === 'alta');
    if (provavel) setBancoMovtoId(provavel.id);
    setAutoFeito(true);
  }, [creditos, autoFeito]);

  const salvar = useMutation({
    mutationFn: async () => {
      if (!reembolso) return;
      return (await api.post(`/api/reembolsos/${reembolso.id}/receber`, {
        dataRecebimento: data,
        recebidoCents: brlParaCents(valorBrl),
        bancoMovtoId,
      })).data;
    },
    onSuccess: () => {
      toast.success('Recebimento registrado');
      void qc.invalidateQueries({ queryKey: ['reembolsos'] });
      onClose();
    },
    onError: (err) => toast.error('Falha ao registrar', { description: extrairMensagemErro(err) }),
  });

  if (!reembolso) return null;

  return (
    <Dialog open={reembolso !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="mx-3 w-[calc(100%-1.5rem)] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar recebimento</DialogTitle>
          <DialogDescription>
            {reembolso.devedorNome ?? 'Devedor'} · {moeda(reembolso.valorCents)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="rec-data" className="text-xs">Recebido em</Label>
              <Input id="rec-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="rec-valor" className="text-xs">Valor recebido (R$)</Label>
              <Input id="rec-valor" inputMode="decimal" value={valorBrl} onChange={(e) => setValorBrl(e.target.value)} placeholder="0,00" />
            </div>
          </div>

          {/* Amarração opcional ao crédito real do extrato (rastreabilidade). */}
          <div>
            <Label className="text-xs">Amarrar ao crédito do extrato (opcional)</Label>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1.5">
              Créditos do banco com o mesmo valor ({moeda(reembolso.valorCents)}) que entraram depois do pagamento.
              O <strong>provável</strong> já vem marcado — confira e ajuste se preciso.
            </p>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              <button
                type="button"
                onClick={() => setBancoMovtoId(null)}
                className={`w-full text-left rounded-md border px-3 py-1.5 text-xs ${
                  bancoMovtoId === null ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'border-gray-200 dark:border-gray-700'
                }`}
              >
                Sem amarração (só registro manual)
              </button>
              {creditos?.itens.map((c) => {
                const conf = c.confianca ? CONFIANCA_META[c.confianca] : null;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setBancoMovtoId(c.id)}
                    className={`w-full text-left rounded-md border px-3 py-1.5 text-xs ${
                      bancoMovtoId === c.id ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex justify-between gap-2 items-center">
                      <span className="min-w-0 inline-flex items-center gap-1.5">
                        {conf && <Badge variant={conf.variant} className="text-[9px] shrink-0">{conf.label}</Badge>}
                        <span className="font-medium">{dataFmt(c.dataMovto)}</span>
                        <span className="text-gray-500 truncate">· {c.contaNome ?? `Banco ${c.codBanco}`}{c.docMovtoBco ? ` · ${c.docMovtoBco}` : ''}</span>
                      </span>
                      <span className="font-mono shrink-0 text-emerald-700 dark:text-emerald-400">{moeda(c.valorCents)}</span>
                    </div>
                    {c.motivos && c.motivos.length > 0 && (
                      <span className="block text-[10px] text-gray-500 mt-0.5">{c.motivos.join(' · ')}</span>
                    )}
                  </button>
                );
              })}
              {(creditos?.itens.length ?? 0) === 0 && (
                <p className="text-[11px] text-gray-400 italic px-1">Nenhum crédito de mesmo valor entrou depois do pagamento — registre manual.</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !data}>
            <Check className="h-4 w-4" /> {salvar.isPending ? 'Salvando…' : 'Confirmar recebimento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================ CANDIDATOS ============================ */

function ListaCandidatos({ onCriado }: { onCriado: () => void }) {
  const [busca, setBusca] = useState('');
  const buscaDeb = useDebouncedValue(busca, 400);
  const [criar, setCriar] = useState<ReembolsoCandidatosResponse['itens'][number] | null>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<ReembolsoCandidatosResponse>({
    queryKey: ['reembolsos', 'candidatos', { busca: buscaDeb }],
    queryFn: async () => {
      const params: Record<string, string | number> = { porPagina: 100 };
      if (buscaDeb.trim()) params.busca = buscaDeb.trim();
      return (await api.get<ReembolsoCandidatosResponse>('/api/reembolsos/candidatos', { params })).data;
    },
  });

  const descartar = useMutation({
    mutationFn: async (contaPagarId: string) => (await api.post('/api/reembolsos/descartar', { contaPagarId })).data,
    onSuccess: () => {
      toast.success('Candidato descartado');
      void qc.invalidateQueries({ queryKey: ['reembolsos'] });
    },
    onError: (err) => toast.error('Falha', { description: extrairMensagemErro(err) }),
  });

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <Label htmlFor="cand-busca" className="text-xs">Buscar candidatos (fornecedor, documento, observação)</Label>
        <div className="relative">
          <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input id="cand-busca" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-8" placeholder="Ex.: DETRAN, multa" />
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1.5">
          Sugestões automáticas: títulos do Contas a Pagar que parecem ressarcíveis (multa, infração, avaria, ressarcimento…). Confirme ou descarte.
        </p>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fornecedor / Documento</TableHead>
                <TableHead>Sinal</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-500">Carregando…</TableCell></TableRow>
              )}
              {!isLoading && (data?.itens.length ?? 0) === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-500">
                  Nenhum candidato. O sistema sugere títulos que parecem multa/ressarcimento.
                </TableCell></TableRow>
              )}
              {data?.itens.map((c) => (
                <TableRow key={c.contaPagar.id}>
                  <TableCell>
                    <p className="font-medium">{c.contaPagar.fornecedorNome ?? '—'}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{c.contaPagar.numeroDocumento ?? '—'}</p>
                    {c.contaPagar.observacao && (
                      <p className="text-[10px] text-gray-400 truncate max-w-[280px]" title={c.contaPagar.observacao}>{c.contaPagar.observacao}</p>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.motivoSugerido && <Badge variant="warning" className="text-[10px]">{c.motivoSugerido}</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{dataFmt(c.contaPagar.dataVencimento)}</TableCell>
                  <TableCell className="text-right font-mono font-semibold">{moeda(c.contaPagar.valorAPagarCents)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" onClick={() => setCriar(c)}>Cobrar</Button>
                      <Button size="sm" variant="ghost" onClick={() => descartar.mutate(c.contaPagar.id)} disabled={descartar.isPending} title="Não é reembolso">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <CriarDialog candidato={criar} onClose={() => setCriar(null)} onCriado={onCriado} />
    </div>
  );
}

/* ============================ CRIAR REEMBOLSO ============================ */

function CriarDialog({
  candidato, onClose, onCriado,
}: {
  candidato: ReembolsoCandidatosResponse['itens'][number] | null;
  onClose: () => void;
  onCriado: () => void;
}) {
  const qc = useQueryClient();
  const [devedor, setDevedor] = useState('');
  const [documento, setDocumento] = useState('');
  const [matricula, setMatricula] = useState('');
  const [motivo, setMotivo] = useState('');
  const [valorBrl, setValorBrl] = useState('');
  const [prevista, setPrevista] = useState('');

  const cpId = candidato?.contaPagar.id ?? null;
  const [prevId, setPrevId] = useState<string | null>(null);
  if (cpId !== prevId) {
    setPrevId(cpId);
    setDevedor('');
    setDocumento('');
    setMatricula('');
    setMotivo(candidato?.motivoSugerido ? `${candidato.motivoSugerido} — ${candidato.contaPagar.fornecedorNome ?? ''}`.trim() : '');
    setValorBrl(candidato ? (candidato.contaPagar.valorAPagarCents / 100).toFixed(2).replace('.', ',') : '');
    setPrevista('');
  }

  const criar = useMutation({
    mutationFn: async () => {
      if (!candidato) return;
      return (await api.post('/api/reembolsos', {
        contaPagarId: candidato.contaPagar.id,
        devedorNome: devedor.trim(),
        devedorDocumento: documento.trim() || undefined,
        devedorMatricula: matricula.trim() || undefined,
        motivo: motivo.trim() || undefined,
        valorCents: brlParaCents(valorBrl),
        dataPrevista: prevista || undefined,
      })).data;
    },
    onSuccess: () => {
      toast.success('Reembolso criado');
      void qc.invalidateQueries({ queryKey: ['reembolsos'] });
      onClose();
      onCriado();
    },
    onError: (err) => toast.error('Falha ao criar', { description: extrairMensagemErro(err) }),
  });

  if (!candidato) return null;

  return (
    <Dialog open={candidato !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="mx-3 w-[calc(100%-1.5rem)] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cobrar de terceiro (criar reembolso)</DialogTitle>
          <DialogDescription>
            {candidato.contaPagar.fornecedorNome ?? '—'} · {candidato.contaPagar.numeroDocumento ?? '—'} · {moeda(candidato.contaPagar.valorAPagarCents)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div>
            <Label htmlFor="cr-devedor" className="text-xs">Quem deve (funcionário / terceiro) *</Label>
            <Input id="cr-devedor" value={devedor} onChange={(e) => setDevedor(e.target.value)} placeholder="Nome do motorista/funcionário" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cr-doc" className="text-xs">CPF (opcional)</Label>
              <Input id="cr-doc" value={documento} onChange={(e) => setDocumento(e.target.value)} placeholder="000.000.000-00" />
            </div>
            <div>
              <Label htmlFor="cr-mat" className="text-xs">Matrícula (opcional)</Label>
              <Input id="cr-mat" value={matricula} onChange={(e) => setMatricula(e.target.value)} />
            </div>
          </div>
          <div>
            <Label htmlFor="cr-motivo" className="text-xs">Motivo</Label>
            <Input id="cr-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: Multa de trânsito — placa XXX" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cr-valor" className="text-xs">Valor a receber (R$)</Label>
              <Input id="cr-valor" inputMode="decimal" value={valorBrl} onChange={(e) => setValorBrl(e.target.value)} placeholder="0,00" />
            </div>
            <div>
              <Label htmlFor="cr-prev" className="text-xs">Previsão (opcional)</Label>
              <Input id="cr-prev" type="date" value={prevista} onChange={(e) => setPrevista(e.target.value)} />
            </div>
          </div>
        </div>

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => criar.mutate()} disabled={criar.isPending || !devedor.trim()}>
            <HandCoins className="h-4 w-4" /> {criar.isPending ? 'Criando…' : 'Criar reembolso'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
