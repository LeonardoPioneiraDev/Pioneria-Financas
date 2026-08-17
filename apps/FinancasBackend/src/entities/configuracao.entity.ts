import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Configuracao da empresa (1 linha, empresa_id = 1). Identidade exibida no
 * sistema + logo como data-URI. Ver migration 1700000050000.
 */
@Entity({ schema: 'identity', name: 'configuracao' })
export class Configuracao {
  @PrimaryColumn({ name: 'empresa_id', type: 'int', default: 1 })
  empresaId!: number;

  @Column({ name: 'razao_social', type: 'varchar', length: 200 })
  razaoSocial!: string;

  @Column({ name: 'nome_fantasia', type: 'varchar', length: 120, nullable: true })
  nomeFantasia!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  cnpj!: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  endereco!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  telefone!: string | null;

  /** Logo em data-URI (ex.: 'data:image/png;base64,...'). Null = usa o padrao. */
  @Column({ name: 'logo_data_uri', type: 'text', nullable: true })
  logoDataUri!: string | null;

  /** Tempo mínimo (minutos) entre 1º acesso e validação na liberação progressiva. */
  @Column({ name: 'minutos_validacao_funcionalidade', type: 'int', default: 120 })
  minutosValidacaoFuncionalidade!: number;

  @Column({ name: 'atualizado_por', type: 'uuid', nullable: true })
  atualizadoPor!: string | null;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
