import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ReguaCanal = 'email' | 'whatsapp' | 'sms';
export type ReguaTom = 'cordial' | 'formal' | 'severo';

@Entity({ schema: 'finance', name: 'regua_cobranca_templates' })
@Index('regua_templates_gatilho_idx', ['gatilhoDiasVencimento', 'ativo'])
export class ReguaCobrancaTemplate {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  nome!: string;

  @Column({ type: 'varchar', length: 20 })
  canal!: ReguaCanal;

  /** Negativo = antes do vencimento. Positivo = depois. Zero = no dia. */
  @Column({ name: 'gatilho_dias_vencimento', type: 'int' })
  gatilhoDiasVencimento!: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  assunto!: string | null;

  @Column({ name: 'corpo_template', type: 'text' })
  corpoTemplate!: string;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @Column({ type: 'varchar', length: 20, default: 'cordial' })
  tom!: ReguaTom;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
