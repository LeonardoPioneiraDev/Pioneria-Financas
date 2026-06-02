import type { FastifyInstance } from 'fastify';
import { IsNull } from 'typeorm';
import { GlobusCpStage } from '@/entities/globus-cp-stage.entity.js';
import { ContaPagar, type ContaPagarStatus } from '@/entities/conta-pagar.entity.js';
import { Fornecedor } from '@/entities/fornecedor.entity.js';
import type { RawCpRow } from '@/integrations/globus/globus-cp.adapter.js';
import { classificarTipoFolha } from '@pioneira/shared/enums/tipo-folha';
import { dataIsoSpOuNull } from '@/shared/utils/datetime.js';
import { registrarErroSync } from '@/shared/integration/dlq.js';

interface EtlResult {
  processados: number;
  gravados: number;
  comErro: number;
}

const SISTEMA = 'globus';

function brlToCents(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '0';
  return Math.round(valor * 100).toString();
}

// Wrapper local: chama o utilitario padronizado em TZ America/Sao_Paulo.
// O utilitario ja trata: nullish, NaN, sentinela <1950.
const dateOnly = dataIsoSpOuNull;

export type OrigemDocumento = 'folha' | 'nf' | 'guia' | 'manual' | 'desconhecido';

/**
 * Detecta a origem de um titulo CPG baseado em multiplos sinais do Globus.
 * Ordem de precedencia (do sinal mais forte para o mais fraco):
 * 1. DATA_INTEGROU_FLP ou COMPETENCIA_FLP preenchida → folha (sinal mais forte)
 * 2. VLR_INSS_CALC_FLP > 0, VLR_IRRF_CALC_FLP > 0 ou VLR_SESTSENAT_CALC_FLP > 0 → folha
 *    (folha sempre tem encargos calculados, mesmo se a integracao FLP nao gravou data)
 * 3. CODTPDOC com codigos tipicos de folha → folha
 * 4. CODTPDOC NF/NFE/NFV/NFS/DUP → nf
 * 5. CODTPDOC DAR/GPS/GRF/GRRF/DAS/GUI/IMP → guia
 * 6. MODULO_INCLUSAO indica origem direta → manual
 * 7. Senao → desconhecido
 */
function detectarOrigem(
  codTpDoc: string | null,
  dataIntegrouFlp: string | null,
  competenciaFlp: string | null,
  vlrInssCalcFlp: number | null,
  vlrIrrfCalcFlp: number | null,
  vlrSestSenatCalcFlp: number | null,
  moduloInclusao: string | null,
): OrigemDocumento {
  if (dataIntegrouFlp || competenciaFlp) return 'folha';
  // Sinal forte: qualquer encargo calculado pela folha > 0
  if ((vlrInssCalcFlp ?? 0) > 0 || (vlrIrrfCalcFlp ?? 0) > 0 || (vlrSestSenatCalcFlp ?? 0) > 0) return 'folha';
  const tipo = codTpDoc?.toUpperCase() ?? '';
  if (['FLP', 'FOL', 'SAL', 'RES', 'F13', 'FER', 'ADT', 'FOLHA'].includes(tipo)) return 'folha';
  if (['NF', 'NFE', 'NFV', 'NFS', 'DUP', 'BOL'].includes(tipo)) return 'nf';
  if (['DAR', 'GPS', 'GRF', 'GRRF', 'DAS', 'GUI', 'IMP', 'INS', 'IRR'].includes(tipo)) return 'guia';
  if (moduloInclusao && ['CPG', 'MAN', 'CAP'].includes(moduloInclusao.toUpperCase())) return 'manual';
  return 'desconhecido';
}

function mapStatus(statusDocto: string, quitado: string | null, dataPagamentoIso: string | null): ContaPagarStatus {
  const q = quitado?.toUpperCase() === 'S';
  // Se tem data de pagamento OU flag quitado, e PAGO. O Globus as vezes mantem
  // QUITADODOCTOCPG='N' enquanto nao compensa bancariamente, mas a data ja
  // esta preenchida quando a baixa operacional foi feita.
  if (q || dataPagamentoIso) return 'pago';
  if (statusDocto === 'C') return 'cancelado';
  if (statusDocto === 'A') return 'pendente';
  if (statusDocto === 'F') return 'aprovado';
  return 'pendente';
}

/**
 * Le linhas nao processadas do `integration.globus_cp_stage` e materializa em
 * `finance.contas_pagar`. Garante o fornecedor em `finance.fornecedores`
 * primeiro. Idempotente pela chave (origem_sistema, origem_id_externo).
 */
export function buildContasPagarEtl(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusCpStage);
  const cpRepo = fastify.db.getRepository(ContaPagar);
  const fornRepo = fastify.db.getRepository(Fornecedor);

  // 'S' -> true, 'N' -> false, qualquer outra coisa (null/vazio) -> null (desconhecido).
  function parseSimples(v: string | null | undefined): boolean | null {
    const s = v?.trim().toUpperCase();
    if (s === 'S') return true;
    if (s === 'N') return false;
    return null;
  }

  async function garantirFornecedor(raw: RawCpRow): Promise<string | null> {
    if (!raw.CODIGO_FORN && !raw.FAVORECIDO) return null;

    const origemId = raw.CODIGO_FORN ? String(raw.CODIGO_FORN) : `fav-${raw.NRINSCR_FAV ?? raw.FAVORECIDO}`;
    const razaoSocial = raw.FAVORECIDO ?? `Fornecedor ${origemId}`;
    const nomeFantasia = raw.FORN_FANTASIA ?? null;
    const optSimples = parseSimples(raw.FORN_SIMPLES);
    const tipoInscricao = raw.FORN_TP_INSCR ?? null;
    const uf = raw.FORN_UF ?? null;
    const cidade = raw.FORN_CIDADE ?? null;
    const codMunicipio = raw.FORN_COD_MUNIC ?? null;

    const existente = await fornRepo.findOne({
      where: { origemSistema: SISTEMA, origemIdExterno: origemId },
    });
    if (existente) {
      let mudou = false;
      if (raw.FAVORECIDO && existente.razaoSocial !== raw.FAVORECIDO) {
        existente.razaoSocial = raw.FAVORECIDO;
        mudou = true;
      }
      if (nomeFantasia && existente.nomeFantasia !== nomeFantasia) {
        existente.nomeFantasia = nomeFantasia;
        mudou = true;
      }
      if (raw.NRINSCR_FAV && existente.cnpjCpf !== raw.NRINSCR_FAV) {
        existente.cnpjCpf = raw.NRINSCR_FAV;
        mudou = true;
      }
      // Atributos fiscais — só sobrescreve quando o Globus traz valor (não apaga
      // o que já existe com null vindo de um título sem JOIN de fornecedor).
      if (optSimples !== null && existente.optSimplesNacional !== optSimples) {
        existente.optSimplesNacional = optSimples;
        mudou = true;
      }
      if (tipoInscricao && existente.tipoInscricao !== tipoInscricao) {
        existente.tipoInscricao = tipoInscricao;
        mudou = true;
      }
      if (uf && existente.uf !== uf) {
        existente.uf = uf;
        mudou = true;
      }
      if (cidade && existente.cidade !== cidade) {
        existente.cidade = cidade;
        mudou = true;
      }
      if (codMunicipio != null && existente.codMunicipio !== codMunicipio) {
        existente.codMunicipio = codMunicipio;
        mudou = true;
      }
      if (mudou) await fornRepo.save(existente);
      return existente.id;
    }

    const novo = fornRepo.create({
      empresaId: fastify.config.globus.empresaId,
      cnpjCpf: raw.NRINSCR_FAV ?? null,
      razaoSocial,
      nomeFantasia,
      optSimplesNacional: optSimples,
      tipoInscricao,
      uf,
      cidade,
      codMunicipio,
      origemSistema: SISTEMA,
      origemIdExterno: origemId,
    });
    await fornRepo.save(novo);
    return novo.id;
  }

  return {
    async processarPendentes(syncJobId?: string): Promise<EtlResult> {
      const log = fastify.log.child({ etl: 'contas_pagar', jobId: syncJobId });
      const inicio = Date.now();

      const where = syncJobId
        ? { syncJobId, processadoEm: IsNull() }
        : { processadoEm: IsNull() };

      const pendentes = await stageRepo.find({ where, take: 5000 });
      log.info({ pendentes: pendentes.length }, `[etl:cp] iniciando - ${pendentes.length} linhas pendentes em stage`);

      let gravados = 0;
      let comErro = 0;

      for (let i = 0; i < pendentes.length; i++) {
        const linha = pendentes[i]!;
        try {
          const raw = linha.rawPayload as unknown as RawCpRow;
          const fornecedorId = await garantirFornecedor(raw);

          const dataVencimento = dateOnly(raw.DATA_VENCIMENTO);
          if (!dataVencimento) throw new Error('DATA_VENCIMENTO ausente');
          const dataPagamento = dateOnly(raw.DATA_PAGAMENTO);
          const dataIntegrouFlp = dateOnly(raw.DATA_INTEGROU_FLP);
          const competenciaFlp = dateOnly(raw.COMPETENCIA_FLP);
          // Quitado e true se o flag do Globus disser sim OU se ja existe data de pagamento.
          const quitadoBoolean = raw.QUITADO?.toUpperCase() === 'S' || dataPagamento !== null;
          const origemDocumento = detectarOrigem(
            raw.TIPO_DOC,
            dataIntegrouFlp,
            competenciaFlp,
            raw.VLR_INSS_CALC_FLP,
            raw.VLR_IRRF_CALC_FLP,
            raw.VLR_SESTSENAT_CALC_FLP,
            raw.MODULO_INCLUSAO,
          );

          // Se for folha, classifica o subtipo (salario/13/ferias/inss/fgts/...)
          const tipoFolha = origemDocumento === 'folha'
            ? classificarTipoFolha({ codTpDoc: raw.TIPO_DOC, favorecido: raw.FAVORECIDO, competenciaFlp })
            : null;

          // Valor BRUTO = valor dos ITENS desta PARCELA (SUM CPGITDOC.VALORITEMDOC
          // por CODDOCTOCPG). NAO usar VLR_ORIGINAL: em titulos PARCELADOS, a 1a
          // parcela traz no VLR_ORIGINAL o total do DOCUMENTO inteiro (todas as
          // parcelas), nao o valor da parcela. Ex.: RAIZEN AD-0003616 p1 tinha
          // VLR_ORIGINAL=309.332,88 (=243k da p1 + 66k da p2) enquanto os itens da
          // p1 somavam 243.033,46 (o valor correto). VLR_TOTAL_ITENS e por parcela.
          //
          // O acrescimo/desconto entram via multa/desconto: a coluna gerada
          // valor_liquido_cents = bruto - desconto + juros + multa. Logo, p/ o caso
          // FORNECEDORES DIVERSOS (itens 17.109,75 + acrescimo 877,60), o liquido
          // fecha em 17.987,35 sem contar o acrescimo duas vezes.
          //
          // Fallback (titulo sem itens em CPGITDOC): deriva de VLR_ORIGINAL revertendo
          // acrescimo/desconto, p/ o liquido bater com o VLR_ORIGINAL.
          const valorItens =
            raw.VLR_TOTAL_ITENS != null
              ? raw.VLR_TOTAL_ITENS
              : (raw.VLR_ORIGINAL ?? 0) + (raw.DESCONTO ?? 0) - (raw.ACRESCIMO ?? 0);

          // Propaga exclusao do stage para finance.contas_pagar. Se o stage
          // marcou excluido_em (Globus tem STATUS='C'), o titulo aparece como
          // excluido logicamente — UI filtra excluido_em IS NULL por padrao.
          const excluidoEmCanonico = linha.excluidoEm;
          const excluidoMotivoCanonico = linha.excluidoMotivo;

          await cpRepo
            .createQueryBuilder()
            .insert()
            .values({
              empresaId: linha.codigoEmpresa,
              fornecedorId,
              numeroDocumento: raw.NUMERO_DOCUMENTO,
              serieDocumento: raw.SERIE_DOCUMENTO,
              numeroParcela: raw.NUMERO_PARCELA,
              competencia: dateOnly(raw.COMPETENCIA),
              dataEmissao: dateOnly(raw.DATA_EMISSAO),
              dataEntrada: dateOnly(raw.DATA_ENTRADA),
              dataVencimento,
              dataPagamento,
              valorBrutoCents: brlToCents(valorItens),
              descontoCents: brlToCents(raw.DESCONTO),
              jurosCents: '0',
              multaCents: brlToCents(raw.ACRESCIMO),
              status: mapStatus(raw.STATUS_DOCTO, raw.QUITADO, dataPagamento),
              quitado: quitadoBoolean,
              pagamentoLiberado: raw.PAGAMENTO_LIBERADO?.toUpperCase() === 'S',
              observacao: raw.OBSERVACAO,
              tipoDocumento: raw.TIPO_DOC,
              modalidadePagamento: raw.MODALIDADE_PE,
              tipoPagto: raw.TIPO_PAGTO,
              // Favorecido "real" (texto livre) + inscricao do favorecido.
              favorecidoNome: raw.FAVORECIDO_NOME?.trim() || null,
              favorecidoInscricao: raw.NRINSCR_FAV ?? null,
              favorecidoTipoInscricao: raw.TPINSCR_FAV ?? null,
              // Banco que pagou (resolvido no Globus via BCOMOVTO/BCOBANCO) + borderô.
              bancoPagadorCodigo: raw.COD_BANCO_PAG ?? null,
              bancoPagadorNome: raw.BANCO_PAG_NOME?.trim() || null,
              bancoPagadorAgencia: raw.COD_AGENCIA_PAG != null ? String(raw.COD_AGENCIA_PAG) : null,
              bancoPagadorConta: raw.COD_CONTA_PAG?.trim() || null,
              codMovtoBco: raw.COD_MOVTO_BCO != null ? String(raw.COD_MOVTO_BCO) : null,
              pagamentoDoc: raw.PAGAMENTO_DOC?.trim() || null,
              vlrInssCents: brlToCents(raw.VLR_INSS),
              vlrIrrfCents: brlToCents(raw.VLR_IRRF),
              vlrPisCents: brlToCents(raw.VLR_PIS),
              vlrCofinsCents: brlToCents(raw.VLR_COFINS),
              vlrCsllCents: brlToCents(raw.VLR_CSLL),
              vlrIssCents: brlToCents(raw.VLR_ISS),
              dataIntegrouFlp,
              competenciaFlp,
              tipoFolha,
              origemDocumento,
              origemSistema: SISTEMA,
              origemIdExterno: String(raw.COD_DOCTO_CPG),
              ultimoSyncEm: new Date(),
              excluidoEm: excluidoEmCanonico,
              excluidoMotivo: excluidoMotivoCanonico,
              // Trilha de auditoria (logins do Globus + timestamps).
              usuarioInclusao: raw.USUARIO_INCLUSAO,
              dataInclusao: raw.DATA_INCLUSAO,
              usuarioLibPagto: raw.USUARIO_LIB_PAGTO,
              dataLiberacaoPagto: raw.DATA_LIBERACAO_PAGTO,
              usuarioAssinatura: raw.USUARIO_ASSINATURA,
              // Responsavel generico + assinaturas fisicas.
              usuarioResponsavel: raw.USUARIO_RESPONSAVEL,
              assinatura1: raw.ASSINATURA_1,
              assinatura2: raw.ASSINATURA_2,
              // Setor = centro de custo financeiro dominante (CPGITDOC.CODCUSTOFIN
              // + descricao via CPGCUSTOS). COD_SETOR vem como NUMBER do Oracle.
              codSetor: raw.COD_SETOR != null ? String(raw.COD_SETOR) : null,
              setorNome: raw.SETOR_NOME,
              setorRateado: (raw.QTD_SETORES ?? 0) > 1,
            })
            .orUpdate(
              [
                'fornecedor_id',
                'numero_documento',
                'serie_documento',
                'numero_parcela',
                'competencia',
                'data_emissao',
                'data_entrada',
                'data_vencimento',
                'data_pagamento',
                'valor_bruto_cents',
                'desconto_cents',
                'juros_cents',
                'multa_cents',
                'status',
                'pagamento_liberado',
                'observacao',
                'tipo_documento',
                'modalidade_pagamento',
                'tipo_pagto',
                'favorecido_nome',
                'favorecido_inscricao',
                'favorecido_tipo_inscricao',
                'banco_pagador_codigo',
                'banco_pagador_nome',
                'banco_pagador_agencia',
                'banco_pagador_conta',
                'cod_movto_bco',
                'pagamento_doc',
                'vlr_inss_cents',
                'vlr_irrf_cents',
                'vlr_pis_cents',
                'vlr_cofins_cents',
                'vlr_csll_cents',
                'vlr_iss_cents',
                'data_integrou_flp',
                'competencia_flp',
                'tipo_folha',
                'origem_documento',
                'quitado',
                'ultimo_sync_em',
                'excluido_em',
                'excluido_motivo',
                'atualizado_em',
                'usuario_inclusao',
                'data_inclusao',
                'usuario_lib_pagto',
                'data_liberacao_pagto',
                'usuario_assinatura',
                'usuario_responsavel',
                'assinatura_1',
                'assinatura_2',
                'cod_setor',
                'setor_nome',
                'setor_rateado',
              ],
              ['origem_sistema', 'origem_id_externo'],
            )
            .execute();

          linha.processadoEm = new Date();
          await stageRepo.save(linha);
          gravados += 1;
        } catch (err) {
          comErro += 1;
          log.warn({ err, stageId: linha.id }, '[etl:cp] falha ao processar linha');
          const raw = linha.rawPayload as unknown as RawCpRow;
          await registrarErroSync({
            fastify,
            sistema: 'globus',
            recurso: 'contas_pagar',
            fase: 'etl_processamento',
            syncJobId: syncJobId ?? null,
            chaveNatural: {
              cod_docto_cpg: String(raw?.COD_DOCTO_CPG ?? linha.codDoctoCpg),
              codigo_empresa: raw?.CODIGO_EMPRESA ?? linha.codigoEmpresa,
            },
            rawPayload: linha.rawPayload,
            erro: err,
          });
        }

        if ((i + 1) % 500 === 0) {
          log.info({ progresso: i + 1, total: pendentes.length, gravados, comErro }, `[etl:cp] ${i + 1}/${pendentes.length} processados`);
        }
      }

      const duracaoMs = Date.now() - inicio;
      log.info(
        { processados: pendentes.length, gravados, comErro, duracaoMs },
        `[etl:cp] concluido (${gravados}/${pendentes.length} gravados em finance.contas_pagar, ${comErro} erros, ${duracaoMs}ms)`,
      );

      // Quebra por origem detectada - util para debug visual.
      try {
        const origemStats = await cpRepo
          .createQueryBuilder('cp')
          .select('cp.origem_documento', 'origem')
          .addSelect('COUNT(*)', 'qtd')
          .groupBy('cp.origem_documento')
          .getRawMany<{ origem: string; qtd: string }>();
        log.info(
          { origens: origemStats.map((s) => `${s.origem}=${s.qtd}`).join(', ') },
          `[etl:cp] distribuicao por origem: ${origemStats.map((s) => `${s.origem}=${s.qtd}`).join(', ')}`,
        );
      } catch (err) {
        log.warn({ err }, '[etl:cp] falha ao calcular estatistica de origem (nao critico)');
      }

      return { processados: pendentes.length, gravados, comErro };
    },
  };
}

export type ContasPagarEtl = ReturnType<typeof buildContasPagarEtl>;
