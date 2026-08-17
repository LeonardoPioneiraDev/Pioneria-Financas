'use client';

import { useAuth } from '@/contexts/AuthContext';

/**
 * TEMPORÁRIO (fase de desenvolvimento/validação): qualquer usuário logado pode
 * sincronizar com o Globus — antes era só ADMINISTRADOR (ver histórico deste
 * arquivo e `Leia/padrao-validacao-conferencia.md` §10.3 para o racional original:
 * carga em sistema externo sobrescreve a base que os auditores estão conferindo).
 *
 * Isto é só a UI. A barreira real é `fastify.authRequired` nas rotas de
 * sincronismo do backend — reverter os dois juntos antes de produção.
 */
export function usePodeSincronizar(): boolean {
  const { user } = useAuth();
  return !!user;
}
