import type { FastifyInstance } from 'fastify';
import { IsNull } from 'typeorm';
import type {
  AtualizarReembolsoBody,
  CriarReembolsoBody,
  DescartarCandidatoBody,
  ReceberReembolsoBody,
  ReembolsoCandidato,
  ReembolsoCandidatosQuery,
  ReembolsoCandidatosResponse,
  ReembolsoContaPagar,
  ReembolsoCredito,
  ReembolsoCreditosCandidatosResponse,
  ReembolsoListQuery,
  ReembolsoListResponse,
  ReembolsoResponse,
} from '@pioneira/shared';
import { REEMBOLSO_STATUS } from '@pioneira/shared';
import { ContaPagar } from '@/entities/conta-pagar.entity.js';
import { BancoConta } from '@/entities/banco-conta.entity.js';
import { BancoMovto } from '@/entities/banco-movto.entity.js';
import { Reembolso } from '@/entities/reembolso.entity.js';
import { ENTRA_NA_SOMA_SQL } from '@/shared/contas-pagar/regras-soma.js';
import { expandirSeMesmaData } from '@/shared/utils/date-range.js';

/**
 * Termos (heurística) que sinalizam um título de Contas a Pagar RESSARCÍVEL — algo
 * que a empresa pagou mas cobra de um terceiro (motorista/funcionário). Casados, em
 * ILIKE, contra fornecedor + observação + favorecido. Lista propositalmente curta e
 * fácil de estender; é só uma SUGESTÃO — o usuário confirma ou descarta o candidato.
 */
const TERMOS_REEMBOLSO = [
  'MULTA', 'INFRA', 'TRANSITO', 'TRÂNSITO', 'DETRAN', 'RENAINF',
  'AVARIA', 'RESSARC', 'REEMBOLS', 'DANO',
];

export function buildReembolsosService(fastify: FastifyInstance) {
  const reembolsoRepo = fastify.db.getRepository(Reembolso);
  const cpRepo = fastify.db.getRepository(ContaPagar);
  const movtoRepo = fastify.db.getRepository(BancoMovto);
  const contaRepo = fastify.db.getRepository(BancoConta);
  const empresaId = fastify.config.globus.empresaId;

  /** Valor a pagar (líquido - retenções) de um título. */
  function valorAPagarDe(cp: ContaPagar): number {
    const ret =
      Number(cp.vlrInssCents ?? 0) + Number(cp.vlrIrrfCents ?? 0) + Number(cp.vlrPisCents ?? 0) +
      Number(cp.vlrCofinsCents ?? 0) + Number(cp.vlrCsllCents ?? 0) + Number(cp.vlrIssCents ?? 0);
    return Number(cp.valorLiquidoCents) - ret;
  }

  function cpResumo(cp: ContaPagar): ReembolsoContaPagar {
    return {
      id: cp.id,
      numeroDocumento: cp.numeroDocumento,
      tipoDocumento: cp.tipoDocumento,
      fornecedorNome: cp.fornecedor?.razaoSocial ?? cp.favorecidoNome ?? null,
      dataPagamento: cp.dataPagamento,
      dataVencimento: cp.dataVencimento,
      valorAPagarCents: valorAPagarDe(cp),
      observacao: cp.observacao,
    };
  }

  /** Resolve o nome amigável da conta de um conjunto de movimentos (1 query). */
  async function mapaContaNomes(movtos: BancoMovto[]): Promise<Map<string, string>> {
    const mapa = new Map<string, string>();
    if (movtos.length === 0) return mapa;
    const contas = await contaRepo.find({ where: { excluidoEm: IsNull() } });
    for (const c of contas) {
      mapa.set(`${c.codBanco}|${c.codAgencia}|${c.codContaBco}`, c.nomeAmigavel ?? c.nomeContaBco);
    }
    return mapa;
  }

  function creditoResumo(
    m: BancoMovto,
    contaNome: string | null,
    extras?: { confianca: ReembolsoCredito['confianca']; motivos: string[] },
  ): ReembolsoCredito {
    return {
      id: m.id,
      dataMovto: m.dataMovto,
      valorCents: Number(m.valorCents),
      descHistoBco: m.descHistoBco,
      docMovtoBco: m.docMovtoBco,
      codBanco: m.codBanco,
      codAgencia: m.codAgencia,
      codContaBco: m.codContaBco,
      contaNome,
      ...(extras ? { confianca: extras.confianca, motivos: extras.motivos } : {}),
    };
  }

  /** Diferença em dias entre duas datas ISO (YYYY-MM-DD). null se faltar alguma. */
  function diasEntre(de: string | null, ate: string | null): number | null {
    if (!de || !ate) return null;
    const ms = new Date(`${ate}T00:00:00Z`).getTime() - new Date(`${de}T00:00:00Z`).getTime();
    return Math.round(ms / 86_400_000);
  }

  function toResponse(r: Reembolso, contaNome: string | null): ReembolsoResponse {
    return {
      id: r.id,
      status: r.status,
      contaPagar: r.contaPagar ? cpResumo(r.contaPagar) : null,
      devedorNome: r.devedorNome,
      devedorDocumento: r.devedorDocumento,
      devedorMatricula: r.devedorMatricula,
      motivo: r.motivo,
      valorCents: Number(r.valorCents),
      recebidoCents: r.recebidoCents != null ? Number(r.recebidoCents) : null,
      dataPrevista: r.dataPrevista,
      dataRecebimento: r.dataRecebimento,
      credito: r.bancoMovto ? creditoResumo(r.bancoMovto, contaNome) : null,
      observacao: r.observacao,
      criadoEm: r.criadoEm.toISOString(),
      atualizadoEm: r.atualizadoEm.toISOString(),
    };
  }

  return {
    async listar(query: ReembolsoListQuery): Promise<ReembolsoListResponse> {
      const pagina = query.pagina ?? 1;
      const porPagina = query.porPagina ?? 50;

      const qb = reembolsoRepo
        .createQueryBuilder('r')
        .leftJoinAndSelect('r.contaPagar', 'cp')
        .leftJoinAndSelect('cp.fornecedor', 'forn')
        .leftJoinAndSelect('r.bancoMovto', 'mc')
        .where('r.excluido_em IS NULL')
        .andWhere('r.empresa_id = :empresaId', { empresaId });

      // Status: lista por vírgula. Sem filtro = tudo MENOS descartado (ruído de auditoria).
      const statusFiltro = (query.status ?? '')
        .split(',').map((s) => s.trim()).filter((s): s is (typeof REEMBOLSO_STATUS)[number] =>
          (REEMBOLSO_STATUS as readonly string[]).includes(s));
      if (statusFiltro.length > 0) {
        qb.andWhere('r.status IN (:...statusFiltro)', { statusFiltro });
      } else {
        qb.andWhere("r.status <> 'descartado'");
      }

      if (query.busca?.trim()) {
        const s = `%${query.busca.trim()}%`;
        qb.andWhere(
          '(r.devedor_nome ILIKE :s OR r.motivo ILIKE :s OR forn.razao_social ILIKE :s OR cp.numero_documento ILIKE :s OR r.devedor_documento ILIKE :s)',
          { s },
        );
      }

      // Totais do conjunto filtrado (todas as páginas) — antes de paginar.
      const totaisRow = await qb
        .clone()
        .select(
          "COALESCE(SUM(CASE WHEN r.status IN ('pendente','cobrado') THEN r.valor_cents ELSE 0 END), 0)",
          'areceber',
        )
        .addSelect(
          "COALESCE(SUM(CASE WHEN r.status IN ('pendente','cobrado') THEN 1 ELSE 0 END), 0)",
          'areceberqtd',
        )
        .addSelect(
          "COALESCE(SUM(CASE WHEN r.status = 'recebido' THEN COALESCE(r.recebido_cents, r.valor_cents) ELSE 0 END), 0)",
          'recebido',
        )
        .addSelect("COALESCE(SUM(CASE WHEN r.status = 'recebido' THEN 1 ELSE 0 END), 0)", 'recebidoqtd')
        .getRawOne<{ areceber: string; areceberqtd: string; recebido: string; recebidoqtd: string }>();

      const total = await qb.clone().getCount();

      const itens = await qb
        .orderBy('r.criado_em', 'DESC')
        .skip((pagina - 1) * porPagina)
        .take(porPagina)
        .getMany();

      const nomes = await mapaContaNomes(itens.map((r) => r.bancoMovto).filter((m): m is BancoMovto => !!m));

      return {
        itens: itens.map((r) =>
          toResponse(
            r,
            r.bancoMovto ? nomes.get(`${r.bancoMovto.codBanco}|${r.bancoMovto.codAgencia}|${r.bancoMovto.codContaBco}`) ?? null : null,
          ),
        ),
        total,
        pagina,
        porPagina,
        totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
        totais: {
          aReceberCents: Number(totaisRow?.areceber ?? 0),
          aReceberQtd: Number(totaisRow?.areceberqtd ?? 0),
          recebidoCents: Number(totaisRow?.recebido ?? 0),
          recebidoQtd: Number(totaisRow?.recebidoqtd ?? 0),
        },
      };
    },

    /**
     * Candidatos a reembolso: títulos do Contas a Pagar que PARECEM ressarcíveis
     * (heurística) e ainda não viraram reembolso (nem foram descartados). Exclui
     * substituídos (não são título real). O usuário confirma ou descarta.
     */
    async candidatos(query: ReembolsoCandidatosQuery): Promise<ReembolsoCandidatosResponse> {
      const pagina = query.pagina ?? 1;
      const porPagina = query.porPagina ?? 50;
      const termos = TERMOS_REEMBOLSO.map((t) => `%${t}%`);

      const qb = cpRepo
        .createQueryBuilder('cp')
        .leftJoinAndSelect('cp.fornecedor', 'forn')
        .where('cp.empresa_id = :empresaId', { empresaId })
        .andWhere('cp.excluido_em IS NULL')
        // Regra central de quem entra nas somas (exclui substituído e cancelado).
        .andWhere(ENTRA_NA_SOMA_SQL)
        .andWhere(
          '(forn.razao_social ILIKE ANY(:termos) OR cp.observacao ILIKE ANY(:termos) OR cp.favorecido_nome ILIKE ANY(:termos))',
          { termos },
        )
        .andWhere(
          'NOT EXISTS (SELECT 1 FROM finance.reembolso rb WHERE rb.conta_pagar_id = cp.id AND rb.excluido_em IS NULL)',
        );

      // Mesma expansão "dia inteiro" do Contas a Pagar (ver date-range.ts) — sem
      // isso, um filtro de UM dia só (dtIni === dtFim) virava range vazio aqui
      // também (o mesmo bug achado em 30/07/2026, reimplementado à mão neste
      // módulo em vez de reusar a correção).
      const { ini: dtIni, fim: dtFim } = expandirSeMesmaData(query.dtIni, query.dtFim);
      if (dtIni) qb.andWhere('cp.data_vencimento >= :dtIni', { dtIni });
      if (dtFim) qb.andWhere('cp.data_vencimento < :dtFim', { dtFim });
      if (query.busca?.trim()) {
        const s = `%${query.busca.trim()}%`;
        qb.andWhere('(forn.razao_social ILIKE :s OR cp.numero_documento ILIKE :s OR cp.observacao ILIKE :s)', { s });
      }

      const total = await qb.clone().getCount();
      const rows = await qb
        // Property em camelCase, NÃO a coluna snake_case: com leftJoinAndSelect +
        // skip/take, o TypeORM precisa resolver metadata da coluna do orderBy pra
        // combinar com o SELECT — com o nome da coluna crua, a resolução falha
        // (`Cannot read properties of undefined (reading 'databaseName')`) assim
        // que a query tem alguma linha pra retornar. Mesmo padrão já documentado
        // em contas-pagar.service.ts:1807. Achado em 30/07/2026 (bug pré-existente,
        // não relacionado ao fix de dtIni/dtFim desta mesma sessão).
        .orderBy('cp.dataVencimento', 'DESC')
        .addOrderBy('cp.id', 'ASC')
        .skip((pagina - 1) * porPagina)
        .take(porPagina)
        .getMany();

      const itens: ReembolsoCandidato[] = rows.map((cp) => {
        const alvo = `${cp.fornecedor?.razaoSocial ?? ''} ${cp.observacao ?? ''} ${cp.favorecidoNome ?? ''}`.toUpperCase();
        const termo = TERMOS_REEMBOLSO.find((t) => alvo.includes(t)) ?? null;
        return { contaPagar: cpResumo(cp), motivoSugerido: termo };
      });

      return {
        itens,
        total,
        pagina,
        porPagina,
        totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
      };
    },

    /** Cria um reembolso a partir de um título do Contas a Pagar (confirma candidato). */
    async criar(body: CriarReembolsoBody, usuarioId: string): Promise<ReembolsoResponse> {
      const cp = await cpRepo.findOne({ where: { id: body.contaPagarId }, relations: ['fornecedor'] });
      if (!cp) throw fastify.httpErrors.notFound('Título de Contas a Pagar não encontrado');

      const existente = await reembolsoRepo.findOne({
        where: { contaPagarId: cp.id, excluidoEm: IsNull() },
      });
      if (existente && existente.status !== 'descartado') {
        throw fastify.httpErrors.conflict('Este título já tem um reembolso. Edite o existente.');
      }
      // Reabre um candidato antes descartado, em vez de criar duplicata.
      const alvo = existente ?? reembolsoRepo.create();

      alvo.empresaId = cp.empresaId;
      alvo.contaPagarId = cp.id;
      alvo.devedorNome = body.devedorNome.trim();
      alvo.devedorDocumento = body.devedorDocumento?.trim() || null;
      alvo.devedorMatricula = body.devedorMatricula?.trim() || null;
      alvo.motivo = body.motivo?.trim() || null;
      alvo.valorCents = String(body.valorCents ?? valorAPagarDe(cp));
      alvo.recebidoCents = null;
      alvo.status = 'pendente';
      alvo.dataPrevista = body.dataPrevista ?? null;
      alvo.dataRecebimento = null;
      alvo.bancoMovtoId = null;
      alvo.observacao = body.observacao?.trim() || null;
      alvo.usuarioInclusao = usuarioId;

      const salvo = await reembolsoRepo.save(alvo);
      return this.detalhe(salvo.id);
    },

    /** Descarta um candidato (registra que NÃO é reembolso — some dos candidatos). */
    async descartarCandidato(body: DescartarCandidatoBody, usuarioId: string): Promise<ReembolsoResponse> {
      const cp = await cpRepo.findOne({ where: { id: body.contaPagarId } });
      if (!cp) throw fastify.httpErrors.notFound('Título de Contas a Pagar não encontrado');

      const existente = await reembolsoRepo.findOne({
        where: { contaPagarId: cp.id, excluidoEm: IsNull() },
      });
      const alvo = existente ?? reembolsoRepo.create();
      alvo.empresaId = cp.empresaId;
      alvo.contaPagarId = cp.id;
      alvo.status = 'descartado';
      if (alvo.valorCents == null) alvo.valorCents = String(valorAPagarDe(cp));
      alvo.observacao = body.observacao?.trim() || alvo.observacao || null;
      alvo.usuarioInclusao = alvo.usuarioInclusao ?? usuarioId;

      const salvo = await reembolsoRepo.save(alvo);
      return this.detalhe(salvo.id);
    },

    async detalhe(id: string): Promise<ReembolsoResponse> {
      const r = await reembolsoRepo.findOne({
        where: { id, excluidoEm: IsNull() },
        relations: ['contaPagar', 'contaPagar.fornecedor', 'bancoMovto'],
      });
      if (!r) throw fastify.httpErrors.notFound('Reembolso não encontrado');
      const nomes = await mapaContaNomes(r.bancoMovto ? [r.bancoMovto] : []);
      const nome = r.bancoMovto
        ? nomes.get(`${r.bancoMovto.codBanco}|${r.bancoMovto.codAgencia}|${r.bancoMovto.codContaBco}`) ?? null
        : null;
      return toResponse(r, nome);
    },

    async atualizar(id: string, body: AtualizarReembolsoBody): Promise<ReembolsoResponse> {
      const r = await reembolsoRepo.findOne({ where: { id, excluidoEm: IsNull() } });
      if (!r) throw fastify.httpErrors.notFound('Reembolso não encontrado');

      if (body.status !== undefined) r.status = body.status;
      if (body.devedorNome !== undefined) r.devedorNome = body.devedorNome.trim();
      if (body.devedorDocumento !== undefined) r.devedorDocumento = body.devedorDocumento?.trim() || null;
      if (body.devedorMatricula !== undefined) r.devedorMatricula = body.devedorMatricula?.trim() || null;
      if (body.motivo !== undefined) r.motivo = body.motivo?.trim() || null;
      if (body.valorCents !== undefined) r.valorCents = String(body.valorCents);
      if (body.dataPrevista !== undefined) r.dataPrevista = body.dataPrevista;
      if (body.observacao !== undefined) r.observacao = body.observacao?.trim() || null;

      await reembolsoRepo.save(r);
      return this.detalhe(id);
    },

    /**
     * Baixa: marca recebido (data + valor) e, opcionalmente, amarra ao crédito real
     * do extrato (banco_movto) que comprova — rastreabilidade. Valida que o crédito é
     * um crédito de verdade e ainda não está amarrado a outro reembolso.
     */
    async receber(id: string, body: ReceberReembolsoBody, usuarioId: string): Promise<ReembolsoResponse> {
      const r = await reembolsoRepo.findOne({ where: { id, excluidoEm: IsNull() } });
      if (!r) throw fastify.httpErrors.notFound('Reembolso não encontrado');

      const antes = {
        status: r.status,
        recebidoCents: r.recebidoCents === null ? null : Number(r.recebidoCents),
        dataRecebimento: r.dataRecebimento,
      };

      if (body.bancoMovtoId) {
        const m = await movtoRepo.findOne({ where: { id: body.bancoMovtoId, excluidoEm: IsNull() } });
        if (!m) throw fastify.httpErrors.notFound('Lançamento do extrato não encontrado');
        if (m.debitoCredito !== 'C') {
          throw fastify.httpErrors.badRequest('O lançamento amarrado precisa ser um CRÉDITO (entrada).');
        }
        const jaUsado = await reembolsoRepo.findOne({
          where: { bancoMovtoId: m.id, excluidoEm: IsNull() },
        });
        if (jaUsado && jaUsado.id !== r.id) {
          throw fastify.httpErrors.conflict('Este crédito do extrato já está amarrado a outro reembolso.');
        }
        r.bancoMovtoId = m.id;
      } else if (body.bancoMovtoId === null) {
        r.bancoMovtoId = null;
      }

      r.status = 'recebido';
      r.dataRecebimento = body.dataRecebimento;
      r.recebidoCents = String(body.recebidoCents ?? Number(r.valorCents));
      if (body.observacao !== undefined) r.observacao = body.observacao?.trim() || r.observacao;

      await reembolsoRepo.save(r);

      await fastify.auditoria.registrarAlteracao({
        usuarioId,
        recurso: 'reembolso',
        recursoId: r.id,
        descricao: `Baixa de reembolso — ${r.devedorNome ?? 'reembolso'}`,
        antes,
        depois: {
          status: 'recebido',
          recebidoCents: Number(r.recebidoCents),
          dataRecebimento: r.dataRecebimento,
        },
      });

      return this.detalhe(id);
    },

    /**
     * Créditos do extrato candidatos a amarrar na baixa, COM nível de confiança no
     * casamento. Regra: crédito de verdade, MESMO valor do reembolso, ainda não usado,
     * NÃO repasse do GDF (um R$X do governo coincidiria por acaso). A confiança soma
     * sinais: entrou DEPOIS do pagamento (e quão perto), histórico que cita o devedor
     * ou "multa/ressarcimento". Ordenado do mais provável pro menos. NUNCA amarra
     * sozinho — só sugere; quem confirma é o usuário.
     */
    async creditosCandidatos(id: string): Promise<ReembolsoCreditosCandidatosResponse> {
      const r = await reembolsoRepo.findOne({
        where: { id, excluidoEm: IsNull() },
        relations: ['contaPagar'],
      });
      if (!r) throw fastify.httpErrors.notFound('Reembolso não encontrado');

      const usados = await reembolsoRepo
        .createQueryBuilder('rb')
        .select('rb.banco_movto_id', 'id')
        .where('rb.banco_movto_id IS NOT NULL')
        .andWhere('rb.excluido_em IS NULL')
        .andWhere('rb.id <> :id', { id })
        .getRawMany<{ id: string }>();
      const idsUsados = usados.map((u) => u.id);

      // Data do pagamento da multa (o crédito de reembolso deve vir depois). Tolera 5
      // dias antes (defasagem de lançamento) quando há data; senão não filtra por data.
      const dataPagamento = r.contaPagar?.dataPagamento ?? null;

      const qb = movtoRepo
        .createQueryBuilder('m')
        .where('m.empresa_id = :empresaId', { empresaId })
        .andWhere('m.excluido_em IS NULL')
        .andWhere("m.debito_credito = 'C'")
        .andWhere('m.eh_repasse_brb = false')
        .andWhere('m.valor_cents = :valor', { valor: Number(r.valorCents) });
      if (idsUsados.length > 0) qb.andWhere('m.id NOT IN (:...idsUsados)', { idsUsados });
      if (dataPagamento) {
        qb.andWhere("m.data_movto >= (:dataPagamento::date - INTERVAL '5 days')", { dataPagamento });
      }

      const movtos = await qb.orderBy('m.data_movto', 'DESC').take(50).getMany();

      // Tokens do nome do devedor (>=3 letras) pra achar TED/PIX com o nome no histórico.
      const tokensDevedor = (r.devedorNome ?? '')
        .toUpperCase()
        .split(/[^A-ZÀ-Ý]+/)
        .filter((t) => t.length >= 3);

      const avaliados = movtos.map((m) => {
        const alvo = `${m.histMovtoBco ?? ''} ${m.descHistoBco ?? ''}`.toUpperCase();
        const dias = diasEntre(dataPagamento, m.dataMovto);
        const motivos: string[] = [`Mesmo valor (${(Number(m.valorCents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`];
        let pontos = 1; // valor exato (base)

        const depois = dias != null && dias >= 0;
        if (depois) {
          motivos.push(dias === 0 ? 'Entrou no mesmo dia do pagamento' : `Entrou ${dias} dia(s) após o pagamento`);
          pontos += 1;
          if (dias <= 30) pontos += 1;
        } else if (dias != null) {
          motivos.push(`Entrou ${Math.abs(dias)} dia(s) ANTES do pagamento`);
        }

        const citaDevedor = tokensDevedor.some((t) => alvo.includes(t));
        if (citaDevedor) {
          motivos.push('Histórico cita o devedor');
          pontos += 3;
        }
        if (/MULTA|RESSARC|REEMBOLS|INFRA/.test(alvo)) {
          motivos.push('Histórico menciona multa/ressarcimento');
          pontos += 1;
        }

        const confianca: ReembolsoCredito['confianca'] = pontos >= 4 ? 'alta' : pontos >= 2 ? 'media' : 'baixa';
        return { m, pontos, confianca, motivos };
      });

      // Mais provável primeiro (pontos), desempate pelo mais recente.
      avaliados.sort((a, b) => b.pontos - a.pontos || (a.m.dataMovto && b.m.dataMovto ? (a.m.dataMovto < b.m.dataMovto ? 1 : -1) : 0));

      const nomes = await mapaContaNomes(avaliados.map((a) => a.m));
      return {
        itens: avaliados.slice(0, 25).map((a) =>
          creditoResumo(a.m, nomes.get(`${a.m.codBanco}|${a.m.codAgencia}|${a.m.codContaBco}`) ?? null, {
            confianca: a.confianca,
            motivos: a.motivos,
          }),
        ),
      };
    },

    async excluir(id: string): Promise<{ ok: true }> {
      const r = await reembolsoRepo.findOne({ where: { id, excluidoEm: IsNull() } });
      if (!r) throw fastify.httpErrors.notFound('Reembolso não encontrado');
      r.excluidoEm = new Date();
      await reembolsoRepo.save(r);
      return { ok: true };
    },
  };
}

export type ReembolsosService = ReturnType<typeof buildReembolsosService>;
