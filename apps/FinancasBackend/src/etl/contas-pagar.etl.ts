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

/**
 * Parseia a quebra do rateio vinda do Globus (LISTAGG): "codigo|nome|centavos;..." ->
 * lista de unidades. Centavos ja vem inteiro (TO_CHAR(ROUND(valor*100)) na query).
 */
function parseRateioSetores(
  s: string | null | undefined,
): Array<{ codigo: string; nome: string | null; valorCents: number }> {
  if (!s) return [];
  return s
    .split(';')
    .map((parte) => {
      const [codigo, nome, cents] = parte.split('|');
      return {
        codigo: (codigo ?? '').trim(),
        nome: nome?.trim() || null,
        valorCents: Math.round(Number(cents ?? 0)) || 0,
      };
    })
    .filter((r) => r.codigo.length > 0);
}

/**
 * Parseia a quebra por CONTA CONTABIL vinda do Globus (LISTAGG): "classificador|nome|
 * centavos;..." -> lista de contas. Mesmo formato do rateio de setor, mas o "codigo" e o
 * classificador contabil (ex "3.1.01.09.0603") e o nome e a NOMECONTA (ex "CONSERTOS E
 * REFORMAS"). Centavos ja vem inteiro (TO_CHAR(ROUND(valor*100)) na query).
 */
function parseRateioContas(
  s: string | null | undefined,
): Array<{ classificador: string; nome: string | null; valorCents: number }> {
  if (!s) return [];
  return s
    .split(';')
    .map((parte) => {
      const [classificador, nome, cents] = parte.split('|');
      return {
        classificador: (classificador ?? '').trim(),
        nome: nome?.trim() || null,
        valorCents: Math.round(Number(cents ?? 0)) || 0,
      };
    })
    .filter((r) => r.classificador.length > 0);
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

/**
 * Status do titulo. A FONTE E O `STATUSDOCTOCPG` — a maquina de estados do
 * proprio Globus: N=em aberto · B=baixado(pago) · C=cancelado.
 *
 * ANTES esta funcao decidia por `QUITADO`/`data_pagamento` e so olhava o
 * STATUSDOCTOCPG no fim. Isso produzia divergencia com o ERP em dois casos
 * reais (investigacao de 23/07/2026, ver Leia/cp-status-divergencia-globus.md):
 *
 *  1. "Cancelamento de pagamento" no Globus devolve o titulo para N e limpa a
 *     data, mas DEIXA `QUITADO='S'` residual. Confiando no QUITADO, mostravamos
 *     PAGO um titulo que o ERP tem em aberto (3 titulos, R$ 15.725,60).
 *  2. Titulo baixado (B) sem data de pagamento preenchida aparecia como
 *     pendente (6 titulos da RAIZEM, R$ 927.998,64).
 *
 * `QUITADO` NAO e sinal de compensacao: fica 'N' em 32-41% dos pagamentos em
 * TODOS os meses analisados (19 meses) — e campo que a operacao nao preenche
 * de forma consistente, varia por modalidade. Nao usar para decidir pagamento.
 */
function mapStatus(statusDocto: string, quitado: string | null, dataPagamentoIso: string | null): ContaPagarStatus {
  const s = statusDocto?.toUpperCase() ?? '';
  if (s === 'C') return 'cancelado';
  if (s === 'B') return 'pago';      // baixado no Globus = pago, com ou sem QUITADO
  if (s === 'F') return 'aprovado';
  if (s === 'A' || s === 'N') return 'pendente';

  // Status desconhecido/vazio: cai no comportamento antigo para nao regredir.
  if (quitado?.toUpperCase() === 'S' || dataPagamentoIso) return 'pago';
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

          // Detecta PRORROGAÇÃO: lê o vencimento que já temos ANTES de sobrescrever.
          // Só os títulos tocados chegam aqui (hash mudou), então o custo é baixo.
          const existente = await cpRepo.findOne({
            where: { origemSistema: SISTEMA, origemIdExterno: String(raw.COD_DOCTO_CPG) },
            select: { dataVencimento: true, vencimentoAnterior: true, teveProrrogacao: true },
          });
          const mudouVencimento = !!existente && existente.dataVencimento !== dataVencimento;
          // Guarda a data ANTIGA no "anterior" e marca a flag. Se já tinha
          // prorrogação, mantém a flag ligada.
          const vencimentoAnterior = mudouVencimento ? existente!.dataVencimento : (existente?.vencimentoAnterior ?? null);
          const teveProrrogacao = (existente?.teveProrrogacao ?? false)
            || (mudouVencimento && dataVencimento > existente!.dataVencimento);
          const vencimentoAlteradoEm = mudouVencimento ? new Date() : undefined;

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

          const valoresLinha = {
              empresaId: linha.codigoEmpresa,
              fornecedorId,
              numeroDocumento: raw.NUMERO_DOCUMENTO,
              serieDocumento: raw.SERIE_DOCUMENTO,
              numeroParcela: raw.NUMERO_PARCELA,
              competencia: dateOnly(raw.COMPETENCIA),
              dataEmissao: dateOnly(raw.DATA_EMISSAO),
              dataEntrada: dateOnly(raw.DATA_ENTRADA),
              dataVencimento,
              vencimentoAnterior,
              vencimentoAlteradoEm,
              teveProrrogacao,
              dataPagamento,
              valorBrutoCents: brlToCents(valorItens),
              descontoCents: brlToCents(raw.DESCONTO),
              jurosCents: '0',
              multaCents: brlToCents(raw.ACRESCIMO),
              status: mapStatus(raw.STATUS_DOCTO, raw.QUITADO, dataPagamento),
              quitado: quitadoBoolean,
              // QUITADO real do Globus, SEM o override de data_pagamento — preserva o
              // 'N' de pagamentos aceitos mas nao compensados (devolvidos). Ver SFN-48 (retorno).
              quitadoGlobus: raw.QUITADO?.toUpperCase() === 'S',
              statusDoctoGlobus: raw.STATUS_DOCTO?.toUpperCase()?.slice(0, 1) ?? null,
              pagamentoLiberado: raw.PAGAMENTO_LIBERADO?.toUpperCase() === 'S',
              observacao: raw.OBSERVACAO,
              tipoDocumento: raw.TIPO_DOC,
              modalidadePagamento: raw.MODALIDADE_PE,
              tipoPagto: raw.TIPO_PAGTO,
              // Substituicao: CODDOCTOCPGSUBST preenchido = este e o titulo ANTIGO
              // (substituido pelo sucessor). Marca pra sair das somas. Ver SFN-48.
              substituido: raw.COD_DOCTO_CPG_SUBST != null,
              substituidoPorCod: raw.COD_DOCTO_CPG_SUBST != null ? String(raw.COD_DOCTO_CPG_SUBST) : null,
              // Confirmacao do pagamento eletronico (comprovante + status PE).
              autenticacaoEletronica: raw.AUT_ELETRONICA?.trim() || null,
              statusPe: raw.STATUS_PE?.trim() || null,
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
              // Remessa enviada ao banco (pagamento eletronico). Borderô/cheque vem null.
              numeroRemessa: raw.NRO_REMESSA_PE?.trim() || null,
              dataRemessa: raw.DT_REMESSA_PE ?? null,
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
              // Quebra do rateio (por unidade) + codigos de todas as unidades pro filtro.
              rateioSetores: (() => {
                const r = parseRateioSetores(raw.RATEIO_SETORES);
                return r.length > 0 ? r : null;
              })(),
              setoresCodigos: (() => {
                const r = parseRateioSetores(raw.RATEIO_SETORES);
                if (r.length > 0) return r.map((u) => u.codigo);
                return raw.COD_SETOR != null ? [String(raw.COD_SETOR)] : null;
              })(),
              // Quebra por conta contabil (natureza da despesa) — eixo diferente do setor.
              rateioContas: (() => {
                const r = parseRateioContas(raw.RATEIO_CONTAS);
                return r.length > 0 ? r : null;
              })(),
            };

          // Lista de colunas do UPDATE (on conflict) DERIVADA do proprio objeto de
          // INSERT — nao existe mais uma segunda lista mantida a mao. Isso elimina
          // estruturalmente a classe de bug em que um campo novo (ou existente)
          // fica de fora do UPDATE por esquecimento: foi exatamente isso que
          // congelou `status_docto_globus` no valor do 1o sync pra sempre — a
          // Conferencia com o Globus acusava R$ 640k de divergencia mesmo com os
          // totais (que usam `status`, que ESTAVA na lista) corretos. Achado e
          // corrigido em 30/07/2026. Ver teste em contas-pagar.etl.test.ts.
          const NAO_ATUALIZAR = new Set<string>(['empresaId', 'origemSistema', 'origemIdExterno']);
          const colunasUpdate = Object.keys(valoresLinha)
            .filter((k) => !NAO_ATUALIZAR.has(k))
            .map((k) => {
              const col = cpRepo.metadata.findColumnWithPropertyName(k);
              if (!col) throw new Error(`[etl:cp] coluna "${k}" de valoresLinha nao existe na entidade ContaPagar`);
              return col.databaseName;
            });
          // atualizado_em e @UpdateDateColumn (TypeORM gera o valor sozinho, nao
          // fica em valoresLinha) — precisa entrar no UPDATE pra refletir o resync.
          colunasUpdate.push('atualizado_em');

          await cpRepo
            .createQueryBuilder()
            .insert()
            .values(valoresLinha)
            .orUpdate(colunasUpdate, ['origem_sistema', 'origem_id_externo'])
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
