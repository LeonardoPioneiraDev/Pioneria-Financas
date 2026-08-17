import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type AcaoAuditoria =
  | 'visualizou'
  | 'imprimiu'
  | 'exportou'
  | 'filtrou'
  | 'editou'
  | 'aprovou'
  | 'rejeitou'
  | 'sincronizou';

@Entity({ schema: 'audit', name: 'acesso_dados' })
@Index('acesso_dados_usuario_idx', ['usuarioId', 'criadoEm'])
@Index('acesso_dados_recurso_idx', ['recurso', 'acao', 'criadoEm'])
export class AcessoDados {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId!: string;

  /** Acao executada: visualizou, imprimiu, exportou, filtrou, editou, etc. */
  @Column({ type: 'varchar', length: 40 })
  acao!: AcaoAuditoria;

  /** Recurso acessado: folha, folha-detalhe, contas-pagar, contra-cheque, ... */
  @Column({ type: 'varchar', length: 80 })
  recurso!: string;

  /** ID especifico quando aplicavel (ex: codFunc do contra-cheque acessado). */
  @Column({ name: 'recurso_id', type: 'varchar', length: 100, nullable: true })
  recursoId!: string | null;

  /** Descricao curta legivel para o trilha de auditoria. */
  @Column({ type: 'varchar', length: 500, nullable: true })
  descricao!: string | null;

  /** Filtros / parametros usados no momento do acesso. */
  @Column({ type: 'jsonb', nullable: true })
  filtros!: Record<string, unknown> | null;

  /**
   * Diff campo-a-campo (so nas acoes de alteracao). Guarda APENAS os campos que
   * mudaram: `valoresAntes` = valor anterior por campo, `valoresDepois` = novo.
   * Null quando a acao nao e uma alteracao (ex.: visualizou/exportou).
   */
  @Column({ name: 'valores_antes', type: 'jsonb', nullable: true })
  valoresAntes!: Record<string, unknown> | null;

  @Column({ name: 'valores_depois', type: 'jsonb', nullable: true })
  valoresDepois!: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 500, nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
