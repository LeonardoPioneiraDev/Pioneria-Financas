import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * Extrato bancario consolidado da Pioneira.
 *
 * `eh_repasse_brb` e a flag-chave do modulo Recebiveis GDF: marca movimentos
 * que sao repasse da BRB Mobilidade pra calculo de glosa.
 *
 * Heuristica de classificacao (aplicada no ETL):
 *   CODHISTOBCO = 908 (RECEBIMENTO ARR/CRC/BCO)
 *   AND CODBANCO = 70 (BRB)
 *   AND CODAGENCIA = 51
 *   AND CODCONTABCO = '108'
 */
@Entity({ schema: 'finance', name: 'banco_movto' })
@Unique('banco_movto_origem_uq', ['origemSistema', 'origemIdExterno'])
@Index('banco_movto_data_idx', ['dataMovto'])
@Index('banco_movto_brb_idx', ['dataMovto', 'valorCents'])
@Index('banco_movto_conta_idx', ['codBanco', 'codAgencia', 'codContaBco', 'dataMovto'])
export class BancoMovto {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  @Column({ name: 'codigo_fl', type: 'int' })
  codigoFl!: number;

  @Column({ name: 'cod_movto_bco', type: 'bigint' })
  codMovtoBco!: string;

  @Column({ name: 'cod_banco', type: 'int' })
  codBanco!: number;

  @Column({ name: 'cod_agencia', type: 'int' })
  codAgencia!: number;

  @Column({ name: 'cod_conta_bco', type: 'varchar', length: 15 })
  codContaBco!: string;

  @Column({ name: 'data_movto', type: 'date' })
  dataMovto!: string;

  @Column({ name: 'data_efetiva', type: 'date', nullable: true })
  dataEfetiva!: string | null;

  @Column({ name: 'data_credito', type: 'date', nullable: true })
  dataCredito!: string | null;

  @Column({ name: 'valor_cents', type: 'bigint' })
  valorCents!: string;

  @Column({ name: 'cod_histo_bco', type: 'int', nullable: true })
  codHistoBco!: number | null;

  @Column({ name: 'desc_histo_bco', type: 'varchar', length: 80, nullable: true })
  descHistoBco!: string | null;

  @Column({ name: 'hist_movto_bco', type: 'varchar', length: 2000, nullable: true })
  histMovtoBco!: string | null;

  @Column({ name: 'doc_movto_bco', type: 'varchar', length: 20, nullable: true })
  docMovtoBco!: string | null;

  @Column({ name: 'debito_credito', type: 'char', length: 1, nullable: true })
  debitoCredito!: string | null;

  @Column({ type: 'boolean', default: false })
  confirmado!: boolean;

  @Column({ type: 'boolean', default: false })
  conciliado!: boolean;

  @Column({ name: 'status_movto', type: 'char', length: 1, nullable: true })
  statusMovto!: string | null;

  @Column({ name: 'cod_tp_despesa', type: 'varchar', length: 5, nullable: true })
  codTpDespesa!: string | null;

  @Column({ name: 'cod_tp_receita', type: 'varchar', length: 5, nullable: true })
  codTpReceita!: string | null;

  @Column({ name: 'cod_custo', type: 'int', nullable: true })
  codCusto!: number | null;

  /**
   * Flag-chave: indica se este movimento e repasse da BRB Mobilidade.
   * Calculada no ETL com a heuristica validada.
   */
  @Column({ name: 'eh_repasse_brb', type: 'boolean', default: false })
  ehRepasseBrb!: boolean;

  @Column({ name: 'origem_sistema', type: 'varchar', length: 40, default: 'globus' })
  origemSistema!: string;

  @Column({ name: 'origem_id_externo', type: 'varchar', length: 40 })
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
