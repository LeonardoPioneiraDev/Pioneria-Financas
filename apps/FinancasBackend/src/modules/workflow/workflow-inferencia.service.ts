import type { FastifyInstance } from 'fastify';
import type {
  WorkflowInferenciaResponse,
  EtapaInferida,
  WorkflowInferenciaEstado,
} from '@pioneira/shared';
import { WorkflowTemplate, type EtapaTemplate } from '@/entities/workflow-template.entity.js';
import { ContaPagar } from '@/entities/conta-pagar.entity.js';
import { ContaReceber } from '@/entities/conta-receber.entity.js';
import { CpEvento } from '@/entities/cp-evento.entity.js';

/**
 * Inferência automática de workflow.
 *
 * Em vez de manter `WorkflowInstance` editável por usuário, esta função deriva
 * a etapa atual diretamente do estado do documento (campos vindos do Globus +
 * marcadores internos como `excluido_em`). Idempotente, sempre coerente.
 *
 * Cada `inferir{Tipo}` retorna:
 *   - chaveEtapaAtual: a etapa "ativa" agora
 *   - status: em_andamento | concluido | cancelado | bloqueado
 *   - sinais: dicionário do que foi detectado (auditável)
 *   - etapasConcluidas: lista das chaves de etapas já consumadas
 *     (usado pra marcar passadas vs puladas vs futuras)
 */

interface AuditoriaEtapa {
  usuario: string | null;
  data: string | null;
  /** Logins adicionais (ex: ASSINATURA_1, ASSINATURA_2 do CPGDOCTO). */
  usuariosSecundarios?: string[];
  /** Nota honesta quando não há usuário rastreável (ex: baixa sem executor no Globus). */
  nota?: string;
  /** Verbo antes do login. Default da UI: "por". Ver comentário da etapa `pagamento`. */
  acaoRotulo?: string;
  /** Ressalva exibida mesmo com usuário — declara o que o Globus NÃO registra. */
  ressalva?: string;
}

interface Inferencia {
  chaveEtapaAtual: string | null;
  status: 'em_andamento' | 'concluido' | 'cancelado' | 'bloqueado';
  sinais: Record<string, unknown>;
  /** Chaves de etapas já efetivamente concluídas (incluindo a 'atual' se status=concluido). */
  etapasConcluidas: string[];
  /** Rastro real (usuário+data) por chave de etapa. Etapas sem rastro não aparecem aqui. */
  auditoriaPorChave: Map<string, AuditoriaEtapa>;
}

// ============================================================================
// CONTA A PAGAR — marcos do Globus (CPGDOCTO):
//   1. inclusao         ← USUARIO_INCLUSAO + DATA_INCLUSAO (timestamp real)
//   2. liberacao_pagto  ← USUARIO_LIB_PAGTO_APROVE_ME / USUARIO_LIBEROU_PAGTO
//                         + DATALIBERACAOPGTO (timestamp real; eco do BGM_APROVEME)
//   3. assinatura       ← USUARIO_ASS_ELETRON_APROVE_ME (quase sempre vazio)
//   4. pagamento        ← evento com STATUSDOCTOCPG='B' no histórico (usuário e
//                         hora reais), com fallback em PAGAMENTOCPG/QUITADO.
//
// ATENÇÃO ao significado da etapa 4: o USUARIO desse evento é quem LANÇOU A
// BAIXA no ERP — não quem autorizou o pagamento no banco. O CPGDOCTO não tem
// nenhuma coluna de autorizador bancário (só USUARIO/_INCLUSAO/_EXC/
// _LIBEROU_PAGTO/_LIB_PAGTO_APROVE_ME/_ASS_ELETRON) e a assinatura eletrônica
// vem vazia na maioria dos títulos. Por isso a etapa se chama "Baixa no Globus"
// e carrega ressalva explícita: rotulá-la "pagamento efetuado por FULANO"
// atribuía a um auxiliar do financeiro um ato que ele não pratica.
// Ver memória cp-aprove-me-liberador-gap.
// Estado especial: cancelado (STATUSDOCTOCPG='C' ou excluido_em).
// ============================================================================

/** Formata 'YYYY-MM-DD' como 'DD/MM/YYYY' sem criar Date (zero risco de fuso). */
function dataBr(d: string | null): string | null {
  if (!d) return null;
  const [y, m, dd] = d.split('-');
  return y && m && dd ? `${dd}/${m}/${y}` : null;
}

/**
 * Monta o map de auditoria com os 4 marcos do CPGDOCTO.
 * Etapas sem dados não entram no map (UI marca como pendente).
 */
function montarAuditoriaCp(cp: ContaPagar, eventos: CpEvento[]): Map<string, AuditoriaEtapa> {
  const map = new Map<string, AuditoriaEtapa>();
  const isoOuNull = (d: Date | null): string | null => (d ? d.toISOString() : null);

  // Trilha real de eventos (CPGDOCTO_HISTORICO_NEGOCIACOES), ordenada por ocorrência.
  const ordenados = [...eventos].sort((a, b) =>
    (a.ocorridoEm ? a.ocorridoEm.getTime() : 0) - (b.ocorridoEm ? b.ocorridoEm.getTime() : 0),
  );
  const primeiroPorTipo = (cod: number): CpEvento | undefined => ordenados.find((e) => e.codTpEvento === cod);
  // Baixa = último evento cujo status resultante é 'B' (baixado/pago).
  const eventoBaixa = [...ordenados].reverse().find((e) => (e.statusDocto ?? '').toUpperCase() === 'B');

  // --- inclusao (evento Origem=1; senão campos cacheados do CPGDOCTO) ---
  const evInc = primeiroPorTipo(1);
  if (evInc || cp.usuarioInclusao || cp.dataInclusao) {
    map.set('inclusao', {
      usuario: evInc?.usuario ?? cp.usuarioInclusao,
      data: evInc ? isoOuNull(evInc.ocorridoEm) : (cp.dataInclusao ? cp.dataInclusao.toISOString() : null),
    });
  }

  // --- liberação (evento 9=liberação de pagamento; senão campos cacheados) ---
  const evLib = primeiroPorTipo(9);
  if (evLib || cp.usuarioLibPagto || cp.dataLiberacaoPagto) {
    map.set('liberacao_pagto', {
      usuario: evLib?.usuario ?? cp.usuarioLibPagto,
      data: evLib ? isoOuNull(evLib.ocorridoEm) : (cp.dataLiberacaoPagto ? cp.dataLiberacaoPagto.toISOString() : null),
    });
  }

  // --- assinatura (sem evento dedicado; vem de ASSINATURA_1/2 + assinante eletrônico) ---
  // Dedup; NÃO inventa data (o CPGDOCTO não tem timestamp de assinatura).
  const assinantes = [...new Set(
    [cp.usuarioAssinatura, cp.assinatura1, cp.assinatura2].filter((s): s is string => !!s),
  )];
  if (assinantes.length > 0) {
    map.set('assinatura', {
      usuario: assinantes[0]!,
      data: null,
      usuariosSecundarios: assinantes.length > 1 ? assinantes.slice(1) : undefined,
    });
  }

  // --- pagamento (a baixa no ERP) ---
  // O rótulo é deliberadamente "lançou a baixa no Globus", nunca "pagou": o
  // Globus registra o operador do ERP, e o autorizador no banco não existe em
  // nenhuma coluna do CPGDOCTO. A ressalva vai junto mesmo quando há usuário.
  const RESSALVA_AUTORIZADOR_BANCO =
    'Quem autorizou o pagamento no banco não é registrado pelo Globus — este nome é apenas o de quem lançou a baixa no ERP.';
  if (eventoBaixa) {
    map.set('pagamento', {
      usuario: eventoBaixa.usuario,
      data: isoOuNull(eventoBaixa.ocorridoEm),
      acaoRotulo: 'baixa lançada no Globus por',
      ressalva: RESSALVA_AUTORIZADOR_BANCO,
    });
  } else if (cp.dataPagamento || cp.quitado) {
    // Trilha de eventos ainda não sincronizada: honesto, sem inventar usuário.
    // (o dado EXISTE no Globus em CPGDOCTO_HISTORICO_NEGOCIACOES; basta sincronizar.)
    const dataBaixa = dataBr(cp.dataPagamento);
    map.set('pagamento', {
      usuario: null,
      data: null,
      nota: dataBaixa
        ? `Baixa registrada em ${dataBaixa}. Sincronize a trilha de eventos para ver quem lançou a baixa no Globus.`
        : 'Título quitado. Sincronize a trilha de eventos (CPGDOCTO_HISTORICO_NEGOCIACOES) para ver quem lançou a baixa no Globus.',
      ressalva: RESSALVA_AUTORIZADOR_BANCO,
    });
  }
  return map;
}

function inferirContaPagar(cp: ContaPagar, eventos: CpEvento[]): Inferencia {
  const sinais: Record<string, unknown> = {
    status: cp.status,
    quitado: cp.quitado,
    data_pagamento: cp.dataPagamento,
    pagamento_liberado: cp.pagamentoLiberado,
    excluido_em: cp.excluidoEm,
    excluido_motivo: cp.excluidoMotivo,
    usuario_inclusao: cp.usuarioInclusao,
    data_inclusao: cp.dataInclusao,
    usuario_lib_pagto: cp.usuarioLibPagto,
    data_liberacao_pagto: cp.dataLiberacaoPagto,
    usuario_assinatura: cp.usuarioAssinatura,
    eventos_trilha: eventos.length,
  };
  const auditoriaPorChave = montarAuditoriaCp(cp, eventos);

  // Evidência REAL por etapa — nada fabricado. Uma etapa só conta como
  // CONCLUÍDA se o Globus tem dado dela. Sem evidência, ela aparece como
  // "pulada" (não registrada), nunca como um marco inventado. Isso elimina a
  // antiga "assinatura fantasma" (que era marcada concluída só porque o título
  // foi pago, mesmo sem nenhum registro de assinatura no Globus).
  const ORDEM_ETAPAS = ['inclusao', 'liberacao_pagto', 'assinatura', 'pagamento'] as const;
  const temEvidencia: Record<(typeof ORDEM_ETAPAS)[number], boolean> = {
    // O registro existir JÁ prova que foi incluído — inclusao sempre ocorreu.
    // (o rastro usuário/data pode faltar; aí a UI mostra "sem rastro", não "pulada".)
    inclusao: true,
    liberacao_pagto: cp.pagamentoLiberado || !!cp.dataLiberacaoPagto || !!cp.usuarioLibPagto,
    assinatura: !!(cp.usuarioAssinatura || cp.assinatura1 || cp.assinatura2),
    pagamento: cp.quitado || !!cp.dataPagamento,
  };
  const etapasConcluidas = ORDEM_ETAPAS.filter((chave) => temEvidencia[chave]);

  // Cancelado tem prioridade absoluta (mantém só as etapas com evidência real).
  if (cp.excluidoEm || cp.status === 'cancelado') {
    return { chaveEtapaAtual: null, status: 'cancelado', sinais, etapasConcluidas, auditoriaPorChave };
  }

  // Pago: fluxo concluído; etapa atual = pagamento.
  if (temEvidencia.pagamento) {
    return { chaveEtapaAtual: 'pagamento', status: 'concluido', sinais, etapasConcluidas, auditoriaPorChave };
  }

  // Em andamento: a etapa atual é a primeira (em ordem) que ainda NÃO tem
  // evidência — é o que o documento está aguardando agora.
  const atual = ORDEM_ETAPAS.find((chave) => !temEvidencia[chave]) ?? 'pagamento';
  return { chaveEtapaAtual: atual, status: 'em_andamento', sinais, etapasConcluidas, auditoriaPorChave };
}

// ============================================================================
// CONTA A RECEBER — 5 etapas: emitido → enviado_cliente → em_cobranca
//                             → recebido → conciliado
// ============================================================================

function inferirContaReceber(cr: ContaReceber): Inferencia {
  const sinais: Record<string, unknown> = {
    status: cr.status,
    quitado: cr.quitado,
    data_recebimento: cr.dataRecebimento,
    fatura_impressa: cr.faturaImpressa,
    protestado: cr.protestado,
    renegociado: cr.renegociado,
    excluido_em: cr.excluidoEm,
    excluido_motivo: cr.excluidoMotivo,
  };

  // CR ainda não tem trilha de auditoria do Globus mapeada (próximo work item).
  const auditoriaPorChave = new Map<string, AuditoriaEtapa>();

  // Cancelado: prioridade absoluta.
  if (cr.excluidoEm || cr.status === 'cancelado') {
    return {
      chaveEtapaAtual: null,
      status: 'cancelado',
      sinais,
      etapasConcluidas: ['emitido'],
      auditoriaPorChave,
    };
  }

  // Recebido/pago → etapa final.
  if (cr.quitado || cr.dataRecebimento || cr.status === 'pago') {
    return {
      chaveEtapaAtual: 'conciliado',
      status: 'concluido',
      sinais,
      etapasConcluidas: ['emitido', 'enviado_cliente', 'em_cobranca', 'recebido', 'conciliado'],
      auditoriaPorChave,
    };
  }

  // Protestado → bloqueado em 'em_cobranca'.
  if (cr.protestado || cr.status === 'protestado') {
    return {
      chaveEtapaAtual: 'em_cobranca',
      status: 'bloqueado',
      sinais,
      etapasConcluidas: ['emitido', 'enviado_cliente'],
      auditoriaPorChave,
    };
  }

  // Fatura impressa → já foi para o cliente, está em cobrança.
  if (cr.faturaImpressa) {
    return {
      chaveEtapaAtual: 'em_cobranca',
      status: 'em_andamento',
      sinais,
      etapasConcluidas: ['emitido', 'enviado_cliente'],
      auditoriaPorChave,
    };
  }

  // Default: emitido (recém chegou do Globus).
  return {
    chaveEtapaAtual: 'emitido',
    status: 'em_andamento',
    sinais,
    etapasConcluidas: [],
    auditoriaPorChave,
  };
}

// ============================================================================
// MONTAGEM DA RESPOSTA
// ============================================================================

/**
 * Marca o estado de cada etapa do template a partir da inferência:
 *   - 'passada' : está na lista `etapasConcluidas` e não é a 'atual'
 *   - 'atual'   : chave === chaveEtapaAtual
 *   - 'pulada'  : não está em concluidas, mas vem ANTES da atual (Globus pulou)
 *   - 'futura'  : vem DEPOIS da atual
 */
function montarEtapasInferidas(
  etapasTemplate: EtapaTemplate[],
  inferencia: Inferencia,
): EtapaInferida[] {
  const concluidasSet = new Set(inferencia.etapasConcluidas);
  const idxAtual = inferencia.chaveEtapaAtual
    ? etapasTemplate.findIndex((e) => e.chave === inferencia.chaveEtapaAtual)
    : -1;

  return etapasTemplate.map((etapa, idx) => {
    let estado: WorkflowInferenciaEstado;
    if (etapa.chave === inferencia.chaveEtapaAtual) {
      estado = 'atual';
    } else if (concluidasSet.has(etapa.chave)) {
      estado = 'passada';
    } else if (idxAtual >= 0 && idx < idxAtual) {
      // Vem antes da atual mas não foi marcada como concluída → pulada pelo Globus.
      estado = 'pulada';
    } else {
      estado = 'futura';
    }

    return {
      ordem: etapa.ordem,
      chave: etapa.chave,
      nome: etapa.nome,
      descricao: etapa.descricao ?? null,
      papelResponsavel: etapa.papelResponsavel ?? null,
      icone: etapa.icone ?? null,
      cor: etapa.cor ?? null,
      estado,
      auditoria: inferencia.auditoriaPorChave.get(etapa.chave) ?? null,
    };
  });
}

export function buildWorkflowInferenciaService(fastify: FastifyInstance) {
  const templateRepo = fastify.db.getRepository(WorkflowTemplate);
  const cpRepo = fastify.db.getRepository(ContaPagar);
  const crRepo = fastify.db.getRepository(ContaReceber);
  const eventoRepo = fastify.db.getRepository(CpEvento);

  async function carregarTemplate(documentoTipo: string): Promise<WorkflowTemplate> {
    const tpl = await templateRepo.findOne({ where: { documentoTipo, ativo: true } });
    if (!tpl) {
      throw fastify.httpErrors.notFound(`Nenhum template ativo para documento tipo "${documentoTipo}"`);
    }
    return tpl;
  }

  return {
    async inferir(args: { documentoTipo: string; documentoId: string }): Promise<WorkflowInferenciaResponse> {
      const { documentoTipo, documentoId } = args;

      let inferencia: Inferencia;

      switch (documentoTipo) {
        case 'conta_pagar': {
          const cp = await cpRepo.findOne({ where: { id: documentoId } });
          if (!cp) throw fastify.httpErrors.notFound(`Conta a pagar ${documentoId} não encontrada`);
          // Trilha real de eventos do Globus (quem incluiu/liberou/PAGOU + hora).
          // Liga por cod_docto_cpg = origem_id_externo. Vazio = ainda não sincronizado.
          const eventos = await eventoRepo.find({ where: { codDoctoCpg: cp.origemIdExterno } });
          inferencia = inferirContaPagar(cp, eventos);
          break;
        }
        case 'conta_receber': {
          const cr = await crRepo.findOne({ where: { id: documentoId } });
          if (!cr) throw fastify.httpErrors.notFound(`Conta a receber ${documentoId} não encontrada`);
          inferencia = inferirContaReceber(cr);
          break;
        }
        default:
          throw fastify.httpErrors.badRequest(
            `Inferência automática não suportada para "${documentoTipo}" (suportados: conta_pagar, conta_receber)`,
          );
      }

      const template = await carregarTemplate(documentoTipo);
      const etapasInferidas = montarEtapasInferidas(template.etapas, inferencia);

      const idxAtual = etapasInferidas.findIndex((e) => e.estado === 'atual');
      const proxima = idxAtual >= 0 && idxAtual < etapasInferidas.length - 1
        ? etapasInferidas[idxAtual + 1]
        : null;
      const atual = idxAtual >= 0 ? etapasInferidas[idxAtual]! : null;

      return {
        documentoTipo,
        documentoId,
        template: { id: template.id, nome: template.nome },
        status: inferencia.status,
        etapaAtual: atual
          ? { chave: atual.chave, nome: atual.nome, ordem: atual.ordem }
          : null,
        proximaEtapa: proxima
          ? { chave: proxima.chave, nome: proxima.nome, ordem: proxima.ordem }
          : null,
        etapas: etapasInferidas,
        sinais: inferencia.sinais,
      };
    },
  };
}

export type WorkflowInferenciaService = ReturnType<typeof buildWorkflowInferenciaService>;
