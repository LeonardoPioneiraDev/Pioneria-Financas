/**
 * Permissoes de FUNCIONALIDADE (granulares, por usuario) — complementam o papel
 * (role). O admin liga/desliga por usuario. `admin` tem todas implicitamente.
 * Comecam com o dado sensivel (contracheque individual, LGPD); extensivel.
 */
export const PERMISSOES = ['ver_contracheque'] as const;
export type Permissao = (typeof PERMISSOES)[number];

export const PERMISSAO_LABELS: Record<Permissao, string> = {
  ver_contracheque: 'Ver contracheque individual',
};

export const PERMISSAO_DESCRICOES: Record<Permissao, string> = {
  ver_contracheque: 'Abrir o holerite individual de um funcionário na Folha (dado pessoal — LGPD).',
};
