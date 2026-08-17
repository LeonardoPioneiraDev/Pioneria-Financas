/**
 * Script de DESCOBERTA read-only no Globus (Oracle/Praxio).
 *
 * Objetivo: detalhar os ITENS de um titulo do Contas a Pagar por CONTA CONTABIL /
 * natureza (o que a imagem do doc 8918 mostra: o valor total = soma de itens com
 * classificacoes contabeis diferentes). Responde:
 *   1) Quais colunas de conta/natureza/descricao existem em CPGITDOC?
 *   2) Os itens do(s) documento(s) 8918 (empresa 4) — bate com a imagem?
 *   3) Tabelas-mestre candidatas pra DESCRICAO da conta contabil (plano de contas).
 *   4) Resolve a descricao das contas usadas no 8918.
 *
 * NAO escreve nada — bloqueia DML por regex. Apenas SELECT.
 *
 * Uso: pnpm --filter @pioneira/financas-backend exec tsx src/scripts/explorar-globus-cp-itens.ts
 */

import 'reflect-metadata';
import oracledb from 'oracledb';
import { loadEnvironment } from '@/config/environment.js';

const DOC = '8918'; // numero do documento da imagem

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
    console.error('ORACLE_ENABLED=false — abortando.');
    process.exit(1);
  }

  console.log(`▶ Conectando ao Oracle ${env.oracle.host}:${env.oracle.port}/${env.oracle.serviceName} (Thick)…`);
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
    // 1) Colunas de CPGITDOC relacionadas a conta/natureza/descricao/valor.
    await secao('1) CPGITDOC — colunas de conta/natureza/descricao/valor', async () => {
      const cols = await executar(
        conn,
        `SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
         FROM ALL_TAB_COLUMNS
         WHERE TABLE_NAME = 'CPGITDOC'
           AND (COLUMN_NAME LIKE '%CONTA%' OR COLUMN_NAME LIKE '%NATUREZA%'
             OR COLUMN_NAME LIKE '%DESCR%' OR COLUMN_NAME LIKE '%HISTOR%'
             OR COLUMN_NAME LIKE '%VALOR%' OR COLUMN_NAME LIKE '%ITEM%'
             OR COLUMN_NAME LIKE '%CUSTO%' OR COLUMN_NAME LIKE '%PLANO%')
         ORDER BY COLUMN_ID`,
      );
      console.log(tabela(cols));
    });

    // 2) Documento(s) 8918 da empresa 4 + seus itens.
    const docs = await secao(`2) Documento(s) ${DOC} (empresa 4) no CPGDOCTO`, async () => {
      const rows = await executar<{ CODDOCTOCPG: number; NRODOCTOCPG: string }>(
        conn,
        `SELECT CODDOCTOCPG, NRODOCTOCPG, SERIEDOCTOCPG, NROPARCELACPG, CODTPDOC,
                VENCIMENTOCPG, STATUSDOCTOCPG
         FROM CPGDOCTO
         WHERE CODIGOEMPRESA = 4 AND REGEXP_REPLACE(NRODOCTOCPG, '^0+', '') = :doc
         ORDER BY CODDOCTOCPG`,
        { doc: DOC },
      );
      console.log(tabela(rows));
      return rows;
    });

    // 3) Itens de cada documento 8918 — TODAS as colunas (pra ver conta/descricao reais).
    for (const d of (docs ?? []).slice(0, 4)) {
      await secao(`3) Itens do CODDOCTOCPG=${d.CODDOCTOCPG} (NRO ${d.NRODOCTOCPG}) + conta contabil`, async () => {
        const itens = await executar(
          conn,
          `SELECT I.CODITEMDOCCPG, I.CODCONTACTB, C.CLASSIFICADOR, C.NOMECONTA,
                  I.CODCUSTOFIN, I.VALORITEMDOC, I.OBSITEMDOCTOCPG, I.ITEMRATEADO, I.NROPLANO
           FROM CPGITDOC I
           LEFT JOIN CTBCONTA C ON C.CODCONTACTB = I.CODCONTACTB AND C.NROPLANO = I.NROPLANO
           WHERE I.CODDOCTOCPG = :cod
           ORDER BY I.VALORITEMDOC DESC`,
          { cod: d.CODDOCTOCPG },
        );
        console.log(tabela(itens as Array<Record<string, unknown>>));
      });
    }

    // 4) Tabelas-mestre candidatas pra DESCRICAO da conta contabil (plano de contas).
    await secao('4) Tabelas-mestre candidatas (plano de contas / conta contabil)', async () => {
      const rows = await executar(
        conn,
        `SELECT OWNER, TABLE_NAME, NUM_ROWS
         FROM ALL_TABLES
         WHERE (TABLE_NAME LIKE '%PLANOCONTA%' OR TABLE_NAME LIKE '%PLACONTA%'
             OR TABLE_NAME LIKE '%CONTACTB%' OR TABLE_NAME LIKE '%CONTACONTABIL%'
             OR TABLE_NAME LIKE 'CTB%CONTA%' OR TABLE_NAME LIKE '%PLANO_CONTA%')
         ORDER BY NUM_ROWS DESC NULLS LAST
         FETCH FIRST 40 ROWS ONLY`,
      );
      console.log(tabela(rows));
      for (const m of (rows as Array<{ OWNER: string; TABLE_NAME: string; NUM_ROWS: number | null }>)
        .filter((t) => (t.NUM_ROWS ?? 0) > 0 && (t.NUM_ROWS ?? 0) <= 20000)
        .slice(0, 3)) {
        const cols = await executar(
          conn,
          `SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS
           WHERE OWNER = :o AND TABLE_NAME = :t
             AND (COLUMN_NAME LIKE '%CONTA%' OR COLUMN_NAME LIKE '%CODIGO%'
               OR COLUMN_NAME LIKE '%DESCR%' OR COLUMN_NAME LIKE '%REDUZ%')
           ORDER BY COLUMN_ID`,
          { o: m.OWNER, t: m.TABLE_NAME },
        );
        console.log(`  · ${m.OWNER}.${m.TABLE_NAME} (~${m.NUM_ROWS}) colunas:`);
        console.log(tabela(cols as Array<Record<string, unknown>>));
        const amostra = await executar(conn, `SELECT * FROM ${m.OWNER}.${m.TABLE_NAME} FETCH FIRST 4 ROWS ONLY`);
        console.log(tabela(amostra as Array<Record<string, unknown>>));
      }
    });
    // 5) TESTA a expressao LISTAGG RATEIO_CONTAS (a que vai pro sync) nos docs 8918.
    await secao('5) LISTAGG RATEIO_CONTAS (string que o ETL vai parsear)', async () => {
      const rows = await executar(
        conn,
        `SELECT D.CODDOCTOCPG,
                (SELECT LISTAGG(GC.CLASSIFICADOR || '|' || NVL(GC.NOMECONTA, '') || '|' || TO_CHAR(ROUND(GC.VALOR * 100)), ';')
                        WITHIN GROUP (ORDER BY GC.VALOR DESC)
                 FROM (
                   SELECT NVL(CCB.CLASSIFICADOR, TO_CHAR(IC.CODCONTACTB)) AS CLASSIFICADOR,
                          MAX(CCB.NOMECONTA) AS NOMECONTA,
                          SUM(IC.VALORITEMDOC) AS VALOR
                   FROM CPGITDOC IC
                   LEFT JOIN CTBCONTA CCB ON CCB.CODCONTACTB = IC.CODCONTACTB AND CCB.NROPLANO = IC.NROPLANO
                   WHERE IC.CODDOCTOCPG = D.CODDOCTOCPG AND IC.CODCONTACTB IS NOT NULL
                   GROUP BY NVL(CCB.CLASSIFICADOR, TO_CHAR(IC.CODCONTACTB))
                 ) GC) AS RATEIO_CONTAS
         FROM CPGDOCTO D
         WHERE D.CODIGOEMPRESA = 4 AND REGEXP_REPLACE(D.NRODOCTOCPG, '^0+', '') = :doc
         ORDER BY D.CODDOCTOCPG`,
        { doc: DOC },
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
