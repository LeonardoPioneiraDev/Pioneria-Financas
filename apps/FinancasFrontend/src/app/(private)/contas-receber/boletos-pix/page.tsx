'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Calendar, Copy, FileText, Info, Loader2, QrCode, Receipt,
} from 'lucide-react';
import type {
  BoletoEmitidoResponse,
  BoletosListResponse,
  CrElegivelBoleto,
  ElegiveisBoletosResponse,
  EmitirBoletoBody,
  EmitirPixBody,
} from '@pioneira/shared';
import { BANCOS_CNAB } from '@pioneira/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { api, extrairMensagemErro } from '@/lib/api';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function dataFmt(d: string | null): string {
  if (!d) return '-';
  return format(new Date(`${d}T00:00:00`), 'dd/MM/yyyy');
}
function dataHoraFmt(d: string): string {
  return format(new Date(d), 'dd/MM/yyyy HH:mm');
}

export default function BoletosPixPage() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<'elegiveis' | 'emitidos'>('elegiveis');
  const [bancoCodigo, setBancoCodigo] = useState('341');
  const [exibirEmitido, setExibirEmitido] = useState<BoletoEmitidoResponse | null>(null);

  const elegiveis = useQuery<ElegiveisBoletosResponse>({
    queryKey: ['boletos-pix', 'elegiveis'],
    queryFn: async () => (await api.get<ElegiveisBoletosResponse>('/api/boletos-pix/elegiveis')).data,
  });

  const emitidos = useQuery<BoletosListResponse>({
    queryKey: ['boletos-pix', 'ultimos'],
    queryFn: async () => (await api.get<BoletosListResponse>('/api/boletos-pix/ultimos')).data,
  });

  const emitirBoleto = useMutation<BoletoEmitidoResponse, unknown, EmitirBoletoBody>({
    mutationFn: async (body) => (await api.post<BoletoEmitidoResponse>('/api/boletos-pix/emitir-boleto', body)).data,
    onSuccess: (b) => {
      toast.success('Boleto emitido (MOCK)');
      qc.invalidateQueries({ queryKey: ['boletos-pix'] });
      setExibirEmitido(b);
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const emitirPix = useMutation<BoletoEmitidoResponse, unknown, EmitirPixBody>({
    mutationFn: async (body) => (await api.post<BoletoEmitidoResponse>('/api/boletos-pix/emitir-pix', body)).data,
    onSuccess: (b) => {
      toast.success('PIX emitido (MOCK)');
      qc.invalidateQueries({ queryKey: ['boletos-pix'] });
      setExibirEmitido(b);
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  function copy(texto: string | null) {
    if (!texto) return;
    void navigator.clipboard.writeText(texto);
    toast.success('Copiado pra area de transferencia');
  }

  const itens = elegiveis.data?.itens ?? [];
  const emitidosLista = emitidos.data?.itens ?? [];

  return (
    <div className="space-y-6">
      <Link href="/contas-receber" className="text-pioneira-700 dark:text-yellow-400 hover:underline inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="h-3 w-3" /> Voltar pra Contas a Receber
      </Link>

      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent flex items-center gap-3">
          <Receipt className="h-7 w-7 text-pioneira-700 dark:text-yellow-400" />
          Boletos e PIX
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
          Emita boleto bancario ou PIX para cada titulo a receber.
        </p>
      </div>

      <Card className="p-4 border-l-4 border-l-amber-400 bg-amber-50/40 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700 dark:text-gray-200">
            <strong className="text-amber-800 dark:text-amber-200">Versao em validacao com financeiro:</strong>{' '}
            geracao MOCK — linha digitavel e QR PIX gerados sao DEMONSTRATIVOS (nao escaneaveis).
            Quando confirmar com financeiro quais bancos usam (Itau, Bradesco, BB, Santander) e credenciais
            de API estiverem disponiveis, substituimos por chamadas reais.
          </div>
        </div>
      </Card>

      <Tabs value={aba} onValueChange={(v) => setAba(v as 'elegiveis' | 'emitidos')}>
        <TabsList>
          <TabsTrigger value="elegiveis" icon={<FileText className="h-3.5 w-3.5" />}>
            Titulos elegiveis ({itens.length})
          </TabsTrigger>
          <TabsTrigger value="emitidos" icon={<Receipt className="h-3.5 w-3.5" />}>
            Emitidos ({emitidosLista.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="elegiveis" className="space-y-3">
          <Card className="p-4">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1 block">
              Banco emissor (boleto)
            </label>
            <select
              value={bancoCodigo}
              onChange={(e) => setBancoCodigo(e.target.value)}
              className="text-sm rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 w-full sm:w-auto"
            >
              {BANCOS_CNAB.map((b) => (
                <option key={b.codigo} value={b.codigo}>
                  {b.codigo} — {b.nome}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-gray-500 mt-2">
              PIX usa chave da Pioneira (configurada no servidor) — nao depende de banco selecionado.
            </p>
          </Card>

          {elegiveis.isLoading && (
            <Card className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></Card>
          )}
          {!elegiveis.isLoading && itens.length === 0 && (
            <Card className="p-10 text-center space-y-3">
              <FileText className="h-10 w-10 mx-auto text-gray-400" />
              <h3 className="text-lg font-semibold">Sem titulos elegiveis</h3>
              <p className="text-sm text-gray-500">
                Apenas CRs com status &quot;aberto&quot; ou &quot;renegociado&quot; aparecem aqui.
              </p>
            </Card>
          )}
          {itens.map((cr: CrElegivelBoleto) => (
            <Card key={cr.contaReceberId} className="p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1 space-y-1">
                  <strong className="text-sm">
                    {cr.cliente?.razaoSocial ?? <span className="italic text-gray-400">sem cliente</span>}
                  </strong>
                  <div className="text-[11px] text-gray-500 font-mono">
                    {cr.numeroDocumento ?? '-'}
                    {cr.cliente?.cnpjCpf ? ` · ${cr.cliente.cnpjCpf}` : ''}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Vencimento: <strong>{dataFmt(cr.dataVencimento)}</strong>
                  </div>
                </div>
                <div className="text-right space-y-2">
                  <div className="text-xl font-bold font-mono">{moeda(cr.valorCents)}</div>
                  <div className="flex gap-2 justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => emitirBoleto.mutate({ contaReceberId: cr.contaReceberId, bancoCodigo })}
                      disabled={emitirBoleto.isPending}
                    >
                      <FileText className="h-3.5 w-3.5 mr-1" />
                      {cr.jaTemBoleto ? 'Reemitir boleto' : 'Emitir boleto'}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => emitirPix.mutate({ contaReceberId: cr.contaReceberId })}
                      disabled={emitirPix.isPending}
                    >
                      <QrCode className="h-3.5 w-3.5 mr-1" />
                      {cr.jaTemPix ? 'Reemitir PIX' : 'Gerar PIX'}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="emitidos" className="space-y-2">
          {emitidosLista.length === 0 && !emitidos.isLoading && (
            <Card className="p-10 text-center text-sm text-gray-500">
              Nenhum boleto/PIX emitido ainda.
            </Card>
          )}
          {emitidosLista.map((b: BoletoEmitidoResponse) => (
            <Card
              key={b.id}
              className="p-3 cursor-pointer hover:bg-gray-50/30 dark:hover:bg-gray-900/30"
              onClick={() => setExibirEmitido(b)}
            >
              <div className="flex items-center gap-3 flex-wrap">
                {b.tipo === 'boleto' ? <FileText className="h-4 w-4 text-blue-600" /> : <QrCode className="h-4 w-4 text-emerald-600" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm flex items-center gap-2 flex-wrap">
                    <strong>{b.tipo === 'boleto' ? 'Boleto' : 'PIX'}</strong>
                    {b.bancoNome && <span className="text-gray-500">{b.bancoNome}</span>}
                    <Badge variant={b.modo === 'mock' ? 'warning' : 'success'} className="text-[9px]">{b.modo}</Badge>
                    <Badge variant={b.status === 'pago' ? 'success' : b.status === 'cancelado' ? 'danger' : 'default'} className="text-[9px]">
                      {b.status}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-gray-500">
                    Venc. {dataFmt(b.vencimento)} · emitido {dataHoraFmt(b.emitidoEm)}
                  </div>
                </div>
                <div className="text-sm font-mono font-bold">{moeda(b.valorCents)}</div>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Modal mostrando boleto/PIX emitido */}
      {exibirEmitido && (
        <Dialog open onOpenChange={(o) => !o && setExibirEmitido(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {exibirEmitido.tipo === 'boleto' ? <FileText className="h-5 w-5 text-blue-600" /> : <QrCode className="h-5 w-5 text-emerald-600" />}
                {exibirEmitido.tipo === 'boleto' ? 'Boleto Bancario' : 'PIX'}
                <Badge variant={exibirEmitido.modo === 'mock' ? 'warning' : 'success'} className="text-[9px] ml-2">
                  {exibirEmitido.modo}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                {exibirEmitido.bancoNome ? `${exibirEmitido.bancoNome} · ` : ''}
                {moeda(exibirEmitido.valorCents)} · vence {dataFmt(exibirEmitido.vencimento)}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 mt-2">
              {exibirEmitido.tipo === 'boleto' && (
                <>
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500 mb-1">Linha digitavel</p>
                    <div className="flex gap-2">
                      <code className="flex-1 text-xs font-mono p-2 rounded bg-gray-100 dark:bg-gray-900 break-all">
                        {exibirEmitido.linhaDigitavel}
                      </code>
                      <Button size="sm" variant="outline" onClick={() => copy(exibirEmitido.linhaDigitavel)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500 mb-1">Nosso numero</p>
                    <code className="text-xs font-mono">{exibirEmitido.nossoNumero}</code>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500 mb-1">Codigo de barras</p>
                    <code className="text-xs font-mono break-all">{exibirEmitido.codigoBarras}</code>
                  </div>
                </>
              )}

              {exibirEmitido.tipo === 'pix' && (
                <>
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500 mb-1">QR Code PIX (string EMV)</p>
                    <div className="flex gap-2">
                      <code className="flex-1 text-[10px] font-mono p-2 rounded bg-gray-100 dark:bg-gray-900 break-all max-h-40 overflow-y-auto">
                        {exibirEmitido.qrCodePix}
                      </code>
                      <Button size="sm" variant="outline" onClick={() => copy(exibirEmitido.qrCodePix)}>
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase text-gray-500 mb-1">TxID</p>
                    <code className="text-xs font-mono">{exibirEmitido.txidPix}</code>
                  </div>
                </>
              )}

              {exibirEmitido.observacao && (
                <p className="text-[11px] italic text-gray-500 mt-2">⚠ {exibirEmitido.observacao}</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
