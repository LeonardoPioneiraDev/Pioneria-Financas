import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

/**
 * Agendamento de sincronismo automatico por recurso. Uma linha por recurso
 * agendavel (depreciacao, dre, ...). O plugin `sync-scheduler` le esta tabela
 * e dispara os syncs habilitados na frequencia configurada.
 *
 * frequencia:
 *  - 'intervalo': roda a cada `intervalo_min` minutos.
 *  - 'diario':    roda todo dia as `hora_dia`:`minuto_dia` (America/Sao_Paulo).
 */
@Entity({ schema: 'integration', name: 'sync_agendamento' })
@Unique('sync_agendamento_recurso_uq', ['recurso'])
export class SyncAgendamento {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'recurso', type: 'varchar', length: 60 })
  recurso!: string;

  @Column({ name: 'habilitado', type: 'boolean', default: false })
  habilitado!: boolean;

  @Column({ name: 'frequencia', type: 'varchar', length: 20, default: 'diario' })
  frequencia!: 'intervalo' | 'diario';

  /** Minutos entre execucoes (frequencia='intervalo'). */
  @Column({ name: 'intervalo_min', type: 'int', nullable: true })
  intervaloMin!: number | null;

  /** Hora do dia 0-23 (frequencia='diario', horario de Brasilia). */
  @Column({ name: 'hora_dia', type: 'int', nullable: true })
  horaDia!: number | null;

  @Column({ name: 'minuto_dia', type: 'int', default: 0 })
  minutoDia!: number;

  @Column({ name: 'ultimo_run_em', type: 'timestamptz', nullable: true })
  ultimoRunEm!: Date | null;

  @Column({ name: 'ultimo_status', type: 'varchar', length: 20, nullable: true })
  ultimoStatus!: string | null;

  @Column({ name: 'ultima_mensagem', type: 'varchar', length: 300, nullable: true })
  ultimaMensagem!: string | null;

  @Column({ name: 'proximo_run_em', type: 'timestamptz', nullable: true })
  proximoRunEm!: Date | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;
}
