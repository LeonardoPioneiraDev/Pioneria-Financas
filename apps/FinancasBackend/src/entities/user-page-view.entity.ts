import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ schema: 'audit', name: 'user_page_views' })
@Index('user_page_views_user_idx', ['usuarioId', 'criadoEm'])
@Index('user_page_views_session_idx', ['sessionId'])
export class UserPageView {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId!: string;

  @Column({ name: 'session_id', type: 'varchar', length: 80 })
  sessionId!: string;

  @Column({ type: 'varchar', length: 500 })
  path!: string;

  @Column({ name: 'page_title', type: 'varchar', length: 200, nullable: true })
  pageTitle!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  referrer!: string | null;

  @Column({ name: 'time_on_page_ms', type: 'int', nullable: true })
  timeOnPageMs!: number | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
