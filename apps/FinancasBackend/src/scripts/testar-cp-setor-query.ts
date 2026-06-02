/**
 * Teste read-only da query contasAPagar modificada — confere se COD_SETOR /
 * SETOR_NOME / QTD_SETORES populam a partir de CPGITDOC.CODCUSTOFIN + CPGCUSTOS.
 *
 * Uso: pnpm --filter @pioneira/financas-backend exec tsx src/scripts/testar-cp-setor-query.ts
 */
import 'reflect-metadata';
import oracledb from 'oracledb';
import { loadEnvironment } from '@/config/environment.js';
import { GLOBUS_QUERIES } from '@/integrations/globus/globus.queries.js';

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
  console.log('✓ Conectado. Rodando contasAPagar (vencimento 01–07/05/2026)…');

  const r = await c.execute<Record<string, unknown>>(
    GLOBUS_QUERIES.contasAPagar,
    { empresa: 4, dt_ini: new Date('2026-05-01'), dt_fim_excl: new Date('2026-05-08') },
    { outFormat: oracledb.OUT_FORMAT_OBJECT, autoCommit: false },
  );
  const rows = r.rows ?? [];
  console.log(`linhas: ${rows.length}`);

  // Quebra: quantos com setor preenchido, quantos rateados.
  const comSetor = rows.filter((x) => x.COD_SETOR != null).length;
  const rateados = rows.filter((x) => Number(x.QTD_SETORES ?? 0) > 1).length;
  console.log(`com setor: ${comSetor}/${rows.length} · rateados (QTD_SETORES>1): ${rateados}`);

  console.log('\nAmostra (10 primeiras):');
  for (const x of rows.slice(0, 10)) {
    console.log(
      `  doc=${String(x.NUMERO_DOCUMENTO ?? '').padEnd(12)} forn=${String(x.FAVORECIDO ?? '').slice(0, 28).padEnd(28)} ` +
        `COD_SETOR=${String(x.COD_SETOR ?? '-').padEnd(7)} QTD=${String(x.QTD_SETORES ?? 0)} SETOR_NOME=${x.SETOR_NOME ?? '-'}`,
    );
  }

  // Distribuicao por setor.
  const porSetor = new Map<string, number>();
  for (const x of rows) {
    const k = `${x.COD_SETOR ?? '(sem)'} ${x.SETOR_NOME ?? ''}`.trim();
    porSetor.set(k, (porSetor.get(k) ?? 0) + 1);
  }
  console.log('\nDistribuicao por setor:');
  for (const [k, v] of [...porSetor.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(5)}  ${k}`);

  await c.close();
  console.log('\n✓ Conexão fechada.');
}

main().catch((e) => {
  console.error('FALHA:', e);
  process.exit(1);
});
