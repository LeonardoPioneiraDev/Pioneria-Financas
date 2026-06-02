import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ContaPagar } from './conta-pagar.entity.js';
import { User } from './user.entity.js';

export type AprovacaoDecisao = 'aprovado' | 'rejeitado';

@Entity({ schema: 'finance', name: 'aprovacoes_cp' })
@Index('aprovacoes_cp_cp_idx', ['contaPagarId', 'criadoEm'])
export class AprovacaoCp {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conta_pagar_id', type: 'uuid' })
  contaPagarId!: string;

  @ManyToOne(() => ContaPagar)
  @JoinColumn({ name: 'conta_pagar_id' })
  contaPagar?: ContaPagar;

  @Column({ name: 'aprovador_id', type: 'uuid' })
  aprovadorId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'aprovador_id' })
  aprovador?: User;

  @Column({ type: 'varchar', length: 10 })
  decisao!: AprovacaoDecisao;

  @Column({ type: 'text', nullable: true })
  justificativa!: string | null;

  @Column({ name: 'assinatura_hash', type: 'varchar', length: 64 })
  assinaturaHash!: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
