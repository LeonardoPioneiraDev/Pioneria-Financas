import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'finance', name: 'funcionarios' })
@Unique('funcionarios_origem_uq', ['origemSistema', 'codIntFunc'])
@Index('funcionarios_area_idx', ['codArea'])
@Index('funcionarios_cod_func_idx', ['codFunc'])
export class Funcionario {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  @Column({ name: 'origem_sistema', type: 'varchar', length: 40, default: 'globus' })
  origemSistema!: string;

  @Column({ name: 'cod_int_func', type: 'varchar', length: 40 })
  codIntFunc!: string;

  @Column({ name: 'cod_func', type: 'varchar', length: 40 })
  codFunc!: string;

  @Column({ type: 'varchar', length: 200 })
  nome!: string;

  @Column({ name: 'cod_area', type: 'varchar', length: 20, nullable: true })
  codArea!: string | null;

  @Column({ name: 'desc_area', type: 'varchar', length: 200, nullable: true })
  descArea!: string | null;

  @Column({ name: 'cod_depto', type: 'varchar', length: 20, nullable: true })
  codDepto!: string | null;

  @Column({ name: 'desc_funcao', type: 'varchar', length: 200, nullable: true })
  descFuncao!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  agencia!: string | null;

  @Column({ name: 'conta_corrente', type: 'varchar', length: 30, nullable: true })
  contaCorrente!: string | null;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @Column({ name: 'ultimo_sync_em', type: 'timestamptz', nullable: true })
  ultimoSyncEm!: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
