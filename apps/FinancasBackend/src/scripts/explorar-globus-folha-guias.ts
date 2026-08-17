/**
 * DESCOBERTA read-only — guias de imposto DA FOLHA (GPS/DARF) no Globus.
 *
 * Objetivo: hoje o painel "Tributos da folha" mostra o INSS PATRONAL como
 * ESTIMATIVA (base × 28,8%). A auditoria (§10) apontou que FLP_GPS_INTEGRACPG e
 * FLP_DARF estão POPULADAS — se elas trazem o valor REALMENTE recolhido (e,
 * idealmente, o patronal separado do retido), a gente troca a estimativa pelo
 * dado real. Este script revela as colunas/amostras pra decidir o mapeamento
 * SEM chutar nomes.
 *
 * Uso (com Oracle ligado, na rede da empresa):
 *   pnpm --filter @pioneira/financas-backend exec tsx src/scripts/explorar-globus-folha-guias.ts
 *
 * Cole a saída de volta pra mim que eu construo o ETL + entidade + endpoint.
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
  if (!env.oracle.enabled) { console.error('ORACLE_ENABLED=false — rode na rede da empresa com Oracle ligado.'); process.exit(1); }
  try { oracledb.initOracleClient({ libDir: env.oracle.clientPath || undefined }); } catch (e) { if (!/NJS-/.test((e as Error).message ?? '')) throw e; }
  const c = await oracledb.getConnection({ user: env.oracle.user, password: env.oracle.password, connectString: `//${env.oracle.host}:${env.oracle.port}/${env.oracle.serviceName}` });
  console.log('✓ Conectado.');

  try {
    // 1) Todas as tabelas FLP_* de guia/GPS/DARF/INSS/FGTS com contagem.
    await sec('1) Tabelas FLP de guia/GPS/DARF/INSS/FGTS (com linhas)', async () =>
      console.log(tab(await ex(c, `SELECT TABLE_NAME, NUM_ROWS FROM ALL_TABLES WHERE OWNER='GLOBUS'
        AND (TABLE_NAME LIKE 'FLP%GPS%' OR TABLE_NAME LIKE 'FLP%DARF%' OR TABLE_NAME LIKE 'FLP%GUIA%'
          OR TABLE_NAME LIKE 'FLP%INSS%' OR TABLE_NAME LIKE 'FLP%FGTS%' OR TABLE_NAME LIKE 'FLP%TRIBUT%'
          OR TABLE_NAME LIKE 'FLP%ENCARGO%')
        ORDER BY NUM_ROWS DESC NULLS LAST FETCH FIRST 40 ROWS ONLY`) as Array<Record<string, unknown>>)),
    );

    // 2) FLP_GPS_INTEGRACPG — colunas (é a que a §10 achou populada, 360 linhas).
    await sec('2) FLP_GPS_INTEGRACPG — colunas', async () =>
      console.log(tab(await ex(c, `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH FROM ALL_TAB_COLUMNS
        WHERE OWNER='GLOBUS' AND TABLE_NAME='FLP_GPS_INTEGRACPG' ORDER BY COLUMN_ID`) as Array<Record<string, unknown>>)),
    );

    // 3) FLP_GPS_INTEGRACPG — amostra (as datas/competência e os valores reais).
    await sec('3) FLP_GPS_INTEGRACPG — amostra (10 linhas mais recentes por ROWID)', async () =>
      console.log(tab(await ex(c, `SELECT * FROM GLOBUS.FLP_GPS_INTEGRACPG ORDER BY ROWID DESC FETCH FIRST 10 ROWS ONLY`) as Array<Record<string, unknown>>)),
    );

    // 4) FLP_DARF — colunas + amostra (33 linhas na §10; IRRF da folha).
    await sec('4) FLP_DARF — colunas', async () =>
      console.log(tab(await ex(c, `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH FROM ALL_TAB_COLUMNS
        WHERE OWNER='GLOBUS' AND TABLE_NAME='FLP_DARF' ORDER BY COLUMN_ID`) as Array<Record<string, unknown>>)),
    );
    await sec('4b) FLP_DARF — amostra', async () =>
      console.log(tab(await ex(c, `SELECT * FROM GLOBUS.FLP_DARF ORDER BY ROWID DESC FETCH FIRST 10 ROWS ONLY`) as Array<Record<string, unknown>>)),
    );

    // 5) O patronal está separado do retido? Procurar colunas com essa semântica
    //    em qualquer tabela FLP (PATRONAL/EMPRESA/SEGURADO/DESCONTADO/RAT/TERCEIROS).
    await sec('5) Colunas FLP com semântica de patronal x retido', async () =>
      console.log(tab(await ex(c, `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS WHERE OWNER='GLOBUS'
        AND TABLE_NAME LIKE 'FLP%'
        AND (COLUMN_NAME LIKE '%PATRONAL%' OR COLUMN_NAME LIKE '%EMPRESA%' OR COLUMN_NAME LIKE '%SEGURADO%'
          OR COLUMN_NAME LIKE '%DESCONT%' OR COLUMN_NAME LIKE '%RAT%' OR COLUMN_NAME LIKE '%TERCEIRO%'
          OR COLUMN_NAME LIKE '%CPP%' OR COLUMN_NAME LIKE '%SAT%')
        ORDER BY TABLE_NAME, COLUMN_NAME FETCH FIRST 60 ROWS ONLY`) as Array<Record<string, unknown>>)),
    );

    // 6) FGTS — a guia da folha traz o FGTS depositado (pra cruzar com o 508/505/506/507)?
    await sec('6) Tabelas/colunas FLP de FGTS', async () =>
      console.log(tab(await ex(c, `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS WHERE OWNER='GLOBUS'
        AND TABLE_NAME LIKE 'FLP%' AND COLUMN_NAME LIKE '%FGTS%'
        ORDER BY TABLE_NAME, COLUMN_NAME FETCH FIRST 40 ROWS ONLY`) as Array<Record<string, unknown>>)),
    );

    // 7) Amarração com a competência da folha e com o CP (a guia vira origem='guia'?).
    await sec('7) Colunas de competência/CPG nas tabelas de guia da folha', async () =>
      console.log(tab(await ex(c, `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS WHERE OWNER='GLOBUS'
        AND (TABLE_NAME='FLP_GPS_INTEGRACPG' OR TABLE_NAME='FLP_DARF')
        AND (COLUMN_NAME LIKE '%COMPET%' OR COLUMN_NAME LIKE '%MESANO%' OR COLUMN_NAME LIKE '%REFER%'
          OR COLUMN_NAME LIKE '%CODDOCTOCPG%' OR COLUMN_NAME LIKE '%CPG%' OR COLUMN_NAME LIKE '%DTVENC%'
          OR COLUMN_NAME LIKE '%VENC%' OR COLUMN_NAME LIKE '%PAGAM%')
        ORDER BY TABLE_NAME, COLUMN_NAME`) as Array<Record<string, unknown>>)),
    );
  } finally {
    await c.close();
    console.log('\n✓ Conexão fechada.');
  }
}

main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
