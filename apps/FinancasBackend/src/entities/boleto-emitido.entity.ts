import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ContaReceber } from './conta-receber.entity.js';

export type BoletoTipo = 'boleto' | 'pix';
export type BoletoStatus = 'emitido' | 'registrado' | 'pago' | 'cancelado';
export type BoletoModo = 'mock' | 'real';

@Entity({ schema: 'finance', name: 'boletos_emitidos' })
@Index('boletos_emitidos_cr_idx', ['contaReceberId', 'emitidoEm'])
export class BoletoEmitido {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conta_receber_id', type: 'uuid' })
  contaReceberId!: string;

  @ManyToOne(() => ContaReceber)
  @JoinColumn({ name: 'conta_receber_id' })
  contaReceber?: ContaReceber;

  @Column({ type: 'varchar', length: 10 })
  tipo!: BoletoTipo;

  @Column({ name: 'banco_codigo', type: 'varchar', length: 3, nullable: true })
  bancoCodigo!: string | null;

  @Column({ name: 'banco_nome', type: 'varchar', length: 100, nullable: true })
  bancoNome!: string | null;

  @Column({ name: 'nosso_numero', type: 'varchar', length: 40, nullable: true })
  nossoNumero!: string | null;

  @Column({ name: 'linha_digitavel', type: 'varchar', length: 60, nullable: true })
  linhaDigitavel!: string | null;

  @Column({ name: 'codigo_barras', type: 'varchar', length: 60, nullable: true })
  codigoBarras!: string | null;

  @Column({ name: 'qr_code_pix', type: 'text', nullable: true })
  qrCodePix!: string | null;

  @Column({ name: 'txid_pix', type: 'varchar', length: 40, nullable: true })
  txidPix!: string | null;

  @Column({ type: 'date' })
  vencimento!: string;

  @Column({ name: 'valor_cents', type: 'bigint' })
  valorCents!: string;

  @Column({ type: 'varchar', length: 20, default: 'emitido' })
  status!: BoletoStatus;

  @Column({ type: 'varchar', length: 20, default: 'mock' })
  modo!: BoletoModo;

  @Column({ name: 'emitido_por_id', type: 'uuid', nullable: true })
  emitidoPorId!: string | null;

  @CreateDateColumn({ name: 'emitido_em', type: 'timestamptz' })
  emitidoEm!: Date;

  @Column({ name: 'pago_em', type: 'timestamptz', nullable: true })
  pagoEm!: Date | null;

  @Column({ name: 'cancelado_em', type: 'timestamptz', nullable: true })
  canceladoEm!: Date | null;

  @Column({ type: 'text', nullable: true })
  observacao!: string | null;
}
