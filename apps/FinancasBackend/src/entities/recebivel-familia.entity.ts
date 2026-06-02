import { Column, Entity, PrimaryColumn } from 'typeorm';

export type RecebivelFamiliaTipo = 'pagante' | 'gratuidade';

@Entity({ schema: 'finance', name: 'recebivel_familia' })
export class RecebivelFamilia {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  codigo!: string;

  @Column({ type: 'varchar', length: 60 })
  nome!: string;

  @Column({ type: 'varchar', length: 20 })
  tipo!: RecebivelFamiliaTipo;

  @Column({ name: 'fonte_subsidio', type: 'varchar', length: 40, nullable: true })
  fonteSubsidio!: string | null;

  @Column({ type: 'smallint', default: 99 })
  ordem!: number;

  @Column({ type: 'text', nullable: true })
  descricao!: string | null;
}
