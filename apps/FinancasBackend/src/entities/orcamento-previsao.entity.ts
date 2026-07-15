import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * Previsao de orcamento — canonico do BASELINE historico (Fase 4). Fonte:
 * CPGORCPREVISOES do Globus. E o unico orcado que a Pioneira lancou no Globus
 * (2018-2020, empresa 4; parou em maio/2020). Serve de baseline/prova de conceito
 * e de ISCA pra o financeiro confirmar eixo e formato do orcamento atual (que nao
 * vive no Globus). Ver Leia/orcamento-mapeamento.md.
 *
 * Uma linha por CODINTORC. Valores em centavos (BIGINT). O service agrega por ano
 * e por centro de custo. `tipo` deriva de TIPORECEITA/TIPODESPESA (o Globus separa
 * receita de despesa por essas colunas; o valor mora em VALOR — VALORPREVISAO vem 0).
 */
@Entity({ schema: 'finance', name: 'orcamento_previsao' })
@Unique('orcamento_previsao_origem_uq', ['origemSistema', 'origemIdExterno'])
@Index('orcamento_previsao_ano_idx', ['empresaId', 'ano'])
export class OrcamentoPrevisao {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  /** CODIGOFL — filial. */
  @Column({ name: 'filial', type: 'int', nullable: true })
  filial!: number | null;

  /** DATAPREVISAO — data da previsao (granularidade diaria no Globus legado). */
  @Column({ name: 'data_previsao', type: 'date', nullable: true })
  dataPrevisao!: string | null;

  /** Ano derivado de DATAPREVISAO (facilita o agregado do baseline). */
  @Column({ name: 'ano', type: 'int', nullable: true })
  ano!: number | null;

  /** Primeiro dia do mes de DATAPREVISAO (para agregado mensal). */
  @Column({ name: 'competencia', type: 'date', nullable: true })
  competencia!: string | null;

  /** 'receita' | 'despesa' | 'indefinido' — derivado de TIPORECEITA/TIPODESPESA. */
  @Column({ name: 'tipo', type: 'varchar', length: 12, default: 'indefinido' })
  tipo!: string;

  @Column({ name: 'tipo_receita', type: 'int', nullable: true })
  tipoReceita!: number | null;

  @Column({ name: 'tipo_despesa', type: 'int', nullable: true })
  tipoDespesa!: number | null;

  /** CCUSTOFINANC — centro de custo financeiro (mesmo eixo do "setor" do CP). */
  @Column({ name: 'cod_custo_fin', type: 'int', nullable: true })
  codCustoFin!: number | null;

  /** Nome do centro de custo (CPGCUSTOS.DESCRICAO), quando existe. */
  @Column({ name: 'centro_custo_desc', type: 'varchar', length: 120, nullable: true })
  centroCustoDesc!: string | null;

  @Column({ name: 'valor_cents', type: 'bigint', default: 0 })
  valorCents!: string;

  @Column({ name: 'justificativa', type: 'text', nullable: true })
  justificativa!: string | null;

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
