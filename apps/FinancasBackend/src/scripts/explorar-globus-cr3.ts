/**
 * Fase 3 — Detalha CRCDOCTO, CRCITDOC, CRCTPREC + range de datas em
 * T_ARR_RELFECHCAIXA. Tudo SELECT puro (read-only).
 */
import 'reflect-metadata';
import oracledb from 'oracledb';
import { loadEnvironment } from '@/config/environment.js';

function assertReadOnly(sql: string): void {
  const m = sql.trimStart().match(/^(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/i);
  if (m) throw new Error(`SQL bloqueada: ${m[1]}`);
}
async function exec<T = Record<string, unknown>>(c: oracledb.Connection, sql: string, b: oracledb.BindParameters = {}): Promise<T[]> {
  assertReadOnly(sql);
  return (await c.execute<T>(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false })).rows ?? [];
}
function fmt(rs: Array<Record<string, unknown>>): string {
  if (!rs.length) return '  (vazio)';
  const cs = Object.keys(rs[0]!);
  const ws = cs.map((c) => Math.min(60, Math.max(c.length, ...rs.map((r) => String(r[c] ?? '').length))));
  const line = (vs: string[]): string => '  ' + vs.map((v, i) => v.padEnd(ws[i]!).slice(0, ws[i]!)).join(' | ');
  return [line(cs), '  ' + ws.map((w) => '-'.repeat(w)).join('-+-'), ...rs.map((r) => line(cs.map((c) => String(r[c] ?? ''))))].join('\n');
}

async function main(): Promise<void> {
  const env = loadEnvironment();
  try { oracledb.initOracleClient({ libDir: env.oracle.clientPath || undefined }); } catch (e) { if (!/NJS-/.test((e as Error).message)) throw e; }
  const c = await oracledb.getConnection({
    user: env.oracle.user, password: env.oracle.password,
    connectString: `//${env.oracle.host}:${env.oracle.port}/${env.oracle.serviceName}`,
  });
  console.log('✓ Conectado.\n');
  try {
    // ============ CRCDOCTO ============
    console.log('━━━ CRCDOCTO — Títulos de Contas a Receber (69.140 linhas) ━━━');
    const colsCrcDoc = await exec<{ COLUMN_NAME: string; DATA_TYPE: string; DATA_LENGTH: number; NULLABLE: string }>(c,
      `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE FROM ALL_TAB_COLUMNS
       WHERE OWNER='GLOBUS' AND TABLE_NAME='CRCDOCTO' ORDER BY COLUMN_ID`);
    console.log(`${colsCrcDoc.length} colunas:`);
    console.log(fmt(colsCrcDoc));
    console.log('\n  Amostra (1 linha):');
    const amCrc = await exec<Record<string, unknown>>(c, `SELECT * FROM GLOBUS.CRCDOCTO WHERE STATUSDOCTOCRC <> 'C' FETCH FIRST 1 ROWS ONLY`);
    if (amCrc.length > 0) {
      const naoNulos = Object.entries(amCrc[0]!).filter(([, v]) => v !== null && v !== '');
      for (const [k, v] of naoNulos) console.log(`    ${k.padEnd(30)} = ${String(v).slice(0, 80)}`);
    }

    // ============ CRCITDOC ============
    console.log('\n━━━ CRCITDOC — Itens dos Títulos CR (74.352 linhas) ━━━');
    const colsCrcIt = await exec<{ COLUMN_NAME: string; DATA_TYPE: string }>(c,
      `SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS
       WHERE OWNER='GLOBUS' AND TABLE_NAME='CRCITDOC' ORDER BY COLUMN_ID`);
    console.log(`${colsCrcIt.length} colunas:`);
    console.log(fmt(colsCrcIt));
    const amIt = await exec<Record<string, unknown>>(c, `SELECT * FROM GLOBUS.CRCITDOC FETCH FIRST 1 ROWS ONLY`);
    console.log('\n  Amostra (1 linha):');
    if (amIt.length > 0) {
      for (const [k, v] of Object.entries(amIt[0]!).filter(([, v]) => v !== null && v !== '')) {
        console.log(`    ${k.padEnd(30)} = ${String(v).slice(0, 80)}`);
      }
    }

    // ============ CRCTPREC ============
    console.log('\n━━━ CRCTPREC — Tipos de Receita (241 linhas) ━━━');
    const tpRec = await exec<Record<string, unknown>>(c, `SELECT * FROM GLOBUS.CRCTPREC FETCH FIRST 20 ROWS ONLY`);
    console.log(fmt(tpRec.slice(0, 10)));

    // ============ Range de datas + agregados CRCDOCTO ============
    console.log('\n━━━ CRCDOCTO — Distribuição por status e ano de vencimento ━━━');
    const distCrc = await exec<Record<string, unknown>>(c,
      `SELECT EXTRACT(YEAR FROM D.VENCIMENTOCRC) AS ANO,
              D.STATUSDOCTOCRC AS STATUS,
              COUNT(*) AS QTD,
              ROUND(SUM(NVL((SELECT SUM(I.VALORITEMDOC) FROM GLOBUS.CRCITDOC I WHERE I.CODDOCTOCRC = D.CODDOCTOCRC), 0)), 2) AS TOTAL_R$
       FROM   GLOBUS.CRCDOCTO D
       WHERE  D.VENCIMENTOCRC >= DATE '2024-01-01'
       GROUP  BY EXTRACT(YEAR FROM D.VENCIMENTOCRC), D.STATUSDOCTOCRC
       ORDER  BY 1 DESC, 2`);
    console.log(fmt(distCrc));

    // ============ Por empresa Pioneira (cod_empresa=4) últimos 365 dias ============
    console.log('\n━━━ CRCDOCTO Pioneira (empresa=4) — últimos 365 dias ━━━');
    const emp = await exec<Record<string, unknown>>(c,
      `SELECT D.CODIGOEMPRESA, D.STATUSDOCTOCRC,
              COUNT(*) AS QTD,
              ROUND(SUM(NVL((SELECT SUM(I.VALORITEMDOC) FROM GLOBUS.CRCITDOC I WHERE I.CODDOCTOCRC = D.CODDOCTOCRC), 0)), 2) AS TOTAL_R$
       FROM   GLOBUS.CRCDOCTO D
       WHERE  D.VENCIMENTOCRC >= TRUNC(SYSDATE) - 365
         AND  D.CODIGOEMPRESA = 4
       GROUP  BY D.CODIGOEMPRESA, D.STATUSDOCTOCRC
       ORDER  BY 1, 2`);
    console.log(fmt(emp));

    // ============ Top tipos de doc ============
    console.log('\n━━━ CRCDOCTO — Top tipos de documento (CODTPDOC) ━━━');
    const tpD = await exec<Record<string, unknown>>(c,
      `SELECT D.CODTPDOC, COUNT(*) QTD
       FROM   GLOBUS.CRCDOCTO D
       WHERE  D.VENCIMENTOCRC >= TRUNC(SYSDATE) - 365 AND D.STATUSDOCTOCRC <> 'C'
       GROUP  BY D.CODTPDOC
       ORDER  BY 2 DESC FETCH FIRST 10 ROWS ONLY`);
    console.log(fmt(tpD));

    // ============ T_ARR_RELFECHCAIXA — range temporal e volume ============
    console.log('\n━━━ T_ARR_RELFECHCAIXA — range temporal (Pioneira: empresa=4) ━━━');
    const arrAgg = await exec<Record<string, unknown>>(c,
      `SELECT TO_CHAR(DAT_PREST_CONTAS, 'YYYY-MM') MES,
              COUNT(*) QTD_GUIAS,
              ROUND(SUM(VLR_DINHEIRO), 2) DINHEIRO_R$,
              ROUND(SUM(LANCC), 2) LANCAMENTOS_C,
              ROUND(SUM(LANCD), 2) LANCAMENTOS_D,
              ROUND(SUM(COMISSAO), 2) COMISSAO,
              ROUND(SUM(DESPESAS), 2) DESPESAS,
              ROUND(SUM(ASSALTO_CADASTRO), 2) ASSALTOS_R$
       FROM   GLOBUS.T_ARR_RELFECHCAIXA
       WHERE  DAT_PREST_CONTAS >= TRUNC(SYSDATE) - 90
         AND  COD_EMPRESA = 4
       GROUP  BY TO_CHAR(DAT_PREST_CONTAS, 'YYYY-MM')
       ORDER  BY 1 DESC`);
    console.log(fmt(arrAgg));

    // ============ Próximos vencimentos a receber (30 dias) ============
    console.log('\n━━━ CRCDOCTO — próximos vencimentos (30 dias) ━━━');
    const venc = await exec<Record<string, unknown>>(c,
      `SELECT TO_CHAR(D.VENCIMENTOCRC, 'YYYY-MM-DD') AS VENCIMENTO,
              D.STATUSDOCTOCRC AS STATUS,
              COUNT(*) AS QTD,
              ROUND(SUM(NVL((SELECT SUM(I.VALORITEMDOC) FROM GLOBUS.CRCITDOC I WHERE I.CODDOCTOCRC = D.CODDOCTOCRC), 0)), 2) AS TOTAL_R$
       FROM   GLOBUS.CRCDOCTO D
       WHERE  D.VENCIMENTOCRC BETWEEN TRUNC(SYSDATE) AND TRUNC(SYSDATE) + 30
         AND  D.CODIGOEMPRESA = 4
         AND  D.STATUSDOCTOCRC <> 'C'
       GROUP  BY TO_CHAR(D.VENCIMENTOCRC, 'YYYY-MM-DD'), D.STATUSDOCTOCRC
       ORDER  BY 1`);
    console.log(fmt(venc));
  } finally {
    await c.close();
    console.log('\n✓ Conexão fechada.');
  }
}

main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
