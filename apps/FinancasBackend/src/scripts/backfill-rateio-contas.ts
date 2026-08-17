/**
 * Backfill pontual de `finance.contas_pagar.rateio_contas` (quebra por CONTA CONTABIL).
 *
 * Le do Globus (Oracle) o LISTAGG RATEIO_CONTAS por documento (mesma expressao do sync)
 * e grava direto no Postgres, SEM precisar de um re-sync completo. Util pra ver a feature
 * de imediato na janela atual; o sync normal passa a popular dai pra frente.
 *
 * Read no Oracle (bloqueia DML) + UPDATE escopado no Postgres (so a coluna rateio_contas).
 *
 * Uso: pnpm --filter @pioneira/financas-backend exec tsx src/scripts/backfill-rateio-contas.ts [dtIni] [dtFimExcl]
 *   ex: ... backfill-rateio-contas.ts 2026-06-01 2026-07-01   (default: mes 06/2026)
 */

import 'reflect-metadata';
import oracledb from 'oracledb';
// `pg` nao tem tipos empacotados e @types/pg nao esta instalado; este e um script
// utilitario one-off (como os explorar-*), entao suprimimos o erro de tipo do import.
// @ts-expect-error - modulo 'pg' sem declaracao de tipos
import { Client } from 'pg';
import { loadEnvironment } from '@/config/environment.js';

const DT_INI = process.argv[2] ?? '2026-06-01';
const DT_FIM_EXCL = process.argv[3] ?? '2026-07-01';

function parseRateioContas(s: string | null): Array<{ classificador: string; nome: string | null; valorCents: number }> {
  if (!s) return [];
  return s
    .split(';')
    .map((parte) => {
      const [classificador, nome, cents] = parte.split('|');
      return {
        classificador: (classificador ?? '').trim(),
        nome: nome?.trim() || null,
        valorCents: Math.round(Number(cents ?? 0)) || 0,
      };
    })
    .filter((r) => r.classificador.length > 0);
}

const RATEIO_CONTAS_SQL = `
  SELECT D.CODDOCTOCPG AS COD,
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
  WHERE D.CODIGOEMPRESA = 4
    AND D.VENCIMENTOCPG >= TO_DATE(:dt_ini, 'YYYY-MM-DD')
    AND D.VENCIMENTOCPG <  TO_DATE(:dt_fim, 'YYYY-MM-DD')
`;

async function main(): Promise<void> {
  const env = loadEnvironment();
  if (!env.oracle.enabled) {
    console.error('ORACLE_ENABLED=false — abortando.');
    process.exit(1);
  }

  console.log(`▶ Janela: vencimento [${DT_INI}, ${DT_FIM_EXCL})`);
  console.log(`▶ Oracle ${env.oracle.host}:${env.oracle.port}/${env.oracle.serviceName} (Thick)…`);
  try {
    oracledb.initOracleClient({ libDir: env.oracle.clientPath || undefined });
  } catch (err) {
    if (!/NJS-/.test((err as Error).message ?? '')) throw err;
  }
  const ora = await oracledb.getConnection({
    user: env.oracle.user,
    password: env.oracle.password,
    connectString: `//${env.oracle.host}:${env.oracle.port}/${env.oracle.serviceName}`,
  });

  const pg = new Client({
    host: process.env.DATABASE_HOST ?? '127.0.0.1',
    port: Number(process.env.DATABASE_PORT ?? 5435),
    user: process.env.DATABASE_USER ?? 'pioneira',
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME ?? 'pioneira_finance_db',
  });
  await pg.connect();
  console.log('✓ Conectado (Oracle + Postgres).');

  try {
    const r = await ora.execute<{ COD: number; RATEIO_CONTAS: string | null }>(
      RATEIO_CONTAS_SQL,
      { dt_ini: DT_INI, dt_fim: DT_FIM_EXCL },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const linhas = r.rows ?? [];
    console.log(`▶ ${linhas.length} documentos lidos do Globus.`);

    let atualizados = 0;
    let comQuebra = 0;
    for (const l of linhas) {
      const contas = parseRateioContas(l.RATEIO_CONTAS);
      if (contas.length === 0) continue;
      if (contas.length > 1) comQuebra += 1;
      const res = await pg.query(
        `UPDATE finance.contas_pagar
            SET rateio_contas = $1::jsonb
          WHERE origem_sistema = 'globus' AND origem_id_externo = $2`,
        [JSON.stringify(contas), String(l.COD)],
      );
      atualizados += res.rowCount ?? 0;
    }
    console.log(`✓ ${atualizados} titulos atualizados (${comQuebra} com 2+ contas — esses mostram a quebra na UI).`);
  } finally {
    await ora.close();
    await pg.end();
    console.log('✓ Conexões fechadas.');
  }
}

main().catch((err) => {
  console.error('FALHA:', err);
  process.exit(1);
});
