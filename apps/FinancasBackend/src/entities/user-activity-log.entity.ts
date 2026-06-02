import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type UserActivityType = 'login' | 'login_falha' | 'logout' | 'password_change' | 'password_reset' | 'first_access';

@Entity({ schema: 'audit', name: 'user_activity_logs' })
@Index('user_activity_logs_user_idx', ['usuarioId', 'criadoEm'])
@Index('user_activity_logs_tipo_idx', ['activityType', 'criadoEm'])
export class UserActivityLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId!: string | null;

  @Column({ name: 'activity_type', type: 'varchar', length: 40 })
  activityType!: UserActivityType;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, string | number | boolean | null> | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
