/** Config mínima de agendamento pra calcular a próxima execução. */
export interface AgendamentoLike {
  frequencia: 'intervalo' | 'diario';
  intervaloMin: number | null;
  horaDia: number | null;
  minutoDia: number;
}

/**
 * Próxima execução a partir de `from`.
 *  - intervalo: from + intervaloMin minutos.
 *  - diário: próximo horário `hora_dia`:`minuto_dia` em Brasília. Brasil não tem
 *    horário de verão desde 2019, então UTC-3 fixo (Brasília = UTC-3).
 */
export function proximaExecucao(ag: AgendamentoLike, from: Date): Date {
  if (ag.frequencia === 'intervalo') {
    const min = Math.max(1, ag.intervaloMin ?? 60);
    return new Date(from.getTime() + min * 60_000);
  }
  const horaUtc = (((ag.horaDia ?? 6) + 3) % 24);
  const d = new Date(from);
  d.setUTCHours(horaUtc, ag.minutoDia ?? 0, 0, 0);
  if (d.getTime() <= from.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}
