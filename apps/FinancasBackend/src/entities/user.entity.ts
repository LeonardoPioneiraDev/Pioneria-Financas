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

  /** Permissoes de funcionalidade (granulares). Ex.: ['ver_contracheque']. */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  permissoes!: string[];

  /** Liberacao progressiva ligada? (menu mostra so as liberadas). */
  @Column({ name: 'liberacao_progressiva', type: 'boolean', default: false })
  liberacaoProgressiva!: boolean;

  /** Funcionalidades (hrefs) que o admin atribuiu ao usuario. */
  @Column({ name: 'funcionalidades_atribuidas', type: 'text', array: true, default: () => "'{}'" })
  funcionalidadesAtribuidas!: string[];

  /** Funcionalidades (hrefs) que o usuario ja validou. */
  @Column({ name: 'funcionalidades_validadas', type: 'text', array: true, default: () => "'{}'" })
  funcionalidadesValidadas!: string[];

  /** Progresso por funcionalidade: { href: { primeiroAcessoEm, validadoEm } }. */
  @Column({ name: 'progresso_funcionalidades', type: 'jsonb', default: () => "'{}'::jsonb" })
  progressoFuncionalidades!: Record<string, { primeiroAcessoEm: string | null; validadoEm: string | null; justificativa: string | null }>;

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
