/**
 * DESCOBERTA read-only #6 — procurar no Globus as fontes das 4 funcionalidades
 * tributárias "bloqueadas": apuração PIS/COFINS, ISS, DARF/guias e SPED/ECF.
 * Se o Globus JÁ apura, deixa de depender de premissa nossa: a gente LÊ.
 *
 * Uso: pnpm --filter @pioneira/financas-backend exec tsx src/scripts/explorar-globus-tributos-apuracao.ts
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
  const w = cols.map((c) => Math.min(55, Math.max(c.length, ...linhas.map((l) => String(l[c] ?? '').length))));
  const ln = (v: string[]): string => '  ' + v.map((x, i) => x.padEnd(w[i]!).slice(0, w[i]!)).join(' | ');
  return [ln(cols), '  ' + w.map((x) => '-'.repeat(x)).join('-+-'), ...linhas.map((l) => ln(cols.map((c) => String(l[c] ?? ''))))].join('\n');
}
async function sec<T>(t: string, fn: () => Promise<T>): Promise<T | null> {
  console.log(`\n━━━ ${t} ━━━`);
  try { return await fn(); } catch (e) { console.log(`  ⚠ ${(e as Error).message}`); return null; }
}

async function main(): Promise<void> {
  const env = loadEnvironment();
  if (!env.oracle.enabled) { console.error('ORACLE_ENABLED=false'); process.exit(1); }
  try { oracledb.initOracleClient({ libDir: env.oracle.clientPath || undefined }); } catch (e) { if (!/NJS-/.test((e as Error).message ?? '')) throw e; }
  const c = await oracledb.getConnection({ user: env.oracle.user, password: env.oracle.password, connectString: `//${env.oracle.host}:${env.oracle.port}/${env.oracle.serviceName}` });
  console.log('✓ Conectado.');

  try {
    // 1) Tabelas de APURAÇÃO (PIS/COFINS/IRPJ/CSLL) com linhas.
    await sec('1) Tabelas de APURAÇÃO (com linhas)', async () =>
      console.log(tab(await ex(c, `SELECT TABLE_NAME, NUM_ROWS FROM ALL_TABLES WHERE OWNER='GLOBUS'
        AND (TABLE_NAME LIKE '%APURACAO%' OR TABLE_NAME LIKE '%APURPISCOFINS%' OR TABLE_NAME LIKE 'CTB_ECF_APUR%' OR TABLE_NAME LIKE '%APUR_IRPJ%')
        AND NUM_ROWS > 0 ORDER BY NUM_ROWS DESC FETCH FIRST 30 ROWS ONLY`) as Array<Record<string, unknown>>)),
    );

    // 2) Colunas da CTB_ECF_APURACAO (provável ledger de apuração).
    await sec('2) CTB_ECF_APURACAO — colunas', async () =>
      console.log(tab(await ex(c, `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH FROM ALL_TAB_COLUMNS WHERE OWNER='GLOBUS' AND TABLE_NAME='CTB_ECF_APURACAO' ORDER BY COLUMN_ID FETCH FIRST 40 ROWS ONLY`) as Array<Record<string, unknown>>)),
    );

    // 3) CTB_ECF_APUR_IRPJ_CSLL — colunas + amostra (apuração IRPJ/CSLL).
    await sec('3) CTB_ECF_APUR_IRPJ_CSLL — colunas', async () =>
      console.log(tab(await ex(c, `SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS WHERE OWNER='GLOBUS' AND TABLE_NAME='CTB_ECF_APUR_IRPJ_CSLL' ORDER BY COLUMN_ID FETCH FIRST 40 ROWS ONLY`) as Array<Record<string, unknown>>)),
    );

    // 4) ISS — tabelas e colunas de alíquota/serviço.
    await sec('4) Tabelas de ISS (com linhas)', async () =>
      console.log(tab(await ex(c, `SELECT TABLE_NAME, NUM_ROWS FROM ALL_TABLES WHERE OWNER='GLOBUS'
        AND (TABLE_NAME LIKE '%ISS%' OR TABLE_NAME LIKE '%SERVICO%ALIQ%' OR TABLE_NAME LIKE '%ALIQ%ISS%' OR TABLE_NAME LIKE 'ESF%ISS%')
        AND NUM_ROWS > 0 ORDER BY NUM_ROWS DESC FETCH FIRST 25 ROWS ONLY`) as Array<Record<string, unknown>>)),
    );
    await sec('4b) Colunas com ALIQ/ISS/MUNIC em tabelas de cadastro de serviço', async () =>
      console.log(tab(await ex(c, `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS WHERE OWNER='GLOBUS'
        AND (COLUMN_NAME LIKE '%ALIQ%ISS%' OR COLUMN_NAME LIKE '%ISSQN%' OR COLUMN_NAME='ALIQUOTAISS' OR COLUMN_NAME LIKE 'COD%SERVICO%')
        ORDER BY TABLE_NAME FETCH FIRST 30 ROWS ONLY`) as Array<Record<string, unknown>>)),
    );

    // 5) Códigos de receita / DARF / GPS (pra geração de guia).
    await sec('5) Tabelas de CÓDIGO DE RECEITA / DARF / GPS', async () =>
      console.log(tab(await ex(c, `SELECT TABLE_NAME, NUM_ROWS FROM ALL_TABLES WHERE OWNER='GLOBUS'
        AND (TABLE_NAME LIKE '%DARF%' OR TABLE_NAME LIKE '%COD%RECEITA%' OR TABLE_NAME LIKE '%CODRECEITA%' OR TABLE_NAME LIKE '%GPS%' OR TABLE_NAME LIKE '%GUIA%')
        ORDER BY NUM_ROWS DESC NULLS LAST FETCH FIRST 25 ROWS ONLY`) as Array<Record<string, unknown>>)),
    );
    await sec('5b) Colunas de código de receita no CPGDOCTO (a guia tem o código?)', async () =>
      console.log(tab(await ex(c, `SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS WHERE OWNER='GLOBUS' AND TABLE_NAME='CPGDOCTO'
        AND (COLUMN_NAME LIKE '%RECEITA%' OR COLUMN_NAME LIKE '%DARF%' OR COLUMN_NAME LIKE '%CODBARRA%' OR COLUMN_NAME LIKE '%TRIBUTO%' OR COLUMN_NAME LIKE '%GUIA%' OR COLUMN_NAME LIKE '%COD_REC%')
        ORDER BY COLUMN_NAME`) as Array<Record<string, unknown>>)),
    );

    // 6) SPED / EFD.
    await sec('6) Tabelas SPED / EFD', async () =>
      console.log(tab(await ex(c, `SELECT TABLE_NAME, NUM_ROWS FROM ALL_TABLES WHERE OWNER='GLOBUS'
        AND (TABLE_NAME LIKE 'SPED%' OR TABLE_NAME LIKE 'EFD%' OR TABLE_NAME LIKE '%_SPED%' OR TABLE_NAME LIKE '%REINF%')
        ORDER BY NUM_ROWS DESC NULLS LAST FETCH FIRST 25 ROWS ONLY`) as Array<Record<string, unknown>>)),
    );
  } finally {
    await c.close();
    console.log('\n✓ Conexão fechada.');
  }
}

main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
