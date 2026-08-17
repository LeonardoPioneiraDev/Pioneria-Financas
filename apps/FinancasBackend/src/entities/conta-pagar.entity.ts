import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Fornecedor } from './fornecedor.entity.js';

export type ContaPagarStatus = 'pendente' | 'aprovado' | 'pago' | 'cancelado' | 'em_aprovacao';

@Entity({ schema: 'finance', name: 'contas_pagar' })
@Index('contas_pagar_vencimento_idx', ['empresaId', 'dataVencimento'])
@Index('contas_pagar_fornecedor_idx', ['fornecedorId', 'dataVencimento'])
export class ContaPagar {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Codigo da empresa no Globus. Default 4 = Viacao Pioneira.
   * Configuravel via `EMPRESA_GLOBUS_ID` quando precisar atender outra empresa
   * do consorcio no futuro. O ETL sempre passa o valor lido do Globus —
   * default so morde se uma rotina interna esquecer de informar.
   */
  @Column({ name: 'empresa_id', type: 'int', default: 4 })
  empresaId!: number;

  @Column({ name: 'fornecedor_id', type: 'uuid', nullable: true })
  fornecedorId!: string | null;

  @ManyToOne(() => Fornecedor, { nullable: true })
  @JoinColumn({ name: 'fornecedor_id' })
  fornecedor?: Fornecedor;

  @Column({ name: 'numero_documento', type: 'varchar', length: 40, nullable: true })
  numeroDocumento!: string | null;

  @Column({ name: 'serie_documento', type: 'varchar', length: 10, nullable: true })
  serieDocumento!: string | null;

  @Column({ name: 'numero_parcela', type: 'int', nullable: true })
  numeroParcela!: number | null;

  @Column({ type: 'date', nullable: true })
  competencia!: string | null;

  @Column({ name: 'data_emissao', type: 'date', nullable: true })
  dataEmissao!: string | null;

  @Column({ name: 'data_vencimento', type: 'date' })
  dataVencimento!: string;

  @Column({ name: 'data_pagamento', type: 'date', nullable: true })
  dataPagamento!: string | null;

  @Column({ name: 'valor_bruto_cents', type: 'bigint' })
  valorBrutoCents!: string;

  @Column({ name: 'desconto_cents', type: 'bigint', default: 0 })
  descontoCents!: string;

  @Column({ name: 'juros_cents', type: 'bigint', default: 0 })
  jurosCents!: string;

  @Column({ name: 'multa_cents', type: 'bigint', default: 0 })
  multaCents!: string;

  @Column({ name: 'valor_liquido_cents', type: 'bigint', generatedType: 'STORED', asExpression: 'valor_bruto_cents - desconto_cents + juros_cents + multa_cents', insert: false, update: false })
  valorLiquidoCents!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: ContaPagarStatus;

  @Column({ type: 'boolean', default: false })
  quitado!: boolean;

  /**
   * QUITADO REAL do Globus (CPGDOCTO.QUITADODOCTOCPG='S'), SEM o override que o ETL
   * aplica em `quitado` (que vira true quando ha data_pagamento). O Globus mantem
   * QUITADO='N' enquanto o banco nao COMPENSA — e quando o pagamento eletronico foi
   * ACEITO mas DEVOLVIDO, fica 'N' mesmo com data_pagamento/STATUSPE='PG' preenchidos.
   * Por isso e a chave pra distinguir "pago de verdade" de "tentativa devolvida".
   */
  @Column({ name: 'quitado_globus', type: 'boolean', default: false })
  quitadoGlobus!: boolean;

  /**
   * STATUSDOCTOCPG cru do Globus: N=em aberto · B=baixado(pago) · C=cancelado.
   * É a FONTE do campo `status` — guardado para que a divergência entre o que
   * mostramos e o que o ERP diz seja visível sem ir ao Oracle.
   */
  @Column({ name: 'status_docto_globus', type: 'char', length: 1, nullable: true })
  statusDoctoGlobus!: string | null;

  /**
   * Quantas vezes o Globus registrou "Pagamento de documento" para este titulo.
   * >1 = pagamento cancelado e refeito. NAO significa pagar duas vezes: o titulo
   * e uma linha so e entra uma vez nos totais. Serve para o financeiro reconhecer
   * na lista o que ve no historico do ERP.
   */
  @Column({ name: 'vezes_pago_globus', type: 'int', default: 0 })
  vezesPagoGlobus!: number;

  @Column({ name: 'teve_cancelamento_pagamento', type: 'boolean', default: false })
  teveCancelamentoPagamento!: boolean;

  /**
   * Vencimento ANTES da última alteração no Globus (prorrogação). NULL = nunca
   * mudou. Guardado para a tela mostrar "vencia X · prorrogado para Y".
   */
  @Column({ name: 'vencimento_anterior', type: 'date', nullable: true })
  vencimentoAnterior!: string | null;

  @Column({ name: 'vencimento_alterado_em', type: 'timestamptz', nullable: true })
  vencimentoAlteradoEm!: Date | null;

  @Column({ name: 'teve_prorrogacao', type: 'boolean', default: false })
  teveProrrogacao!: boolean;

  @Column({ type: 'text', nullable: true })
  observacao!: string | null;

  @Column({ name: 'tipo_documento', type: 'varchar', length: 10, nullable: true })
  tipoDocumento!: string | null;

  @Column({ name: 'modalidade_pagamento', type: 'varchar', length: 20, nullable: true })
  modalidadePagamento!: string | null;

  @Column({ name: 'tipo_pagto', type: 'varchar', length: 20, nullable: true })
  tipoPagto!: string | null;

  // ---- Substituicao (CPGDOCTO.CODDOCTOCPGSUBST). Quando o titulo foi substituido/
  // relancado no Globus, `substituido`=true e `substituidoPorCod` aponta pro
  // CODDOCTOCPG do sucessor. O antigo NAO e cancelado (status N/B), entao duplicava
  // na lista e dobrava valor. Fica visivel com selo "Substituido" mas FORA das somas
  // (perna A "Foi pago", aging, totais). ~23% dos titulos. Ver SFN-48.
  @Column({ name: 'substituido', type: 'boolean', default: false })
  substituido!: boolean;

  @Column({ name: 'substituido_por_cod', type: 'varchar', length: 40, nullable: true })
  substituidoPorCod!: string | null;

  // ---- Confirmacao do pagamento eletronico (CPGDOCTO). `autenticacaoEletronica` =
  // comprovante (AUTELETRONICA); `statusPe` = STATUSPE ('PG'=pago). O "documento de
  // retorno do banco" (NRDOCTORETBCOPE) vem vazio na Pioneira, por isso nao e usado.
  @Column({ name: 'autenticacao_eletronica', type: 'varchar', length: 160, nullable: true })
  autenticacaoEletronica!: string | null;

  @Column({ name: 'status_pe', type: 'varchar', length: 5, nullable: true })
  statusPe!: string | null;

  // ---- Favorecido "real" (CPGDOCTO.FAVORECIDODOCTOCPG + inscricao do favorecido).
  // Texto livre que pode diferir do fornecedor cadastrado (ex.: fornecedor generico
  // "FORNECEDORES DIVERSOS" cujo favorecido real e outro). Pode vir vazio.
  @Column({ name: 'favorecido_nome', type: 'varchar', length: 200, nullable: true })
  favorecidoNome!: string | null;

  @Column({ name: 'favorecido_inscricao', type: 'varchar', length: 20, nullable: true })
  favorecidoInscricao!: string | null;

  @Column({ name: 'favorecido_tipo_inscricao', type: 'varchar', length: 5, nullable: true })
  favorecidoTipoInscricao!: string | null;

  // ---- Banco que PAGOU (conta da empresa de onde saiu o dinheiro). Resolvido no
  // Globus via BCOMOVTO (CPGDOCTO.CODMOVTOBCO) com fallback no CPGDOCTO.CODBANCO;
  // nome via BCOBANCO. `pagamentoDoc` = BCOMOVTO.DOCMOVTOBCO (borderô, ex "BO-010260").
  @Column({ name: 'banco_pagador_codigo', type: 'int', nullable: true })
  bancoPagadorCodigo!: number | null;

  @Column({ name: 'banco_pagador_nome', type: 'varchar', length: 60, nullable: true })
  bancoPagadorNome!: string | null;

  @Column({ name: 'banco_pagador_agencia', type: 'varchar', length: 10, nullable: true })
  bancoPagadorAgencia!: string | null;

  @Column({ name: 'banco_pagador_conta', type: 'varchar', length: 20, nullable: true })
  bancoPagadorConta!: string | null;

  @Column({ name: 'cod_movto_bco', type: 'bigint', nullable: true })
  codMovtoBco!: string | null;

  @Column({ name: 'pagamento_doc', type: 'varchar', length: 30, nullable: true })
  pagamentoDoc!: string | null;

  // ---- Remessa enviada ao banco (pagamento eletronico): CPGDOCTO.NROREMESSAPE +
  // DTREMESSAPE. Titulos com a MESMA (conta + data + numero) foram enviados na MESMA
  // remessa (lote de pagamento). So o pagamento eletronico tem remessa; borderô/cheque
  // ficam null (o "lote" deles e o borderô, via cod_movto_bco). O numero REPETE entre
  // dias/contas — a chave real e conta+data+numero. Ver memory/globus-cp-remessa-pe.
  @Column({ name: 'numero_remessa', type: 'varchar', length: 10, nullable: true })
  numeroRemessa!: string | null;

  @Column({ name: 'data_remessa', type: 'timestamptz', nullable: true })
  dataRemessa!: Date | null;

  @Column({ name: 'pagamento_liberado', type: 'boolean', default: false })
  pagamentoLiberado!: boolean;

  @Column({ name: 'data_entrada', type: 'date', nullable: true })
  dataEntrada!: string | null;

  @Column({ name: 'vlr_inss_cents', type: 'bigint', default: 0 })
  vlrInssCents!: string;

  @Column({ name: 'vlr_irrf_cents', type: 'bigint', default: 0 })
  vlrIrrfCents!: string;

  @Column({ name: 'vlr_pis_cents', type: 'bigint', default: 0 })
  vlrPisCents!: string;

  @Column({ name: 'vlr_cofins_cents', type: 'bigint', default: 0 })
  vlrCofinsCents!: string;

  @Column({ name: 'vlr_csll_cents', type: 'bigint', default: 0 })
  vlrCsllCents!: string;

  @Column({ name: 'vlr_iss_cents', type: 'bigint', default: 0 })
  vlrIssCents!: string;

  @Column({ name: 'origem_documento', type: 'varchar', length: 20, default: 'desconhecido' })
  origemDocumento!: string;

  @Column({ name: 'data_integrou_flp', type: 'date', nullable: true })
  dataIntegrouFlp!: string | null;

  @Column({ name: 'tipo_folha', type: 'varchar', length: 30, nullable: true })
  tipoFolha!: string | null;

  @Column({ name: 'competencia_flp', type: 'date', nullable: true })
  competenciaFlp!: string | null;

  @Column({ name: 'origem_sistema', type: 'varchar', length: 40 })
  origemSistema!: string;

  @Column({ name: 'origem_id_externo', type: 'varchar', length: 40 })
  origemIdExterno!: string;

  @Column({ name: 'ultimo_sync_em', type: 'timestamptz', nullable: true })
  ultimoSyncEm!: Date | null;

  // Trilha de auditoria do Globus (CPGDOCTO).
  // Logins/codigos do Globus, nao nomes — mapeamento para nome real e proximo work item.
  @Column({ name: 'usuario_inclusao', type: 'varchar', length: 40, nullable: true })
  usuarioInclusao!: string | null;

  @Column({ name: 'data_inclusao', type: 'timestamptz', nullable: true })
  dataInclusao!: Date | null;

  @Column({ name: 'usuario_lib_pagto', type: 'varchar', length: 40, nullable: true })
  usuarioLibPagto!: string | null;

  @Column({ name: 'data_liberacao_pagto', type: 'timestamptz', nullable: true })
  dataLiberacaoPagto!: Date | null;

  @Column({ name: 'usuario_assinatura', type: 'varchar', length: 40, nullable: true })
  usuarioAssinatura!: string | null;

  // Responsavel generico do CPGDOCTO.USUARIO — quando quitado, costuma identificar
  // quem registrou a baixa de pagamento (Globus nao tem USUARIO_PAGAMENTO dedicado).
  @Column({ name: 'usuario_responsavel', type: 'varchar', length: 40, nullable: true })
  usuarioResponsavel!: string | null;

  // Assinaturas fisicas/secundarias (ASSINATURA_1, ASSINATURA_2 do CPGDOCTO).
  @Column({ name: 'assinatura_1', type: 'varchar', length: 40, nullable: true })
  assinatura1!: string | null;

  @Column({ name: 'assinatura_2', type: 'varchar', length: 40, nullable: true })
  assinatura2!: string | null;

  // Setor = centro de custo financeiro do item (CPGITDOC.CODCUSTOFIN), unidade
  // dominante por valor. Descricao via JOIN em CPGCUSTOS (CODIGO -> DESCRICAO).
  @Column({ name: 'cod_setor', type: 'varchar', length: 10, nullable: true })
  codSetor!: string | null;

  @Column({ name: 'setor_nome', type: 'varchar', length: 80, nullable: true })
  setorNome!: string | null;

  // true quando o titulo tem itens em mais de uma unidade (rateio). `setorNome`
  // mostra a unidade dominante; a UI marca "rateado".
  @Column({ name: 'setor_rateado', type: 'boolean', default: false })
  setorRateado!: boolean;

  /**
   * Quebra do rateio: uma entrada por unidade (CODCUSTOFIN) quando o titulo tem itens
   * em mais de um centro de custo (ex.: DOBRAS dividida entre Itapoá/Santa Maria/Gama/
   * São Sebastião). `setorNome`/`codSetor` continuam sendo a unidade DOMINANTE (maior
   * valor). Populado no ETL a partir de CPGITDOC agrupado por CODCUSTOFIN.
   */
  @Column({ name: 'rateio_setores', type: 'jsonb', nullable: true })
  rateioSetores!: Array<{ codigo: string; nome: string | null; valorCents: number }> | null;

  /**
   * Codigos de TODAS as unidades do titulo (dominante + rateio) — pro filtro por setor
   * pegar o titulo em QUALQUER uma das suas unidades, nao so a dominante. GIN index.
   */
  @Column({ name: 'setores_codigos', type: 'text', array: true, nullable: true })
  setoresCodigos!: string[] | null;

  /**
   * Quebra do titulo por CONTA CONTABIL (natureza da despesa) — eixo diferente do
   * setor. Cada item do documento (CPGITDOC) tem uma conta contabil (CODCONTACTB);
   * aqui vem agrupado por conta, do maior valor pro menor. `classificador` = codigo
   * contabil pontilhado (ex "3.1.01.09.0603"), `nome` = NOMECONTA (ex "CONSERTOS E
   * REFORMAS"). Populado no ETL a partir de CPGITDOC + CTBCONTA. Null = 1 conta so
   * ou titulo ainda nao re-sincronizado.
   */
  @Column({ name: 'rateio_contas', type: 'jsonb', nullable: true })
  rateioContas!: Array<{ classificador: string; nome: string | null; valorCents: number }> | null;

  @CreateDateColumn({ name: 'criado_em', type: 'timestamptz' })
  criadoEm!: Date;

  @UpdateDateColumn({ name: 'atualizado_em', type: 'timestamptz' })
  atualizadoEm!: Date;

  /**
   * Exclusao logica: setado quando o registro foi cancelado no Globus ou sumiu
   * do range do sync. UI filtra `excluido_em IS NULL` por padrao. NUNCA deletamos
   * o registro — historico fica preservado para auditoria.
   */
  @Column({ name: 'excluido_em', type: 'timestamptz', nullable: true })
  excluidoEm!: Date | null;

  /** Motivo: 'cancelado_no_globus' | 'sumiu_do_sync' | 'data_zero'. */
  @Column({ name: 'excluido_motivo', type: 'varchar', length: 60, nullable: true })
  excluidoMotivo!: string | null;
}
