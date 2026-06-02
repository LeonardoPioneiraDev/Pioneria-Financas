import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity.js';

export type PasswordResetTokenTipo = 'reset' | 'first_access';

@Entity({ schema: 'identity', name: 'password_reset_tokens' })
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('password_reset_tokens_user_idx')
  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario?: User;

  @Index('password_reset_tokens_hash_uq', { unique: true })
  @Column({ name: 'token_hash', type: 'varchar', length: 128 })
  tokenHash!: string;

  @Column({ type: 'varchar', length: 20 })
  tipo!: PasswordResetTokenTipo;

  @Column({ name: 'expira_em', type: 'timestamptz' })
  expiraEm!: Date;

  @Column({ name: 'usado_em', type: 'timestamptz', nullable: true })
  usadoEm!: Date | null;

  @Column({ name: 'ip_origem', type: 'inet', nullable: true })
  ipOrigem!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
