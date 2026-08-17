import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ContaPagar } from './conta-pagar.entity.js';
import { BancoMovto } from './banco-movto.entity.js';

export type ReembolsoStatus = 'pendente' | 'cobrado' | 'recebido' | 'descartado';

/**
 * Reembolso / ressarcimento: valor que a empresa PAGOU (vira título no Contas a Pagar)
 * e tem a RECEBER de um terceiro — ex.: multa de trânsito do motorista, avaria, dano,
 * adiantamento. É o elo Contas a Pagar → Recebíveis: nasce de um `conta_pagar_id` e,
 * quando o devedor paga, pode ser amarrado ao crédito real do extrato (`banco_movto_id`)
 * pra rastreabilidade. Tabela PRÓPRIA (não é a `contas_receber`, que é sincronizada do
 * Globus e amarrada a Cliente — aqui o devedor é funcionário/terceiro).
 */
@Entity({ schema: 'finance', name: 'reembolso' })
@Index('reembolso_conta_pagar_idx', ['contaPagarId'])
@Index('reembolso_status_idx', ['status'])
export class Reembolso {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  @Column({ name: 'conta_pagar_id', type: 'uuid' })
  contaPagarId!: string;

  @ManyToOne(() => ContaPagar, { nullable: false })
  @JoinColumn({ name: 'conta_pagar_id' })
  contaPagar?: ContaPagar;

  /** Quem deve (funcionário / terceiro). Texto livre — não amarra na folha (v1). */
  @Column({ name: 'devedor_nome', type: 'varchar', length: 120, nullable: true })
  devedorNome!: string | null;

  @Column({ name: 'devedor_documento', type: 'varchar', length: 20, nullable: true })
  devedorDocumento!: string | null;

  @Column({ name: 'devedor_matricula', type: 'varchar', length: 30, nullable: true })
  devedorMatricula!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  motivo!: string | null;

  /** Valor a receber (default = valor a pagar do título; editável). Centavos. */
  @Column({ name: 'valor_cents', type: 'bigint', default: 0 })
  valorCents!: string;

  /** Valor efetivamente recebido na baixa. Centavos. */
  @Column({ name: 'recebido_cents', type: 'bigint', nullable: true })
  recebidoCents!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pendente' })
  status!: ReembolsoStatus;

  @Column({ name: 'data_prevista', type: 'date', nullable: true })
  dataPrevista!: string | null;

  @Column({ name: 'data_recebimento', type: 'date', nullable: true })
  dataRecebimento!: string | null;

  /** Crédito do extrato que comprova o recebimento (amarração opcional na baixa). */
  @Column({ name: 'banco_movto_id', type: 'uuid', nullable: true })
  bancoMovtoId!: string | null;

  @ManyToOne(() => BancoMovto, { nullable: true })
  @JoinColumn({ name: 'banco_movto_id' })
  bancoMovto?: BancoMovto | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  observacao!: string | null;

  @Column({ name: 'usuario_inclusao', type: 'uuid', nullable: true })
  usuarioInclusao!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;

  @Column({ name: 'excluido_em', type: 'timestamptz', nullable: true })
  excluidoEm!: Date | null;
}
