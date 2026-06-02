/**
 * Auto-cura do `next` corrompido (antivírus comendo arquivos do node_modules).
 *
 * Roda ANTES do `next dev`. Se faltar algum arquivo essencial do `next`
 * (sintoma: "Cannot find module 'next/dist/...'"), reinstala forçado e segue.
 * Quando está tudo certo, custa milissegundos.
 *
 * Band-aid: o conserto DEFINITIVO é excluir a pasta do projeto no antivírus
 * (ver infra/fix-antivirus-defender.ps1). Este script só evita você ter que
 * rodar `pnpm install --force` na mão toda vez.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function nextQuebrado() {
  let pkg;
  try {
    pkg = require.resolve('next/package.json');
  } catch {
    return true; // nem o pacote resolve
  }
  const base = dirname(pkg);
  // Arquivos que o antivírus costuma remover e que derrubam o `next dev`.
  const sentinelas = [
    join(base, 'dist', 'bin', 'next'),
    join(base, 'dist', 'pages', '_app.js'),
    join(base, 'dist', 'build', 'entries.js'),
    join(base, 'dist', 'server', 'next.js'),
  ];
  return sentinelas.some((p) => !existsSync(p));
}

if (nextQuebrado()) {
  console.warn('\n[ensure-next] Instalação do "next" corrompida (provável antivírus). Reinstalando…\n');
  try {
    execSync('pnpm install --force', { stdio: 'inherit' });
  } catch (err) {
    console.error('[ensure-next] Falha ao reinstalar. Rode manualmente: pnpm install --force');
    process.exit(1);
  }
  if (nextQuebrado()) {
    console.error('[ensure-next] Ainda corrompido após reinstalar. Verifique o antivírus (infra/fix-antivirus-defender.ps1).');
    process.exit(1);
  }
  console.warn('[ensure-next] OK — next reinstalado.\n');
}
