import type { FastifyInstance } from 'fastify';
import { IsNull } from 'typeorm';
import { GlobusCrcStage } from '@/entities/globus-crc-stage.entity.js';
import { GlobusCrcClienteStage } from '@/entities/globus-crc-cliente-stage.entity.js';
import { dataIsoSpOuNull } from '@/shared/utils/datetime.js';

interface ETLResult {
  clientesProcessados: number;
  titulosProcessados: number;
  itensProcessados: number;
  /** Linhas que FALHARAM ao gravar (lote atômico caiu). Diagnóstico. */
  clientesComErro: number;
  titulosComErro: number;
  /** Detalhe do 1º erro de gravação, pra expor na UI (não deixa falhar em silêncio). */
  erroDetalhe: string | null;
  duracaoMs: number;
}

interface RawCliente {
  COD_CLI: number | string;
  NR_CLI: string | null;
  RAZAO_SOCIAL: string | null;
  NOME_FANTASIA: string | null;
  TIPO_INSCRICAO: string | null;
  NUMERO_INSCRICAO: string | null;
  INSC_ESTADUAL: string | null;
  INSC_MUNICIPAL: string | null;
  EMAIL: string | null;
  TELEFONE: string | null;
  ENDERECO: string | null;
  BAIRRO: string | null;
  CIDADE: string | null;
  UF: string | null;
  CEP: string | null;
  CONDICAO: string | null;
  DATA_CADASTRO: string | null;
  ULTIMO_MOVTO: string | null;
  BANCO_FAT: number | string | null;
  AGENCIA_FAT: number | string | null;
  CONTA_FAT: string | null;
}

interface RawTitulo {
  COD_DOCTO_CRC: number;
  CODIGO_EMPRESA: number;
  COD_CLI: number;
  NUMERO_DOCUMENTO: string | null;
  SERIE_DOCUMENTO: string | null;
  NUMERO_PARCELA: number | null;
  TIPO_DOCUMENTO: string | null;
  DATA_EMISSAO: string | null;
  DATA_SAIDA: string | null;
  DATA_VENCIMENTO: string;
  DATA_VENCIMENTO_ORIGINAL: string | null;
  DATA_RECEBIMENTO: string | null;
  DESCONTO: number | null;
  ACRESCIMO: number | null;
  STATUS_DOCTO: string;
  QUITADO: string | null;
  RENEGOCIADO: string | null;
  PROTESTADO: string | null;
  DATA_PROTESTO: string | null;
  VLR_INSS: number | null;
  VLR_IRRF: number | null;
  VLR_PIS: number | null;
  VLR_COFINS: number | null;
  VLR_CSLL: number | null;
  VLR_ISS: number | null;
  BANCO_COBRANCA: number | null;
  AGENCIA_COBRANCA: number | null;
  CONTA_COBRANCA: string | null;
  NOSSO_NUMERO: string | null;
  COBELETRONICA_STATUS: string | null;
  MSG_BOLETO: string | null;
  FATURA_IMPRESSA: string | null;
  CARTAO_AUTORIZACAO: string | null;
  CARTAO_TID: string | null;
  CARTAO_PARCELAS: number | null;
  OBSERVACAO: string | null;
  USUARIO_INCLUSAO: string | null;
  SISTEMA_ORIGEM: string | null;
  VLR_TOTAL_ITENS: number | null;
}

interface RawItem {
  COD_DOCTO_CRC: number;
  COD_ITEM_DOC: number;
  VALOR_ITEM: number;
  COD_TP_RECEITA: string | null;
  CONTA_CONTABIL: number | null;
  CENTRO_CUSTO: number | null;
  CENTRO_CUSTO_FIN: number | null;
  OBSERVACAO: string | null;
  ITEM_RATEADO: string | null;
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

// Adapter pra unknown: trata strings ja formatadas YYYY-MM-DD literais (fast-path)
// e delega o resto pro utilitario que normaliza em TZ America/Sao_Paulo e
// remove sentinelas <1950.
const dataIso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
      const prefixo = v.slice(0, 10);
      return prefixo < '1950-01-01' ? null : prefixo;
    }
    return dataIsoSpOuNull(v);
  }
  if (v instanceof Date) return dataIsoSpOuNull(v);
  return dataIsoSpOuNull(String(v));
};

const toCents = (v: number | null | undefined): string => {
  if (v === null || v === undefined) return '0';
  return String(Math.round(v * 100));
};

const bool = (v: unknown): boolean => {
  if (typeof v === 'string') return v.trim().toUpperCase() === 'S';
  return Boolean(v);
};

const BATCH = 500;
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Mapeia STATUSDOCTOCRC ('B','N','C') + flags para nosso enum. */
function mapStatus(raw: RawTitulo): 'aberto' | 'pago' | 'cancelado' | 'renegociado' | 'protestado' {
  const s = (raw.STATUS_DOCTO ?? 'N').toUpperCase();
  if (s === 'C') return 'cancelado';
  if (bool(raw.PROTESTADO) && !raw.DATA_RECEBIMENTO) return 'protestado';
  if (bool(raw.QUITADO) || raw.DATA_RECEBIMENTO) return 'pago';
  if (s === 'B' && !raw.DATA_RECEBIMENTO) return 'pago'; // B = baixado
  if (bool(raw.RENEGOCIADO)) return 'renegociado';
  return 'aberto';
}

export function buildCrcEtl(fastify: FastifyInstance) {
  const stageRepo = fastify.db.getRepository(GlobusCrcStage);
  const clienteStageRepo = fastify.db.getRepository(GlobusCrcClienteStage);

  return {
    async processar(): Promise<ETLResult> {
      const inicio = Date.now();
      const log = fastify.log.child({ etl: 'crc' });

      // ============ 1) CLIENTES ============
      const clientesPendentes = await clienteStageRepo.find({
        where: { processadoEm: IsNull() },
        take: 20000,
      });
      log.info({ pendentes: clientesPendentes.length }, '[etl:crc] processando clientes…');

      let clientesOk = 0;
      let clientesComErro = 0;
      let titulosComErro = 0;
      let erroDetalhe: string | null = null;
      for (const lote of chunk(clientesPendentes, BATCH)) {
        const valores: string[] = [];
        const params: unknown[] = [];
        let p = 1;
        for (const stage of lote) {
          const raw = stage.rawPayload as unknown as RawCliente;
          valores.push(
            `($${p}::int, 'globus', $${p + 1}::varchar, $${p + 2}::varchar, $${p + 3}::varchar, ` +
            `$${p + 4}::varchar, $${p + 5}::varchar, $${p + 6}::varchar, $${p + 7}::varchar, ` +
            `$${p + 8}::varchar, $${p + 9}::varchar, $${p + 10}::varchar, $${p + 11}::varchar, ` +
            `$${p + 12}::varchar, $${p + 13}::varchar, $${p + 14}::varchar, ` +
            `$${p + 15}::boolean, $${p + 16}::varchar, $${p + 17}::varchar, $${p + 18}::varchar, ` +
            `$${p + 19}::date, $${p + 20}::date, NOW())`,
          );
          params.push(
            1, // empresa_id
            str(raw.COD_CLI) ?? '',
            str(raw.RAZAO_SOCIAL) ?? `Cliente ${raw.COD_CLI}`,
            str(raw.NOME_FANTASIA),
            str(raw.TIPO_INSCRICAO),
            str(raw.NUMERO_INSCRICAO),
            str(raw.INSC_ESTADUAL),
            str(raw.INSC_MUNICIPAL),
            str(raw.EMAIL),
            str(raw.TELEFONE),
            str(raw.ENDERECO),
            str(raw.BAIRRO),
            str(raw.CIDADE),
            str(raw.UF),
            str(raw.CEP),
            (str(raw.CONDICAO) ?? 'A') === 'A',
            str(raw.BANCO_FAT),
            str(raw.AGENCIA_FAT),
            str(raw.CONTA_FAT),
            dataIso(raw.DATA_CADASTRO),
            dataIso(raw.ULTIMO_MOVTO),
          );
          p += 21;
        }
        try {
          await clienteStageRepo.query(
            `INSERT INTO finance.clientes
               (empresa_id, origem_sistema, cod_cli, razao_social, nome_fantasia,
                tipo_inscricao, numero_inscricao, inscricao_estadual, inscricao_municipal,
                email, telefone, endereco, bairro, cidade, uf, cep,
                ativo, banco_padrao, agencia_padrao, conta_padrao,
                data_cadastro, ultimo_movto, ultimo_sync_em)
             VALUES ${valores.join(',')}
             ON CONFLICT (origem_sistema, cod_cli)
             DO UPDATE SET razao_social = EXCLUDED.razao_social,
                           nome_fantasia = EXCLUDED.nome_fantasia,
                           numero_inscricao = EXCLUDED.numero_inscricao,
                           email = EXCLUDED.email,
                           telefone = EXCLUDED.telefone,
                           endereco = EXCLUDED.endereco,
                           bairro = EXCLUDED.bairro,
                           cidade = EXCLUDED.cidade,
                           uf = EXCLUDED.uf,
                           cep = EXCLUDED.cep,
                           ativo = EXCLUDED.ativo,
                           banco_padrao = EXCLUDED.banco_padrao,
                           agencia_padrao = EXCLUDED.agencia_padrao,
                           conta_padrao = EXCLUDED.conta_padrao,
                           ultimo_movto = EXCLUDED.ultimo_movto,
                           ultimo_sync_em = NOW(),
                           atualizado_em = NOW()`,
            params,
          );
          await clienteStageRepo
            .createQueryBuilder()
            .update()
            .set({ processadoEm: new Date() })
            .whereInIds(lote.map((s) => s.id))
            .execute();
          clientesOk += lote.length;
        } catch (err) {
          const e = err as Error & { code?: string; detail?: string };
          clientesComErro += lote.length;
          erroDetalhe = erroDetalhe ?? e.detail ?? e.message ?? null;
          log.error({ err, code: e.code, detail: e.detail, loteSize: lote.length }, '[etl:crc] FALHA lote cliente');
        }
      }

      // ============ 2) TÍTULOS + ITENS ============
      let titulosOk = 0;
      let itensOk = 0;
      let chunkLido: number;
      do {
        const pendentes = await stageRepo.find({
          where: { processadoEm: IsNull() },
          take: 2000,
        });
        chunkLido = pendentes.length;
        if (chunkLido === 0) break;
        log.info({ chunk: chunkLido }, '[etl:crc] processando títulos (chunk)…');

        for (const lote of chunk(pendentes, BATCH)) {
          // Map para depois processar itens com o ID gerado.
          const valoresSql: string[] = [];
          const params: unknown[] = [];
          let p = 1;
          for (const stage of lote) {
            const raw = stage.rawPayload as unknown as RawTitulo;
            const inss = toCents(raw.VLR_INSS);
            const irrf = toCents(raw.VLR_IRRF);
            const pis = toCents(raw.VLR_PIS);
            const cofins = toCents(raw.VLR_COFINS);
            const csll = toCents(raw.VLR_CSLL);
            const iss = toCents(raw.VLR_ISS);
            const desconto = toCents(raw.DESCONTO);
            const acrescimo = toCents(raw.ACRESCIMO);
            const valorBruto = toCents(raw.VLR_TOTAL_ITENS);
            const status = mapStatus(raw);
            const dataVenc = dataIso(raw.DATA_VENCIMENTO);
            const dataRecb = dataIso(raw.DATA_RECEBIMENTO);

            // Chave natural: origem_id_externo = "{codigo_empresa}|{cod_docto_crc}"
            const origemIdExterno = `${raw.CODIGO_EMPRESA}|${raw.COD_DOCTO_CRC}`;

            valoresSql.push(
              `((SELECT id FROM finance.clientes WHERE origem_sistema='globus' AND cod_cli=$${p}),` +
              `$${p + 1}::int, $${p + 2}::varchar, $${p + 3}::varchar, $${p + 4}::int, $${p + 5}::varchar, ` +
              `$${p + 6}::date, $${p + 7}::date, $${p + 8}::date, $${p + 9}::date, $${p + 10}::date, ` +
              `$${p + 11}::bigint, $${p + 12}::bigint, $${p + 13}::bigint, ` +
              `$${p + 14}::bigint, $${p + 15}::bigint, $${p + 16}::bigint, $${p + 17}::bigint, $${p + 18}::bigint, $${p + 19}::bigint, ` +
              `$${p + 20}::varchar, $${p + 21}::boolean, $${p + 22}::boolean, $${p + 23}::boolean, $${p + 24}::date, ` +
              `$${p + 25}::varchar, $${p + 26}::varchar, $${p + 27}::varchar, $${p + 28}::varchar, $${p + 29}::varchar, $${p + 30}::varchar, $${p + 31}::boolean, ` +
              `$${p + 32}::varchar, $${p + 33}::varchar, $${p + 34}::int, ` +
              `$${p + 35}::varchar, $${p + 36}::varchar, $${p + 37}::varchar, $${p + 38}::varchar, NOW())`,
            );
            params.push(
              String(raw.COD_CLI),                // p
              raw.CODIGO_EMPRESA,                  // p+1
              str(raw.NUMERO_DOCUMENTO),           // p+2
              str(raw.SERIE_DOCUMENTO),            // p+3
              raw.NUMERO_PARCELA,                  // p+4
              str(raw.TIPO_DOCUMENTO),             // p+5
              dataIso(raw.DATA_EMISSAO),           // p+6
              dataIso(raw.DATA_SAIDA),             // p+7
              dataVenc,                            // p+8
              dataIso(raw.DATA_VENCIMENTO_ORIGINAL), // p+9
              dataRecb,                            // p+10
              valorBruto,                          // p+11
              desconto,                            // p+12
              acrescimo,                           // p+13
              inss, irrf, pis, cofins, csll, iss,  // p+14..p+19
              status,                              // p+20
              bool(raw.QUITADO),                   // p+21
              bool(raw.RENEGOCIADO),               // p+22
              bool(raw.PROTESTADO),                // p+23
              dataIso(raw.DATA_PROTESTO),          // p+24
              str(raw.BANCO_COBRANCA),             // p+25
              str(raw.AGENCIA_COBRANCA),           // p+26
              str(raw.CONTA_COBRANCA),             // p+27
              str(raw.NOSSO_NUMERO),               // p+28
              str(raw.COBELETRONICA_STATUS),       // p+29
              str(raw.MSG_BOLETO),                 // p+30
              bool(raw.FATURA_IMPRESSA),           // p+31
              str(raw.CARTAO_AUTORIZACAO),         // p+32
              str(raw.CARTAO_TID),                 // p+33
              raw.CARTAO_PARCELAS,                 // p+34
              str(raw.OBSERVACAO),                 // p+35
              str(raw.USUARIO_INCLUSAO),           // p+36
              str(raw.SISTEMA_ORIGEM),             // p+37
              origemIdExterno,                     // p+38
            );
            p += 39;
          }

          try {
            await stageRepo.query(
              `INSERT INTO finance.contas_receber
                 (cliente_id, empresa_id, numero_documento, serie_documento, numero_parcela, tipo_documento,
                  data_emissao, data_saida, data_vencimento, data_vencimento_original, data_recebimento,
                  valor_bruto_cents, desconto_cents, acrescimo_cents,
                  vlr_inss_cents, vlr_irrf_cents, vlr_pis_cents, vlr_cofins_cents, vlr_csll_cents, vlr_iss_cents,
                  status, quitado, renegociado, protestado, data_protesto,
                  banco_cobranca, agencia_cobranca, conta_cobranca, nosso_numero, cobeletronica_status, msg_boleto, fatura_impressa,
                  cartao_autorizacao, cartao_tid, cartao_parcelas,
                  observacao, usuario_inclusao, sistema_origem_praxio, origem_id_externo, ultimo_sync_em)
               VALUES ${valoresSql.join(',')}
               ON CONFLICT (origem_sistema, origem_id_externo)
               DO UPDATE SET cliente_id = EXCLUDED.cliente_id,
                             numero_documento = EXCLUDED.numero_documento,
                             serie_documento = EXCLUDED.serie_documento,
                             numero_parcela = EXCLUDED.numero_parcela,
                             tipo_documento = EXCLUDED.tipo_documento,
                             data_emissao = EXCLUDED.data_emissao,
                             data_saida = EXCLUDED.data_saida,
                             data_vencimento = EXCLUDED.data_vencimento,
                             data_vencimento_original = EXCLUDED.data_vencimento_original,
                             data_recebimento = EXCLUDED.data_recebimento,
                             valor_bruto_cents = EXCLUDED.valor_bruto_cents,
                             desconto_cents = EXCLUDED.desconto_cents,
                             acrescimo_cents = EXCLUDED.acrescimo_cents,
                             vlr_inss_cents = EXCLUDED.vlr_inss_cents,
                             vlr_irrf_cents = EXCLUDED.vlr_irrf_cents,
                             vlr_pis_cents = EXCLUDED.vlr_pis_cents,
                             vlr_cofins_cents = EXCLUDED.vlr_cofins_cents,
                             vlr_csll_cents = EXCLUDED.vlr_csll_cents,
                             vlr_iss_cents = EXCLUDED.vlr_iss_cents,
                             status = EXCLUDED.status,
                             quitado = EXCLUDED.quitado,
                             renegociado = EXCLUDED.renegociado,
                             protestado = EXCLUDED.protestado,
                             data_protesto = EXCLUDED.data_protesto,
                             banco_cobranca = EXCLUDED.banco_cobranca,
                             agencia_cobranca = EXCLUDED.agencia_cobranca,
                             conta_cobranca = EXCLUDED.conta_cobranca,
                             nosso_numero = EXCLUDED.nosso_numero,
                             cobeletronica_status = EXCLUDED.cobeletronica_status,
                             msg_boleto = EXCLUDED.msg_boleto,
                             fatura_impressa = EXCLUDED.fatura_impressa,
                             cartao_autorizacao = EXCLUDED.cartao_autorizacao,
                             cartao_tid = EXCLUDED.cartao_tid,
                             cartao_parcelas = EXCLUDED.cartao_parcelas,
                             observacao = EXCLUDED.observacao,
                             ultimo_sync_em = NOW(),
                             atualizado_em = NOW()`,
              params,
            );
            titulosOk += lote.length;

            // Garante que todos COD_TP_RECEITA usados pelos itens existam em
            // finance.tipos_receita (constraint FK). Códigos novos entram com
            // descrição placeholder — um sync futuro de tipos_receita pode
            // atualizar com a descrição real do Globus.
            const codigosTp = new Set<string>();
            for (const stage of lote) {
              const itens = (stage.rawItens ?? []) as unknown as RawItem[];
              for (const item of itens) {
                const cod = str(item.COD_TP_RECEITA);
                if (cod) codigosTp.add(cod);
              }
            }
            if (codigosTp.size > 0) {
              const codArr = Array.from(codigosTp);
              const values = codArr.map((_, i) => `($${i + 1}, '(sync pendente)', 'globus')`).join(',');
              await stageRepo.query(
                `INSERT INTO finance.tipos_receita (cod_tp_receita, descricao, origem_sistema)
                 VALUES ${values}
                 ON CONFLICT (cod_tp_receita) DO NOTHING`,
                codArr,
              );
            }

            // Após inserir títulos, processa itens — usa origem_id_externo do JSONB raw_itens
            // pra fazer SELECT id e bulk-insert na contas_receber_itens.
            for (const stage of lote) {
              const raw = stage.rawPayload as unknown as RawTitulo;
              const itens = (stage.rawItens ?? []) as unknown as RawItem[];
              if (itens.length === 0) continue;
              const itemValores: string[] = [];
              const itemParams: unknown[] = [];
              let q = 1;
              const origemIdExterno = `${raw.CODIGO_EMPRESA}|${raw.COD_DOCTO_CRC}`;
              for (const item of itens) {
                const itemOrigemId = `${raw.CODIGO_EMPRESA}|${raw.COD_DOCTO_CRC}|${item.COD_ITEM_DOC}`;
                itemValores.push(
                  `((SELECT id FROM finance.contas_receber WHERE origem_sistema='globus' AND origem_id_externo=$${q}), ` +
                  `$${q + 1}::varchar, $${q + 2}::varchar, $${q + 3}::varchar, $${q + 4}::varchar, ` +
                  `$${q + 5}::varchar, $${q + 6}::bigint, $${q + 7}::boolean, $${q + 8}::varchar)`,
                );
                itemParams.push(
                  origemIdExterno,
                  str(item.COD_TP_RECEITA),
                  str(item.CONTA_CONTABIL),
                  str(item.CENTRO_CUSTO),
                  str(item.CENTRO_CUSTO_FIN),
                  str(item.OBSERVACAO),
                  toCents(item.VALOR_ITEM),
                  bool(item.ITEM_RATEADO),
                  itemOrigemId,
                );
                q += 9;
              }
              if (itemValores.length > 0) {
                try {
                  await stageRepo.query(
                    `INSERT INTO finance.contas_receber_itens
                       (conta_receber_id, cod_tp_receita, conta_contabil, centro_custo, centro_custo_fin,
                        observacao, valor_cents, item_rateado, origem_id_externo)
                     VALUES ${itemValores.join(',')}
                     ON CONFLICT (conta_receber_id, origem_id_externo)
                     DO UPDATE SET cod_tp_receita = EXCLUDED.cod_tp_receita,
                                   conta_contabil = EXCLUDED.conta_contabil,
                                   centro_custo = EXCLUDED.centro_custo,
                                   centro_custo_fin = EXCLUDED.centro_custo_fin,
                                   valor_cents = EXCLUDED.valor_cents,
                                   item_rateado = EXCLUDED.item_rateado`,
                    itemParams,
                  );
                  itensOk += itens.length;
                } catch (err) {
                  log.warn({ err, codDocto: raw.COD_DOCTO_CRC }, '[etl:crc] falha em itens');
                }
              }
            }

            // Propaga excluido_em / excluido_motivo do stage para o domain,
            // usando origem_id_externo (chave natural ja gravada em ambos).
            const idsParaPropagacao = lote.map((s) => {
              const raw = s.rawPayload as unknown as RawTitulo;
              return `${raw.CODIGO_EMPRESA}|${raw.COD_DOCTO_CRC}`;
            });
            if (idsParaPropagacao.length > 0) {
              await stageRepo.query(
                `UPDATE finance.contas_receber cr
                    SET excluido_em = s.excluido_em,
                        excluido_motivo = s.excluido_motivo
                   FROM integration.globus_crc_stage s
                  WHERE cr.origem_sistema = 'globus'
                    AND cr.origem_id_externo = ANY($1::varchar[])
                    AND s.codigo_empresa::text || '|' || s.cod_docto_crc = cr.origem_id_externo
                    AND (cr.excluido_em IS DISTINCT FROM s.excluido_em
                         OR cr.excluido_motivo IS DISTINCT FROM s.excluido_motivo)`,
                [idsParaPropagacao],
              );
            }

            await stageRepo
              .createQueryBuilder()
              .update()
              .set({ processadoEm: new Date() })
              .whereInIds(lote.map((s) => s.id))
              .execute();
          } catch (err) {
            const e = err as Error & { code?: string; detail?: string };
            titulosComErro += lote.length;
            erroDetalhe = erroDetalhe ?? e.detail ?? e.message ?? null;
            log.error({ err, code: e.code, detail: e.detail, loteSize: lote.length }, '[etl:crc] FALHA lote título');
          }
        }
      } while (chunkLido === 2000);

      const duracaoMs = Date.now() - inicio;
      log.info(
        { clientesProcessados: clientesOk, titulosProcessados: titulosOk, itensProcessados: itensOk, duracaoMs },
        `[etl:crc] concluído em ${duracaoMs}ms`,
      );
      return {
        clientesProcessados: clientesOk,
        titulosProcessados: titulosOk,
        itensProcessados: itensOk,
        clientesComErro,
        titulosComErro,
        erroDetalhe,
        duracaoMs,
      };
    },
  };
}

export type CrcEtl = ReturnType<typeof buildCrcEtl>;
