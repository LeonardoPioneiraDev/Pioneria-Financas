import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { WorkflowTemplate } from './workflow-template.entity.js';

export type WorkflowStatus = 'em_andamento' | 'concluido' | 'cancelado' | 'bloqueado';

@Entity({ schema: 'finance', name: 'workflow_instance' })
@Unique('workflow_instance_doc_uq', ['documentoTipo', 'documentoId'])
@Index('workflow_instance_status_idx', ['status', 'etapaAtual'])
export class WorkflowInstance {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId!: string;

  @ManyToOne(() => WorkflowTemplate)
  @JoinColumn({ name: 'template_id' })
  template?: WorkflowTemplate;

  @Column({ name: 'documento_tipo', type: 'varchar', length: 40 })
  documentoTipo!: string;

  @Column({ name: 'documento_id', type: 'varchar', length: 80 })
  documentoId!: string;

  @Column({ name: 'etapa_atual', type: 'varchar', length: 40 })
  etapaAtual!: string;

  @Column({ name: 'etapa_atual_idx', type: 'int', default: 0 })
  etapaAtualIdx!: number;

  @Column({ type: 'varchar', length: 20, default: 'em_andamento' })
  status!: WorkflowStatus;

  @Column({ name: 'criado_por', type: 'uuid', nullable: true })
  criadoPor!: string | null;

  @Column({ name: 'responsavel_id', type: 'uuid', nullable: true })
  responsavelId!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @Column({ name: 'concluido_em', type: 'timestamptz', nullable: true })
  concluidoEm!: Date | null;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
