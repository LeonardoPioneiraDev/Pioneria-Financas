import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pagamento devolvido pelo banco / retentativa no Contas a Pagar (follow-up SFN-48).
 *
 * Constatado com o financeiro (reuniao 12/06/2026) e confirmado nos dados do Globus:
 * o banco ACEITA o arquivo eletronico (CPGDOCTO.STATUSPE='PG', PAGAMENTOCPG preenchida)
 * e o Globus ja mostra como "pago" — mas se o banco NAO LIQUIDA, o dinheiro volta
 * (credito "DOC DEVOLVIDO" no BCOMOVTO, CODHISTOBCO=10) e o titulo e refeito por
 * borderô. O titulo devolvido fica com QUITADODOCTOCPG='N'.
 *
 *  - `quitado_globus`: QUITADO REAL do Globus, SEM o override de data_pagamento que o
 *    ETL aplica em `quitado`. Permite distinguir pago de verdade (S) de tentativa
 *    devolvida (N + data + STATUSPE='PG'). Fica `false` ate o proximo sync popular —
 *    em Docker o Globus fica desligado (ORACLE_ENABLED=false), sem backfill possivel
 *    (o QUITADO real nao existe no raw_payload ja sincronizado).
 *
 * Indice parcial em banco_movto pros creditos de devolucao (DOC DEVOLVIDO / CHEQUE
 * DEVOLVIDO) — deixa barato o EXISTS que casa a devolucao com o titulo pago.
 */
export class CpDevolucaoBancaria1700000035000 implements MigrationInterface {
  name = 'CpDevolucaoBancaria1700000035000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        ADD COLUMN IF NOT EXISTS quitado_globus BOOLEAN NOT NULL DEFAULT false
    `);
    // Creditos de devolucao de pagamento (CODHISTOBCO 10=DOC DEVOLVIDO, 541=CHEQUE
    // DEVOLVIDO). O detector casa esses creditos com o titulo pago por conta+valor+data.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS banco_movto_devolucao_idx
        ON finance.banco_movto (cod_banco, cod_conta_bco, valor_cents, data_movto)
        WHERE debito_credito = 'C' AND cod_histo_bco IN (10, 541)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS finance.banco_movto_devolucao_idx`);
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        DROP COLUMN IF EXISTS quitado_globus
    `);
  }
}
