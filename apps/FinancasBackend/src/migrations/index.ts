/**
 * Registry central das migrations — mesma razão do entities/index.ts:
 * glob `src/migrations/**\/*.ts` quebra em produção (cwd diferente).
 */
import { InitialIdentityAndAudit1700000001000 } from './0001_initial_identity_and_audit.js';
import { UserPageViews1700000002000 } from './0002_user_page_views.js';
import { ContasPagarSync1700000003000 } from './1700000003000-contas-pagar-sync.js';
import { CpCamposExtras1700000004000 } from './1700000004000-cp-campos-extras.js';
import { CpOrigemFolha1700000005000 } from './1700000005000-cp-origem-folha.js';
import { CpTipoFolha1700000006000 } from './1700000006000-cp-tipo-folha.js';
import { AuditCompliance1700000007000 } from './1700000007000-audit-compliance.js';
import { FolhaFlp1700000008000 } from './1700000008000-folha-flp.js';
import { ContasReceber1700000009000 } from './1700000009000-contas-receber.js';
import { WorkflowDocumentos1700000010000 } from './1700000010000-workflow-documentos.js';
import { EmpresaIdDefaultPioneira1700000011000 } from './1700000011000-empresa-id-default-pioneira.js';
import { StageHashEExclusao1700000012000 } from './1700000012000-stage-hash-e-exclusao.js';
import { ObservabilidadeSync1700000013000 } from './1700000013000-observabilidade-sync.js';
import { FlpEncerramentoStage1700000014000 } from './1700000014000-flp-encerramento-stage.js';
import { RecebiveisGdf1700000015000 } from './1700000015000-recebiveis-gdf.js';
import { BancoMovto1700000016000 } from './1700000016000-banco-movto.js';
import { BancoConta1700000017000 } from './1700000017000-banco-conta.js';
import { CpTrilhaAuditoria1700000018000 } from './1700000018000-cp-trilha-auditoria.js';
import { CpWorkflowMarcosReais1700000019000 } from './1700000019000-cp-workflow-marcos-reais.js';
import { CpMaisUsuarios1700000020000 } from './1700000020000-cp-mais-usuarios.js';
import { CpAprovacoesDigitais1700000021000 } from './1700000021000-cp-aprovacoes-digitais.js';
import { CpRemessasCnab1700000022000 } from './1700000022000-cp-remessas-cnab.js';
import { CrReguaCobranca1700000023000 } from './1700000023000-cr-regua-cobranca.js';
import { CrBoletosPix1700000024000 } from './1700000024000-cr-boletos-pix.js';
import { CrSerasa1700000025000 } from './1700000025000-cr-serasa.js';
import { ConciliacaoBancaria1700000026000 } from './1700000026000-conciliacao-bancaria.js';
import { CpEventos1700000027000 } from './1700000027000-cp-eventos.js';
import { CpSetor1700000028000 } from './1700000028000-cp-setor.js';
import { Setor1700000029000 } from './1700000029000-setor.js';
import { SetorGlobusCustofin1700000030000 } from './1700000030000-setor-globus-custofin.js';
import { FornecedorFiscal1700000031000 } from './1700000031000-fornecedor-fiscal.js';
import { CpValorBrutoItens1700000032000 } from './1700000032000-cp-valor-bruto-itens.js';
import { CpBancoBorderoFavorecido1700000033000 } from './1700000033000-cp-banco-bordero-favorecido.js';
import { CpSubstituicaoRetorno1700000034000 } from './1700000034000-cp-substituicao-retorno.js';
import { CpDevolucaoBancaria1700000035000 } from './1700000035000-cp-devolucao-bancaria.js';
import { CpRemessaPe1700000036000 } from './1700000036000-cp-remessa-pe.js';
import { CpRateioSetores1700000037000 } from './1700000037000-cp-rateio-setores.js';
import { Reembolsos1700000038000 } from './1700000038000-reembolsos.js';
import { CpRateioContas1700000039000 } from './1700000039000-cp-rateio-contas.js';
import { Depreciacao1700000040000 } from './1700000040000-depreciacao.js';
import { FolhaGps1700000041000 } from './1700000041000-folha-gps.js';
import { PerguntasFinanceiro1700000042000 } from './1700000042000-perguntas-financeiro.js';
import { FolhaReclassificaEventosAc1700000044000 } from './1700000044000-folha-reclassifica-eventos-ac.js';
import { OrcamentoBaseline1700000045000 } from './1700000045000-orcamento-baseline.js';
import { FrotaComposicao1700000046000 } from './1700000046000-frota-composicao.js';

export const MIGRATIONS = [
  InitialIdentityAndAudit1700000001000,
  UserPageViews1700000002000,
  ContasPagarSync1700000003000,
  CpCamposExtras1700000004000,
  CpOrigemFolha1700000005000,
  CpTipoFolha1700000006000,
  AuditCompliance1700000007000,
  FolhaFlp1700000008000,
  ContasReceber1700000009000,
  WorkflowDocumentos1700000010000,
  EmpresaIdDefaultPioneira1700000011000,
  StageHashEExclusao1700000012000,
  ObservabilidadeSync1700000013000,
  FlpEncerramentoStage1700000014000,
  RecebiveisGdf1700000015000,
  BancoMovto1700000016000,
  BancoConta1700000017000,
  CpTrilhaAuditoria1700000018000,
  CpWorkflowMarcosReais1700000019000,
  CpMaisUsuarios1700000020000,
  CpAprovacoesDigitais1700000021000,
  CpRemessasCnab1700000022000,
  CrReguaCobranca1700000023000,
  CrBoletosPix1700000024000,
  CrSerasa1700000025000,
  ConciliacaoBancaria1700000026000,
  CpEventos1700000027000,
  CpSetor1700000028000,
  Setor1700000029000,
  SetorGlobusCustofin1700000030000,
  FornecedorFiscal1700000031000,
  CpValorBrutoItens1700000032000,
  CpBancoBorderoFavorecido1700000033000,
  CpSubstituicaoRetorno1700000034000,
  CpDevolucaoBancaria1700000035000,
  CpRemessaPe1700000036000,
  CpRateioSetores1700000037000,
  Reembolsos1700000038000,
  CpRateioContas1700000039000,
  Depreciacao1700000040000,
  FolhaGps1700000041000,
  PerguntasFinanceiro1700000042000,
  FolhaReclassificaEventosAc1700000044000,
  OrcamentoBaseline1700000045000,
  FrotaComposicao1700000046000,
];
