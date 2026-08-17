import type { FastifyInstance } from 'fastify';
import { buildDepreciacaoService } from '@/modules/depreciacao/depreciacao.service.js';
import { buildDreService } from '@/modules/dre/dre.service.js';
import { buildFluxoCaixaService } from '@/modules/fluxo-caixa/fluxo-caixa.service.js';
import { buildOrcamentoService } from '@/modules/orcamento/orcamento.service.js';
import { buildRecebiveisGdfService } from '@/modules/recebiveis-gdf/recebiveis-gdf.service.js';
import { buildReceitaTdmaxService } from '@/modules/receita-tdmax/receita-tdmax.service.js';
import { buildContasPagarService } from '@/modules/contas-pagar/contas-pagar.service.js';
import { buildConciliacaoService } from '@/modules/conciliacao/conciliacao.service.js';

/** Resultado normalizado de um sync agendado. */
export interface SyncExecResult {
  status: string; // 'ok' | 'parcial' | 'erro' | ...
  mensagem?: string;
}

export interface SyncRecursoDef {
  recurso: string;
  label: string;
  /** Executa o sync com os defaults de auto-sync (sem usuário logado). */
  executar: (fastify: FastifyInstance) => Promise<SyncExecResult>;
}

// Sync agendado não tem usuário logado; os services fazem `usuarioId ?? null`
// (a coluna usuario_id em sync_jobs é uuid NULLABLE). O cast confina isso aqui.
const SEM_USUARIO = null as unknown as string;

// Horizonte de planejamento do auditor do financeiro: ele programa títulos com
// vencimento futuro (inclusões/ajustes no Globus) com essa antecedência pra se
// organizar. `contas-pagar-futuro` e a auditoria abaixo cobrem essa janela.
const HORIZONTE_FUTURO_DIAS = 12;

/** Data ISO (YYYY-MM-DD, UTC) de hoje + N dias. */
function isoEmNDias(dias: number): string {
  const hoje = new Date();
  return new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() + dias))
    .toISOString()
    .slice(0, 10);
}

function normalizar(r: unknown): SyncExecResult {
  const o = (r ?? {}) as { status?: string; mensagem?: string };
  return { status: o.status ?? 'ok', mensagem: o.mensagem };
}

/**
 * Recursos agendáveis (auto-sync sem parâmetro). Contas a pagar entra com
 * período default (1º do mês corrente até hoje). Só a folha segue de fora —
 * exige período real, sem default óbvio; entra depois com adapter de
 * competência.
 */
const DEFS: SyncRecursoDef[] = [
  {
    recurso: 'depreciacao',
    label: 'Depreciação',
    executar: async (f) => normalizar(await buildDepreciacaoService(f).sincronizar({ usuarioId: SEM_USUARIO })),
  },
  {
    recurso: 'dre',
    label: 'DRE',
    executar: async (f) => normalizar(await buildDreService(f).sincronizar({ usuarioId: SEM_USUARIO })),
  },
  {
    recurso: 'fluxo-caixa',
    label: 'Fluxo de Caixa',
    executar: async (f) => normalizar(await buildFluxoCaixaService(f).sincronizar({ usuarioId: SEM_USUARIO })),
  },
  {
    recurso: 'orcamento',
    label: 'Orçamento',
    executar: async (f) => normalizar(await buildOrcamentoService(f).sincronizar({ usuarioId: SEM_USUARIO })),
  },
  {
    recurso: 'recebiveis-gdf',
    label: 'Recebíveis GDF',
    executar: async (f) => normalizar(await buildRecebiveisGdfService(f).sincronizar(SEM_USUARIO)),
  },
  {
    recurso: 'receita-tdmax',
    label: 'Receita TD Max (bilhetagem)',
    executar: async (f) => normalizar(await buildReceitaTdmaxService(f).sincronizar({}, SEM_USUARIO)),
  },
  {
    // Reconciliação por chave dos títulos EM ABERTO — não precisa de período,
    // por isso é agendável. Fecha o ponto cego do sync por janela: título
    // prorrogado/cancelado que saiu da janela e ficou congelado na cópia local.
    // Ver Leia/cp-status-divergencia-globus.md §6.5.
    recurso: 'contas-pagar-reconciliacao',
    label: 'Contas a Pagar — reconciliar abertos',
    executar: async (f) => {
      const r = await buildContasPagarService(f).reconciliarAbertos(SEM_USUARIO);
      return { status: r.status, mensagem: `${r.atualizados} atualizado(s) de ${r.verificados} · ${r.sumiram} sumiram do Globus` };
    },
  },
  {
    // Reconciliação bancária: baixa movimentos cancelados no Globus e puxa os
    // títulos que faltam. Fecha o "falta identificar" sem pareamento manual.
    recurso: 'conciliacao-banco',
    label: 'Conciliação — reconciliar extrato',
    executar: async (f) => {
      const r = await buildConciliacaoService(f).reconciliarBanco(SEM_USUARIO);
      return { status: r.status, mensagem: `${r.cancelados} cancelado(s) baixado(s) · ${r.titulosPuxados} título(s) puxado(s)` };
    },
  },
  {
    // SINCRONIZA (de verdade, grava dados) a janela de vencimento futuro que o
    // auditor do financeiro usa pra se planejar. Sem isso, títulos que entram
    // no Globus depois do último sync manual (inclusões/ajustes de última
    // hora) só aparecem no banco local se alguém lembrar de clicar em
    // "Sincronizar" de novo — daí buscas por vencimento futuro às vezes vêm
    // vazias/incompletas mesmo com dado real no Globus. Desabilitado por
    // padrão (como todo recurso agendável): só roda quando ligado em
    // /admin/sincronismo, então não há sincronização "surpresa".
    recurso: 'contas-pagar-futuro',
    label: `Contas a Pagar — sincronizar vencimento futuro (hoje a +${HORIZONTE_FUTURO_DIAS}d)`,
    executar: async (f) =>
      normalizar(
        await buildContasPagarService(f).sincronizar(
          { dtIni: isoEmNDias(0), dtFim: isoEmNDias(HORIZONTE_FUTURO_DIAS), modo: 'vencimento' },
          SEM_USUARIO,
        ),
      ),
  },
  {
    // AUDITORIA automática — não sincroniza nada, só CONFERE nosso total (mês
    // corrente até hoje+HORIZONTE_FUTURO_DIAS) contra o Globus e avisa se
    // divergir. Existe porque o financeiro achou uma divergência de R$ 640k
    // (30/07/2026) que o sistema não tinha detectado sozinho — só apareceu
    // porque alguém comparou à mão contra o Globus. Isso automatiza essa
    // comparação: se um bug futuro (na ETL, num filtro de data, numa
    // migration) voltar a descolar os totais do Globus, este recurso pega no
    // dia seguinte, não em semanas. A janela inclui o horizonte futuro pra
    // também pegar o caso de `contas-pagar-futuro` estar desligado ou ter
    // falhado silenciosamente. status 'parcial' (amber na tela) quando
    // diverge — 'erro' é reservado pra falha de conexão/consulta, não pra
    // divergência encontrada.
    recurso: 'contas-pagar-auditoria',
    label: 'Contas a Pagar — auditoria (confere com o Globus)',
    executar: async (f) => {
      const hoje = new Date();
      const dtIni = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1)).toISOString().slice(0, 10);
      const dtFim = isoEmNDias(HORIZONTE_FUTURO_DIAS);
      const c = await buildContasPagarService(f).conferencia({ dtIni, dtFim });
      if (c.indisponivel) return { status: 'erro', mensagem: c.indisponivel };
      if (!c.conferido) {
        f.log.error(
          { periodo: c.periodo, totalSomavel: c.totalSomavel, porStatus: c.porStatus },
          '[auditoria] Contas a Pagar DIVERGE do Globus — confira a tela de Contas a Pagar',
        );
      }
      return { status: c.conferido ? 'ok' : 'parcial', mensagem: c.resumo };
    },
  },
];

export const SYNC_REGISTRY: ReadonlyMap<string, SyncRecursoDef> = new Map(DEFS.map((d) => [d.recurso, d]));
export const SYNC_RECURSOS: ReadonlyArray<{ recurso: string; label: string }> = DEFS.map((d) => ({ recurso: d.recurso, label: d.label }));
