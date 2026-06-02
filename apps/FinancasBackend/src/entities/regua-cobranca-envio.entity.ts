import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ContaReceber } from './conta-receber.entity.js';
import { ReguaCobrancaTemplate } from './regua-cobranca-template.entity.js';

export type ReguaEnvioModo = 'simulado' | 'real';
export type ReguaEnvioStatus = 'enviado' | 'falha' | 'aberto' | 'clicado';

@Entity({ schema: 'finance', name: 'regua_cobranca_envios' })
@Index('regua_envios_cr_idx', ['contaReceberId', 'enviadoEm'])
export class ReguaCobrancaEnvio {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conta_receber_id', type: 'uuid' })
  contaReceberId!: string;

  @ManyToOne(() => ContaReceber)
  @JoinColumn({ name: 'conta_receber_id' })
  contaReceber?: ContaReceber;

  @Column({ name: 'template_id', type: 'uuid' })
  templateId!: string;

  @ManyToOne(() => ReguaCobrancaTemplate)
  @JoinColumn({ name: 'template_id' })
  template?: ReguaCobrancaTemplate;

  @Column({ type: 'varchar', length: 20 })
  canal!: 'email' | 'whatsapp' | 'sms';

  @Column({ type: 'varchar', length: 200 })
  destinatario!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  assunto!: string | null;

  @Column({ name: 'corpo_rendered', type: 'text' })
  corpoRendered!: string;

  @Column({ type: 'varchar', length: 20, default: 'simulado' })
  modo!: ReguaEnvioModo;

  @Column({ type: 'varchar', length: 20, default: 'enviado' })
  status!: ReguaEnvioStatus;

  @Column({ name: 'mensagem_erro', type: 'text', nullable: true })
  mensagemErro!: string | null;

  @CreateDateColumn({ name: 'enviado_em', type: 'timestamptz' })
  enviadoEm!: Date;

  @Column({ name: 'dias_vencidos_no_envio', type: 'int' })
  diasVencidosNoEnvio!: number;
}
