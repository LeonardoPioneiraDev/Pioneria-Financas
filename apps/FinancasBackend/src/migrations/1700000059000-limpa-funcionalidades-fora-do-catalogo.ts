import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Remove das trilhas as chaves que não existem no catálogo de funcionalidades
 * (ex.: '/dashboard', que é sempre visível e não se valida). Elas viravam passo
 * fantasma: contavam no total da trilha, mas nunca podiam ser validadas.
 *
 * A partir de agora o backend recusa chave fora do catálogo (users.service).
 */
const CHAVES = [
  '/contas-pagar', '/contas-receber', '/recebiveis-gdf', '/conciliacao',
  '/folha', '/folha-detalhe', '/tributos', '/depreciacao',
  '/fluxo-caixa', '/orcamento', '/dre', '/painel-cfo',
];

export class LimpaFuncionalidadesForaDoCatalogo1700000059000 implements MigrationInterface {
  name = 'LimpaFuncionalidadesForaDoCatalogo1700000059000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const lista = CHAVES.map((c) => `'${c}'`).join(', ');
    await queryRunner.query(`
      UPDATE identity.usuarios
      SET funcionalidades_atribuidas = COALESCE((
            SELECT array_agg(c ORDER BY idx)
            FROM unnest(funcionalidades_atribuidas) WITH ORDINALITY AS t(c, idx)
            WHERE c IN (${lista})
          ), '{}'),
          funcionalidades_validadas = COALESCE((
            SELECT array_agg(c ORDER BY idx)
            FROM unnest(funcionalidades_validadas) WITH ORDINALITY AS t(c, idx)
            WHERE c IN (${lista})
          ), '{}'),
          progresso_funcionalidades = COALESCE((
            SELECT jsonb_object_agg(key, value)
            FROM jsonb_each(progresso_funcionalidades)
            WHERE key IN (${lista})
          ), '{}'::jsonb)
      WHERE EXISTS (
        SELECT 1 FROM unnest(funcionalidades_atribuidas) AS c WHERE c NOT IN (${lista})
      )
    `);
  }

  public async down(): Promise<void> {
    // Sem volta: as chaves removidas eram inválidas.
  }
}
