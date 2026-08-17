'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  AlertTriangle, Ban, CheckCircle2, FilePlus2, Loader2, RotateCcw, ShieldCheck, Undo2,
} from 'lucide-react';
import type { CpEvento, CpEventosResponse } from '@pioneira/shared/schemas/cp-eventos';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const ESTILO: Record<CpEvento['natureza'], { Icone: typeof CheckCircle2; cor: string; rotulo: string }> = {
  criacao:                { Icone: FilePlus2,   cor: 'text-gray-400',    rotulo: 'Documento criado' },
  liberacao:              { Icone: ShieldCheck, cor: 'text-sky-500',     rotulo: 'Liberação de pagamento' },
  // "Baixa", não "Pagamento": o USUARIO do evento é quem lançou a baixa no ERP,
  // não quem autorizou o dinheiro no banco (o Globus não guarda esse dado).
  pagamento:              { Icone: CheckCircle2, cor: 'text-emerald-500', rotulo: 'Baixa registrada no Globus' },
  cancelamento_pagamento: { Icone: Undo2,       cor: 'text-amber-500',   rotulo: 'Baixa de pagamento cancelada' },
  cancelamento_documento: { Icone: Ban,         cor: 'text-red-500',     rotulo: 'Documento cancelado' },
  outro:                  { Icone: RotateCcw,   cor: 'text-gray-400',    rotulo: 'Movimentação' },
};

const STATUS_GLOBUS_LABEL: Record<string, string> = {
  N: 'em aberto', B: 'baixado (pago)', C: 'cancelado', F: 'aprovado', A: 'em aberto',
};

function quando(iso: string | null): string {
  return iso ? format(new Date(iso), 'dd/MM/yyyy HH:mm:ss') : '—';
}

/**
 * Trilha REAL do documento no Globus — todos os atos, na ordem em que
 * aconteceram, com usuário e hora.
 *
 * Substitui o fluxo "inferido" em 4 etapas, que contava uma história limpa e
 * escondia cancelamento de pagamento e repagamento. Era o que fazia o
 * financeiro ver "cancelado" no ERP e "pago" aqui, sem entender a diferença.
 */
export function TrilhaGlobus({ contaPagarId }: { contaPagarId: string }) {
  const { data, isLoading, isError } = useQuery<CpEventosResponse>({
    queryKey: ['contas-pagar', contaPagarId, 'eventos'],
    queryFn: async () => (await api.get<CpEventosResponse>(`/api/contas-pagar/${contaPagarId}/eventos`)).data,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 py-3 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando a trilha do Globus…
      </p>
    );
  }
  if (isError || !data) {
    return <p className="py-3 text-sm text-gray-500">Não foi possível carregar a trilha do Globus.</p>;
  }

  const { eventos, statusSistema, statusGlobus, quitadoGlobus, divergente, teveCancelamentoPagamento, vezesPago } = data;

  return (
    <div className="py-1">
      {/* Confronto explícito: o que mostramos × o que o ERP diz. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-gray-500 dark:text-gray-400">Status neste sistema:</span>
        <Badge variant={statusSistema === 'pago' ? 'success' : statusSistema === 'cancelado' ? 'danger' : 'warning'}>
          {statusSistema}
        </Badge>
        <span className="text-gray-400">·</span>
        <span className="text-gray-500 dark:text-gray-400">No Globus:</span>
        <Badge variant="muted">
          {statusGlobus ? `${statusGlobus} — ${STATUS_GLOBUS_LABEL[statusGlobus] ?? '?'}` : 'não sincronizado'}
        </Badge>
        {!divergente && statusGlobus && (
          <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> conferem
          </span>
        )}
      </div>

      {divergente && (
        <p className="mb-3 flex items-start gap-1.5 rounded-md bg-red-50 p-2 text-[12px] text-red-800 dark:bg-red-950/30 dark:text-red-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <strong>Divergência com o ERP.</strong> O Globus está como
            “{STATUS_GLOBUS_LABEL[statusGlobus ?? ''] ?? statusGlobus}” e aqui aparece “{statusSistema}”.
            Vale sincronizar; se persistir, é caso para o time do sistema.
          </span>
        </p>
      )}

      {(teveCancelamentoPagamento || vezesPago > 1) && (
        <p className="mb-3 flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-[12px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <Undo2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {vezesPago > 1
              ? <>O pagamento deste título foi <strong>refeito {vezesPago}×</strong> no Globus (cancelado e lançado de novo).</>
              : <>Houve <strong>cancelamento de pagamento</strong> na trilha deste título.</>}{' '}
            O estado final é o da última linha abaixo — os atos intermediários ficam registrados.
          </span>
        </p>
      )}

      {eventos.length === 0 && (
        <p className="py-2 text-sm text-gray-500 dark:text-gray-400">
          Sem eventos sincronizados para este título. A trilha vem de
          <code className="mx-1">CPGDOCTO_HISTORICO_NEGOCIACOES</code> e depende do sincronismo do período.
        </p>
      )}

      <ol className="space-y-0">
        {eventos.map((e, i) => {
          const { Icone, cor, rotulo } = ESTILO[e.natureza];
          const ultimo = i === eventos.length - 1;
          const problema = e.natureza === 'cancelamento_pagamento' || e.natureza === 'cancelamento_documento';
          return (
            <li key={e.sequencia} className="relative flex gap-3 pb-3 last:pb-0">
              {/* linha vertical ligando os atos */}
              {!ultimo && <span className="absolute left-[9px] top-6 h-full w-px bg-gray-200 dark:bg-gray-700" />}
              <Icone className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', cor)} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cn('text-sm font-medium', problema && 'text-amber-700 dark:text-amber-300')}>
                    {rotulo}
                  </span>
                  {ultimo && <Badge variant="muted" className="text-[9px]">estado final</Badge>}
                  {e.statusResultante && (
                    <span className="text-[10px] text-gray-400">→ status {e.statusResultante}</span>
                  )}
                </div>
                <p className="mt-0.5 text-[12px] text-gray-600 dark:text-gray-300">
                  {e.detalhe ?? e.tipoDescricao ?? '—'}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-400">
                  {e.usuario ? <strong className="font-medium">{e.usuario}</strong> : 'sem usuário'} · {quando(e.ocorridoEm)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-3 border-t border-gray-100 pt-2 text-[10px] leading-snug text-gray-400 dark:border-gray-800 dark:text-gray-500 italic">
        Trilha real do Globus (CPGDOCTO_HISTORICO_NEGOCIACOES) — todos os atos, sem resumir.
        {' '}O nome em cada linha é o <strong>usuário que executou a operação no Globus</strong>, não
        {' '}necessariamente quem praticou o ato no banco: o ERP não registra quem autorizou o pagamento.
        {' '}O campo <code>QUITADO</code> do ERP está como <strong>{quitadoGlobus ? 'S' : 'N'}</strong>; ele
        {' '}não indica compensação bancária (fica “N” em ~38% dos pagamentos) e não é usado para definir o status.
      </p>
    </div>
  );
}
