/**
 * Supervisor do `next dev` com AUTORRECUPERAÇÃO.
 *
 * Problema: o `next` às vezes cai no startup com "Cannot find module 'next/dist/...'"
 * (arquivo do próprio next some/fica vazio de forma intermitente — causa raiz não
 * identificada; ver scripts/ensure-next.mjs). O conserto sempre foi rodar
 * `pnpm install --force` na mão. Este supervisor faz isso SOZINHO:
 *
 *   1. Garante o next íntegro antes de subir (garantirNext).
 *   2. Sobe o `next dev` herdando o terminal (cores/TTY do next preservados no stdout).
 *   3. Se o next CAIR no startup por módulo do next faltando, reinstala e tenta +1x.
 *      Outros erros (ex.: porta ocupada) NÃO disparam retry — passam direto.
 *
 * Uso: `node scripts/dev.mjs [--turbo]` (ver package.json).
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { garantirNext } from './ensure-next.mjs';

const require = createRequire(import.meta.url);
const PORTA = '3002';
const extraArgs = process.argv.slice(2); // ex.: --turbo
const JANELA_STARTUP_MS = 20000;
const RE_MODULO_NEXT = /(Cannot find module ['"][^'"]*next[\\/]dist)|(MODULE_NOT_FOUND)/i;

function iniciar(tentativa) {
  if (!garantirNext()) process.exit(1);

  let nextBin;
  try {
    nextBin = require.resolve('next/dist/bin/next');
  } catch {
    if (tentativa === 0 && garantirNext()) return iniciar(1);
    console.error('[dev] Não encontrei o binário do next mesmo após reinstalar.');
    process.exit(1);
  }

  const args = [nextBin, 'dev', '-p', PORTA, ...extraArgs];
  // stdout/stdin herdados (preserva o TTY colorido do next); stderr em pipe pra
  // detectar o crash específico — mas repassado ao terminal, sem esconder nada.
  const filho = spawn(process.execPath, args, { stdio: ['inherit', 'inherit', 'pipe'] });

  let encerrando = false;
  let subiu = false;
  let errBuf = '';

  const timerSubiu = setTimeout(() => { subiu = true; }, JANELA_STARTUP_MS);

  filho.stderr.on('data', (chunk) => {
    process.stderr.write(chunk); // não engole erro nenhum
    errBuf += chunk.toString();
    if (errBuf.length > 20000) errBuf = errBuf.slice(-20000);
  });

  const repassarSinal = (sig) => {
    encerrando = true;
    try { filho.kill(sig); } catch { /* já morreu */ }
  };
  process.once('SIGINT', () => repassarSinal('SIGINT'));
  process.once('SIGTERM', () => repassarSinal('SIGTERM'));

  filho.on('exit', (code, signal) => {
    clearTimeout(timerSubiu);
    if (encerrando || signal === 'SIGINT' || signal === 'SIGTERM') {
      process.exit(typeof code === 'number' ? code : 0);
    }
    const crashNoStartup = !subiu && code !== 0;
    if (crashNoStartup && RE_MODULO_NEXT.test(errBuf) && tentativa === 0) {
      console.warn('\n[dev] next caiu no startup por arquivo do next faltando — reinstalando e reiniciando 1x…\n');
      garantirNext();
      return iniciar(1);
    }
    process.exit(typeof code === 'number' ? code : 1);
  });
}

iniciar(0);
