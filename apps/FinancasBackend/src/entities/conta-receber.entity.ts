import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { Cliente } from './cliente.entity.js';

export type ContaReceberStatus = 'aberto' | 'pago' | 'cancelado' | 'renegociado' | 'protestado';

@Entity({ schema: 'finance', name: 'contas_receber' })
@Unique('contas_receber_origem_uq', ['origemSistema', 'origemIdExterno'])
@Index('contas_receber_vencimento_idx', ['dataVencimento', 'status'])
@Index('contas_receber_cliente_idx', ['clienteId', 'dataVencimento'])
export class ContaReceber {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  @Column({ name: 'cliente_id', type: 'uuid', nullable: true })
  clienteId!: string | null;

  @ManyToOne(() => Cliente, { nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Cliente;

  @Column({ name: 'numero_documento', type: 'varchar', length: 40, nullable: true })
  numeroDocumento!: string | null;

  @Column({ name: 'serie_documento', type: 'varchar', length: 10, nullable: true })
  serieDocumento!: string | null;

  @Column({ name: 'numero_parcela', type: 'int', nullable: true })
  numeroParcela!: number | null;

  @Column({ name: 'tipo_documento', type: 'varchar', length: 10, nullable: true })
  tipoDocumento!: string | null;

  @Column({ name: 'data_emissao', type: 'date', nullable: true })
  dataEmissao!: string | null;

  @Column({ name: 'data_saida', type: 'date', nullable: true })
  dataSaida!: string | null;

  @Column({ name: 'data_vencimento', type: 'date' })
  dataVencimento!: string;

  @Column({ name: 'data_vencimento_original', type: 'date', nullable: true })
  dataVencimentoOriginal!: string | null;

  @Column({ name: 'data_recebimento', type: 'date', nullable: true })
  dataRecebimento!: string | null;

  @Column({ name: 'valor_bruto_cents', type: 'bigint', default: 0 })
  valorBrutoCents!: string;

  @Column({ name: 'desconto_cents', type: 'bigint', default: 0 })
  descontoCents!: string;

  @Column({ name: 'acrescimo_cents', type: 'bigint', default: 0 })
  acrescimoCents!: string;

  @Column({ name: 'vlr_inss_cents', type: 'bigint', default: 0 })
  vlrInssCents!: string;

  @Column({ name: 'vlr_irrf_cents', type: 'bigint', default: 0 })
  vlrIrrfCents!: string;

  @Column({ name: 'vlr_pis_cents', type: 'bigint', default: 0 })
  vlrPisCents!: string;

  @Column({ name: 'vlr_cofins_cents', type: 'bigint', default: 0 })
  vlrCofinsCents!: string;

  @Column({ name: 'vlr_csll_cents', type: 'bigint', default: 0 })
  vlrCsllCents!: string;

  @Column({ name: 'vlr_iss_cents', type: 'bigint', default: 0 })
  vlrIssCents!: string;

  @Column({ type: 'varchar', length: 20, default: 'aberto' })
  status!: ContaReceberStatus;

  @Column({ type: 'boolean', default: false })
  quitado!: boolean;

  @Column({ type: 'boolean', default: false })
  renegociado!: boolean;

  @Column({ type: 'boolean', default: false })
  protestado!: boolean;

  @Column({ name: 'data_protesto', type: 'date', nullable: true })
  dataProtesto!: string | null;

  @Column({ name: 'banco_cobranca', type: 'varchar', length: 20, nullable: true })
  bancoCobranca!: string | null;

  @Column({ name: 'agencia_cobranca', type: 'varchar', length: 20, nullable: true })
  agenciaCobranca!: string | null;

  @Column({ name: 'conta_cobranca', type: 'varchar', length: 30, nullable: true })
  contaCobranca!: string | null;

  @Column({ name: 'nosso_numero', type: 'varchar', length: 40, nullable: true })
  nossoNumero!: string | null;

  @Column({ name: 'cobeletronica_status', type: 'varchar', length: 4, nullable: true })
  cobeletronicaStatus!: string | null;

  @Column({ name: 'msg_boleto', type: 'varchar', length: 500, nullable: true })
  msgBoleto!: string | null;

  @Column({ name: 'fatura_impressa', type: 'boolean', default: false })
  faturaImpressa!: boolean;

  @Column({ name: 'cartao_autorizacao', type: 'varchar', length: 20, nullable: true })
  cartaoAutorizacao!: string | null;

  @Column({ name: 'cartao_tid', type: 'varchar', length: 60, nullable: true })
  cartaoTid!: string | null;

  @Column({ name: 'cartao_parcelas', type: 'int', nullable: true })
  cartaoParcelas!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  observacao!: string | null;

  @Column({ name: 'usuario_inclusao', type: 'varchar', length: 40, nullable: true })
  usuarioInclusao!: string | null;

  @Column({ name: 'sistema_origem_praxio', type: 'varchar', length: 20, nullable: true })
  sistemaOrigemPraxio!: string | null;

  @Column({ name: 'origem_sistema', type: 'varchar', length: 40, default: 'globus' })
  origemSistema!: string;

  @Column({ name: 'origem_id_externo', type: 'varchar', length: 80 })
  origemIdExterno!: string;

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
