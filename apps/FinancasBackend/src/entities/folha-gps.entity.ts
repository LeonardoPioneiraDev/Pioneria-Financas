import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * GPS/INSS da folha por competencia e filial — canonico do painel "Tributos da
 * folha". Fonte: FLP_GPS_INTEGRACPG do Globus (o INSS patronal que o proprio
 * Globus calcula, com e sem desoneracao).
 *
 * Uma linha por (empresa, competencia, tipo de folha, filial, identificador).
 * O service SOMA por competencia. Valores em centavos (BIGINT).
 *
 *  - `patronalComDesonCents` = INSSEMPRESA_COMDESON: o patronal REAL sob a
 *    desoneracao vigente (CPRB, Lei 14.973/2024) — e o que a empresa recolhe.
 *  - `patronalSemDesonCents` = INSSEMPRESA_SEMDESON: quanto seria SEM desoneracao
 *    (20% da base) — usado so como comparacao.
 *  - `retidoCents` costuma vir NULL nesta tabela (o retido do funcionario vem da
 *    ficha_evento); guardado por completude.
 */
@Entity({ schema: 'finance', name: 'folha_gps' })
@Unique('folha_gps_origem_uq', ['origemSistema', 'origemIdExterno'])
@Index('folha_gps_comp_idx', ['empresaId', 'competencia', 'tipoFolha'])
export class FolhaGps {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  /** Primeiro dia do mes da competencia (derivado do PERIODO AAAAMM). */
  @Column({ name: 'competencia', type: 'date' })
  competencia!: string;

  /** PERIODO original (AAAAMM). */
  @Column({ name: 'periodo', type: 'char', length: 6 })
  periodo!: string;

  @Column({ name: 'tipo_folha', type: 'int' })
  tipoFolha!: number;

  /** CODIGOFL — filial. */
  @Column({ name: 'filial', type: 'int' })
  filial!: number;

  @Column({ name: 'cod_ident', type: 'int', default: 0 })
  codIdent!: number;

  @Column({ name: 'tipo_ident', type: 'varchar', length: 4, nullable: true })
  tipoIdent!: string | null;

  @Column({ name: 'retido_cents', type: 'bigint', default: 0 })
  retidoCents!: string;

  @Column({ name: 'base_contrib_cents', type: 'bigint', default: 0 })
  baseContribCents!: string;

  @Column({ name: 'patronal_com_deson_cents', type: 'bigint', default: 0 })
  patronalComDesonCents!: string;

  @Column({ name: 'patronal_sem_deson_cents', type: 'bigint', default: 0 })
  patronalSemDesonCents!: string;

  @Column({ name: 'valor_cents', type: 'bigint', default: 0 })
  valorCents!: string;

  /** CODDOCTOCPG — liga na guia lancada no Contas a Pagar (quando integrada). */
  @Column({ name: 'cod_docto_cpg', type: 'bigint', nullable: true })
  codDoctoCpg!: string | null;

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
