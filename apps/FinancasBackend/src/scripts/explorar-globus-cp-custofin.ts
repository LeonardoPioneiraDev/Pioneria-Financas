/**
 * DESCOBERTA read-only #2 — foco em CPGITDOC.CODCUSTOFIN (centro de custo
 * FINANCEIRO), que a exploracao #1 mostrou estar ~95% preenchido (vs CODCUSTO
 * contabil com 0,5%). Acha a tabela-mestre com a descricao e mede rateio.
 *
 * Uso: pnpm --filter @pioneira/financas-backend exec tsx src/scripts/explorar-globus-cp-custofin.ts
 */

import 'reflect-metadata';
import oracledb from 'oracledb';
import { loadEnvironment } from '@/config/environment.js';

const DT_INI = '2026-01-01';

function assertReadOnly(sql: string): void {
  const dml = sql.trimStart().match(/^(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/i);
  if (dml) throw new Error(`SQL bloqueada (read-only): ${dml[1]}`);
}
async function executar<T = Record<string, unknown>>(conn: oracledb.Connection, sql: string, binds: oracledb.BindParameters = {}): Promise<T[]> {
  assertReadOnly(sql);
  const r = await conn.execute<T>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
  return r.rows ?? [];
}
function tabela(linhas: Array<Record<string, unknown>>): string {
  if (linhas.length === 0) return '  (sem resultados)';
  const cols = Object.keys(linhas[0]!);
  const larguras = cols.map((c) => Math.min(60, Math.max(c.length, ...linhas.map((l) => String(l[c] ?? '').length))));
  const linha = (vals: string[]): string => '  ' + vals.map((v, i) => v.padEnd(larguras[i]!).slice(0, larguras[i]!)).join(' | ');
  const sep = '  ' + larguras.map((w) => '-'.repeat(w)).join('-+-');
  return [linha(cols), sep, ...linhas.map((l) => linha(cols.map((c) => String(l[c] ?? ''))))].join('\n');
}
async function secao<T>(titulo: string, fn: () => Promise<T>): Promise<T | null> {
  console.log(`\n━━━ ${titulo} ━━━`);
  try {
    return await fn();
  } catch (err) {
    console.log(`  ⚠ erro: ${(err as Error).message}`);
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

  try {
    // 1) Toda tabela que tem a coluna CODCUSTOFIN (procurar o cadastro-mestre).
    await secao('1) Tabelas que possuem a coluna CODCUSTOFIN', async () => {
      const rows = await executar(
        conn,
        `SELECT c.OWNER, c.TABLE_NAME, t.NUM_ROWS
         FROM ALL_TAB_COLUMNS c
         JOIN ALL_TABLES t ON t.OWNER = c.OWNER AND t.TABLE_NAME = c.TABLE_NAME
         WHERE c.COLUMN_NAME = 'CODCUSTOFIN'
         ORDER BY t.NUM_ROWS DESC NULLS LAST
         FETCH FIRST 40 ROWS ONLY`,
      );
      console.log(tabela(rows as Array<Record<string, unknown>>));
    });

    // 2) Tabelas cujo NOME sugere cadastro de centro de custo financeiro.
    await secao('2) Tabelas com nome ~ custo financeiro', async () => {
      const rows = await executar(
        conn,
        `SELECT OWNER, TABLE_NAME, NUM_ROWS FROM ALL_TABLES
         WHERE TABLE_NAME LIKE '%CUSTOFIN%' OR TABLE_NAME LIKE '%CCUSTOFIN%'
            OR TABLE_NAME LIKE 'CGS%CAD%' OR TABLE_NAME LIKE '%CADCCUSTO%'
         ORDER BY NUM_ROWS DESC NULLS LAST FETCH FIRST 30 ROWS ONLY`,
      );
      console.log(tabela(rows as Array<Record<string, unknown>>));
    });

    // 3) Top CODCUSTOFIN em uso no CP (empresa 4, recente).
    const topFin = await secao('3) Top CODCUSTOFIN no CP (empresa 4, recente)', async () => {
      const rows = await executar<{ CODCUSTOFIN: number; QTD_ITENS: number; QTD_TITULOS: number }>(
        conn,
        `SELECT /*+ NO_PARALLEL */ I.CODCUSTOFIN, COUNT(*) AS QTD_ITENS, COUNT(DISTINCT I.CODDOCTOCPG) AS QTD_TITULOS
         FROM CPGITDOC I JOIN CPGDOCTO D ON D.CODDOCTOCPG = I.CODDOCTOCPG
         WHERE D.CODIGOEMPRESA = 4 AND D.VENCIMENTOCPG >= DATE '${DT_INI}' AND I.CODCUSTOFIN IS NOT NULL
         GROUP BY I.CODCUSTOFIN ORDER BY QTD_ITENS DESC FETCH FIRST 40 ROWS ONLY`,
      );
      console.log(tabela(rows));
      return rows;
    });

    // 4) Tentar descrever os top CODCUSTOFIN via candidatos de cadastro.
    // Tabelas candidatas a mestre (nome generico CGS = gestao financeira Praxio).
    const candidatosMestre = ['CGS_CADCCUSTOFIN', 'CGSCADCCUSTOFIN', 'CGS_CCUSTOFIN', 'CTB_CADCCUSTOFIN', 'FIN_CCUSTOFIN', 'CGS_CENTROCUSTOFIN'];
    for (const t of candidatosMestre) {
      await secao(`4) Tentando mestre: ${t}`, async () => {
        const cols = await executar<{ COLUMN_NAME: string; DATA_TYPE: string }>(
          conn,
          `SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS WHERE TABLE_NAME = :t ORDER BY COLUMN_ID`,
          { t },
        );
        if (cols.length === 0) {
          console.log('  (tabela nao existe)');
          return;
        }
        console.log(tabela(cols));
        const amostra = await executar(conn, `SELECT * FROM GLOBUS.${t} FETCH FIRST 5 ROWS ONLY`);
        console.log('  · amostra:');
        console.log(tabela(amostra as Array<Record<string, unknown>>));
      });
    }

    // 5) Descobrir QUALQUER tabela com CODCUSTOFIN + uma coluna DESC* (provavel cadastro).
    await secao('5) Tabelas com CODCUSTOFIN E coluna de descricao (DESC%/NOME%)', async () => {
      const rows = await executar(
        conn,
        `SELECT a.OWNER, a.TABLE_NAME, t.NUM_ROWS,
                LISTAGG(b.COLUMN_NAME, ', ') WITHIN GROUP (ORDER BY b.COLUMN_NAME) AS COLS_DESC
         FROM ALL_TAB_COLUMNS a
         JOIN ALL_TAB_COLUMNS b ON b.OWNER = a.OWNER AND b.TABLE_NAME = a.TABLE_NAME
         JOIN ALL_TABLES t ON t.OWNER = a.OWNER AND t.TABLE_NAME = a.TABLE_NAME
         WHERE a.COLUMN_NAME = 'CODCUSTOFIN'
           AND (b.COLUMN_NAME LIKE 'DESC%' OR b.COLUMN_NAME LIKE 'NOME%' OR b.COLUMN_NAME LIKE '%DESCRICAO%')
         GROUP BY a.OWNER, a.TABLE_NAME, t.NUM_ROWS
         ORDER BY t.NUM_ROWS ASC NULLS LAST
         FETCH FIRST 20 ROWS ONLY`,
      );
      console.log(tabela(rows as Array<Record<string, unknown>>));
    });

    // 6) Rateio por CODCUSTOFIN: quantos titulos tem 1 / 2 / 3+ centros distintos.
    await secao('6) Rateio por CODCUSTOFIN — centros distintos por titulo', async () => {
      const rows = await executar(
        conn,
        `SELECT /*+ NO_PARALLEL */ QTD, COUNT(*) AS QTD_TITULOS FROM (
           SELECT I.CODDOCTOCPG, COUNT(DISTINCT I.CODCUSTOFIN) AS QTD
           FROM CPGITDOC I JOIN CPGDOCTO D ON D.CODDOCTOCPG = I.CODDOCTOCPG
           WHERE D.CODIGOEMPRESA = 4 AND D.VENCIMENTOCPG >= DATE '${DT_INI}' AND I.CODCUSTOFIN IS NOT NULL
           GROUP BY I.CODDOCTOCPG
         ) GROUP BY QTD ORDER BY QTD`,
      );
      console.log(tabela(rows as Array<Record<string, unknown>>));
    });
  } finally {
    await conn.close();
    console.log('\n✓ Conexão fechada.');
  }
}

main().catch((err) => {
  console.error('FALHA:', err);
  process.exit(1);
});
