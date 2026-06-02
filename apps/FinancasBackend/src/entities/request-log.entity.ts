import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'audit', name: 'request_logs' })
@Index('request_logs_criado_idx', ['criadoEm'])
@Index('request_logs_user_idx', ['usuarioId', 'criadoEm'])
@Index('request_logs_path_idx', ['method', 'path'])
export class RequestLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_id', type: 'uuid' })
  requestId!: string;

  @Column({ type: 'varchar', length: 10 })
  method!: string;

  @Column({ type: 'varchar', length: 500 })
  path!: string;

  @Column({ name: 'status_code', type: 'int' })
  statusCode!: number;

  @Column({ name: 'latency_ms', type: 'int' })
  latencyMs!: number;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId!: string | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
