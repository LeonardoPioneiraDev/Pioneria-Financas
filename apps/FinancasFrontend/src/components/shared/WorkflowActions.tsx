'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, MessageSquarePlus, RotateCcw, X } from 'lucide-react';
import type { WorkflowTimelineResponse } from '@pioneira/shared';
import { Button } from '@/components/ui/button';
import { api, extrairMensagemErro } from '@/lib/api';

interface WorkflowActionsProps {
  documentoTipo: string;
  documentoId: string;
  /** Se o documento ainda nao tem workflow, passa o templateId padrao pra iniciar. */
  templatePadraoId?: string;
}

export function WorkflowActions({ documentoTipo, documentoId, templatePadraoId }: WorkflowActionsProps) {
  const qc = useQueryClient();
  const queryKey = ['workflow', documentoTipo, documentoId];
  const [comentario, setComentario] = useState('');
  const [acaoAberta, setAcaoAberta] = useState<'avancar' | 'voltar' | 'comentar' | null>(null);

  const { data } = useQuery<WorkflowTimelineResponse | null>({
    queryKey,
    queryFn: async () => {
      const res = await api.get<WorkflowTimelineResponse>(
        `/api/workflow/by-documento/${encodeURIComponent(documentoTipo)}/${encodeURIComponent(documentoId)}`,
        { validateStatus: (s) => s === 200 || s === 404 },
      );
      if (res.status === 404) return null;
      return res.data;
    },
  });

  const invalidar = () => qc.invalidateQueries({ queryKey });

  const iniciar = useMutation({
    mutationFn: async () => {
      if (!templatePadraoId) throw new Error('Sem template padrao definido para este tipo');
      await api.post('/api/workflow/instances', {
        templateId: templatePadraoId,
        documentoTipo,
        documentoId,
      });
    },
    onSuccess: () => {
      toast.success('Workflow iniciado');
      invalidar();
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const avancar = useMutation({
    mutationFn: async () => {
      await api.post(`/api/workflow/instances/${data!.instance.id}/avancar`, {
        comentario: comentario || undefined,
      });
    },
    onSuccess: () => {
      toast.success('Etapa avancada');
      setComentario('');
      setAcaoAberta(null);
      invalidar();
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const voltar = useMutation({
    mutationFn: async () => {
      await api.post(`/api/workflow/instances/${data!.instance.id}/voltar`, {
        comentario,
      });
    },
    onSuccess: () => {
      toast.success('Etapa retornada');
      setComentario('');
      setAcaoAberta(null);
      invalidar();
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const comentar = useMutation({
    mutationFn: async () => {
      await api.post(`/api/workflow/instances/${data!.instance.id}/comentar`, {
        comentario,
      });
    },
    onSuccess: () => {
      toast.success('Comentario adicionado');
      setComentario('');
      setAcaoAberta(null);
      invalidar();
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  if (!data) {
    if (!templatePadraoId) return null;
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700/50 dark:bg-amber-900/20">
        <span className="text-amber-800 dark:text-amber-200">Sem workflow para este documento.</span>
        <Button size="sm" onClick={() => iniciar.mutate()} disabled={iniciar.isPending}>
          Iniciar workflow
        </Button>
      </div>
    );
  }

  if (data.instance.status !== 'em_andamento') return null;

  if (!acaoAberta) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setAcaoAberta('avancar')}>
          <ArrowRight className="h-4 w-4" /> Avancar etapa
        </Button>
        {data.instance.etapaAtualIdx > 0 && (
          <Button size="sm" variant="outline" onClick={() => setAcaoAberta('voltar')}>
            <RotateCcw className="h-4 w-4" /> Voltar etapa
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setAcaoAberta('comentar')}>
          <MessageSquarePlus className="h-4 w-4" /> Comentar
        </Button>
      </div>
    );
  }

  const pending = avancar.isPending || voltar.isPending || comentar.isPending;
  const labelBotao =
    acaoAberta === 'avancar' ? 'Confirmar avanco' : acaoAberta === 'voltar' ? 'Confirmar volta' : 'Adicionar comentario';

  return (
    <div className="space-y-2 rounded-md border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800/50">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {acaoAberta === 'avancar' ? 'Avancar etapa' : acaoAberta === 'voltar' ? 'Voltar etapa' : 'Novo comentario'}
        </span>
        <button
          type="button"
          onClick={() => {
            setAcaoAberta(null);
            setComentario('');
          }}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          aria-label="Cancelar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        placeholder={acaoAberta === 'voltar' || acaoAberta === 'comentar' ? 'Justifique...' : 'Comentario (opcional)'}
        rows={3}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-pioneira-400 focus:outline-none focus:ring-2 focus:ring-pioneira-400/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
      />
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setAcaoAberta(null);
            setComentario('');
          }}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (acaoAberta === 'avancar') avancar.mutate();
            else if (acaoAberta === 'voltar') voltar.mutate();
            else comentar.mutate();
          }}
          disabled={
            pending ||
            ((acaoAberta === 'voltar' || acaoAberta === 'comentar') && comentario.trim().length === 0)
          }
        >
          {labelBotao}
        </Button>
      </div>
    </div>
  );
}
