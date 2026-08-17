import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { NotificacaoTipo } from '@pioneira/shared';

/**
 * Notificação in-app (sininho). Uma linha POR DESTINATÁRIO — o mesmo evento
 * (ex.: auditor validou) vira N linhas, uma para cada quem-precisa-saber.
 * Assim "lida" é por pessoa, sem tabela de junção.
 */
@Entity({ schema: 'identity', name: 'notificacao' })
@Index('notificacao_destinatario_idx', ['usuarioId', 'lidaEm', 'criadoEm'])
export class Notificacao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 1 })
  empresaId!: number;

  /** Quem RECEBE a notificação. */
  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId!: string;

  @Column({ type: 'varchar', length: 40 })
  tipo!: NotificacaoTipo;

  @Column({ type: 'varchar', length: 200 })
  titulo!: string;

  @Column({ type: 'text' })
  mensagem!: string;

  /** Funcionalidade (href) a que o evento se refere. */
  @Column({ type: 'varchar', length: 80, nullable: true })
  funcionalidade!: string | null;

  /** Quem PROVOCOU o evento (auditor que validou, CFO que avalizou…). */
  @Column({ name: 'ator_id', type: 'uuid', nullable: true })
  atorId!: string | null;

  /** Denormalizado: o nome/e-mail no momento do evento, para o relatório não
   *  mudar se o cadastro do usuário for editado depois. */
  @Column({ name: 'ator_nome', type: 'varchar', length: 200, nullable: true })
  atorNome!: string | null;

  @Column({ name: 'ator_email', type: 'varchar', length: 255, nullable: true })
  atorEmail!: string | null;

  /** Rota para onde levar ao clicar. */
  @Column({ type: 'varchar', length: 200, nullable: true })
  link!: string | null;

  @Column({ name: 'lida_em', type: 'timestamptz', nullable: true })
  lidaEm!: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
