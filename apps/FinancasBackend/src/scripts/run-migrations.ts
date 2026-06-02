import 'reflect-metadata';
import { AppDataSource } from '@/data-source.js';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const aplicadas = await AppDataSource.runMigrations({ transaction: 'all' });
  if (aplicadas.length === 0) {
    console.log('Nenhuma migration pendente.');
  } else {
    console.log(`Aplicadas ${aplicadas.length} migrations:`);
    aplicadas.forEach((m) => console.log(`  - ${m.name}`));
  }
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
