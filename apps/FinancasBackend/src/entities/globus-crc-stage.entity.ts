import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ schema: 'integration', name: 'globus_crc_stage' })
@Unique('globus_crc_stage_uq', ['codigoEmpresa', 'codDoctoCrc'])
@Index('globus_crc_stage_proc_idx', ['processadoEm'])
export class GlobusCrcStage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'codigo_empresa', type: 'int' })
  codigoEmpresa!: number;

  @Column({ name: 'cod_docto_crc', type: 'varchar', length: 40 })
  codDoctoCrc!: string;

  @Column({ name: 'sync_job_id', type: 'uuid', nullable: true })
  syncJobId!: string | null;

  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload!: Record<string, unknown>;

  @Column({ name: 'raw_itens', type: 'jsonb', nullable: true })
  rawItens!: Array<Record<string, unknown>> | null;

  /** SHA-256 hex do `raw_payload` + `raw_itens`. Vide `sha256Json`. */
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
