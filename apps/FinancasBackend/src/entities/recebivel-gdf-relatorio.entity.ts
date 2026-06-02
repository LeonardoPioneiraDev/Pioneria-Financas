import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ schema: 'finance', name: 'recebivel_gdf_relatorio' })
@Index('recebivel_gdf_relatorio_data_idx', ['dataResgate'])
export class RecebivelGdfRelatorio {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** ID retornado pela API horarios (uuid externo). */
  @Column({ name: 'origem_id_externo', type: 'varchar', length: 40, unique: true })
  origemIdExterno!: string;

  @Column({ type: 'varchar', length: 200 })
  filename!: string;

  @Column({ name: 'file_type', type: 'varchar', length: 40, nullable: true })
  fileType!: string | null;

  @Column({ name: 'date_range', type: 'text', nullable: true })
  dateRange!: string | null;

  /** Data do resgate extraida do dateRange ("De: DD/MM/YYYY até DD/MM/YYYY ..."). */
  @Column({ name: 'data_resgate', type: 'date' })
  dataResgate!: string;

  @Column({ name: 'product_count', type: 'int', nullable: true })
  productCount!: number | null;

  @Column({ name: 'row_count', type: 'int', nullable: true })
  rowCount!: number | null;

  @Column({ name: 'date_columns_count', type: 'int', nullable: true })
  dateColumnsCount!: number | null;

  @Column({ name: 'user_name', type: 'varchar', length: 60, nullable: true })
  userName!: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ name: 'valor_total_cents', type: 'bigint', default: 0 })
  valorTotalCents!: string;

  @Column({ name: 'creditos_total', type: 'int', default: 0 })
  creditosTotal!: number;

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
