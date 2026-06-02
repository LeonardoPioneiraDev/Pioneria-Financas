import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Replica local da FLP_ENCERRAMENTOFICHAFIN (Globus). Indica quais
 * competencias+tipo_folha estao congeladas no Praxio. Usada pelo adapter
 * FLP pra pular re-sync de competencias ja fechadas.
 */
@Entity({ schema: 'integration', name: 'globus_flp_encerramento_stage' })
@Unique('globus_flp_encerramento_stage_uq', ['codigoEmpresa', 'codigoFl', 'tipoFolha', 'competencia'])
@Index('globus_flp_encerramento_stage_competencia_idx', ['competencia', 'tipoFolha'])
export class GlobusFlpEncerramentoStage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'codigo_empresa', type: 'int' })
  codigoEmpresa!: number;

  @Column({ name: 'codigo_fl', type: 'int' })
  codigoFl!: number;

  @Column({ name: 'tipo_folha', type: 'int' })
  tipoFolha!: number;

  @Column({ type: 'date' })
  competencia!: string;

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
