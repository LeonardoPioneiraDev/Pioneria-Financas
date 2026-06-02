export const USER_ROLES = ['admin', 'cfo', 'controller', 'cp_analista', 'cr_analista', 'rh', 'auditor', 'operacional'] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  cfo: 'Diretor Financeiro (CFO)',
  controller: 'Controller',
  cp_analista: 'Analista de Contas a Pagar',
  cr_analista: 'Analista de Contas a Receber',
  rh: 'RH / Folha',
  auditor: 'Auditor',
  operacional: 'Operacional',
};
