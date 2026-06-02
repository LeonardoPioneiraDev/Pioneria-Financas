/**
 * Utilitários de data/hora padronizados em America/Sao_Paulo.
 * Regra do projeto (CLAUDE.md #2): todo dado temporal deve passar por aqui.
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

/** ISO 8601 com offset São Paulo. Útil para logs e audit trail. */
export function isoSp(d: Date | string | number = new Date()): string {
  const data = d instanceof Date ? d : new Date(d);
  // Formata com offset -03:00 (sem horário de verão atual no Brasil desde 2019).
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_BR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(data);
  const get = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}-03:00`;
}

/** YYYY-MM-DD no fuso de São Paulo (útil para campos `date` do Postgres). */
export function dataIsoSp(d: Date | string | number = new Date()): string {
  return isoSp(d).slice(0, 10);
}

/** "Agora" no fuso São Paulo como string ISO. */
export function agoraIso(): string {
  return isoSp();
}

/**
 * Sentinela: datas anteriores a este limite são "data zero" do Praxio/Oracle
 * (1899-12-30, 1900-01-01 etc.) e devem virar NULL para não bagunçar
 * agregados de competência.
 */
const DATA_SENTINELA_LIMITE = '1950-01-01';

/**
 * Converte valor vindo do Oracle (Date | string | null | undefined) para
 * `YYYY-MM-DD` no fuso São Paulo, ou `null` se inválido/sentinela.
 *
 * Use sempre que persistir um `date` no Postgres a partir de dado do Globus.
 * Evita o drift de fuso ao usar `toISOString()` (que é UTC).
 */
export function dataIsoSpOuNull(d: Date | string | null | undefined): string | null {
  if (d === null || d === undefined) return null;
  const data = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(data.getTime())) return null;
  const iso = dataIsoSp(data);
  if (iso < DATA_SENTINELA_LIMITE) return null;
  return iso;
}
