/**
 * Roda o ETL FLP standalone (sem precisar re-sincronizar do Oracle).
 * Útil quando o stage está populado mas o canonical está vazio.
 */
import 'reflect-metadata';
import Fastify from 'fastify';
import { configPlugin } from '@/plugins/config.js';
import { dbPlugin } from '@/plugins/db.js';
import { buildFolhaFlpEtl } from '@/etl/folha-flp.etl.js';

async function main(): Promise<void> {
  const app = Fastify({ logger: { level: 'info' } });
  await app.register(configPlugin);
  await app.register(dbPlugin);

  console.log('▶ Rodando ETL FLP…');
  const etl = buildFolhaFlpEtl(app);
  const inicio = Date.now();
  const resultado = await etl.processar();
  console.log(`\n✅ ETL concluído em ${((Date.now() - inicio) / 1000).toFixed(1)}s`);
  console.log(`   Funcionários canonical : ${resultado.funcionariosProcessados.toLocaleString('pt-BR')}`);
  console.log(`   Eventos canonical      : ${resultado.eventosProcessados.toLocaleString('pt-BR')}`);
  console.log(`   Fichas canonical       : ${resultado.fichasProcessadas.toLocaleString('pt-BR')}`);

  await app.close();
}
main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
