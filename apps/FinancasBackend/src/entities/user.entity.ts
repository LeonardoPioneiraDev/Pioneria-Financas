import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { UserRole } from '@pioneira/shared';

@Entity({ schema: 'identity', name: 'usuarios' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('usuarios_email_uq', { unique: true })
  @Column({ type: 'citext' })
  email!: string;

  @Column({ name: 'senha_hash', type: 'varchar', length: 200, nullable: true })
  senhaHash!: string | null;

  @Column({ name: 'nome_completo', type: 'varchar', length: 200 })
  nomeCompleto!: string;

  @Column({ type: 'varchar', length: 40 })
  role!: UserRole;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @Column({ name: 'must_change_password', type: 'boolean', default: true })
  mustChangePassword!: boolean;

  @Column({ name: 'ultimo_login_em', type: 'timestamptz', nullable: true })
  ultimoLoginEm!: Date | null;

  @Column({ name: 'preferencias_ui', type: 'jsonb', default: () => "'{}'::jsonb" })
  preferenciasUi!: Record<string, unknown>;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
