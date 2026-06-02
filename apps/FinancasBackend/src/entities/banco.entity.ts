import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity({ schema: 'finance', name: 'bancos' })
@Unique('bancos_origem_uq', ['origemSistema', 'origemIdExterno'])
export class Banco {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'numero_febraban', type: 'int', unique: true })
  numeroFebraban!: number;

  @Column({ type: 'varchar', length: 80 })
  nome!: string;

  @Column({ type: 'varchar', length: 120, nullable: true })
  homepage!: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  ispb!: string | null;

  @Column({ name: 'origem_sistema', type: 'varchar', length: 40, default: 'globus' })
  origemSistema!: string;

  @Column({ name: 'origem_id_externo', type: 'varchar', length: 40, nullable: true })
  origemIdExterno!: string | null;

  @Column({ name: 'ultimo_sync_em', type: 'timestamptz', nullable: true })
  ultimoSyncEm!: Date | null;
}
