import type { FastifyInstance } from 'fastify';
import type {
  MapaDiarioResponse,
  ComposicaoFamiliaResponse,
  AgingResponse,
  SyncHorariosResponse,
} from '@pioneira/shared';
import { RecebivelGdfCelula } from '@/entities/recebivel-gdf-celula.entity.js';
import { RecebivelFamilia } from '@/entities/recebivel-familia.entity.js';
import { buildHorariosRecebiveisAdapter } from '@/integrations/horarios/horarios-recebiveis.adapter.js';
import { buildGlobusBcomovtoAdapter } from '@/integrations/globus/globus-bcomovto.adapter.js';
import { buildRecebiveisGdfEtl } from '@/etl/recebiveis-gdf.etl.js';
import { buildBancoMovtoEtl } from '@/etl/banco-movto.etl.js';

/**
 * Service de Recebíveis GDF — consulta dados agregados das células e dispara
 * sync/ETL da API horários.
 */

interface CelulaAgg {
  data_transporte: string;
  data_resgate: string;
  valor_cents: string;
  creditos: string;
}

interface FamiliaAgg {
  familia: string;
  valor_cents: string;
  creditos: string;
}

export function buildRecebiveisGdfService(fastify: FastifyInstance) {
  const celulaRepo = fastify.db.getRepository(RecebivelGdfCelula);
  const familiaRepo = fastify.db.getRepository(RecebivelFamilia);
  const bcomovtoAdapter = buildGlobusBcomovtoAdapter(fastify);
  const bancoMovtoEtl = buildBancoMovtoEtl(fastify);
  const adapter = buildHorariosRecebiveisAdapter(fastify);
  const etl = buildRecebiveisGdfEtl(fastify);

  return {
    /** Matriz (data_transporte × data_resgate). */
    async mapaDiario(args: { dtIni: string; dtFim: string; familia?: string }): Promise<MapaDiarioResponse> {
      const filtros = ['c.data_transporte >= $1::date', 'c.data_transporte <= $2::date', 'c.excluido_em IS NULL'];
      const params: unknown[] = [args.dtIni, args.dtFim];
      if (args.familia) {
        params.push(args.familia);
        filtros.push(`c.familia = $${params.length}`);
      }
      const whereSql = filtros.join(' AND ');

      // Celulas no escopo, agregadas por (data_transporte, data_resgate).
      const celulas = await celulaRepo.query<CelulaAgg[]>(
        `SELECT c.data_transporte::text, c.data_resgate::text,
                SUM(c.valor_cents)::text AS valor_cents,
                SUM(c.creditos)::text AS creditos
           FROM finance.recebivel_gdf_celula c
          WHERE ${whereSql}
          GROUP BY c.data_transporte, c.data_resgate
          ORDER BY c.data_transporte DESC, c.data_resgate ASC`,
        params,
      );

      // Também agrega anteriores ao período (transp < dtIni mas resgate dentro)
      const anterioresParams: unknown[] = [args.dtIni, args.dtFim];
      if (args.familia) anterioresParams.push(args.familia);
      const anteriores = await celulaRepo.query<CelulaAgg[]>(
        `SELECT 'anteriores' AS data_transporte, c.data_resgate::text,
                SUM(c.valor_cents)::text AS valor_cents,
                SUM(c.creditos)::text AS creditos
           FROM finance.recebivel_gdf_celula c
          WHERE c.data_transporte < $1::date
            AND c.data_resgate >= $1::date
            AND c.data_resgate <= $2::date
            AND c.excluido_em IS NULL
            ${args.familia ? 'AND c.familia = $3' : ''}
          GROUP BY c.data_resgate
          ORDER BY c.data_resgate ASC`,
        anterioresParams,
      );

      // Datas distintas
      const colunasResgate = Array.from(new Set([
        ...celulas.map((c) => c.data_resgate),
        ...anteriores.map((c) => c.data_resgate),
      ])).sort();

      // Monta linhas por data_transporte
      const porTransporte = new Map<string, { resgates: MapaDiarioResponse['linhas'][number]['resgates']; valor: number; creditos: number; somaPondTempo: number }>();
      for (const c of celulas) {
        const data = c.data_transporte;
        if (!porTransporte.has(data)) {
          porTransporte.set(data, { resgates: {}, valor: 0, creditos: 0, somaPondTempo: 0 });
        }
        const entry = porTransporte.get(data)!;
        const v = Number(c.valor_cents);
        const cr = Number(c.creditos);
        entry.resgates[c.data_resgate] = { valorCents: v, creditos: cr };
        entry.valor += v;
        entry.creditos += cr;
        const dias = Math.round((new Date(c.data_resgate).getTime() - new Date(data).getTime()) / 86400000);
        entry.somaPondTempo += dias * v;
      }

      const linhas: MapaDiarioResponse['linhas'] = Array.from(porTransporte.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([dataTransporte, entry]) => {
          const totalResgatado = Object.values(entry.resgates).reduce((s, r) => s + r.valorCents, 0);
          const status: 'recolhido' | 'pendente' =
            totalResgatado > 0 && Math.abs(entry.valor - totalResgatado) < 100 ? 'recolhido' : 'pendente';
          return {
            dataTransporte,
            totalCents: entry.valor,
            totalCreditos: entry.creditos,
            tempoMedioDias: entry.valor > 0 ? Number((entry.somaPondTempo / entry.valor).toFixed(2)) : 0,
            status,
            resgates: entry.resgates,
          };
        });

      // Linha "anteriores" (se houver)
      if (anteriores.length > 0) {
        const rg: MapaDiarioResponse['linhas'][number]['resgates'] = {};
        let v = 0;
        let cr = 0;
        for (const a of anteriores) {
          const valor = Number(a.valor_cents);
          const cred = Number(a.creditos);
          rg[a.data_resgate] = { valorCents: valor, creditos: cred };
          v += valor;
          cr += cred;
        }
        linhas.unshift({
          dataTransporte: 'anteriores',
          totalCents: v,
          totalCreditos: cr,
          tempoMedioDias: 0,
          status: 'anteriores',
          resgates: rg,
        });
      }

      // Total = SÓ dias de transporte DENTRO do período (igual ao v1 / Controle de
      // Horários). A linha "anteriores" (transporte antes do filtro, resgatado
      // dentro) aparece na matriz, mas NÃO entra no headline — senão o total supera
      // o v1 pelos resgates de transportes anteriores ao período.
      const linhasReais = linhas.filter((l) => l.status !== 'anteriores');
      const totalValor = linhasReais.reduce((s, l) => s + l.totalCents, 0);
      const totalCreditos = linhasReais.reduce((s, l) => s + l.totalCreditos, 0);
      const tempoMedioGeral = totalValor > 0
        ? Number(
            (
              linhasReais.reduce((s, l) => s + l.tempoMedioDias * l.totalCents, 0) /
              Math.max(1, linhasReais.reduce((s, l) => s + l.totalCents, 0))
            ).toFixed(2),
          )
        : 0;

      return {
        periodo: { dtIni: args.dtIni, dtFim: args.dtFim },
        metrica: 'valor',
        totais: {
          valorCents: totalValor,
          creditos: totalCreditos,
          tempoMedioDias: tempoMedioGeral,
          datasTransp: linhasReais.length,
          datasResgate: colunasResgate.length,
        },
        colunasResgate,
        linhas,
      };
    },

    /** Drill-down: composição por família de UM dia transportado. */
    async composicaoFamilia(dataTransporte: string): Promise<ComposicaoFamiliaResponse> {
      const familias = await familiaRepo.find({ order: { ordem: 'ASC' } });
      const mapaFam = new Map(familias.map((f) => [f.codigo, f]));

      const porFamilia = await celulaRepo.query<FamiliaAgg[]>(
        `SELECT familia,
                SUM(valor_cents)::text AS valor_cents,
                SUM(creditos)::text AS creditos
           FROM finance.recebivel_gdf_celula
          WHERE data_transporte = $1::date AND excluido_em IS NULL
          GROUP BY familia`,
        [dataTransporte],
      );
      const totalValor = porFamilia.reduce((s, f) => s + Number(f.valor_cents), 0);
      const totalCreditos = porFamilia.reduce((s, f) => s + Number(f.creditos), 0);

      const familiasResp = porFamilia
        .map((f) => {
          const m = mapaFam.get(f.familia);
          return {
            codigo: f.familia,
            nome: m?.nome ?? f.familia,
            tipo: (m?.tipo ?? 'gratuidade') as 'pagante' | 'gratuidade',
            fonteSubsidio: m?.fonteSubsidio ?? null,
            creditos: Number(f.creditos),
            valorCents: Number(f.valor_cents),
            percReceita: totalValor > 0 ? Number(((Number(f.valor_cents) / totalValor) * 100).toFixed(2)) : 0,
            percCreditos: totalCreditos > 0 ? Number(((Number(f.creditos) / totalCreditos) * 100).toFixed(2)) : 0,
          };
        })
        .sort((a, b) => {
          // Pagantes primeiro (ordem por receita), gratuidades depois (por creditos)
          if (a.tipo !== b.tipo) return a.tipo === 'pagante' ? -1 : 1;
          return b.valorCents - a.valorCents || b.creditos - a.creditos;
        });

      const creditosPagantes = familiasResp.filter((f) => f.tipo === 'pagante').reduce((s, f) => s + f.creditos, 0);
      const creditosGratuidades = totalCreditos - creditosPagantes;

      // Resgates por data
      const porResgate = await celulaRepo.query<Array<{ data_resgate: string; valor_cents: string; creditos: string }>>(
        `SELECT data_resgate::text, SUM(valor_cents)::text AS valor_cents, SUM(creditos)::text AS creditos
           FROM finance.recebivel_gdf_celula
          WHERE data_transporte = $1::date AND excluido_em IS NULL
          GROUP BY data_resgate
          ORDER BY data_resgate ASC`,
        [dataTransporte],
      );
      const transpDate = new Date(dataTransporte).getTime();
      const resgatesPorData = porResgate.map((r) => {
        const diasApos = Math.round((new Date(r.data_resgate).getTime() - transpDate) / 86400000);
        const v = Number(r.valor_cents);
        return {
          dataResgate: r.data_resgate,
          diasApos,
          creditos: Number(r.creditos),
          valorCents: v,
          percDoTotal: totalValor > 0 ? Number(((v / totalValor) * 100).toFixed(2)) : 0,
        };
      });
      const tempoMedio = totalValor > 0
        ? Number(
            (
              resgatesPorData.reduce((s, r) => s + r.diasApos * r.valorCents, 0) / totalValor
            ).toFixed(2),
          )
        : 0;

      return {
        dataTransporte,
        totais: {
          valorCents: totalValor,
          creditos: totalCreditos,
          creditosPagantes,
          creditosGratuidades,
          percGratuidades: totalCreditos > 0 ? Number(((creditosGratuidades / totalCreditos) * 100).toFixed(2)) : 0,
          tempoMedioDias: tempoMedio,
        },
        resgatesPorData,
        familias: familiasResp,
      };
    },

    /** Aging em buckets fixos. */
    async aging(args: { dtIni: string; dtFim: string; familia?: string }): Promise<AgingResponse> {
      const filtros = ['data_transporte >= $1::date', 'data_transporte <= $2::date', 'excluido_em IS NULL'];
      const params: unknown[] = [args.dtIni, args.dtFim];
      if (args.familia) {
        params.push(args.familia);
        filtros.push(`familia = $${params.length}`);
      }
      const rows = await celulaRepo.query<Array<{ bucket: string; valor_cents: string; creditos: string }>>(
        `SELECT
            CASE
              WHEN (data_resgate - data_transporte) <= 2 THEN '0-2d'
              WHEN (data_resgate - data_transporte) <= 5 THEN '3-5d'
              WHEN (data_resgate - data_transporte) <= 10 THEN '6-10d'
              ELSE '10+d'
            END AS bucket,
            SUM(valor_cents)::text AS valor_cents,
            SUM(creditos)::text AS creditos
          FROM finance.recebivel_gdf_celula
         WHERE ${filtros.join(' AND ')}
         GROUP BY 1`,
        params,
      );
      const ordem = ['0-2d', '3-5d', '6-10d', '10+d'];
      const rotulos: Record<string, string> = {
        '0-2d': '0 a 2 dias',
        '3-5d': '3 a 5 dias',
        '6-10d': '6 a 10 dias',
        '10+d': 'Mais de 10 dias',
      };
      const totalValor = rows.reduce((s, r) => s + Number(r.valor_cents), 0);
      const buckets = ordem.map((k) => {
        const r = rows.find((x) => x.bucket === k);
        const v = r ? Number(r.valor_cents) : 0;
        return {
          chave: k,
          rotulo: rotulos[k]!,
          creditos: r ? Number(r.creditos) : 0,
          valorCents: v,
          perc: totalValor > 0 ? Number(((v / totalValor) * 100).toFixed(2)) : 0,
        };
      });
      return {
        periodo: { dtIni: args.dtIni, dtFim: args.dtFim },
        buckets,
      };
    },

    /** Lista famílias do mestre, ordenadas por pagantes primeiro. */
    async listarFamilias() {
      const rows = await familiaRepo.find({ order: { ordem: 'ASC' } });
      return rows.map((f) => ({
        codigo: f.codigo,
        nome: f.nome,
        tipo: f.tipo,
        fonteSubsidio: f.fonteSubsidio,
        ordem: f.ordem,
      }));
    },

    /**
     * Sync completo:
     *   1. API horários → stage relatórios → ETL células (esperado BRB)
     *   2. Globus BCOMOVTO → stage → ETL banco_movto (com classificação repasse_brb)
     *
     * Roda em sequência. Se o passo 1 falhar, ainda tenta o 2 (são independentes).
     */
    async sincronizar(usuarioId: string): Promise<SyncHorariosResponse> {
      // ====== Lado 1: BRB (horários) ======
      const sync = await adapter.sincronizarLista({ usuarioId });
      let etlGravadas = 0;
      let etlProcessados = 0;
      let etlErros = 0;
      let etlMs = 0;
      if (sync.status !== 'erro') {
        const r = await etl.processarPendentes({ limite: 200 });
        etlGravadas = r.gravadasCelulas;
        etlProcessados = r.processados;
        etlErros = r.comErro;
        etlMs = r.duracaoMs;
      }

      // ====== Lado 2: Banco (Globus BCOMOVTO) ======
      // Janela: mês corrente (regra empresa=4 + mês atual)
      const hoje = new Date();
      const dtInicio = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
      const dtFimExclusivo = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 1));

      let bancoMovtoLidos = 0;
      let bancoMovtoGravados = 0;
      let bancoMovtoRepassesBrb = 0;
      let bancoMs = 0;

      try {
        const syncBanco = await bcomovtoAdapter.sincronizar({
          empresa: fastify.config.globus.empresaId,
          dtInicio,
          dtFimExclusivo,
          usuarioId,
        });
        bancoMovtoLidos = syncBanco.registrosLidos;
        bancoMs = syncBanco.duracaoMs;

        if (syncBanco.status !== 'erro') {
          const etlBanco = await bancoMovtoEtl.processarPendentes({ limite: 10000 });
          bancoMovtoGravados = etlBanco.gravados;
          bancoMovtoRepassesBrb = etlBanco.repassesBrb;
          bancoMs += etlBanco.duracaoMs;
        }
      } catch (err) {
        fastify.log.warn({ err }, '[recebiveis-gdf] sync banco_movto falhou (lado BRB continua válido)');
      }

      return {
        jobId: sync.jobId,
        status: sync.status,
        relatoriosLidos: sync.relatoriosLidos,
        relatoriosGravados: sync.relatoriosGravados,
        relatoriosInalterados: sync.relatoriosInalterados,
        relatoriosComErro: sync.relatoriosComErro,
        duracaoMs: sync.duracaoMs + etlMs + bancoMs,
        etlProcessados,
        etlGravadasCelulas: etlGravadas,
        etlComErro: etlErros,
        bancoMovtoLidos,
        bancoMovtoGravados,
        bancoMovtoRepassesBrb,
        mensagem: sync.mensagem,
      };
    },
  };
}

export type RecebiveisGdfService = ReturnType<typeof buildRecebiveisGdfService>;
