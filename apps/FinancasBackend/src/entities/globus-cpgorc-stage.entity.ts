import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Snapshot raw do CPGORCPREVISOES (previsoes de orcamento) do Globus. Alimenta o
 * BASELINE historico do modulo Orcamento (o unico orcado que existe no Globus:
 * 2018-2020, empresa 4; parou em maio/2020 — motivo a confirmar com o financeiro).
 *
 * O subsistema documentado (CPG_CAD_ORCAMENTO_*) esta VAZIO — o dado vive aqui.
 * Ver Leia/orcamento-mapeamento.md (rodadas 1 e 2 de 2026-07-03).
 *
 * Chave natural: empresa + codigo interno da previsao (CODINTORC).
 */
@Entity({ schema: 'integration', name: 'globus_cpgorc_stage' })
@Unique('globus_cpgorc_stage_uq', ['codigoEmpresa', 'codIntOrc'])
@Index('globus_cpgorc_stage_proc_idx', ['processadoEm'])
export class GlobusCpgorcStage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'codigo_empresa', type: 'int' })
  codigoEmpresa!: number;

  /** CODINTORC — codigo interno da previsao no Globus (chave da linha). */
  @Column({ name: 'cod_int_orc', type: 'bigint' })
  codIntOrc!: string;

  @Column({ name: 'sync_job_id', type: 'uuid', nullable: true })
  syncJobId!: string | null;

  @Column({ name: 'raw_payload', type: 'jsonb' })
  rawPayload!: Record<string, unknown>;

  @Column({ name: 'hash_payload', type: 'char', length: 64, nullable: true })
  hashPayload!: string | null;

  @CreateDateColumn({ name: 'recebido_em', type: 'timestamptz' })
  recebidoEm!: Date;

  @Column({ name: 'processado_em', type: 'timestamptz', nullable: true })
  processadoEm!: Date | null;

  @Column({ name: 'excluido_em', type: 'timestamptz', nullable: true })
  excluidoEm!: Date | null;

  @Column({ name: 'excluido_motivo', type: 'varchar', length: 60, nullable: true })
  excluidoMotivo!: string | null;
}
