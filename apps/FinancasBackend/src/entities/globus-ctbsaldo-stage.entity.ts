import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Snapshot raw do CTBSALDO (saldo contabil mensal por conta) do Globus, filtrado
 * pelas familias de imobilizado/depreciacao. Alimenta o modulo Depreciacao.
 *
 * Chave natural: empresa + periodo (AAAAMM) + plano + conta contabil.
 */
@Entity({ schema: 'integration', name: 'globus_ctbsaldo_stage' })
@Unique('globus_ctbsaldo_stage_uq', ['codigoEmpresa', 'periodo', 'nroPlano', 'codContaCtb'])
@Index('globus_ctbsaldo_stage_proc_idx', ['processadoEm'])
export class GlobusCtbsaldoStage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'codigo_empresa', type: 'int' })
  codigoEmpresa!: number;

  /** PERIODOSALDO do Globus — CHAR(6) no formato AAAAMM. */
  @Column({ name: 'periodo', type: 'char', length: 6 })
  periodo!: string;

  @Column({ name: 'nro_plano', type: 'int' })
  nroPlano!: number;

  @Column({ name: 'cod_conta_ctb', type: 'int' })
  codContaCtb!: number;

  @Column({ name: 'sync_job_id', type: 'uuid', nullable: true })
  syncJobId!: string | null;

  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload!: Record<string, unknown>;

  @Column({ name: 'hash_payload', type: 'char', length: 64, nullable: true })
  hashPayload!: string | null;

  @CreateDateColumn({ name: 'recebido_em', type: 'timestamptz' })
  recebidoEm!: Date;

  @Column({ name: 'processado_em', type: 'timestamptz', nullable: true })
  processadoEm!: Date | null;

  @Column({ name: 'excluido_em', type: 'timestamptz', nullable: true })
  excluidoEm!: Date | null;

  @Column({ name: 'excluido_motivo', type: 'varchar', length: 60, nullable: true })
  excluidoMotivo!: string | null;
}
