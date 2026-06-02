/**
 * Reproduz o INSERT do ETL de funcionários para descobrir o erro real.
 * Pega 1 funcionário do stage e tenta inserir no canonical.
 */
import 'reflect-metadata';
import { AppDataSource } from '@/data-source.js';

async function main(): Promise<void> {
  await AppDataSource.initialize();

  // Pega o primeiro stage não processado
  const [stage] = await AppDataSource.query<Array<{ id: string; raw_payload: Record<string, unknown> }>>(
    `SELECT id, raw_payload FROM integration.globus_flp_func_stage
     WHERE processado_em IS NULL ORDER BY recebido_em LIMIT 1`,
  );

  if (!stage) {
    console.log('Nada pendente.');
    await AppDataSource.destroy();
    return;
  }

  const raw = stage.raw_payload as Record<string, unknown>;
  console.log('Stage pendente exemplo (campos não-nulos):');
  for (const [k, v] of Object.entries(raw).filter(([, v]) => v !== null)) {
    console.log(`  ${k.padEnd(28)} = ${JSON.stringify(v).slice(0, 80)} [${typeof v}]`);
  }

  const valores = [
    raw.CODIGO_EMPRESA,
    String(raw.COD_INT_FUNC),
    String(raw.COD_FUNC),
    String(raw.NOME ?? '').trim() || `Funcionário ${raw.COD_FUNC}`,
    raw.COD_AREA != null ? String(raw.COD_AREA) : null,
    typeof raw.DESC_AREA === 'string' ? raw.DESC_AREA.trim() || null : null,
    raw.COD_DEPTO != null ? String(raw.COD_DEPTO) : null,
    typeof raw.DESC_FUNCAO === 'string' ? raw.DESC_FUNCAO.trim() || null : null,
    typeof raw.COD_AGENCIA === 'string' ? raw.COD_AGENCIA.trim() || null : null,
    typeof raw.CONTA_CORRENTE === 'string' ? raw.CONTA_CORRENTE.trim() || null : null,
  ];

  console.log('\nValores para o INSERT:');
  valores.forEach((v, i) => console.log(`  $${i + 1} = ${JSON.stringify(v)} (len=${v != null ? String(v).length : 'NULL'})`));

  console.log('\n🔍 Tentando INSERT…');
  try {
    await AppDataSource.query(
      `INSERT INTO finance.funcionarios
         (empresa_id, origem_sistema, cod_int_func, cod_func, nome,
          cod_area, desc_area, cod_depto, desc_funcao,
          agencia, conta_corrente, ativo, ultimo_sync_em)
       VALUES ($1, 'globus', $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW())
       ON CONFLICT (origem_sistema, cod_int_func)
       DO UPDATE SET cod_func = EXCLUDED.cod_func,
                     nome = EXCLUDED.nome,
                     ultimo_sync_em = NOW()`,
      valores,
    );
    console.log('✅ INSERT funcionou!');
  } catch (err) {
    const e = err as Error & { code?: string; detail?: string; column?: string; constraint?: string; length?: number; routine?: string };
    console.log('\n❌ INSERT FALHOU:');
    console.log('  Mensagem:', e.message);
    console.log('  Código  :', e.code);
    console.log('  Detalhe :', e.detail);
    console.log('  Coluna  :', e.column);
    console.log('  Restr.  :', e.constraint);
    console.log('  Routine :', e.routine);
  }

  await AppDataSource.destroy();
}
main().catch((e) => { console.error('FALHA:', e); process.exit(1); });
