import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'finance', name: 'clientes' })
@Unique('clientes_origem_uq', ['origemSistema', 'codCli'])
@Index('clientes_doc_idx', ['numeroInscricao'])
export class Cliente {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  @Column({ name: 'origem_sistema', type: 'varchar', length: 40, default: 'globus' })
  origemSistema!: string;

  @Column({ name: 'cod_cli', type: 'varchar', length: 40 })
  codCli!: string;

  @Column({ name: 'razao_social', type: 'varchar', length: 200 })
  razaoSocial!: string;

  @Column({ name: 'nome_fantasia', type: 'varchar', length: 100, nullable: true })
  nomeFantasia!: string | null;

  @Column({ name: 'tipo_inscricao', type: 'varchar', length: 5, nullable: true })
  tipoInscricao!: string | null;

  @Column({ name: 'numero_inscricao', type: 'varchar', length: 20, nullable: true })
  numeroInscricao!: string | null;

  @Column({ name: 'inscricao_estadual', type: 'varchar', length: 20, nullable: true })
  inscricaoEstadual!: string | null;

  @Column({ name: 'inscricao_municipal', type: 'varchar', length: 20, nullable: true })
  inscricaoMunicipal!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  telefone!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  endereco!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bairro!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  cidade!: string | null;

  @Column({ type: 'varchar', length: 3, nullable: true })
  uf!: string | null;

  @Column({ type: 'varchar', length: 9, nullable: true })
  cep!: string | null;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  @Column({ name: 'banco_padrao', type: 'varchar', length: 20, nullable: true })
  bancoPadrao!: string | null;

  @Column({ name: 'agencia_padrao', type: 'varchar', length: 20, nullable: true })
  agenciaPadrao!: string | null;

  @Column({ name: 'conta_padrao', type: 'varchar', length: 30, nullable: true })
  contaPadrao!: string | null;

  @Column({ name: 'data_cadastro', type: 'date', nullable: true })
  dataCadastro!: string | null;

  @Column({ name: 'ultimo_movto', type: 'date', nullable: true })
  ultimoMovto!: string | null;

  @Column({ name: 'ultimo_sync_em', type: 'timestamptz', nullable: true })
  ultimoSyncEm!: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;

  @Column({ name: 'excluido_em', type: 'timestamptz', nullable: true })
  excluidoEm!: Date | null;

  @Column({ name: 'excluido_motivo', type: 'varchar', length: 60, nullable: true })
  excluidoMotivo!: string | null;
}
