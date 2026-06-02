import type { FastifyInstance } from 'fastify';
import { GlobusFlpFuncStage } from '@/entities/globus-flp-func-stage.entity.js';
import { GlobusFlpEventoStage } from '@/entities/globus-flp-evento-stage.entity.js';
import { GlobusFlpFichaStage } from '@/entities/globus-flp-ficha-stage.entity.js';

interface ETLResultado {
  funcionariosProcessados: number;
  eventosProcessados: number;
  fichasProcessadas: number;
  duracaoMs: number;
}

interface RawFunc {
  COD_INT_FUNC: number | string;
  COD_FUNC: number | string;
  NOME: string | null;
  COD_AREA: number | string | null;
  DESC_AREA: string | null;
  COD_DEPTO: number | string | null;
  DESC_FUNCAO: string | null;
  COD_AGENCIA: string | null;
  CONTA_CORRENTE: string | null;
  CODIGO_EMPRESA: number;
}

interface RawEvento {
  COD_EVENTO: number;
  DESCRICAO: string | null;
  TIPO: string | null;
}

interface RawFicha {
  COD_INT_FUNC: number | string;
  COD_EVENTO: number;
  COMPETENCIA: string;
  TIPO_FOLHA: number;
  REFERENCIA: number | null;
  VALOR: number | null;
}

/**
 * Classifica um evento da folha em grupos lógicos pelo padrão da descrição.
 * Quando os códigos exatos da Pioneira forem conhecidos, podemos sobrepor por CODEVENTO.
 */
function classificarGrupoEvento(codEvento: number, desc: string | null, tipo: string): string {
  // Bases conhecidas (TIPOEVEN='B') usadas pela consulta de contra-cheque.
  if (tipo === 'B') {
    if ([300, 315, 318, 319, 322, 330, 500].includes(codEvento)) return 'base';
    if (codEvento === 508) return 'fgts'; // FGTS calculado é base, mas conceitualmente é FGTS
    return 'base';
  }

  const d = (desc ?? '').toUpperCase();
  if (/INSS/i.test(d)) return 'inss';
  if (/FGTS/i.test(d)) return 'fgts';
  if (/IRRF|IMP\.?\s*RENDA|IRPF/i.test(d)) return 'irrf';
  if (/VALE.?TRANSP|\bVT\b|PASSE LIVRE|BILHETE/i.test(d)) return 'vt';
  if (/VALE.?ALIM|\bVA\b|VALE.?REFEI|\bVR\b|SODEXO|ALELO|TICKET/i.test(d)) return 'va';
  if (/SINDICAL|SIND\b|CONFEDERA/i.test(d)) return 'sindical';
  if (/PENSÃO|PENSAO|ALIMENT[ÍI]CIA|JUDICIAL/i.test(d)) return 'pensao';
  if (/ADIANT|VALE\b/i.test(d)) return 'adiantamento';
  if (/F[ÉE]RIAS/i.test(d)) return 'ferias';
  if (/13[ºO°]?\s*SAL|D[ÉE]CIMO\s*TERC|GRATIF.?\s*NATAL/i.test(d)) return 'decimo_terceiro';
  if (/RESCIS/i.test(d)) return 'rescisao';
  if (/HORA\s*EXTRA|H\.?\s*EXTRA|\bHE\b/i.test(d)) return 'hora_extra';
  if (/ADIC\.?\s*NOTUR|NOTURN/i.test(d)) return 'adicional_noturno';
  if (/INSAL/i.test(d)) return 'insalubridade';
  if (/PERIC/i.test(d)) return 'periculosidade';
  if (/SAL[ÁA]RIO|SAL\.?\s*BASE|VENCIMENTO/i.test(d)) return 'salario';
  if (/PR[ÊE]MIO|GRATIF/i.test(d)) return 'premio';
  if (/COMISS/i.test(d)) return 'comissao';
  if (/FALTA|DESC\.?\s*FALTA/i.test(d)) return 'falta';
  if (/SA[ÚU]DE|PLANO|CONV[ÊE]NIO/i.test(d)) return 'saude';
  if (/EMPR[ÉE]ST|CONSIGN/i.test(d)) return 'consignado';
  return tipo === 'P' ? 'outros_proventos' : tipo === 'D' ? 'outros_descontos' : 'outros';
}

/**
 * Converte valor numérico em reais para centavos (BIGINT como string).
 * Pode vir como NUMBER do Oracle (1234.56) → '123456'.
 */
function paraCentavos(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '0';
  return String(Math.round(valor * 100));
}

export function buildFolhaFlpEtl(fastify: FastifyInstance) {
  const funcStageRepo = fastify.db.getRepository(GlobusFlpFuncStage);
  const eventoStageRepo = fastify.db.getRepository(GlobusFlpEventoStage);
  const fichaStageRepo = fastify.db.getRepository(GlobusFlpFichaStage);

  return {
    /**
     * Processa stage → canonical em 3 passos:
     *  1) Funcionários (sem dependências)
     *  2) Eventos (sem dependências)
     *  3) Ficha de eventos (depende dos 2 anteriores)
     */
    async processar(): Promise<ETLResultado> {
      const inicio = Date.now();
      const log = fastify.log.child({ etl: 'folha_flp' });

      // ============ FUNCIONÁRIOS ============
      // Helper local: campos do Oracle podem vir number, string ou null —
      // tudo que vai pra varchar precisa virar string (sem .trim() direto).
      const str = (v: unknown): string | null => {
        if (v === null || v === undefined) return null;
        const s = String(v).trim();
        return s.length > 0 ? s : null;
      };

      // Batch insert via VALUES — 8k+ funcionários em 1-by-1 era inviável.
      const FUNC_BATCH = 500;
      const funcsPendentes = await funcStageRepo.find({ where: { processadoEm: null as unknown as Date }, take: 20_000 });
      log.info({ pendentes: funcsPendentes.length }, '[etl:folha_flp] processando funcionários (batch)…');

      let funcsOk = 0;
      for (let i = 0; i < funcsPendentes.length; i += FUNC_BATCH) {
        const lote = funcsPendentes.slice(i, i + FUNC_BATCH);
        const valoresSql: string[] = [];
        const params: unknown[] = [];
        let p = 1;
        for (const stage of lote) {
          const raw = stage.rawPayload as unknown as RawFunc;
          // 10 placeholders: empresa, cod_int_func, cod_func, nome, cod_area, desc_area, cod_depto, desc_funcao, agencia, conta
          valoresSql.push(
            `($${p}::int, 'globus', $${p + 1}::varchar, $${p + 2}::varchar, $${p + 3}::varchar, ` +
            `$${p + 4}::varchar, $${p + 5}::varchar, $${p + 6}::varchar, $${p + 7}::varchar, ` +
            `$${p + 8}::varchar, $${p + 9}::varchar, true, NOW())`,
          );
          params.push(
            raw.CODIGO_EMPRESA,
            str(raw.COD_INT_FUNC) ?? '',
            str(raw.COD_FUNC) ?? '',
            str(raw.NOME) ?? `Funcionário ${raw.COD_FUNC}`,
            str(raw.COD_AREA),
            str(raw.DESC_AREA),
            str(raw.COD_DEPTO),
            str(raw.DESC_FUNCAO),
            str(raw.COD_AGENCIA),
            str(raw.CONTA_CORRENTE),
          );
          p += 10;
        }
        try {
          await funcStageRepo.query(
            `INSERT INTO finance.funcionarios
               (empresa_id, origem_sistema, cod_int_func, cod_func, nome,
                cod_area, desc_area, cod_depto, desc_funcao,
                agencia, conta_corrente, ativo, ultimo_sync_em)
             VALUES ${valoresSql.join(',')}
             ON CONFLICT (origem_sistema, cod_int_func)
             DO UPDATE SET cod_func = EXCLUDED.cod_func,
                           nome = EXCLUDED.nome,
                           cod_area = EXCLUDED.cod_area,
                           desc_area = EXCLUDED.desc_area,
                           cod_depto = EXCLUDED.cod_depto,
                           desc_funcao = EXCLUDED.desc_funcao,
                           agencia = EXCLUDED.agencia,
                           conta_corrente = EXCLUDED.conta_corrente,
                           ativo = true,
                           ultimo_sync_em = NOW(),
                           atualizado_em = NOW()`,
            params,
          );
          await funcStageRepo
            .createQueryBuilder()
            .update()
            .set({ processadoEm: new Date() })
            .whereInIds(lote.map((s) => s.id))
            .execute();
          funcsOk += lote.length;
          log.info(
            { lote: `${Math.floor(i / FUNC_BATCH) + 1}/${Math.ceil(funcsPendentes.length / FUNC_BATCH)}`, gravados: lote.length, funcsOk },
            `[etl:folha_flp] funcionário canonical lote OK`,
          );
        } catch (err) {
          const e = err as Error & { code?: string; detail?: string };
          log.error(
            { err, code: e.code, detail: e.detail, loteSize: lote.length, loteInicio: i },
            '[etl:folha_flp] FALHA em lote de funcionário',
          );
        }
      }

      // ============ EVENTOS ============
      const evsPendentes = await eventoStageRepo.find({ where: { processadoEm: null as unknown as Date } });
      log.info({ pendentes: evsPendentes.length }, '[etl:folha_flp] processando eventos…');

      let evsOk = 0;
      for (const stage of evsPendentes) {
        const raw = stage.rawPayload as unknown as RawEvento;
        const tipo = (raw.TIPO ?? 'P').trim().toUpperCase();
        if (!['P', 'D', 'B'].includes(tipo)) {
          log.warn({ codEvento: raw.COD_EVENTO, tipo: raw.TIPO }, '[etl:folha_flp] tipo de evento desconhecido — usando P');
        }
        const tipoNormalizado = ['P', 'D', 'B'].includes(tipo) ? tipo : 'P';
        const grupo = classificarGrupoEvento(raw.COD_EVENTO, raw.DESCRICAO, tipoNormalizado);
        try {
          await eventoStageRepo.query(
            `INSERT INTO finance.eventos_folha (cod_evento, descricao, tipo, grupo)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (cod_evento)
             DO UPDATE SET descricao = EXCLUDED.descricao,
                           tipo = EXCLUDED.tipo,
                           grupo = EXCLUDED.grupo,
                           atualizado_em = NOW()`,
            [raw.COD_EVENTO, (raw.DESCRICAO ?? `Evento ${raw.COD_EVENTO}`).trim(), tipoNormalizado, grupo],
          );
          await eventoStageRepo.update(stage.id, { processadoEm: new Date() });
          evsOk++;
        } catch (err) {
          log.warn({ err, codEvento: raw.COD_EVENTO }, '[etl:folha_flp] falha em evento');
        }
      }

      // ============ FICHA ============
      // Batch insert via VALUES + JOIN com funcionarios pra resolver funcionario_id em 1 round-trip.
      const BATCH_SIZE = 500;
      let fichasOk = 0;
      let totalChunk: number;
      do {
        const fichasPendentes = await fichaStageRepo.find({
          where: { processadoEm: null as unknown as Date },
          take: 2000,
        });
        totalChunk = fichasPendentes.length;
        if (totalChunk === 0) break;

        log.info({ chunk: totalChunk }, '[etl:folha_flp] processando ficha (chunk)…');

        for (let i = 0; i < fichasPendentes.length; i += BATCH_SIZE) {
          const lote = fichasPendentes.slice(i, i + BATCH_SIZE);
          const valoresSql: string[] = [];
          const params: unknown[] = [];
          let p = 1;
          for (const stage of lote) {
            const raw = stage.rawPayload as unknown as RawFicha;
            const origemIdExterno = `${raw.COD_INT_FUNC}|${stage.competencia}|${raw.COD_EVENTO}|${raw.TIPO_FOLHA}`;
            // (cod_int_func, cod_evento, competencia, tipo_folha, referencia, valor_cents, origem_id_externo)
            valoresSql.push(
              `($${p}::text, $${p + 1}::int, $${p + 2}::date, $${p + 3}::int, $${p + 4}::numeric, $${p + 5}::bigint, $${p + 6}::text)`,
            );
            params.push(
              String(raw.COD_INT_FUNC),
              raw.COD_EVENTO,
              stage.competencia,
              raw.TIPO_FOLHA,
              raw.REFERENCIA,
              paraCentavos(raw.VALOR),
              origemIdExterno,
            );
            p += 7;
          }

          try {
            const result = await fichaStageRepo.query(
              `INSERT INTO finance.ficha_evento
                 (empresa_id, funcionario_id, cod_evento, competencia, tipo_folha,
                  referencia, valor_cents, origem_sistema, origem_id_externo, ultimo_sync_em)
               SELECT 1, f.id, b.cod_evento, b.competencia, b.tipo_folha, b.referencia, b.valor_cents,
                      'globus', b.origem_id_externo, NOW()
               FROM (VALUES ${valoresSql.join(',')})
                    AS b(cod_int_func, cod_evento, competencia, tipo_folha, referencia, valor_cents, origem_id_externo)
               JOIN finance.funcionarios f
                 ON f.origem_sistema = 'globus' AND f.cod_int_func = b.cod_int_func
               ON CONFLICT (origem_sistema, origem_id_externo)
               DO UPDATE SET cod_evento = EXCLUDED.cod_evento,
                             competencia = EXCLUDED.competencia,
                             tipo_folha = EXCLUDED.tipo_folha,
                             referencia = EXCLUDED.referencia,
                             valor_cents = EXCLUDED.valor_cents,
                             ultimo_sync_em = NOW()
               RETURNING 1`,
              params,
            );
            const inseridos = Array.isArray(result) ? result.length : 0;
            fichasOk += inseridos;

            // Marca todos do lote como processados (mesmo os que não viraram canonical -
            // ex.: funcionário ainda não sincronizado - vão ficar com origem_id_externo
            // orfão pra debug posterior).
            await fichaStageRepo
              .createQueryBuilder()
              .update()
              .set({ processadoEm: new Date() })
              .whereInIds(lote.map((s) => s.id))
              .execute();

            log.info(
              { lote: `${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(fichasPendentes.length / BATCH_SIZE)}`, gravados: inseridos, fichasOk },
              `[etl:folha_flp] ficha canonical lote OK`,
            );
          } catch (err) {
            log.warn({ err, loteSize: lote.length, loteInicio: i }, '[etl:folha_flp] falha em lote de ficha');
          }
        }
      } while (totalChunk === 2000);

      const duracaoMs = Date.now() - inicio;
      log.info(
        { funcionariosProcessados: funcsOk, eventosProcessados: evsOk, fichasProcessadas: fichasOk, duracaoMs },
        `[etl:folha_flp] concluído em ${duracaoMs}ms`,
      );

      return {
        funcionariosProcessados: funcsOk,
        eventosProcessados: evsOk,
        fichasProcessadas: fichasOk,
        duracaoMs,
      };
    },
  };
}

export type FolhaFlpEtl = ReturnType<typeof buildFolhaFlpEtl>;
