import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Funcionario } from './funcionario.entity.js';
import { EventoFolha } from './evento-folha.entity.js';

@Entity({ schema: 'finance', name: 'ficha_evento' })
@Unique('ficha_evento_origem_uq', ['origemSistema', 'origemIdExterno'])
@Index('ficha_evento_comp_idx', ['competencia', 'tipoFolha'])
@Index('ficha_evento_func_idx', ['funcionarioId', 'competencia'])
@Index('ficha_evento_evento_idx', ['codEvento'])
export class FichaEvento {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  @Column({ name: 'funcionario_id', type: 'uuid' })
  funcionarioId!: string;

  @ManyToOne(() => Funcionario, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'funcionario_id' })
  funcionario?: Funcionario;

  @Column({ name: 'cod_evento', type: 'int' })
  codEvento!: number;

  @ManyToOne(() => EventoFolha)
  @JoinColumn({ name: 'cod_evento', referencedColumnName: 'codEvento' })
  evento?: EventoFolha;

  /** Competência da folha (data, normalmente último dia do mês trabalhado). */
  @Column({ type: 'date' })
  competencia!: string;

  /** TIPOFOLHA do Globus: 1=mensal, 2=adiantamento, 3=13º, 4=férias, 5=rescisão (a confirmar). */
  @Column({ name: 'tipo_folha', type: 'int' })
  tipoFolha!: number;

  /** Referência (horas, dias, quantidade) — pode ser nulo. */
  @Column({ type: 'numeric', precision: 12, scale: 4, nullable: true })
  referencia!: string | null;

  /** Valor lançado em centavos (sempre positivo; sinal vem do tipo P/D do evento). */
  @Column({ name: 'valor_cents', type: 'bigint' })
  valorCents!: string;

  @Column({ name: 'origem_sistema', type: 'varchar', length: 40, default: 'globus' })
  origemSistema!: string;

  /** Chave natural: cod_int_func|competencia|cod_evento|tipo_folha. */
  @Column({ name: 'origem_id_externo', type: 'varchar', length: 120 })
  origemIdExterno!: string;

  @Column({ name: 'ultimo_sync_em', type: 'timestamptz', nullable: true })
  ultimoSyncEm!: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
