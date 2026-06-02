import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enriquecimento do Contas a Pagar (cabecalho) — SFN:
 *  - Banco que PAGOU: resolvido no Globus via BCOMOVTO (link CPGDOCTO.CODMOVTOBCO),
 *    com fallback no proprio CPGDOCTO.CODBANCO. Nome via BCOBANCO.NOMEBANCO.
 *  - Borderô / nº do documento bancario: BCOMOVTO.DOCMOVTOBCO (ex.: "BO-010260").
 *  - Favorecido "real": FAVORECIDODOCTOCPG (texto livre, pode diferir do fornecedor
 *    cadastrado) + inscricao do favorecido (NRINSCR_FAV / TPINSCR_FAV).
 *
 * Colunas ficam NULL ate o proximo sync com Oracle ligado popular os dados — em
 * Docker o Globus fica desligado (ORACLE_ENABLED=false). Nada de backfill aqui: os
 * campos novos nao existem no raw_payload ja sincronizado.
 */
export class CpBancoBorderoFavorecido1700000033000 implements MigrationInterface {
  name = 'CpBancoBorderoFavorecido1700000033000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        ADD COLUMN IF NOT EXISTS favorecido_nome           VARCHAR(200),
        ADD COLUMN IF NOT EXISTS favorecido_inscricao      VARCHAR(20),
        ADD COLUMN IF NOT EXISTS favorecido_tipo_inscricao VARCHAR(5),
        ADD COLUMN IF NOT EXISTS banco_pagador_codigo      INT,
        ADD COLUMN IF NOT EXISTS banco_pagador_nome        VARCHAR(60),
        ADD COLUMN IF NOT EXISTS banco_pagador_agencia     VARCHAR(10),
        ADD COLUMN IF NOT EXISTS banco_pagador_conta       VARCHAR(20),
        ADD COLUMN IF NOT EXISTS cod_movto_bco             BIGINT,
        ADD COLUMN IF NOT EXISTS pagamento_doc             VARCHAR(30)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE finance.contas_pagar
        DROP COLUMN IF EXISTS favorecido_nome,
        DROP COLUMN IF EXISTS favorecido_inscricao,
        DROP COLUMN IF EXISTS favorecido_tipo_inscricao,
        DROP COLUMN IF EXISTS banco_pagador_codigo,
        DROP COLUMN IF EXISTS banco_pagador_nome,
        DROP COLUMN IF EXISTS banco_pagador_agencia,
        DROP COLUMN IF EXISTS banco_pagador_conta,
        DROP COLUMN IF EXISTS cod_movto_bco,
        DROP COLUMN IF EXISTS pagamento_doc
    `);
  }
}
