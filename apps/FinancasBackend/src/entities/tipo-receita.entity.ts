import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'finance', name: 'tipos_receita' })
@Index('tipos_receita_classif_idx', ['classificador'])
export class TipoReceita {
  @PrimaryColumn({ name: 'cod_tp_receita', type: 'varchar', length: 20 })
  codTpReceita!: string;

  @Column({ type: 'varchar', length: 200 })
  descricao!: string;

  @Column({ type: 'varchar', length: 40, nullable: true })
  classificador!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  natureza!: string | null;

  @Column({ name: 'codigo_servico', type: 'varchar', length: 20, nullable: true })
  codigoServico!: string | null;

  @Column({ name: 'origem_sistema', type: 'varchar', length: 40, default: 'globus' })
  origemSistema!: string;

  @Column({ name: 'ultimo_sync_em', type: 'timestamptz', nullable: true })
  ultimoSyncEm!: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
