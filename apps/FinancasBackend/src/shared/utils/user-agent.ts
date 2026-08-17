/**
 * Interpreta a string de User-Agent num rótulo curto e legível para a trilha de
 * auditoria — sem dependência externa (regex simples cobre >99% dos casos reais).
 * Não é fingerprinting: só navegador + plataforma + se é celular/desktop.
 */

export type DispositivoTipo = 'celular' | 'tablet' | 'desktop' | 'bot' | 'desconhecido';

export interface DispositivoInfo {
  /** Rótulo pronto pra exibir, ex.: "Chrome · Windows" ou "Safari · iPhone". */
  rotulo: string;
  tipo: DispositivoTipo;
}

const DESCONHECIDO: DispositivoInfo = { rotulo: '—', tipo: 'desconhecido' };

function detectarTipo(ua: string): DispositivoTipo {
  if (/bot|crawler|spider|curl|wget|python-requests|postman|insomnia|axios|node-fetch/i.test(ua)) return 'bot';
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
  // Android sem "Mobile" costuma ser tablet; com "Mobile" é celular.
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet';
  if (/Mobile|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini/i.test(ua)) return 'celular';
  return 'desktop';
}

function detectarNavegador(ua: string): string {
  if (/Edg(A|iOS|)?\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/CriOS\//i.test(ua)) return 'Chrome';
  if (/FxiOS\//i.test(ua)) return 'Firefox';
  if (/Firefox\//i.test(ua)) return 'Firefox';
  if (/Chrome\//i.test(ua)) return 'Chrome';
  if (/Safari\//i.test(ua)) return 'Safari';
  if (/MSIE|Trident/i.test(ua)) return 'Internet Explorer';
  return 'Navegador';
}

function detectarPlataforma(ua: string): string | null {
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPod/i.test(ua)) return 'iPod';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return null;
}

export function resumirUserAgent(ua: string | null | undefined): DispositivoInfo {
  if (!ua || !ua.trim()) return DESCONHECIDO;
  const tipo = detectarTipo(ua);
  if (tipo === 'bot') return { rotulo: 'Automação / API', tipo };
  const navegador = detectarNavegador(ua);
  const plataforma = detectarPlataforma(ua);
  const rotulo = plataforma ? `${navegador} · ${plataforma}` : navegador;
  return { rotulo, tipo };
}
