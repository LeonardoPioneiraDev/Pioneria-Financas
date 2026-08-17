// Registry central das entidades TypeORM.
// Em produção (Docker, cwd=/app) o glob `src/entities/**/*.ts` falha;
// imports explícitos funcionam em qualquer cwd.
import { AcessoDados } from './acesso-dados.entity.js';
import { AprovacaoCp } from './aprovacao-cp.entity.js';
import { Banco } from './banco.entity.js';
import { BancoConta } from './banco-conta.entity.js';
import { BancoMovto } from './banco-movto.entity.js';
import { Cliente } from './cliente.entity.js';
import { CnabOcorrencia } from './cnab-ocorrencia.entity.js';
import { ContaPagar } from './conta-pagar.entity.js';
import { ContaReceber } from './conta-receber.entity.js';
import { ContaReceberItem } from './conta-receber-item.entity.js';
import { CpEvento } from './cp-evento.entity.js';
import { DepreciacaoMensal } from './depreciacao-mensal.entity.js';
import { DreContaMensal } from './dre-conta-mensal.entity.js';
import { EventoFolha } from './evento-folha.entity.js';
import { FichaEvento } from './ficha-evento.entity.js';
import { FolhaGps } from './folha-gps.entity.js';
import { Fornecedor } from './fornecedor.entity.js';
import { FrotaComposicao } from './frota-composicao.entity.js';
import { Funcionario } from './funcionario.entity.js';
import { GlobusBcocontaStage } from './globus-bcoconta-stage.entity.js';
import { GlobusBcomovtoStage } from './globus-bcomovto-stage.entity.js';
import { GlobusCpStage } from './globus-cp-stage.entity.js';
import { GlobusCpEventosStage } from './globus-cp-eventos-stage.entity.js';
import { GlobusCtbsaldoStage } from './globus-ctbsaldo-stage.entity.js';
import { GlobusCrcStage } from './globus-crc-stage.entity.js';
import { GlobusCrcClienteStage } from './globus-crc-cliente-stage.entity.js';
import { GlobusFlpEventoStage } from './globus-flp-evento-stage.entity.js';
import { GlobusFlpFichaStage } from './globus-flp-ficha-stage.entity.js';
import { GlobusFlpEncerramentoStage } from './globus-flp-encerramento-stage.entity.js';
import { GlobusFlpFuncStage } from './globus-flp-func-stage.entity.js';
import { GlobusFlpGpsStage } from './globus-flp-gps-stage.entity.js';
import { GlobusCpgorcStage } from './globus-cpgorc-stage.entity.js';
import { HorariosRelatorioStage } from './horarios-relatorio-stage.entity.js';
import { Notificacao } from './notificacao.entity.js';
import { OrcamentoPrevisao } from './orcamento-previsao.entity.js';
import { OrcamentoMeta } from './orcamento-meta.entity.js';
import { OracleQueryLog } from './oracle-query-log.entity.js';
import { RecebivelFamilia } from './recebivel-familia.entity.js';
import { Reembolso } from './reembolso.entity.js';
import { RecebivelGdfCelula } from './recebivel-gdf-celula.entity.js';
import { RecebivelGdfRelatorio } from './recebivel-gdf-relatorio.entity.js';
import { ReceitaTdmax } from './receita-tdmax.entity.js';
import { RemessaCnab } from './remessa-cnab.entity.js';
import { ReguaCobrancaTemplate } from './regua-cobranca-template.entity.js';
import { ReguaCobrancaEnvio } from './regua-cobranca-envio.entity.js';
import { BoletoEmitido } from './boleto-emitido.entity.js';
import { SerasaConsulta } from './serasa-consulta.entity.js';
import { SerasaNegativacao } from './serasa-negativacao.entity.js';
import { Conciliacao } from './conciliacao.entity.js';
import { Configuracao } from './configuracao.entity.js';
import { Feriado } from './feriado.entity.js';
import { SyncAgendamento } from './sync-agendamento.entity.js';
import { SyncError } from './sync-error.entity.js';
import { PasswordResetToken } from './password-reset-token.entity.js';
import { PerguntaFinanceiro } from './pergunta-financeiro.entity.js';
import { RefreshToken } from './refresh-token.entity.js';
import { RequestLog } from './request-log.entity.js';
import { SyncJob } from './sync-job.entity.js';
import { TermoAceite } from './termo-aceite.entity.js';
import { TipoReceita } from './tipo-receita.entity.js';
import { User } from './user.entity.js';
import { UserActivityLog } from './user-activity-log.entity.js';
import { UserPageView } from './user-page-view.entity.js';
import { ValidacaoFuncionalidade } from './validacao-funcionalidade.entity.js';
import { WorkflowEvento } from './workflow-evento.entity.js';
import { WorkflowInstance } from './workflow-instance.entity.js';
import { WorkflowTemplate } from './workflow-template.entity.js';

export const ENTITIES = [
  AcessoDados,
  AprovacaoCp,
  Banco,
  BancoConta,
  BancoMovto,
  Cliente,
  CnabOcorrencia,
  ContaPagar,
  ContaReceber,
  ContaReceberItem,
  CpEvento,
  DepreciacaoMensal,
  DreContaMensal,
  EventoFolha,
  FichaEvento,
  FolhaGps,
  Fornecedor,
  FrotaComposicao,
  Funcionario,
  GlobusBcocontaStage,
  GlobusBcomovtoStage,
  GlobusCpStage,
  GlobusCpEventosStage,
  GlobusCtbsaldoStage,
  GlobusCrcStage,
  GlobusCrcClienteStage,
  GlobusFlpEventoStage,
  GlobusFlpEncerramentoStage,
  GlobusFlpFichaStage,
  GlobusFlpFuncStage,
  GlobusFlpGpsStage,
  GlobusCpgorcStage,
  HorariosRelatorioStage,
  Notificacao,
  OrcamentoPrevisao,
  OrcamentoMeta,
  OracleQueryLog,
  RecebivelFamilia,
  Reembolso,
  RecebivelGdfCelula,
  RecebivelGdfRelatorio,
  ReceitaTdmax,
  RemessaCnab,
  ReguaCobrancaTemplate,
  ReguaCobrancaEnvio,
  BoletoEmitido,
  SerasaConsulta,
  SerasaNegativacao,
  Conciliacao,
  Configuracao,
  Feriado,
  PasswordResetToken,
  PerguntaFinanceiro,
  RefreshToken,
  RequestLog,
  SyncAgendamento,
  SyncError,
  SyncJob,
  TermoAceite,
  TipoReceita,
  User,
  UserActivityLog,
  UserPageView,
  ValidacaoFuncionalidade,
  WorkflowTemplate,
  WorkflowInstance,
  WorkflowEvento,
];
