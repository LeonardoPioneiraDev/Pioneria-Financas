/**
 * Ciclo de conferência das funcionalidades.
 *
 * - `conferencia` — o AUDITOR abre a tela, confere os números e registra se os
 *   dados estão corretos (`validado`) ou aponta o problema (`reprovado`, com
 *   observações obrigatórias).
 * - `aval` — o CFO vê o que já foi validado pelos auditores e dá o aval de
 *   ciência (`validado`) ou devolve com ressalva (`reprovado`).
 *
 * A tabela é append-only: cada clique vira uma linha. O estado atual de uma
 * funcionalidade é o ÚLTIMO registro por (usuário, funcionalidade, tipo).
 */
export const VALIDACAO_TIPOS = ['conferencia', 'aval'] as const;
export type ValidacaoTipo = (typeof VALIDACAO_TIPOS)[number];

export const VALIDACAO_STATUS = ['validado', 'reprovado'] as const;
export type ValidacaoStatus = (typeof VALIDACAO_STATUS)[number];

export const VALIDACAO_TIPO_LABELS: Record<ValidacaoTipo, string> = {
  conferencia: 'Conferência',
  aval: 'Aval do CFO',
};

export const VALIDACAO_STATUS_LABELS: Record<ValidacaoStatus, string> = {
  validado: 'Validado',
  reprovado: 'Com ressalva',
};

/** Tamanho mínimo das observações quando o usuário NÃO valida. */
export const OBSERVACOES_MIN = 10;
export const OBSERVACOES_MAX = 2000;

/** Anexos (prints) opcionais na ressalva — só imagem, até 3 MB cada, até 5 por registro. */
export const ANEXO_MIME_PERMITIDOS = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'] as const;
export const ANEXO_MAX_BYTES = 3 * 1024 * 1024;
export const ANEXO_MAX_ARQUIVOS = 5;
