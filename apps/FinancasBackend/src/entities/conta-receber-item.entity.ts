import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { ContaReceber } from './conta-receber.entity.js';

@Entity({ schema: 'finance', name: 'contas_receber_itens' })
@Unique('cr_itens_origem_uq', ['contaReceberId', 'origemIdExterno'])
@Index('cr_itens_tp_idx', ['codTpReceita'])
export class ContaReceberItem {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'conta_receber_id', type: 'uuid' })
  contaReceberId!: string;

  @ManyToOne(() => ContaReceber, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conta_receber_id' })
  contaReceber?: ContaReceber;

  @Column({ name: 'cod_tp_receita', type: 'varchar', length: 20, nullable: true })
  codTpReceita!: string | null;

  @Column({ name: 'conta_contabil', type: 'varchar', length: 40, nullable: true })
  contaContabil!: string | null;

  @Column({ name: 'centro_custo', type: 'varchar', length: 40, nullable: true })
  centroCusto!: string | null;

  @Column({ name: 'centro_custo_fin', type: 'varchar', length: 40, nullable: true })
  centroCustoFin!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  observacao!: string | null;

  @Column({ name: 'valor_cents', type: 'bigint' })
  valorCents!: string;

  @Column({ name: 'item_rateado', type: 'boolean', default: false })
  itemRateado!: boolean;

  @Column({ name: 'origem_id_externo', type: 'varchar', length: 80 })
  origemIdExterno!: string;
}
