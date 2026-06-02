/**
 * DESCOBERTA read-only #4 — confirmar a mestre CPGCUSTOS (revelada pelo usuario:
 * I.CODCUSTOFIN = C.CODIGO, C.DESCRICAO = setor) + CPGTPDES (tipo de despesa) e
 * medir rateio por CODCUSTOFIN.
 *
 * Uso: pnpm --filter @pioneira/financas-backend exec tsx src/scripts/explorar-globus-cp-custofin3.ts
 */
import 'reflect-metadata';
import oracledb from 'oracledb';
import { loadEnvironment } from '@/config/environment.js';

const DT_INI = '2026-01-01';

function assertReadOnly(sql: string): void {
  if (sql.trimStart().match(/^(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/i)) throw new Error('read-only');
}
async function ex<T = Record<string, unknown>>(c: oracledb.Connection, sql: string, b: oracledb.BindParameters = {}): Promise<T[]> {
  assertReadOnly(sql);
  return (await c.execute<T>(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false })).rows ?? [];
}
function tab(linhas: Array<Record<string, unknown>>): string {
  if (linhas.length === 0) return '  (sem resultados)';
  const cols = Object.keys(linhas[0]!);
  const w = cols.map((c) => Math.min(70, Math.max(c.length, ...linhas.map((l) => String(l[c] ?? '').length))));
  const ln = (v: string[]): string => '  ' + v.map((x, i) => x.padEnd(w[i]!).slice(0, w[i]!)).join(' | ');
  return [ln(cols), '  ' + w.map((x) => '-'.repeat(x)).join('-+-'), ...linhas.map((l) => ln(cols.map((c) => String(l[c] ?? ''))))].join('\n');
}
async function sec<T>(t: string, fn: () => Promise<T>): Promise<T | null> {
  console.log(`\n━━━ ${t} ━━━`);
  try {
    return await fn();
  } catch (e) {
    console.log(`  ⚠ ${(e as Error).message}`);
    return null;
  }
}

async function main(): Promise<void> {
  const env = loadEnvironment();
  if (!env.oracle.enabled) {
    console.error('ORACLE_ENABLED=false');
    process.exit(1);
  }
  try {
    oracledb.initOracleClient({ libDir: env.oracle.clientPath || undefined });
  } catch (e) {
    if (!/NJS-/.test((e as Error).message ?? '')) throw e;
  }
  const c = await oracledb.getConnection({
    user: env.oracle.user,
    password: env.oracle.password,
    connectString: `//${env.oracle.host}:${env.oracle.port}/${env.oracle.serviceName}`,
  });
  console.log('✓ Conectado.');

  try {
    // a) Colunas de CPGCUSTOS.
    await sec('a) CPGCUSTOS — colunas', async () =>
      console.log(tab((await ex(c, `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH FROM ALL_TAB_COLUMNS WHERE TABLE_NAME='CPGCUSTOS' ORDER BY COLUMN_ID`)) as Array<Record<string, unknown>>)),
    );

    // b) CPGCUSTOS — conteudo (a mestre de centro de custo financeiro).
    await sec('b) CPGCUSTOS — conteudo', async () =>
      console.log(tab((await ex(c, `SELECT * FROM GLOBUS.CPGCUSTOS ORDER BY CODIGO FETCH FIRST 60 ROWS ONLY`)) as Array<Record<string, unknown>>)),
    );

    // c) Os 8 codigos em uso, com a descricao oficial via CPGCUSTOS.
    await sec('c) CODCUSTOFIN em uso no CP x descricao oficial', async () =>
      console.log(tab((await ex(c, `SELECT /*+ NO_PARALLEL */ I.CODCUSTOFIN, C.DESCRICAO, COUNT(*) AS QTD_ITENS, COUNT(DISTINCT I.CODDOCTOCPG) AS QTD_TITULOS
         FROM CPGITDOC I
         JOIN CPGDOCTO D ON D.CODDOCTOCPG = I.CODDOCTOCPG
         LEFT JOIN CPGCUSTOS C ON C.CODIGO = I.CODCUSTOFIN
         WHERE D.CODIGOEMPRESA = 4 AND D.VENCIMENTOCPG >= DATE '${DT_INI}' AND I.CODCUSTOFIN IS NOT NULL
         GROUP BY I.CODCUSTOFIN, C.DESCRICAO ORDER BY QTD_ITENS DESC`)) as Array<Record<string, unknown>>)),
    );

    // d) Rateio por CODCUSTOFIN — centros distintos por titulo.
    await sec('d) Rateio por CODCUSTOFIN', async () =>
      console.log(tab((await ex(c, `SELECT /*+ NO_PARALLEL */ QTD AS CENTROS_NO_TITULO, COUNT(*) AS QTD_TITULOS FROM (
           SELECT I.CODDOCTOCPG, COUNT(DISTINCT I.CODCUSTOFIN) AS QTD
           FROM CPGITDOC I JOIN CPGDOCTO D ON D.CODDOCTOCPG = I.CODDOCTOCPG
           WHERE D.CODIGOEMPRESA = 4 AND D.VENCIMENTOCPG >= DATE '${DT_INI}' AND I.CODCUSTOFIN IS NOT NULL
           GROUP BY I.CODDOCTOCPG
         ) GROUP BY QTD ORDER BY QTD`)) as Array<Record<string, unknown>>)),
    );

    // e) CPGTPDES — tipo de despesa (dimensao bonus).
    await sec('e) CPGTPDES — amostra (tipo de despesa)', async () =>
      console.log(tab((await ex(c, `SELECT CODTPDESPESA, DESCTPDESPESA, CLASSIFICADOR FROM GLOBUS.CPGTPDES ORDER BY CODTPDESPESA FETCH FIRST 15 ROWS ONLY`)) as Array<Record<string, unknown>>)),
    );
  } finally {
    await c.close();
    console.log('\n✓ Conexão fechada.');
  }
}

main().catch((e) => {
  console.error('FALHA:', e);
  process.exit(1);
});
