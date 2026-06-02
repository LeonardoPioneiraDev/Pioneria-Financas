import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * Cadastro de contas bancarias da Pioneira (canonico).
 *
 * Sincronizado do Globus BCOCONTA via integration.globus_bcoconta_stage.
 * Filtros aplicados: empresa=4, COMPOEPOSICAOFINANCEIRA='S', INATIVA='N',
 * DTLIMITEMOVTO > '1950-01-01'.
 *
 * **Ancora de saldo:** Globus tem `SALDO_ACM_ATE_DATA` mas a coluna NAO e
 * mantida (zerada com data sentinela em quase todas as contas). Por isso o
 * tesoureiro preenche manualmente `saldo_acm_cents` + `data_saldo_acm` quando
 * confere o saldo real no banco. A partir dai, o saldo dia-a-dia e calculado
 * somando BCOMOVTO desde `data_saldo_acm + 1` ate a data alvo.
 *
 * **Flag `eh_principal`:** marcado pelo ETL pra contas operacionalmente
 * relevantes (BRB Bilhetagem, Santander, Safra, XP, Sicoob ASA SUL, BB).
 * As demais ficam visiveis mas em segundo plano.
 */
@Entity({ schema: 'finance', name: 'banco_conta' })
@Unique('banco_conta_origem_uq', ['origemSistema', 'origemIdExterno'])
@Unique('banco_conta_chave_uq', ['codBanco', 'codAgencia', 'codContaBco'])
@Index('banco_conta_principal_idx', ['ehPrincipal'])
export class BancoConta {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  @Column({ name: 'codigo_fl', type: 'int' })
  codigoFl!: number;

  // ----- Identificacao Globus -----
  @Column({ name: 'cod_banco', type: 'int' })
  codBanco!: number;

  @Column({ name: 'cod_agencia', type: 'int' })
  codAgencia!: number;

  @Column({ name: 'cod_conta_bco', type: 'varchar', length: 15 })
  codContaBco!: string;

  @Column({ name: 'digito', type: 'varchar', length: 2, nullable: true })
  digito!: string | null;

  // ----- Display -----
  /** Nome vindo do Globus (NOMECONTABCO). Read-only do nosso lado. */
  @Column({ name: 'nome_conta_bco', type: 'varchar', length: 80 })
  nomeContaBco!: string;

  /** Nome amigavel editavel pelo usuario (opcional). Default = nome_conta_bco. */
  @Column({ name: 'nome_amigavel', type: 'varchar', length: 80, nullable: true })
  nomeAmigavel!: string | null;

  // ----- Tipo / classificacao -----
  @Column({ name: 'conta_caixa', type: 'boolean', default: false })
  contaCaixa!: boolean;

  /** Flag nossa: marca contas operacionalmente relevantes. */
  @Column({ name: 'eh_principal', type: 'boolean', default: false })
  ehPrincipal!: boolean;

  // ----- Ancora de saldo (preenchida pelo tesoureiro) -----
  @Column({ name: 'saldo_acm_cents', type: 'bigint', nullable: true })
  saldoAcmCents!: string | null;

  @Column({ name: 'data_saldo_acm', type: 'date', nullable: true })
  dataSaldoAcm!: string | null;

  @Column({ name: 'saldo_acm_atualizado_por_usuario_id', type: 'uuid', nullable: true })
  saldoAcmAtualizadoPorUsuarioId!: string | null;

  @Column({ name: 'saldo_acm_atualizado_em', type: 'timestamptz', nullable: true })
  saldoAcmAtualizadoEm!: Date | null;

  // ----- Referencia Globus (snapshot — nao usar pra calculo de saldo!) -----
  @Column({ name: 'saldo_inicial_globus_cents', type: 'bigint', nullable: true })
  saldoInicialGlobusCents!: string | null;

  @Column({ name: 'saldo_acm_globus_cents', type: 'bigint', nullable: true })
  saldoAcmGlobusCents!: string | null;

  @Column({ name: 'data_saldo_acm_globus', type: 'date', nullable: true })
  dataSaldoAcmGlobus!: string | null;

  @Column({ name: 'dt_limite_movto_globus', type: 'date', nullable: true })
  dtLimiteMovtoGlobus!: string | null;

  // ----- Outros campos uteis -----
  @Column({ name: 'limite_credito_cents', type: 'bigint', nullable: true })
  limiteCreditoCents!: string | null;

  @Column({ name: 'chave_pix', type: 'varchar', length: 80, nullable: true })
  chavePix!: string | null;

  @Column({ name: 'tipo_chave_pix', type: 'int', nullable: true })
  tipoChavePix!: number | null;

  @Column({ name: 'cod_conta_ctb', type: 'int', nullable: true })
  codContaCtb!: number | null;

  @Column({ name: 'cod_custo', type: 'int', nullable: true })
  codCusto!: number | null;

  // ----- Auditoria -----
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
