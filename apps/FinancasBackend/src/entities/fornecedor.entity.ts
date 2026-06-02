import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'finance', name: 'fornecedores' })
export class Fornecedor {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  @Column({ name: 'cnpj_cpf', type: 'varchar', length: 20, nullable: true })
  cnpjCpf!: string | null;

  @Column({ name: 'razao_social', type: 'varchar', length: 255 })
  razaoSocial!: string;

  @Column({ name: 'nome_fantasia', type: 'varchar', length: 255, nullable: true })
  nomeFantasia!: string | null;

  @Column({ type: 'boolean', default: true })
  ativo!: boolean;

  // Atributos fiscais (GLOBUS.BGM_FORNECEDOR) — usados na conferencia de retencoes.
  // optSimplesNacional NULL = desconhecido; true = Simples (sem retencao na fonte de
  // PIS/COFINS/CSLL/IRRF).
  @Column({ name: 'opt_simples_nacional', type: 'boolean', nullable: true })
  optSimplesNacional!: boolean | null;

  /** Tipo de inscricao: CNPJ | CPF | CEI (TPINSCRICAOFORN). */
  @Column({ name: 'tipo_inscricao', type: 'varchar', length: 10, nullable: true })
  tipoInscricao!: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  uf!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  cidade!: string | null;

  @Column({ name: 'cod_municipio', type: 'int', nullable: true })
  codMunicipio!: number | null;

  @Column({ name: 'origem_sistema', type: 'varchar', length: 40, nullable: true })
  origemSistema!: string | null;

  @Column({ name: 'origem_id_externo', type: 'varchar', length: 40, nullable: true })
  origemIdExterno!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;

  @Column({ name: 'excluido_em', type: 'timestamptz', nullable: true })
  excluidoEm!: Date | null;

  @Column({ name: 'excluido_motivo', type: 'varchar', length: 60, nullable: true })
  excluidoMotivo!: string | null;
}
