import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Unique, UpdateDateColumn,
} from 'typeorm';
import { ContaPagar } from './conta-pagar.entity.js';

/**
 * Evento real da trilha de auditoria de um CP (origem:
 * GLOBUS.CPGDOCTO_HISTORICO_NEGOCIACOES). 1 linha por ato, com usuario + hora
 * reais. Fonte de verdade do "quem fez cada etapa", incluindo a baixa.
 *
 * Identificacao das etapas pelo workflow:
 *   - inclusao : cod_tp_evento = 1
 *   - liberacao: cod_tp_evento = 9
 *   - pagamento: status_docto = 'B' (baixado)
 */
@Entity({ schema: 'finance', name: 'cp_eventos' })
@Unique('cp_eventos_origem_uq', ['origemSistema', 'origemIdExterno'])
@Index('cp_eventos_doc_idx', ['codDoctoCpg', 'sequenciaEvento'])
@Index('cp_eventos_cp_idx', ['contaPagarId'])
export class CpEvento {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conta_pagar_id', type: 'uuid', nullable: true })
  contaPagarId!: string | null;

  @ManyToOne(() => ContaPagar, { nullable: true })
  @JoinColumn({ name: 'conta_pagar_id' })
  contaPagar?: ContaPagar;

  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  @Column({ name: 'cod_docto_cpg', type: 'bigint' })
  codDoctoCpg!: string;

  @Column({ name: 'sequencia_evento', type: 'int' })
  sequenciaEvento!: number;

  @Column({ name: 'cod_tp_evento', type: 'int', nullable: true })
  codTpEvento!: number | null;

  @Column({ name: 'tipo_evento_desc', type: 'varchar', length: 80, nullable: true })
  tipoEventoDesc!: string | null;

  @Column({ name: 'mais_informacoes', type: 'varchar', length: 500, nullable: true })
  maisInformacoes!: string | null;

  /** Status resultante do documento apos o evento. 'B' = baixado (pago). */
  @Column({ name: 'status_docto', type: 'char', length: 1, nullable: true })
  statusDocto!: string | null;

  @Column({ name: 'usuario', type: 'varchar', length: 40, nullable: true })
  usuario!: string | null;

  @Column({ name: 'ocorrido_em', type: 'timestamptz', nullable: true })
  ocorridoEm!: Date | null;

  @Column({ name: 'origem_sistema', type: 'varchar', length: 40, default: 'globus' })
  origemSistema!: string;

  @Column({ name: 'origem_id_externo', type: 'varchar', length: 60 })
  origemIdExterno!: string;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
