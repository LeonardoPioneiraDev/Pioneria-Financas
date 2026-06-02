import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Telemetria de cada query executada contra o Oracle (Globus).
 *
 * Persistencia assincrona: o plugin `oracle.execute()` chama um logger que
 * grava na transacao do prox commit (best effort, nao bloqueia a query).
 *
 * Retencao: 30 dias (limpeza por cron — fora do escopo da migration inicial).
 */
@Entity({ schema: 'integration', name: 'oracle_query_logs' })
@Index('oracle_query_logs_query_data_idx', ['queryName', 'criadoEm'])
export class OracleQueryLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'sync_job_id', type: 'uuid', nullable: true })
  syncJobId!: string | null;

  /** Nome logico da query (ex: 'contasAPagar', 'fichaEventos'). */
  @Column({ name: 'query_name', type: 'varchar', length: 60 })
  queryName!: string;

  /** SHA-256 hex do SQL final (apos expandirPlaceholders). Permite agrupar. */
  @Column({ name: 'sql_hash', type: 'char', length: 64 })
  sqlHash!: string;

  @Column({ name: 'duracao_ms', type: 'int' })
  duracaoMs!: number;

  /** Numero de linhas retornadas. NULL quando houve erro. */
  @Column({ type: 'int', nullable: true })
  linhas!: number | null;

  /** Mensagem de erro se a query falhou. NULL quando sucesso. */
  @Column({ name: 'erro_mensagem', type: 'text', nullable: true })
  erroMensagem!: string | null;

  @Column({ name: 'binds_count', type: 'int', default: 0 })
  bindsCount!: number;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
