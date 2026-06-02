import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BancoMovto } from './banco-movto.entity.js';
import { ContaPagar } from './conta-pagar.entity.js';
import { ContaReceber } from './conta-receber.entity.js';

export type ConciliacaoTipo = 'auto' | 'manual';
export type ConciliacaoStatus = 'sugerido' | 'confirmado' | 'rejeitado';

@Entity({ schema: 'finance', name: 'conciliacoes' })
@Index('conciliacoes_movto_idx', ['bancoMovtoId', 'status'])
@Index('conciliacoes_status_idx', ['status', 'sugeridoEm'])
export class Conciliacao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'banco_movto_id', type: 'uuid' })
  bancoMovtoId!: string;

  @ManyToOne(() => BancoMovto)
  @JoinColumn({ name: 'banco_movto_id' })
  bancoMovto?: BancoMovto;

  @Column({ name: 'conta_pagar_id', type: 'uuid', nullable: true })
  contaPagarId!: string | null;

  @ManyToOne(() => ContaPagar, { nullable: true })
  @JoinColumn({ name: 'conta_pagar_id' })
  contaPagar?: ContaPagar;

  @Column({ name: 'conta_receber_id', type: 'uuid', nullable: true })
  contaReceberId!: string | null;

  @ManyToOne(() => ContaReceber, { nullable: true })
  @JoinColumn({ name: 'conta_receber_id' })
  contaReceber?: ContaReceber;

  @Column({ type: 'varchar', length: 10 })
  tipo!: ConciliacaoTipo;

  /** Score de 0-100: quanto mais alto, mais confiança no match. */
  @Column({ name: 'score_confianca', type: 'int', default: 0 })
  scoreConfianca!: number;

  @Column({ name: 'diferenca_dias', type: 'int', default: 0 })
  diferencaDias!: number;

  @Column({ type: 'varchar', length: 20, default: 'sugerido' })
  status!: ConciliacaoStatus;

  @Column({ type: 'text', nullable: true })
  observacao!: string | null;

  @CreateDateColumn({ name: 'sugerido_em', type: 'timestamptz' })
  sugeridoEm!: Date;

  @Column({ name: 'confirmado_em', type: 'timestamptz', nullable: true })
  confirmadoEm!: Date | null;

  @Column({ name: 'confirmado_por_id', type: 'uuid', nullable: true })
  confirmadoPorId!: string | null;
}
