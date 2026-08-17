import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * Perguntas ao setor financeiro/contabilidade — a "caixa de decisões pendentes".
 *
 * Muitos itens do roadmap não dependem de código, e sim de uma DECISÃO ou de
 * apontar a FONTE do dado (regime tributário, política de retenção, códigos de
 * receita, onde vive o orçamento, etc.). Em vez de trocar isso por fora, a
 * pergunta vira um registro aqui: o financeiro responde na própria tela e a
 * resposta fica no banco (rastreável, com quem respondeu e quando).
 *
 * `chave` é um slug estável usado só para o seed ser idempotente.
 */
@Entity({ schema: 'finance', name: 'pergunta_financeiro' })
@Unique('pergunta_financeiro_chave_uq', ['chave'])
@Index('pergunta_financeiro_status_idx', ['status'])
@Index('pergunta_financeiro_modulo_idx', ['modulo'])
export class PerguntaFinanceiro {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  /** Slug estável (idempotência do seed); null para perguntas criadas na mão. */
  @Column({ name: 'chave', type: 'varchar', length: 80, nullable: true })
  chave!: string | null;

  /** href do módulo relacionado (ex.: '/tributos'); opcional. */
  @Column({ name: 'modulo', type: 'varchar', length: 60, nullable: true })
  modulo!: string | null;

  @Column({ name: 'modulo_nome', type: 'varchar', length: 80, nullable: true })
  moduloNome!: string | null;

  /** Agrupador (ex.: 'tributos-fase2'); opcional. */
  @Column({ name: 'categoria', type: 'varchar', length: 60, nullable: true })
  categoria!: string | null;

  @Column({ name: 'pergunta', type: 'text' })
  pergunta!: string;

  /** Por que estamos perguntando / o que a resposta destrava. */
  @Column({ name: 'contexto', type: 'text', nullable: true })
  contexto!: string | null;

  @Column({ name: 'resposta', type: 'text', nullable: true })
  resposta!: string | null;

  /** aberta | respondida | arquivada */
  @Column({ name: 'status', type: 'varchar', length: 20, default: 'aberta' })
  status!: string;

  @Column({ name: 'prioridade', type: 'int', default: 0 })
  prioridade!: number;

  @Column({ name: 'respondido_por', type: 'uuid', nullable: true })
  respondidoPor!: string | null;

  @Column({ name: 'respondido_por_nome', type: 'varchar', length: 120, nullable: true })
  respondidoPorNome!: string | null;

  @Column({ name: 'respondido_em', type: 'timestamptz', nullable: true })
  respondidoEm!: Date | null;

  @Column({ name: 'criado_por', type: 'uuid', nullable: true })
  criadoPor!: string | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
