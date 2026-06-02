import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type TipoEventoFolha = 'P' | 'D' | 'B';

@Entity({ schema: 'finance', name: 'eventos_folha' })
@Index('eventos_folha_grupo_idx', ['grupo'])
export class EventoFolha {
  @PrimaryColumn({ name: 'cod_evento', type: 'int' })
  codEvento!: number;

  @Column({ type: 'varchar', length: 200 })
  descricao!: string;

  @Column({ type: 'char', length: 1 })
  tipo!: TipoEventoFolha;

  /** Classificação inferida do nome: salario, hora_extra, inss, fgts, irrf, vt, va, sindical, pensao, adiantamento, ferias, decimo_terceiro, base, outros. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  grupo!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
