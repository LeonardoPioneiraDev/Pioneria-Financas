/**
 * Fase 2 da descoberta — investiga as tabelas top identificadas na fase 1.
 *
 * Tabelas alvo (read-only):
 *  - T_ARR_RELFECHCAIXA (1.5M linhas) — fechamento de caixa diário (arrecadação)
 *  - CRC_OCORRENCIASBANCARIAS, CPG_OCORRENCIASBANCARIAS — ocorrências bancárias
 *  - BCOBANCO — cadastro de bancos
 *  - BGM_CLIENTE, BSP_GLB_CLIENTE — clientes
 *  - CRCCONTACTB_CLIENTE — conta contábil por cliente
 *  - Procura tabelas-mestre CRC com documentos (CRCDOCTO? CRCITDOC? CRCDOCTO_TIT?)
 *  - EST_NOTAFISCAL* — notas fiscais (entrada vs saída)
 *
 * NÃO escreve. Apenas SELECT no dicionário + amostragem.
 *
 * Uso: pnpm --filter @pioneira/financas-backend exec tsx src/scripts/explorar-globus-cr2.ts
 */

import 'reflect-metadata';
import oracledb from 'oracledb';
import { loadEnvironment } from '@/config/environment.js';

function assertReadOnly(sql: string): void {
  const dml = sql.trimStart().match(/^(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/i);
  if (dml) throw new Error(`SQL bloqueada (read-only): ${dml[1]}`);
}

async function executar<T = Record<string, unknown>>(
  conn: oracledb.Connection,
  sql: string,
  binds: oracledb.BindParameters = {},
): Promise<T[]> {
  assertReadOnly(sql);
  const r = await conn.execute<T>(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false });
  return r.rows ?? [];
}

function fmt(linhas: Array<Record<string, unknown>>, maxCols = 60): string {
  if (linhas.length === 0) return '  (sem resultados)';
  const cols = Object.keys(linhas[0]!);
  const larguras = cols.map((c) =>
    Math.min(maxCols, Math.max(c.length, ...linhas.map((l) => String(l[c] ?? '').length))),
  );
  const linha = (vals: string[]): string =>
    '  ' + vals.map((v, i) => v.padEnd(larguras[i]!).slice(0, larguras[i]!)).join(' | ');
  const sep = '  ' + larguras.map((w) => '-'.repeat(w)).join('-+-');
  return [linha(cols), sep, ...linhas.map((l) => linha(cols.map((c) => String(l[c] ?? ''))))].join('\n');
}

async function detalhar(conn: oracledb.Connection, owner: string, tab: string): Promise<void> {
  console.log(`\n▼ ${owner}.${tab}`);
  // Colunas
  const cols = await executar<{ COLUMN_NAME: string; DATA_TYPE: string; NULLABLE: string; DATA_LENGTH: number }>(
    conn,
    `SELECT COLUMN_NAME, DATA_TYPE, NULLABLE, DATA_LENGTH
     FROM   ALL_TAB_COLUMNS
     WHERE  OWNER = :p_owner AND TABLE_NAME = :p_tab
     ORDER  BY COLUMN_ID`,
    { p_owner: owner, p_tab: tab },
  );
  console.log(`  ${cols.length} colunas:`);
  console.log(fmt(cols.slice(0, 50)));
  if (cols.length > 50) console.log(`  …+${cols.length - 50}`);

  // Amostra
  try {
    const amostra = await executar<Record<string, unknown>>(
      conn,
      `SELECT * FROM ${owner}.${tab} FETCH FIRST 2 ROWS ONLY`,
    );
    if (amostra.length === 0) {
      console.log('  (tabela vazia)');
      return;
    }
    console.log(`\n  Amostra (${amostra.length} linha${amostra.length > 1 ? 's' : ''}):`);
    for (let i = 0; i < amostra.length; i++) {
      const naoNulos = Object.entries(amostra[i]!).filter(([, v]) => v !== null && v !== '');
      console.log(`  ── linha ${i + 1} (${naoNulos.length} campos não-nulos):`);
      for (const [k, v] of naoNulos.slice(0, 25)) {
        console.log(`    ${k.padEnd(28)} = ${String(v).slice(0, 80)}`);
      }
      if (naoNulos.length > 25) console.log(`    …+${naoNulos.length - 25} campos`);
    }
  } catch (err) {
    console.log(`  ⚠ amostragem falhou: ${(err as Error).message}`);
  }
}

async function main(): Promise<void> {
  const env = loadEnvironment();
  if (!env.oracle.enabled) {
    console.error('ORACLE_ENABLED=false');
    process.exit(1);
  }
  try { oracledb.initOracleClient({ libDir: env.oracle.clientPath || undefined }); } catch (e) { if (!/NJS-/.test((e as Error).message)) throw e; }

  const conn = await oracledb.getConnection({
    user: env.oracle.user, password: env.oracle.password,
    connectString: `//${env.oracle.host}:${env.oracle.port}/${env.oracle.serviceName}`,
  });
  console.log('✓ Conectado.\n');

  try {
    const OWNER = 'GLOBUS';

    // ============ 1) Procura tabelas-mestre de Contas a Receber ============
    console.log('━━━ 1) Tabelas-mestre prováveis de Contas a Receber ━━━');
    const crcMaster = await executar<{ TABLE_NAME: string; NUM_ROWS: number | null }>(
      conn,
      `SELECT TABLE_NAME, NUM_ROWS
       FROM   ALL_TABLES
       WHERE  OWNER = :p_owner
         AND  (TABLE_NAME LIKE 'CRC%DOC%' OR TABLE_NAME LIKE 'CRCDOC%'
            OR TABLE_NAME LIKE 'CRC_DOC%' OR TABLE_NAME LIKE 'CRCIT%'
            OR TABLE_NAME LIKE 'CRC_TIT%' OR TABLE_NAME LIKE 'CRCTIT%'
            OR TABLE_NAME LIKE 'CRC_REC%' OR TABLE_NAME LIKE 'CRCREC%'
            OR TABLE_NAME LIKE 'CRC_FATURA%' OR TABLE_NAME LIKE 'CRCFAT%'
            OR TABLE_NAME LIKE 'CRC_BOLETO%' OR TABLE_NAME LIKE 'CRCBOL%')
       ORDER  BY NUM_ROWS DESC NULLS LAST, TABLE_NAME`,
      { p_owner: OWNER },
    );
    console.log(fmt(crcMaster));
    console.log();

    // ============ 2) Lista TODAS as tabelas CRC ordenadas por nome ============
    console.log('━━━ 2) Todas as tabelas CRC (prefixo Contas a Receber Praxio) ━━━');
    const todasCrc = await executar<{ TABLE_NAME: string; NUM_ROWS: number | null }>(
      conn,
      `SELECT TABLE_NAME, NUM_ROWS
       FROM   ALL_TABLES
       WHERE  OWNER = :p_owner AND TABLE_NAME LIKE 'CRC%'
       ORDER  BY NUM_ROWS DESC NULLS LAST, TABLE_NAME`,
      { p_owner: OWNER },
    );
    console.log(`Total: ${todasCrc.length} tabelas`);
    console.log(fmt(todasCrc.slice(0, 40)));
    if (todasCrc.length > 40) console.log(`…+${todasCrc.length - 40}`);
    console.log();

    // ============ 3) Notas fiscais de saída ============
    console.log('━━━ 3) Notas fiscais de SAÍDA (vendas) ━━━');
    const nfSaida = await executar<{ TABLE_NAME: string; NUM_ROWS: number | null }>(
      conn,
      `SELECT TABLE_NAME, NUM_ROWS
       FROM   ALL_TABLES
       WHERE  OWNER = :p_owner
         AND  (TABLE_NAME LIKE '%NOTAFISCAL%' OR TABLE_NAME LIKE '%NFSAIDA%' OR TABLE_NAME LIKE '%NF_SAID%' OR TABLE_NAME LIKE 'BGM_NF%')
       ORDER  BY NUM_ROWS DESC NULLS LAST`,
      { p_owner: OWNER },
    );
    console.log(fmt(nfSaida.slice(0, 20)));
    console.log();

    // ============ 4) Detalhe da tabela TOP de caixa ============
    console.log('━━━ 4) T_ARR_RELFECHCAIXA — TOP TABELA (1.5M linhas) ━━━');
    await detalhar(conn, OWNER, 'T_ARR_RELFECHCAIXA');

    // ============ 5) Cadastro de bancos ============
    console.log('\n━━━ 5) BCOBANCO — cadastro de bancos da Pioneira ━━━');
    await detalhar(conn, OWNER, 'BCOBANCO');

    // ============ 6) Detalhar ocorrências bancárias (CRC vs CPG) ============
    console.log('\n━━━ 6) CRC_OCORRENCIASBANCARIAS — ocorrências do receber ━━━');
    await detalhar(conn, OWNER, 'CRC_OCORRENCIASBANCARIAS');

    console.log('\n━━━ 7) CPG_OCORRENCIASBANCARIAS — ocorrências do pagar ━━━');
    await detalhar(conn, OWNER, 'CPG_OCORRENCIASBANCARIAS');

    // ============ 8) Cadastro de clientes ============
    console.log('\n━━━ 8) BGM_CLIENTE — cadastro de clientes (5118 linhas) ━━━');
    await detalhar(conn, OWNER, 'BGM_CLIENTE');

    // ============ 9) Verifica tabelas EST_* (notas fiscais NF saída) ============
    console.log('\n━━━ 9) BGM_NOTAFISCAL — tipos de documento e statuses ━━━');
    try {
      const tipos = await executar<Record<string, unknown>>(
        conn,
        `SELECT DISTINCT CODTPDOC, COUNT(*) QTD
         FROM   ${OWNER}.BGM_NOTAFISCAL
         GROUP  BY CODTPDOC
         ORDER  BY QTD DESC FETCH FIRST 10 ROWS ONLY`,
      );
      console.log(fmt(tipos));
      console.log('  ↑ Procurando tipo "NFS" (NF saída) ou "FAT" (fatura) entre eles.\n');
    } catch (err) {
      console.log(`  ⚠ ${(err as Error).message}\n`);
    }

    // ============ 10) Verifica fluxo de caixa específico (T_ARR_RELFECHCAIXA agregado) ============
    console.log('\n━━━ 10) T_ARR_RELFECHCAIXA — agregado por mês (últimos 6 meses) ━━━');
    try {
      const fechMes = await executar<Record<string, unknown>>(
        conn,
        `SELECT TO_CHAR(DATARELFECHCAIXA, 'YYYY-MM') AS MES,
                COUNT(*) AS QTD_FECHAMENTOS,
                COUNT(DISTINCT CODIGOEMPRESA) AS EMPRESAS,
                COUNT(DISTINCT CODIGOFL) AS FILIAIS
         FROM   ${OWNER}.T_ARR_RELFECHCAIXA
         WHERE  DATARELFECHCAIXA >= ADD_MONTHS(SYSDATE, -6)
         GROUP  BY TO_CHAR(DATARELFECHCAIXA, 'YYYY-MM')
         ORDER  BY 1 DESC`,
      );
      console.log(fmt(fechMes));
    } catch (err) {
      const msg = (err as Error).message;
      console.log(`  ⚠ falha: ${msg}`);
      // Tenta alternativas de nome de coluna de data
      console.log('  ↳ tentando descobrir colunas de data automaticamente…');
      const cols = await executar<{ COLUMN_NAME: string; DATA_TYPE: string }>(
        conn,
        `SELECT COLUMN_NAME, DATA_TYPE
         FROM   ALL_TAB_COLUMNS
         WHERE  OWNER = :p_owner AND TABLE_NAME = 'T_ARR_RELFECHCAIXA'
           AND  DATA_TYPE = 'DATE'
         ORDER  BY COLUMN_ID`,
        { p_owner: OWNER },
      );
      console.log('  Colunas DATE encontradas:');
      console.log(fmt(cols));
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
