import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ schema: 'integration', name: 'globus_flp_ficha_stage' })
@Unique('globus_flp_ficha_stage_uq', ['codIntFunc', 'competencia', 'codEvento', 'tipoFolha'])
@Index('globus_flp_ficha_stage_comp_idx', ['competencia', 'tipoFolha'])
export class GlobusFlpFichaStage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'cod_int_func', type: 'varchar', length: 40 })
  codIntFunc!: string;

  @Column({ type: 'date' })
  competencia!: string;

  @Column({ name: 'cod_evento', type: 'int' })
  codEvento!: number;

  @Column({ name: 'tipo_folha', type: 'int' })
  tipoFolha!: number;

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
