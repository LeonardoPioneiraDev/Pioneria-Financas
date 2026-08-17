'use client';

import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import type { ContaPagarResponse, DevolucaoComprovanteResponse, PagamentoGrupoResponse, RemessaGrupoResponse, SubstituicaoCadeiaResponse } from '@pioneira/shared/schemas/contas-pagar';
import type { ConferenciaDoTituloResponse, RetencaoComparacao } from '@pioneira/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  TIPO_DOCUMENTO_LABEL,
  MODALIDADE_PAGAMENTO_LABEL,
  rotular,
  rotularCompacto,
} from '@pioneira/shared/enums/globus-codigos';
import { ORIGEM_DOCUMENTO_CP_LABELS, CONTA_PAGAR_STATUS_DESCRICOES, type ContaPagarStatus } from '@pioneira/shared/enums/conta-pagar-status';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { WorkflowInferido } from '@/components/shared/WorkflowInferido';
import { TrilhaGlobus } from './TrilhaGlobus';

interface DetalheCpDialogProps {
  cp: ContaPagarResponse | null;
  onClose: () => void;
  /**
   * Aplica o filtro de Setor (centro de custo) pelo código CODCUSTOFIN e fecha o
   * detalhe. Quando passado, as unidades do rateio viram clicáveis. Opcional.
   */
  onFiltrarSetor?: (codigo: string, nome?: string | null) => void;
}

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataFmt(d: string | null): string {
  if (!d) return '-';
  return format(new Date(`${d}T00:00:00`), 'dd/MM/yyyy');
}

/** Diferença em dias entre duas datas ISO (YYYY-MM-DD). null se faltar alguma. */
function diasEntre(aIso: string | null, bIso: string | null): number | null {
  if (!aIso || !bIso) return null;
  const a = new Date(`${aIso}T00:00:00`).getTime();
  const b = new Date(`${bIso}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

/** "no mesmo dia" / "1 dia depois" / "N dias depois" — pro intervalo entre etapas. */
function rotuloDias(dias: number | null): string {
  if (dias == null) return '';
  if (dias < 0) return `${Math.abs(dias)} dia(s) antes`;
  if (dias === 0) return 'no mesmo dia';
  if (dias === 1) return '1 dia depois';
  return `${dias} dias depois`;
}

/**
 * Explica EM LINGUAGEM SIMPLES como a devolução foi feita, pelo código do histórico
 * bancário (BCOHISTO): 10 = DOC DEVOLVIDO, 541 = CHEQUE DEVOLVIDO.
 */
function explicarComoDevolveu(codHistoBco: number | null | undefined): string {
  switch (codHistoBco) {
    case 10:
      return 'Devolução de DOC: o banco recebedor recusou o crédito (conta inválida/encerrada, dados divergentes ou ordem do recebedor) e o valor retornou automaticamente para a conta de origem.';
    case 541:
      return 'Cheque devolvido pelo banco (sem fundos ou divergência) — o valor foi estornado de volta para a conta.';
    default:
      return 'O banco devolveu o pagamento e o valor retornou para a conta de origem.';
  }
}

/**
 * Percentuais inteiros que somam EXATAMENTE 100 (método do maior resto / Hamilton).
 * Arredondar cada fatia com Math.round independente fazia o rateio somar 99% ou 101%.
 * Aqui o piso de cada fatia é distribuído o resto pras maiores frações até fechar 100.
 */
function percentuaisInteiros(valores: number[], total: number): number[] {
  if (total <= 0) return valores.map(() => 0);
  const exatos = valores.map((v) => (v / total) * 100);
  const pisos = exatos.map((e) => Math.floor(e));
  let resto = 100 - pisos.reduce((s, n) => s + n, 0);
  const porFracao = exatos
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of porFracao) {
    if (resto <= 0) break;
    pisos[i] = (pisos[i] ?? 0) + 1;
    resto -= 1;
  }
  return pisos;
}

/**
 * Cor estável por código de setor (centro de custo financeiro) — cada unidade
 * ganha sempre a mesma cor, sem cadastro. Hash simples do código -> matiz.
 */
function corDoSetor(codigo: string | null | undefined): string {
  if (!codigo) return '#6b7280';
  let h = 0;
  for (let i = 0; i < codigo.length; i++) h = (h * 31 + codigo.charCodeAt(i)) % 360;
  return `hsl(${h}, 55%, 45%)`;
}

/** Pílula do setor (centro de custo financeiro do Globus). Marca rateio quando aplicável. */
export function SetorPill({
  nome,
  codigo,
  rateado,
  unidades,
  className,
}: {
  nome: string;
  codigo?: string | null;
  rateado?: boolean;
  /** Qtd de unidades do rateio (quando rateado) — mostra "· rateado (N un.)". */
  unidades?: number | null;
  className?: string;
}) {
  const cor = corDoSetor(codigo);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className ?? ''}`}
      style={{ backgroundColor: `${cor}22`, color: cor }}
      title={rateado ? `${nome} — unidade de maior valor de um rateio${unidades ? ` entre ${unidades} unidades` : ''}` : nome}
    >
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cor }} />
      {nome}
      {rateado && (
        <span className="text-[10px] font-normal opacity-80">
          · rateado{unidades && unidades > 1 ? ` (${unidades} un.)` : ''}
        </span>
      )}
    </span>
  );
}

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'muted' }> = {
  pendente: { label: 'Pendente', variant: 'warning' },
  em_aprovacao: { label: 'Em aprovação', variant: 'warning' },
  aprovado: { label: 'Aprovado', variant: 'default' },
  pago: { label: 'Pago', variant: 'success' },
  cancelado: { label: 'Cancelado', variant: 'danger' },
};

function Linha({ label, valor, mono }: { label: string; valor: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-3 py-1.5 border-b border-gray-100 dark:border-gray-800/50 last:border-0">
      <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</span>
      <span className={`text-sm text-right ${mono ? 'font-mono' : ''}`}>{valor}</span>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wider text-pioneira-800 dark:text-yellow-300 mb-2">{titulo}</h3>
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1 bg-gray-50/50 dark:bg-gray-900/30">{children}</div>
    </div>
  );
}

const RETENCAO_LABEL: Record<string, string> = {
  pis: 'PIS',
  cofins: 'COFINS',
  csll: 'CSLL',
  irrf: 'IRRF',
  inss: 'INSS',
  iss: 'ISS',
};

/** Tipos de documento sujeitos a heurística de retenção (NF de serviço PJ). */
const TIPOS_NF_SERVICO = ['NF', 'NFE', 'NFV', 'NFS'];

function classeDivergencia(diff: number): string {
  if (diff === 0) return 'text-gray-500';
  if (diff < 0) return 'text-red-700 dark:text-red-400 font-bold'; // pagou menos que devia
  return 'text-amber-700 dark:text-amber-400 font-bold';           // pagou mais que devia
}

function rotuloDivergencia(diff: number): string {
  if (diff === 0) return 'ok';
  if (diff < 0) return `falta ${moeda(Math.abs(diff))}`;
  return `excedente ${moeda(diff)}`;
}

/**
 * Conferência tributária do título: compara o retido (Globus) com o esperado pela
 * heurística Lucro Real. Reaproveita o endpoint /api/retencoes/titulo/:id (o mesmo
 * cálculo da tela de Divergências). Só busca/exibe quando o título é NF de serviço;
 * quando o fornecedor é Simples Nacional (ou outro caso não aplicável) mostra apenas
 * o motivo, sem inventar valores esperados.
 */
function ConferenciaTributaria({ contaPagarId }: { contaPagarId: string }) {
  const conf = useQuery<ConferenciaDoTituloResponse>({
    queryKey: ['retencoes', 'titulo', contaPagarId],
    queryFn: async () => {
      const res = await api.get<ConferenciaDoTituloResponse>(`/api/retencoes/titulo/${contaPagarId}`);
      return res.data;
    },
  });

  if (conf.isLoading || !conf.data) return null;
  const c = conf.data;
  // "Aplicável" = a heurística padrão incide (PIS é o sinal: só fica aplicável quando
  // NF de serviço PJ não-Simples). Se nada se aplica, mostra só o motivo (transparência).
  const aplicavel = c.retencoes.some((r) => r.aplicavel);

  if (!aplicavel) {
    if (c.alertas.length === 0) return null;
    return (
      <Secao titulo="Conferência tributária">
        <div className="py-2 text-xs text-gray-500 dark:text-gray-400 italic space-y-1">
          {c.alertas.map((a, i) => (
            <p key={i}>{a}</p>
          ))}
        </div>
      </Secao>
    );
  }

  return (
    <Secao titulo="Conferência tributária">
      <div className="py-1">
        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug mb-2">
          Compara o retido (Globus) com o esperado pela heurística Lucro Real. Versão em
          validação com o financeiro.
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 dark:text-gray-400 uppercase">
              <th className="text-left py-1 pr-2">Tributo</th>
              <th className="text-right py-1 pr-2">Aliq.</th>
              <th className="text-right py-1 pr-2">Esperado</th>
              <th className="text-right py-1 pr-2">Retido</th>
              <th className="text-right py-1 pr-2">Diferença</th>
              <th className="text-left py-1">Status</th>
            </tr>
          </thead>
          <tbody>
            {c.retencoes.map((r: RetencaoComparacao) => (
              <tr
                key={r.tipo}
                className={cn(
                  'border-t border-gray-200/60 dark:border-gray-700/60',
                  r.divergente && 'bg-red-50/30 dark:bg-red-950/20',
                  !r.aplicavel && 'opacity-60',
                )}
              >
                <td className="py-1.5 pr-2 font-medium">{RETENCAO_LABEL[r.tipo]}</td>
                <td className="py-1.5 pr-2 text-right font-mono">{r.aplicavel ? `${r.aliquotaPerc}%` : '—'}</td>
                <td className="py-1.5 pr-2 text-right font-mono">{r.aplicavel ? moeda(r.esperadoCents) : '—'}</td>
                <td className="py-1.5 pr-2 text-right font-mono">{moeda(r.retidoCents)}</td>
                <td className={cn('py-1.5 pr-2 text-right font-mono', classeDivergencia(r.divergenciaCents))}>
                  {r.aplicavel ? rotuloDivergencia(r.divergenciaCents) : '—'}
                </td>
                <td className="py-1.5">
                  {r.divergente ? (
                    <Badge variant="warning" className="text-[9px]">divergente</Badge>
                  ) : r.aplicavel ? (
                    <Badge variant="success" className="text-[9px]">ok</Badge>
                  ) : (
                    <Badge variant="muted" className="text-[9px]">n/a</Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-300 dark:border-gray-600 font-bold">
              <td className="py-1.5 pr-2">Total</td>
              <td></td>
              <td className="py-1.5 pr-2 text-right font-mono">{moeda(c.totalEsperadoCents)}</td>
              <td className="py-1.5 pr-2 text-right font-mono">{moeda(c.totalRetidoCents)}</td>
              <td className={cn('py-1.5 pr-2 text-right font-mono', classeDivergencia(c.divergenciaTotalCents))}>
                {rotuloDivergencia(c.divergenciaTotalCents)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        {c.alertas.length > 0 && (
          <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400 italic space-y-0.5">
            {c.alertas.map((a, i) => (
              <p key={i}>{a}</p>
            ))}
          </div>
        )}
      </div>
    </Secao>
  );
}

export function DetalheCpDialog({ cp, onClose, onFiltrarSetor }: DetalheCpDialogProps) {
  // Grupo de pagamento (títulos no mesmo movimento bancário / borderô). Busca
  // on-demand só quando o título tem movimento. Hook ANTES do early-return (regras
  // de hooks); `enabled` controla o disparo.
  const movimentoId = cp?.pagamento.movimentoId ?? null;
  const grupoQuery = useQuery<PagamentoGrupoResponse>({
    queryKey: ['cp-pagamento-grupo', cp?.id, movimentoId],
    queryFn: async () => {
      const res = await api.get<PagamentoGrupoResponse>(`/api/contas-pagar/${cp!.id}/pagamento-grupo`);
      return res.data;
    },
    enabled: !!cp?.id && !!movimentoId,
  });

  // Cadeia de substituição (estados pelos quais o documento passou até o final).
  // Busca sempre que há um título aberto; a seção só renderiza se total > 1.
  const cadeiaQuery = useQuery<SubstituicaoCadeiaResponse>({
    queryKey: ['cp-substituicao-cadeia', cp?.id],
    queryFn: async () => {
      const res = await api.get<SubstituicaoCadeiaResponse>(`/api/contas-pagar/${cp!.id}/substituicao-cadeia`);
      return res.data;
    },
    enabled: !!cp?.id,
  });

  // Remessa enviada ao banco (lote de pagamento eletrônico). Só busca quando o título
  // tem número de remessa; a seção só renderiza com mais de 1 título no lote.
  const remessaQuery = useQuery<RemessaGrupoResponse>({
    queryKey: ['cp-remessa-grupo', cp?.id],
    queryFn: async () => {
      const res = await api.get<RemessaGrupoResponse>(`/api/contas-pagar/${cp!.id}/remessa-grupo`);
      return res.data;
    },
    enabled: !!cp?.id && !!cp?.pagamento.numeroRemessa,
  });

  // Comprovante da devolução: o par débito/crédito do extrato que PROVA a devolução
  // (qual conta, qual documento) + o título que refez. Só busca quando o título está
  // marcado como devolvido. Ver memory/cp-devolucao-bancaria-retentativa.
  const devolucaoQuery = useQuery<DevolucaoComprovanteResponse>({
    queryKey: ['cp-devolucao', cp?.id],
    queryFn: async () => {
      const res = await api.get<DevolucaoComprovanteResponse>(`/api/contas-pagar/${cp!.id}/devolucao`);
      return res.data;
    },
    enabled: !!cp?.id && !!cp?.pagamentoDevolvido,
  });

  if (!cp) return null;
  const statusCfg = STATUS_LABEL[cp.status] ?? { label: cp.status, variant: 'muted' as const };
  const statusDescricao = CONTA_PAGAR_STATUS_DESCRICOES[cp.status as ContaPagarStatus] ?? '';
  // Pago = flag explícito do Globus OU já tem data de pagamento. Usado pra deixar
  // claro "pago" vs "a pagar" (o usuário filtra por data de pagamento e os títulos
  // já quitados não podem aparecer como "a pagar").
  const pago = cp.quitado || cp.status === 'pago' || !!cp.dataPagamento;
  // Reparcelamento: heurística pela observação do Globus (texto livre — não há flag
  // estruturado exposto). Serve de sinal visual; captura o nº da parcela de origem.
  const matchReparc = /reparcelamento(?:\s+da\s+parc\.?\s*0*(\d+))?/i.exec(cp.observacao ?? '');
  const reparcelamento = matchReparc !== null;
  const parcelaOrigem = matchReparc?.[1] ?? null;

  return (
    <Dialog open={cp !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="mx-3 w-[calc(100%-1.5rem)] sm:w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate">
                {cp.fornecedor?.razaoSocial ?? 'Sem fornecedor'}
              </DialogTitle>
              <DialogDescription>
                {rotularCompacto(TIPO_DOCUMENTO_LABEL, cp.tipoDocumento) || 'Documento'} {cp.numeroDocumento ?? '-'}
                {cp.serieDocumento && `/${cp.serieDocumento}`}
                {cp.numeroParcela !== null && ` · Parcela ${cp.numeroParcela}`}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {cp.setorNome && <SetorPill nome={cp.setorNome} codigo={cp.codSetor} rateado={cp.setorRateado} unidades={cp.rateioSetores?.length} />}
              {reparcelamento && (
                <Badge
                  variant="warning"
                  title={
                    parcelaOrigem
                      ? `Reparcelamento da parcela ${parcelaOrigem} — o valor original foi redistribuído entre as parcelas deste documento.`
                      : 'Título reparcelado — o valor original foi redistribuído entre parcelas deste documento.'
                  }
                >
                  Reparcelado{parcelaOrigem ? ` (da parc. ${parcelaOrigem})` : ''}
                </Badge>
              )}
              {cp.substituido && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-amber-500 text-white dark:bg-amber-600 shadow-sm"
                  title={`Título substituído/relançado no Globus${cp.substituidoPorDoc ? ` — vale o documento ${cp.substituidoPorDoc}` : ''}. Fica fora dos totais.`}
                >
                  ⚠ Substituído
                </span>
              )}
              {cp.pagamentoDevolvido && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-sky-500 text-white dark:bg-sky-600 shadow-sm"
                  title="Pagamento aceito pelo banco mas DEVOLVIDO (não liquidou) e refeito por outro borderô. Fica fora do 'Foi pago'."
                >
                  ↩ Devolvido
                </span>
              )}
              <Badge variant={statusCfg.variant} title={statusDescricao}>{statusCfg.label}</Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Pagamento devolvido: o banco aceitou o eletrônico mas não liquidou; o
              dinheiro voltou e a obrigação foi refeita. Fica fora do "Foi pago"
              (só a tentativa que liquidou conta). Follow-up SFN-48. */}
          {cp.pagamentoDevolvido && (
            <div className="rounded-md border-l-4 border-sky-500 bg-sky-50 dark:bg-sky-950/30 px-3 py-2 text-xs text-sky-900 dark:text-sky-200">
              O banco <strong>aceitou</strong> este pagamento{cp.dataPagamento ? ` (consta pago em ${dataFmt(cp.dataPagamento)})` : ''}, mas{' '}
              <strong>não liquidou</strong> — o dinheiro <strong>voltou</strong> (devolução no extrato) e a obrigação foi{' '}
              <strong>refeita</strong> por outro pagamento. Por isso ele aparece aqui para histórico, mas{' '}
              <strong>não entra no &quot;Foi pago&quot;</strong> (só a tentativa que de fato liquidou conta).
            </div>
          )}
          {/* Comprovante da devolução: a PROVA no extrato (qual conta, qual documento)
              de que o dinheiro voltou — em vez de só afirmar "devolvido". Saída (débito)
              + crédito de DOC/CHEQUE DEVOLVIDO casado + título que refez. Ver SFN-48. */}
          {cp.pagamentoDevolvido && (
            <Secao titulo="Comprovante da devolução">
              <div className="py-2 space-y-2.5">
                {/* LINHA DO TEMPO — "quando" de cada etapa e os dias entre elas. Só
                    aparece com o crédito localizado (a data real da devolução). */}
                {devolucaoQuery.data?.credito && (() => {
                  const pagDt = cp.dataPagamento;
                  const devDt = devolucaoQuery.data.credito.dataMovto;
                  const refDt = devolucaoQuery.data.refeito?.dataPagamento ?? null;
                  const diasDev = diasEntre(pagDt, devDt);
                  const diasRef = diasEntre(devDt, refDt);
                  return (
                    <div className="rounded-md border border-sky-200 dark:border-sky-900/40 bg-white/60 dark:bg-gray-900/30 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Linha do tempo</p>
                      <ol className="space-y-2">
                        <li className="flex items-start gap-2">
                          <span className="mt-0.5 h-2 w-2 rounded-full bg-gray-400 shrink-0" />
                          <span className="text-[11px] text-gray-700 dark:text-gray-200">
                            <strong>Pago</strong> em {dataFmt(pagDt)} — saída de {moeda(cp.valorAPagarCents)}
                            {cp.pagamento.documento ? ` (${cp.pagamento.documento})` : ''}
                          </span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="mt-0.5 h-2 w-2 rounded-full bg-sky-500 shrink-0" />
                          <span className="text-[11px] text-sky-800 dark:text-sky-200">
                            <strong>↩ Devolvido</strong> em {dataFmt(devDt)}
                            {diasDev != null && <span className="text-gray-500 dark:text-gray-400"> ({rotuloDias(diasDev)})</span>}
                            {' '}— {devolucaoQuery.data.credito.descHistoBco ?? 'DOC DEVOLVIDO'}
                          </span>
                        </li>
                        {refDt && (
                          <li className="flex items-start gap-2">
                            <span className="mt-0.5 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                            <span className="text-[11px] text-emerald-800 dark:text-emerald-200">
                              <strong>✓ Refeito</strong> em {dataFmt(refDt)}
                              {diasRef != null && <span className="text-gray-500 dark:text-gray-400"> ({rotuloDias(diasRef)} da devolução)</span>}
                              {devolucaoQuery.data.refeito?.documento ? ` — borderô ${devolucaoQuery.data.refeito.documento}` : ''}
                            </span>
                          </li>
                        )}
                      </ol>
                    </div>
                  );
                })()}

                {/* SAÍDA — o pagamento que o banco aceitou mas devolveu. Vem do PRÓPRIO
                    título, então aparece sempre (independe do endpoint /devolucao). */}
                <div className="rounded-md border-l-4 border-gray-400 bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Saída (pagamento que voltou)
                    </span>
                    <span className="font-mono text-sm text-red-700 dark:text-red-400">
                      − {moeda(cp.valorAPagarCents)}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5">
                    {dataFmt(cp.dataPagamento)} ·{' '}
                    {cp.pagamento.bancoNome ?? `Banco ${cp.pagamento.bancoCodigo ?? '-'}`}
                    {cp.pagamento.bancoCodigo != null && ` (${cp.pagamento.bancoCodigo})`}
                    {(cp.pagamento.agencia || cp.pagamento.conta) &&
                      ` · ${cp.pagamento.agencia ?? '-'}/${cp.pagamento.conta ?? '-'}`}
                    {cp.pagamento.documento && ` · ${cp.pagamento.documento}`}
                  </p>
                </div>

                {/* Estados da busca do crédito de devolução no extrato. */}
                {devolucaoQuery.isLoading && (
                  <div className="rounded-md border-l-4 border-sky-300 bg-sky-50/60 dark:bg-sky-950/20 px-3 py-2 text-[11px] text-sky-800 dark:text-sky-300">
                    Buscando o comprovante da devolução no extrato…
                  </div>
                )}
                {devolucaoQuery.isError && (
                  <div className="rounded-md border-l-4 border-red-400 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-[11px] text-red-800 dark:text-red-300">
                    Não foi possível carregar o comprovante da devolução. Confirme que o <strong>servidor (backend) foi atualizado e reiniciado</strong> —
                    este detalhe usa o endpoint <code className="font-mono">/api/contas-pagar/:id/devolucao</code>, adicionado recentemente.
                  </div>
                )}

                {/* CRÉDITO — a devolução localizada no extrato: a prova. */}
                {devolucaoQuery.data?.credito ? (
                  <div className="rounded-md border-l-4 border-sky-500 bg-sky-50 dark:bg-sky-950/30 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:text-sky-300">
                        ↩ Crédito de devolução (a prova)
                      </span>
                      <span className="font-mono text-sm text-emerald-700 dark:text-emerald-400">
                        + {moeda(devolucaoQuery.data.credito.valorCents)}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5">
                      {dataFmt(devolucaoQuery.data.credito.dataMovto)} ·{' '}
                      {devolucaoQuery.data.credito.bancoNome ?? `Banco ${devolucaoQuery.data.credito.bancoCodigo ?? '-'}`}
                      {devolucaoQuery.data.credito.bancoCodigo != null && ` (${devolucaoQuery.data.credito.bancoCodigo})`}
                      {(devolucaoQuery.data.credito.agencia || devolucaoQuery.data.credito.conta) &&
                        ` · ${devolucaoQuery.data.credito.agencia ?? '-'}/${devolucaoQuery.data.credito.conta ?? '-'}`}
                    </p>
                    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
                      <dt className="text-gray-500 dark:text-gray-400">Quando voltou</dt>
                      <dd className="font-medium">
                        {dataFmt(devolucaoQuery.data.credito.dataMovto)}
                        {(() => {
                          const d = diasEntre(cp.dataPagamento, devolucaoQuery.data.credito.dataMovto);
                          return d != null ? <span className="text-gray-400 font-normal"> · {rotuloDias(d)} do pagamento</span> : null;
                        })()}
                      </dd>
                      {devolucaoQuery.data.credito.dataEfetiva && (
                        <>
                          <dt className="text-gray-500 dark:text-gray-400">Efetivada em</dt>
                          <dd>{dataFmt(devolucaoQuery.data.credito.dataEfetiva)}</dd>
                        </>
                      )}
                      <dt className="text-gray-500 dark:text-gray-400">Histórico</dt>
                      <dd className="font-medium">
                        {devolucaoQuery.data.credito.descHistoBco ?? 'DEVOLVIDO'}
                        {devolucaoQuery.data.credito.codHistoBco != null && (
                          <span className="text-gray-400"> ({devolucaoQuery.data.credito.codHistoBco})</span>
                        )}
                      </dd>
                      {devolucaoQuery.data.credito.documento && (
                        <>
                          <dt className="text-gray-500 dark:text-gray-400">Documento</dt>
                          <dd className="font-mono">{devolucaoQuery.data.credito.documento}</dd>
                        </>
                      )}
                      <dt className="text-gray-500 dark:text-gray-400">Lançamento</dt>
                      <dd className="font-mono">#{devolucaoQuery.data.credito.codMovtoBco}</dd>
                      {devolucaoQuery.data.credito.historico && (
                        <>
                          <dt className="text-gray-500 dark:text-gray-400">Obs. extrato</dt>
                          <dd className="text-gray-600 dark:text-gray-300">{devolucaoQuery.data.credito.historico}</dd>
                        </>
                      )}
                    </dl>
                    {/* COMO FOI FEITA — traduz o código do histórico em linguagem simples. */}
                    <p className="mt-2 rounded bg-sky-100/60 dark:bg-sky-900/30 px-2 py-1.5 text-[11px] leading-snug text-sky-900 dark:text-sky-100">
                      <strong>Como foi:</strong> {explicarComoDevolveu(devolucaoQuery.data.credito.codHistoBco)}
                    </p>
                  </div>
                ) : devolucaoQuery.data ? (
                  <div className="rounded-md border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                    Crédito de devolução <strong>não localizado</strong> no extrato importado desta conta —
                    o título está sinalizado, mas o lançamento de retorno ainda não foi encontrado. Pode ser que o
                    extrato (BCOMOVTO) dessa conta/período ainda não tenha sido sincronizado do Globus.
                  </div>
                ) : null}

                {/* REFEITO — o título que de fato liquidou a obrigação. */}
                {devolucaoQuery.data?.refeito && (
                  <div className="rounded-md border-l-4 border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/25 px-3 py-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                        ✓ Refeito por (pagamento que liquidou)
                      </span>
                      <span className="font-mono text-sm">{moeda(devolucaoQuery.data.refeito.valorAPagarCents)}</span>
                    </div>
                    <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5">
                      {rotularCompacto(TIPO_DOCUMENTO_LABEL, devolucaoQuery.data.refeito.tipoDocumento) || 'DOC'}{' '}
                      {devolucaoQuery.data.refeito.numeroDocumento ?? '-'}
                      {devolucaoQuery.data.refeito.numeroParcela !== null
                        ? ` · p${devolucaoQuery.data.refeito.numeroParcela}`
                        : ''}
                      {' · '}pago {dataFmt(devolucaoQuery.data.refeito.dataPagamento)}
                      {devolucaoQuery.data.refeito.documento && ` · borderô ${devolucaoQuery.data.refeito.documento}`}
                    </p>
                  </div>
                )}

                <p className="text-[10px] text-gray-400 dark:text-gray-500 italic leading-snug">
                  Dados extraídos do extrato bancário importado (BCOMOVTO) — o crédito de devolução casa
                  a mesma conta, mesmo valor e a data do pagamento. Nada é inferido.
                </p>
              </div>
            </Secao>
          )}
          {/* Substituição: este título foi relançado no Globus. Aparece pra histórico,
              mas NÃO entra nos totais (senão dobraria o valor do sucessor). Ver SFN-48. */}
          {cp.substituido && (
            <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
              Este título foi <strong>substituído</strong> por um relançamento no Globus
              {cp.substituidoPorDoc ? (
                <>
                  {' '}(documento <strong>{cp.substituidoPorDoc}</strong>)
                </>
              ) : null}
              . Ele aparece aqui para histórico, mas <strong>não entra nos totais</strong> — o que vale é o
              título que o substituiu.
            </div>
          )}
          {/* Trilha de substituição: os ESTADOS pelos quais o documento passou
              (NF → Recibo → Boleto...) até o final. Só o final conta no total. */}
          {cadeiaQuery.data && cadeiaQuery.data.total > 1 && (
            <Secao titulo="Versões do documento (substituição)">
              <div className="py-2">
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2 leading-snug">
                  Esta obrigação passou por <strong>{cadeiaQuery.data.total} estados</strong> no Globus. Só o{' '}
                  <strong>estado final</strong> vale e conta no total — os anteriores foram substituídos
                  (não somam, pra não inflar o valor).
                </p>
                <ol className="space-y-2">
                  {cadeiaQuery.data.cadeia.map((c, i) => (
                    <li
                      key={c.id}
                      className={`rounded-md border-l-4 px-2.5 py-1.5 ${
                        c.final
                          ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/25'
                          : 'border-amber-400 bg-amber-50/70 dark:bg-amber-950/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span
                          className={`text-[11px] ${
                            c.atual ? 'font-bold text-pioneira-800 dark:text-yellow-300' : 'font-medium text-gray-700 dark:text-gray-200'
                          }`}
                        >
                          <span className="font-mono text-gray-400">{i + 1}.</span>{' '}
                          {rotularCompacto(TIPO_DOCUMENTO_LABEL, c.tipoDocumento) || 'DOC'} {c.numeroDocumento ?? '-'}
                          {c.numeroParcela !== null ? ` · p${c.numeroParcela}` : ''}
                          {c.atual ? ' (este)' : ''}
                        </span>
                        {(() => {
                          // Final = o que CONTA no total — NÃO significa pago. O estado final
                          // pode estar pendente (ex.: boleto gerado, ainda não compensado no
                          // banco). Usa o status REAL (mesma fonte da tela principal) e, quando
                          // há remessa/PE em trânsito, deixa isso explícito em vez de "pendente"
                          // seco — é o que causava a leitura de "ainda é só NF" pro financeiro.
                          if (!c.final) {
                            return (
                              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-amber-500 text-white dark:bg-amber-600">
                                ⚠ substituído · não conta
                              </span>
                            );
                          }
                          const emTransito = c.status !== 'pago' && c.status !== 'cancelado' && c.numeroRemessa && c.statusPe !== 'PG';
                          if (emTransito) {
                            return (
                              <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-sky-500 text-white dark:bg-sky-600">
                                📤 estado final · boleto enviado, aguardando banco
                              </span>
                            );
                          }
                          return (
                            <span
                              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white ${
                                c.status === 'pago'
                                  ? 'bg-emerald-500 dark:bg-emerald-600'
                                  : c.status === 'cancelado'
                                    ? 'bg-red-500 dark:bg-red-600'
                                    : 'bg-sky-500 dark:bg-sky-600'
                              }`}
                            >
                              ✓ estado final · {(STATUS_LABEL[c.status]?.label ?? c.status).toLowerCase()}
                            </span>
                          );
                        })()}
                      </div>
                      {c.final && c.numeroRemessa && c.statusPe !== 'PG' && c.status !== 'pago' && (
                        <p className="mt-1 flex items-start gap-1 rounded bg-sky-50 dark:bg-sky-950/30 px-2 py-1 text-[10px] text-sky-800 dark:text-sky-200">
                          <span>📤</span>
                          <span>
                            Boleto gerado — remessa <strong>Nº {c.numeroRemessa}</strong>
                            {c.dataRemessa ? ` enviada ao banco em ${format(new Date(c.dataRemessa), 'dd/MM/yyyy HH:mm')}` : ''}.
                            Ainda <strong>aguardando confirmação de compensação</strong> — o Globus só marca como pago quando o banco
                            retorna. Se o relatório do Globus já mostra pago, é porque a confirmação chegou depois do último sync
                            (clique em &quot;Reconciliar abertos&quot; pra atualizar).
                          </span>
                        </p>
                      )}
                      <span className="block text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {c.dataInclusao ? `lançado ${format(new Date(c.dataInclusao), 'dd/MM/yyyy')}` : ''}
                        {c.dataPagamento ? ` · pago ${format(new Date(`${c.dataPagamento}T00:00:00`), 'dd/MM/yyyy')}` : ''}
                        {' · '}
                        <span className={c.final ? 'font-semibold' : 'line-through'}>{moeda(c.valorAPagarCents)}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </Secao>
          )}

          <Secao titulo="Fornecedor">
            <Linha label="Razão Social" valor={cp.fornecedor?.razaoSocial ?? '-'} />
            <Linha label="Nome Fantasia" valor={cp.fornecedor?.nomeFantasia ?? '-'} />
            <Linha label="CNPJ/CPF" valor={cp.fornecedor?.cnpjCpf ?? '-'} mono />
            {/* Favorecido "real": so mostra quando difere do fornecedor cadastrado
                (ex.: fornecedor generico cujo pagamento foi pra outra pessoa). */}
            {cp.favorecido.nome && cp.favorecido.nome !== cp.fornecedor?.razaoSocial && (
              <Linha
                label="Favorecido real"
                valor={
                  <span className="inline-flex flex-col items-end">
                    <strong>{cp.favorecido.nome}</strong>
                    {cp.favorecido.inscricao && (
                      <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                        {cp.favorecido.tipoInscricao ? `${cp.favorecido.tipoInscricao} ` : ''}
                        {cp.favorecido.inscricao}
                      </span>
                    )}
                  </span>
                }
              />
            )}
          </Secao>

          <Secao titulo="Datas">
            <Linha label="Emissão" valor={dataFmt(cp.dataEmissao)} />
            <Linha label="Entrada" valor={dataFmt(cp.dataEntrada)} />
            <Linha label="Competência" valor={dataFmt(cp.competencia)} />
            <Linha
              label="Vencimento"
              valor={
                <span className="flex flex-col items-end">
                  <strong>{dataFmt(cp.dataVencimento)}</strong>
                  {cp.vencimentoAnterior && (
                    <span
                      className="text-[11px] font-medium text-violet-700 dark:text-violet-300"
                      title={cp.vencimentoAlteradoEm ? `Alterado no Globus em ${dataFmt(cp.vencimentoAlteradoEm.slice(0, 10))}` : undefined}
                    >
                      ↪ prorrogado — vencia {dataFmt(cp.vencimentoAnterior)}
                    </span>
                  )}
                </span>
              }
            />
            <Linha label="Pagamento" valor={dataFmt(cp.dataPagamento)} />
          </Secao>

          <Secao titulo="Valores">
            <Linha label="Valor Bruto" valor={moeda(cp.valorBrutoCents)} mono />
            <Linha label="Desconto" valor={`- ${moeda(cp.descontoCents)}`} mono />
            <Linha label="Juros" valor={`+ ${moeda(cp.jurosCents)}`} mono />
            <Linha label="Multa / Acréscimo" valor={`+ ${moeda(cp.multaCents)}`} mono />
            <Linha label="Valor Líquido" valor={<strong>{moeda(cp.valorLiquidoCents)}</strong>} mono />
          </Secao>

          {/* Itens por conta contábil (natureza da despesa): quando o valor do título
              é a SOMA de itens com classificações contábeis diferentes (ex.: Consertos
              e Reformas + Consumo da Oficina + Eletricidade), mostra a quebra (CPGITDOC
              agrupado por CODCONTACTB -> CTBCONTA). Se ESTE estado não tem a quebra (ex.:
              Boleto relançado com 1 conta), HERDA da versão da cadeia que tem (a NF de
              origem) — é a mesma obrigação. Só aparece com 2+ contas. */}
          {(() => {
            const propria = cp.rateioContas && cp.rateioContas.length > 1 ? cp.rateioContas : null;
            let contas = propria;
            let herdadoDe: { tipo: string | null; numero: string | null } | null = null;
            if (!contas && cadeiaQuery.data) {
              const fonte = cadeiaQuery.data.cadeia
                .filter((c) => !c.atual && (c.rateioContas?.length ?? 0) > 1)
                .sort((a, b) => (b.rateioContas?.length ?? 0) - (a.rateioContas?.length ?? 0))[0];
              if (fonte?.rateioContas) {
                contas = fonte.rateioContas;
                herdadoDe = { tipo: fonte.tipoDocumento, numero: fonte.numeroDocumento };
              }
            }
            if (!contas) return null;
            const totalContas = contas.reduce((s, c) => s + c.valorCents, 0);
            const pcts = percentuaisInteiros(contas.map((c) => c.valorCents), totalContas);
            return (
              <Secao titulo="Itens por conta contábil">
                <div className="py-1">
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2 leading-snug">
                    Este valor é a <strong>soma de {contas.length} itens</strong> com naturezas de despesa
                    diferentes (classificação contábil de cada item do documento)
                    {herdadoDe && (
                      <>
                        {' '}— itemização da versão{' '}
                        <strong>
                          {rotularCompacto(TIPO_DOCUMENTO_LABEL, herdadoDe.tipo) || 'NF'} {herdadoDe.numero ?? ''}
                        </strong>{' '}
                        (este estado foi relançado com uma conta só)
                      </>
                    )}
                    :
                  </p>
                  <ul className="space-y-1.5">
                    {contas.map((c, idx) => (
                      <li key={`${c.classificador}-${idx}`} className="flex items-start justify-between gap-3 text-xs">
                        <span className="min-w-0">
                          <span className="font-medium text-gray-800 dark:text-gray-100">{c.nome ?? 'Conta sem nome'}</span>
                          <span className="block text-[10px] text-gray-400 dark:text-gray-500 font-mono">{c.classificador}</span>
                        </span>
                        <span className="font-mono shrink-0 text-right">
                          {moeda(c.valorCents)}
                          <span className="text-gray-400 dark:text-gray-500"> · {pcts[idx] ?? 0}%</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex items-center justify-between gap-3 text-xs font-semibold mt-2 pt-1.5 border-t border-gray-200 dark:border-gray-700">
                    <span>Total dos itens</span>
                    <span className="font-mono">{moeda(totalContas)}</span>
                  </div>
                </div>
              </Secao>
            );
          })()}

          {cp.retencoes.totalCents > 0 && (
            <Secao titulo="Retenções na fonte">
              {cp.retencoes.inssCents > 0 && <Linha label="INSS" valor={moeda(cp.retencoes.inssCents)} mono />}
              {cp.retencoes.irrfCents > 0 && <Linha label="IRRF" valor={moeda(cp.retencoes.irrfCents)} mono />}
              {cp.retencoes.pisCents > 0 && <Linha label="PIS" valor={moeda(cp.retencoes.pisCents)} mono />}
              {cp.retencoes.cofinsCents > 0 && <Linha label="COFINS" valor={moeda(cp.retencoes.cofinsCents)} mono />}
              {cp.retencoes.csllCents > 0 && <Linha label="CSLL" valor={moeda(cp.retencoes.csllCents)} mono />}
              {cp.retencoes.issCents > 0 && <Linha label="ISS" valor={moeda(cp.retencoes.issCents)} mono />}
              <Linha label="Total de Retenções" valor={<strong>- {moeda(cp.retencoes.totalCents)}</strong>} mono />
            </Secao>
          )}

          {/* Conferência tributária: só faz sentido em NF de serviço. Para folha/guia/
              boleto a heurística não se aplica — evita fetch e ruído. */}
          {TIPOS_NF_SERVICO.includes((cp.tipoDocumento ?? '').toUpperCase()) && (
            <ConferenciaTributaria contaPagarId={cp.id} />
          )}

          <Secao titulo={pago ? 'Pagamento realizado' : 'A pagar'}>
            <Linha
              label={pago ? 'Valor pago' : 'Valor liquido a pagar'}
              valor={
                <span className="inline-flex items-center gap-2">
                  {pago && (
                    <Badge variant="success" className="text-[10px]">PAGO</Badge>
                  )}
                  <strong
                    className={`text-lg ${pago ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}
                  >
                    {moeda(cp.valorAPagarCents)}
                  </strong>
                </span>
              }
              mono
            />
            {pago ? (
              <Linha label="Pago em" valor={<strong>{dataFmt(cp.dataPagamento)}</strong>} />
            ) : (
              <Linha label="Vence em" valor={<strong>{dataFmt(cp.dataVencimento)}</strong>} />
            )}
            {reparcelamento && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400 italic pt-1.5 leading-snug">
                Parcela de um título <strong>reparcelado</strong>: o valor foi fatiado entre as parcelas, que
                costumam ser quitadas juntas{cp.pagamento.documento ? ` no mesmo borderô (${cp.pagamento.documento})` : ''} —
                por isso aparecem pagas na mesma data. <strong>Não</strong> são parcelas a vencer.
              </p>
            )}
          </Secao>

          <Secao titulo="Forma de pagamento">
            {/* "quando não tem dado, o sistema diz que não tem": modalidade vem vazia
                em ~70% dos títulos e o tipo de pagamento (TIPODOCPAGTOCPG) vem vazio
                quase sempre — em vez de "-" mudo, deixamos explícito. Ver SFN-48. */}
            <Linha
              label="Modalidade"
              valor={
                cp.modalidadePagamento ? (
                  rotular(MODALIDADE_PAGAMENTO_LABEL, cp.modalidadePagamento)
                ) : (
                  <span className="text-gray-400 dark:text-gray-500 italic">não informada no Globus</span>
                )
              }
            />
            {/* "Tipo de pagamento" (TIPODOCPAGTOCPG) é campo morto no Globus da Pioneira
                (vazio em 100%) — escondido pra não virar ruído. Só a modalidade vale. */}
            {/* Banco que efetivamente pagou (conta da empresa). Só aparece em títulos
                já sincronizados com o Globus ligado (Oracle). */}
            <Linha
              label="Banco que pagou"
              valor={
                cp.pagamento.bancoNome || cp.pagamento.bancoCodigo != null ? (
                  <span>
                    {cp.pagamento.bancoNome ?? `Banco ${cp.pagamento.bancoCodigo}`}
                    {cp.pagamento.bancoCodigo != null && cp.pagamento.bancoNome && (
                      <span className="text-[11px] text-gray-500 dark:text-gray-400"> ({cp.pagamento.bancoCodigo})</span>
                    )}
                  </span>
                ) : (
                  '-'
                )
              }
            />
            {(cp.pagamento.agencia || cp.pagamento.conta) && (
              <Linha
                label="Agência / Conta"
                valor={`${cp.pagamento.agencia ?? '-'} / ${cp.pagamento.conta ?? '-'}`}
                mono
              />
            )}
            <Linha label="Documento / Borderô" valor={cp.pagamento.documento ?? '-'} mono />
            {/* Remessa enviada ao banco (pagamento eletrônico). Borderô/cheque não tem. */}
            {cp.pagamento.numeroRemessa && (
              <Linha
                label="Remessa ao banco"
                valor={
                  <span>
                    Nº {cp.pagamento.numeroRemessa}
                    {cp.pagamento.dataRemessa && (
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {' '}· {format(new Date(cp.pagamento.dataRemessa), 'dd/MM/yyyy HH:mm')}
                      </span>
                    )}
                  </span>
                }
                mono
              />
            )}
            {/* Confirmação bancária do pagamento eletrônico (CPGDOCTO.AUTELETRONICA /
                STATUSPE). Só o pagamento eletrônico tem comprovante; para um título
                pago sem isso, mostramos explícito em vez de esconder. O "documento de
                retorno do banco" (NRDOCTORETBCOPE) vem vazio na Pioneira. Ver SFN-48. */}
            {pago && (
              <>
                <Linha
                  label="Autenticação eletrônica"
                  valor={
                    cp.pagamento.autenticacaoEletronica ? (
                      <span className="font-mono text-[11px] break-all">{cp.pagamento.autenticacaoEletronica}</span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500 italic">pagamento por outro meio (sem registro eletrônico)</span>
                    )
                  }
                />
                {cp.pagamento.statusPe && (
                  <Linha
                    label="Status do pagamento eletrônico"
                    valor={cp.pagamento.statusPe === 'PG' ? 'Pago (PG)' : cp.pagamento.statusPe}
                  />
                )}
                {cp.pagamento.autenticacaoEletronica && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 italic pt-1 leading-snug">
                    Código de autenticação (protocolo do banco) que comprova o pagamento eletrônico.
                  </p>
                )}
              </>
            )}
            <Linha label="Pagamento liberado" valor={cp.pagamentoLiberado ? 'Sim' : 'Não'} />
            <Linha label="Quitado" valor={cp.quitado ? 'Sim' : 'Não'} />
            {/* Grupo do borderô: quando o mesmo movimento bancário pagou mais de um
                título (ex.: parcelas de um adiantamento), deixa claro que é UM débito. */}
            {grupoQuery.data && grupoQuery.data.quantidade > 1 && (
              <div className="pt-2 mt-1 border-t border-gray-100 dark:border-gray-800/50">
                <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-snug">
                  Este pagamento{grupoQuery.data.documento ? ` (borderô ${grupoQuery.data.documento})` : ''} foi UM débito que cobriu{' '}
                  <strong>{grupoQuery.data.quantidade} títulos</strong> — total{' '}
                  <strong className="font-mono">{moeda(grupoQuery.data.totalCents)}</strong>:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {grupoQuery.data.titulos.map((t) => (
                    <li
                      key={t.id}
                      className={`text-[11px] flex justify-between gap-2 ${
                        t.substituido
                          ? 'text-amber-700 dark:text-amber-500'
                          : t.id === cp.id
                            ? 'font-semibold text-pioneira-800 dark:text-yellow-300'
                            : 'text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      <span className="truncate">
                        {rotularCompacto(TIPO_DOCUMENTO_LABEL, t.tipoDocumento) || 'DOC'} {t.numeroDocumento ?? '-'}
                        {t.numeroParcela !== null ? ` · p${t.numeroParcela}` : ''}
                        {t.id === cp.id ? ' (este)' : ''}
                        {t.substituido && (
                          <span className="ml-1 inline-flex items-center rounded px-1 text-[8px] font-bold uppercase tracking-wide bg-amber-500 text-white align-middle">
                            subst.
                          </span>
                        )}
                      </span>
                      <span
                        className={`font-mono shrink-0 ${
                          t.substituido ? 'line-through text-amber-600/80 dark:text-amber-500/80' : ''
                        }`}
                      >
                        {moeda(t.valorAPagarCents)}
                      </span>
                    </li>
                  ))}
                </ul>
                {grupoQuery.data.titulos.some((t) => t.substituido) && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-500 italic mt-1 leading-snug">
                    Itens em âmbar (riscados) foram substituídos (ex.: NF relançada como boleto) e não entram no total.
                  </p>
                )}
              </div>
            )}
            {/* Remessa enviada ao banco: títulos mandados no MESMO arquivo (lote). Deixa
                claro "esse documento foi pra pagar junto com mais N". Ver memory/globus-cp-remessa-pe. */}
            {remessaQuery.data && remessaQuery.data.quantidade > 1 && (
              <div className="pt-2 mt-1 border-t border-sky-100 dark:border-sky-900/40">
                <p className="text-[11px] text-gray-600 dark:text-gray-300 leading-snug">
                  📤 Enviado ao banco na <strong>remessa Nº {remessaQuery.data.numeroRemessa}</strong>
                  {remessaQuery.data.dataRemessa
                    ? ` (${format(new Date(remessaQuery.data.dataRemessa), 'dd/MM/yyyy HH:mm')})`
                    : ''}
                  , junto com <strong>{remessaQuery.data.quantidade} títulos</strong> — total{' '}
                  <strong className="font-mono">{moeda(remessaQuery.data.totalCents)}</strong>:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {remessaQuery.data.titulos.map((t) => (
                    <li
                      key={t.id}
                      className={`text-[11px] flex justify-between gap-2 ${
                        t.substituido
                          ? 'text-amber-700 dark:text-amber-500'
                          : t.id === cp.id
                            ? 'font-semibold text-pioneira-800 dark:text-yellow-300'
                            : 'text-gray-600 dark:text-gray-300'
                      }`}
                    >
                      <span className="truncate">
                        {rotularCompacto(TIPO_DOCUMENTO_LABEL, t.tipoDocumento) || 'DOC'} {t.numeroDocumento ?? '-'}
                        {t.numeroParcela !== null ? ` · p${t.numeroParcela}` : ''}
                        {t.id === cp.id ? ' (este)' : ''}
                        {t.fornecedor ? ` · ${t.fornecedor}` : ''}
                      </span>
                      <span
                        className={`font-mono shrink-0 ${
                          t.substituido ? 'line-through text-amber-600/80 dark:text-amber-500/80' : ''
                        }`}
                      >
                        {moeda(t.valorAPagarCents)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 italic mt-1 leading-snug">
                  Remessa = o arquivo que o financeiro enviou ao banco (vários documentos de uma vez).
                  Pode diferir do borderô, que é como o banco liquidou.
                </p>
              </div>
            )}
          </Secao>

          <Secao titulo="Origem">
            {cp.setorNome && (
              <Linha
                label="Setor (centro de custo)"
                valor={
                  <span className="inline-flex items-center gap-1.5">
                    <strong>{cp.setorNome}</strong>
                    {cp.codSetor && <span className="text-[11px] text-gray-500 dark:text-gray-400 font-normal">({cp.codSetor})</span>}
                    {cp.setorRateado && (
                      <Badge variant="warning" className="text-[10px]" title="Rateio entre várias unidades. Exibida a de MAIOR valor; a quebra completa está abaixo.">
                        maior valor
                      </Badge>
                    )}
                  </span>
                }
              />
            )}
            {/* Quebra do rateio: o título dividido entre várias unidades (CODCUSTOFIN).
                O setor acima é só a dominante; aqui mostra todas + valor + %. */}
            {cp.rateioSetores && cp.rateioSetores.length > 1 && (() => {
              const totalRateio = cp.rateioSetores.reduce((s, r) => s + r.valorCents, 0);
              return (
                <div className="py-2 border-b border-gray-100 dark:border-gray-800/50">
                  <p className="text-[11px] text-gray-600 dark:text-gray-300 mb-1.5 leading-snug">
                    <strong>Rateio por unidade ({cp.rateioSetores.length})</strong> — o valor do título foi dividido entre estas unidades:
                    {onFiltrarSetor && (
                      <span className="text-gray-400 dark:text-gray-500"> (clique numa unidade para filtrar)</span>
                    )}
                  </p>
                  <ul className="space-y-1">
                    {(() => {
                      const pcts = percentuaisInteiros(cp.rateioSetores.map((u) => u.valorCents), totalRateio);
                      return cp.rateioSetores.map((r, idx) => {
                      const pct = pcts[idx] ?? 0;
                      const conteudoUnidade = (
                        <>
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: corDoSetor(r.codigo) }} />
                          <span className="truncate">{r.nome ?? `Cód. ${r.codigo}`}</span>
                          <span className="text-gray-400 dark:text-gray-500">({r.codigo})</span>
                        </>
                      );
                      return (
                        <li key={r.codigo} className="flex items-center justify-between gap-3 text-[11px]">
                          {onFiltrarSetor ? (
                            <button
                              type="button"
                              onClick={() => onFiltrarSetor(r.codigo, r.nome)}
                              title={`Filtrar Contas a Pagar pela unidade ${r.nome ?? r.codigo}`}
                              className="inline-flex items-center gap-1.5 min-w-0 -mx-1 rounded px-1 text-left hover:bg-gray-100 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:hover:bg-gray-800/60"
                            >
                              {conteudoUnidade}
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 min-w-0">{conteudoUnidade}</span>
                          )}
                          <span className="font-mono shrink-0">
                            {moeda(r.valorCents)} <span className="text-gray-400 dark:text-gray-500">· {pct}%</span>
                          </span>
                        </li>
                      );
                      });
                    })()}
                  </ul>
                  <div className="flex items-center justify-between gap-3 text-[11px] font-semibold mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-700">
                    <span>Total</span>
                    <span className="font-mono">{moeda(totalRateio)}</span>
                  </div>
                </div>
              );
            })()}
            <Linha
              label="Origem do título"
              valor={<strong>{ORIGEM_DOCUMENTO_CP_LABELS[cp.origemDocumento] ?? cp.origemDocumento}</strong>}
            />
            {cp.origemDocumento === 'folha' && (
              <>
                <Linha label="Competência da folha" valor={cp.competenciaFlp ? format(new Date(`${cp.competenciaFlp}T00:00:00`), 'MM/yyyy') : '-'} />
                <Linha label="Integrou em" valor={cp.dataIntegrouFlp ? format(new Date(`${cp.dataIntegrouFlp}T00:00:00`), 'dd/MM/yyyy') : '-'} />
              </>
            )}
            <Linha label="Sistema" valor={cp.origemSistema} />
            <Linha label="ID externo" valor={cp.origemIdExterno} mono />
            <Linha label="Último sync" valor={cp.ultimoSyncEm ? format(new Date(cp.ultimoSyncEm), 'dd/MM/yyyy HH:mm') : '-'} />
          </Secao>

          {cp.observacao && (
            <Secao titulo="Observação">
              <p className="py-2 text-sm whitespace-pre-wrap">{cp.observacao}</p>
            </Secao>
          )}

          {/* Trilha REAL primeiro: é a fonte da verdade e mostra cancelamento/
              repagamento. O fluxo inferido fica abaixo, como leitura resumida. */}
          <Secao titulo="Trilha no Globus">
            <TrilhaGlobus contaPagarId={cp.id} />
          </Secao>

          <Secao titulo="Fluxo do documento (visão resumida)">
            <div className="py-2">
              <WorkflowInferido documentoTipo="conta_pagar" documentoId={cp.id} />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 italic mt-3 leading-snug">
                Resumo em etapas-padrão. Etapas com nome de usuário tem rastro real no Globus
                (login); as demais são inferidas pelo estado do documento. Para o que de fato
                aconteceu, use a <strong>Trilha no Globus</strong> acima.
              </p>
            </div>
          </Secao>
        </div>
      </DialogContent>
    </Dialog>
  );
}
