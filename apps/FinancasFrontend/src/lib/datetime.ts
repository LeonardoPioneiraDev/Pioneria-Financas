/**
 * Utilitários de data/hora padronizados em America/Sao_Paulo.
 * Nunca usar `new Date().toLocaleString(...)` direto — sempre passar por aqui.
 */
export const TZ_BR = 'America/Sao_Paulo';
export const LOCALE_BR = 'pt-BR';

/** Data + hora completas, ex.: "14/05/2026 13:42:08" */
export function formatarDataHora(d: Date | string | number): string {
  const data = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat(LOCALE_BR, {
    timeZone: TZ_BR,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(data);
}

/** Só data, ex.: "14/05/2026" */
export function formatarData(d: Date | string | number): string {
  const data = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat(LOCALE_BR, {
    timeZone: TZ_BR,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(data);
}

/** Data extensa, ex.: "14 de maio de 2026" */
export function formatarDataExtenso(d: Date | string | number): string {
  const data = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat(LOCALE_BR, {
    timeZone: TZ_BR,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(data);
}

/** Só hora, ex.: "13:42:08" */
export function formatarHora(d: Date | string | number): string {
  const data = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat(LOCALE_BR, {
    timeZone: TZ_BR,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(data);
}

/** Data + hora curtos, ex.: "14/05 13:42" */
export function formatarDataHoraCurto(d: Date | string | number): string {
  const data = d instanceof Date ? d : new Date(d);
  return new Intl.DateTimeFormat(LOCALE_BR, {
    timeZone: TZ_BR,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(data);
}

/** "Agora" em São Paulo como Date (representação UTC interna, mas formato São Paulo nas saídas). */
export function agora(): Date {
  return new Date();
}
