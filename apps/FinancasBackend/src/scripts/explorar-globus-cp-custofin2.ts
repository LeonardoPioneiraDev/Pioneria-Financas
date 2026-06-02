/**
 * DESCOBERTA read-only #3 — achar a DESCRICAO dos 8 CODCUSTOFIN usados no CP
 * da Pioneira (10003, 20003, 30003, 40004, 50003, 60003, 80003, 90003).
 *
 * Uso: pnpm --filter @pioneira/financas-backend exec tsx src/scripts/explorar-globus-cp-custofin2.ts
 */

import 'reflect-metadata';
import oracledb from 'oracledb';
import { loadEnvironment } from '@/config/environment.js';

const CODIGOS = [10003, 20003, 30003, 40004, 50003, 60003, 80003, 90003];

function assertReadOnly(sql: string): void {
  if (sql.trimStart().match(/^(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/i))
    throw new Error('SQL bloqueada (read-only)');
}
async function exec<T = Record<string, unknown>>(conn: oracledb.Connection, sql: string, binds: oracledb.BindParameters = {}): Promise<T[]> {
  assertReadOnly(sql);
  const r = await conn.execute<T>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
  return r.rows ?? [];
}
function tabela(linhas: Array<Record<string, unknown>>): string {
  if (linhas.length === 0) return '  (sem resultados)';
  const cols = Object.keys(linhas[0]!);
  const larguras = cols.map((c) => Math.min(70, Math.max(c.length, ...linhas.map((l) => String(l[c] ?? '').length))));
  const linha = (vals: string[]): string => '  ' + vals.map((v, i) => v.padEnd(larguras[i]!).slice(0, larguras[i]!)).join(' | ');
  return [linha(cols), '  ' + larguras.map((w) => '-'.repeat(w)).join('-+-'), ...linhas.map((l) => linha(cols.map((c) => String(l[c] ?? ''))))].join('\n');
}
async function secao<T>(t: string, fn: () => Promise<T>): Promise<T | null> {
  console.log(`\n━━━ ${t} ━━━`);
  try {
    return await fn();
  } catch (err) {
    console.log(`  ⚠ ${(err as Error).message}`);
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
  } catch (err) {
    if (!/NJS-/.test((err as Error).message ?? '')) throw err;
  }
  const conn = await oracledb.getConnection({
    user: env.oracle.user,
    password: env.oracle.password,
    connectString: `//${env.oracle.host}:${env.oracle.port}/${env.oracle.serviceName}`,
  });
  console.log('✓ Conectado.');
  const inList = CODIGOS.join(',');

  try {
    // a) CTBCUSTO contem esses codigos (em qualquer NROPLANO)?
    await secao('a) CTBCUSTO com esses codigos', async () =>
      console.log(tabela(await exec(conn, `SELECT CODCUSTO, NROPLANO, DESCCUSTO, CLASSCUSTOCTB FROM GLOBUS.CTBCUSTO WHERE CODCUSTO IN (${inList}) ORDER BY CODCUSTO`) as Array<Record<string, unknown>>)),
    );

    // b) Views com CUSTOFIN no nome.
    await secao('b) VIEWS ~ custofin', async () =>
      console.log(tabela(await exec(conn, `SELECT OWNER, VIEW_NAME FROM ALL_VIEWS WHERE VIEW_NAME LIKE '%CUSTOFIN%' OR VIEW_NAME LIKE '%CCUSTOFIN%' FETCH FIRST 30 ROWS ONLY`) as Array<Record<string, unknown>>)),
    );

    // c) DESCCUSTO por CODCUSTOFIN num dos TMP de resumo (revela o texto, mesmo se temp).
    await secao('c) TMP_CPG_RESUMOTPDESPESA_025: distinct CODCUSTOFIN x DESCCUSTO', async () =>
      console.log(tabela(await exec(conn, `SELECT DISTINCT CODCUSTOFIN, DESCCUSTO FROM GLOBUS.TMP_CPG_RESUMOTPDESPESA_025 WHERE CODCUSTOFIN IN (${inList}) ORDER BY CODCUSTOFIN`) as Array<Record<string, unknown>>)),
    );

    // d) Qualquer tabela que tenha CODCUSTOFIN e seja cadastro pequeno: listar as colunas das <= 300 linhas.
    const pequenas = await secao('d) Tabelas com CODCUSTOFIN e <= 300 linhas', async () => {
      const rows = await exec<{ OWNER: string; TABLE_NAME: string; NUM_ROWS: number }>(
        conn,
        `SELECT c.OWNER, c.TABLE_NAME, t.NUM_ROWS
         FROM ALL_TAB_COLUMNS c JOIN ALL_TABLES t ON t.OWNER=c.OWNER AND t.TABLE_NAME=c.TABLE_NAME
         WHERE c.COLUMN_NAME='CODCUSTOFIN' AND t.NUM_ROWS BETWEEN 1 AND 300
           AND t.TABLE_NAME NOT LIKE 'TMP%' AND t.TABLE_NAME NOT LIKE '%_BAK'
         ORDER BY t.NUM_ROWS`,
      );
      console.log(tabela(rows));
      return rows;
    });

    // e) Procurar QUALQUER coluna em QUALQUER tabela cujo nome contenha "CUSTOFIN" + uma desc,
    //    e tabelas-cadastro genericas de estrutura financeira (CGS / FIN / estrutura).
    await secao('e) Colunas chamadas *CUSTOFIN* em tabelas-cadastro', async () =>
      console.log(tabela(await exec(conn, `SELECT OWNER, TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS WHERE COLUMN_NAME LIKE '%CUSTOFIN%' AND COLUMN_NAME <> 'CODCUSTOFIN' FETCH FIRST 40 ROWS ONLY`) as Array<Record<string, unknown>>)),
    );

    // f) Amostra das tabelas pequenas achadas em (d) — colunas + 1a linha.
    for (const p of (pequenas ?? []).slice(0, 5)) {
      await secao(`f) ${p.TABLE_NAME} (~${p.NUM_ROWS}) colunas+amostra`, async () => {
        const cols = await exec<{ COLUMN_NAME: string }>(conn, `SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE OWNER=:o AND TABLE_NAME=:t ORDER BY COLUMN_ID`, { o: p.OWNER, t: p.TABLE_NAME });
        console.log('  cols: ' + cols.map((c) => c.COLUMN_NAME).join(', '));
        console.log(tabela((await exec(conn, `SELECT * FROM ${p.OWNER}.${p.TABLE_NAME} FETCH FIRST 3 ROWS ONLY`)) as Array<Record<string, unknown>>));
      });
    }
  } finally {
    await conn.close();
    console.log('\n✓ Conexão fechada.');
  }
}

main().catch((err) => {
  console.error('FALHA:', err);
  process.exit(1);
});
