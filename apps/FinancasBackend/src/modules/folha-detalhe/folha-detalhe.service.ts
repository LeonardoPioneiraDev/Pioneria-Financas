import type { FastifyInstance } from 'fastify';
import type {
  SetorFolhaQuery,
  SetorFolhaResponse,
  SetorItem,
  QuebraFuncao,
  FuncionariosQuery,
  FuncionariosResponse,
  FuncionarioItem,
  ContraChequeQuery,
  ContraChequeResponse,
  EventoContraCheque,
  SyncFlpBody,
  SyncFlpResponse,
} from '@pioneira/shared/schemas/folha-detalhe';
import { Funcionario } from '@/entities/funcionario.entity.js';
import { FichaEvento } from '@/entities/ficha-evento.entity.js';
import { EventoFolha } from '@/entities/evento-folha.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { buildGlobusFlpAdapter } from '@/integrations/globus/globus-flp.adapter.js';
import { buildFolhaFlpEtl } from '@/etl/folha-flp.etl.js';

interface SetorAgg {
  cod_area: string | null;
  desc_area: string | null;
  qtd_funcionarios: string;
  proventos: string;
  descontos: string;
  inss: string;
  fgts: string;
  irrf: string;
  vt: string;
  va: string;
}

interface FuncaoAgg {
  cod_area: string | null;
  desc_funcao: string | null;
  qtd_funcionarios: string;
  liquido: string;
}

interface FuncRowAgg {
  id: string;
  cod_func: string;
  nome: string;
  cod_area: string | null;
  desc_area: string | null;
  desc_funcao: string | null;
  proventos: string;
  descontos: string;
}

/**
 * Range semi-aberto cobrindo ambas convenções Praxio:
 *  - folha "de maio" gravada como COMPETFICHA=2026-04-30 (último dia do mês trabalhado)
 *  - folha "de maio" gravada como COMPETFICHA=2026-05-31 (último dia do mês pago)
 *
 * Para yyyyMm='2026-05' retorna [dtIni='2026-04-30', dtFimExcl='2026-06-01').
 */
function rangeCompetencia(yyyyMm: string): { dtIni: string; dtFimExcl: string } {
  const [ano, mes] = yyyyMm.split('-').map(Number);
  const dtIni = new Date(Date.UTC(ano!, mes! - 1, 0)).toISOString().slice(0, 10);
  const dtFimExcl = new Date(Date.UTC(ano!, mes!, 1)).toISOString().slice(0, 10);
  return { dtIni, dtFimExcl };
}

export function buildFolhaDetalheService(fastify: FastifyInstance) {
  const funcRepo = fastify.db.getRepository(Funcionario);
  const fichaRepo = fastify.db.getRepository(FichaEvento);
  const eventoRepo = fastify.db.getRepository(EventoFolha);
  const jobRepo = fastify.db.getRepository(SyncJob);
  const adapter = buildGlobusFlpAdapter(fastify);
  const etl = buildFolhaFlpEtl(fastify);

  return {
    /** Consolidação por setor + sumário geral. */
    async listarPorSetor(query: SetorFolhaQuery): Promise<SetorFolhaResponse> {
      const { dtIni, dtFimExcl } = rangeCompetencia(query.competencia);

      const tipoFolhaFiltro = query.tipoFolha
        ? 'AND fe.tipo_folha = $3'
        : '';
      const paramsBase: unknown[] = [dtIni, dtFimExcl];
      if (query.tipoFolha) paramsBase.push(query.tipoFolha);

      // Agrupado por setor.
      //
      // O WHERE NAO filtra `ev.tipo IN ('P','D')` porque o FGTS calculado e
      // outros totalizadores (INSS-base, IRRF-base) chegam como tipo='B' no
      // Praxio. Filtrar P/D no WHERE excluia todos eles e zerava o SUM(fgts).
      //
      // O COUNT de funcionarios usa FILTER pra contar so quem tem lancamento
      // efetivo (P ou D) — evita inflar com funcionarios que so aparecem em
      // linhas-base (raro, mas existe na Pioneira).
      const setoresRaw = await fichaRepo.query<SetorAgg[]>(
        `SELECT f.cod_area, f.desc_area,
                COUNT(DISTINCT f.id) FILTER (WHERE ev.tipo IN ('P','D'))::text AS qtd_funcionarios,
                COALESCE(SUM(CASE WHEN ev.tipo = 'P' THEN fe.valor_cents ELSE 0 END), 0)::text AS proventos,
                COALESCE(SUM(CASE WHEN ev.tipo = 'D' THEN fe.valor_cents ELSE 0 END), 0)::text AS descontos,
                COALESCE(SUM(CASE WHEN ev.grupo = 'inss' AND ev.tipo = 'D' THEN fe.valor_cents ELSE 0 END), 0)::text AS inss,
                COALESCE(SUM(CASE WHEN ev.grupo = 'fgts' THEN fe.valor_cents ELSE 0 END), 0)::text AS fgts,
                COALESCE(SUM(CASE WHEN ev.grupo = 'irrf' AND ev.tipo = 'D' THEN fe.valor_cents ELSE 0 END), 0)::text AS irrf,
                COALESCE(SUM(CASE WHEN ev.grupo = 'vt' THEN fe.valor_cents ELSE 0 END), 0)::text AS vt,
                COALESCE(SUM(CASE WHEN ev.grupo = 'va' THEN fe.valor_cents ELSE 0 END), 0)::text AS va
         FROM finance.ficha_evento fe
         JOIN finance.funcionarios f ON f.id = fe.funcionario_id
         JOIN finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
         WHERE fe.competencia >= $1::date AND fe.competencia < $2::date
           ${tipoFolhaFiltro}
         GROUP BY f.cod_area, f.desc_area
         ORDER BY (COALESCE(SUM(CASE WHEN ev.tipo = 'P' THEN fe.valor_cents ELSE 0 END), 0)
                   - COALESCE(SUM(CASE WHEN ev.tipo = 'D' THEN fe.valor_cents ELSE 0 END), 0)) DESC`,
        paramsBase,
      );

      // Quebra por função dentro de cada setor (líquido). O CASE ja exclui
      // tipo 'B' do somatorio (ELSE 0), nao precisa filtrar no WHERE — manter
      // tipo 'B' aqui nao distorce nada e padroniza com a query de setores.
      const funcoesRaw = await fichaRepo.query<FuncaoAgg[]>(
        `SELECT f.cod_area, f.desc_funcao,
                COUNT(DISTINCT f.id) FILTER (WHERE ev.tipo IN ('P','D'))::text AS qtd_funcionarios,
                COALESCE(SUM(CASE WHEN ev.tipo = 'P' THEN fe.valor_cents
                                  WHEN ev.tipo = 'D' THEN -fe.valor_cents
                                  ELSE 0 END), 0)::text AS liquido
         FROM finance.ficha_evento fe
         JOIN finance.funcionarios f ON f.id = fe.funcionario_id
         JOIN finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
         WHERE fe.competencia >= $1::date AND fe.competencia < $2::date
           ${tipoFolhaFiltro}
         GROUP BY f.cod_area, f.desc_funcao
         ORDER BY f.cod_area, liquido DESC`,
        paramsBase,
      );

      const funcoesPorArea = new Map<string, QuebraFuncao[]>();
      for (const fn of funcoesRaw) {
        const chave = fn.cod_area ?? '__null__';
        if (!funcoesPorArea.has(chave)) funcoesPorArea.set(chave, []);
        funcoesPorArea.get(chave)!.push({
          descFuncao: fn.desc_funcao,
          qtdFuncionarios: Number(fn.qtd_funcionarios),
          liquidoCents: Number(fn.liquido),
        });
      }

      const setores: SetorItem[] = setoresRaw.map((s) => {
        const proventos = Number(s.proventos);
        const descontos = Number(s.descontos);
        return {
          codArea: s.cod_area,
          descArea: s.desc_area,
          qtdFuncionarios: Number(s.qtd_funcionarios),
          proventosCents: proventos,
          descontosCents: descontos,
          liquidoCents: proventos - descontos,
          inssCents: Number(s.inss),
          fgtsCents: Number(s.fgts),
          irrfCents: Number(s.irrf),
          vtCents: Number(s.vt),
          vaCents: Number(s.va),
          porFuncao: funcoesPorArea.get(s.cod_area ?? '__null__') ?? [],
        };
      });

      const totais = setores.reduce(
        (acc, s) => ({
          qtdSetores: acc.qtdSetores + 1,
          qtdFuncionarios: acc.qtdFuncionarios + s.qtdFuncionarios,
          proventosCents: acc.proventosCents + s.proventosCents,
          descontosCents: acc.descontosCents + s.descontosCents,
          liquidoCents: acc.liquidoCents + s.liquidoCents,
          inssCents: acc.inssCents + s.inssCents,
          fgtsCents: acc.fgtsCents + s.fgtsCents,
          irrfCents: acc.irrfCents + s.irrfCents,
          vtCents: acc.vtCents + s.vtCents,
          vaCents: acc.vaCents + s.vaCents,
        }),
        { qtdSetores: 0, qtdFuncionarios: 0, proventosCents: 0, descontosCents: 0, liquidoCents: 0, inssCents: 0, fgtsCents: 0, irrfCents: 0, vtCents: 0, vaCents: 0 },
      );

      const ultimoJob = await jobRepo.findOne({
        where: { sistema: 'globus', recurso: 'folha_flp' },
        order: { iniciadoEm: 'DESC' },
      });
      const totalFuncionarios = await funcRepo.count();
      const totalFichas = await fichaRepo.count();

      return {
        competencia: query.competencia,
        tipoFolha: query.tipoFolha ?? null,
        totais,
        setores,
        syncInfo: {
          ultimoSyncEm: ultimoJob?.terminadoEm ? ultimoJob.terminadoEm.toISOString() : null,
          totalFuncionarios,
          totalFichas,
          precisaSincronizar: totalFichas === 0,
        },
      };
    },

    /** Lista funcionários paginada com sumário individual. */
    async listarFuncionarios(query: FuncionariosQuery): Promise<FuncionariosResponse> {
      const { dtIni, dtFimExcl } = rangeCompetencia(query.competencia);
      const pagina = query.pagina ?? 1;
      const porPagina = query.porPagina ?? 50;
      const offset = (pagina - 1) * porPagina;

      const wheres: string[] = ['fe.competencia >= $1::date', 'fe.competencia < $2::date'];
      const params: unknown[] = [dtIni, dtFimExcl];
      if (query.tipoFolha) {
        params.push(query.tipoFolha);
        wheres.push(`fe.tipo_folha = $${params.length}`);
      }
      if (query.codArea) {
        params.push(query.codArea);
        wheres.push(`f.cod_area = $${params.length}`);
      }
      if (query.busca) {
        params.push(`%${query.busca}%`);
        wheres.push(`(f.nome ILIKE $${params.length} OR f.cod_func ILIKE $${params.length})`);
      }
      const whereSql = wheres.join(' AND ');

      const totalRows = await fichaRepo.query<Array<{ total: string }>>(
        `SELECT COUNT(DISTINCT f.id)::text AS total
         FROM finance.ficha_evento fe
         JOIN finance.funcionarios f ON f.id = fe.funcionario_id
         WHERE ${whereSql}`,
        params,
      );
      const total = Number(totalRows[0]?.total ?? 0);

      params.push(porPagina, offset);
      const itensRaw = await fichaRepo.query<FuncRowAgg[]>(
        `SELECT f.id, f.cod_func, f.nome, f.cod_area, f.desc_area, f.desc_funcao,
                COALESCE(SUM(CASE WHEN ev.tipo = 'P' THEN fe.valor_cents ELSE 0 END), 0)::text AS proventos,
                COALESCE(SUM(CASE WHEN ev.tipo = 'D' THEN fe.valor_cents ELSE 0 END), 0)::text AS descontos
         FROM finance.ficha_evento fe
         JOIN finance.funcionarios f ON f.id = fe.funcionario_id
         JOIN finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
         WHERE ${whereSql} AND ev.tipo IN ('P','D')
         GROUP BY f.id, f.cod_func, f.nome, f.cod_area, f.desc_area, f.desc_funcao
         ORDER BY f.nome
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      const itens: FuncionarioItem[] = itensRaw.map((r) => {
        const proventos = Number(r.proventos);
        const descontos = Number(r.descontos);
        return {
          id: r.id,
          codFunc: r.cod_func,
          nome: r.nome,
          codArea: r.cod_area,
          descArea: r.desc_area,
          descFuncao: r.desc_funcao,
          proventosCents: proventos,
          descontosCents: descontos,
          liquidoCents: proventos - descontos,
        };
      });

      return {
        competencia: query.competencia,
        itens,
        total,
        pagina,
        porPagina,
        totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
      };
    },

    /** Contra-cheque (holerite) individual com todos eventos + bases. */
    async contraCheque(codFunc: string, query: ContraChequeQuery): Promise<ContraChequeResponse> {
      const { dtIni, dtFimExcl } = rangeCompetencia(query.competencia);

      const funcionario = await funcRepo.findOne({ where: { codFunc } });
      if (!funcionario) {
        throw fastify.httpErrors.notFound(`Funcionário ${codFunc} não encontrado`);
      }

      const tipoFolhaFiltro = query.tipoFolha ? 'AND fe.tipo_folha = $4' : '';
      const params: unknown[] = [funcionario.id, dtIni, dtFimExcl];
      if (query.tipoFolha) params.push(query.tipoFolha);

      const eventosRaw = await fichaRepo.query<Array<{
        cod_evento: number;
        descricao: string;
        tipo: 'P' | 'D' | 'B';
        grupo: string | null;
        referencia: string | null;
        valor_cents: string;
      }>>(
        `SELECT fe.cod_evento, ev.descricao, ev.tipo, ev.grupo,
                fe.referencia::text AS referencia, fe.valor_cents::text AS valor_cents
         FROM finance.ficha_evento fe
         JOIN finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
         WHERE fe.funcionario_id = $1
           AND fe.competencia >= $2::date AND fe.competencia < $3::date
           ${tipoFolhaFiltro}
         ORDER BY ev.tipo, fe.cod_evento`,
        params,
      );

      const proventos: EventoContraCheque[] = [];
      const descontos: EventoContraCheque[] = [];
      const bases = new Map<number, number>();
      let baseInss = 0, baseFgts = 0, baseIrrf = 0, fgts = 0;

      for (const e of eventosRaw) {
        const valorCents = Number(e.valor_cents);
        const item: EventoContraCheque = {
          codEvento: e.cod_evento,
          descricao: e.descricao,
          tipo: e.tipo,
          grupo: e.grupo,
          referencia: e.referencia ? Number(e.referencia) : null,
          valorCents,
        };
        if (e.tipo === 'P') proventos.push(item);
        else if (e.tipo === 'D') descontos.push(item);
        else {
          bases.set(e.cod_evento, valorCents);
          if (e.cod_evento === 315) baseInss = valorCents;
          if (e.cod_evento === 330) baseFgts = valorCents;
          if (e.cod_evento === 322) baseIrrf = valorCents;
          if (e.cod_evento === 508) fgts = valorCents;
        }
      }

      const proventosCents = proventos.reduce((a, e) => a + e.valorCents, 0);
      const descontosCents = descontos.reduce((a, e) => a + e.valorCents, 0);

      return {
        funcionario: {
          id: funcionario.id,
          codFunc: funcionario.codFunc,
          nome: funcionario.nome,
          descFuncao: funcionario.descFuncao,
          descArea: funcionario.descArea,
          agencia: funcionario.agencia,
          contaCorrente: funcionario.contaCorrente,
        },
        competencia: query.competencia,
        tipoFolha: query.tipoFolha ?? null,
        proventos,
        descontos,
        totais: {
          proventosCents,
          descontosCents,
          liquidoCents: proventosCents - descontosCents,
          baseInssCents: baseInss,
          baseFgtsCents: baseFgts,
          baseIrrfCents: baseIrrf,
          fgtsCents: fgts,
        },
      };
    },

    /** Sincroniza FLP do Globus e roda ETL. */
    async sincronizar(body: SyncFlpBody, usuarioId: string): Promise<SyncFlpResponse> {
      const sync = await adapter.sincronizar({
        empresa: fastify.config.globus.empresaId,
        filiais: fastify.config.globus.filiais,
        competenciaYyyyMm: body.competencia,
        tipoFolha: body.tipoFolha ?? null,
        usuarioId,
      });

      if (sync.status !== 'erro') {
        await etl.processar();
      }

      return {
        jobId: sync.jobId,
        status: sync.status,
        funcionariosLidos: sync.funcionariosLidos,
        funcionariosGravados: sync.funcionariosGravados,
        eventosLidos: sync.eventosLidos,
        eventosGravados: sync.eventosGravados,
        fichasLidas: sync.fichasLidas,
        fichasGravadas: sync.fichasGravadas,
        duracaoMs: sync.duracaoMs,
        mensagem: sync.mensagem,
      };
    },

    /** Carrega catálogo de eventos (para legendas no front). */
    async listarEventos(): Promise<Array<{ codEvento: number; descricao: string; tipo: 'P' | 'D' | 'B'; grupo: string | null }>> {
      const rows = await eventoRepo.find({ order: { codEvento: 'ASC' } });
      return rows.map((r) => ({
        codEvento: r.codEvento,
        descricao: r.descricao,
        tipo: r.tipo,
        grupo: r.grupo,
      }));
    },

    /**
     * Diagnóstico do estado da integração FLP.
     * Mostra o que está no stage, no canonical e quais competências/tipos existem.
     */
    async diagnostico(): Promise<{
      stage: { funcionarios: number; eventos: number; fichas: number; fichasPendentes: number };
      canonical: { funcionarios: number; eventos: number; fichas: number };
      competenciasDisponiveis: Array<{ competencia: string; tipoFolha: number; qtdLancamentos: number; qtdFuncionarios: number; somaCents: string }>;
      ultimoJob: { id: string; status: string; iniciadoEm: string; terminadoEm: string | null; registrosLidos: number; registrosGravados: number; registrosComErro: number; erroMensagem: string | null; parametros: Record<string, unknown> | null } | null;
    }> {
      const [stageFunc, stageEv, stageFi, stagePend] = await Promise.all([
        fichaRepo.query<Array<{ c: string }>>('SELECT COUNT(*)::text AS c FROM integration.globus_flp_func_stage'),
        fichaRepo.query<Array<{ c: string }>>('SELECT COUNT(*)::text AS c FROM integration.globus_flp_evento_stage'),
        fichaRepo.query<Array<{ c: string }>>('SELECT COUNT(*)::text AS c FROM integration.globus_flp_ficha_stage'),
        fichaRepo.query<Array<{ c: string }>>('SELECT COUNT(*)::text AS c FROM integration.globus_flp_ficha_stage WHERE processado_em IS NULL'),
      ]);
      const [canFunc, canEv, canFi] = await Promise.all([
        funcRepo.count(),
        eventoRepo.count(),
        fichaRepo.count(),
      ]);

      const competenciasRaw = await fichaRepo.query<Array<{
        competencia: string | Date;
        tipo_folha: number;
        qtd_lancamentos: string;
        qtd_funcionarios: string;
        soma_cents: string;
      }>>(
        `SELECT fe.competencia, fe.tipo_folha,
                COUNT(*)::text AS qtd_lancamentos,
                COUNT(DISTINCT fe.funcionario_id)::text AS qtd_funcionarios,
                COALESCE(SUM(fe.valor_cents), 0)::text AS soma_cents
         FROM finance.ficha_evento fe
         GROUP BY fe.competencia, fe.tipo_folha
         ORDER BY fe.competencia DESC, fe.tipo_folha`,
      );

      const ultimoJob = await jobRepo.findOne({
        where: { sistema: 'globus', recurso: 'folha_flp' },
        order: { iniciadoEm: 'DESC' },
      });

      const dataIso = (v: string | Date): string => {
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        return String(v).slice(0, 10);
      };

      return {
        stage: {
          funcionarios: Number(stageFunc[0]?.c ?? 0),
          eventos: Number(stageEv[0]?.c ?? 0),
          fichas: Number(stageFi[0]?.c ?? 0),
          fichasPendentes: Number(stagePend[0]?.c ?? 0),
        },
        canonical: { funcionarios: canFunc, eventos: canEv, fichas: canFi },
        competenciasDisponiveis: competenciasRaw.map((r) => ({
          competencia: dataIso(r.competencia),
          tipoFolha: r.tipo_folha,
          qtdLancamentos: Number(r.qtd_lancamentos),
          qtdFuncionarios: Number(r.qtd_funcionarios),
          somaCents: r.soma_cents,
        })),
        ultimoJob: ultimoJob
          ? {
              id: ultimoJob.id,
              status: ultimoJob.status,
              iniciadoEm: ultimoJob.iniciadoEm.toISOString(),
              terminadoEm: ultimoJob.terminadoEm ? ultimoJob.terminadoEm.toISOString() : null,
              registrosLidos: ultimoJob.registrosLidos,
              registrosGravados: ultimoJob.registrosGravados,
              registrosComErro: ultimoJob.registrosComErro,
              erroMensagem: ultimoJob.erroMensagem,
              parametros: ultimoJob.parametros,
            }
          : null,
      };
    },
  };
}

export type FolhaDetalheService = ReturnType<typeof buildFolhaDetalheService>;
