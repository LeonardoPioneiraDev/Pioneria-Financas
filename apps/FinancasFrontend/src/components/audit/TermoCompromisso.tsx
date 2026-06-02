'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck, FileLock2, Eye, Printer, Download, Activity, UserCheck } from 'lucide-react';
import type { AceitarTermoResponse } from '@pioneira/shared/schemas/audit';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api, extrairMensagemErro } from '@/lib/api';
import { formatarData } from '@/lib/datetime';
import { useAuth } from '@/contexts/AuthContext';

interface TermoCompromissoProps {
  versaoAtual: string;
  onAceito: () => void;
}

export function TermoCompromisso({ versaoAtual, onAceito }: TermoCompromissoProps) {
  const { user } = useAuth();
  const [confirmou1, setConfirmou1] = useState(false);
  const [confirmou2, setConfirmou2] = useState(false);

  const aceitar = useMutation({
    mutationFn: async () => {
      // Nome vem direto do usuário logado - identidade já validada pelo JWT.
      const nomeDigitado = user?.nomeCompleto?.trim() ?? '';
      const res = await api.post<AceitarTermoResponse>('/api/audit/termo/aceitar', { nomeDigitado });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Termo aceito. Sessão auditada.');
      onAceito();
    },
    onError: (err) => toast.error('Falha ao aceitar termo', { description: extrairMensagemErro(err) }),
  });

  const podeAceitar = !!user?.nomeCompleto && confirmou1 && confirmou2 && !aceitar.isPending;

  return (
    <Dialog open={true} onOpenChange={() => { /* não permite fechar - bloqueante */ }}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="shrink-0 h-11 w-11 rounded-xl bg-gradient-to-br from-pioneira-400 to-pioneira-300 dark:from-yellow-500 dark:to-amber-600 flex items-center justify-center shadow-md">
            <FileLock2 className="h-6 w-6 text-pioneira-900 dark:text-gray-900" />
          </div>
          <div>
            <DialogTitle className="text-pioneira-900 dark:text-yellow-200">
              Termo de Comprometimento
            </DialogTitle>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Sistema Financeiro Pioneira · versão {versaoAtual} · {formatarData(new Date())}
            </p>
          </div>
        </div>

        <div className="space-y-4 text-sm leading-relaxed">
          <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/30 p-3">
            <p className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
              Sistema de uso restrito do Departamento Financeiro
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Os dados aqui acessados são <strong>sigilosos</strong> (folha de pagamento, contas a pagar/receber,
              tributos, conciliação bancária, fornecedores). O acesso é <strong>nominal e auditado em tempo real</strong>.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-2">Ao aceitar este termo, eu declaro que:</p>
            <ul className="space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
              <li className="flex gap-2"><span className="text-pioneira-700 dark:text-yellow-400">1.</span> Sou colaborador autorizado da Viação Pioneira Ltda. e atuo no Departamento Financeiro.</li>
              <li className="flex gap-2"><span className="text-pioneira-700 dark:text-yellow-400">2.</span> Tenho ciência de que <strong>todas as minhas ações são registradas</strong>, incluindo (mas não limitado a):</li>
            </ul>
            <div className="ml-6 mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <span className="flex items-center gap-1.5"><Eye className="h-3.5 w-3.5 text-pioneira-700 dark:text-yellow-400" /> Visualizar dados</span>
              <span className="flex items-center gap-1.5"><Activity className="h-3.5 w-3.5 text-pioneira-700 dark:text-yellow-400" /> Aplicar filtros</span>
              <span className="flex items-center gap-1.5"><Printer className="h-3.5 w-3.5 text-pioneira-700 dark:text-yellow-400" /> Imprimir / Ctrl+P</span>
              <span className="flex items-center gap-1.5"><Download className="h-3.5 w-3.5 text-pioneira-700 dark:text-yellow-400" /> Exportar planilha/PDF</span>
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-pioneira-700 dark:text-yellow-400" /> Aprovar / rejeitar</span>
              <span className="flex items-center gap-1.5"><FileLock2 className="h-3.5 w-3.5 text-pioneira-700 dark:text-yellow-400" /> Editar registros</span>
            </div>
            <ul className="space-y-1.5 text-sm text-gray-700 dark:text-gray-300 mt-3">
              <li className="flex gap-2"><span className="text-pioneira-700 dark:text-yellow-400">3.</span> Os logs incluem: usuário, endereço IP, data/hora (fuso de Brasília), navegador, ação realizada, recurso acessado e filtros aplicados.</li>
              <li className="flex gap-2"><span className="text-pioneira-700 dark:text-yellow-400">4.</span> Comprometo-me a <strong>não compartilhar credenciais, sessões ou dados</strong> com terceiros não autorizados.</li>
              <li className="flex gap-2"><span className="text-pioneira-700 dark:text-yellow-400">5.</span> Comprometo-me a <strong>não tirar fotos da tela, capturas de tela ou copiar dados</strong> para fora dos sistemas autorizados pela empresa.</li>
              <li className="flex gap-2"><span className="text-pioneira-700 dark:text-yellow-400">6.</span> Tenho ciência de que o descumprimento implica responsabilização civil, criminal (LGPD — Lei 13.709/2018) e medidas disciplinares previstas em CCT.</li>
              <li className="flex gap-2"><span className="text-pioneira-700 dark:text-yellow-400">7.</span> Os logs são retidos por <strong>10 anos</strong> e podem ser auditados pelo CFO, Controladoria, Auditoria Interna ou autoridades competentes mediante ordem judicial.</li>
            </ul>
          </div>

          <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmou1}
                onChange={(e) => setConfirmou1(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-pioneira-600 focus:ring-pioneira-500"
              />
              <span className="text-sm">
                Li, compreendi e <strong>aceito</strong> todos os termos acima.
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={confirmou2}
                onChange={(e) => setConfirmou2(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-pioneira-600 focus:ring-pioneira-500"
              />
              <span className="text-sm">
                Estou ciente de que <strong>cada visualização, impressão, exportação e filtro</strong> será registrado com meu usuário.
              </span>
            </label>
          </div>

          <div className="pt-2 rounded-lg border border-pioneira-300 dark:border-yellow-700 bg-pioneira-50/60 dark:bg-yellow-950/20 p-3">
            <div className="flex items-center gap-3">
              <div className="shrink-0 h-9 w-9 rounded-full bg-pioneira-400/30 dark:bg-yellow-500/20 flex items-center justify-center">
                <UserCheck className="h-5 w-5 text-pioneira-800 dark:text-yellow-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] uppercase tracking-wider font-semibold text-pioneira-700 dark:text-yellow-400">
                  Aceitando como
                </p>
                <p className="text-sm font-bold text-pioneira-900 dark:text-yellow-200 truncate">
                  {user?.nomeCompleto ?? '—'}
                </p>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 truncate">
                  {user?.email}{user?.role ? ` · ${user.role}` : ''}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button
              disabled={!podeAceitar}
              onClick={() => aceitar.mutate()}
              className="min-w-[240px]"
            >
              {aceitar.isPending ? 'Registrando…' : 'Aceito e prossigo para o sistema'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
