import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type RemessaCnabStatus = 'gerado' | 'enviado' | 'processado';

@Entity({ schema: 'finance', name: 'remessas_cnab' })
@Index('remessas_cnab_banco_seq_idx', ['bancoCodigo', 'sequencial'])
export class RemessaCnab {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'banco_codigo', type: 'varchar', length: 3 })
  bancoCodigo!: string;

  @Column({ name: 'banco_nome', type: 'varchar', length: 100 })
  bancoNome!: string;

  @Column({ type: 'int' })
  sequencial!: number;

  @Column({ type: 'varchar', length: 10, default: 'CNAB240' })
  layout!: string;

  @Column({ name: 'arquivo_nome', type: 'varchar', length: 120 })
  arquivoNome!: string;

  @Column({ name: 'arquivo_conteudo', type: 'text' })
  arquivoConteudo!: string;

  @Column({ name: 'qtd_titulos', type: 'int' })
  qtdTitulos!: number;

  @Column({ name: 'valor_total_cents', type: 'bigint' })
  valorTotalCents!: string;

  @Column({ name: 'titulos_ids', type: 'uuid', array: true })
  titulosIds!: string[];

  @Column({ name: 'gerado_por_id', type: 'uuid', nullable: true })
  geradoPorId!: string | null;

  @CreateDateColumn({ name: 'gerado_em', type: 'timestamptz' })
  geradoEm!: Date;

  @Column({ type: 'varchar', length: 20, default: 'gerado' })
  status!: RemessaCnabStatus;

  @Column({ type: 'text', nullable: true })
  observacao!: string | null;

  @Column({ name: 'retorno_arquivo_nome', type: 'varchar', length: 120, nullable: true })
  retornoArquivoNome!: string | null;

  @Column({ name: 'retorno_processado_em', type: 'timestamptz', nullable: true })
  retornoProcessadoEm!: Date | null;
}
