import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Cliente } from './cliente.entity.js';
import { ContaReceber } from './conta-receber.entity.js';

export type SerasaNegativacaoStatus = 'enviado' | 'efetivado' | 'baixado' | 'recusado';

@Entity({ schema: 'finance', name: 'serasa_negativacoes' })
@Index('serasa_negativacoes_cr_idx', ['contaReceberId'])
export class SerasaNegativacao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conta_receber_id', type: 'uuid' })
  contaReceberId!: string;

  @ManyToOne(() => ContaReceber)
  @JoinColumn({ name: 'conta_receber_id' })
  contaReceber?: ContaReceber;

  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId!: string | null;

  @ManyToOne(() => Cliente, { nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Cliente;

  @Column({ name: 'protocolo_serasa', type: 'varchar', length: 60, nullable: true })
  protocoloSerasa!: string | null;

  @Column({ type: 'text' })
  motivo!: string;

  @Column({ name: 'valor_cents', type: 'bigint' })
  valorCents!: string;

  @Column({ type: 'varchar', length: 20, default: 'enviado' })
  status!: SerasaNegativacaoStatus;

  @Column({ type: 'varchar', length: 20, default: 'mock' })
  modo!: 'mock' | 'real';

  @Column({ name: 'enviado_por_id', type: 'uuid', nullable: true })
  enviadoPorId!: string | null;

  @CreateDateColumn({ name: 'enviado_em', type: 'timestamptz' })
  enviadoEm!: Date;

  @Column({ name: 'efetivado_em', type: 'timestamptz', nullable: true })
  efetivadoEm!: Date | null;

  @Column({ name: 'baixado_em', type: 'timestamptz', nullable: true })
  baixadoEm!: Date | null;

  @Column({ type: 'text', nullable: true })
  observacao!: string | null;
}
