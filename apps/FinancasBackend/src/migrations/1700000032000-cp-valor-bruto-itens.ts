import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige o valor_bruto_cents dos titulos de Contas a Pagar ja materializados.
 *
 * BUG: o ETL gravava `valor_bruto_cents = VLR_ORIGINAL`, que estava errado por dois
 * motivos:
 *  1. Acrescimo dobrado: VLR_ORIGINAL ja inclui acrescimo/desconto; como
 *     `valor_liquido_cents` e coluna GERADA (`bruto - desconto + juros + multa`) e
 *     `multa_cents = ACRESCIMO`, o acrescimo era contado DUAS vezes (titulo de
 *     R$ 17.987,35 com acrescimo R$ 877,60 virava liquido R$ 18.864,95).
 *  2. Titulo parcelado: na 1a parcela, VLR_ORIGINAL traz o total do DOCUMENTO
 *     inteiro (todas as parcelas), nao o valor da parcela (RAIZEN AD-0003616 p1:
 *     VLR_ORIGINAL=309.332,88 = 243k p1 + 66k p2, mas a parcela vale 243.033,46).
 *
 * Correcao: o bruto e o valor dos ITENS desta parcela (SUM CPGITDOC.VALORITEMDOC =
 * VLR_TOTAL_ITENS, que e por CODDOCTOCPG/parcela). Re-derivamos da fonte da verdade
 * (integration.globus_cp_stage.raw_payload), espelhando a logica do ETL:
 *   bruto = VLR_TOTAL_ITENS                          (quando ha itens)
 *         = VLR_ORIGINAL + DESCONTO - ACRESCIMO       (fallback sem itens)
 * Como valor_liquido_cents e STORED generated, o Postgres recalcula o liquido
 * sozinho ao atualizar o bruto.
 *
 * Idempotente: so toca linhas cujo bruto diverge do valor re-derivado. Rodar de
 * novo nao faz nada. Linhas sem correspondencia no stage ficam intactas.
 */
export class CpValorBrutoItens1700000032000 implements MigrationInterface {
  name = 'CpValorBrutoItens1700000032000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE finance.contas_pagar cp
      SET valor_bruto_cents = sub.bruto_cents
      FROM (
        SELECT
          s.codigo_empresa,
          s.cod_docto_cpg,
          ROUND(
            CASE
              WHEN (s.raw_payload->>'VLR_TOTAL_ITENS') IS NOT NULL
                THEN (s.raw_payload->>'VLR_TOTAL_ITENS')::numeric
              ELSE COALESCE((s.raw_payload->>'VLR_ORIGINAL')::numeric, 0)
                 + COALESCE((s.raw_payload->>'DESCONTO')::numeric, 0)
                 - COALESCE((s.raw_payload->>'ACRESCIMO')::numeric, 0)
            END * 100
          )::bigint AS bruto_cents
        FROM integration.globus_cp_stage s
      ) sub
      WHERE cp.origem_sistema   = 'globus'
        AND cp.empresa_id       = sub.codigo_empresa
        AND cp.origem_id_externo = sub.cod_docto_cpg::text
        AND cp.valor_bruto_cents <> sub.bruto_cents
    `);
  }

  /**
   * Reverte ao comportamento antigo (bruto = VLR_ORIGINAL), reintroduzindo o bug.
   * So existe para manter a migration reversivel; nao deve ser usado em prod.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE finance.contas_pagar cp
      SET valor_bruto_cents = sub.bruto_cents
      FROM (
        SELECT
          s.codigo_empresa,
          s.cod_docto_cpg,
          ROUND(
            COALESCE(
              (s.raw_payload->>'VLR_ORIGINAL')::numeric,
              (s.raw_payload->>'VLR_TOTAL_ITENS')::numeric,
              0
            ) * 100
          )::bigint AS bruto_cents
        FROM integration.globus_cp_stage s
      ) sub
      WHERE cp.origem_sistema   = 'globus'
        AND cp.empresa_id       = sub.codigo_empresa
        AND cp.origem_id_externo = sub.cod_docto_cpg::text
        AND cp.valor_bruto_cents <> sub.bruto_cents
    `);
  }
}
