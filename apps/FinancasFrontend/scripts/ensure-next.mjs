/**
 * Auto-cura da instalação do `next` incompleta/corrompida.
 *
 * SINTOMA: `next dev`/`next build` morre com "Cannot find module 'next/dist/...'"
 * (ex.: next/dist/pages/_app, next/dist/bin/next). `pnpm install --force` conserta,
 * mas volta a acontecer de forma intermitente.
 *
 * NOTA DE DIAGNÓSTICO (2026-07-14): a hipótese antiga de "antivírus comendo o
 * node_modules" foi DESCARTADA com prova nesta máquina — o histórico de ameaças do
 * Defender nunca tocou no projeto, a pasta já está excluída, o Acesso Controlado a
 * Pastas está OFF e o repo não é sincronizado pelo OneDrive. Causa raiz ainda não
 * identificada (é intermitente). Por isso paramos de depender da causa: o `dev.mjs`
 * reinicia sozinho quando o next cai no startup por arquivo faltando.
 *
 * Este módulo exporta a checagem/cura pra o supervisor reusar, e mantém o
 * comportamento antigo quando executado direto (`node scripts/ensure-next.mjs`).
 */
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);

/** Caminhos essenciais do `next` que, ausentes/vazios, derrubam dev e build. */
function sentinelasNext() {
  let pkg;
  try {
    pkg = require.resolve('next/package.json');
  } catch {
    return null; // nem o pacote resolve
  }
  const base = dirname(pkg);
  return [
    join(base, 'dist', 'bin', 'next'),
    join(base, 'dist', 'pages', '_app.js'),
    join(base, 'dist', 'build', 'entries.js'),
    join(base, 'dist', 'server', 'next.js'),
    // Usados no BUILD (sintoma: "Cannot find module '.../jest-worker/processChild.js'").
    join(base, 'dist', 'compiled', 'jest-worker', 'processChild.js'),
    join(base, 'dist', 'compiled', 'jest-worker', 'index.js'),
  ];
}

/** true se algum arquivo essencial está ausente OU vazio (0 byte também quebra). */
export function nextQuebrado() {
  const sentinelas = sentinelasNext();
  if (sentinelas === null) return true;
  return sentinelas.some((p) => {
    try {
      return !existsSync(p) || statSync(p).size === 0;
    } catch {
      return true;
    }
  });
}

/**
 * Garante o `next` íntegro. Reinstala forçado se detectar quebra. Retorna true se
 * ficou OK, false se falhou (aí o chamador decide abortar).
 */
export function garantirNext() {
  if (!nextQuebrado()) return true;
  console.warn('\n[ensure-next] Instalação do "next" incompleta/corrompida. Reinstalando…\n');
  try {
    execSync('pnpm install --force', { stdio: 'inherit' });
  } catch {
    console.error('[ensure-next] Falha ao reinstalar. Rode manualmente: pnpm install --force');
    return false;
  }
  if (nextQuebrado()) {
    console.error('[ensure-next] Ainda quebrado após reinstalar. Investigue o ambiente.');
    return false;
  }
  console.warn('[ensure-next] OK — next reinstalado.\n');
  return true;
}

// Executado direto: mantém o comportamento antigo (compatível com qualquer script
// que ainda chame `node scripts/ensure-next.mjs`).
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!garantirNext()) process.exit(1);
}
