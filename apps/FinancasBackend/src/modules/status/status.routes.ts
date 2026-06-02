import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { coletarStatus, type StatusReport } from '@/shared/status/status-checker.js';

// Le a logo uma unica vez na inicializacao e embebe como data URI no HTML
// (pagina fica self-contained, sem precisar de @fastify/static so para um arquivo).
function carregarLogoDataUri(): string {
  try {
    const buffer = readFileSync(resolve(process.cwd(), 'public/logo.png'));
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

const LOGO_DATA_URI = carregarLogoDataUri();

function formatarUptime(segundos: number): string {
  const dias = Math.floor(segundos / 86400);
  const horas = Math.floor((segundos % 86400) / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  const partes: string[] = [];
  if (dias > 0) partes.push(`${dias}d`);
  if (horas > 0) partes.push(`${horas}h`);
  partes.push(`${minutos}m`);
  return partes.join(' ');
}

function statusBadge(report: StatusReport): string {
  if (report.status === 'ok') return '<span class="badge badge-ok">Online</span>';
  if (report.status === 'degraded') return '<span class="badge badge-warn">Degradado</span>';
  return '<span class="badge badge-down">Fora do ar</span>';
}

function renderDependencia(d: { nome: string; ok: boolean; mensagem?: string; detalhe?: string }): string {
  const cor = d.ok ? 'ok' : 'down';
  const icone = d.ok ? '✓' : '✗';
  const sub = d.detalhe ?? d.mensagem ?? '';
  return `
    <li class="dep dep-${cor}">
      <span class="dep-icon">${icone}</span>
      <div class="dep-text">
        <div class="dep-name">${d.nome}</div>
        ${sub ? `<div class="dep-sub">${escapeHtml(sub)}</div>` : ''}
      </div>
    </li>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHtml(report: StatusReport, appUrl: string): string {
  const deps = report.dependencias.map(renderDependencia).join('');
  return `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pioneira Financas - API</title>
<style>
  :root {
    --bg-grad-1: #fffdf5;
    --bg-grad-2: #fef0d4;
    --bg-grad-3: #feeccc;
    --text: #1f2937;
    --muted: #6b7280;
    --pioneira: #fbcc2c;
    --pioneira-dark: #7d6b1e;
    --card: rgba(255,255,255,0.85);
    --card-border: rgba(255,255,255,0.4);
    --ok: #10b981;
    --warn: #f59e0b;
    --down: #ef4444;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg-grad-1: #0a0a0a;
      --bg-grad-2: #111827;
      --bg-grad-3: #1a1a1a;
      --text: #f3f4f6;
      --muted: #9ca3af;
      --card: rgba(17,24,39,0.85);
      --card-border: rgba(251,204,44,0.2);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: linear-gradient(135deg, var(--bg-grad-1), var(--bg-grad-2), var(--bg-grad-3));
    color: var(--text);
    padding: 2rem 1rem;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 720px; margin: 0 auto; }
  header {
    display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;
  }
  .logo {
    width: 56px; height: 56px;
    border-radius: 50%;
    box-shadow: 0 8px 24px -8px rgba(251,204,44,0.5);
    object-fit: contain;
    flex-shrink: 0;
  }
  .logo-fallback {
    width: 56px; height: 56px;
    background: linear-gradient(135deg, #fbcc2c, #ecd43c);
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 22px; color: #3a3110;
    box-shadow: 0 8px 24px -8px rgba(251,204,44,0.5);
    flex-shrink: 0;
  }
  h1 { margin: 0; font-size: 1.4rem; }
  .subtitle { color: var(--muted); font-size: 0.85rem; margin-top: 2px; }
  .card {
    background: var(--card);
    border: 2px solid var(--card-border);
    border-radius: 1.25rem;
    padding: 1.5rem;
    margin-bottom: 1rem;
    backdrop-filter: blur(10px);
    box-shadow: 0 10px 40px -10px rgba(0,0,0,0.08);
  }
  .row { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
  .meta { color: var(--muted); font-size: 0.8rem; }
  .meta strong { color: var(--text); font-weight: 600; }
  .badge {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.4rem 0.9rem;
    border-radius: 999px;
    font-size: 0.8rem; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .badge::before { content: ""; width: 8px; height: 8px; border-radius: 50%; }
  .badge-ok { background: rgba(16,185,129,0.15); color: var(--ok); }
  .badge-ok::before { background: var(--ok); box-shadow: 0 0 8px var(--ok); animation: pulse 2s infinite; }
  .badge-warn { background: rgba(245,158,11,0.15); color: var(--warn); }
  .badge-warn::before { background: var(--warn); }
  .badge-down { background: rgba(239,68,68,0.15); color: var(--down); }
  .badge-down::before { background: var(--down); }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
  h2 { font-size: 0.95rem; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); margin: 0 0 1rem; }
  ul { list-style: none; padding: 0; margin: 0; }
  .dep {
    display: flex; align-items: center; gap: 0.85rem;
    padding: 0.75rem; border-radius: 0.75rem;
    margin-bottom: 0.5rem;
    background: rgba(0,0,0,0.025);
  }
  @media (prefers-color-scheme: dark) {
    .dep { background: rgba(255,255,255,0.03); }
  }
  .dep:last-child { margin-bottom: 0; }
  .dep-icon {
    width: 32px; height: 32px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-weight: 700; flex-shrink: 0;
  }
  .dep-ok .dep-icon { background: rgba(16,185,129,0.15); color: var(--ok); }
  .dep-down .dep-icon { background: rgba(239,68,68,0.15); color: var(--down); }
  .dep-text { flex: 1; min-width: 0; }
  .dep-name { font-weight: 600; font-size: 0.9rem; }
  .dep-sub { color: var(--muted); font-size: 0.75rem; margin-top: 2px; word-break: break-all; }
  .links { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem; }
  .links a {
    display: inline-flex; align-items: center; gap: 0.4rem;
    padding: 0.55rem 1rem;
    background: linear-gradient(135deg, #fbcc2c, #ecd43c);
    color: #3a3110;
    text-decoration: none; font-weight: 600; font-size: 0.85rem;
    border-radius: 0.6rem;
    box-shadow: 0 4px 12px -4px rgba(251,204,44,0.5);
    transition: transform 0.15s, box-shadow 0.15s;
  }
  .links a:hover { transform: translateY(-1px); box-shadow: 0 6px 16px -4px rgba(251,204,44,0.6); }
  .links a.outline {
    background: transparent;
    border: 1.5px solid rgba(168,150,66,0.4);
    color: var(--pioneira-dark);
    box-shadow: none;
  }
  @media (prefers-color-scheme: dark) {
    .links a.outline { color: #ecd43c; border-color: rgba(251,204,44,0.4); }
  }
  footer { text-align: center; color: var(--muted); font-size: 0.75rem; margin-top: 2rem; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      ${LOGO_DATA_URI
        ? `<img class="logo" src="${LOGO_DATA_URI}" alt="Viacao Pioneira" />`
        : `<div class="logo-fallback">VP</div>`}
      <div>
        <h1>Pioneira Financas API</h1>
        <div class="subtitle">Sistema financeiro v2 - Viacao Pioneira</div>
      </div>
    </header>

    <div class="card">
      <div class="row">
        <div>
          ${statusBadge(report)}
          <div class="meta" style="margin-top: 0.75rem;">
            <strong>${escapeHtml(report.ambiente)}</strong> &middot;
            v${escapeHtml(report.versao)} &middot;
            uptime ${formatarUptime(report.uptimeSegundos)}
          </div>
        </div>
        <div class="meta" style="text-align: right;">
          <div>${new Date(report.timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
          <div style="font-size: 0.7rem; opacity: 0.6; margin-top: 2px;">America/Sao_Paulo</div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Dependencias</h2>
      <ul>${deps}</ul>
    </div>

    <div class="card">
      <h2>Recursos</h2>
      <div class="links">
        <a href="/docs">Swagger UI</a>
        <a href="/health" class="outline">Health JSON</a>
        <a href="${escapeHtml(appUrl)}" class="outline">Frontend</a>
      </div>
    </div>

    <footer>
      © ${new Date().getFullYear()} Viacao Pioneira Ltda - <a href="/" style="color: var(--muted);">Atualizar</a>
    </footer>
  </div>
  <script>
    // Auto-refresh a cada 30s para acompanhar status.
    setTimeout(function(){ location.reload(); }, 30000);
  </script>
</body>
</html>`;
}

export const statusModule: FastifyPluginAsyncTypebox = async (fastify) => {
  fastify.get(
    '/',
    {
      schema: {
        tags: ['health'],
        summary: 'Pagina visual de status (HTML)',
        produces: ['text/html'],
      },
    },
    async (_req, reply) => {
      const report = await coletarStatus(fastify);
      const html = renderHtml(report, fastify.config.app.url);
      return reply.code(report.status === 'down' ? 503 : 200).type('text/html; charset=utf-8').send(html);
    },
  );
};
