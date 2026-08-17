'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ShieldCheck, CheckCircle2, AlertTriangle, Clock, Loader2, MessageSquareReply, Stamp, RefreshCw, FileText, CornerDownRight,
} from 'lucide-react';
import type { FuncionalidadeValidacao, RegistroValidacao, ValidacoesResumoResponse } from '@pioneira/shared/schemas/validacoes';
import { OBSERVACOES_MIN } from '@pioneira/shared/enums/validacao';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, extrairMensagemErro } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AnexosPreview } from '@/components/shared/AnexosPreview';
import { RelatorioValidacoes } from './_components/RelatorioValidacoes';

function fmt(iso: string): string {
  return format(new Date(iso), 'dd/MM/yyyy HH:mm');
}

/** Textarea das observações, reutilizada no aval e na resposta à ressalva. */
function CampoObservacoes({
  id, valor, onChange, label, placeholder, obrigatorio,
}: {
  id: string; valor: string; onChange: (v: string) => void;
  label: string; placeholder: string; obrigatorio: boolean;
}) {
  const curto = obrigatorio && valor.trim().length < OBSERVACOES_MIN;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label} {!obrigatorio && <span className="font-normal text-gray-400">(opcional)</span>}
      </label>
      <textarea
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder={placeholder}
        className="w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pioneira-400 dark:border-gray-700 dark:bg-gray-900 dark:focus:ring-yellow-500"
      />
      {curto && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Mínimo {OBSERVACOES_MIN} caracteres — descreva o que precisa ser revisto.
        </p>
      )}
    </div>
  );
}

/** Linha de uma conferência de auditor dentro do card da funcionalidade. */
function LinhaConferencia({ registro, podeResponder }: { registro: RegistroValidacao; podeResponder: boolean }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [resposta, setResposta] = useState('');
  const validado = registro.status === 'validado';

  const responder = useMutation({
    mutationFn: async () => (await api.post(`/api/validacoes/${registro.id}/responder`, { resposta: resposta.trim() })).data,
    onSuccess: () => {
      toast.success('Resposta registrada — o auditor verá na tela dele.');
      void qc.invalidateQueries({ queryKey: ['validacoes'] });
      setAberto(false);
      setResposta('');
    },
    onError: (err) => toast.error('Não foi possível responder', { description: extrairMensagemErro(err) }),
  });

  return (
    <div className={cn(
      'rounded-md border p-3',
      validado
        ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20'
        : 'border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20',
    )}>
      <div className="flex items-start gap-2.5">
        {validado
          ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <p className="text-sm font-medium">
              {registro.usuarioNome}
              <span className="ml-1.5 font-normal text-gray-500 dark:text-gray-400">
                {validado ? 'validou' : 'apontou um problema'}
              </span>
            </p>
            <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">{fmt(registro.criadoEm)}</span>
          </div>

          {registro.observacoes && (
            <p className="mt-1.5 whitespace-pre-wrap border-l-2 border-gray-200 pl-2 text-[13px] italic leading-relaxed text-gray-700 dark:border-gray-700 dark:text-gray-200">
              “{registro.observacoes}”
            </p>
          )}

          {registro.anexosDataUri.length > 0 && (
            <div className="mt-2">
              <AnexosPreview anexos={registro.anexosDataUri} />
            </div>
          )}

          {registro.respostaAdmin && (
            <div className="mt-2.5 flex items-start gap-1.5 border-l-2 border-sky-200 pl-2 dark:border-sky-800">
              <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <p className="text-[12px] font-medium text-sky-800 dark:text-sky-300">
                    {registro.respondidoPorNome ?? 'Administrador'}
                  </p>
                  {registro.respondidoEm && (
                    <span className="shrink-0 text-[11px] text-gray-400 dark:text-gray-500">{fmt(registro.respondidoEm)}</span>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-gray-700 dark:text-gray-200">{registro.respostaAdmin}</p>
              </div>
            </div>
          )}
        </div>
        {podeResponder && !validado && !registro.respostaAdmin && (
          <Button size="sm" variant="outline" className="shrink-0" onClick={() => setAberto(true)}>
            <MessageSquareReply className="h-3.5 w-3.5" /><span className="ml-1 hidden sm:inline">Responder</span>
          </Button>
        )}
      </div>

      <Dialog open={aberto} onOpenChange={(v) => { setAberto(v); if (!v) setResposta(''); }}>
        <DialogContent className="mx-3 w-[calc(100%-1.5rem)] max-w-md sm:w-full">
          <DialogHeader>
            <DialogTitle>Responder à ressalva</DialogTitle>
            <DialogDescription>
              Explique o que foi corrigido. O auditor vê a resposta em “Minhas funcionalidades” e pode validar de novo.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-md bg-amber-50 p-2 text-[13px] italic text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            “{registro.observacoes}”
          </p>
          <CampoObservacoes
            id={`resposta-${registro.id}`}
            valor={resposta}
            onChange={setResposta}
            label="O que foi corrigido"
            placeholder="Ex.: o total agora soma só as parcelas do período; corrigido na consulta do Globus."
            obrigatorio
          />
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
            <Button variant="outline" onClick={() => setAberto(false)} disabled={responder.isPending} className="w-full sm:w-auto">Cancelar</Button>
            <Button
              onClick={() => responder.mutate()}
              disabled={responder.isPending || resposta.trim().length < OBSERVACOES_MIN}
              className="w-full sm:w-auto"
            >
              {responder.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareReply className="h-4 w-4" />}
              <span className="ml-1">Registrar resposta</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Card de uma funcionalidade: conferências dos auditores + aval do CFO. */
function CardFuncionalidade({ f, ehAdmin, podeAvalizar }: { f: FuncionalidadeValidacao; ehAdmin: boolean; podeAvalizar: boolean }) {
  const qc = useQueryClient();
  const [aval, setAval] = useState<'validado' | 'reprovado' | null>(null);
  const [observacoes, setObservacoes] = useState('');

  const registrarAval = useMutation({
    mutationFn: async () => (await api.post('/api/validacoes/aval', {
      chave: f.chave,
      status: aval,
      observacoes: observacoes.trim() || undefined,
    })).data,
    onSuccess: () => {
      toast.success(aval === 'validado' ? 'Aval registrado.' : 'Devolvida com ressalva.');
      void qc.invalidateQueries({ queryKey: ['validacoes'] });
      setAval(null);
      setObservacoes('');
    },
    onError: (err) => toast.error('Não foi possível registrar', { description: extrairMensagemErro(err) }),
  });

  const avalOk = f.aval?.status === 'validado';
  const avalRessalva = f.aval?.status === 'reprovado';

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{f.nome}</p>
          <p className="text-[11px] uppercase tracking-wide text-gray-400">{f.grupo}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {f.totalValidada > 0 && (
            <Badge variant="success">{f.totalValidada} {f.totalValidada === 1 ? 'validação' : 'validações'}</Badge>
          )}
          {f.ressalvasAbertas > 0 && (
            <Badge variant="warning">{f.ressalvasAbertas} ressalva{f.ressalvasAbertas > 1 ? 's' : ''}</Badge>
          )}
          {f.emConferencia && f.conferencias.length === 0 && <Badge variant="muted">Em conferência</Badge>}
          {!f.emConferencia && f.conferencias.length === 0 && <Badge variant="muted">Não conferida</Badge>}
          {avalOk && <Badge variant="default">Avalizada pelo CFO</Badge>}
          {avalRessalva && <Badge variant="danger">Devolvida pelo CFO</Badge>}
        </div>
      </div>

      {f.avalComRessalvaPosterior && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-[12px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Um auditor registrou ressalva <strong>depois</strong> do aval — vale revisar.
        </p>
      )}

      {f.conferencias.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {f.conferencias.map((c) => (
            <LinhaConferencia key={c.id} registro={c} podeResponder={ehAdmin} />
          ))}
        </div>
      )}

      {f.conferencias.length === 0 && f.emConferencia && (
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-gray-500 dark:text-gray-400">
          <Clock className="h-3.5 w-3.5" /> A auditoria está analisando esta tela — ainda não houve validação.
        </p>
      )}

      {f.aval && (
        <div className="mt-3 rounded-md border border-gray-200 p-2.5 dark:border-gray-800">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Stamp className="h-4 w-4 text-pioneira-600 dark:text-yellow-400" />
            {f.aval.status === 'validado' ? 'Aval de ciência' : 'Devolvida com ressalva'}
            <span className="font-normal text-[11px] text-gray-500 dark:text-gray-400">
              — {f.aval.usuarioNome}, {fmt(f.aval.criadoEm)}
            </span>
          </p>
          {f.aval.observacoes && (
            <p className="mt-1 whitespace-pre-wrap text-[13px] italic text-gray-700 dark:text-gray-200">“{f.aval.observacoes}”</p>
          )}
        </div>
      )}

      {/* Sem validação de auditor não há o que avalizar — os botões nem aparecem
          (mostrá-los desabilitados sugeria uma ação que não existe ainda). */}
      {podeAvalizar && f.podeAvalizar && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
          <Button size="sm" onClick={() => { setAval('validado'); setObservacoes(''); }}>
            <Stamp className="h-3.5 w-3.5" /><span className="ml-1">{avalOk ? 'Reavalizar' : 'Dar aval'}</span>
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setAval('reprovado'); setObservacoes(''); }}>
            <AlertTriangle className="h-3.5 w-3.5" /><span className="ml-1">Devolver com ressalva</span>
          </Button>
        </div>
      )}

      <Dialog open={aval !== null} onOpenChange={(v) => { if (!v) { setAval(null); setObservacoes(''); } }}>
        <DialogContent className="mx-3 w-[calc(100%-1.5rem)] max-w-md sm:w-full">
          <DialogHeader>
            <DialogTitle>
              {aval === 'validado' ? `Dar aval — ${f.nome}` : `Devolver ${f.nome} com ressalva`}
            </DialogTitle>
            <DialogDescription>
              {aval === 'validado'
                ? 'Você declara ciência de que esta funcionalidade foi conferida pelo auditor e está de acordo.'
                : 'A ressalva fica registrada para o admin e para os auditores. Ninguém perde acesso já liberado.'}
            </DialogDescription>
          </DialogHeader>
          <CampoObservacoes
            id={`aval-obs-${f.chave}`}
            valor={observacoes}
            onChange={setObservacoes}
            label={aval === 'validado' ? 'Observações' : 'O que precisa ser revisto'}
            placeholder={aval === 'validado' ? 'Alguma observação sobre a conferência…' : 'Descreva o ponto que impede o aval…'}
            obrigatorio={aval === 'reprovado'}
          />
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
            <Button variant="outline" onClick={() => setAval(null)} disabled={registrarAval.isPending} className="w-full sm:w-auto">Cancelar</Button>
            <Button
              onClick={() => registrarAval.mutate()}
              disabled={registrarAval.isPending || (aval === 'reprovado' && observacoes.trim().length < OBSERVACOES_MIN)}
              className="w-full sm:w-auto"
            >
              {registrarAval.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              <span className="ml-1">Confirmar</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default function ValidacoesPage() {
  const { user } = useAuth();
  const ehAdmin = user?.role === 'admin';
  const podeAvalizar = user?.role === 'cfo' || ehAdmin;
  const [aba, setAba] = useState<'situacao' | 'relatorio'>('situacao');

  const { data, isLoading, refetch, isFetching } = useQuery<ValidacoesResumoResponse>({
    queryKey: ['validacoes'],
    queryFn: async () => (await api.get<ValidacoesResumoResponse>('/api/validacoes')).data,
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold sm:text-3xl">
            <ShieldCheck className="h-7 w-7 text-pioneira-600 dark:text-yellow-400" />
            Validações
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {ehAdmin
              ? 'Conferência dos auditores, ressalvas apontadas e o aval do CFO.'
              : 'As funcionalidades já validadas pela auditoria. Dê seu aval de ciência em cada uma.'}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void refetch()} aria-label="Atualizar" className="shrink-0">
          <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </div>

      {/* Situação = o que está pendente agora. Relatório = a trilha completa. */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {([
          { id: 'situacao' as const, label: 'Situação atual', Icone: ShieldCheck },
          { id: 'relatorio' as const, label: 'Relatório', Icone: FileText },
        ]).map(({ id, label, Icone }) => (
          <button
            key={id}
            type="button"
            onClick={() => setAba(id)}
            className={cn(
              '-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              aba === id
                ? 'border-pioneira-500 text-pioneira-800 dark:border-yellow-400 dark:text-yellow-300'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
            )}
          >
            <Icone className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {aba === 'relatorio' && <RelatorioValidacoes />}

      {aba === 'situacao' && (
      <>
      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card className="p-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Funcionalidades</p>
            <p className="text-2xl font-semibold">{data.totais.funcionalidades}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Validadas</p>
            <p className="text-2xl font-semibold text-emerald-600 dark:text-emerald-400">{data.totais.validadas}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Com aval do CFO</p>
            <p className="text-2xl font-semibold text-pioneira-700 dark:text-yellow-400">{data.totais.avalizadas}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">Ressalvas abertas</p>
            <p className={cn('text-2xl font-semibold', data.totais.ressalvasAbertas > 0 && 'text-amber-600 dark:text-amber-400')}>
              {data.totais.ressalvasAbertas}
            </p>
          </Card>
        </div>
      )}

      {data && data.auditores.length > 0 && (
        <Card className="p-4">
          <p className="mb-2 text-sm font-medium">Auditores em conferência</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {data.auditores.map((a) => {
              // "Parado" = está na tela atual há muitos dias sem validar. 3+ dias
              // = atenção (âmbar); 7+ = travado (vermelho). Só conta se já abriu.
              const dias = a.diasNaAtual;
              const nivel = dias == null ? 'ok' : dias >= 7 ? 'travado' : dias >= 3 ? 'atencao' : 'ok';
              const naAtualLabel = dias == null
                ? (a.atualNome ? 'ainda não abriu a tela atual' : 'trilha concluída')
                : dias === 0 ? 'abriu hoje' : `há ${dias} ${dias === 1 ? 'dia' : 'dias'} na tela atual`;
              return (
                <div
                  key={a.id}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-md border p-2',
                    nivel === 'travado' ? 'border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20'
                      : nivel === 'atencao' ? 'border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20'
                      : 'border-gray-100 dark:border-gray-800',
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.nome}</p>
                    <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{a.email}</p>
                    {a.atualNome && (
                      <p className={cn(
                        'mt-0.5 flex items-center gap-1 text-[11px]',
                        nivel === 'travado' ? 'font-medium text-red-700 dark:text-red-300'
                          : nivel === 'atencao' ? 'font-medium text-amber-700 dark:text-amber-300'
                          : 'text-gray-500 dark:text-gray-400',
                      )}>
                        {(nivel === 'travado' || nivel === 'atencao') && <Clock className="h-3 w-3 shrink-0" />}
                        Em <strong>{a.atualNome}</strong> · {naAtualLabel}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                      <Badge variant="success">{a.validadas}/{a.atribuidas}</Badge>
                      {a.ressalvas > 0 && <Badge variant="warning">{a.ressalvas} ⚠</Badge>}
                    </div>
                    {nivel === 'travado' && <Badge variant="danger">parado {dias}d</Badge>}
                    {nivel === 'atencao' && <Badge variant="warning">parado {dias}d</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {isLoading && (
        <Card className="p-8 text-center text-sm text-gray-500">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Carregando…
        </Card>
      )}

      {data && data.funcionalidades.length === 0 && (
        <Card className="p-8 text-center">
          <Clock className="mx-auto h-9 w-9 text-gray-300" />
          <p className="mt-2 font-medium">Nenhuma funcionalidade validada ainda</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            A auditoria está conferindo. Assim que validarem a primeira tela, ela aparece aqui para o seu aval.
          </p>
        </Card>
      )}

      <div className="space-y-3">
        {data?.funcionalidades.map((f) => (
          <CardFuncionalidade key={f.chave} f={f} ehAdmin={ehAdmin} podeAvalizar={podeAvalizar} />
        ))}
      </div>
      </>
      )}
    </div>
  );
}
