import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reclassifica eventos de folha TIPOEVEN 'A' (referências/benefícios) e 'C'
 * (informativos) que o ETL antigo normalizava pra 'P', inflando os proventos
 * (700 SALÁRIO BASE dobrava o salário, 900 TICKET contava como renda, 15511
 * DESC SIMPL aparecia em proventos). Passam a 'B' (informativo/base), fora dos
 * totais de proventos/descontos. Lê o TIPOEVEN REAL do stage do Globus.
 *
 * Idempotente. Conserta contracheque, totais por setor, custo c/ encargos e a
 * folha do Fluxo de Caixa de uma vez, sem re-sincronizar o Oracle.
 */
export class FolhaReclassificaEventosAc1700000044000 implements MigrationInterface {
  name = 'FolhaReclassificaEventosAc1700000044000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE finance.eventos_folha ef
         SET tipo = 'B', atualizado_em = NOW()
        FROM integration.globus_flp_evento_stage s
       WHERE s.cod_evento = ef.cod_evento
         AND UPPER(TRIM(s.raw_payload->>'TIPO')) IN ('A', 'C')
         AND ef.tipo <> 'B'
    `);
  }

  public async down(): Promise<void> {
    // Sem revert: a classificação 'A'/'C' → 'B' é a correta; voltar pra 'P'
    // reintroduziria o bug de inflar proventos. Um re-sync do ETL corrigido
    // manteria 'B' de qualquer forma.
  }
}
