import type { FastifyInstance } from 'fastify';
import type {
  ConferenciaDivergenciasResponse,
  ConferenciaRetencao,
  RetencaoComparacao,
  RetencaoTipo,
  AliquotasUsadasResponse,
} from '@pioneira/shared';
import { ALIQUOTAS_PADRAO } from '@pioneira/shared';
import { ContaPagar } from '@/entities/conta-pagar.entity.js';

const TOLERANCIA_CENTS = 1;  // 1 centavo de tolerancia para arredondamento
const TIPOS_DOC_SUJEITOS = ['NF', 'NFE', 'NFV', 'NFS'];

/**
 * Decide se um CP eh "aplicavel" pra retencao padrao (NF de servico PJ).
 * Casos NAO aplicaveis: folha de pagamento, guias de imposto, lancamento manual,
 * boletos genericos (que ja tem retencao na fonte do banco/emissor).
 */
function ehAplicavel(cp: ContaPagar): { aplicavel: boolean; motivo?: string } {
  if (cp.origemDocumento === 'folha') return { aplicavel: false, motivo: 'Origem folha — retencoes calculadas pelo eSocial' };
  if (cp.origemDocumento === 'guia') return { aplicavel: false, motivo: 'Origem guia — eh a propria retencao paga ao fisco' };
  const tipo = cp.tipoDocumento?.toUpperCase() ?? '';
  if (!TIPOS_DOC_SUJEITOS.includes(tipo)) {
    return { aplicavel: false, motivo: `Tipo ${tipo || '?'} nao eh NF de servico (heuristica padrao nao aplica)` };
  }
  // Fornecedor optante do Simples Nacional NAO sofre retencao de PIS/COFINS/CSLL/IRRF
  // na fonte (recolhe tudo no DAS). Marcar como nao aplicavel evita falso divergente.
  if (cp.fornecedor?.optSimplesNacional === true) {
    return { aplicavel: false, motivo: 'Fornecedor Simples Nacional — sem retencao de PIS/COFINS/CSLL/IRRF na fonte' };
  }
  return { aplicavel: true };
}

function calcular(cp: ContaPagar): ConferenciaRetencao {
  const valorBruto = Number(cp.valorBrutoCents);
  // BASE DE CALCULO das retencoes = valor da NF ANTES das retencoes.
  // valor_bruto_cents (vindo do Globus VLR_ORIGINAL) e o LIQUIDO a pagar
  // (depois das retencoes). A base fiscal e: liquido + total das retencoes.
  // Validado contra os 43 NFS reais em 28/05/2026: PIS/COFINS/CSLL/IRRF
  // batem no centavo. Sem isso, a heuristica subestima em ~6,5% e marca
  // 100% das NFS como divergentes (era o estado anterior do bug).
  const totalRetencoesCents =
    Number(cp.vlrInssCents ?? 0) + Number(cp.vlrIrrfCents ?? 0) +
    Number(cp.vlrPisCents ?? 0) + Number(cp.vlrCofinsCents ?? 0) +
    Number(cp.vlrCsllCents ?? 0) + Number(cp.vlrIssCents ?? 0);
  const baseCalculo = valorBruto + totalRetencoesCents;

  const aplicabilidade = ehAplicavel(cp);
  const alertas: string[] = [];
  if (!aplicabilidade.aplicavel && aplicabilidade.motivo) {
    alertas.push(aplicabilidade.motivo);
  }

  // Aviso quando a base eh pequena (provavelmente isento de IRRF)
  if (baseCalculo < ALIQUOTAS_PADRAO.valorMinimoIrrfCents) {
    alertas.push(`Base abaixo do minimo IRRF (R$ ${(ALIQUOTAS_PADRAO.valorMinimoIrrfCents / 100).toFixed(2)})`);
  }
  // Informa a base usada quando ela difere do "bruto" exibido (= liquido)
  if (totalRetencoesCents > 0 && aplicabilidade.aplicavel) {
    alertas.push(
      `Base de calculo R$ ${(baseCalculo / 100).toFixed(2)} = liquido R$ ${(valorBruto / 100).toFixed(2)} + retencoes R$ ${(totalRetencoesCents / 100).toFixed(2)}`,
    );
  }

  // Calcula esperados (so se aplicavel) sobre a BASE CORRETA (= liquido + retencoes)
  function esperado(percAplicavel: number, retidoCents: number, tipo: RetencaoTipo, observacao: string | null = null): RetencaoComparacao {
    const esperadoCents = aplicabilidade.aplicavel
      ? Math.round(baseCalculo * (percAplicavel / 100))
      : 0;
    const divergencia = retidoCents - esperadoCents;
    return {
      tipo,
      aliquotaPerc: percAplicavel,
      esperadoCents,
      retidoCents,
      divergenciaCents: divergencia,
      divergente: aplicabilidade.aplicavel && Math.abs(divergencia) > TOLERANCIA_CENTS,
      aplicavel: aplicabilidade.aplicavel,
      observacao,
    };
  }

  // IRRF: so aplica se a BASE >= minimo (Art. 67 Lei 9.430/96)
  function esperadoIrrf(percAplicavel: number, retidoCents: number): RetencaoComparacao {
    const eligible = aplicabilidade.aplicavel && baseCalculo >= ALIQUOTAS_PADRAO.valorMinimoIrrfCents;
    const esperadoCents = eligible ? Math.round(baseCalculo * (percAplicavel / 100)) : 0;
    const divergencia = retidoCents - esperadoCents;
    return {
      tipo: 'irrf',
      aliquotaPerc: percAplicavel,
      esperadoCents,
      retidoCents,
      divergenciaCents: divergencia,
      divergente: eligible && Math.abs(divergencia) > TOLERANCIA_CENTS,
      aplicavel: eligible,
      observacao: !eligible && aplicabilidade.aplicavel
        ? `Isento — valor menor que R$ ${(ALIQUOTAS_PADRAO.valorMinimoIrrfCents / 100).toFixed(2)}`
        : null,
    };
  }

  const retencoes: RetencaoComparacao[] = [
    esperado(ALIQUOTAS_PADRAO.pisPerc, Number(cp.vlrPisCents ?? 0), 'pis'),
    esperado(ALIQUOTAS_PADRAO.cofinsPerc, Number(cp.vlrCofinsCents ?? 0), 'cofins'),
    esperado(ALIQUOTAS_PADRAO.csllPerc, Number(cp.vlrCsllCents ?? 0), 'csll'),
    esperadoIrrf(ALIQUOTAS_PADRAO.irrfPerc, Number(cp.vlrIrrfCents ?? 0)),
    // INSS: nao calcula esperado (depende muito do tipo de servico). So mostra retido.
    {
      tipo: 'inss',
      aliquotaPerc: 0,
      esperadoCents: 0,
      retidoCents: Number(cp.vlrInssCents ?? 0),
      divergenciaCents: 0,
      divergente: false,
      aplicavel: false,
      observacao: 'INSS nao calculado automaticamente (depende do tipo de servico)',
    },
    // ISS: idem (depende do municipio + tipo)
    {
      tipo: 'iss',
      aliquotaPerc: 0,
      esperadoCents: 0,
      retidoCents: Number(cp.vlrIssCents ?? 0),
      divergenciaCents: 0,
      divergente: false,
      aplicavel: false,
      observacao: `ISS depende do municipio (${ALIQUOTAS_PADRAO.issMinPerc}-${ALIQUOTAS_PADRAO.issMaxPerc}% normalmente)`,
    },
  ];

  const totalRetido = retencoes.reduce((s, r) => s + r.retidoCents, 0);
  const totalEsperado = retencoes.reduce((s, r) => s + r.esperadoCents, 0);
  const divergenciaTotal = totalRetido - totalEsperado;
  const temDivergencia = retencoes.some((r) => r.divergente);

  return {
    contaPagarId: cp.id,
    numeroDocumento: cp.numeroDocumento,
    fornecedorRazaoSocial: cp.fornecedor?.razaoSocial ?? null,
    cnpjCpf: cp.fornecedor?.cnpjCpf ?? null,
    fornecedorSimplesNacional: cp.fornecedor?.optSimplesNacional ?? null,
    fornecedorTipoInscricao: cp.fornecedor?.tipoInscricao ?? null,
    fornecedorUf: cp.fornecedor?.uf ?? null,
    fornecedorMunicipio: cp.fornecedor?.cidade ?? null,
    valorBrutoCents: valorBruto,
    totalRetidoCents: totalRetido,
    totalEsperadoCents: totalEsperado,
    divergenciaTotalCents: divergenciaTotal,
    temDivergencia,
    retencoes,
    alertas,
  };
}

export function buildRetencoesService(fastify: FastifyInstance) {
  const cpRepo = fastify.db.getRepository(ContaPagar);

  return {
    aliquotasUsadas(): AliquotasUsadasResponse {
      return {
        perc: {
          pis: ALIQUOTAS_PADRAO.pisPerc,
          cofins: ALIQUOTAS_PADRAO.cofinsPerc,
          csll: ALIQUOTAS_PADRAO.csllPerc,
          irrf: ALIQUOTAS_PADRAO.irrfPerc,
          inss: ALIQUOTAS_PADRAO.inssPerc,
          issMin: ALIQUOTAS_PADRAO.issMinPerc,
          issMax: ALIQUOTAS_PADRAO.issMaxPerc,
        },
        valorMinimoIrrfCents: ALIQUOTAS_PADRAO.valorMinimoIrrfCents,
        observacao:
          'Heuristica MVP Lucro Real para NF de servico PJ generico. Casos especiais ' +
          '(Simples Nacional, MEI, exterior, servicos especificos) precisam tratamento dedicado.',
      };
    },

    async conferirTitulo(contaPagarId: string): Promise<ConferenciaRetencao> {
      const cp = await cpRepo.findOne({
        where: { id: contaPagarId },
        relations: ['fornecedor'],
      });
      if (!cp) throw fastify.httpErrors.notFound('Conta a pagar nao encontrada');
      return calcular(cp);
    },

    async listarDivergencias(): Promise<ConferenciaDivergenciasResponse> {
      // Carrega NFs apenas (tipos aplicaveis) com valor > minimo (otimiza)
      const cps = await cpRepo
        .createQueryBuilder('cp')
        .leftJoinAndSelect('cp.fornecedor', 'forn')
        .where('cp.tipo_documento IN (:...tipos)', { tipos: TIPOS_DOC_SUJEITOS })
        .andWhere('cp.excluido_em IS NULL')
        .andWhere('cp.origem_documento NOT IN (:...origens)', { origens: ['folha', 'guia'] })
        .andWhere('cp.valor_bruto_cents > 0')
        // orderBy com leftJoinAndSelect + limit cai no caminho "combined select" do
        // TypeORM, que resolve a coluna pela PROPERTY name (dataVencimento), nao pelo
        // nome da coluna do banco. Usar 'cp.data_vencimento' aqui quebra com
        // "Cannot read properties of undefined (reading 'databaseName')".
        .orderBy('cp.dataVencimento', 'DESC')
        .limit(500)
        .getMany();

      const conferencias = cps.map((cp) => calcular(cp));
      const divergentes = conferencias.filter((c) => c.temDivergencia);
      const totalDivergencia = divergentes.reduce((s, c) => s + Math.abs(c.divergenciaTotalCents), 0);

      return {
        itens: divergentes,
        total: divergentes.length,
        totalDivergenciaCents: totalDivergencia,
      };
    },
  };
}

export type RetencoesService = ReturnType<typeof buildRetencoesService>;
