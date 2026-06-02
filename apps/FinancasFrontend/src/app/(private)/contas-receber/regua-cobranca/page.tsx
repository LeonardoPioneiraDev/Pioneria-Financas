'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, Bell, Edit2, Info, Loader2, Mail, MessageSquare, Play, Plus, Smartphone,
} from 'lucide-react';
import type {
  ReguaCanal,
  ReguaEnvio,
  ReguaEnviosListResponse,
  ReguaSimularResponse,
  ReguaTemplate,
  ReguaTemplateCreate,
  ReguaTemplatesListResponse,
  ReguaTom,
} from '@pioneira/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, extrairMensagemErro } from '@/lib/api';
import { cn } from '@/lib/utils';

const CANAL_ICON: Record<ReguaCanal, typeof Mail> = {
  email: Mail,
  whatsapp: MessageSquare,
  sms: Smartphone,
};

const TOM_BADGE: Record<ReguaTom, 'default' | 'success' | 'warning' | 'danger' | 'muted'> = {
  cordial: 'success',
  formal: 'default',
  severo: 'danger',
};

function dataHoraFmt(d: string): string {
  return format(new Date(d), 'dd/MM/yyyy HH:mm');
}

function gatilhoLabel(dias: number): string {
  if (dias < 0) return `${Math.abs(dias)}d ANTES do vencimento`;
  if (dias === 0) return 'NO DIA do vencimento';
  return `${dias}d APOS o vencimento`;
}

type Aba = 'templates' | 'historico';

export default function ReguaCobrancaPage() {
  const qc = useQueryClient();
  const [aba, setAba] = useState<Aba>('templates');
  const [editando, setEditando] = useState<ReguaTemplate | null>(null);
  const [criando, setCriando] = useState(false);

  const templates = useQuery<ReguaTemplatesListResponse>({
    queryKey: ['regua-cobranca', 'templates'],
    queryFn: async () => (await api.get<ReguaTemplatesListResponse>('/api/regua-cobranca/templates')).data,
  });

  const envios = useQuery<ReguaEnviosListResponse>({
    queryKey: ['regua-cobranca', 'envios'],
    queryFn: async () => (await api.get<ReguaEnviosListResponse>('/api/regua-cobranca/envios')).data,
  });

  const simular = useMutation<ReguaSimularResponse>({
    mutationFn: async () => (await api.post<ReguaSimularResponse>('/api/regua-cobranca/simular')).data,
    onSuccess: (r) => {
      toast.success(
        `${r.enviosGerados} envios gerados de ${r.crsAnalisados} CRs (${r.duracaoMs}ms)`,
        { description: r.enviosPulados > 0 ? `${r.enviosPulados} pulados (ja enviados hoje)` : undefined },
      );
      qc.invalidateQueries({ queryKey: ['regua-cobranca'] });
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const toggleAtivo = useMutation<ReguaTemplate, unknown, { id: string; ativo: boolean }>({
    mutationFn: async ({ id, ativo }) =>
      (await api.patch<ReguaTemplate>(`/api/regua-cobranca/templates/${id}`, { ativo })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['regua-cobranca', 'templates'] }),
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  const itens = templates.data?.itens ?? [];
  const enviosList = envios.data?.itens ?? [];
  const ativos = itens.filter((t) => t.ativo).length;

  return (
    <div className="space-y-6">
      <Link href="/contas-receber" className="text-pioneira-700 dark:text-yellow-400 hover:underline inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="h-3 w-3" /> Voltar pra Contas a Receber
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent flex items-center gap-3">
            <Bell className="h-7 w-7 text-pioneira-700 dark:text-yellow-400" />
            Regua de Cobranca
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1 text-sm">
            Templates configuraveis pra enviar comunicacoes automatizadas conforme dias vencidos.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => simular.mutate()} disabled={simular.isPending} variant="outline" size="sm">
            {simular.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
            Simular envios agora
          </Button>
          <Button onClick={() => setCriando(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Novo template
          </Button>
        </div>
      </div>

      <Card className="p-4 border-l-4 border-l-amber-400 bg-amber-50/40 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
          <div className="text-sm text-gray-700 dark:text-gray-200">
            <strong className="text-amber-800 dark:text-amber-200">Versao em validacao com financeiro:</strong>{' '}
            modo SIMULADO — envios sao registrados no banco (log de auditoria) mas nenhum email/WhatsApp eh
            enviado de verdade. Apos confirmar provedor (Mailhog ja funciona em dev; WhatsApp Business depende
            de contrato Twilio/Zenvia), trocamos pra modo &apos;real&apos;.
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Templates</p>
          <p className="text-3xl font-bold mt-1">{itens.length}</p>
          <p className="text-[10px] text-gray-500">{ativos} ativos</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wider text-gray-500 font-bold">Envios (ultimos 200)</p>
          <p className="text-3xl font-bold mt-1">{enviosList.length}</p>
        </Card>
      </div>

      <Tabs value={aba} onValueChange={(v) => setAba(v as Aba)}>
        <TabsList>
          <TabsTrigger value="templates" icon={<Bell className="h-3.5 w-3.5" />}>Templates</TabsTrigger>
          <TabsTrigger value="historico" icon={<Mail className="h-3.5 w-3.5" />}>Historico</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-3">
          {templates.isLoading && (
            <Card className="p-10 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-pioneira-600" />
            </Card>
          )}
          {itens.map((t) => {
            const CanalIcon = CANAL_ICON[t.canal];
            return (
              <Card key={t.id} className={cn('p-4', !t.ativo && 'opacity-50')}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CanalIcon className="h-4 w-4 text-gray-500 shrink-0" />
                      <strong>{t.nome}</strong>
                      <Badge variant={TOM_BADGE[t.tom]} className="text-[9px]">{t.tom}</Badge>
                      <Badge variant="muted" className="text-[9px]">{t.canal}</Badge>
                      {!t.ativo && <Badge variant="danger" className="text-[9px]">desativado</Badge>}
                    </div>
                    <p className="text-xs text-gray-500">
                      Gatilho: <strong>{gatilhoLabel(t.gatilhoDiasVencimento)}</strong>
                    </p>
                    {t.assunto && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 font-mono italic">
                        Assunto: {t.assunto}
                      </p>
                    )}
                    <p className="text-xs text-gray-600 dark:text-gray-300 whitespace-pre-line line-clamp-3 mt-1">
                      {t.corpoTemplate}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => setEditando(t)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleAtivo.mutate({ id: t.id, ativo: !t.ativo })}
                    >
                      {t.ativo ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="historico" className="space-y-2">
          {envios.isLoading && <Card className="p-10 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></Card>}
          {enviosList.length === 0 && !envios.isLoading && (
            <Card className="p-10 text-center space-y-3">
              <Mail className="h-10 w-10 mx-auto text-gray-400" />
              <h3 className="text-lg font-semibold">Sem envios ainda</h3>
              <p className="text-sm text-gray-500 max-w-md mx-auto">
                Clique em <strong>&quot;Simular envios agora&quot;</strong> pra rodar a regua com a base atual de CRs.
                Templates ativos com gatilho que bata com dias_vencidos sao disparados.
              </p>
            </Card>
          )}
          {enviosList.map((e: ReguaEnvio) => (
            <Card key={e.id} className="p-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="muted" className="text-[9px]">{e.canal}</Badge>
                    <strong className="text-sm">{e.templateNome}</strong>
                    <Badge variant={e.modo === 'simulado' ? 'warning' : 'success'} className="text-[9px]">
                      {e.modo}
                    </Badge>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Pra: <span className="font-mono">{e.destinatario}</span> ·{' '}
                    CR {e.numeroDocumentoCr ?? '-'} ({e.fornecedorClienteRazaoSocial ?? 'sem cliente'}) ·{' '}
                    {e.diasVencidosNoEnvio >= 0
                      ? `${e.diasVencidosNoEnvio}d vencidos`
                      : `${Math.abs(e.diasVencidosNoEnvio)}d antes`}
                  </div>
                  {e.assunto && (
                    <div className="text-xs text-gray-600 dark:text-gray-300 mt-1 italic">{e.assunto}</div>
                  )}
                </div>
                <div className="text-right text-[11px] text-gray-500">
                  {dataHoraFmt(e.enviadoEm)}
                  <Badge variant={e.status === 'enviado' ? 'success' : e.status === 'falha' ? 'danger' : 'default'} className="text-[9px] ml-2">
                    {e.status}
                  </Badge>
                </div>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {(criando || editando) && (
        <TemplateModal
          template={editando}
          onClose={() => {
            setCriando(false);
            setEditando(null);
          }}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['regua-cobranca', 'templates'] });
            setCriando(false);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function TemplateModal({
  template,
  onClose,
  onSaved,
}: {
  template: ReguaTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ReguaTemplateCreate>({
    nome: template?.nome ?? '',
    canal: template?.canal ?? 'email',
    gatilhoDiasVencimento: template?.gatilhoDiasVencimento ?? 5,
    assunto: template?.assunto ?? '',
    corpoTemplate: template?.corpoTemplate ?? 'Ola {{nome_cliente}},\n\nO titulo {{numero_documento}} ({{valor}}) venceu em {{data_vencimento}}.\n\nViacao Pioneira',
    ativo: template?.ativo ?? true,
    tom: template?.tom ?? 'cordial',
  });

  const salvar = useMutation<ReguaTemplate, unknown, ReguaTemplateCreate>({
    mutationFn: async (body) => {
      if (template) {
        return (await api.patch<ReguaTemplate>(`/api/regua-cobranca/templates/${template.id}`, body)).data;
      }
      return (await api.post<ReguaTemplate>('/api/regua-cobranca/templates', body)).data;
    },
    onSuccess: () => {
      toast.success(template ? 'Template atualizado' : 'Template criado');
      onSaved();
    },
    onError: (err) => toast.error(extrairMensagemErro(err)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'Editar template' : 'Novo template'}</DialogTitle>
          <DialogDescription>
            Variaveis disponiveis: {'{{nome_cliente}}'}, {'{{numero_documento}}'}, {'{{valor}}'},{' '}
            {'{{data_vencimento}}'}, {'{{dias_vencidos}}'}, {'{{link_pix}}'}, {'{{link_boleto}}'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <Input
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            placeholder="Nome (ex: 1a cobranca - 5 dias)"
          />
          <div className="grid grid-cols-3 gap-2">
            <select
              value={form.canal}
              onChange={(e) => setForm({ ...form, canal: e.target.value as ReguaCanal })}
              className="text-sm rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2"
            >
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="sms">SMS</option>
            </select>
            <Input
              type="number"
              value={form.gatilhoDiasVencimento}
              onChange={(e) => setForm({ ...form, gatilhoDiasVencimento: Number.parseInt(e.target.value, 10) || 0 })}
              placeholder="Dias (- antes / + depois)"
            />
            <select
              value={form.tom}
              onChange={(e) => setForm({ ...form, tom: e.target.value as ReguaTom })}
              className="text-sm rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-2"
            >
              <option value="cordial">Cordial</option>
              <option value="formal">Formal</option>
              <option value="severo">Severo</option>
            </select>
          </div>
          <Input
            value={form.assunto ?? ''}
            onChange={(e) => setForm({ ...form, assunto: e.target.value })}
            placeholder="Assunto (pra email/sms) — pode usar {{vars}}"
          />
          <textarea
            value={form.corpoTemplate}
            onChange={(e) => setForm({ ...form, corpoTemplate: e.target.value })}
            rows={10}
            className="w-full text-sm font-mono rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 p-2"
            placeholder="Corpo da mensagem com variaveis {{nome_cliente}}, {{valor}}..."
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.ativo ?? true}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
            />
            Ativo (roda na regua diaria)
          </label>
        </div>

        <div className="flex gap-2 justify-end mt-4">
          <Button variant="outline" size="sm" onClick={onClose} disabled={salvar.isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => salvar.mutate(form)} disabled={salvar.isPending}>
            {salvar.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
