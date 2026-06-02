import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WorkflowInstance } from './workflow-instance.entity.js';

export type WorkflowAcao =
  | 'criou' | 'avancou' | 'voltou' | 'comentou' | 'anexou'
  | 'aprovou' | 'rejeitou' | 'cancelou' | 'retomou' | 'atribuiu';

@Entity({ schema: 'finance', name: 'workflow_evento' })
@Index('workflow_evento_instance_idx', ['instanceId', 'criadoEm'])
@Index('workflow_evento_usuario_idx', ['usuarioId', 'criadoEm'])
export class WorkflowEvento {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'instance_id', type: 'uuid' })
  instanceId!: string;

  @ManyToOne(() => WorkflowInstance, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instance_id' })
  instance?: WorkflowInstance;

  @Column({ name: 'etapa_chave', type: 'varchar', length: 40 })
  etapaChave!: string;

  @Column({ name: 'etapa_idx', type: 'int' })
  etapaIdx!: number;

  @Column({ type: 'varchar', length: 20 })
  acao!: WorkflowAcao;

  @Column({ name: 'usuario_id', type: 'uuid', nullable: true })
  usuarioId!: string | null;

  @Column({ type: 'varchar', length: 2000, nullable: true })
  comentario!: string | null;

  @Column({ name: 'anexo_url', type: 'varchar', length: 500, nullable: true })
  anexoUrl!: string | null;

  @Column({ name: 'anexo_nome', type: 'varchar', length: 200, nullable: true })
  anexoNome!: string | null;

  @Column({ name: 'para_etapa', type: 'varchar', length: 40, nullable: true })
  paraEtapa!: string | null;

  @Column({ name: 'para_usuario_id', type: 'uuid', nullable: true })
  paraUsuarioId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
