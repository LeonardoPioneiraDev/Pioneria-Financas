import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { RecebivelGdfRelatorio } from './recebivel-gdf-relatorio.entity.js';

/**
 * Fato granular do Movimento Resgatado:
 *
 *   1 linha = 1 celula da matriz (relatorio × data_transporte × tipo_pagamento)
 *
 * Exemplo de leitura: "no relatorio do dia 19/05, vieram R$ 64.269,40 de
 * 16.913 creditos categoria CIDADAO Metropol 1 (Integ) cuja viagem original
 * foi no dia 18/05".
 *
 * `data_resgate` = redundancia com relatorio.data_resgate, mantido pra
 * facilitar GROUP BY sem JOIN. `eh_pagante` = STORED column da familia.
 */
@Entity({ schema: 'finance', name: 'recebivel_gdf_celula' })
@Index('recebivel_gdf_celula_data_transp_idx', ['dataTransporte', 'familia'])
@Index('recebivel_gdf_celula_data_resgate_idx', ['dataResgate', 'familia'])
@Index('recebivel_gdf_celula_familia_idx', ['familia', 'dataTransporte'])
export class RecebivelGdfCelula {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'relatorio_id', type: 'uuid' })
  relatorioId!: string;

  @ManyToOne(() => RecebivelGdfRelatorio, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'relatorio_id' })
  relatorio?: RecebivelGdfRelatorio;

  @Column({ name: 'data_resgate', type: 'date' })
  dataResgate!: string;

  @Column({ name: 'data_transporte', type: 'date' })
  dataTransporte!: string;

  @Column({ type: 'varchar', length: 20 })
  familia!: string;

  @Column({ name: 'tipo_pagamento', type: 'varchar', length: 60 })
  tipoPagamento!: string;

  /** Tarifa em centavos (ex: 380 = R$ 3,80). 0 para gratuidades. */
  @Column({ name: 'tarifa_cents', type: 'int', default: 0 })
  tarifaCents!: number;

  @Column({ name: 'valor_cents', type: 'bigint', default: 0 })
  valorCents!: string;

  @Column({ type: 'int', default: 0 })
  creditos!: number;

  /** Derivado da familia (CIDADAO, VT, EMV, QRCODE, PAGANTE, DIALIVRE = true; resto = false). */
  @Column({ name: 'eh_pagante', type: 'boolean' })
  ehPagante!: boolean;

  /**
   * Chave natural: `{relatorio_id}|{data_transporte}|{tipo_pagamento}|{tarifa}`.
   * Permite upsert idempotente — se o relatorio for re-processado, atualiza
   * a celula correspondente sem duplicar.
   */
  @Column({ name: 'origem_id_externo', type: 'varchar', length: 200, unique: true })
  origemIdExterno!: string;

  @Column({ name: 'hash_payload', type: 'char', length: 64, nullable: true })
  hashPayload!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;

  @Column({ name: 'excluido_em', type: 'timestamptz', nullable: true })
  excluidoEm!: Date | null;

  @Column({ name: 'excluido_motivo', type: 'varchar', length: 60, nullable: true })
  excluidoMotivo!: string | null;
}
