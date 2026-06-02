import { Column, CreateDateColumn, Entity, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity.js';

@Entity({ schema: 'identity', name: 'refresh_tokens' })
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('refresh_tokens_user_idx')
  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario?: User;

  @Index('refresh_tokens_hash_uq', { unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 128 })
  tokenHash!: string;

  @Column({ name: 'expira_em', type: 'timestamptz' })
  expiraEm!: Date;

  @Column({ name: 'revogado_em', type: 'timestamptz', nullable: true })
  revogadoEm!: Date | null;

  @Column({ name: 'ip_origem', type: 'inet', nullable: true })
  ipOrigem!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
