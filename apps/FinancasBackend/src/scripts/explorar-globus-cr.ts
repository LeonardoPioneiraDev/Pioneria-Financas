/**
 * Script de DESCOBERTA read-only no Globus (Oracle/Praxio).
 *
 * Procura tabelas relacionadas a:
 *  - Contas a Receber (CRD*, REC*, FATUR*, COBR*, CLIENTE*)
 *  - Fluxo de caixa / bancos (BANC*, CAIXA*, MOV*, FLUX*)
 *  - Faturamento (NF saida, faturas a clientes)
 *
 * NÃO escreve nada no Oracle — bloqueia DML por regex. Apenas SELECT no
 * dicionário (ALL_TABLES, ALL_TAB_COLUMNS) + amostragem de 1 linha.
 *
 * Uso: pnpm --filter @pioneira/financas-backend exec tsx src/scripts/explorar-globus-cr.ts
 */

import 'reflect-metadata';
import oracledb from 'oracledb';
import { loadEnvironment } from '@/config/environment.js';

const PADROES_INTERESSE = [
  '%CRD%',
  '%RECEB%',
  '%FATUR%',
  '%COBR%',
  '%CLIENTE%',
  '%CAIXA%',
  '%BANC%',
  '%FLUX%',
  '%TAR_REPASSE%',
  '%REPASSE%',
  '%SEMOB%',
  '%CONSORCIO%',
  '%NFSAID%',
  '%NF_SAID%',
];

/** Bloqueia qualquer SQL que não seja SELECT puro. */
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

function formatarLinhas(linhas: Array<Record<string, unknown>>): string {
  if (linhas.length === 0) return '  (sem resultados)';
  const cols = Object.keys(linhas[0]!);
  const larguras = cols.map((c) =>
    Math.min(50, Math.max(c.length, ...linhas.map((l) => String(l[c] ?? '').length))),
  );
  const linha = (vals: string[]): string =>
    '  ' + vals.map((v, i) => v.padEnd(larguras[i]!).slice(0, larguras[i]!)).join(' | ');
  const sep = '  ' + larguras.map((w) => '-'.repeat(w)).join('-+-');
  const out: string[] = [];
  out.push(linha(cols));
  out.push(sep);
  for (const l of linhas) out.push(linha(cols.map((c) => String(l[c] ?? ''))));
  return out.join('\n');
}

async function main(): Promise<void> {
  const env = loadEnvironment();
  if (!env.oracle.enabled) {
    console.error('ORACLE_ENABLED=false — abortando.');
    process.exit(1);
  }

  console.log(`▶ Conectando ao Oracle ${env.oracle.host}:${env.oracle.port}/${env.oracle.serviceName} (modo Thick)…`);
  try {
    oracledb.initOracleClient({ libDir: env.oracle.clientPath || undefined });
  } catch (err) {
    const m = (err as Error).message ?? '';
    if (!/NJS-/.test(m)) throw err; // já inicializado em outro processo, ok
  }

  const conn = await oracledb.getConnection({
    user: env.oracle.user,
    password: env.oracle.password,
    connectString: `//${env.oracle.host}:${env.oracle.port}/${env.oracle.serviceName}`,
  });
  console.log('✓ Conectado.\n');

  try {
    // ============ 1) Schemas/owners disponíveis ============
    console.log('━━━ 1) Schemas com tabelas que combinam os padrões ━━━\n');
    const schemasRow = await executar<{ OWNER: string; QTD: number }>(
      conn,
      `SELECT OWNER, COUNT(*) AS QTD
       FROM   ALL_TABLES
       WHERE  ${PADROES_INTERESSE.map((_, i) => `TABLE_NAME LIKE :p${i}`).join(' OR ')}
       GROUP  BY OWNER
       ORDER  BY QTD DESC FETCH FIRST 10 ROWS ONLY`,
      Object.fromEntries(PADROES_INTERESSE.map((p, i) => [`p${i}`, p])),
    );
    console.log(formatarLinhas(schemasRow));
    console.log();

    const owner = schemasRow[0]?.OWNER ?? 'GLOBUS';
    console.log(`▶ Usando OWNER = ${owner}\n`);

    // ============ 2) Tabelas por padrão ============
    for (const padrao of PADROES_INTERESSE) {
      const linhas = await executar<{ TABLE_NAME: string; NUM_ROWS: number | null; LAST_ANALYZED: Date | null }>(
        conn,
        `SELECT TABLE_NAME, NUM_ROWS, LAST_ANALYZED
         FROM   ALL_TABLES
         WHERE  OWNER = :owner AND TABLE_NAME LIKE :padrao
         ORDER  BY NUM_ROWS DESC NULLS LAST, TABLE_NAME`,
        { owner, padrao },
      );
      if (linhas.length > 0) {
        console.log(`━━━ Padrão ${padrao} (${linhas.length} tabelas) ━━━`);
        console.log(formatarLinhas(linhas));
        console.log();
      }
    }

    // ============ 3) Para tabelas críticas, listar colunas ============
    const candidatas = await executar<{ TABLE_NAME: string; NUM_ROWS: number | null }>(
      conn,
      `SELECT TABLE_NAME, NUM_ROWS
       FROM   ALL_TABLES
       WHERE  OWNER = :owner
         AND  (TABLE_NAME LIKE '%CRD_%' OR TABLE_NAME LIKE 'CRD%'
            OR TABLE_NAME LIKE 'FAT_%' OR TABLE_NAME LIKE '%FATURA%'
            OR TABLE_NAME LIKE 'COBR%' OR TABLE_NAME LIKE 'BANC%'
            OR TABLE_NAME LIKE '%CONTACORR%' OR TABLE_NAME LIKE '%MOV_BAN%'
            OR TABLE_NAME LIKE 'CFC%' OR TABLE_NAME LIKE '%REPASSE%')
         AND  NUM_ROWS > 0
       ORDER  BY NUM_ROWS DESC FETCH FIRST 12 ROWS ONLY`,
      { owner },
    );

    if (candidatas.length === 0) {
      console.log('━━━ Nenhuma tabela candidata com NUM_ROWS > 0 (talvez estatísticas desatualizadas) ━━━\n');
    } else {
      console.log(`━━━ Top ${candidatas.length} candidatas (mais linhas) — detalhamento de colunas ━━━\n`);
      for (const t of candidatas) {
        console.log(`▼ ${owner}.${t.TABLE_NAME}  (~${t.NUM_ROWS?.toLocaleString('pt-BR') ?? '?'} linhas)`);
        const cols = await executar<{ COLUMN_NAME: string; DATA_TYPE: string; NULLABLE: string; DATA_LENGTH: number }>(
          conn,
          `SELECT COLUMN_NAME, DATA_TYPE, NULLABLE, DATA_LENGTH
           FROM   ALL_TAB_COLUMNS
           WHERE  OWNER = :owner AND TABLE_NAME = :table
           ORDER  BY COLUMN_ID`,
          { owner, table: t.TABLE_NAME },
        );
        console.log(formatarLinhas(cols.slice(0, 40)));
        if (cols.length > 40) console.log(`  … (+${cols.length - 40} colunas)`);
        console.log();
      }
    }

    // ============ 4) Sample de 1 linha das 3 tabelas top ============
    console.log('━━━ Amostra (1 linha) das 3 tabelas com mais registros ━━━\n');
    for (const t of candidatas.slice(0, 3)) {
      console.log(`▼ ${owner}.${t.TABLE_NAME}`);
      try {
        const amostra = await executar<Record<string, unknown>>(
          conn,
          `SELECT * FROM ${owner}.${t.TABLE_NAME} FETCH FIRST 1 ROWS ONLY`,
        );
        if (amostra.length === 0) {
          console.log('  (vazia)\n');
          continue;
        }
        const linha = amostra[0]!;
        const naoNulos = Object.entries(linha).filter(([, v]) => v !== null && v !== '');
        for (const [k, v] of naoNulos.slice(0, 30)) {
          const valor = String(v).slice(0, 80);
          console.log(`  ${k.padEnd(28)} = ${valor}`);
        }
        if (naoNulos.length > 30) console.log(`  ... (+${naoNulos.length - 30} campos não-nulos)`);
        console.log();
      } catch (err) {
        console.log(`  ⚠ erro ao amostrar: ${(err as Error).message}\n`);
      }
    }
  } finally {
    await conn.close();
    console.log('✓ Conexão fechada.');
  }
}

main().catch((err) => {
  console.error('FALHA:', err);
  process.exit(1);
});
