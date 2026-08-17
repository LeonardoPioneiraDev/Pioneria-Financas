import { Column, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * Composicao da frota FISICA (contagem de veiculos ativos por garagem e tipo).
 * Snapshot agregado do FRT_CADVEICULOS do Globus — NAO e o razao contabil.
 *
 * Usado como CONTEXTO na tela de Depreciacao ("quantos veiculos"), separado do
 * valor contabil (que vem do CTBSALDO). Uma linha por (empresa, garagem, tipo).
 * Refrescado por inteiro a cada sync (delete + insert) — e um agregado pequeno.
 */
@Entity({ schema: 'finance', name: 'frota_composicao' })
@Unique('frota_composicao_uq', ['empresaId', 'garagemCodigo', 'tipoFrota'])
export class FrotaComposicao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  /** Codigo da garagem (FRT_CADVEICULOS.CODIGOGA). */
  @Column({ name: 'garagem_codigo', type: 'int' })
  garagemCodigo!: number;

  /** Nome amigavel da garagem (resolvido no ETL). */
  @Column({ name: 'garagem_nome', type: 'varchar', length: 40 })
  garagemNome!: string;

  /** Descricao do tipo de frota (FRT_TIPODEFROTA.DESCRICAOTPFROTA). */
  @Column({ name: 'tipo_frota', type: 'varchar', length: 60 })
  tipoFrota!: string;

  /** true = onibus; false = veiculo de apoio/auxiliar. */
  @Column({ name: 'eh_onibus', type: 'boolean', default: true })
  ehOnibus!: boolean;

  /** Quantidade de veiculos ATIVOS nesse (garagem, tipo). */
  @Column({ name: 'qtd', type: 'int' })
  qtd!: number;

  @UpdateDateColumn({ name: 'ultimo_sync_em', type: 'timestamptz' })
  ultimoSyncEm!: Date;
}
