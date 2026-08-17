/**
 * REGRA ÚNICA de quais títulos entram nas SOMAS DE VALOR do Contas a Pagar.
 *
 * Existe porque a regra estava copiada em 6 lugares (listagem, sumário, análise
 * de prazo, reembolsos…). Cada incidente corrigia UM deles e os outros seguiam
 * inflando — foi assim que o cancelado passou:
 *
 *   23/07/2026 — doc 1814 (cancelado, R$ 840) e doc 1841 (pago, R$ 840) eram a
 *   MESMA obrigação reemitida. O Globus não liga os dois (CODDOCTOCPGSUBST
 *   vazio), então `substituido` era false nos dois e o cancelado somava junto:
 *   R$ 692.743,81 nosso contra R$ 691.903,81 do relatório do financeiro.
 *
 * 30/07/2026 — o INVERSO: financeiro reportou R$ 677.892,88 em títulos
 * "sumidos" (Divergencia.jpeg/diver.jpeg). O Globus reemite um título prestes
 * a vencer sob um NOVO CODDOCTOCPG e marca o antigo com CODDOCTOCPGSUBST
 * (substituido=true, corretamente excluído). Mas o sync por janela de
 * vencimento ainda não tinha trazido o sucessor — resultado: nem o antigo (excluído
 * por ser substituído) nem o novo (nunca sincronizado) contavam em lugar nenhum.
 * 411 títulos / R$ 640.998,50 (todo o histórico) sumindo em silêncio. Por isso
 * a exclusão do substituído agora exige PROVAR que o sucessor está na nossa
 * base — sem isso, mantém o antigo contando até o sucessor chegar (via
 * reconciliação por chave, ver `reconciliarAbertos`).
 *
 * Ao descobrir um NOVO padrão de duplicidade, altere AQUI — nunca no ponto de
 * uso. E acrescente o caso no teste `contas-pagar-regras-soma.test.ts`.
 */

/** Alias padrão da tabela nos query builders (`createQueryBuilder('cp')`). */
const A = 'cp';

/**
 * O sucessor (`substituido_por_cod`) de um título substituído já está
 * confirmadamente na nossa base. Exportado à parte pra quem precisa DISTINGUIR
 * os dois casos de substituído (sucessor achado x ainda não sincronizado) —
 * ex.: o sumário, que avisa quantos títulos continuam somando por segurança.
 */
export const SUCESSOR_SINCRONIZADO_SQL = `EXISTS (
      SELECT 1 FROM finance.contas_pagar suc
      WHERE suc.origem_sistema = ${A}.origem_sistema
        AND suc.origem_id_externo = ${A}.substituido_por_cod
        AND suc.excluido_em IS NULL
    )`;

/**
 * Um título só sai das somas por "substituído" quando o sucessor
 * (`substituido_por_cod`) já está confirmadamente na nossa base — senão a
 * obrigação inteira some (nem o antigo, excluído, nem o novo, nunca
 * sincronizado). Ver histórico de 30/07/2026 no cabeçalho do arquivo.
 *
 * `NOT EXISTS`, não `EXISTS`: mantém o antigo NA SOMA enquanto o sucessor não
 * chegou (safety net); só exclui quando o sucessor está confirmado (senão
 * dobraria o valor — antigo + novo somando os dois).
 */
const SUBSTITUIDO_COM_SUCESSOR_SQL = `(${A}.substituido = false OR NOT ${SUCESSOR_SINCRONIZADO_SQL})`;

/**
 * Motivos pelos quais um título NÃO entra nas somas de valor.
 * Cada um continua VISÍVEL na listagem, com selo — só não soma.
 */
export const MOTIVOS_FORA_DA_SOMA = [
  {
    chave: 'substituido',
    sql: SUBSTITUIDO_COM_SUCESSOR_SQL,
    porque:
      'Título relançado no Globus (CODDOCTOCPGSUBST preenchido). O antigo NÃO é ' +
      'cancelado no ERP, então sem esta exclusão ele dobraria o valor do sucessor. ' +
      '~23% dos títulos. Ver SFN-48. A exclusão só vale se o sucessor já foi ' +
      'sincronizado — senão o dinheiro some (caso 30/07/2026, R$ 640.998,50).',
  },
  {
    chave: 'cancelado',
    sql: `${A}.status <> 'cancelado'`,
    porque:
      'Cancelado no ERP (STATUSDOCTOCPG = C). Quando a obrigação continua devida, ' +
      'ela foi reemitida sob OUTRO número de documento e o Globus não liga os dois — ' +
      'somar o cancelado conta a mesma obrigação duas vezes. Caso 1814 × 1841.',
  },
] as const;

/**
 * Predicado SQL para as SOMAS DE VALOR (total do período, a pagar, líquido,
 * "Foi pago", aging, rateios). Use SEMPRE este — não escreva a condição à mão.
 */
export const ENTRA_NA_SOMA_SQL: string = MOTIVOS_FORA_DA_SOMA.map((m) => m.sql).join(' AND ');

/**
 * Só a exclusão de SUBSTITUÍDOS, para os poucos contextos que precisam manter os
 * cancelados na base — o sumário, que tem um card "Cancelado" próprio e monta os
 * buckets por status. Nesses casos o TOTAL deve usar `ENTRA_NA_SOMA_SQL`.
 */
export const NAO_SUBSTITUIDO_SQL = SUBSTITUIDO_COM_SUCESSOR_SQL;

/** Contrário de `ENTRA_NA_SOMA_SQL` — para contar/somar o que ficou de fora. */
export const FORA_DA_SOMA_SQL = `NOT (${ENTRA_NA_SOMA_SQL})`;
