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
  ComparativoQuery,
  ComparativoResponse,
  ComparativoSetorItem,
  FeriasDecimoQuery,
  FeriasDecimoResponse,
  CategoriaRealizado,
  CustoEncargosQuery,
  CustoEncargosResponse,
  CustoEncargosSetor,
} from '@pioneira/shared/schemas/folha-detalhe';
import { Funcionario } from '@/entities/funcionario.entity.js';
import { FichaEvento } from '@/entities/ficha-evento.entity.js';
import { EventoFolha } from '@/entities/evento-folha.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import { buildGlobusFlpAdapter } from '@/integrations/globus/globus-flp.adapter.js';
import { buildFolhaFlpEtl } from '@/etl/folha-flp.etl.js';
import { COD_FERIAS, COD_13O, COD_BASE_INSS_FUNC } from '@/shared/folha/eventos-pioneira.js';
import {
  SETOR_JOIN_SQL,
  SETOR_GRUPO_COD_SQL,
  SETOR_GRUPO_NOME_SQL,
  SETOR_COD_UNIDADE_SQL,
  SETOR_BUCKET_SQL,
} from '@/shared/folha/setores-pioneira.js';
import type { BucketSetor } from '@pioneira/shared/schemas/folha-detalhe';
import { AcessoDados } from '@/entities/acesso-dados.entity.js';
import ExcelJS from 'exceljs';

/**
 * Alíquota patronal ESTIMADA (20% CPP + 3% RAT transporte + 5,8% terceiros).
 * Duplicada do módulo Tributos de propósito (regra do projeto: duplicação >
 * acoplamento errado). É ESTIMATIVA — transporte pode ter desoneração (CPRB),
 * que troca a base para a receita bruta. Sempre marcada como estimativa na UI.
 */
const ALIQUOTA_PATRONAL_ESTIMADA = 0.288;

/** TIPOFOLHA duplicado do 13º (cálculo paralelo) — excluir de somas. Ver enum. */
const TIPO_FOLHA_13O_DUPLICADO = 35;

/** Competência anterior (YYYY-MM → YYYY-MM), tratando virada de ano. */
function competenciaAnterior(yyyyMm: string): string {
  const [ano, mes] = yyyyMm.split('-').map(Number);
  const d = new Date(Date.UTC(ano!, mes! - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

interface SetorAgg {
  grupo_cod: string | null;
  grupo_nome: string | null;
  cod_unidade: string | null;
  bucket: BucketSetor;
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
  grupo_cod: string | null;
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
  fgts?: string;
  acidente?: boolean;
  doenca?: boolean;
  maternidade?: boolean;
  licenca?: boolean;
  saldo_devedor?: boolean;
}

/**
 * Range da competência da folha. A Pioneira grava COMPETFICHA no ÚLTIMO DIA DO
 * PRÓPRIO mês (abril=30/04, maio=31/05), então usamos o MÊS SIMPLES
 * [YYYY-MM-01, próximo-mês-01) — que pega só o 31/05 para 'maio'.
 * A janela larga antiga [30/04, 01/06) apanhava DOIS meses e DOBRAVA o valor
 * (validado no banco 2026-07; ver Leia/folha-integracao-transversal-2026-07.md §6b).
 */
function rangeCompetencia(yyyyMm: string): { dtIni: string; dtFimExcl: string } {
  const [ano, mes] = yyyyMm.split('-').map(Number);
  const dtIni = new Date(Date.UTC(ano!, mes! - 1, 1)).toISOString().slice(0, 10);
  const dtFimExcl = new Date(Date.UTC(ano!, mes!, 1)).toISOString().slice(0, 10);
  return { dtIni, dtFimExcl };
}

export function buildFolhaDetalheService(fastify: FastifyInstance) {
  const funcRepo = fastify.db.getRepository(Funcionario);
  const fichaRepo = fastify.db.getRepository(FichaEvento);
  const eventoRepo = fastify.db.getRepository(EventoFolha);
  const jobRepo = fastify.db.getRepository(SyncJob);
  const acessoRepo = fastify.db.getRepository(AcessoDados);
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
      // O WHERE NÃO filtra `ev.tipo IN ('P','D')` porque o FGTS calculado e
      // outros totalizadores (INSS-base, IRRF-base) chegam como tipo='B' no
      // Praxio. Filtrar P/D no WHERE excluía todos eles e zerava o SUM(fgts).
      //
      // O COUNT de funcionários usa FILTER pra contar só quem tem lançamento
      // efetivo (P ou D) — evita inflar com funcionários que só aparecem em
      // linhas-base (raro, mas existe na Pioneira).
      const setoresRaw = await fichaRepo.query<SetorAgg[]>(
        `SELECT ${SETOR_GRUPO_COD_SQL} AS grupo_cod,
                ${SETOR_GRUPO_NOME_SQL} AS grupo_nome,
                ${SETOR_COD_UNIDADE_SQL} AS cod_unidade,
                ${SETOR_BUCKET_SQL} AS bucket,
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
         ${SETOR_JOIN_SQL}
         WHERE fe.competencia >= $1::date AND fe.competencia < $2::date
           ${tipoFolhaFiltro}
         GROUP BY 1, 2, 3, 4
         ORDER BY (COALESCE(SUM(CASE WHEN ev.tipo = 'P' THEN fe.valor_cents ELSE 0 END), 0)
                   - COALESCE(SUM(CASE WHEN ev.tipo = 'D' THEN fe.valor_cents ELSE 0 END), 0)) DESC`,
        paramsBase,
      );

      // Quebra por função dentro de cada setor (líquido). O CASE já exclui
      // tipo 'B' do somatório (ELSE 0), não precisa filtrar no WHERE — manter
      // tipo 'B' aqui não distorce nada e padroniza com a query de setores.
      const funcoesRaw = await fichaRepo.query<FuncaoAgg[]>(
        `SELECT ${SETOR_GRUPO_COD_SQL} AS grupo_cod, f.desc_funcao,
                COUNT(DISTINCT f.id) FILTER (WHERE ev.tipo IN ('P','D'))::text AS qtd_funcionarios,
                COALESCE(SUM(CASE WHEN ev.tipo = 'P' THEN fe.valor_cents
                                  WHEN ev.tipo = 'D' THEN -fe.valor_cents
                                  ELSE 0 END), 0)::text AS liquido
         FROM finance.ficha_evento fe
         JOIN finance.funcionarios f ON f.id = fe.funcionario_id
         JOIN finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
         ${SETOR_JOIN_SQL}
         WHERE fe.competencia >= $1::date AND fe.competencia < $2::date
           ${tipoFolhaFiltro}
         GROUP BY 1, f.desc_funcao
         ORDER BY 1, liquido DESC`,
        paramsBase,
      );

      // Contagem com/sem líquido por setor: o líquido é POR FUNCIONÁRIO (soma da
      // ficha), então agrega em dois níveis. "Sem líquido" = afastado / saldo
      // devedor (recebe 0, mas pode gerar encargo). Query à parte para não
      // reescrever a principal.
      const liquidoRaw = await fichaRepo.query<Array<{ grupo_cod: string | null; com: string; sem: string }>>(
        `SELECT grupo_cod,
                COUNT(*) FILTER (WHERE liquido > 0)::text AS com,
                COUNT(*) FILTER (WHERE liquido <= 0)::text AS sem
         FROM (
           SELECT ${SETOR_GRUPO_COD_SQL} AS grupo_cod, f.id,
                  SUM(CASE WHEN ev.tipo = 'P' THEN fe.valor_cents
                           WHEN ev.tipo = 'D' THEN -fe.valor_cents ELSE 0 END) AS liquido
           FROM finance.ficha_evento fe
           JOIN finance.funcionarios f ON f.id = fe.funcionario_id
           JOIN finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
           ${SETOR_JOIN_SQL}
           WHERE fe.competencia >= $1::date AND fe.competencia < $2::date
             ${tipoFolhaFiltro}
           GROUP BY grupo_cod, f.id
           HAVING COUNT(*) FILTER (WHERE ev.tipo IN ('P','D')) > 0
         ) t
         GROUP BY grupo_cod`,
        paramsBase,
      );
      const liquidoPorArea = new Map<string, { com: number; sem: number }>();
      for (const l of liquidoRaw) {
        liquidoPorArea.set(l.grupo_cod ?? '__null__', { com: Number(l.com), sem: Number(l.sem) });
      }

      const funcoesPorArea = new Map<string, QuebraFuncao[]>();
      for (const fn of funcoesRaw) {
        const chave = fn.grupo_cod ?? '__null__';
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
        const liq = liquidoPorArea.get(s.grupo_cod ?? '__null__') ?? { com: 0, sem: 0 };
        return {
          codArea: s.grupo_cod,
          descArea: s.grupo_nome,
          codUnidade: s.cod_unidade,
          bucket: s.bucket,
          qtdFuncionarios: Number(s.qtd_funcionarios),
          qtdComLiquido: liq.com,
          qtdSemLiquido: liq.sem,
          proventosCents: proventos,
          descontosCents: descontos,
          liquidoCents: proventos - descontos,
          inssCents: Number(s.inss),
          fgtsCents: Number(s.fgts),
          irrfCents: Number(s.irrf),
          vtCents: Number(s.vt),
          vaCents: Number(s.va),
          porFuncao: funcoesPorArea.get(s.grupo_cod ?? '__null__') ?? [],
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
        // codArea aqui é o CÓDIGO DO GRUPO reconciliado (unidade CP ou CODAREA cru
        // dos "a classificar"), não o CODAREA bruto — casa com o que a lista por
        // setor devolve. Filtra pela mesma expressão de reconciliação.
        params.push(query.codArea);
        wheres.push(`${SETOR_GRUPO_COD_SQL} = $${params.length}`);
      }
      if (query.descFuncao) {
        params.push(query.descFuncao);
        wheres.push(`f.desc_funcao = $${params.length}`);
      }
      if (query.status === 'ativo') wheres.push('f.ativo = TRUE');
      else if (query.status === 'inativo') wheres.push('f.ativo = FALSE');
      if (query.busca) {
        params.push(`%${query.busca}%`);
        wheres.push(`(f.nome ILIKE $${params.length} OR f.cod_func ILIKE $${params.length})`);
      }
      // Recorte por líquido (com/sem). Subquery por funcionário (o líquido é a
      // soma da ficha na competência) para valer no total E na página. 'sem' =
      // afastado / saldo devedor. Usa $1/$2 (competência), já presentes.
      if (query.liquido === 'com' || query.liquido === 'sem') {
        const cmp = query.liquido === 'com' ? '> 0' : '<= 0';
        wheres.push(
          `f.id IN (
             SELECT fe2.funcionario_id FROM finance.ficha_evento fe2
             JOIN finance.eventos_folha ev2 ON ev2.cod_evento = fe2.cod_evento
             WHERE fe2.competencia >= $1::date AND fe2.competencia < $2::date
             GROUP BY fe2.funcionario_id
             HAVING SUM(CASE WHEN ev2.tipo='P' THEN fe2.valor_cents
                             WHEN ev2.tipo='D' THEN -fe2.valor_cents ELSE 0 END) ${cmp}
           )`,
        );
      }
      const whereSql = wheres.join(' AND ');

      const totalRows = await fichaRepo.query<Array<{ total: string }>>(
        `SELECT COUNT(DISTINCT f.id)::text AS total
         FROM finance.ficha_evento fe
         JOIN finance.funcionarios f ON f.id = fe.funcionario_id
         ${SETOR_JOIN_SQL}
         WHERE ${whereSql}`,
        params,
      );
      const total = Number(totalRows[0]?.total ?? 0);

      params.push(porPagina, offset);
      // Flags de afastamento/saldo devedor por presença de evento na ficha:
      //   56/174 acidente · 50 auxílio-doença · 112 maternidade ·
      //   152/404 licença · 31/165 saldo devedor. Sem filtro de tipo P/D nas
      //   flags — o evento-base identifica o afastamento independentemente.
      const itensRaw = await fichaRepo.query<FuncRowAgg[]>(
        `SELECT f.id, f.cod_func, f.nome, f.cod_area, f.desc_area, f.desc_funcao,
                COALESCE(SUM(CASE WHEN ev.tipo = 'P' THEN fe.valor_cents ELSE 0 END), 0)::text AS proventos,
                COALESCE(SUM(CASE WHEN ev.tipo = 'D' THEN fe.valor_cents ELSE 0 END), 0)::text AS descontos,
                COALESCE(SUM(CASE WHEN ev.grupo = 'fgts' THEN fe.valor_cents ELSE 0 END), 0)::text AS fgts,
                BOOL_OR(fe.cod_evento IN (56, 174)) AS acidente,
                BOOL_OR(fe.cod_evento = 50)         AS doenca,
                BOOL_OR(fe.cod_evento = 112)        AS maternidade,
                BOOL_OR(fe.cod_evento IN (152, 404)) AS licenca,
                BOOL_OR(fe.cod_evento IN (31, 165))  AS saldo_devedor
         FROM finance.ficha_evento fe
         JOIN finance.funcionarios f ON f.id = fe.funcionario_id
         JOIN finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
         ${SETOR_JOIN_SQL}
         WHERE ${whereSql}
         GROUP BY f.id, f.cod_func, f.nome, f.cod_area, f.desc_area, f.desc_funcao
         ORDER BY f.nome
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      const itens: FuncionarioItem[] = itensRaw.map((r) => {
        const proventos = Number(r.proventos);
        const descontos = Number(r.descontos);
        const liquido = proventos - descontos;
        // Afastamento manda (é a razão de fato); saldo devedor só quando zerou
        // o líquido sem afastamento. Normal caso contrário.
        const situacaoFolha: FuncionarioItem['situacaoFolha'] =
          r.acidente ? 'afastado_acidente'
          : r.doenca ? 'afastado_doenca'
          : r.maternidade ? 'afastado_maternidade'
          : r.licenca ? 'licenca'
          : (liquido === 0 && r.saldo_devedor) ? 'saldo_devedor'
          : 'normal';
        return {
          id: r.id,
          codFunc: r.cod_func,
          nome: r.nome,
          codArea: r.cod_area,
          descArea: r.desc_area,
          descFuncao: r.desc_funcao,
          proventosCents: proventos,
          descontosCents: descontos,
          liquidoCents: liquido,
          fgtsCents: Number(r.fgts ?? 0),
          situacaoFolha,
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

    /**
     * Exporta a lista de funcionários (com os mesmos filtros da listagem) em
     * Excel (.xlsx) e REGISTRA o export na trilha de auditoria (LGPD): quem
     * exportou, data/hora, IP e filtros usados. Dado sensível — o registro é
     * obrigatório.
     */
    async exportarFuncionarios(
      query: FuncionariosQuery,
      usuarioId: string,
      ip: string | null,
      userAgent: string | null,
    ): Promise<{ buffer: Buffer; filename: string; total: number }> {
      const { dtIni, dtFimExcl } = rangeCompetencia(query.competencia);
      const wheres: string[] = ['fe.competencia >= $1::date', 'fe.competencia < $2::date'];
      const params: unknown[] = [dtIni, dtFimExcl];
      if (query.tipoFolha) { params.push(query.tipoFolha); wheres.push(`fe.tipo_folha = $${params.length}`); }
      // codArea = código do grupo reconciliado (ver listarFuncionarios).
      if (query.codArea) { params.push(query.codArea); wheres.push(`${SETOR_GRUPO_COD_SQL} = $${params.length}`); }
      if (query.descFuncao) { params.push(query.descFuncao); wheres.push(`f.desc_funcao = $${params.length}`); }
      if (query.status === 'ativo') wheres.push('f.ativo = TRUE');
      else if (query.status === 'inativo') wheres.push('f.ativo = FALSE');
      if (query.busca) { params.push(`%${query.busca}%`); wheres.push(`(f.nome ILIKE $${params.length} OR f.cod_func ILIKE $${params.length})`); }

      const rows = await fichaRepo.query<Array<{
        cod_func: string; nome: string; desc_area: string | null; desc_funcao: string | null;
        ativo: boolean; proventos: string; descontos: string;
      }>>(
        `SELECT f.cod_func, f.nome, f.desc_area, f.desc_funcao, f.ativo,
                COALESCE(SUM(CASE WHEN ev.tipo = 'P' THEN fe.valor_cents ELSE 0 END), 0)::text AS proventos,
                COALESCE(SUM(CASE WHEN ev.tipo = 'D' THEN fe.valor_cents ELSE 0 END), 0)::text AS descontos
         FROM finance.ficha_evento fe
         JOIN finance.funcionarios f ON f.id = fe.funcionario_id
         JOIN finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
         ${SETOR_JOIN_SQL}
         WHERE ${wheres.join(' AND ')} AND ev.tipo IN ('P','D')
         GROUP BY f.id, f.cod_func, f.nome, f.desc_area, f.desc_funcao, f.ativo
         ORDER BY f.desc_area NULLS LAST, f.nome`,
        params,
      );

      const AZUL = 'FF1F3A5F';
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Sistema Financeiro Pioneira';
      const ws = wb.addWorksheet('Custo por Setor', { views: [{ state: 'frozen', ySplit: 4 }] });

      // Larguras das colunas.
      const larguras = [14, 42, 26, 26, 10, 16, 16, 16];
      larguras.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

      // (Linha 1) Título.
      ws.mergeCells('A1:H1');
      const titulo = ws.getCell('A1');
      titulo.value = `Custo por Setor — competência ${query.competencia}`;
      titulo.font = { bold: true, size: 14, color: { argb: AZUL } };

      // (Linha 2) Filtros aplicados + contagem — documenta o que foi exportado.
      const filtrosTxt = [
        query.codArea ? `Setor: ${query.codArea}` : null,
        query.descFuncao ? `Função: ${query.descFuncao}` : null,
        `Status: ${query.status && query.status !== 'todos' ? query.status : 'todos'}`,
        query.tipoFolha ? `Tipo folha: ${query.tipoFolha}` : 'Tipo folha: todas',
        query.busca ? `Busca: "${query.busca}"` : null,
      ].filter(Boolean).join('  ·  ');
      ws.mergeCells('A2:H2');
      const sub = ws.getCell('A2');
      sub.value = `Filtros — ${filtrosTxt}   |   ${rows.length} funcionário(s)`;
      sub.font = { size: 10, italic: true, color: { argb: 'FF666666' } };

      // (Linha 4) Cabeçalho com AutoFilter.
      const headers = ['Matrícula', 'Nome', 'Setor', 'Função', 'Status', 'Proventos (R$)', 'Descontos (R$)', 'Líquido (R$)'];
      const hr = ws.getRow(4);
      headers.forEach((h, i) => {
        const cell = hr.getCell(i + 1);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
        cell.alignment = { vertical: 'middle', horizontal: i >= 5 ? 'right' : 'left' };
      });
      hr.height = 18;

      // Dados.
      let totProv = 0, totDesc = 0;
      for (const r of rows) {
        const prov = Number(r.proventos) / 100;
        const desc = Number(r.descontos) / 100;
        totProv += prov; totDesc += desc;
        const row = ws.addRow([r.cod_func, r.nome, r.desc_area ?? '—', r.desc_funcao ?? '—', r.ativo ? 'Ativo' : 'Inativo', prov, desc, prov - desc]);
        for (const c of [6, 7, 8]) {
          row.getCell(c).numFmt = '#,##0.00';
          row.getCell(c).alignment = { horizontal: 'right' };
        }
      }

      // AutoFilter só na faixa de dados (cabeçalho linha 4 → última linha de dados).
      const ultimaDados = 4 + rows.length;
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: ultimaDados, column: 8 } };

      // Resumo (linha em branco + TOTAL), fora da faixa do filtro.
      ws.addRow([]);
      const totalRow = ws.addRow(['', '', '', '', 'TOTAL', totProv, totDesc, totProv - totDesc]);
      totalRow.font = { bold: true };
      totalRow.getCell(5).alignment = { horizontal: 'right' };
      for (const c of [6, 7, 8]) {
        totalRow.getCell(c).numFmt = '#,##0.00';
        totalRow.getCell(c).alignment = { horizontal: 'right' };
        totalRow.getCell(c).border = { top: { style: 'thin', color: { argb: 'FFAAAAAA' } } };
      }

      const buffer = Buffer.from(await wb.xlsx.writeBuffer());

      // Trilha de auditoria (LGPD).
      await acessoRepo.save(
        acessoRepo.create({
          usuarioId,
          acao: 'exportou',
          recurso: 'folha-detalhe-funcionarios',
          descricao: `Exportou ${rows.length} funcionário(s) em Excel — competência ${query.competencia}`,
          filtros: {
            competencia: query.competencia,
            tipoFolha: query.tipoFolha ?? null,
            codArea: query.codArea ?? null,
            descFuncao: query.descFuncao ?? null,
            status: query.status ?? 'todos',
            busca: query.busca ?? null,
          },
          ipAddress: ip,
          userAgent: userAgent ? userAgent.slice(0, 500) : null,
        }),
      );

      const sufixo = query.codArea ? `-setor-${query.codArea}` : '';
      return { buffer, filename: `custo-por-setor-${query.competencia}${sufixo}.xlsx`, total: rows.length };
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

    /** Comparativo da competência vs mês anterior, por setor. */
    async comparativo(query: ComparativoQuery): Promise<ComparativoResponse> {
      const compAnterior = competenciaAnterior(query.competencia);
      const rAtual = rangeCompetencia(query.competencia);
      const rAnterior = rangeCompetencia(compAnterior);

      const somaSetores = async (dtIni: string, dtFimExcl: string) => {
        const filtro = query.tipoFolha ? 'AND fe.tipo_folha = $3' : '';
        const params: unknown[] = query.tipoFolha ? [dtIni, dtFimExcl, query.tipoFolha] : [dtIni, dtFimExcl];
        return fichaRepo.query<Array<{ cod_area: string | null; desc_area: string | null; qtd: string; proventos: string; descontos: string }>>(
          `SELECT f.cod_area, f.desc_area,
                  COUNT(DISTINCT f.id) FILTER (WHERE ev.tipo IN ('P','D'))::text AS qtd,
                  COALESCE(SUM(CASE WHEN ev.tipo = 'P' THEN fe.valor_cents ELSE 0 END), 0)::text AS proventos,
                  COALESCE(SUM(CASE WHEN ev.tipo = 'D' THEN fe.valor_cents ELSE 0 END), 0)::text AS descontos
           FROM finance.ficha_evento fe
           JOIN finance.funcionarios f ON f.id = fe.funcionario_id
           JOIN finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
           WHERE fe.competencia >= $1::date AND fe.competencia < $2::date ${filtro}
           GROUP BY f.cod_area, f.desc_area`,
          params,
        );
      };

      const [atualRaw, anteriorRaw] = await Promise.all([
        somaSetores(rAtual.dtIni, rAtual.dtFimExcl),
        somaSetores(rAnterior.dtIni, rAnterior.dtFimExcl),
      ]);

      const chave = (cod: string | null) => cod ?? '__null__';
      const mapAnterior = new Map(anteriorRaw.map((s) => [chave(s.cod_area), s]));
      const mapAtual = new Map(atualRaw.map((s) => [chave(s.cod_area), s]));
      const todasChaves = new Set([...mapAtual.keys(), ...mapAnterior.keys()]);

      const setores: ComparativoSetorItem[] = [];
      for (const k of todasChaves) {
        const a = mapAtual.get(k);
        const b = mapAnterior.get(k);
        const atualLiquido = a ? Number(a.proventos) - Number(a.descontos) : 0;
        const anteriorLiquido = b ? Number(b.proventos) - Number(b.descontos) : 0;
        const delta = atualLiquido - anteriorLiquido;
        const ref = (a ?? b)!;
        setores.push({
          codArea: ref.cod_area,
          descArea: ref.desc_area,
          atualQtd: a ? Number(a.qtd) : 0,
          anteriorQtd: b ? Number(b.qtd) : 0,
          atualLiquidoCents: atualLiquido,
          anteriorLiquidoCents: anteriorLiquido,
          deltaLiquidoCents: delta,
          deltaLiquidoPct: anteriorLiquido !== 0 ? (delta / Math.abs(anteriorLiquido)) * 100 : null,
        });
      }
      setores.sort((x, y) => Math.abs(y.deltaLiquidoCents) - Math.abs(x.deltaLiquidoCents));

      const somaTotais = (rows: Array<{ qtd: string; proventos: string; descontos: string }>) =>
        rows.reduce(
          (acc, s) => {
            const prov = Number(s.proventos), desc = Number(s.descontos);
            return {
              qtdFuncionarios: acc.qtdFuncionarios + Number(s.qtd),
              proventosCents: acc.proventosCents + prov,
              descontosCents: acc.descontosCents + desc,
              liquidoCents: acc.liquidoCents + (prov - desc),
            };
          },
          { qtdFuncionarios: 0, proventosCents: 0, descontosCents: 0, liquidoCents: 0 },
        );

      return {
        competencia: query.competencia,
        competenciaAnterior: compAnterior,
        tipoFolha: query.tipoFolha ?? null,
        totaisAtual: somaTotais(atualRaw),
        totaisAnterior: somaTotais(anteriorRaw),
        setores,
      };
    },

    /**
     * Férias e 13º REALIZADO (efetivamente pago) no ano — por mês, verba e setor.
     * Usa dado real da folha (não provisão): soma só os proventos das verbas de
     * férias/13º e EXCLUI a folha tipo 35 (cálculo paralelo do 13º) pra não dobrar.
     */
    async feriasDecimo(query: FeriasDecimoQuery): Promise<FeriasDecimoResponse> {
      const ano = Number(query.ano);
      const dtIni = `${ano}-01-01`;
      const dtFimExcl = `${ano + 1}-01-01`;
      const feriasIn = COD_FERIAS.join(',');
      const decimoIn = COD_13O.join(',');
      const catExpr = `CASE WHEN fe.cod_evento IN (${feriasIn}) THEN 'ferias' ELSE '13o' END`;
      const escopo = `fe.competencia >= $1::date AND fe.competencia < $2::date
           AND fe.tipo_folha <> ${TIPO_FOLHA_13O_DUPLICADO}
           AND fe.cod_evento IN (${feriasIn}, ${decimoIn})`;
      const params = [dtIni, dtFimExcl];

      const mesRaw = await fichaRepo.query<Array<{ mes: string; categoria: string; valor: string; qtd: string }>>(
        `SELECT TO_CHAR(fe.competencia, 'YYYY-MM') AS mes, ${catExpr} AS categoria,
                COALESCE(SUM(fe.valor_cents), 0)::text AS valor,
                COUNT(DISTINCT fe.funcionario_id)::text AS qtd
         FROM finance.ficha_evento fe
         WHERE ${escopo}
         GROUP BY 1, 2
         ORDER BY 1`,
        params,
      );

      const verbaRaw = await fichaRepo.query<Array<{ cod_evento: number; descricao: string; categoria: string; valor: string }>>(
        `SELECT fe.cod_evento, ev.descricao, ${catExpr} AS categoria,
                COALESCE(SUM(fe.valor_cents), 0)::text AS valor
         FROM finance.ficha_evento fe
         JOIN finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
         WHERE ${escopo}
         GROUP BY fe.cod_evento, ev.descricao
         ORDER BY valor DESC`,
        params,
      );

      const setorRaw = await fichaRepo.query<Array<{ cod_area: string | null; desc_area: string | null; categoria: string; valor: string }>>(
        `SELECT f.cod_area, f.desc_area, ${catExpr} AS categoria,
                COALESCE(SUM(fe.valor_cents), 0)::text AS valor
         FROM finance.ficha_evento fe
         JOIN finance.funcionarios f ON f.id = fe.funcionario_id
         WHERE ${escopo}
         GROUP BY f.cod_area, f.desc_area`,
        params,
      );

      const montar = (cat: 'ferias' | '13o'): CategoriaRealizado => {
        const porMes = mesRaw
          .filter((r) => r.categoria === cat)
          .map((r) => ({ competencia: r.mes, valorCents: Number(r.valor), qtdFuncionarios: Number(r.qtd) }));
        const porVerba = verbaRaw
          .filter((r) => r.categoria === cat)
          .map((r) => ({ codEvento: Number(r.cod_evento), descricao: r.descricao, valorCents: Number(r.valor) }));
        const porSetor = setorRaw
          .filter((r) => r.categoria === cat)
          .map((r) => ({ codArea: r.cod_area, descArea: r.desc_area, valorCents: Number(r.valor) }))
          .sort((a, b) => b.valorCents - a.valorCents);
        const totalCents = porVerba.reduce((s, v) => s + v.valorCents, 0);
        return { totalCents, porMes, porVerba, porSetor };
      };

      return {
        ano: query.ano,
        ferias: montar('ferias'),
        decimoTerceiro: montar('13o'),
        observacao:
          'Valores REAIS pagos na folha (FLP) — só proventos das verbas de férias e 13º, rastreáveis por verba. Exclui a folha de cálculo paralelo do 13º (tipo 35) para não duplicar. É o realizado, não provisão contábil.',
      };
    },

    /**
     * Custo total por setor com encargos: bruto + FGTS real + INSS patronal.
     * O INSS patronal usa o DADO REAL da GPS do Globus (finance.folha_gps, com
     * desoneração/CPRB) quando sincronizado — rateado por base INSS entre os
     * setores — e cai pra estimativa (base × 28,8%) só quando a GPS não existe.
     * Mesma fonte que o painel Tributos, pra as duas telas baterem.
     */
    async custoComEncargos(query: CustoEncargosQuery): Promise<CustoEncargosResponse> {
      const { dtIni, dtFimExcl } = rangeCompetencia(query.competencia);
      const filtro = query.tipoFolha ? 'AND fe.tipo_folha = $3' : '';
      const params: unknown[] = query.tipoFolha ? [dtIni, dtFimExcl, query.tipoFolha] : [dtIni, dtFimExcl];

      const raw = await fichaRepo.query<Array<{ grupo_cod: string | null; grupo_nome: string | null; cod_unidade: string | null; bucket: BucketSetor; qtd: string; bruto: string; fgts: string; base_inss: string }>>(
        `SELECT ${SETOR_GRUPO_COD_SQL} AS grupo_cod,
                ${SETOR_GRUPO_NOME_SQL} AS grupo_nome,
                ${SETOR_COD_UNIDADE_SQL} AS cod_unidade,
                ${SETOR_BUCKET_SQL} AS bucket,
                COUNT(DISTINCT f.id) FILTER (WHERE ev.tipo IN ('P','D'))::text AS qtd,
                COALESCE(SUM(CASE WHEN ev.tipo = 'P' THEN fe.valor_cents ELSE 0 END), 0)::text AS bruto,
                COALESCE(SUM(CASE WHEN ev.grupo = 'fgts' THEN fe.valor_cents ELSE 0 END), 0)::text AS fgts,
                COALESCE(SUM(CASE WHEN fe.cod_evento = ${COD_BASE_INSS_FUNC} THEN fe.valor_cents ELSE 0 END), 0)::text AS base_inss
         FROM finance.ficha_evento fe
         JOIN finance.funcionarios f ON f.id = fe.funcionario_id
         JOIN finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
         ${SETOR_JOIN_SQL}
         WHERE fe.competencia >= $1::date AND fe.competencia < $2::date ${filtro}
         GROUP BY 1, 2, 3, 4`,
        params,
      );

      // INSS patronal REAL da GPS do Globus (com desoneração) — soma da competência.
      const empresaId = fastify.config.globus.empresaId;
      const gpsFiltroTipo = query.tipoFolha ? 'AND tipo_folha = $3' : '';
      const gpsParams: unknown[] = query.tipoFolha
        ? [empresaId, `${query.competencia}-01`, query.tipoFolha]
        : [empresaId, `${query.competencia}-01`];
      const gpsRows = await fichaRepo.query<Array<{ com: string; linhas: string; sync: string | null }>>(
        `SELECT COALESCE(SUM(patronal_com_deson_cents), 0)::text AS com,
                COUNT(*)::text AS linhas,
                MAX(ultimo_sync_em)::text AS sync
           FROM finance.folha_gps
          WHERE empresa_id = $1 AND competencia = $2::date ${gpsFiltroTipo} AND excluido_em IS NULL`,
        gpsParams,
      );
      const gps = gpsRows[0];
      const temGps = !!gps && Number(gps.linhas) > 0 && Number(gps.com) > 0;
      const gpsComCents = temGps ? Number(gps!.com) : 0;
      const gpsSincronizadoEm = temGps && gps!.sync ? new Date(gps!.sync).toISOString() : null;
      const patronalFonte: 'real' | 'estimativa' = temGps ? 'real' : 'estimativa';

      const totalBaseInss = raw.reduce((acc, s) => acc + Number(s.base_inss), 0);

      const setores: CustoEncargosSetor[] = raw
        .map((s) => {
          const bruto = Number(s.bruto);
          const fgts = Number(s.fgts);
          const baseInss = Number(s.base_inss);
          // Real: rateia o patronal da GPS por base INSS (a soma dos setores = GPS).
          // Estimativa: base × alíquota, só quando a GPS não está sincronizada.
          const inssPatronal = temGps && totalBaseInss > 0
            ? Math.round(gpsComCents * (baseInss / totalBaseInss))
            : Math.round(baseInss * ALIQUOTA_PATRONAL_ESTIMADA);
          return {
            codArea: s.grupo_cod,
            descArea: s.grupo_nome,
            codUnidade: s.cod_unidade,
            bucket: s.bucket,
            qtdFuncionarios: Number(s.qtd),
            brutoCents: bruto,
            fgtsCents: fgts,
            baseInssCents: baseInss,
            inssPatronalCents: inssPatronal,
            custoEmpresaCents: bruto + fgts + inssPatronal,
          };
        })
        .sort((a, b) => b.custoEmpresaCents - a.custoEmpresaCents);

      const totais = setores.reduce(
        (acc, s) => ({
          qtdFuncionarios: acc.qtdFuncionarios + s.qtdFuncionarios,
          brutoCents: acc.brutoCents + s.brutoCents,
          fgtsCents: acc.fgtsCents + s.fgtsCents,
          baseInssCents: acc.baseInssCents + s.baseInssCents,
          inssPatronalCents: acc.inssPatronalCents + s.inssPatronalCents,
          custoEmpresaCents: acc.custoEmpresaCents + s.custoEmpresaCents,
        }),
        { qtdFuncionarios: 0, brutoCents: 0, fgtsCents: 0, baseInssCents: 0, inssPatronalCents: 0, custoEmpresaCents: 0 },
      );

      const observacao = temGps
        ? 'Custo empresa = bruto (proventos) + FGTS real + INSS patronal REAL da GPS do Globus (com desoneração/CPRB), rateado por base INSS entre os setores. Todos os componentes são dado real.'
        : `Custo empresa = bruto + FGTS real + INSS patronal ESTIMADO (base INSS × ${(ALIQUOTA_PATRONAL_ESTIMADA * 100).toFixed(1)}%). A GPS da folha ainda não está sincronizada — o real (com desoneração/CPRB) é MENOR. Sincronize a GPS no módulo Tributos para trocar a estimativa pelo valor real.`;

      return {
        competencia: query.competencia,
        tipoFolha: query.tipoFolha ?? null,
        patronalFonte,
        aliquotaPatronalEstimada: ALIQUOTA_PATRONAL_ESTIMADA,
        gpsSincronizadoEm,
        totais,
        setores,
        observacao,
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
