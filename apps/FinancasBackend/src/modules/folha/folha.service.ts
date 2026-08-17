import type { FastifyInstance } from 'fastify';
import type {
  FolhaCompetenciasQuery,
  FolhaCompetenciasResponse,
  CompetenciaFolhaItem,
  QuebraTipoFolha,
  FolhaEncargosQuery,
  FolhaEncargosResponse,
  CategoriaFolha,
  FolhaEventoDetalheQuery,
  FolhaEventoDetalheResponse,
  FuncionarioEvento,
} from '@pioneira/shared/schemas/folha';
import type { TipoFolha } from '@pioneira/shared/enums/tipo-folha';
import { TIPO_FOLHA_FLP_LABEL } from '@pioneira/shared/enums/tipo-folha-flp';
import { ContaPagar } from '@/entities/conta-pagar.entity.js';
import { SyncJob } from '@/entities/sync-job.entity.js';
import {
  CATEGORIAS_ENCARGOS_FOLHA,
  COD_TOTAL_PROVENTOS,
  COD_TOTAL_DESCONTOS,
  COD_LIQUIDO_FOLHA,
  CHAVE_PENSAO,
  CHAVE_OUTROS_DESCONTOS,
} from '@/shared/folha/eventos-pioneira.js';

const MES_LABEL: Record<number, string> = {
  1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 6: 'Junho',
  7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro',
};

interface CompetenciaRaw {
  competencia: Date | string;
  qtd_titulos: string;
  qtd_fornecedores: string;
  bruto: string;
  inss: string;
  irrf: string;
  pis: string;
  cofins: string;
  csll: string;
  iss: string;
  liquido: string;
  pago: string;
  primeiro_vencimento: Date | string | null;
  ultimo_vencimento: Date | string | null;
}

function competenciaLabelFromDate(iso: string): string {
  // iso = 'YYYY-MM-01'
  const ano = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  return `${MES_LABEL[mes] ?? mes}/${ano}`;
}

/**
 * Range da competência da folha. A Pioneira grava COMPETFICHA no ÚLTIMO DIA DO
 * PRÓPRIO MÊS (abril=30/04, maio=31/05), então usamos o MÊS SIMPLES
 * [YYYY-MM-01, próximo-mês-01) — que pega só o 31/05 para 'maio'.
 * A janela larga antiga [30/04, 01/06) apanhava DOIS meses e DOBRAVA o valor
 * (ver Leia/folha-integracao-transversal-2026-07.md, seção 6b).
 */
function rangeCompetenciaFolha(yyyyMm: string): { dtIni: string; dtFimExcl: string } {
  const [ano, mes] = yyyyMm.split('-').map(Number);
  const dtIni = new Date(Date.UTC(ano!, mes! - 1, 1)).toISOString().slice(0, 10);
  const dtFimExcl = new Date(Date.UTC(ano!, mes!, 1)).toISOString().slice(0, 10);
  return { dtIni, dtFimExcl };
}

/** Converte qualquer entrada de data do TypeORM para string YYYY-MM-DD. */
function dataIsoOuNull(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  // Pode vir como '2026-04-01' ou '2026-04-01T00:00:00.000Z' ou 'Wed May 13 2026...'
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Último fallback: parsear como Date
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function buildFolhaService(fastify: FastifyInstance) {
  const cpRepo = fastify.db.getRepository(ContaPagar);
  const jobRepo = fastify.db.getRepository(SyncJob);

  return {
    /**
     * Agrega todos os títulos com origem_documento='folha' por competencia_flp.
     * Calcula totais brutos, retenções detalhadas, valor a pagar (líquido após
     * retenções) e quanto já foi pago.
     */
    async listarCompetencias(query: FolhaCompetenciasQuery): Promise<FolhaCompetenciasResponse> {
      // Padrão: filtra pelo mês de PAGAMENTO (data_vencimento) - faz sentido para tesouraria.
      // Folha de Abril (competencia_flp=2026-04) é paga em Maio (data_vencimento=2026-05).
      const filtrarPor = query.filtrarPor ?? 'vencimento';
      const colunaFiltro = filtrarPor === 'competencia' ? 'cp.competencia_flp' : 'cp.data_vencimento';

      const qb = cpRepo
        .createQueryBuilder('cp')
        .select('cp.competencia_flp', 'competencia')
        .addSelect('COUNT(*)', 'qtd_titulos')
        .addSelect('COUNT(DISTINCT cp.fornecedor_id)', 'qtd_fornecedores')
        .addSelect('COALESCE(SUM(cp.valor_bruto_cents), 0)', 'bruto')
        .addSelect('COALESCE(SUM(cp.vlr_inss_cents), 0)', 'inss')
        .addSelect('COALESCE(SUM(cp.vlr_irrf_cents), 0)', 'irrf')
        .addSelect('COALESCE(SUM(cp.vlr_pis_cents), 0)', 'pis')
        .addSelect('COALESCE(SUM(cp.vlr_cofins_cents), 0)', 'cofins')
        .addSelect('COALESCE(SUM(cp.vlr_csll_cents), 0)', 'csll')
        .addSelect('COALESCE(SUM(cp.vlr_iss_cents), 0)', 'iss')
        .addSelect('COALESCE(SUM(cp.valor_liquido_cents), 0)', 'liquido')
        .addSelect(
          `COALESCE(SUM(CASE WHEN cp.quitado = true OR cp.data_pagamento IS NOT NULL THEN cp.valor_liquido_cents ELSE 0 END), 0)`,
          'pago',
        )
        .addSelect('MIN(cp.data_vencimento)', 'primeiro_vencimento')
        .addSelect('MAX(cp.data_vencimento)', 'ultimo_vencimento')
        .where('cp.origem_documento = :origem', { origem: 'folha' })
        .groupBy('cp.competencia_flp')
        .orderBy('cp.competencia_flp', 'DESC', 'NULLS LAST');

      if (query.competencia) {
        const [ano, mes] = query.competencia.split('-').map(Number);
        qb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano AND EXTRACT(MONTH FROM ${colunaFiltro}) = :mes`, {
          ano,
          mes,
        });
      } else if (query.ano) {
        qb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano`, { ano: query.ano });
      }

      const raw = await qb.getRawMany<CompetenciaRaw>();

      // Quebra por tipo_folha para cada competencia
      const tipoQb = cpRepo
        .createQueryBuilder('cp')
        .select('cp.competencia_flp', 'competencia')
        .addSelect("COALESCE(cp.tipo_folha, 'nao_classificado')", 'tipo')
        .addSelect('COUNT(*)', 'qtd_titulos')
        .addSelect('COALESCE(SUM(cp.valor_bruto_cents), 0)', 'bruto')
        .addSelect('COALESCE(SUM(cp.valor_liquido_cents), 0)', 'liquido')
        .addSelect(
          `COALESCE(SUM(CASE WHEN cp.quitado = true OR cp.data_pagamento IS NOT NULL THEN cp.valor_liquido_cents ELSE 0 END), 0)`,
          'pago',
        )
        .where('cp.origem_documento = :origem', { origem: 'folha' })
        .groupBy('cp.competencia_flp')
        .addGroupBy('cp.tipo_folha');

      if (query.competencia) {
        const [ano, mes] = query.competencia.split('-').map(Number);
        tipoQb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano AND EXTRACT(MONTH FROM ${colunaFiltro}) = :mes`, { ano, mes });
      } else if (query.ano) {
        tipoQb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano`, { ano: query.ano });
      }

      const tipoRaw = await tipoQb.getRawMany<{ competencia: Date | string | null; tipo: string; qtd_titulos: string; bruto: string; liquido: string; pago: string }>();
      const tiposPorCompetencia = new Map<string, QuebraTipoFolha[]>();
      for (const t of tipoRaw) {
        const compIso = dataIsoOuNull(t.competencia) ?? '';
        if (!tiposPorCompetencia.has(compIso)) tiposPorCompetencia.set(compIso, []);
        tiposPorCompetencia.get(compIso)!.push({
          tipo: t.tipo as TipoFolha,
          qtdTitulos: Number(t.qtd_titulos),
          valorBrutoCents: Number(t.bruto),
          valorLiquidoCents: Number(t.liquido),
          valorPagoCents: Number(t.pago),
        });
      }

      const competencias: CompetenciaFolhaItem[] = raw.map((r) => {
        const inss = Number(r.inss);
        const irrf = Number(r.irrf);
        const pis = Number(r.pis);
        const cofins = Number(r.cofins);
        const csll = Number(r.csll);
        const iss = Number(r.iss);
        const totalRetencoes = inss + irrf + pis + cofins + csll + iss;
        const liquido = Number(r.liquido);
        const pago = Number(r.pago);
        const valorAPagar = liquido - totalRetencoes;
        const competenciaIso = dataIsoOuNull(r.competencia);

        return {
          competencia: competenciaIso ?? '',
          competenciaLabel: competenciaIso ? competenciaLabelFromDate(competenciaIso) : 'Sem competência',
          qtdTitulos: Number(r.qtd_titulos),
          qtdFornecedores: Number(r.qtd_fornecedores),
          valorBrutoCents: Number(r.bruto),
          retencoes: { inssCents: inss, irrfCents: irrf, pisCents: pis, cofinsCents: cofins, csllCents: csll, issCents: iss, totalCents: totalRetencoes },
          valorLiquidoCents: liquido,
          valorAPagarCents: valorAPagar,
          valorPagoCents: pago,
          valorEmAbertoCents: Math.max(0, liquido - pago),
          primeiroVencimento: dataIsoOuNull(r.primeiro_vencimento),
          ultimoVencimento: dataIsoOuNull(r.ultimo_vencimento),
          porTipo: (tiposPorCompetencia.get(competenciaIso ?? '') ?? []).sort((a, b) => b.valorLiquidoCents - a.valorLiquidoCents),
        };
      });

      // ============ BUCKETS DE AGING EXCLUSIVOS + QUEBRA POR TIPO GERAL ============
      // Faz UMA query consolidada do período inteiro com 4 buckets exclusivos.
      const agingQb = cpRepo
        .createQueryBuilder('cp')
        .select(
          `CASE
             WHEN cp.status = 'pago' OR cp.quitado = true OR cp.data_pagamento IS NOT NULL THEN 'pago'
             WHEN cp.status = 'cancelado' THEN 'cancelado'
             WHEN cp.data_vencimento <  CURRENT_DATE                            THEN 'vencido'
             WHEN cp.data_vencimento <= CURRENT_DATE + INTERVAL '7 days'        THEN 'vence_7d'
             ELSE 'vence_mais'
           END`,
          'bucket',
        )
        .addSelect('COUNT(*)', 'qtd')
        .addSelect('COALESCE(SUM(cp.valor_liquido_cents), 0)', 'liquido')
        .where('cp.origem_documento = :origem', { origem: 'folha' })
        .groupBy('1');

      if (query.competencia) {
        const [ano, mes] = query.competencia.split('-').map(Number);
        agingQb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano AND EXTRACT(MONTH FROM ${colunaFiltro}) = :mes`, { ano, mes });
      } else if (query.ano) {
        agingQb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano`, { ano: query.ano });
      }

      const agingRaw = await agingQb.getRawMany<{ bucket: string; qtd: string; liquido: string }>();
      const buckets = {
        vencidos: { qtd: 0, valorCents: 0 },
        venceEm7d: { qtd: 0, valorCents: 0 },
        venceMaisDe7: { qtd: 0, valorCents: 0 },
        pago: { qtd: 0, valorCents: 0 },
      };
      for (const b of agingRaw) {
        const qtd = Number(b.qtd);
        const valor = Number(b.liquido);
        if (b.bucket === 'pago') buckets.pago = { qtd, valorCents: valor };
        else if (b.bucket === 'vencido') buckets.vencidos = { qtd, valorCents: valor };
        else if (b.bucket === 'vence_7d') buckets.venceEm7d = { qtd, valorCents: valor };
        else if (b.bucket === 'vence_mais') buckets.venceMaisDe7 = { qtd, valorCents: valor };
        // 'cancelado' não vai pra card mas conta no total
      }

      // Quebra por tipo AGREGADA do período inteiro (não por competência).
      const tipoGeralQb = cpRepo
        .createQueryBuilder('cp')
        .select("COALESCE(cp.tipo_folha, 'nao_classificado')", 'tipo')
        .addSelect('COUNT(*)', 'qtd_titulos')
        .addSelect('COALESCE(SUM(cp.valor_bruto_cents), 0)', 'bruto')
        .addSelect('COALESCE(SUM(cp.valor_liquido_cents), 0)', 'liquido')
        .addSelect(
          `COALESCE(SUM(CASE WHEN cp.quitado = true OR cp.data_pagamento IS NOT NULL THEN cp.valor_liquido_cents ELSE 0 END), 0)`,
          'pago',
        )
        .where('cp.origem_documento = :origem', { origem: 'folha' })
        .groupBy('cp.tipo_folha');

      if (query.competencia) {
        const [ano, mes] = query.competencia.split('-').map(Number);
        tipoGeralQb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano AND EXTRACT(MONTH FROM ${colunaFiltro}) = :mes`, { ano, mes });
      } else if (query.ano) {
        tipoGeralQb.andWhere(`EXTRACT(YEAR FROM ${colunaFiltro}) = :ano`, { ano: query.ano });
      }

      const tipoGeralRaw = await tipoGeralQb.getRawMany<{ tipo: string; qtd_titulos: string; bruto: string; liquido: string; pago: string }>();
      const porTipoGeral: QuebraTipoFolha[] = tipoGeralRaw
        .map((t) => ({
          tipo: t.tipo as TipoFolha,
          qtdTitulos: Number(t.qtd_titulos),
          valorBrutoCents: Number(t.bruto),
          valorLiquidoCents: Number(t.liquido),
          valorPagoCents: Number(t.pago),
        }))
        .sort((a, b) => b.valorLiquidoCents - a.valorLiquidoCents);

      const totais = competencias.reduce(
        (acc, c) => ({
          qtdCompetencias: acc.qtdCompetencias + 1,
          qtdTitulos: acc.qtdTitulos + c.qtdTitulos,
          valorBrutoCents: acc.valorBrutoCents + c.valorBrutoCents,
          valorLiquidoCents: acc.valorLiquidoCents + c.valorLiquidoCents,
          valorAPagarCents: acc.valorAPagarCents + c.valorAPagarCents,
          valorPagoCents: acc.valorPagoCents + c.valorPagoCents,
          valorEmAbertoCents: acc.valorEmAbertoCents + c.valorEmAbertoCents,
          retencoesCents: acc.retencoesCents + c.retencoes.totalCents,
        }),
        { qtdCompetencias: 0, qtdTitulos: 0, valorBrutoCents: 0, valorLiquidoCents: 0, valorAPagarCents: 0, valorPagoCents: 0, valorEmAbertoCents: 0, retencoesCents: 0 },
      );

      const ultimoJob = await jobRepo.findOne({
        where: { sistema: 'globus', recurso: 'contas_pagar' },
        order: { iniciadoEm: 'DESC' },
      });
      const totalLocal = await cpRepo.count({ where: { origemDocumento: 'folha' } });

      return {
        competencias,
        totais: {
          ...totais,
          vencidos: buckets.vencidos,
          venceEm7d: buckets.venceEm7d,
          venceMaisDe7: buckets.venceMaisDe7,
          pago: buckets.pago,
        },
        porTipoGeral,
        syncInfo: {
          ultimoSyncEm: ultimoJob?.terminadoEm ? ultimoJob.terminadoEm.toISOString() : null,
          totalLocal,
          precisaSincronizar: totalLocal === 0,
        },
      };
    },

    /**
     * Encargos e benefícios da folha REAL (FLP), agregados de finance.ficha_evento
     * por CODEVENTO. Fonte diferente de listarCompetencias (que só vê o repasse de
     * pensão no Contas a Pagar). Cada categoria é rastreável até o evento.
     *
     * Agrega por código de evento (não por SUM tipo P/D) porque o ETL normaliza
     * eventos TIPOEVEN A/C para P — somar por tipo inflaria proventos com bases.
     * Os totais vêm dos totalizadores autoritativos 318/319.
     */
    async listarEncargos(query: FolhaEncargosQuery): Promise<FolhaEncargosResponse> {
      const tipoFolha = query.tipoFolha ?? 1;
      const { dtIni, dtFimExcl } = rangeCompetenciaFolha(query.competencia);

      const rows = await cpRepo.query<Array<{ cod: number; descricao: string; tipo: string; total: string; qtd_func: string }>>(
        `SELECT fe.cod_evento AS cod, ev.descricao, ev.tipo,
                COALESCE(SUM(fe.valor_cents), 0)::text AS total,
                COUNT(DISTINCT fe.funcionario_id)::text AS qtd_func
         FROM finance.ficha_evento fe
         JOIN finance.eventos_folha ev ON ev.cod_evento = fe.cod_evento
         WHERE fe.competencia >= $1::date AND fe.competencia < $2::date
           AND fe.tipo_folha = $3
         GROUP BY fe.cod_evento, ev.descricao, ev.tipo`,
        [dtIni, dtFimExcl, tipoFolha],
      );

      const byCod = new Map<number, { descricao: string; tipo: string; valorCents: number; qtdFunc: number }>();
      for (const r of rows) {
        byCod.set(Number(r.cod), { descricao: r.descricao, tipo: r.tipo, valorCents: Number(r.total), qtdFunc: Number(r.qtd_func) });
      }
      const disponivel = rows.length > 0;

      const proventosCents = byCod.get(COD_TOTAL_PROVENTOS)?.valorCents ?? 0;
      const descontosCents = byCod.get(COD_TOTAL_DESCONTOS)?.valorCents ?? 0;
      const liquidoCents = proventosCents - descontosCents;

      const qtdRows = await cpRepo.query<Array<{ qtd: string }>>(
        `SELECT COUNT(DISTINCT fe.funcionario_id)::text AS qtd
         FROM finance.ficha_evento fe
         WHERE fe.competencia >= $1::date AND fe.competencia < $2::date AND fe.tipo_folha = $3`,
        [dtIni, dtFimExcl, tipoFolha],
      );
      const qtdFuncionarios = Number(qtdRows[0]?.qtd ?? 0);

      const categorias: CategoriaFolha[] = [];
      let pensaoCents = 0;
      for (const cat of CATEGORIAS_ENCARGOS_FOLHA) {
        const eventos = cat.codigos
          .map((cod) => {
            const e = byCod.get(cod);
            if (!e || e.valorCents === 0) return null;
            return { codEvento: cod, descricao: e.descricao, valorCents: e.valorCents };
          })
          .filter((e): e is { codEvento: number; descricao: string; valorCents: number } => e !== null)
          .sort((a, b) => b.valorCents - a.valorCents);
        const valorCents = eventos.reduce((s, e) => s + e.valorCents, 0);
        const qtdCat = cat.codigos.reduce((mx, cod) => Math.max(mx, byCod.get(cod)?.qtdFunc ?? 0), 0);
        if (cat.chave === CHAVE_PENSAO) pensaoCents = valorCents;
        if (valorCents === 0) continue;
        categorias.push({
          chave: cat.chave,
          label: cat.label,
          natureza: cat.natureza,
          valorCents,
          qtdFuncionarios: qtdCat,
          eventos,
        });
      }

      // "Outros descontos": TODAS as verbas TIPOEVEN='D' que não caem numa categoria
      // nomeada. Fecha a conta com o total de descontos (evento 319). Cada verba fica
      // rastreável/clicável (drill-down por evento). Exclui os totalizadores (B).
      const codigosCategorizados = new Set<number>();
      for (const cat of CATEGORIAS_ENCARGOS_FOLHA) for (const c of cat.codigos) codigosCategorizados.add(c);
      const totalizadores = new Set<number>([COD_TOTAL_PROVENTOS, COD_TOTAL_DESCONTOS, COD_LIQUIDO_FOLHA]);

      const outrosEventos = [...byCod.entries()]
        .filter(([cod, e]) => e.tipo === 'D' && e.valorCents !== 0 && !codigosCategorizados.has(cod) && !totalizadores.has(cod))
        .map(([cod, e]) => ({ codEvento: cod, descricao: e.descricao, valorCents: e.valorCents, qtdFunc: e.qtdFunc }))
        .sort((a, b) => b.valorCents - a.valorCents);

      if (outrosEventos.length > 0) {
        categorias.push({
          chave: CHAVE_OUTROS_DESCONTOS,
          label: 'Outros descontos',
          natureza: 'desconto',
          valorCents: outrosEventos.reduce((s, e) => s + e.valorCents, 0),
          qtdFuncionarios: outrosEventos.reduce((mx, e) => Math.max(mx, e.qtdFunc), 0),
          eventos: outrosEventos.map(({ codEvento, descricao, valorCents }) => ({ codEvento, descricao, valorCents })),
        });
      }

      const dispRaw = await cpRepo.query<Array<{ competencia: string; tipo_folha: number; qtd: string }>>(
        `SELECT to_char(fe.competencia, 'YYYY-MM') AS competencia, fe.tipo_folha,
                COUNT(DISTINCT fe.funcionario_id)::text AS qtd
         FROM finance.ficha_evento fe
         GROUP BY to_char(fe.competencia, 'YYYY-MM'), fe.tipo_folha
         ORDER BY 1 DESC, 2
         LIMIT 24`,
      );
      const competenciasDisponiveis = dispRaw.map((d) => ({
        competencia: d.competencia,
        tipoFolha: Number(d.tipo_folha),
        qtdFuncionarios: Number(d.qtd),
      }));

      const syncRaw = await cpRepo.query<Array<{ ultimo: Date | string | null }>>(
        `SELECT MAX(fe.ultimo_sync_em) AS ultimo FROM finance.ficha_evento fe`,
      );
      const ultimoRaw = syncRaw[0]?.ultimo ?? null;
      const ultimoSyncEm = ultimoRaw ? new Date(ultimoRaw).toISOString() : null;

      const [anoC, mesC] = query.competencia.split('-').map(Number);
      const competenciaLabel = `${MES_LABEL[mesC!] ?? mesC}/${anoC}`;

      return {
        disponivel,
        competencia: query.competencia,
        competenciaLabel,
        tipoFolha,
        tipoFolhaLabel: TIPO_FOLHA_FLP_LABEL[tipoFolha] ?? `Tipo ${tipoFolha}`,
        qtdFuncionarios,
        proventosCents,
        descontosCents,
        liquidoCents,
        categorias,
        pensaoCents,
        observacoes: [
          'O INSS patronal (~20% sobre a base) não aparece na folha — é recolhido em guia (GPS). Ver Tributos.',
          'Vale-transporte não se aplica: os funcionários têm passe livre (empresa de ônibus).',
          'O salário líquido é depositado direto na conta de cada funcionário, sem passar pela aprovação do financeiro.',
        ],
        competenciasDisponiveis,
        ultimoSyncEm,
      };
    },

    /**
     * Drill-down de uma verba: lista os funcionários que compõem o evento na
     * competência/tipo, com valor individual. DADO SENSÍVEL (LGPD) — o acesso é
     * registrado na trilha de auditoria pelo front (recurso folha-encargos-evento).
     */
    async detalharEvento(query: FolhaEventoDetalheQuery): Promise<FolhaEventoDetalheResponse> {
      const tipoFolha = query.tipoFolha ?? 1;
      const { dtIni, dtFimExcl } = rangeCompetenciaFolha(query.competencia);

      const rows = await cpRepo.query<
        Array<{ cod_func: string; nome: string; desc_funcao: string | null; desc_area: string | null; referencia: string | null; valor: string }>
      >(
        `SELECT f.cod_func, f.nome, f.desc_funcao, f.desc_area,
                fe.referencia::text AS referencia, fe.valor_cents::text AS valor
         FROM finance.ficha_evento fe
         JOIN finance.funcionarios f ON f.id = fe.funcionario_id
         WHERE fe.competencia >= $1::date AND fe.competencia < $2::date
           AND fe.tipo_folha = $3 AND fe.cod_evento = $4
         ORDER BY fe.valor_cents DESC, f.nome`,
        [dtIni, dtFimExcl, tipoFolha, query.codEvento],
      );

      const descRows = await cpRepo.query<Array<{ descricao: string }>>(
        `SELECT descricao FROM finance.eventos_folha WHERE cod_evento = $1`,
        [query.codEvento],
      );

      const funcionarios: FuncionarioEvento[] = rows.map((r) => ({
        codFunc: r.cod_func,
        nome: r.nome,
        descFuncao: r.desc_funcao,
        descArea: r.desc_area,
        referencia: r.referencia,
        valorCents: Number(r.valor),
      }));
      const totalCents = funcionarios.reduce((s, f) => s + f.valorCents, 0);

      const [anoC, mesC] = query.competencia.split('-').map(Number);

      return {
        codEvento: query.codEvento,
        descricao: descRows[0]?.descricao ?? `Evento ${query.codEvento}`,
        competencia: query.competencia,
        competenciaLabel: `${MES_LABEL[mesC!] ?? mesC}/${anoC}`,
        tipoFolha,
        tipoFolhaLabel: TIPO_FOLHA_FLP_LABEL[tipoFolha] ?? `Tipo ${tipoFolha}`,
        totalCents,
        qtdFuncionarios: funcionarios.length,
        funcionarios,
      };
    },
  };
}

export type FolhaService = ReturnType<typeof buildFolhaService>;
