import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Cliente } from './cliente.entity.js';

@Entity({ schema: 'finance', name: 'serasa_consultas' })
export class SerasaConsulta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId!: string | null;

  @ManyToOne(() => Cliente, { nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Cliente;

  @Column({ name: 'cnpj_cpf', type: 'varchar', length: 20, nullable: true })
  cnpjCpf!: string | null;

  @Column({ type: 'int', nullable: true })
  score!: number | null;

  @Column({ name: 'tem_restricao', type: 'boolean', nullable: true })
  temRestricao!: boolean | null;

  @Column({ name: 'qtd_restricoes', type: 'int', default: 0 })
  qtdRestricoes!: number;

  @Column({ name: 'valor_restricoes_cents', type: 'bigint', default: 0 })
  valorRestricoesCents!: string;

  @Column({ type: 'text', nullable: true })
  observacao!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'mock' })
  modo!: 'mock' | 'real';

  @Column({ name: 'consultado_por_id', type: 'uuid', nullable: true })
  consultadoPorId!: string | null;

  @CreateDateColumn({ name: 'consultado_em', type: 'timestamptz' })
  consultadoEm!: Date;
}
