import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Snapshot cru de GLOBUS.CPGDOCTO_HISTORICO_NEGOCIACOES (log de eventos do CP).
 * Chave natural: (codigo_empresa, cod_docto_cpg, sequencia_evento).
 */
@Entity({ schema: 'integration', name: 'globus_cp_eventos_stage' })
@Unique('globus_cp_eventos_stage_uq', ['codigoEmpresa', 'codDoctoCpg', 'sequenciaEvento'])
export class GlobusCpEventosStage {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'cod_docto_cpg', type: 'bigint' })
  codDoctoCpg!: string;

  @Column({ name: 'codigo_empresa', type: 'int' })
  codigoEmpresa!: number;

  @Column({ name: 'sequencia_evento', type: 'int' })
  sequenciaEvento!: number;

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
}
