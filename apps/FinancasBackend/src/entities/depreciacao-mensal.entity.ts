import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * Depreciacao contabil por classe de ativo e competencia — canonico do modulo
 * Depreciacao (Fase 3, opcao "leitor por classe").
 *
 * Uma linha por (empresa, competencia, conta contabil). Fonte: CTBSALDO do Globus
 * (o saldo mensal do razao), NAO o modulo de ativo fixo (que a Pioneira nao usa).
 *
 * `grupo` separa despesa x base patrimonial; `classe` normaliza a sub-conta
 * (frota_operacional, veiculos_auxiliares, instalacoes, ...). Valores em centavos.
 *   - Para grupo 'despesa': valor_cents = debito - credito (despesa do mes).
 *   - Para base ('imobilizado_bruto'/'direito_uso'): saldo acumulado = soma
 *     historica de (debito - credito).
 *   - Para 'deprec_acumulada' (conta redutora, credora): saldo = soma de
 *     (credito - debito), positivo. O service faz o acumulado.
 */
@Entity({ schema: 'finance', name: 'depreciacao_mensal' })
@Unique('depreciacao_mensal_origem_uq', ['origemSistema', 'origemIdExterno'])
@Index('depreciacao_mensal_comp_idx', ['empresaId', 'competencia'])
@Index('depreciacao_mensal_grupo_idx', ['grupo', 'classe'])
export class DepreciacaoMensal {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  /** Primeiro dia do mes da competencia (derivado do PERIODOSALDO AAAAMM). */
  @Column({ name: 'competencia', type: 'date' })
  competencia!: string;

  /** PERIODOSALDO original (AAAAMM). */
  @Column({ name: 'periodo', type: 'char', length: 6 })
  periodo!: string;

  @Column({ name: 'nro_plano', type: 'int' })
  nroPlano!: number;

  @Column({ name: 'cod_conta_ctb', type: 'int' })
  codContaCtb!: number;

  @Column({ name: 'classificador', type: 'varchar', length: 30 })
  classificador!: string;

  @Column({ name: 'nome_conta', type: 'varchar', length: 120, nullable: true })
  nomeConta!: string | null;

  /** despesa | imobilizado_bruto | direito_uso | deprec_acumulada */
  @Column({ name: 'grupo', type: 'varchar', length: 24 })
  grupo!: string;

  /** frota_operacional | caminhoes | veiculos_auxiliares | computadores | instalacoes | maquinas_oficina | maquinas_escritorio | moveis | imoveis | outros */
  @Column({ name: 'classe', type: 'varchar', length: 40 })
  classe!: string;

  @Column({ name: 'debito_cents', type: 'bigint' })
  debitoCents!: string;

  @Column({ name: 'credito_cents', type: 'bigint' })
  creditoCents!: string;

  /** Valor "com sinal do grupo" em centavos (despesa: deb-cred; base: deb-cred; acumulada: cred-deb). */
  @Column({ name: 'valor_cents', type: 'bigint' })
  valorCents!: string;

  @Column({ name: 'origem_sistema', type: 'varchar', length: 40, default: 'globus' })
  origemSistema!: string;

  @Column({ name: 'origem_id_externo', type: 'varchar', length: 60 })
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
