import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * Orcado de REFERENCIA adotado pelo financeiro — uma linha por centro de custo.
 * Nasce da base tecnica derivada (media do realizado), mas o financeiro AJUSTA e
 * ADOTA como a meta que o sistema passa a acompanhar (o comparativo realizado x
 * orcado usa isto quando existe; senao cai na media). Nao e o orcado legado do
 * Globus (esse e finance.orcamento_previsao). Valores em centavos (BIGINT).
 */
@Entity({ schema: 'finance', name: 'orcamento_meta' })
@Unique('orcamento_meta_setor_uq', ['empresaId', 'codCustoFin'])
@Index('orcamento_meta_empresa_idx', ['empresaId'])
export class OrcamentoMeta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  /** CODCUSTOFIN — centro de custo (setor). */
  @Column({ name: 'cod_custo_fin', type: 'int' })
  codCustoFin!: number;

  @Column({ name: 'nome', type: 'varchar', length: 120, nullable: true })
  nome!: string | null;

  /** Snapshot da categoria (receita/apoio/central) no momento da adocao. */
  @Column({ name: 'categoria', type: 'varchar', length: 12, default: 'indefinido' })
  categoria!: string;

  /** Orcado mensal adotado (ajustado pelo financeiro). */
  @Column({ name: 'orcado_mensal_cents', type: 'bigint', default: 0 })
  orcadoMensalCents!: string;

  /** O que a base tecnica sugeria quando adotaram (referencia/rastreio). */
  @Column({ name: 'base_sugerido_cents', type: 'bigint', default: 0 })
  baseSugeridoCents!: string;

  @Column({ name: 'observacao', type: 'text', nullable: true })
  observacao!: string | null;

  @Column({ name: 'adotado_por_usuario_id', type: 'uuid', nullable: true })
  adotadoPorUsuarioId!: string | null;

  @Column({ name: 'adotado_em', type: 'timestamptz', nullable: true })
  adotadoEm!: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;

  @Column({ name: 'excluido_em', type: 'timestamptz', nullable: true })
  excluidoEm!: Date | null;
}
