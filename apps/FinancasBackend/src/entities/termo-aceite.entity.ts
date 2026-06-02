import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ schema: 'audit', name: 'termo_aceite' })
@Unique('termo_aceite_usuario_versao_uq', ['usuarioId', 'versaoTermo'])
@Index('termo_aceite_usuario_idx', ['usuarioId', 'aceitoEm'])
export class TermoAceite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId!: string;

  @Column({ name: 'versao_termo', type: 'varchar', length: 20 })
  versaoTermo!: string;

  @Column({ name: 'nome_digitado', type: 'varchar', length: 200 })
  nomeDigitado!: string;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'aceito_em', type: 'timestamptz' })
  aceitoEm!: Date;
}
