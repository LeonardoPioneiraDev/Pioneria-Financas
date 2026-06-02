import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

export interface EtapaTemplate {
  ordem: number;
  chave: string;
  nome: string;
  descricao?: string;
  /** Role autorizado a avançar esta etapa (admin sempre pode). */
  papelResponsavel?: string;
  exigeAnexo?: boolean;
  exigeComentario?: boolean;
  /** Nome de ícone do lucide-react (ex.: 'Inbox', 'CheckCircle2'). */
  icone?: string;
  /** Cor do tailwind: 'blue', 'amber', 'emerald', 'red', 'purple', 'pioneira'. */
  cor?: string;
}

@Entity({ schema: 'finance', name: 'workflow_template' })
@Unique('workflow_template_nome_tipo_uq', ['nome', 'documentoTipo'])
@Index('workflow_template_tipo_idx', ['documentoTipo', 'ativo'])
export class WorkflowTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  nome!: string;

  @Column({ name: 'documento_tipo', type: 'varchar', length: 40 })
  documentoTipo!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  descricao!: string | null;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @Column({ type: 'jsonb' })
  etapas!: EtapaTemplate[];

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
