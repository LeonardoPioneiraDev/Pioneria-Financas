import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * Receita/bilhetagem TD Max por dia — snapshot da API horarios.vpioneira.com.br
 * (endpoint /integrations/receita/passageiro-receita). Passageiros e receita
 * valorizada a TARIFA TECNICA, por Estacoes (BRT) x Area 2 x Total.
 *
 * IMPORTANTE (ver [[gdf-tarifa-tecnica-bilhetagem]]): esta e a receita GERADA no
 * validador — a MESMA que o GDF paga (sem glosa) com defasagem ~D+3. NAO e caixa
 * novo: no fluxo de caixa serve pra prever o repasse do GDF, nao pra somar por cima.
 * Valores em centavos.
 */
@Entity({ schema: 'finance', name: 'receita_tdmax' })
@Unique('receita_tdmax_uq', ['empresaId', 'data'])
@Index('receita_tdmax_data_idx', ['data'])
export class ReceitaTdmax {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  @Column({ name: 'data', type: 'date' })
  data!: string;

  /** U = util, S = sabado, D = domingo/feriado. */
  @Column({ name: 'tipo_dia', type: 'char', length: 1, nullable: true })
  tipoDia!: string | null;

  @Column({ name: 'pax_estacoes', type: 'int', default: 0 })
  paxEstacoes!: number;

  @Column({ name: 'receita_estacoes_cents', type: 'bigint', default: 0 })
  receitaEstacoesCents!: string;

  @Column({ name: 'pax_area2', type: 'int', default: 0 })
  paxArea2!: number;

  @Column({ name: 'receita_area2_cents', type: 'bigint', default: 0 })
  receitaArea2Cents!: string;

  @Column({ name: 'pax_total', type: 'int', default: 0 })
  paxTotal!: number;

  @Column({ name: 'receita_total_cents', type: 'bigint', default: 0 })
  receitaTotalCents!: string;

  @Column({ name: 'origem_sistema', type: 'varchar', length: 40, default: 'horarios-tdmax' })
  origemSistema!: string;

  @Column({ name: 'ultimo_sync_em', type: 'timestamptz', nullable: true })
  ultimoSyncEm!: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
