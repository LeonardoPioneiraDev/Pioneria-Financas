/**
 * Diagnóstico do FLP da Pioneira no Oracle (read-only).
 *
 * Responde: existe folha pra Maio/2026 ou folha de Abril paga em Maio?
 *           Volumetria real, range de COMPETFICHA, distribuição por TIPOFOLHA.
 */
import 'reflect-metadata';
import oracledb from 'oracledb';
import { loadEnvironment } from '@/config/environment.js';

function assertReadOnly(sql: string): void {
  if (/^(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE)\b/i.test(sql.trimStart())) {
    throw new Error('SQL bloqueada');
  }
}
async function q<T = Record<string, unknown>>(c: oracledb.Connection, sql: string, b: oracledb.BindParameters = {}): Promise<T[]> {
  assertReadOnly(sql);
  return (await c.execute<T>(sql, b, { outFormat: oracledb.OUT_FORMAT_OBJECT })).rows ?? [];
}
function fmt(rs: Array<Record<string, unknown>>): string {
  if (!rs.length) return '  (vazio)';
  const cs = Object.keys(rs[0]!);
  const ws = cs.map((col) => Math.min(70, Math.max(col.length, ...rs.map((r) => String(r[col] ?? '').length))));
  const line = (vs: string[]): string => '  ' + vs.map((v, i) => v.padEnd(ws[i]!).slice(0, ws[i]!)).join(' | ');
  return [line(cs), '  ' + ws.map((w) => '-'.repeat(w)).join('-+-'), ...rs.map((r) => line(cs.map((col) => String(r[col] ?? ''))))].join('\n');
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
    // ============ 1) Quais competências existem para Pioneira (empresa=4)? ============
    console.log('━━━ 1) Distribuição de FLP_FICHAEVENTOS para Pioneira (empresa=4) — últimos 24 meses ━━━');
    const competencias = await q(c, `
      SELECT TO_CHAR(L.COMPETFICHA, 'YYYY-MM-DD') COMPETENCIA,
             L.TIPOFOLHA,
             COUNT(*) QTD_LANCAMENTOS,
             COUNT(DISTINCT L.CODINTFUNC) QTD_FUNC,
             ROUND(SUM(L.VALORFICHA), 2) TOTAL_R$
      FROM   GLOBUS.FLP_FICHAEVENTOS L
      JOIN   GLOBUS.VW_FUNCIONARIOS F ON F.CODINTFUNC = L.CODINTFUNC
      WHERE  F.CODIGOEMPRESA = 4
        AND  L.COMPETFICHA >= ADD_MONTHS(SYSDATE, -24)
      GROUP  BY L.COMPETFICHA, L.TIPOFOLHA
      ORDER  BY 1 DESC, 2`);
    console.log(fmt(competencias));

    // ============ 2) Volumetria das tabelas FLP ============
    console.log('\n━━━ 2) Volumetria total das tabelas FLP (toda a base) ━━━');
    const vol = await q(c, `
      SELECT 'VW_FUNCIONARIOS (empresa=4)' AS TABELA, COUNT(*) AS LINHAS
      FROM GLOBUS.VW_FUNCIONARIOS WHERE CODIGOEMPRESA = 4
      UNION ALL
      SELECT 'FLP_EVENTOS (catálogo)', COUNT(*) FROM GLOBUS.FLP_EVENTOS
      UNION ALL
      SELECT 'FLP_FICHAEVENTOS (Pioneira, todas competências)', COUNT(*)
      FROM GLOBUS.FLP_FICHAEVENTOS L JOIN GLOBUS.VW_FUNCIONARIOS F ON F.CODINTFUNC = L.CODINTFUNC
      WHERE F.CODIGOEMPRESA = 4`);
    console.log(fmt(vol));

    // ============ 3) Volume estimado para a Maio (range Pioneira esperado) ============
    console.log('\n━━━ 3) Volume estimado da Folha Maio/2026 — range [2026-04-30, 2026-06-01) ━━━');
    const maio = await q(c, `
      SELECT L.TIPOFOLHA,
             COUNT(*) QTD,
             COUNT(DISTINCT L.CODINTFUNC) QTD_FUNC
      FROM   GLOBUS.FLP_FICHAEVENTOS L
      JOIN   GLOBUS.VW_FUNCIONARIOS F ON F.CODINTFUNC = L.CODINTFUNC
      WHERE  F.CODIGOEMPRESA = 4
        AND  L.COMPETFICHA >= DATE '2026-04-30'
        AND  L.COMPETFICHA <  DATE '2026-06-01'
      GROUP  BY L.TIPOFOLHA
      ORDER  BY L.TIPOFOLHA`);
    console.log(fmt(maio));

    // ============ 4) Inclui filtro CODIGOFL = 1 (que a query usa) ============
    console.log('\n━━━ 4) MESMO range, mas filtrando CODIGOFL = 1 (filial principal) ━━━');
    const maioComFilial = await q(c, `
      SELECT L.TIPOFOLHA,
             COUNT(*) QTD,
             COUNT(DISTINCT L.CODINTFUNC) QTD_FUNC
      FROM   GLOBUS.FLP_FICHAEVENTOS L
      JOIN   GLOBUS.VW_FUNCIONARIOS F ON F.CODINTFUNC = L.CODINTFUNC
      WHERE  F.CODIGOEMPRESA = 4
        AND  F.CODIGOFL = 1
        AND  L.COMPETFICHA >= DATE '2026-04-30'
        AND  L.COMPETFICHA <  DATE '2026-06-01'
      GROUP  BY L.TIPOFOLHA
      ORDER  BY L.TIPOFOLHA`);
    console.log(fmt(maioComFilial));

    // ============ 5) Verificar CODIGOFL distinct para Pioneira ============
    console.log('\n━━━ 5) Quais CODIGOFL Pioneira usa? ━━━');
    const filiais = await q(c, `
      SELECT CODIGOFL, COUNT(*) QTD
      FROM   GLOBUS.VW_FUNCIONARIOS
      WHERE  CODIGOEMPRESA = 4
      GROUP  BY CODIGOFL
      ORDER  BY 1`);
    console.log(fmt(filiais));

    // ============ 6) Última competência REAL Pioneira (qualquer mês) ============
    console.log('\n━━━ 6) ÚLTIMA competência Pioneira (qualquer mês, qualquer filial) ━━━');
    const ultima = await q(c, `
      SELECT TO_CHAR(MAX(L.COMPETFICHA), 'YYYY-MM-DD') ULTIMA_COMPETENCIA,
             COUNT(*) QTD_LANC_NESSA_COMP
      FROM   GLOBUS.FLP_FICHAEVENTOS L
      JOIN   GLOBUS.VW_FUNCIONARIOS F ON F.CODINTFUNC = L.CODINTFUNC
      WHERE  F.CODIGOEMPRESA = 4
        AND  L.COMPETFICHA = (
              SELECT MAX(L2.COMPETFICHA)
              FROM   GLOBUS.FLP_FICHAEVENTOS L2
              JOIN   GLOBUS.VW_FUNCIONARIOS F2 ON F2.CODINTFUNC = L2.CODINTFUNC
              WHERE  F2.CODIGOEMPRESA = 4)`);
    console.log(fmt(ultima));
  } finally {
    await c.close();
    console.log('\n✓ Conexão fechada.');
  }
}
main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
