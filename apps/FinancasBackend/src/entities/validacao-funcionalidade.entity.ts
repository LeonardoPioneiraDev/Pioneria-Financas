import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { ValidacaoStatus, ValidacaoTipo } from '@pioneira/shared';

/**
 * Trilha de conferência das funcionalidades — APPEND-ONLY.
 *
 * Cada clique do usuário vira uma linha: o auditor validando a tela, o auditor
 * apontando problema (com observações), o CFO dando o aval. O estado atual de
 * uma funcionalidade é o ÚLTIMO registro por (usuário, funcionalidade, tipo).
 *
 * O espelho do estado (`identity.usuarios.funcionalidades_validadas`) continua
 * existindo porque o menu e o grant de API dependem dele — os dois são gravados
 * na mesma operação.
 */
@Entity({ schema: 'audit', name: 'validacao_funcionalidade' })
@Index('validacao_func_idx', ['funcionalidade', 'tipo', 'criadoEm'])
@Index('validacao_usuario_idx', ['usuarioId', 'funcionalidade'])
export class ValidacaoFuncionalidade {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'empresa_id', type: 'int', default: 1 })
  empresaId!: number;

  /** Quem registrou (auditor na conferência, CFO no aval). */
  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId!: string;

  /** Chave da funcionalidade (= href da rota, ex.: '/contas-pagar'). */
  @Column({ type: 'varchar', length: 80 })
  funcionalidade!: string;

  /** 'conferencia' (auditor) | 'aval' (CFO). */
  @Column({ type: 'varchar', length: 20 })
  tipo!: ValidacaoTipo;

  /** 'validado' | 'reprovado'. */
  @Column({ type: 'varchar', length: 20 })
  status!: ValidacaoStatus;

  /** O que o usuário apontou. Obrigatório quando status = 'reprovado'. */
  @Column({ type: 'text', nullable: true })
  observacoes!: string | null;

  /** Prints anexados à ressalva (data-URI base64 cada). Opcional, só em reprovações. */
  @Column({ name: 'anexos_data_uri', type: 'text', array: true, nullable: true })
  anexosDataUri!: string[] | null;

  /** Snapshot do 1º acesso à tela no momento do registro (rastreabilidade). */
  @Column({ name: 'primeiro_acesso_em', type: 'timestamptz', nullable: true })
  primeiroAcessoEm!: Date | null;

  /** Resposta do admin à ressalva (o que foi corrigido). */
  @Column({ name: 'resposta_admin', type: 'text', nullable: true })
  respostaAdmin!: string | null;

  @Column({ name: 'respondido_por', type: 'uuid', nullable: true })
  respondidoPor!: string | null;

  @Column({ name: 'respondido_em', type: 'timestamptz', nullable: true })
  respondidoEm!: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;
}
