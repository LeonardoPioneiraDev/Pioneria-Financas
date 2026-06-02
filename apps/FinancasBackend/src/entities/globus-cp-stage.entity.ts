import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'integration', name: 'globus_cp_stage' })
export class GlobusCpStage {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'cod_docto_cpg', type: 'bigint' })
  codDoctoCpg!: string;

  @Column({ name: 'codigo_empresa', type: 'int' })
  codigoEmpresa!: number;

  @Column({ name: 'sync_job_id', type: 'uuid', nullable: true })
  syncJobId!: string | null;

  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload!: Record<string, unknown>;

  /** SHA-256 hex do `raw_payload` (chaves ordenadas). Vide `sha256Json`. */
  @Column({ name: 'hash_payload', type: 'char', length: 64, nullable: true })
  hashPayload!: string | null;

  @CreateDateColumn({ name: 'recebido_em', type: 'timestamptz' })
  recebidoEm!: Date;

  @Column({ name: 'processado_em', type: 'timestamptz', nullable: true })
  processadoEm!: Date | null;

  /** Quando o registro foi detectado como excluido na fonte. NULL = ativo. */
  @Column({ name: 'excluido_em', type: 'timestamptz', nullable: true })
  excluidoEm!: Date | null;

  /** Motivo da exclusao: 'cancelado_no_globus' | 'sumiu_do_sync' | 'data_zero'. */
  @Column({ name: 'excluido_motivo', type: 'varchar', length: 60, nullable: true })
  excluidoMotivo!: string | null;
}
