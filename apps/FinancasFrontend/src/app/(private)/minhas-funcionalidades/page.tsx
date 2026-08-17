'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ListChecks, CheckCircle2, Lock, Loader2, ArrowRight, Clock, ExternalLink, PlayCircle, Sparkles,
  AlertTriangle, MessageSquareReply, Paperclip, X,
} from 'lucide-react';
import { FUNCIONALIDADES } from '@pioneira/shared/enums/funcionalidades';
import { ANEXO_MAX_ARQUIVOS, ANEXO_MAX_BYTES, ANEXO_MIME_PERMITIDOS, OBSERVACOES_MIN } from '@pioneira/shared/enums/validacao';
import type { ConferirResponse, MinhasValidacoesResponse, RegistroValidacao } from '@pioneira/shared/schemas/validacoes';
import { useAuth } from '@/contexts/AuthContext';
import { useBranding } from '@/hooks/useBranding';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { api, extrairMensagemErro } from '@/lib/api';
import { cn } from '@/lib/utils';
import { AnexosPreview } from '@/components/shared/AnexosPreview';

function fmt(d: Date): string {
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** "45 min" · "2h" · "1h 30min". */
function formatDuracao(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}min`;
}

/** O que o usuário está prestes a registrar. */
interface Confirmacao { chave: string; nome: string; status: 'validado' | 'reprovado' }

export default function MinhasFuncionalidadesPage() {
  const { user, refresh } = useAuth();
  const { minutosValidacao } = useBranding();
  const qc = useQueryClient();
  const [confirmar, setConfirmar] = useState<Confirmacao | null>(null);
  const [observacoes, setObservacoes] = useState('');
  const [anexos, setAnexos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // "Tick" só pra forçar re-render: a contagem regressiva anda sozinha na tela
  // (Date.now() é reavaliado a cada 30s), sem precisar recarregar a página.
  const [, setTick] = useState(0);

  // Atualiza o progresso ao abrir (pega 1º acesso recém-registrado ao navegar).
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const { data: minhas } = useQuery<MinhasValidacoesResponse>({
    queryKey: ['validacoes', 'minhas'],
    queryFn: async () => (await api.get<MinhasValidacoesResponse>('/api/validacoes/minhas')).data,
    enabled: !!user?.liberacaoProgressiva,
  });

  /** Ressalvas do próprio usuário, da mais recente para a mais antiga, por funcionalidade. */
  const ressalvasPorChave = useMemo(() => {
    const mapa = new Map<string, RegistroValidacao[]>();
    for (const r of minhas?.historico ?? []) {
      if (r.tipo !== 'conferencia' || r.status !== 'reprovado') continue;
      const lista = mapa.get(r.funcionalidade) ?? [];
      lista.push(r);
      mapa.set(r.funcionalidade, lista);
    }
    return mapa;
  }, [minhas]);

  const conferir = useMutation({
    mutationFn: async (v: Confirmacao & { observacoes: string; anexosDataUri: string[] }) =>
      (await api.post<ConferirResponse>('/api/validacoes/conferir', {
        chave: v.chave,
        status: v.status,
        observacoes: v.observacoes.trim() || undefined,
        anexosDataUri: v.anexosDataUri.length > 0 ? v.anexosDataUri : undefined,
      })).data,
    onSuccess: async (_res, v) => {
      toast.success(
        v.status === 'validado'
          ? 'Funcionalidade validada — a próxima foi liberada no seu menu.'
          : 'Ressalva registrada — o administrador foi notificado na tela de Validações.',
      );
      setConfirmar(null);
      setObservacoes('');
      setAnexos([]);
      await qc.invalidateQueries({ queryKey: ['validacoes'] });
      await refresh();
    },
    onError: (err) => toast.error('Não foi possível registrar', { description: extrairMensagemErro(err) }),
  });

  /** Converte os prints escolhidos em data-URI base64 (mesmo padrão do logo em Parâmetros). */
  function onArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    if (anexos.length + files.length > ANEXO_MAX_ARQUIVOS) {
      toast.error(`No máximo ${ANEXO_MAX_ARQUIVOS} anexos por registro.`);
      return;
    }
    for (const file of files) {
      if (!(ANEXO_MIME_PERMITIDOS as readonly string[]).includes(file.type)) {
        toast.error(`Formato não suportado (${file.name}) — envie PNG, JPG ou WebP.`);
        continue;
      }
      if (file.size > ANEXO_MAX_BYTES) {
        toast.error(`${file.name} acima do limite de ${Math.round(ANEXO_MAX_BYTES / 1024 / 1024)} MB.`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => setAnexos((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    }
  }

  if (!user) return null;

  if (!user.liberacaoProgressiva) {
    return (
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <Card className="p-8 text-center">
          <ListChecks className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 font-medium">Você tem acesso completo pelo seu papel</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Não está em trilha de conferência — todas as suas funcionalidades já aparecem no menu.</p>
        </Card>
      </div>
    );
  }

  const atrib = new Set(user.funcionalidadesAtribuidas);
  const valid = new Set(user.funcionalidadesValidadas);
  const lib = new Set(user.funcionalidadesLiberadas);
  const daTrilha = FUNCIONALIDADES.filter((f) => atrib.has(f.chave));
  const total = daTrilha.length;
  const feitas = daTrilha.filter((f) => valid.has(f.chave)).length;
  const pct = total > 0 ? Math.round((feitas / total) * 100) : 0;
  const minMs = minutosValidacao * 60_000;
  const concluiuTudo = total > 0 && feitas === total;
  const obsObrigatoria = confirmar?.status === 'reprovado';
  const obsCurta = obsObrigatoria && observacoes.trim().length < OBSERVACOES_MIN;
  const passos: ReadonlyArray<{ n: number; texto: string }> = [
    { n: 1, texto: 'Abra a funcionalidade pelo menu e confira os números.' },
    { n: 2, texto: `Use por pelo menos ${formatDuracao(minutosValidacao)} antes de validar.` },
    { n: 3, texto: 'Se estiver tudo certo, clique em “Validar”. Se achou erro, clique em “Não validar” e descreva o problema.' },
    { n: 4, texto: 'Validando, a próxima funcionalidade é liberada no seu menu.' },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <ListChecks className="h-6 w-6 text-pioneira-600 dark:text-yellow-400" />
          Minhas funcionalidades
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Confira cada tela e registre se os dados estão corretos. Validando, a próxima é liberada.
        </p>
      </div>

      {/* Como funciona */}
      <Card className="border-l-4 border-l-pioneira-400 bg-pioneira-50/50 p-4 dark:border-l-yellow-600 dark:bg-yellow-950/20">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300">Como funciona</p>
        <ol className="space-y-1.5">
          {passos.map((p) => (
            <li key={p.n} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-pioneira-200 text-[11px] font-bold text-pioneira-900 dark:bg-yellow-800/60 dark:text-yellow-100">{p.n}</span>
              <span>{p.texto}</span>
            </li>
          ))}
        </ol>
      </Card>

      {/* Progresso */}
      <Card className="p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Seu progresso</span>
          <span className="text-gray-500 dark:text-gray-400">{feitas} de {total} validadas · {pct}%</span>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
          <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        {concluiuTudo && (
          <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <Sparkles className="h-4 w-4" /> Tudo validado! Todas as suas funcionalidades estão liberadas no menu.
          </p>
        )}
      </Card>

      {/* Trilha */}
      <div className="space-y-2">
        {daTrilha.length === 0 && (
          <Card className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhuma funcionalidade atribuída ainda. Fale com o administrador.
          </Card>
        )}
        {daTrilha.map((f, i) => {
          const validado = valid.has(f.chave);
          const liberado = lib.has(f.chave);
          const atual = liberado && !validado; // a etapa em andamento
          const prog = user.progressoFuncionalidades[f.chave];
          const primeiroAcesso = prog?.primeiroAcessoEm ? new Date(prog.primeiroAcessoEm) : null;
          const validadoEm = prog?.validadoEm ? new Date(prog.validadoEm) : null;
          const msDesde = primeiroAcesso ? Date.now() - primeiroAcesso.getTime() : null;
          const cumpriuTempo = msDesde !== null && msDesde >= minMs;
          const restanteMin = msDesde !== null && msDesde < minMs ? Math.max(1, Math.ceil((minMs - msDesde) / 60_000)) : null;
          const restanteLabel = restanteMin !== null ? formatDuracao(restanteMin) : '';
          const tempoPct = msDesde !== null ? Math.min(100, Math.round((msDesde / minMs) * 100)) : 0;
          const minhasRessalvas = ressalvasPorChave.get(f.chave) ?? [];
          const ressalvaAberta = atual && minhasRessalvas.length > 0;

          return (
            <Card
              key={f.chave}
              className={cn(
                'p-3',
                atual && !ressalvaAberta && 'border-pioneira-300 ring-1 ring-pioneira-200 dark:border-yellow-800 dark:ring-yellow-900/40',
                ressalvaAberta && 'border-amber-300 ring-1 ring-amber-200 dark:border-amber-800 dark:ring-amber-900/40',
                !liberado && !validado && 'opacity-70',
              )}
            >
              <div className="flex items-center gap-3">
                {validado ? (
                  <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" />
                ) : ressalvaAberta ? (
                  <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" />
                ) : atual ? (
                  <PlayCircle className="h-6 w-6 shrink-0 text-pioneira-600 dark:text-yellow-400" />
                ) : (
                  <Lock className="h-6 w-6 shrink-0 text-gray-300 dark:text-gray-600" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-gray-400">{i + 1}.</span>
                    <p className={cn('font-medium', !liberado && !validado && 'text-gray-500 dark:text-gray-400')}>{f.nome}</p>
                    {atual && (
                      <span className={cn(
                        'rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white',
                        ressalvaAberta ? 'bg-amber-500' : 'bg-pioneira-600 dark:bg-yellow-600 dark:text-gray-900',
                      )}>
                        {ressalvaAberta ? 'com ressalva' : 'agora'}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[12px] text-gray-500 dark:text-gray-400">
                    {validado && `✓ Validada${validadoEm ? ` em ${fmt(validadoEm)}` : ''}`}
                    {!validado && !atual && 'Bloqueada — valide as anteriores primeiro'}
                    {atual && !primeiroAcesso && 'Passo 1: abra a funcionalidade para começar a contar o tempo'}
                    {atual && primeiroAcesso && !cumpriuTempo && `Passo 2: conferindo · faltam ~${restanteLabel} para poder validar (1º acesso ${fmt(primeiroAcesso)})`}
                    {atual && cumpriuTempo && 'Passo 3: valide, ou registre o que está errado'}
                  </p>
                </div>

                {/* Ação da etapa atual */}
                {atual && !primeiroAcesso && (
                  <Link href={f.chave}>
                    <Button size="sm" variant="outline"><ExternalLink className="h-3.5 w-3.5" /> Abrir</Button>
                  </Link>
                )}
                {atual && primeiroAcesso && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Link href={f.chave}><Button size="sm" variant="ghost" title="Abrir a funcionalidade"><ExternalLink className="h-3.5 w-3.5" /></Button></Link>
                    <Button
                      size="sm"
                      variant="outline"
                      title="Encontrei algo errado nesta tela"
                      onClick={() => { setConfirmar({ chave: f.chave, nome: f.nome, status: 'reprovado' }); setObservacoes(''); setAnexos([]); }}
                      disabled={conferir.isPending}
                    >
                      Não validar
                    </Button>
                    <Button
                      size="sm"
                      disabled={!cumpriuTempo || conferir.isPending}
                      onClick={() => { setConfirmar({ chave: f.chave, nome: f.nome, status: 'validado' }); setObservacoes(''); setAnexos([]); }}
                    >
                      {cumpriuTempo ? <>Validar <ArrowRight className="h-3.5 w-3.5" /></> : <><Clock className="h-3.5 w-3.5" /> ~{restanteLabel}</>}
                    </Button>
                  </div>
                )}
              </div>

              {/* Barra do tempo mínimo (só na etapa atual em contagem) */}
              {atual && primeiroAcesso && !cumpriuTempo && (
                <div className="mt-2 pl-9">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                    <div className="h-full bg-pioneira-400 transition-all dark:bg-yellow-600" style={{ width: `${tempoPct}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-gray-400">Tempo mínimo de análise: {formatDuracao(minutosValidacao)}</p>
                </div>
              )}

              {/* Ressalvas que EU registrei nesta funcionalidade + resposta do admin */}
              {minhasRessalvas.length > 0 && (
                <div className="mt-2 space-y-1.5 pl-9">
                  {minhasRessalvas.map((r) => (
                    <div key={r.id} className="rounded-md border border-amber-200 bg-amber-50/60 p-2 text-[12px] dark:border-amber-900 dark:bg-amber-950/20">
                      <p className="text-amber-900 dark:text-amber-200">
                        <span className="font-medium">Você apontou</span> em {fmt(new Date(r.criadoEm))}: “{r.observacoes}”
                      </p>
                      {r.anexosDataUri.length > 0 && (
                        <div className="mt-1.5">
                          <AnexosPreview anexos={r.anexosDataUri} />
                        </div>
                      )}
                      {r.respostaAdmin ? (
                        <p className="mt-1 flex items-start gap-1.5 rounded bg-white/70 px-2 py-1 text-gray-700 dark:bg-gray-900/60 dark:text-gray-200">
                          <MessageSquareReply className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>
                            <span className="font-medium">{r.respondidoPorNome ?? 'Administrador'}:</span> {r.respostaAdmin}
                            {r.respondidoEm && <span className="ml-1 text-gray-400">({fmt(new Date(r.respondidoEm))})</span>}
                          </span>
                        </p>
                      ) : (
                        <p className="mt-1 text-[11px] italic text-amber-700 dark:text-amber-300">Aguardando correção do administrador.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <Dialog open={!!confirmar} onOpenChange={(v) => { if (!v) { setConfirmar(null); setObservacoes(''); setAnexos([]); } }}>
        <DialogContent className="mx-3 w-[calc(100%-1.5rem)] max-w-md sm:w-full">
          <DialogHeader>
            <DialogTitle>
              {obsObrigatoria ? `O que está errado em “${confirmar?.nome}”?` : `Validar “${confirmar?.nome}”`}
            </DialogTitle>
            <DialogDescription>
              {obsObrigatoria ? (
                <>Descreva o problema encontrado. A funcionalidade <strong>não</strong> será validada e o administrador vê a
                sua observação. Quando for corrigida, você pode validar aqui mesmo.</>
              ) : (
                <>Ao validar, você declara que <strong>conferiu os dados</strong> desta tela e estão corretos. A <strong>próxima</strong> da
                sua sequência será liberada no menu.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="observacoes" className="text-sm font-medium">
              {obsObrigatoria ? 'Observações' : <>Observações <span className="font-normal text-gray-400">(opcional)</span></>}
            </label>
            <textarea
              id="observacoes"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder={obsObrigatoria
                ? 'Ex.: o total de janeiro está R$ 12 mil acima do que temos no Globus; a coluna de vencimento repete a data de emissão…'
                : 'Sugestões, pontos de atenção, o que ficou confuso…'}
              className="w-full resize-y rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pioneira-400 dark:border-gray-700 dark:bg-gray-900 dark:focus:ring-yellow-500"
            />
            {obsCurta ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">Mínimo {OBSERVACOES_MIN} caracteres — descreva o problema.</p>
            ) : (
              <p className="text-[11px] text-gray-400">Seu comentário fica registrado e visível para o administrador e o CFO.</p>
            )}
          </div>

          {obsObrigatoria && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Prints <span className="font-normal text-gray-400">(opcional)</span></label>
              <input
                ref={fileInputRef}
                type="file"
                accept={ANEXO_MIME_PERMITIDOS.join(',')}
                multiple
                onChange={onArquivo}
                className="hidden"
              />
              {anexos.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {anexos.map((src, idx) => (
                    <div key={idx} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="Print anexado" className="h-16 w-auto rounded border border-gray-200 dark:border-gray-700" />
                      <button
                        type="button"
                        onClick={() => setAnexos((prev) => prev.filter((_, i) => i !== idx))}
                        title="Remover anexo"
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-700 text-white shadow hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-800"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {anexos.length < ANEXO_MAX_ARQUIVOS && (
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-3.5 w-3.5" /><span className="ml-1">Anexar print{anexos.length > 0 ? 's' : ''}</span>
                </Button>
              )}
              <p className="text-[11px] text-gray-400">PNG, JPG ou WebP, até {Math.round(ANEXO_MAX_BYTES / 1024 / 1024)} MB cada — até {ANEXO_MAX_ARQUIVOS} arquivos.</p>
            </div>
          )}

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
            <Button variant="outline" onClick={() => { setConfirmar(null); setObservacoes(''); setAnexos([]); }} disabled={conferir.isPending} className="w-full sm:w-auto">Cancelar</Button>
            <Button
              onClick={() => confirmar && conferir.mutate({ ...confirmar, observacoes, anexosDataUri: anexos })}
              disabled={conferir.isPending || obsCurta}
              className="w-full sm:w-auto"
            >
              {conferir.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : obsObrigatoria ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              <span className="ml-1">{obsObrigatoria ? 'Registrar problema' : 'Confirmar validação'}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
