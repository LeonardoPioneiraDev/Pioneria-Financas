import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type TipoFeriado = 'nacional' | 'estadual' | 'municipal' | 'facultativo' | 'empresa';

/**
 * Feriado do calendario. `recorrente` = repete todo ano (mesmo mes/dia). Ver
 * migration 1700000052000. Consumido pela projecao do Fluxo de Caixa.
 */
@Entity({ schema: 'identity', name: 'feriado' })
@Index('feriado_data_idx', ['data'])
export class Feriado {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Data no formato 'YYYY-MM-DD'. Para recorrentes, so mes/dia importam. */
  @Column({ type: 'date' })
  data!: string;

  @Column({ type: 'varchar', length: 120 })
  nome!: string;

  @Column({ type: 'varchar', length: 20, default: 'nacional' })
  tipo!: TipoFeriado;

  /** True = repete todo ano (feriado fixo). False = data especifica (movel). */
  @Column({ type: 'boolean', default: false })
  recorrente!: boolean;

  @Column({ name: 'criado_por', type: 'uuid', nullable: true })
  criadoPor!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
