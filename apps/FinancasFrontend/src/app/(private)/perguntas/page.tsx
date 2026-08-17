'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HelpCircle, MessageSquare, CheckCircle2, Clock, Plus, Send, Pencil, Archive, X } from 'lucide-react';
import type { PerguntasListResponse } from '@pioneira/shared/schemas/perguntas';
import { todasPerguntasFinanceiro } from '@/lib/module-status';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { api, extrairMensagemErro } from '@/lib/api';
import { formatarDataHoraCurto } from '@/lib/datetime';

type FiltroStatus = 'aberta' | 'respondida' | 'todas';
const FILTROS: ReadonlyArray<{ key: FiltroStatus; label: string }> = [
  { key: 'aberta', label: 'Abertas' },
  { key: 'respondida', label: 'Respondidas' },
  { key: 'todas', label: 'Todas' },
];

interface MergedPergunta {
  chave: string;
  modulo: string | null;
  moduloNome: string | null;
  pergunta: string;
  contexto: string | null;
  resposta: string | null;
  status: string;
  respondidoPorNome: string | null;
  respondidoEm: string | null;
  avulsa: boolean;
}

export default function PerguntasPage() {
  return (
    <Suspense fallback={null}>
      <PerguntasContent />
    </Suspense>
  );
}

function PerguntasContent() {
  const [status, setStatus] = useState<FiltroStatus>('aberta');
  const [novaAberta, setNovaAberta] = useState(false);
  const searchParams = useSearchParams();
  const moduloFiltro = searchParams.get('modulo');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<PerguntasListResponse>({
    queryKey: ['perguntas'],
    queryFn: async () => (await api.get<PerguntasListResponse>('/api/perguntas')).data,
  });

  const responder = useMutation({
    mutationFn: async (p: { m: MergedPergunta; resposta: string }) => {
      const res = await api.put('/api/perguntas/responder', {
        chave: p.m.chave,
        pergunta: p.m.pergunta,
        modulo: p.m.modulo,
        moduloNome: p.m.moduloNome,
        contexto: p.m.contexto,
        resposta: p.resposta,
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Resposta salva');
      void qc.invalidateQueries({ queryKey: ['perguntas'] });
    },
    onError: (err) => toast.error('Falha ao salvar', { description: extrairMensagemErro(err) }),
  });

  const arquivar = useMutation({
    mutationFn: async (chave: string) => (await api.patch('/api/perguntas/arquivar', { chave })).data,
    onSuccess: () => {
      toast.success('Pergunta arquivada');
      void qc.invalidateQueries({ queryKey: ['perguntas'] });
    },
    onError: (err) => toast.error('Falha ao arquivar', { description: extrairMensagemErro(err) }),
  });

  // Perguntas do roadmap (fonte única) + respostas do banco, casadas por chave.
  const roadmap = todasPerguntasFinanceiro();
  const roadmapChaves = new Set(roadmap.map((r) => r.chave));
  const dbItens = data?.itens ?? [];
  const dbPorChave = new Map(dbItens.filter((i) => i.chave).map((i) => [i.chave as string, i]));

  const merged: MergedPergunta[] = [];
  for (const r of roadmap) {
    const db = dbPorChave.get(r.chave);
    if (db?.status === 'arquivada') continue;
    merged.push({
      chave: r.chave,
      modulo: r.modulo,
      moduloNome: r.moduloNome,
      pergunta: r.pergunta,
      contexto: db?.contexto ?? null,
      resposta: db?.resposta ?? null,
      status: db?.resposta ? 'respondida' : 'aberta',
      respondidoPorNome: db?.respondidoPorNome ?? null,
      respondidoEm: db?.respondidoEm ?? null,
      avulsa: false,
    });
  }
  // Perguntas avulsas (não vêm do roadmap).
  for (const db of dbItens) {
    if (db.status === 'arquivada' || (db.chave && roadmapChaves.has(db.chave))) continue;
    merged.push({
      chave: db.chave ?? db.id,
      modulo: db.modulo,
      moduloNome: db.moduloNome,
      pergunta: db.pergunta,
      contexto: db.contexto,
      resposta: db.resposta,
      status: db.resposta ? 'respondida' : 'aberta',
      respondidoPorNome: db.respondidoPorNome,
      respondidoEm: db.respondidoEm,
      avulsa: true,
    });
  }

  const totais = {
    abertas: merged.filter((m) => m.status === 'aberta').length,
    respondidas: merged.filter((m) => m.status === 'respondida').length,
  };

  // Filtros de visualização.
  let visiveis = merged;
  if (moduloFiltro) visiveis = visiveis.filter((m) => m.modulo === moduloFiltro);
  if (status !== 'todas') visiveis = visiveis.filter((m) => m.status === status);

  const grupos = new Map<string, MergedPergunta[]>();
  for (const m of visiveis) {
    const chave = m.moduloNome ?? 'Geral';
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(m);
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <HelpCircle className="h-6 w-6 text-pioneira-700 dark:text-yellow-400" />
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent">
              Perguntas ao Financeiro
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed max-w-3xl">
            Decisões pendentes que o sistema precisa do financeiro/contabilidade para avançar (regime tributário,
            políticas de retenção, fontes de dado). São as mesmas perguntas que aparecem em cada módulo — responda
            aqui e a resposta fica registrada, destravando o item. O sistema reflete o que vocês definirem.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setNovaAberta((v) => !v)}>
          <Plus className="h-4 w-4" /> Nova pergunta
        </Button>
      </div>

      {moduloFiltro && (
        <div className="flex items-center gap-2 text-sm">
          <Badge variant="muted" className="text-xs">filtrando pelo módulo <span className="font-mono ml-1">{moduloFiltro}</span></Badge>
          <Link href="/perguntas" className="inline-flex items-center gap-1 text-pioneira-700 dark:text-yellow-400 hover:underline">
            <X className="h-3 w-3" /> ver todas
          </Link>
        </div>
      )}

      {novaAberta && <NovaPergunta onClose={() => setNovaAberta(false)} />}

      <Card className="p-2 flex items-center gap-2 flex-wrap">
        <div className="flex gap-1">
          {FILTROS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatus(key)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                status === key
                  ? 'bg-pioneira-100 dark:bg-yellow-950/40 text-pioneira-900 dark:text-yellow-200'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 pr-2">
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-amber-500" /> {totais.abertas} abertas</span>
          <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {totais.respondidas} respondidas</span>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-12 text-center text-gray-500 dark:text-gray-400">
          <div className="animate-spin rounded-full h-8 w-8 border-4 border-transparent border-t-[#e6cd4a] dark:border-t-yellow-400 mx-auto mb-3" />
          Carregando perguntas…
        </Card>
      ) : visiveis.length === 0 ? (
        <Card className="p-12 text-center text-gray-500 dark:text-gray-400">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-400" />
          Nenhuma pergunta {status === 'aberta' ? 'em aberto' : status === 'respondida' ? 'respondida' : ''} aqui.
        </Card>
      ) : (
        <div className="space-y-6">
          {[...grupos.entries()].map(([modulo, lista]) => (
            <div key={modulo}>
              <h2 className="text-sm font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-2">{modulo}</h2>
              <div className="space-y-3">
                {lista.map((m) => (
                  <PerguntaCard
                    key={m.chave}
                    pergunta={m}
                    salvando={responder.isPending}
                    onResponder={(resposta) => responder.mutate({ m, resposta })}
                    onArquivar={() => arquivar.mutate(m.chave)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PerguntaCard({
  pergunta,
  salvando,
  onResponder,
  onArquivar,
}: {
  pergunta: MergedPergunta;
  salvando: boolean;
  onResponder: (resposta: string) => void;
  onArquivar: () => void;
}) {
  const respondida = pergunta.status === 'respondida';
  const [editando, setEditando] = useState(!respondida);
  const [texto, setTexto] = useState(pergunta.resposta ?? '');

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            {respondida ? (
              <Badge variant="muted" className="text-[10px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3 w-3 mr-0.5" /> respondida
              </Badge>
            ) : (
              <Badge variant="muted" className="text-[10px] bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
                <Clock className="h-3 w-3 mr-0.5" /> aguardando
              </Badge>
            )}
            {pergunta.avulsa && <Badge variant="muted" className="text-[10px]">avulsa</Badge>}
          </div>
          <p className="font-semibold text-pioneira-900 dark:text-yellow-100">{pergunta.pergunta}</p>
          {pergunta.contexto && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
              <span className="font-medium">Por que perguntamos:</span> {pergunta.contexto}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onArquivar}
          title="Arquivar (não se aplica)"
          className="shrink-0 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400"
        >
          <Archive className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3">
        {respondida && !editando ? (
          <div className="rounded-lg border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-3">
            <div className="flex items-start gap-2">
              <MessageSquare className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{pergunta.resposta}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
                  {pergunta.respondidoPorNome && <>respondido por <strong>{pergunta.respondidoPorNome}</strong></>}
                  {pergunta.respondidoEm && <> · {formatarDataHoraCurto(pergunta.respondidoEm)}</>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setTexto(pergunta.resposta ?? ''); setEditando(true); }}
                className="shrink-0 text-xs text-pioneira-700 dark:text-yellow-400 hover:underline inline-flex items-center gap-1"
              >
                <Pencil className="h-3 w-3" /> editar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              placeholder="Escreva a resposta / decisão do financeiro aqui…"
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-pioneira-400 dark:focus:ring-yellow-500"
            />
            <div className="flex items-center gap-2 justify-end">
              {respondida && (
                <Button variant="ghost" size="sm" onClick={() => setEditando(false)}>Cancelar</Button>
              )}
              <Button
                size="sm"
                disabled={salvando || texto.trim().length === 0}
                onClick={() => { onResponder(texto.trim()); setEditando(false); }}
              >
                <Send className="h-3.5 w-3.5" /> {respondida ? 'Atualizar resposta' : 'Salvar resposta'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function NovaPergunta({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [pergunta, setPergunta] = useState('');
  const [contexto, setContexto] = useState('');
  const [moduloNome, setModuloNome] = useState('');

  const criar = useMutation({
    mutationFn: async () => (await api.post('/api/perguntas', {
      pergunta: pergunta.trim(),
      contexto: contexto.trim() || undefined,
      moduloNome: moduloNome.trim() || undefined,
    })).data,
    onSuccess: () => {
      toast.success('Pergunta criada');
      void qc.invalidateQueries({ queryKey: ['perguntas'] });
      onClose();
    },
    onError: (err) => toast.error('Falha ao criar', { description: extrairMensagemErro(err) }),
  });

  return (
    <Card className="p-4 border-pioneira-300 dark:border-yellow-800 space-y-2">
      <p className="text-sm font-semibold text-pioneira-900 dark:text-yellow-200">Nova pergunta</p>
      <textarea
        value={pergunta}
        onChange={(e) => setPergunta(e.target.value)}
        rows={2}
        placeholder="Pergunta…"
        className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm resize-y"
      />
      <textarea
        value={contexto}
        onChange={(e) => setContexto(e.target.value)}
        rows={2}
        placeholder="Contexto (por que perguntamos / o que destrava) — opcional"
        className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm resize-y"
      />
      <Input value={moduloNome} onChange={(e) => setModuloNome(e.target.value)} placeholder="Módulo (ex.: Tributos) — opcional" className="h-9 text-sm" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
        <Button size="sm" disabled={criar.isPending || pergunta.trim().length < 3} onClick={() => criar.mutate()}>Criar</Button>
      </div>
    </Card>
  );
}
