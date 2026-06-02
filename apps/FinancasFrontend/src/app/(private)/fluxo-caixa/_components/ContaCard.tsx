'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Wallet, Pencil, Star, Building2, CheckCircle2, AlertCircle } from 'lucide-react';
import type { ContaBancaria } from '@pioneira/shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { api, extrairMensagemErro } from '@/lib/api';
import { cn } from '@/lib/utils';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function ContaCard({ conta, onSalvar }: { conta: ContaBancaria; onSalvar: () => void }) {
  const [dialogAberto, setDialogAberto] = useState(false);

  const togglePrincipal = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/fluxo-caixa/contas/${conta.id}/principal`, {
        ehPrincipal: !conta.ehPrincipal,
      });
    },
    onSuccess: () => {
      toast.success(conta.ehPrincipal ? 'Conta removida das principais' : 'Conta marcada como principal');
      onSalvar();
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const nome = conta.nomeAmigavel || conta.nomeContaBco;

  return (
    <>
      <Card
        className={cn(
          'p-4 border-l-4 transition-all',
          conta.ehPrincipal
            ? 'border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10'
            : 'border-l-gray-300 dark:border-l-gray-700',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Building2 className="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0" />
              <h3 className="text-sm font-semibold truncate">{nome}</h3>
              {conta.ehPrincipal && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <Star className="h-2.5 w-2.5" />
                  PRINCIPAL
                </span>
              )}
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-mono mt-0.5">
              Banco {conta.codBanco} · Ag {conta.codAgencia} · Cc {conta.codContaBco}{conta.digito ? `-${conta.digito}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => togglePrincipal.mutate()}
            disabled={togglePrincipal.isPending}
            className="text-[10px] text-gray-400 hover:text-pioneira-700 dark:hover:text-yellow-400 transition-colors px-2 py-1 rounded hover:bg-gray-50 dark:hover:bg-gray-900"
            title={conta.ehPrincipal ? 'Remover das principais' : 'Marcar como principal'}
          >
            {conta.ehPrincipal ? 'Remover' : 'Tornar principal'}
          </button>
        </div>

        {/* Saldo */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <Wallet className="h-3 w-3" />
              Saldo conhecido
            </div>
            {conta.ancoraPronta ? (
              <>
                <div className="text-lg font-bold mt-0.5">{moeda(conta.saldoAcmCents ?? 0)}</div>
                <div className="text-[10px] text-gray-500 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  em {format(new Date(`${conta.dataSaldoAcm}T00:00:00`), 'dd/MM/yyyy')}
                </div>
              </>
            ) : (
              <>
                <div className="text-sm text-amber-700 dark:text-amber-300 mt-0.5 font-medium">
                  Não configurado
                </div>
                <div className="text-[10px] text-gray-500 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 text-amber-500" />
                  digite o saldo atual
                </div>
              </>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => setDialogAberto(true)}>
            <Pencil className="h-3 w-3" />
            {conta.ancoraPronta ? 'Atualizar' : 'Configurar'}
          </Button>
        </div>

        {/* Saldo Globus (referência) */}
        {conta.saldoGlobusCents !== null && conta.saldoGlobusCents !== 0 && (
          <details className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
            <summary className="cursor-pointer hover:text-gray-600 dark:hover:text-gray-300">
              Saldo do Globus (referência)
            </summary>
            <div className="mt-1 pl-2">
              {moeda(conta.saldoGlobusCents)} em{' '}
              {conta.dataSaldoGlobus ? format(new Date(`${conta.dataSaldoGlobus}T00:00:00`), 'dd/MM/yyyy') : '—'}
              <span className="block text-amber-600 dark:text-amber-400 mt-0.5">
                ⚠ Não confiável — Globus não mantém essa coluna atualizada.
              </span>
            </div>
          </details>
        )}
      </Card>

      <DialogAncora
        conta={conta}
        aberto={dialogAberto}
        onClose={() => setDialogAberto(false)}
        onSalvar={() => {
          onSalvar();
          setDialogAberto(false);
        }}
      />
    </>
  );
}

function DialogAncora({
  conta,
  aberto,
  onClose,
  onSalvar,
}: {
  conta: ContaBancaria;
  aberto: boolean;
  onClose: () => void;
  onSalvar: () => void;
}) {
  const [valorStr, setValorStr] = useState(
    conta.saldoAcmCents !== null ? (conta.saldoAcmCents / 100).toFixed(2).replace('.', ',') : '',
  );
  const [data, setData] = useState(conta.dataSaldoAcm ?? new Date().toISOString().slice(0, 10));

  const salvar = useMutation({
    mutationFn: async () => {
      const numerico = parseFloat(valorStr.replace(/\./g, '').replace(',', '.'));
      if (Number.isNaN(numerico)) throw new Error('Valor inválido. Use formato 1.234,56');
      const cents = Math.round(numerico * 100);
      await api.patch(`/api/fluxo-caixa/contas/${conta.id}/ancora-saldo`, {
        saldoCents: cents,
        dataSaldo: data,
      });
    },
    onSuccess: () => {
      toast.success('Saldo salvo com sucesso');
      onSalvar();
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configurar saldo da conta</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-pioneira-50 dark:bg-yellow-950/20 border border-pioneira-200 dark:border-yellow-900/40 p-3 text-xs text-gray-700 dark:text-gray-200">
            <strong>Como preencher:</strong> consulte o saldo desta conta no extrato do banco
            (ideal: hoje, manhã). Digite o valor exato (ex.: 125.430,57) e a data em que conferiu.
            O sistema vai usar isso como ponto de partida pra calcular o saldo dos próximos dias.
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Conta</p>
            <p className="font-medium text-sm">{conta.nomeAmigavel || conta.nomeContaBco}</p>
            <p className="text-[11px] font-mono text-gray-500">
              {conta.codBanco}/{conta.codAgencia}/{conta.codContaBco}
            </p>
          </div>

          <div>
            <Label htmlFor="valorSaldo">Saldo (R$)</Label>
            <Input
              id="valorSaldo"
              type="text"
              inputMode="decimal"
              value={valorStr}
              onChange={(e) => setValorStr(e.target.value)}
              placeholder="0,00"
              autoFocus
            />
            <p className="text-[10px] text-gray-500 mt-1">
              Use formato brasileiro: <code>1.234,56</code>. Negativo = conta no vermelho.
            </p>
          </div>

          <div>
            <Label htmlFor="dataSaldo">Data da conferência</Label>
            <Input
              id="dataSaldo"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => salvar.mutate()} disabled={salvar.isPending || !valorStr}>
            {salvar.isPending ? 'Salvando…' : 'Salvar saldo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
