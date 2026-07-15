'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, CalendarClock, Calculator, CheckCircle2, Circle, FileWarning, HelpCircle, Info, Loader2, Receipt, Landmark, Users, ChevronDown, RefreshCw } from 'lucide-react';
import type { AliquotasUsadasResponse, ConferenciaDivergenciasResponse } from '@pioneira/shared';
import type { CalendarioTributarioResponse, CoberturaTributariaResponse, TributosFolhaResponse } from '@pioneira/shared/schemas/tributos';
import { TIPO_FOLHA_FLP_LABEL } from '@pioneira/shared/enums/tipo-folha-flp';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { statusModulo, STATUS_COR } from '@/lib/module-status';

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function TributosPage() {
  const info = statusModulo('/tributos');

  const div = useQuery<ConferenciaDivergenciasResponse>({
    queryKey: ['retencoes', 'divergencias'],
    queryFn: async () => (await api.get<ConferenciaDivergenciasResponse>('/api/retencoes/divergencias')).data,
  });
  const aliquotas = useQuery<AliquotasUsadasResponse>({
    queryKey: ['retencoes', 'aliquotas'],
    queryFn: async () => (await api.get<AliquotasUsadasResponse>('/api/retencoes/aliquotas')).data,
  });

  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  const calendario = useQuery<CalendarioTributarioResponse>({
    queryKey: ['tributos', 'calendario', ano, mes],
    queryFn: async () => (await api.get<CalendarioTributarioResponse>('/api/tributos/calendario', { params: { ano, mes } })).data,
  });
  const nomeMes = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(hoje);

  const cobertura = useQuery<CoberturaTributariaResponse>({
    queryKey: ['tributos', 'cobertura'],
    queryFn: async () => (await api.get<CoberturaTributariaResponse>('/api/tributos/cobertura')).data,
  });

  // Default: mês ANTERIOR — a folha do mês corrente normalmente ainda não fechou/sincronizou.
  const anoAnt = mes === 1 ? ano - 1 : ano;
  const mesAnt = mes === 1 ? 12 : mes - 1;
  const [compFolha, setCompFolha] = useState<string>(`${anoAnt}-${String(mesAnt).padStart(2, '0')}`);
  // Tipo de folha (1=Mensal por padrão). Em nov/dez o 13º sai numa folha à parte;
  // o painel mostra UM tipo por vez — o seletor deixa isso explícito (nada de soma
  // silenciosa que arriscaria dobrar o 13º, cujos tipos 5 e 35 são a mesma folha).
  const [tipoFolha, setTipoFolha] = useState<number>(1);
  const folha = useQuery<TributosFolhaResponse>({
    queryKey: ['tributos', 'folha', compFolha, tipoFolha],
    queryFn: async () => (await api.get<TributosFolhaResponse>('/api/tributos/folha', { params: { competencia: compFolha, tipoFolha } })).data,
  });

  const ESTADO_FONTE: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' }> = {
    preenchido: { label: 'preenchido no Globus', variant: 'success' },
    vazio_globus: { label: 'vazio no Globus', variant: 'warning' },
    fora_globus: { label: 'feito fora do Globus', variant: 'muted' },
  };

  const cor = STATUS_COR[info?.status ?? 'parcial'];

  // Seção "Referência e detalhes" (Transparência + Calendário + Roadmap) ocultada a
  // pedido — a página mostra só o dado ao vivo. Reative trocando para `true`.
  const MOSTRAR_REFERENCIA: boolean = false;

  const ESFERA_LABEL: Record<string, { label: string; variant: 'default' | 'muted' | 'warning' }> = {
    federal: { label: 'Federal', variant: 'default' },
    municipal: { label: 'Municipal', variant: 'warning' },
    fgts: { label: 'FGTS', variant: 'muted' },
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-pioneira-900 via-pioneira-800 to-pioneira-900 dark:from-yellow-300 dark:via-yellow-200 dark:to-yellow-300 bg-clip-text text-transparent flex items-center gap-3">
            <Calculator className="h-7 w-7 text-pioneira-700 dark:text-yellow-400" />
            Tributos
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Apuração de PIS, COFINS, ISS, INSS, IRRF e geração de guias.
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${cor.bg} ${cor.text} border ${cor.border}`}>
          <span className={`h-2 w-2 rounded-full ${cor.dot}`} />
          {info?.fase ?? 'Em construção'}
        </span>
      </div>

      {/* Tributos da folha — informação mais importante, no topo */}
      <TributosFolhaPanel
        data={folha.data}
        isLoading={folha.isLoading}
        competencia={compFolha}
        setCompetencia={setCompFolha}
        tipoFolha={tipoFolha}
        setTipoFolha={setTipoFolha}
      />

      {/* Funcionalidade no ar: conferência de retenções */}
      <Link href="/contas-pagar/divergencias" className="block group">
        <Card className="p-5 hover:border-pioneira-300 dark:hover:border-yellow-700 transition-colors">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-pioneira-700 dark:text-yellow-400" />
                <h2 className="text-lg font-bold">Conferência de retenções na fonte</h2>
                <Badge variant="success" className="text-[10px]">no ar · em validação</Badge>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
                Compara o valor retido (Globus) com o esperado pela legislação (heurística Lucro Real,
                base = valor bruto da NF, ciente de fornecedores do Simples Nacional).
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-pioneira-700 dark:text-yellow-400 group-hover:gap-2 transition-all shrink-0">
              Abrir conferência <ArrowRight className="h-4 w-4" />
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/50 dark:bg-gray-900/30">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Títulos com divergência</p>
              <p className="text-2xl font-bold mt-1">
                {div.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-gray-400" /> : (div.data?.total ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/50 dark:bg-gray-900/30">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Total divergência (módulo)</p>
              <p className="text-2xl font-bold mt-1 text-amber-700 dark:text-amber-400">
                {div.isLoading ? '—' : moeda(div.data?.totalDivergenciaCents ?? 0)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/50 dark:bg-gray-900/30 col-span-2 md:col-span-1">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Alíquotas (Lucro Real)</p>
              <p className="text-xs mt-1.5 text-gray-600 dark:text-gray-300 leading-relaxed">
                {aliquotas.data
                  ? `PIS ${aliquotas.data.perc.pis}% · COFINS ${aliquotas.data.perc.cofins}% · CSLL ${aliquotas.data.perc.csll}% · IRRF ${aliquotas.data.perc.irrf}%`
                  : '—'}
              </p>
            </div>
          </div>
        </Card>
      </Link>

      {/* Guias no sistema — dado real e acionável */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileWarning className="h-5 w-5 text-pioneira-700 dark:text-yellow-400" />
          <h2 className="text-lg font-bold">Guias no sistema — {nomeMes}/{ano}</h2>
          <Badge variant="success" className="text-[10px]">dado real</Badge>
        </div>
        <Card className="p-4">
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-3">
            Títulos com origem <strong>Guia / Imposto</strong> vencendo em {nomeMes}. Dado real do banco.
          </p>
          {calendario.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/50 dark:bg-gray-900/30">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Lançadas</p>
                <p className="text-lg font-bold mt-1">{calendario.data?.guias.quantidade ?? 0}</p>
                <p className="text-xs text-gray-500">{moeda(calendario.data?.guias.valorAPagarCents ?? 0)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/50 dark:bg-gray-900/30">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Pagas</p>
                <p className="text-lg font-bold mt-1 text-emerald-700 dark:text-emerald-400">{calendario.data?.guias.pagasQuantidade ?? 0}</p>
                <p className="text-xs text-gray-500">{moeda(calendario.data?.guias.pagasValorCents ?? 0)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gray-50/50 dark:bg-gray-900/30">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold">Vencidas em aberto</p>
                <p className={`text-lg font-bold mt-1 ${(calendario.data?.guias.vencidasEmAbertoQuantidade ?? 0) > 0 ? 'text-red-700 dark:text-red-400' : 'text-gray-500'}`}>{calendario.data?.guias.vencidasEmAbertoQuantidade ?? 0}</p>
                <p className="text-xs text-gray-500">{moeda(calendario.data?.guias.vencidasEmAbertoValorCents ?? 0)}</p>
              </div>
            </div>
          )}
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-3 border-t border-gray-100 dark:border-gray-800 pt-2">
            <strong>Por que este total não bate com a "carga tributária da folha" acima?</strong> A maior parte
            dos tributos da folha (INSS/GPS patronal, FGTS Digital, DARF da folha) é recolhida por guia própria
            <em> fora do borderô</em> — não entra como <strong>origem=guia</strong> no Contas a Pagar. Aqui aparecem
            só as guias que já estão lançadas no CP.
          </p>
          <Link href="/contas-pagar" className="inline-flex items-center gap-1 text-xs font-semibold text-pioneira-700 dark:text-yellow-400 hover:gap-2 transition-all mt-3">
            Ver guias em Contas a Pagar <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
      </div>

      {MOSTRAR_REFERENCIA && (
        <>
      {/* Referência e detalhes — recolhíveis (o dado real fica aberto acima) */}
      <div className="pt-2 flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider text-gray-400 dark:text-gray-500 font-bold">Referência e detalhes</span>
        <span className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
      </div>

      {/* Transparência das fontes (recolhível) */}
      <SecaoColapsavel
        titulo="Transparência: o que o sistema tem e o que falta"
        icone={Info}
        resumo={cobertura.data ? `${cobertura.data.guias.total} guias · INSS/ISS de NF = R$ 0` : undefined}
      >
        <Card className="p-4 border-l-4 border-l-blue-400 bg-blue-50/30 dark:bg-blue-950/10">
          <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
            Este sistema <strong>reflete o Globus</strong>: onde o Globus tem o dado, mostramos; onde não tem,
            dizemos "vazio" — <strong>nunca inventamos</strong>. Se a equipe passar a preencher esses campos no
            Globus, eles aparecem aqui automaticamente, sem mexer no sistema.
          </p>
          {cobertura.data && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Prova ao vivo do seu banco: INSS retido total ={' '}
              <strong>{moeda(cobertura.data.retencoes.inssCentsTotal)}</strong> · ISS retido total ={' '}
              <strong>{moeda(cobertura.data.retencoes.issCentsTotal)}</strong> ·{' '}
              {cobertura.data.retencoes.comAlgumaRetencao}/{cobertura.data.retencoes.notasServico} NF de serviço com
              retenção · {cobertura.data.guias.total} guias no banco.
            </p>
          )}
        </Card>

        <div className="mt-3 space-y-2">
          {(cobertura.data?.fontes ?? []).map((f) => {
            const est = ESTADO_FONTE[f.estado] ?? { label: f.estado, variant: 'muted' as const };
            return (
              <Card key={f.item} className="p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">{f.item}</span>
                      <Badge variant={est.variant} className="text-[10px]">{est.label}</Badge>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{f.descricao}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">{f.orientacao}</p>
                  </div>
                  <code className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0 max-w-[45%] text-right break-all">
                    {f.fonteGlobus}
                  </code>
                </div>
              </Card>
            );
          })}
        </div>
      </SecaoColapsavel>

      {/* Calendário de obrigações (referência — recolhível) */}
      <SecaoColapsavel
        titulo={`Calendário de obrigações — ${nomeMes}/${ano}`}
        icone={CalendarClock}
        badge={<Badge variant="warning" className="text-[10px]">referência</Badge>}
        resumo="prazos federais padrão"
      >
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Prazos federais padrão. <strong>Confirme as datas exatas com a contabilidade</strong> — e o ISS depende do município.
        </p>
        <div className="divide-y divide-gray-100 dark:divide-gray-800/50">
          {(calendario.data?.obrigacoes ?? []).map((o) => {
            const esf = ESFERA_LABEL[o.esfera] ?? { label: o.esfera, variant: 'muted' as const };
            return (
              <div key={o.codigo} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold">{o.tributo}</span>
                    <Badge variant={esf.variant} className="text-[9px]">{esf.label}</Badge>
                    {o.tipo === 'declaracao' && <Badge variant="muted" className="text-[9px]">declaração</Badge>}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{o.descricao}</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 italic">{o.obs}</p>
                </div>
                <div className="text-right shrink-0 max-w-[45%]">
                  <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Vencimento</p>
                  <p className="text-xs text-gray-700 dark:text-gray-300">{o.regraVencimento}</p>
                </div>
              </div>
            );
          })}
        </div>
      </SecaoColapsavel>

      {/* Roadmap & pendências (recolhível) */}
      <SecaoColapsavel
        titulo={`Roadmap & pendências — ${info?.fase ?? ''}`}
        icone={HelpCircle}
        resumo={info?.estimativaSemanas ? `est. ${info.estimativaSemanas} semanas` : undefined}
      >
        <Card className="p-4 mb-3 border-l-4 border-l-emerald-400 bg-emerald-50/40 dark:bg-emerald-950/20">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
              <strong>Módulo finalizado no que cabe ao sistema.</strong> As perguntas ao financeiro/contabilidade
              (quem apura, sistema externo, prioridade) não foram respondidas — a orientação foi{' '}
              <strong>considerar todas como "não"</strong>. Com isso, apuração própria de PIS/COFINS, DARF/GPS,
              SPED e ISS por município ficam <strong>fora do escopo deste sistema</strong> (são feitos fora — pelo
              contador/fisco), e não como pendência de desenvolvimento. O que depende do Globus já reflete o Globus
              automaticamente; se a política mudar, reabrimos o item.
            </p>
          </div>
        </Card>

        <Card className="p-4">
          <ul className="space-y-2">
            {(info?.features ?? []).map((f) => (
              <li key={f.texto} className="flex items-start gap-2 text-sm">
                {f.ok ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <Circle className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0 mt-0.5" />
                )}
                <span className={f.ok ? '' : 'text-gray-500 dark:text-gray-400'}>{f.texto}</span>
              </li>
            ))}
          </ul>

          {info?.fontesDados && info.fontesDados.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-1.5">Fontes de dados</p>
              <div className="flex flex-wrap gap-1.5">
                {info.fontesDados.map((fd) => (
                  <Badge key={fd} variant="muted" className="text-[10px]">{fd}</Badge>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Pendências com o financeiro — dentro da seção recolhível */}
        {info?.perguntasFinanceiro && info.perguntasFinanceiro.length > 0 && (
        <Card className="p-4 mt-3 border-l-4 border-l-amber-400 bg-amber-50/40 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <HelpCircle className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0 mt-0.5" />
            <div className="text-sm text-gray-700 dark:text-gray-200">
              <p className="font-semibold text-amber-800 dark:text-amber-200">
                Pendente com o financeiro (destrava apuração própria, DARF/GPS, ISS, calendário e SPED):
              </p>
              <ol className="list-decimal ml-5 mt-1.5 space-y-1">
                {info.perguntasFinanceiro.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ol>
              <Link
                href="/perguntas?modulo=/tributos"
                className="inline-flex items-center gap-1.5 mt-3 rounded-md bg-amber-200/70 dark:bg-amber-900/40 px-3 py-1.5 text-sm font-semibold text-amber-900 dark:text-amber-100 hover:bg-amber-300/70 dark:hover:bg-amber-800/50 transition-colors"
              >
                Responder na aba “Perguntas ao Financeiro”
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </Card>
        )}
      </SecaoColapsavel>
        </>
      )}
    </div>
  );
}

function TributosFolhaPanel({
  data,
  isLoading,
  competencia,
  setCompetencia,
  tipoFolha,
  setTipoFolha,
}: {
  data: TributosFolhaResponse | undefined;
  isLoading: boolean;
  competencia: string;
  setCompetencia: (c: string) => void;
  tipoFolha: number;
  setTipoFolha: (t: number) => void;
}) {
  const disponivel = !!data?.disponivel;
  const patronalReal = data?.patronalFonte === 'real';
  const patronalCents = patronalReal ? (data?.inssPatronalRealCents ?? 0) : (data?.inssPatronalEstimadoCents ?? 0);
  // Custo do EMPREGADOR (dinheiro que a empresa efetivamente gasta): FGTS + patronal.
  // Retido do FUNCIONÁRIO e só repassado (INSS + IRRF): a empresa é intermediária, não é
  // custo dela. O total soma os dois, mas separar deixa claro o que é peso real da empresa.
  const custoEmpregadorCents = disponivel ? data!.fgtsCents + patronalCents : 0;
  const repassadoCents = disponivel ? data!.inssRetidoCents + data!.irrfRetidoCents : 0;
  const totalFolha = custoEmpregadorCents + repassadoCents;

  const queryClient = useQueryClient();
  const sync = useMutation({
    mutationFn: async () => (await api.post<{ etlGravados?: number; status?: string }>('/api/tributos/folha/sincronizar')).data,
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['tributos', 'folha'] });
      if (r?.status === 'erro') toast.error('Sync da guia falhou no Globus.');
      else toast.success(`Guia da folha sincronizada (${r?.etlGravados ?? 0} registros).`);
    },
    onError: () => toast.error('Não foi possível sincronizar a guia da folha (Oracle/Globus indisponível?).'),
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Landmark className="h-5 w-5 text-pioneira-700 dark:text-yellow-400" />
        <h2 className="text-lg font-bold">Tributos da folha</h2>
        <Badge variant="success" className="text-[10px]">dado real da folha</Badge>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            title="Lê a GPS da folha (INSS patronal real com/sem desoneração) do Globus"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 dark:border-gray-700 px-2 h-8 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? 'animate-spin' : ''}`} /> Sincronizar guia
          </button>
          <label htmlFor="tipo-folha" className="text-xs text-gray-500 dark:text-gray-400">Folha</label>
          <select
            id="tipo-folha"
            value={tipoFolha}
            onChange={(e) => setTipoFolha(Number(e.target.value))}
            className="h-8 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 text-xs"
          >
            {Object.entries(TIPO_FOLHA_FLP_LABEL).map(([cod, lab]) => (
              <option key={cod} value={cod}>{lab}</option>
            ))}
          </select>
          <label htmlFor="comp-folha" className="text-xs text-gray-500 dark:text-gray-400">Competência</label>
          <Input id="comp-folha" type="month" value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="w-40 h-8" />
        </div>
      </div>

      <Card className="p-4 border-l-4 border-l-emerald-400 bg-emerald-50/20 dark:bg-emerald-950/10">
        <p className="text-sm leading-relaxed text-gray-700 dark:text-gray-200">
          O maior peso tributário da empresa está na <strong>folha</strong>, não em NF de serviço.
          Por isso o "INSS = R$ 0" na transparência se refere só a NF — o INSS de verdade está aqui, vindo da folha real (FLP).
        </p>

        {isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : !disponivel ? (
          <div className="mt-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-sm text-amber-900 dark:text-amber-200">
            <p>
              Sem folha (FLP) sincronizada para <strong>{data?.competenciaLabel ?? competencia}</strong>.{' '}
              Sincronize em <Link href="/folha" className="underline font-semibold">Encargos &amp; Benefícios</Link>
              {data && data.competenciasDisponiveis.length > 0 ? ' ou escolha uma competência já disponível:' : '.'}
            </p>
            {data && data.competenciasDisponiveis.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {data.competenciasDisponiveis.map((c) => (
                  <button
                    key={c.competencia}
                    type="button"
                    onClick={() => setCompetencia(c.competencia)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 px-2 py-1 text-xs hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
                  >
                    <span className="font-mono">{c.competencia}</span>
                    <span className="text-gray-500 dark:text-gray-400">{c.qtdFuncionarios.toLocaleString('pt-BR')} func</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Total em destaque — a informação mais importante */}
            <div className="mt-3 flex items-end justify-between gap-3 flex-wrap rounded-lg bg-white/60 dark:bg-gray-900/40 border border-emerald-100 dark:border-emerald-900/40 p-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold">
                  Carga tributária da folha · {data!.competenciaLabel}
                </p>
                <p className="text-2xl sm:text-3xl font-bold text-pioneira-900 dark:text-yellow-200 mt-0.5">{moeda(totalFolha)}</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  INSS retido + FGTS + IRRF + INSS patronal{' '}
                  {patronalReal
                    ? <span className="text-emerald-700 dark:text-emerald-400">(real, com desoneração)</span>
                    : <span className="text-amber-700 dark:text-amber-400">(estimado)</span>}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <p className="text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> {data!.qtdFuncionarios.toLocaleString('pt-BR')} funcionários
                </p>
                <div className="flex gap-2 text-right">
                  <div className="rounded-md bg-pioneira-50 dark:bg-yellow-950/20 border border-pioneira-100 dark:border-yellow-900/30 px-2 py-1">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-bold">Custo do empregador</p>
                    <p className="text-sm font-bold text-pioneira-900 dark:text-yellow-200" title="FGTS + INSS patronal">{moeda(custoEmpregadorCents)}</p>
                  </div>
                  <div className="rounded-md bg-gray-50 dark:bg-gray-900/40 border border-gray-100 dark:border-gray-800 px-2 py-1">
                    <p className="text-[10px] uppercase tracking-wide text-gray-500 dark:text-gray-400 font-bold">Retido e repassado</p>
                    <p className="text-sm font-bold" title="INSS + IRRF retidos do funcionário">{moeda(repassadoCents)}</p>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
              <strong>Custo do empregador</strong> (FGTS + INSS patronal) é peso real da empresa;{' '}
              <strong>retido e repassado</strong> (INSS + IRRF do funcionário) a empresa só desconta e repassa ao fisco.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mt-3">
              <TributoFolhaCard titulo="INSS retido" sub="do funcionário" valor={moeda(data!.inssRetidoCents)} tag="certo" />
              <TributoFolhaCard titulo="FGTS" sub="depósito da empresa" valor={moeda(data!.fgtsCents)} tag="certo" />
              <TributoFolhaCard titulo="IRRF retido" sub="da folha" valor={moeda(data!.irrfRetidoCents)} tag="certo" />
              <TributoFolhaCard titulo="Base INSS" sub="base de cálculo" valor={moeda(data!.baseInssCents)} tag="certo" />
              {patronalReal ? (
                <TributoFolhaCard
                  titulo="INSS patronal"
                  sub={`real (GPS) · com desoneração${data!.inssPatronalSemDesonCents > 0 ? ` · s/ deson. ${moeda(data!.inssPatronalSemDesonCents)}` : ''}`}
                  valor={moeda(data!.inssPatronalRealCents)}
                  tag="certo"
                />
              ) : (
                <TributoFolhaCard
                  titulo="INSS patronal"
                  sub={`estimado · ${(data!.aliquotaPatronalEstimada * 100).toFixed(1)}% da base`}
                  valor={moeda(data!.inssPatronalEstimadoCents)}
                  tag="estimativa"
                />
              )}
            </div>

            {data!.observacoes.length > 0 && (
              <ul className="mt-3 space-y-1 text-[11px] text-gray-600 dark:text-gray-400 list-disc pl-4">
                {data!.observacoes.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

function SecaoColapsavel({
  titulo,
  icone: Icone,
  badge,
  resumo,
  defaultAberto = false,
  children,
}: {
  titulo: string;
  icone: React.ComponentType<{ className?: string }>;
  badge?: React.ReactNode;
  resumo?: React.ReactNode;
  defaultAberto?: boolean;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(defaultAberto);
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-center gap-2 p-4 text-left hover:bg-gray-50/60 dark:hover:bg-gray-900/40 transition-colors"
      >
        <Icone className="h-5 w-5 text-pioneira-700 dark:text-yellow-400 shrink-0" />
        <h2 className="text-base sm:text-lg font-bold">{titulo}</h2>
        {badge}
        {resumo && <span className="ml-auto text-xs text-gray-500 dark:text-gray-400 truncate hidden sm:block max-w-[40%]">{resumo}</span>}
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${aberto ? 'rotate-180' : ''} ${resumo ? 'ml-2' : 'ml-auto'}`} />
      </button>
      {aberto && <div className="px-4 pb-4">{children}</div>}
    </Card>
  );
}

function TributoFolhaCard({ titulo, sub, valor, tag }: { titulo: string; sub: string; valor: string; tag: 'certo' | 'estimativa' }) {
  const ehEstimativa = tag === 'estimativa';
  return (
    <div className={`rounded-lg border p-3 ${ehEstimativa ? 'border-amber-300 dark:border-amber-700 bg-amber-50/40 dark:bg-amber-950/20' : 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30'}`}>
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-bold truncate">{titulo}</p>
        <Badge variant={ehEstimativa ? 'warning' : 'success'} className="text-[9px] shrink-0">{ehEstimativa ? 'estimativa' : 'certo'}</Badge>
      </div>
      <p className={`text-sm sm:text-base font-bold mt-1 truncate ${ehEstimativa ? 'text-amber-700 dark:text-amber-400' : ''}`} title={valor}>{valor}</p>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">{sub}</p>
    </div>
  );
}
