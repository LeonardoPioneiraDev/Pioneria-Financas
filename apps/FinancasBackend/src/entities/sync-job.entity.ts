import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type SyncJobStatus = 'rodando' | 'ok' | 'erro' | 'parcial';

@Entity({ schema: 'integration', name: 'sync_jobs' })
@Index('sync_jobs_sistema_recurso_idx', ['sistema', 'recurso', 'iniciadoEm'])
@Index('sync_jobs_status_idx', ['status', 'iniciadoEm'])
export class SyncJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 40 })
  sistema!: string;

  @Column({ type: 'varchar', length: 60 })
  recurso!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: SyncJobStatus;

  @Column({ name: 'iniciado_em', type: 'timestamptz', default: () => 'NOW()' })
  iniciadoEm!: Date;

  @Column({ name: 'terminado_em', type: 'timestamptz', nullable: true })
  terminadoEm!: Date | null;

  @Column({ name: 'registros_lidos', type: 'int', default: 0 })
  registrosLidos!: number;

  @Column({ name: 'registros_gravados', type: 'int', default: 0 })
  registrosGravados!: number;

  @Column({ name: 'registros_com_erro', type: 'int', default: 0 })
  registrosComErro!: number;

  @Column({ type: 'jsonb', nullable: true })
  parametros!: Record<string, unknown> | null;

  @Column({ name: 'erro_mensagem', type: 'text', nullable: true })
  erroMensagem!: string | null;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
