/**
 * Script de DESCOBERTA read-only no Globus (Oracle/Praxio).
 *
 * Objetivo: localizar a fonte de SETOR / CENTRO DE CUSTO dos titulos do Contas
 * a Pagar. Hipotese: o centro de custo mora no ITEM (CPGITDOC.CODCUSTO), nao no
 * cabecalho (CPGDOCTO.CODSETOR, que esta vazio em 100% dos CPs da Pioneira).
 *
 * Responde:
 *   1) Quais colunas de custo/conta/setor existem em CPGITDOC?
 *   2) CODCUSTO (e alternativas) esta preenchido pra empresa 4?
 *   3) Quais os valores distintos + tabela-mestre com a descricao?
 *   4) Com que frequencia 1 titulo tem itens com centros de custo DIFERENTES (rateio)?
 *
 * NAO escreve nada — bloqueia DML por regex. Apenas SELECT.
 *
 * Uso: pnpm --filter @pioneira/financas-backend exec tsx src/scripts/explorar-globus-cp-custo.ts
 */

import 'reflect-metadata';
import oracledb from 'oracledb';
import { loadEnvironment } from '@/config/environment.js';

// Janela recente pra escopar as contagens (evita varrer anos de CPGITDOC).
const DT_INI = '2026-01-01';

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
    // 1) Colunas de CPGITDOC relacionadas a custo/conta/setor/area.
    const colsCpgitdoc = await secao('1) CPGITDOC — colunas de custo/conta/setor', async () => {
      const cols = await executar<{ OWNER: string; COLUMN_NAME: string; DATA_TYPE: string; DATA_LENGTH: number; NULLABLE: string }>(
        conn,
        `SELECT OWNER, COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE
         FROM ALL_TAB_COLUMNS
         WHERE TABLE_NAME = 'CPGITDOC'
           AND (COLUMN_NAME LIKE '%CUSTO%' OR COLUMN_NAME LIKE '%CONTA%'
             OR COLUMN_NAME LIKE '%SETOR%' OR COLUMN_NAME LIKE '%AREA%'
             OR COLUMN_NAME LIKE '%DEPTO%' OR COLUMN_NAME LIKE '%CCUSTO%')
         ORDER BY OWNER, COLUMN_ID`,
      );
      console.log(tabela(cols));
      return cols;
    });

    const colunasExistentes = new Set((colsCpgitdoc ?? []).map((c) => c.COLUMN_NAME));
    const candidatas = ['CODCUSTO', 'CODCUSTOFIN', 'CODCONTACTB', 'CODCONTACONTABIL', 'CODSETOR'].filter((c) =>
      colunasExistentes.has(c),
    );

    // 2) Taxa de preenchimento das colunas candidatas (empresa 4, janela recente).
    await secao(`2) Preenchimento em CPGITDOC (empresa 4, vencimento >= ${DT_INI})`, async () => {
      if (candidatas.length === 0) {
        console.log('  (nenhuma coluna candidata encontrada em CPGITDOC)');
        return;
      }
      const selects = candidatas.map((c) => `COUNT(I.${c}) AS COM_${c}`).join(',\n        ');
      const rows = await executar(
        conn,
        `SELECT /*+ NO_PARALLEL */
          COUNT(*) AS TOTAL_ITENS,
          ${selects}
        FROM CPGITDOC I
        JOIN CPGDOCTO D ON D.CODDOCTOCPG = I.CODDOCTOCPG
        WHERE D.CODIGOEMPRESA = 4
          AND D.VENCIMENTOCPG >= DATE '${DT_INI}'`,
      );
      console.log(tabela(rows));
    });

    // 3) Valores distintos de CODCUSTO mais frequentes.
    if (colunasExistentes.has('CODCUSTO')) {
      await secao('3) Top CODCUSTO em uso (empresa 4, janela recente)', async () => {
        const rows = await executar(
          conn,
          `SELECT /*+ NO_PARALLEL */ I.CODCUSTO, COUNT(*) AS QTD_ITENS, COUNT(DISTINCT I.CODDOCTOCPG) AS QTD_TITULOS
           FROM CPGITDOC I
           JOIN CPGDOCTO D ON D.CODDOCTOCPG = I.CODDOCTOCPG
           WHERE D.CODIGOEMPRESA = 4
             AND D.VENCIMENTOCPG >= DATE '${DT_INI}'
             AND I.CODCUSTO IS NOT NULL
           GROUP BY I.CODCUSTO
           ORDER BY QTD_ITENS DESC
           FETCH FIRST 30 ROWS ONLY`,
        );
        console.log(tabela(rows));
      });
    }

    // 4) Tabela-mestre de centro de custo.
    const mestres = await secao('4) Tabelas-mestre candidatas (centro de custo)', async () => {
      const rows = await executar<{ OWNER: string; TABLE_NAME: string; NUM_ROWS: number | null }>(
        conn,
        `SELECT OWNER, TABLE_NAME, NUM_ROWS
         FROM ALL_TABLES
         WHERE (TABLE_NAME LIKE '%CCUSTO%' OR TABLE_NAME LIKE '%CENTROCUSTO%'
             OR TABLE_NAME LIKE '%CENTRO_CUSTO%' OR TABLE_NAME LIKE 'CTB%CUSTO%'
             OR TABLE_NAME = 'CPGCUSTO' OR TABLE_NAME LIKE 'FIN%CUSTO%'
             OR TABLE_NAME LIKE '%CADCUSTO%')
         ORDER BY NUM_ROWS DESC NULLS LAST
         FETCH FIRST 40 ROWS ONLY`,
      );
      console.log(tabela(rows));
      return rows;
    });

    // 4b) Pra cada mestre pequeno (<= 5000 linhas, provavel cadastro), colunas + amostra.
    for (const m of (mestres ?? []).filter((t) => (t.NUM_ROWS ?? 0) > 0 && (t.NUM_ROWS ?? 0) <= 5000).slice(0, 4)) {
      await secao(`4b) ${m.OWNER}.${m.TABLE_NAME} (~${m.NUM_ROWS} linhas) — colunas`, async () => {
        const cols = await executar<{ COLUMN_NAME: string; DATA_TYPE: string }>(
          conn,
          `SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS
           WHERE OWNER = :o AND TABLE_NAME = :t ORDER BY COLUMN_ID`,
          { o: m.OWNER, t: m.TABLE_NAME },
        );
        console.log(tabela(cols.slice(0, 25)));
        const amostra = await executar(conn, `SELECT * FROM ${m.OWNER}.${m.TABLE_NAME} FETCH FIRST 5 ROWS ONLY`);
        console.log('  · amostra:');
        console.log(tabela(amostra as Array<Record<string, unknown>>));
      });
    }

    // 5) Frequencia de rateio: quantos titulos tem 1 / 2 / 3+ centros de custo distintos.
    if (colunasExistentes.has('CODCUSTO')) {
      await secao('5) Rateio — distribuicao de centros de custo distintos por titulo', async () => {
        const rows = await executar(
          conn,
          `SELECT /*+ NO_PARALLEL */ QTD_CUSTOS, COUNT(*) AS QTD_TITULOS
           FROM (
             SELECT I.CODDOCTOCPG, COUNT(DISTINCT I.CODCUSTO) AS QTD_CUSTOS
             FROM CPGITDOC I
             JOIN CPGDOCTO D ON D.CODDOCTOCPG = I.CODDOCTOCPG
             WHERE D.CODIGOEMPRESA = 4
               AND D.VENCIMENTOCPG >= DATE '${DT_INI}'
               AND I.CODCUSTO IS NOT NULL
             GROUP BY I.CODDOCTOCPG
           )
           GROUP BY QTD_CUSTOS
           ORDER BY QTD_CUSTOS`,
        );
        console.log(tabela(rows));
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
