'use client';

import { format } from 'date-fns';
import type { ContaPagarResponse } from '@pioneira/shared/schemas/contas-pagar';
import {
  TIPO_DOCUMENTO_LABEL,
  MODALIDADE_PAGAMENTO_LABEL,
  TIPO_PAGTO_LABEL,
  rotular,
  rotularCompacto,
} from '@pioneira/shared/enums/globus-codigos';
import { ORIGEM_DOCUMENTO_CP_LABELS, CONTA_PAGAR_STATUS_DESCRICOES, type ContaPagarStatus } from '@pioneira/shared/enums/conta-pagar-status';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { WorkflowInferido } from '@/components/shared/WorkflowInferido';

interface DetalheCpDialogProps {
  cp: ContaPagarResponse | null;
  onClose: () => void;
}

function moeda(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dataFmt(d: string | null): string {
  if (!d) return '-';
  return format(new Date(`${d}T00:00:00`), 'dd/MM/yyyy');
}

/**
 * Cor estavel por codigo de setor (centro de custo financeiro) — cada unidade
 * ganha sempre a mesma cor, sem cadastro. Hash simples do codigo -> matiz.
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
  className,
}: {
  nome: string;
  codigo?: string | null;
  rateado?: boolean;
  className?: string;
}) {
  const cor = corDoSetor(codigo);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className ?? ''}`}
      style={{ backgroundColor: `${cor}22`, color: cor }}
      title={rateado ? `${nome} (rateado — unidade dominante)` : nome}
    >
      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: cor }} />
      {nome}
      {rateado && <span className="text-[10px] font-normal opacity-80">· rateado</span>}
    </span>
  );
}

const STATUS_LABEL: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'muted' }> = {
  pendente: { label: 'Pendente', variant: 'warning' },
  em_aprovacao: { label: 'Em aprovacao', variant: 'warning' },
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

export function DetalheCpDialog({ cp, onClose }: DetalheCpDialogProps) {
  if (!cp) return null;
  const statusCfg = STATUS_LABEL[cp.status] ?? { label: cp.status, variant: 'muted' as const };
  const statusDescricao = CONTA_PAGAR_STATUS_DESCRICOES[cp.status as ContaPagarStatus] ?? '';

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
              {cp.setorNome && <SetorPill nome={cp.setorNome} codigo={cp.codSetor} rateado={cp.setorRateado} />}
              <Badge variant={statusCfg.variant} title={statusDescricao}>{statusCfg.label}</Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <Secao titulo="Fornecedor">
            <Linha label="Razao Social" valor={cp.fornecedor?.razaoSocial ?? '-'} />
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
            <Linha label="Emissao" valor={dataFmt(cp.dataEmissao)} />
            <Linha label="Entrada" valor={dataFmt(cp.dataEntrada)} />
            <Linha label="Competencia" valor={dataFmt(cp.competencia)} />
            <Linha label="Vencimento" valor={<strong>{dataFmt(cp.dataVencimento)}</strong>} />
            <Linha label="Pagamento" valor={dataFmt(cp.dataPagamento)} />
          </Secao>

          <Secao titulo="Valores">
            <Linha label="Valor Bruto" valor={moeda(cp.valorBrutoCents)} mono />
            <Linha label="Desconto" valor={`- ${moeda(cp.descontoCents)}`} mono />
            <Linha label="Juros" valor={`+ ${moeda(cp.jurosCents)}`} mono />
            <Linha label="Multa / Acrescimo" valor={`+ ${moeda(cp.multaCents)}`} mono />
            <Linha label="Valor Liquido" valor={<strong>{moeda(cp.valorLiquidoCents)}</strong>} mono />
          </Secao>

          {cp.retencoes.totalCents > 0 && (
            <Secao titulo="Retencoes na fonte">
              {cp.retencoes.inssCents > 0 && <Linha label="INSS" valor={moeda(cp.retencoes.inssCents)} mono />}
              {cp.retencoes.irrfCents > 0 && <Linha label="IRRF" valor={moeda(cp.retencoes.irrfCents)} mono />}
              {cp.retencoes.pisCents > 0 && <Linha label="PIS" valor={moeda(cp.retencoes.pisCents)} mono />}
              {cp.retencoes.cofinsCents > 0 && <Linha label="COFINS" valor={moeda(cp.retencoes.cofinsCents)} mono />}
              {cp.retencoes.csllCents > 0 && <Linha label="CSLL" valor={moeda(cp.retencoes.csllCents)} mono />}
              {cp.retencoes.issCents > 0 && <Linha label="ISS" valor={moeda(cp.retencoes.issCents)} mono />}
              <Linha label="Total de Retencoes" valor={<strong>- {moeda(cp.retencoes.totalCents)}</strong>} mono />
            </Secao>
          )}

          <Secao titulo="A pagar">
            <Linha
              label="Valor liquido a pagar"
              valor={<strong className="text-lg text-emerald-700 dark:text-emerald-400">{moeda(cp.valorAPagarCents)}</strong>}
              mono
            />
          </Secao>

          <Secao titulo="Pagamento">
            <Linha label="Modalidade" valor={cp.modalidadePagamento ? rotular(MODALIDADE_PAGAMENTO_LABEL, cp.modalidadePagamento) : '-'} />
            <Linha label="Tipo de pagamento" valor={cp.tipoPagto ? rotular(TIPO_PAGTO_LABEL, cp.tipoPagto) : '-'} />
            {/* Banco que efetivamente pagou (conta da empresa). So aparece em titulos
                ja sincronizados com o Globus ligado (Oracle). */}
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
                label="Agencia / Conta"
                valor={`${cp.pagamento.agencia ?? '-'} / ${cp.pagamento.conta ?? '-'}`}
                mono
              />
            )}
            <Linha label="Documento / Bordero" valor={cp.pagamento.documento ?? '-'} mono />
            <Linha label="Pagamento liberado" valor={cp.pagamentoLiberado ? 'Sim' : 'Nao'} />
            <Linha label="Quitado" valor={cp.quitado ? 'Sim' : 'Nao'} />
          </Secao>

          <Secao titulo="Origem">
            {cp.setorNome && (
              <Linha
                label="Setor (centro de custo)"
                valor={
                  <span className="inline-flex items-center gap-1.5">
                    <strong>{cp.setorNome}</strong>
                    {cp.codSetor && <span className="text-[11px] text-gray-500 dark:text-gray-400 font-normal">({cp.codSetor})</span>}
                    {cp.setorRateado && <Badge variant="warning" className="text-[10px]" title="Título com itens em mais de uma unidade. Exibida a unidade de maior valor.">rateado</Badge>}
                  </span>
                }
              />
            )}
            <Linha
              label="Origem do titulo"
              valor={<strong>{ORIGEM_DOCUMENTO_CP_LABELS[cp.origemDocumento] ?? cp.origemDocumento}</strong>}
            />
            {cp.origemDocumento === 'folha' && (
              <>
                <Linha label="Competencia da folha" valor={cp.competenciaFlp ? format(new Date(`${cp.competenciaFlp}T00:00:00`), 'MM/yyyy') : '-'} />
                <Linha label="Integrou em" valor={cp.dataIntegrouFlp ? format(new Date(`${cp.dataIntegrouFlp}T00:00:00`), 'dd/MM/yyyy') : '-'} />
              </>
            )}
            <Linha label="Sistema" valor={cp.origemSistema} />
            <Linha label="ID externo" valor={cp.origemIdExterno} mono />
            <Linha label="Ultimo sync" valor={cp.ultimoSyncEm ? format(new Date(cp.ultimoSyncEm), 'dd/MM/yyyy HH:mm') : '-'} />
          </Secao>

          {cp.observacao && (
            <Secao titulo="Observacao">
              <p className="py-2 text-sm whitespace-pre-wrap">{cp.observacao}</p>
            </Secao>
          )}

          <Secao titulo="Fluxo do documento">
            <div className="py-2">
              <WorkflowInferido documentoTipo="conta_pagar" documentoId={cp.id} />
              <p className="text-[10px] text-gray-400 dark:text-gray-500 italic mt-3 leading-snug">
                Etapas com nome de usuario tem rastro real no Globus (login). As demais sao
                inferidas pelo estado do documento.
              </p>
            </div>
          </Secao>
        </div>
      </DialogContent>
    </Dialog>
  );
}
