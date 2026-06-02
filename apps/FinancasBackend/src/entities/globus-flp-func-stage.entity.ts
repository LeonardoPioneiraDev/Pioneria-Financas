import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ schema: 'integration', name: 'globus_flp_func_stage' })
@Unique('globus_flp_func_stage_uq', ['codigoEmpresa', 'codIntFunc'])
@Index('globus_flp_func_stage_proc_idx', ['processadoEm'])
export class GlobusFlpFuncStage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'codigo_empresa', type: 'int' })
  codigoEmpresa!: number;

  @Column({ name: 'cod_int_func', type: 'varchar', length: 40 })
  codIntFunc!: string;

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
