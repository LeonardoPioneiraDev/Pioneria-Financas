import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `efeito_saldo_cents` — o valor do movimento COM SINAL (efeito no saldo da
 * conta): positivo = entrou, negativo = saiu.
 *
 * O ETL grava `valor_cents` em módulo (abs) e o sentido em `debito_credito`,
 * mas 541 movimentos vêm sem D/C — e o extrato/saldo precisava inferir a
 * direção por heurística de histórico. O Globus, porém, traz o VLMOVTOBCO JÁ
 * COM SINAL (débito negativo, crédito positivo, inclusive nas transferências).
 * Esta coluna preserva esse sinal, e o saldo acumulado vira uma soma simples.
 *
 * Backfill: do stage (raw VALOR) quando existe; senão, do módulo × sinal do D/C.
 */
export class BancoMovtoEfeitoSaldo1700000064000 implements MigrationInterface {
  name = 'BancoMovtoEfeitoSaldo1700000064000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE finance.banco_movto ADD COLUMN IF NOT EXISTS efeito_saldo_cents bigint`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN finance.banco_movto.efeito_saldo_cents IS
       'Valor com sinal (VLMOVTOBCO): + entrou, − saiu. Base do saldo acumulado. NULL = sem sinal conhecido.'`,
    );

    // 1) Do stage bruto (fonte com sinal). Chave: cod_movto_bco + empresa.
    await queryRunner.query(`
      UPDATE finance.banco_movto m
      SET    efeito_saldo_cents = ROUND((s.raw_payload->>'VALOR')::numeric * 100)
      FROM   integration.globus_bcomovto_stage s
      WHERE  s.cod_movto_bco = m.cod_movto_bco
        AND  s.codigo_empresa = m.empresa_id
        AND  s.raw_payload->>'VALOR' IS NOT NULL
        AND  m.efeito_saldo_cents IS DISTINCT FROM ROUND((s.raw_payload->>'VALOR')::numeric * 100)
    `);

    // 2) Fallback pelo D/C, onde não há stage mas há sentido.
    await queryRunner.query(`
      UPDATE finance.banco_movto
      SET    efeito_saldo_cents = CASE debito_credito
                                    WHEN 'C' THEN valor_cents
                                    WHEN 'D' THEN -valor_cents
                                  END
      WHERE  efeito_saldo_cents IS NULL
        AND  debito_credito IN ('C', 'D')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE finance.banco_movto DROP COLUMN IF EXISTS efeito_saldo_cents`);
  }
}
