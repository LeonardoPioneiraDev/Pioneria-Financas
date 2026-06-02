import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ schema: 'integration', name: 'globus_bcomovto_stage' })
@Unique('globus_bcomovto_stage_uq', ['codigoEmpresa', 'codMovtoBco'])
@Index('globus_bcomovto_stage_proc_idx', ['processadoEm'])
export class GlobusBcomovtoStage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'cod_movto_bco', type: 'bigint' })
  codMovtoBco!: string;

  @Column({ name: 'codigo_empresa', type: 'int' })
  codigoEmpresa!: number;

  @Column({ name: 'codigo_fl', type: 'int' })
  codigoFl!: number;

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
