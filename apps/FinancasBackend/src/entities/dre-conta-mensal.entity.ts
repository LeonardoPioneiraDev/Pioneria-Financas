import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * Contas de RESULTADO do razao (CTBSALDO, plano 1), por competencia — base da DRE.
 *
 * Uma linha por (empresa, competencia, conta contabil). SO folhas (analiticas):
 * os sinteticos '.0000' sao descartados no sync porque o CTBSALDO os guarda junto
 * e eles triplicam o valor (nivel-3 + nivel-4 + folha). classe = 1o digito do
 * classificador ('3' despesa, '4' receita). Valores em centavos (BIGINT).
 *
 * O service monta as LINHAS da DRE agregando estas folhas por prefixo de
 * classificador (ver DRE_ESTRUTURA em dre.service).
 */
@Entity({ schema: 'finance', name: 'dre_conta_mensal' })
@Unique('dre_conta_mensal_uq', ['empresaId', 'competencia', 'codContaCtb'])
@Index('dre_conta_mensal_comp_idx', ['empresaId', 'competencia'])
export class DreContaMensal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  /** Primeiro dia do mes (derivado do PERIODOSALDO AAAAMM). */
  @Column({ name: 'competencia', type: 'date' })
  competencia!: string;

  @Column({ name: 'periodo', type: 'char', length: 6 })
  periodo!: string;

  @Column({ name: 'cod_conta_ctb', type: 'int' })
  codContaCtb!: number;

  @Column({ name: 'classificador', type: 'varchar', length: 30 })
  classificador!: string;

  @Column({ name: 'nome_conta', type: 'varchar', length: 120, nullable: true })
  nomeConta!: string | null;

  /** '3' = despesa/custo, '4' = receita (1o digito do classificador). */
  @Column({ name: 'classe', type: 'char', length: 1 })
  classe!: string;

  @Column({ name: 'debito_cents', type: 'bigint' })
  debitoCents!: string;

  @Column({ name: 'credito_cents', type: 'bigint' })
  creditoCents!: string;

  @Column({ name: 'ultimo_sync_em', type: 'timestamptz', nullable: true })
  ultimoSyncEm!: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
