/**
 * DESCOBERTA read-only #5 — tributos (SFN-46 §6). Resolve as perguntas abertas
 * antes de completar o modulo de retencoes:
 *   A) tabelas CTB_ECF_* (apuracao/SPED)
 *   B) onde mora o regime tributario (Simples/Lucro Real/Presumido)
 *   C) municipio do fornecedor (pra ISS) em BGM_FORNECEDOR
 *   D) INSS/ISS zerado e dado ou bug? (amostra CPGDOCTO NFS)
 *   E) distribuicao de CODTPDOC do CP (entender o universo de NF de servico)
 *   F) onde estao as NF de servico (ESF/EST_NFSERVICO?) e suas retencoes
 *
 * Uso: pnpm --filter @pioneira/financas-backend exec tsx src/scripts/explorar-globus-tributos.ts
 */
import 'reflect-metadata';
import oracledb from 'oracledb';
import { loadEnvironment } from '@/config/environment.js';

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
  const w = cols.map((c) => Math.min(60, Math.max(c.length, ...linhas.map((l) => String(l[c] ?? '').length))));
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
    await sec('A) Tabelas CTB_ECF_*', async () =>
      console.log(tab((await ex(c, `SELECT TABLE_NAME, NUM_ROWS FROM ALL_TABLES WHERE OWNER='GLOBUS' AND TABLE_NAME LIKE 'CTB_ECF%' ORDER BY NUM_ROWS DESC NULLS LAST FETCH FIRST 30 ROWS ONLY`)) as Array<Record<string, unknown>>)),
    );

    await sec('B) Colunas de REGIME tributario (qualquer tabela)', async () =>
      console.log(tab((await ex(c, `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS WHERE OWNER='GLOBUS' AND (COLUMN_NAME LIKE '%REGIME%' OR COLUMN_NAME LIKE '%SIMPLES%' OR COLUMN_NAME LIKE '%LUCRO%' OR COLUMN_NAME LIKE '%PRESUMID%' OR COLUMN_NAME LIKE '%OPTANTE%') ORDER BY TABLE_NAME, COLUMN_NAME FETCH FIRST 40 ROWS ONLY`)) as Array<Record<string, unknown>>)),
    );

    await sec('C) BGM_FORNECEDOR — colunas de municipio/cidade/UF', async () =>
      console.log(tab((await ex(c, `SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS WHERE OWNER='GLOBUS' AND TABLE_NAME='BGM_FORNECEDOR' AND (COLUMN_NAME LIKE '%MUNIC%' OR COLUMN_NAME LIKE '%CIDADE%' OR COLUMN_NAME LIKE '%UF%' OR COLUMN_NAME LIKE '%CODIBGE%' OR COLUMN_NAME LIKE '%SIMPLES%' OR COLUMN_NAME LIKE '%REGIME%' OR COLUMN_NAME LIKE '%TPINSCR%' OR COLUMN_NAME LIKE '%NATUREZA%') ORDER BY COLUMN_ID`)) as Array<Record<string, unknown>>)),
    );

    await sec('D) INSS/ISS amostra — NFS recentes (empresa 4)', async () =>
      console.log(tab((await ex(c, `SELECT D.CODDOCTOCPG, D.CODTPDOC, D.NRINSCR_FAV, D.VLR_ORIGINAL, D.VLRINSSCPG, D.VLRIRRFCPG, D.VLRPISCPG, D.VLRCOFINSCPG, D.VLRCSLCPG, D.VLRISSCPG
         FROM GLOBUS.CPGDOCTO D
         WHERE D.CODIGOEMPRESA=4 AND D.CODTPDOC IN ('NFS','NFV') AND D.VENCIMENTOCPG >= DATE '2026-01-01'
         ORDER BY D.VENCIMENTOCPG DESC FETCH FIRST 20 ROWS ONLY`)) as Array<Record<string, unknown>>)),
    );

    await sec('E) Distribuicao CODTPDOC do CP (empresa 4, 2026)', async () =>
      console.log(tab((await ex(c, `SELECT D.CODTPDOC, COUNT(*) AS QTD,
           SUM(CASE WHEN NVL(D.VLRINSSCPG,0)>0 THEN 1 ELSE 0 END) AS COM_INSS,
           SUM(CASE WHEN NVL(D.VLRISSCPG,0)>0 THEN 1 ELSE 0 END) AS COM_ISS,
           SUM(CASE WHEN NVL(D.VLRIRRFCPG,0)>0 THEN 1 ELSE 0 END) AS COM_IRRF
         FROM GLOBUS.CPGDOCTO D
         WHERE D.CODIGOEMPRESA=4 AND D.VENCIMENTOCPG >= DATE '2026-01-01'
         GROUP BY D.CODTPDOC ORDER BY QTD DESC FETCH FIRST 25 ROWS ONLY`)) as Array<Record<string, unknown>>)),
    );

    await sec('F) Tabelas de NF de SERVICO + retencao (ESF/EST_NFSERVICO/ISS)', async () =>
      console.log(tab((await ex(c, `SELECT TABLE_NAME, NUM_ROWS FROM ALL_TABLES WHERE OWNER='GLOBUS' AND (TABLE_NAME LIKE 'ESF%NOTAFISC%' OR TABLE_NAME LIKE '%NFSERV%' OR TABLE_NAME LIKE '%NFSE%') ORDER BY NUM_ROWS DESC NULLS LAST FETCH FIRST 20 ROWS ONLY`)) as Array<Record<string, unknown>>)),
    );

    await sec('G) Colunas de retencao em CPGDOCTO (ha INSS/ISS alternativos?)', async () =>
      console.log(tab((await ex(c, `SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS WHERE OWNER='GLOBUS' AND TABLE_NAME='CPGDOCTO' AND (COLUMN_NAME LIKE '%INSS%' OR COLUMN_NAME LIKE '%ISS%' OR COLUMN_NAME LIKE '%IRRF%' OR COLUMN_NAME LIKE '%RETE%' OR COLUMN_NAME LIKE '%RETENC%') ORDER BY COLUMN_NAME`)) as Array<Record<string, unknown>>)),
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
