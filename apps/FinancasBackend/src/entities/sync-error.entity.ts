import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Fase do pipeline em que o erro aconteceu. */
export type SyncErrorFase = 'oracle_query' | 'stage_insert' | 'etl_processamento' | 'finance_propagacao';

/**
 * Dead Letter Queue da integracao Globus. Cada falha de adapter/ETL vira
 * uma linha aqui — navegavel na UI admin e reprocessavel.
 *
 * Resolucao automatica: o proximo sync bem-sucedido do mesmo recurso para a
 * mesma chave natural marca `resolvido_em=NOW(), resolvido_por='automatico'`.
 * Resolucao manual: endpoint admin marca com usuario_id.
 */
@Entity({ schema: 'integration', name: 'sync_errors' })
@Index('sync_errors_pendentes_idx', ['sistema', 'recurso', 'criadoEm'])
export class SyncError {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'sync_job_id', type: 'uuid', nullable: true })
  syncJobId!: string | null;

  @Column({ type: 'varchar', length: 40 })
  sistema!: string;

  @Column({ type: 'varchar', length: 60 })
  recurso!: string;

  @Column({ type: 'varchar', length: 20 })
  fase!: SyncErrorFase;

  /** Chave natural do registro problematico — ex: {cod_docto_cpg: '123', codigo_empresa: 4}. */
  @Column({ name: 'chave_natural', type: 'jsonb', nullable: true })
  chaveNatural!: Record<string, unknown> | null;

  /** Payload raw que causou o erro (se disponivel — pode ser null pra erros de Oracle). */
  @Column({ name: 'raw_payload', type: 'jsonb', nullable: true })
  rawPayload!: Record<string, unknown> | null;

  @Column({ name: 'erro_mensagem', type: 'text' })
  erroMensagem!: string;

  @Column({ name: 'erro_codigo', type: 'varchar', length: 40, nullable: true })
  erroCodigo!: string | null;

  /** Stack truncado para debug (200 linhas no maximo). */
  @Column({ name: 'erro_stack', type: 'text', nullable: true })
  erroStack!: string | null;

  @Column({ type: 'int', default: 1 })
  tentativas!: number;

  @Column({ name: 'reprocessar_em', type: 'timestamptz', nullable: true })
  reprocessarEm!: Date | null;

  @Column({ name: 'resolvido_em', type: 'timestamptz', nullable: true })
  resolvidoEm!: Date | null;

  /** 'automatico' quando o proximo sync resolve, ou usuario_id quando manual. */
  @Column({ name: 'resolvido_por', type: 'varchar', length: 60, nullable: true })
  resolvidoPor!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
