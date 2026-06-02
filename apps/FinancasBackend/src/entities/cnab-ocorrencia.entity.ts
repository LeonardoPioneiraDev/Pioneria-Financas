import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ schema: 'finance', name: 'cnab_ocorrencias' })
@Unique('cnab_ocorrencias_uq', ['modulo', 'codigo'])
export class CnabOcorrencia {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', length: 3 })
  modulo!: string;

  @Column({ type: 'varchar', length: 4 })
  codigo!: string;

  @Column({ type: 'varchar', length: 400 })
  descricao!: string;

  @Column({ name: 'ultimo_sync_em', type: 'timestamptz', nullable: true })
  ultimoSyncEm!: Date | null;
}
