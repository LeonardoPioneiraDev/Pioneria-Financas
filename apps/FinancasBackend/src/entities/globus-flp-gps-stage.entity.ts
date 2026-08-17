import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Snapshot raw do FLP_GPS_INTEGRACPG (GPS/INSS da folha) do Globus. Alimenta o
 * painel "Tributos da folha" com o INSS patronal REAL (com/sem desoneracao).
 *
 * Chave natural: empresa + filial + periodo (AAAAMM) + tipo de folha +
 * identificador (cod_ident/tipo_ident). cod_ident/tipo_ident tem default nao-nulo
 * pra manter a UNIQUE limpa (o Globus grao pode variar por competencia).
 */
@Entity({ schema: 'integration', name: 'globus_flp_gps_stage' })
@Unique('globus_flp_gps_stage_uq', ['codigoEmpresa', 'codigoFl', 'periodo', 'tipoFolha', 'codIdent', 'tipoIdent'])
@Index('globus_flp_gps_stage_proc_idx', ['processadoEm'])
export class GlobusFlpGpsStage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'codigo_empresa', type: 'int' })
  codigoEmpresa!: number;

  @Column({ name: 'codigo_fl', type: 'int' })
  codigoFl!: number;

  /** Competencia como AAAAMM (TO_CHAR da DATE original — evita ambiguidade de TZ). */
  @Column({ name: 'periodo', type: 'char', length: 6 })
  periodo!: string;

  @Column({ name: 'tipo_folha', type: 'int' })
  tipoFolha!: number;

  @Column({ name: 'cod_ident', type: 'int', default: 0 })
  codIdent!: number;

  @Column({ name: 'tipo_ident', type: 'varchar', length: 4, default: '' })
  tipoIdent!: string;

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
